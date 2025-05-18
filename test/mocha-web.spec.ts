import { expect } from "chai";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { stripVTControlCharacters } from "node:util";

const fixturesRoot = fileURLToPath(new URL("../../test/fixtures", import.meta.url));
const cliEntryPath = fileURLToPath(new URL("../../bin/mocha-web.js", import.meta.url));

const runMochaPlay = (options: { args: string[]; fixture?: string }) => {
  const { status, output } = spawnSync("node", ["--enable-source-maps", cliEntryPath, "-l", ...options.args], {
    cwd: resolve(fixturesRoot, options.fixture || "."),
    encoding: "utf8",
  });
  return { status, output: output.map((o) => stripVTControlCharacters(o || "")).join("") };
};

describe("mocha-web", function () {
  this.timeout(20_000);

  it("runs test files specified directly", () => {
    const { output, status } = runMochaPlay({ args: ["./sample.spec.js"] });
    expect(output).to.include("Found 1 test files");
    expect(output).to.include("2 passing");
    expect(status).to.equal(0);
  });

  it("runs test files specified using globs", () => {
    const { output, status } = runMochaPlay({ args: ["./**/*.spec.js"] });

    expect(output).to.include("Found 2 test files");
    expect(output).to.include("3 passing");
    expect(status).to.equal(0);
  });

  it("fails when there are test errors", () => {
    const { output, status } = runMochaPlay({ args: ["./should-fail.unit.js"] });

    expect(output).to.include("some error message");
    expect(output).to.include("1 tests failed");
    expect(status).to.not.equal(0);
  });

  it("fails if not finding test files", () => {
    const { output, status } = runMochaPlay({ args: ["./*.missing.js"] });

    expect(output).to.include("Cannot find any test files");
    expect(status).to.not.equal(0);
  });

  it("automatically finds and uses esbuild.config.js", () => {
    const { output, status } = runMochaPlay({
      args: ["./typescript-file.ts"],
      fixture: "with-config",
    });

    expect(output).to.include("Found 1 test files");
    expect(output).to.include("1 passing");
    expect(status).to.equal(0);
  });

  it("automatically finds and uses esbuild.config.cjs", () => {
    const { output, status } = runMochaPlay({
      args: ["./typescript-file.ts"],
      fixture: "with-cjs-config",
    });

    expect(output).to.include("Found 1 test files");
    expect(output).to.include("1 passing");
    expect(status).to.equal(0);
  });

  it("automatically finds and uses webpack.config.mjs", () => {
    const { output, status } = runMochaPlay({
      args: ["./typescript-file.ts"],
      fixture: "with-mjs-config",
    });

    expect(output).to.include("Found 1 test files");
    expect(output).to.include("1 passing");
    expect(status).to.equal(0);
  });

  it("allows bundling using custom esbuild configuration", () => {
    const { output, status } = runMochaPlay({
      args: ["./typescript-file.ts", "-c", "./my.config.cjs"],
      fixture: "custom-config",
    });

    expect(output).to.include("Found 1 test files");
    expect(output).to.include("1 passing");
    expect(status).to.equal(0);
  });

  it("fails when there are bundling errors", () => {
    const { output, status } = runMochaPlay({ args: ["./broken-syntax.js"] });
    expect(output).to.include("Found 1 test files");
    expect(output).to.include('broken-syntax.js:2:1: ERROR: Syntax error "@"');
    expect(status).to.equal(1);
  });

  it("fails when the page has an error", () => {
    const { output, status } = runMochaPlay({ args: ["./page-error-throw.js"] });

    expect(output).to.include("Found 1 test files");
    expect(output).to.include("Error: outside test");
    expect(status).to.equal(1);
  });

  it("prints console messages in correct order", () => {
    const { output, status } = runMochaPlay({ args: ["./printer.js"] });

    expect(output).to.include("###before###");
    expect(output).to.include("###after###");
    expect(output.indexOf("###before###"), "order of messages").to.be.lessThan(output.indexOf("###after###"));
    expect(status).to.equal(0);
  });

  it("prints errors printed using console.log", () => {
    const { output, status } = runMochaPlay({ args: ["./page-error-console.js"] });

    expect(output).to.include("Found 1 test files");
    expect(output).to.include("Error: printed to log");
    expect(status).to.equal(0);
  });

  it("serves assets in working directory", () => {
    const { output, status } = runMochaPlay({ fixture: "asset", args: ["./asset.test.js"] });

    expect(output).to.include("Found 1 test files");
    expect(output).to.include("1 passing");
    expect(status).to.equal(0);
  });

  it("runs only tests matching grep", () => {
    const { output, status } = runMochaPlay({ args: ["./**/*.spec.js", "-g", "should pass 2"] });
    expect(output).to.include("Found 2 test files");
    expect(output).to.include("1 passing");
    expect(status).to.equal(0);
  });

  it("runs multiple iterations", () => {
    const { output, status } = runMochaPlay({ args: ["./**/*.spec.js", "-i", "3"] });
    expect(output).to.include("Found 2 test files");
    expect(output).to.include("9 passing");
    expect(status).to.equal(0);
  });

  it("includes tests.css if built by compilation", () => {
    const { output, status } = runMochaPlay({ args: ["./imports-css.js"] });

    expect(output).to.include("Found 1 test files");
    expect(output, output).to.include("body background-color: rgb(0, 255, 0)");
    expect(status).to.equal(0);
  });
});
