import * as vscode from 'vscode';
import { binary, exists } from './binaries';
import { LibraryProvider, libraryScheme } from './library';
import { LanguageClient, LanguageClientOptions, ServerOptions, Trace, TransportKind } from 'vscode-languageclient/node';

// Client of the `elpi-lsp` language server (diagnostics, hover, go to definition)

let client: LanguageClient | undefined = undefined;
let outputChannel: vscode.OutputChannel;
let traceChannel: vscode.OutputChannel;
let context: vscode.ExtensionContext;

// The server: the executable elpi-lsp (in elpi.bin, or in the PATH) or, when it
// is not found or elpi-lsp.useBundled is set, the server bundled with the
// extension: elpi-lsp compiled to WebAssembly (as the one of the extension in
// the browser), run by the node of VS Code. The user is told when the bundled one
// is used.
export type Server =
	| { kind: 'executable', command: string }
	| { kind: 'bundled', reason: 'setting' | 'not found', command: string };

let server: Server | undefined = undefined;

// the popups shown about the bundled server (for the tests)
const notices: string[] = [];

function chooseServer(): Server {
	const command = binary('elpi-lsp');
	if (vscode.workspace.getConfiguration('elpi-lsp').get<boolean>('useBundled')) {
		return { kind: 'bundled', reason: 'setting', command };
	}
	return exists(command) ? { kind: 'executable', command } : { kind: 'bundled', reason: 'not found', command };
}

function serverOptions(server: Server): ServerOptions {
	const config = vscode.workspace.getConfiguration('elpi-lsp');
	if (server.kind === 'bundled') {
		const module = context.asAbsolutePath('dist/node/bundled_server.js');
		const args = [context.asAbsolutePath('dist/web/elpi-webrunner/web_lsp_driver.bc.wasm.js')];
		const bundled = { module, args, transport: TransportKind.stdio };
		return { run: bundled, debug: bundled };
	}
	const args = (config.get<string[]>('args') || []).concat(['--max-errors', String(config.get<number>('maxErrors') || 100)]);
	const executable = { command: server.command, args, transport: TransportKind.stdio };
	return { run: executable, debug: executable };
}

// the popup that says that the bundled server is used, and why
function tellBundled(server: Server) {
	if (server.kind !== 'bundled') { return; }
	const why = server.reason === 'setting'
		? 'the setting elpi-lsp.useBundled is on'
		: `the executable "${server.command}" was not found (setting elpi.bin, or the PATH)`;
	const msg = `Elpi LSP: using the server bundled with the extension, since ${why}. ` +
		'It is slower than the executable elpi-lsp (opam install elpi-lsp).';
	notices.push(msg);
	vscode.window.showWarningMessage(msg, 'Open settings', 'How to install elpi-lsp').then(choice => {
		if (choice === 'Open settings') {
			vscode.commands.executeCommand('workbench.action.openSettings', server.reason === 'setting' ? 'elpi-lsp.useBundled' : 'elpi.bin');
		} else if (choice === 'How to install elpi-lsp') {
			vscode.env.openExternal(vscode.Uri.parse('https://github.com/LPCIC/elpi/tree/master/lsp#quick-start'));
		}
	});
}

function clientOptions(): LanguageClientOptions {
	const config = vscode.workspace.getConfiguration('elpi-lsp');
	return {
		documentSelector: [
			{ scheme: 'file', language: 'elpi' },
			{ scheme: 'untitled', language: 'elpi' },
		],
		// the bundled server has no command line: --max-errors is an option
		initializationOptions: { maxErrors: config.get<number>('maxErrors') || 100 },
		outputChannel,                    // server stderr + client logs
		traceOutputChannel: traceChannel, // elpi-lsp.debug
	};
}

async function startClient() {
	server = chooseServer();
	const command = server.kind === 'bundled' ? `the bundled server (${server.reason})` : server.command;
	outputChannel.appendLine(`[elpi-lsp] starting server: ${command}`);
	client = new LanguageClient('elpi-lsp', 'Elpi LSP', serverOptions(server), clientOptions());
	tellBundled(server);
	try {
		await client.start();
		await applyDebug();
		outputChannel.appendLine('[elpi-lsp] server started');
	} catch (e) {
		const msg = `Elpi LSP: cannot start server "${command}": ${e instanceof Error ? e.message : e}. Check the setting elpi.bin.`;
		outputChannel.appendLine('[elpi-lsp] ' + msg);
		const choice = await vscode.window.showErrorMessage(msg, 'Open settings', 'Show output');
		if (choice === 'Open settings') {
			vscode.commands.executeCommand('workbench.action.openSettings', 'elpi.bin');
		} else if (choice === 'Show output') {
			outputChannel.show(true);
		}
	}
}

// the LSP traffic is traced according to the setting elpi-lsp.debug
// (vscode-languageclient only reads elpi-lsp.trace.server by itself)
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

async function restart() {
	outputChannel.appendLine('[elpi-lsp] restarting server');
	await stopClient();
	await startClient();
}

// what the extension exports: which server runs, and the popups shown about
// the bundled server (for the tests)
export interface Api {
	server(): Server | undefined;
	notices(): string[];
}

export async function activate(ctx: vscode.ExtensionContext): Promise<Api> {
	context = ctx;
	outputChannel = vscode.window.createOutputChannel('Elpi LSP');
	traceChannel = vscode.window.createOutputChannel('Elpi LSP Trace');
	context.subscriptions.push(outputChannel, traceChannel);

	context.subscriptions.push(
		vscode.commands.registerCommand('elpi-lsp.restart', restart),
		vscode.workspace.registerTextDocumentContentProvider(libraryScheme, new LibraryProvider(uri =>
			client ? client.sendRequest<string | null>('elpi/builtinFile', { uri }) : Promise.resolve(null))),
		vscode.commands.registerCommand('elpi-lsp.showOutput', () => outputChannel.show(true)),
		vscode.workspace.onDidChangeConfiguration(async e => {
			if (e.affectsConfiguration('elpi-lsp.debug')) { await applyDebug(); }
			if (e.affectsConfiguration('elpi.bin') || e.affectsConfiguration('elpi-lsp.args') || e.affectsConfiguration('elpi-lsp.maxErrors') || e.affectsConfiguration('elpi-lsp.useBundled')) {
				const choice = await vscode.window.showInformationMessage('Elpi LSP: server settings changed.', 'Restart server');
				if (choice === 'Restart server') { await restart(); }
			}
		}),
	);

	await startClient();
	return { server: () => server, notices: () => notices.slice() };
}

export function deactivate() {
	return stopClient();
}
