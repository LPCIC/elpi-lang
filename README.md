# elpi-lang

This extension provides support for the [Elpi](https://github.com/LPCIC/elpi) programming language to Visual Studio Code.

![screenshot](assets/elpi-tracer.png)

## Features

- Basic syntax highlighting
- Trace visualisation and navigation
- Diagnostics (all syntax errors, type errors, warnings), hover (types),
  go to definition, highlight of the binder of a variable and semantic colors
  (bound variables, variables of the rules and constants have different colors),
  provided by the `elpi-lsp` language server

## Requirements

- Node 1.18+
- VSCode 1.82+
- Elpi 1.16+
- `elpi-lsp` (opam package `elpi-lsp`, see the
  [language server](https://github.com/LPCIC/elpi/tree/master/lsp)) for the
  language server features. Without it the extension uses the server bundled
  with it (`elpi-lsp` compiled to WebAssembly, as the one of the browser, run
  by the node of VS Code, which needs VS Code 1.88 or later), which is slower;
  a popup says so each time the server starts.

## Building for development

- `npm install`

## Running in development

- Open the source tree root in VS Code 1.82+
- Go to the extension panel in activity bar
- Click 'Run extension'

## Tests

- `npm run test-desktop`: the tests of the extension on a computer, in VS Code
  downloaded by [@vscode/test-electron](https://github.com/microsoft/vscode-test)
  (`src/test/desktop/`, on the files of `test-fixtures/desktop/`): the fallback
  to the bundled server and its popup, the setting `elpi-lsp.useBundled`, and,
  if `ELPI_LSP_TEST_BIN` is the directory of an `elpi-lsp` executable, the use
  of that executable. VS Code needs a display: `xvfb-run -a npm run
  test-desktop` on a server.
- `npm run test-web`: the tests in the browser, see below.

## In the browser (vscode.dev)

The extension also runs in the browser: there the language server is
`elpi-lsp` compiled to WebAssembly, or to JavaScript when the browser does not
support what the WebAssembly one needs (or the `.wasm` files are not served as
`application/wasm`), run in a web worker. Diagnostics, hover, go
to definition (also into the standard library, shown as `elpi-builtin:`
documents), highlights and semantic colors work; `accumulate` fails (the
server has no files) and the tracer is not available (it needs the `elpi`
executable).

The server is the npm package `elpi-webrunner`, a dev dependency: the entry
point `elpi-lsp-web.js`, which loads one of the two servers, the server
compiled to JavaScript and the one compiled to WebAssembly (also the bundled
server on a computer). It is the version of npm with the dist-tag `latest`
(`"elpi-webrunner": "latest"` in `package.json`, whatever its version). To use
the one built in a clone of the elpi repository next to this one (with `make
webrunner` there, about 1MB per server) instead, without changing
`package.json`:

    npm install --no-save ../elpi/webrunner/elpi-webrunner

- `npm run compile-web`: the extension, `dist/web/extension.js`
- `npm run server-web`: copies the server from `node_modules/elpi-webrunner/` to
  `dist/web/elpi-webrunner/` (also done by `vscode:prepublish`, and by the
  tests)
- `npm run test-web`: the tests, in headless Chromium with
  [@vscode/test-web](https://github.com/microsoft/vscode-test-web)
  (`src/web/test/`, on the files of `test-fixtures/web/`)

`npx @vscode/test-web --extensionDevelopmentPath=. test-fixtures/web` opens a
browser on VS Code for the web with the extension.

## Extension Settings

- `elpi.bin`: the directory that contains the Elpi executables `elpi`,
  `elpi-lsp` and `elpi-trace-elaborator` (when empty, they are looked up in
  the `PATH`; a leading `~/` is expanded). It replaces the settings
  `elpi.elpi.path`, `elpi.elpi_trace_elaborator.path` and `elpi-lsp.path`.
- `elpi-lsp.useBundled`: use the server bundled with the extension even when
  `elpi-lsp` is installed (default false; it is used anyway when `elpi-lsp`
  is not found)
- `elpi-lsp.args`: extra command line arguments for the server
- `elpi-lsp.maxErrors`: maximum number of errors reported for a file (default 100)
- `elpi-lsp.debug`: `off`, `messages` or `verbose`, traces the LSP
  messages in the *Elpi LSP Trace* output channel

Commands (command palette): *Elpi LSP: Restart server*, *Elpi LSP: Show output*.
After changing `elpi.bin`, `elpi-lsp.useBundled`, `elpi-lsp.args` or
`elpi-lsp.maxErrors` the extension offers to restart the server.

## Known Issues

- none

## Release Notes

See the [CHANGELOG](CHANGELOG.md) file
