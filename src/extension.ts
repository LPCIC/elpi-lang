import * as vscode from 'vscode';
import * as provider from './provider';
import * as lsp from './lsp';

export async function activate(context: vscode.ExtensionContext) {

	const tracer = new provider.TraceProvider(context.extensionUri);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(provider.TraceProvider.viewType, tracer, {
			webviewOptions: {retainContextWhenHidden: true}
		}));

	context.subscriptions.push(
		vscode.commands.registerCommand('elpi.open', () => {
			tracer.open();
		}));

	context.subscriptions.push(
		vscode.commands.registerCommand('elpi.save', () => {
			tracer.save();
		}));

	context.subscriptions.push(
		vscode.commands.registerCommand('elpi.trace', () => {
			tracer.trace();
		}));

	context.subscriptions.push(
		vscode.commands.registerCommand('elpi.clear', () => {
			tracer.clear();
		}));

	await lsp.activate(context);
}

export function deactivate() {
	return lsp.deactivate();
}
