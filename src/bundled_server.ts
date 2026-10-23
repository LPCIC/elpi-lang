// The language server bundled with the extension, for a computer where the
// executable elpi-lsp is not installed: elpi-lsp compiled to WebAssembly
// (dist/web/elpi-webrunner/web_lsp_driver.bc.wasm.js, next to the servers of the
// extension in the browser) run in a worker thread, as in a web worker, behind
// a server on stdin/stdout. Started by vscode-languageclient with the node of
// VS Code (it needs WebAssembly GC: VS Code 1.88 or later):
//
//   node dist/node/bundled_server.js path/to/web_lsp_driver.bc.wasm.js [--stdio]

import { Worker } from 'worker_threads';
import * as path from 'path';

const server = path.resolve(process.argv[2]);

// in the worker: postMessage, onmessage and close as in a web worker, then the
// server. The server starts asynchronously: the messages that arrive before it
// sets onmessage are queued. It finds its assets next to the main module.
// What it writes on its stdout goes to stderr: stdout is the protocol.
// The stack is much bigger than the default one (4MB): the server uses the
// stack much more than the native one (e.g. the 8MB a big elpi/run needs).
const worker = new Worker(`
	const { parentPort } = require('worker_threads');
	globalThis.postMessage = (m) => parentPort.postMessage(m);
	globalThis.close = () => process.exit(0);
	let handler = null;
	const queue = [];
	Object.defineProperty(globalThis, 'onmessage', {
		get: () => handler,
		set: (f) => {
			handler = f;
			while (handler && queue.length) { handler({ data: queue.shift() }); }
		},
	});
	parentPort.on('message', (data) => (handler ? handler({ data }) : queue.push(data)));
	process.mainModule = { filename: ${JSON.stringify(server)} };
	require(${JSON.stringify(server)});
`, { eval: true, stdout: true, stderr: false, resourceLimits: { stackSizeMb: 256 } });
worker.stdout.pipe(process.stderr);

worker.on('message', (m) => {
	const body = Buffer.from(JSON.stringify(m), 'utf8');
	process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
	process.stdout.write(body);
});
worker.on('exit', (code) => process.exit(code));
worker.on('error', (e) => { console.error(e); process.exit(1); });

// the messages of the client, with their Content-Length header
let buffer = Buffer.alloc(0);
process.stdin.on('data', (chunk: Buffer) => {
	buffer = Buffer.concat([buffer, chunk]);
	for (;;) {
		const end = buffer.indexOf('\r\n\r\n');
		if (end < 0) { return; }
		const m = /Content-Length: *(\d+)/i.exec(buffer.subarray(0, end).toString('ascii'));
		if (!m) { console.error('elpi-lsp (bundled): no Content-Length'); process.exit(1); }
		const length = Number(m[1]);
		if (buffer.length < end + 4 + length) { return; }
		const body = buffer.subarray(end + 4, end + 4 + length).toString('utf8');
		buffer = buffer.subarray(end + 4 + length);
		worker.postMessage(JSON.parse(body));
	}
});
process.stdin.on('end', () => worker.terminate());
