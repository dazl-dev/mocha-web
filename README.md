# mocha-web

[![npm version](https://img.shields.io/npm/v/mocha-web.svg)](https://www.npmjs.com/package/mocha-web)

Run mocha tests in chromium, using esbuild and playwright.

## Installation

Install `mocha-web` as a dev dependency:

```
npm i mocha-web --save-dev
```

`mocha-web` expects `mocha`, `@playwright/browser-chromium`, and `esbuild` to also be installed in the project.

## Usage

A CLI named `mocha-web` is available after installation:

```
mocha-web [options] <glob ...>
```

For example:

```
mocha-web "test/**/*.spec.js"
mocha-web "test/**/*.spec.ts" -c esbuild.config.js
```

## CLI Options

```
-v, --version                       output the version number
-c, --esbuild-config <config file>  esbuild configuration file to bundle with
-w, --watch                         never-closed, open browser, open-devtools, html-reporter session
-l, --list-files                    list found test files
-t, --timeout <ms>                  mocha timeout in ms (default: 2000)
-p, --port <number>                 port to start the http server with (default: 3000)
--reporter <spec/html/dot/...>      mocha reporter to use (default: "spec")
--ui <bdd|tdd|qunit|exports>        mocha user interface (default: "bdd")
-h, --help                          display help for command
```

### License

MIT
