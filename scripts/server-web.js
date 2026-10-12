// Copies the web language server of Elpi, the npm package elpi-webrunner (in
// node_modules, see the README), to dist/web/elpi-webrunner/, where the
// extension loads it: the entry point elpi-lsp-web.js in the browser, the
// WebAssembly server web_lsp_driver.bc.wasm.js on a computer when elpi-lsp is not
// installed (see src/lsp.ts).

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'node_modules', 'elpi-webrunner');
const needed = ['elpi-lsp-web.js', 'web_lsp_driver.bc.js', 'web_lsp_driver.bc.wasm.js', 'web_lsp_driver.bc.wasm.assets'];
const missing = needed.filter(f => !fs.existsSync(path.join(src, f)));
if (missing.length > 0) {
	console.error(`node_modules/elpi-webrunner/ lacks ${missing.join(', ')}: see the README`);
	process.exit(1);
}
const dest = path.join(root, 'dist', 'web', 'elpi-webrunner');
fs.rmSync(dest, { recursive: true, force: true });
// src is a link for a file: dependency, to a directory that can have the
// packages made by make pack-webrunner in the elpi repository
const real = fs.realpathSync(src);
fs.cpSync(real, dest, { recursive: true, dereference: true, filter: f => !f.endsWith('.tgz') });
console.log(`dist/web/elpi-webrunner/: ${real}`);
