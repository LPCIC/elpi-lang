import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, Trace, TransportKind } from 'vscode-languageclient/node';

// Client of the `elpi-lsp` language server (diagnostics, hover, go to definition)

let client: LanguageClient | undefined = undefined;
let outputChannel: vscode.OutputChannel;
let traceChannel: vscode.OutputChannel;

function expandHome(p: string): string {
	if (p === '~') { return os.homedir(); }
	if (p.startsWith('~/')) { return path.join(os.homedir(), p.slice(2)); }
	return p;
}

function serverOptions(): ServerOptions {
	const config = vscode.workspace.getConfiguration('elpi-lsp');
	const command = expandHome(config.get<string>('path') || 'elpi-lsp');
	const args = (config.get<string[]>('args') || []).concat(['--max-errors', String(config.get<number>('maxErrors') || 100)]);
	const executable = { command, args, transport: TransportKind.stdio };
	return { run: executable, debug: executable };
}

function clientOptions(): LanguageClientOptions {
	return {
		documentSelector: [
			{ scheme: 'file', language: 'elpi' },
			{ scheme: 'untitled', language: 'elpi' },
		],
		outputChannel,                    // server stderr + client logs
		traceOutputChannel: traceChannel, // elpi-lsp.debug
	};
}

async function startClient() {
	const opts = serverOptions();
	const command = (opts as { run: { command: string } }).run.command;
	outputChannel.appendLine(`[elpi-lsp] starting server: ${command}`);
	client = new LanguageClient('elpi-lsp', 'Elpi LSP', opts, clientOptions());
	try {
		await client.start();
		await applyDebug();
		outputChannel.appendLine('[elpi-lsp] server started');
	} catch (e) {
		const msg = `Elpi LSP: cannot start server "${command}": ${e instanceof Error ? e.message : e}. Check the setting elpi-lsp.path.`;
		outputChannel.appendLine('[elpi-lsp] ' + msg);
		const choice = await vscode.window.showErrorMessage(msg, 'Open settings', 'Show output');
		if (choice === 'Open settings') {
			vscode.commands.executeCommand('workbench.action.openSettings', 'elpi-lsp');
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

export async function activate(context: vscode.ExtensionContext) {
	outputChannel = vscode.window.createOutputChannel('Elpi LSP');
	traceChannel = vscode.window.createOutputChannel('Elpi LSP Trace');
	context.subscriptions.push(outputChannel, traceChannel);

	context.subscriptions.push(
		vscode.commands.registerCommand('elpi-lsp.restart', restart),
		vscode.commands.registerCommand('elpi-lsp.showOutput', () => outputChannel.show(true)),
		vscode.workspace.onDidChangeConfiguration(async e => {
			if (e.affectsConfiguration('elpi-lsp.debug')) { await applyDebug(); }
			if (e.affectsConfiguration('elpi-lsp.path') || e.affectsConfiguration('elpi-lsp.args') || e.affectsConfiguration('elpi-lsp.maxErrors')) {
				const choice = await vscode.window.showInformationMessage('Elpi LSP: server settings changed.', 'Restart server');
				if (choice === 'Restart server') { await restart(); }
			}
		}),
	);

	await startClient();
}

export function deactivate() {
	return stopClient();
}
