import { safeListeningHttpServer } from "create-listening-server";
import esbuild from "esbuild";
import express from "express";
import mime from "mime";
import { once } from "node:events";
import { createRequire } from "node:module";
import path from "node:path";
import playwright from "playwright-core";
import { hookPageConsole } from "./hook-page-console.js";

const require = createRequire(import.meta.url);

export interface IRunTestsOptions {
  preferredPort?: number | undefined;
  launchOptions?: playwright.LaunchOptions | undefined;
  browserContextOptions?: playwright.BrowserContextOptions | undefined;
  esbuildConfig?: esbuild.BuildOptions;
  keepOpen?: boolean | undefined;
  colors?: boolean | undefined;
  reporter?: string | undefined;
  ui?: string | undefined;
  timeout?: number | undefined;
  grep?: string;
  iterate?: number;
}

export async function runTests(testFiles: string[], options: IRunTestsOptions = {}): Promise<void> {
  const { preferredPort = 3000, esbuildConfig, launchOptions, browserContextOptions, keepOpen } = options;
  const closables: Array<() => Promise<void>> = [];

  try {
    const mochaPath = path.dirname(require.resolve("mocha/package.json"));
    const workingDir = esbuildConfig?.absWorkingDir ?? process.cwd();
    console.log(`Bundling using esbuild...`);

    const buildFilesMap = new Map<string, esbuild.OutputFile>();

    const indexContents = testFiles.map((f) => `require(${JSON.stringify(f)});`).join("\n");

    const { onBuildEndPlugin, onBuildEnd } = captureBuildEnd();

    const combinedConfig = {
      ...esbuildConfig,
      stdin: {
        contents: indexContents,
        loader: "js",
        sourcefile: "generated-tests-index.js",
        resolveDir: workingDir,
      },
      outfile: "tests.js",
      write: false,
      sourcemap: true,
      bundle: true,
      format: "iife",
      logLevel: "info",
      plugins: [
        ...(esbuildConfig?.plugins ?? []),
        createOutputCapturePlugin(workingDir, buildFilesMap, options),
        onBuildEndPlugin,
      ],
    } satisfies esbuild.BuildOptions;

    if (keepOpen) {
      const buildContext = await esbuild.context(combinedConfig);
      await buildContext.watch();
      await onBuildEnd;
    } else {
      await esbuild.build(combinedConfig);
    }

    const app = express();
    app.use(createDevMiddleware(buildFilesMap));
    app.use("/mocha", express.static(mochaPath));
    app.use(express.static(workingDir));

    const { httpServer, port } = await safeListeningHttpServer(preferredPort, app as import("http").RequestListener);
    closables.push(async () => {
      httpServer.close();
      await once(httpServer, "close");
    });
    console.log(`HTTP server is listening on port ${port}`);

    const browser = await playwright.chromium.launch(launchOptions);
    closables.push(() => browser.close());
    const context = await browser.newContext(browserContextOptions);
    const page = await context.newPage();

    const unhookPageConsole = hookPageConsole(page);

    page.on("dialog", (dialog) => {
      dialog.dismiss().catch((e) => console.error(e));
    });

    const failsOnPageError = new Promise((_resolve, reject) => {
      page.once("pageerror", (e) => {
        unhookPageConsole();
        reject(e);
      });
      page.once("crash", () => {
        unhookPageConsole();
        reject(new Error("Page crashed"));
      });
    });

    await Promise.race([page.goto(`http://localhost:${port}/tests.html`), failsOnPageError]);

    const failedCount = await Promise.race([waitForTestResults(page), failsOnPageError]);

    if (failedCount) {
      throw new Error(`${failedCount as number} tests failed!`);
    }
  } finally {
    if (!keepOpen) {
      await Promise.all(closables.map((close) => close()));
      closables.length = 0;
    }
  }
}

