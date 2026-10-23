import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, Trace } from 'vscode-languageclient/browser';
import { LibraryProvider, libraryScheme } from '../library';

// The extension in the browser (e.g. vscode.dev): the language server is
// elpi-lsp run in a web worker, started by
// dist/web/elpi-webrunner/elpi-lsp-web.js (built in the elpi repository by
// `make webrunner`): it loads the server compiled to WebAssembly when the
// browser supports it and the .wasm files are served as application/wasm, the
// one compiled to JavaScript otherwise. There are no files: accumulate fails, and the files of the standard library are
// elpi-builtin:/ID/NAME documents whose text comes from the server. The tracer
// needs the elpi executable, it is not available.

let client: LanguageClient | undefined = undefined;
let outputChannel: vscode.OutputChannel;
let traceChannel: vscode.OutputChannel;

function clientOptions(): LanguageClientOptions {
	const config = vscode.workspace.getConfiguration('elpi-lsp');
	return {
		// any scheme: vscode-vfs: (GitHub), vscode-test-web:, untitled:,
		// elpi-builtin:...
		documentSelector: [{ language: 'elpi' }],
		initializationOptions: { maxErrors: config.get<number>('maxErrors') || 100 },
		outputChannel,
		traceOutputChannel: traceChannel,
	};
}

async function startClient(context: vscode.ExtensionContext) {
	// VS Code starts a worker as a blob: URL that imports the script: the entry
	// point is told its URL, it loads the servers next to it
	const entry = vscode.Uri.joinPath(context.extensionUri, 'dist/web/elpi-webrunner/elpi-lsp-web.js').toString(true);
	const boot = `self.elpiLspWebUrl = ${JSON.stringify(entry)}; importScripts(self.elpiLspWebUrl);`;
	const worker = new Worker(URL.createObjectURL(new Blob([boot], { type: 'application/javascript' })));
	client = new LanguageClient('elpi-lsp', 'Elpi LSP', clientOptions(), worker);
	await client.start();
	await applyDebug();
	outputChannel.appendLine('[elpi-lsp] server started (web)');
}

async function applyDebug() {
	if (!client) { return; }
	const value = vscode.workspace.getConfiguration('elpi-lsp').get<string>('debug') || 'off';
	await client.setTrace(Trace.fromString(value));
}

async function stopClient() {
	if (!client) { return; }
	const c = client;
	client = undefined;
	try {
		if (c.isRunning()) { await c.stop(); }
	} catch (e) {
		outputChannel.appendLine(`[elpi-lsp] error while stopping server: ${e}`);
	}
}

export async function activate(context: vscode.ExtensionContext) {
	outputChannel = vscode.window.createOutputChannel('Elpi LSP');
	traceChannel = vscode.window.createOutputChannel('Elpi LSP Trace');
	context.subscriptions.push(outputChannel, traceChannel);

	const unavailable = () =>
		vscode.window.showInformationMessage('The Elpi tracer needs the elpi executable: it is not available in the browser.');
	for (const command of ['elpi.open', 'elpi.save', 'elpi.trace', 'elpi.clear']) {
		context.subscriptions.push(vscode.commands.registerCommand(command, unavailable));
	}

	context.subscriptions.push(
		vscode.workspace.registerTextDocumentContentProvider(libraryScheme, new LibraryProvider(uri =>
			client ? client.sendRequest<string | null>('elpi/builtinFile', { uri }) : Promise.resolve(null))),
		vscode.commands.registerCommand('elpi-lsp.restart', async () => {
			await stopClient();
			await startClient(context);
		}),
		vscode.commands.registerCommand('elpi-lsp.showOutput', () => outputChannel.show(true)),
		vscode.workspace.onDidChangeConfiguration(async e => {
			if (e.affectsConfiguration('elpi-lsp.debug')) { await applyDebug(); }
		}),
	);

	await startClient(context);
}

export function deactivate() {
	return stopClient();
}