function createOutputCapturePlugin(
  workingDir: string,
  buildFilesMap: Map<string, esbuild.OutputFile>,
  options: IRunTestsOptions,
): esbuild.Plugin {
  return {
    name: "capture-output",
    setup(build) {
      build.onEnd(({ outputFiles, errors }) => {
        if (outputFiles && outputFiles.length && !errors.length) {
          buildFilesMap.clear();
          for (const outFile of outputFiles) {
            buildFilesMap.set("/" + path.relative(workingDir, outFile.path).replace("/\\/g", "/"), outFile);
          }
          const testsHTML = createTestsHTML(
            "mocha tests",
            options.ui ?? "bdd",
            options.colors ?? true,
            options.reporter ?? "spec",
            options.timeout ?? 2000,
            options.grep,
            options.iterate ?? 1,
            buildFilesMap.has("/tests.css") ? "tests.css" : undefined,
          );
          buildFilesMap.set("/tests.html", {
            path: path.join(workingDir, "tests.html"),
            contents: Buffer.from(testsHTML),
            text: testsHTML,
            hash: "final-html",
          });
        }
      });
    },
  };
}

function captureBuildEnd() {
  const { promise: onBuildEnd, resolve } = deferredPromise();
  const onBuildEndPlugin: esbuild.Plugin = {
    name: "on-build-end",
    setup: (build) => build.onEnd(resolve),
  };
  return { onBuildEndPlugin, onBuildEnd };
}

function deferredPromise<T = unknown>() {
  let resolve: (value: T) => void;
  let reject: (reason: unknown) => void;
  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve;
    reject = _reject;
  });
  return { promise, resolve: resolve!, reject: reject! };
}

function createDevMiddleware(buildFilesMap: Map<string, esbuild.OutputFile>): express.RequestHandler {
  return function (req, res, next) {
    const file = buildFilesMap.get(req.path);
    if (file) {
      res.setHeader("Content-Type", mime.getType(req.path) ?? "text/plain");
      res.setHeader("ETag", file.hash);
      res.setHeader("Cache-Control", "public, max-age=0");
      res.end(file.text);
    } else if (req.path === "/favicon.ico") {
      res.status(204);
      res.end();
    } else {
      next();
    }
  };
}

async function waitForTestResults(page: playwright.Page): Promise<number> {
  await page.waitForFunction("mochaStatus.finished", null, { timeout: 0 });
  return page.evaluate<number>("mochaStatus.failed");
}

function createTestsHTML(
  title: string,
  ui: string,
  color: boolean,
  reporter: string,
  timeout: number,
  grep: string | undefined,
  iterate: number | undefined,
  cssFileName: string | undefined,
) {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <link rel="stylesheet" href="mocha/mocha.css" />${
      cssFileName ? `\n    <link rel="stylesheet" href="${cssFileName}" />` : ""
    }
    <script src="mocha/mocha.js"></script>
  </head>
  <body>
    <div id="mocha"></div>
    <script>
      function duplicateTests(suite, iterations) {
        suite.tests = suite.tests.flatMap(
          t => new Array(iterations).fill(t)
        )
        for (const childSuite of suite.suites) {
            duplicateTests(childSuite, iterations)
        }
      }

      const ui = ${JSON.stringify(ui)};
      const reporter = ${JSON.stringify(reporter)};
      const color = ${color};
      const timeout = ${timeout};
      const grep = ${grep ? JSON.stringify(grep) : "null"};
      const iterate = ${iterate};

      mocha.setup({ ui, reporter, color, timeout, grep });

      const mochaStatus = {
        completed: 0,
        failed: 0,
        finished: false,
      };

      // save test status on window to access it with playwright
      window.mochaStatus = mochaStatus;

      window.addEventListener('DOMContentLoaded', () => {
          duplicateTests(mocha.suite, iterate);
          mocha
            .run()
            .on('test end', () => mochaStatus.completed++)
            .on('fail', () => mochaStatus.failed++)
            .on('end', () => {(mochaStatus.finished = true)});
      });
    </script>
    <script src="tests.js"></script>
  </body>
</html>
`;
}
