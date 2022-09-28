import * as vscode from 'vscode';
import * as provider from './provider';

export function activate(context: vscode.ExtensionContext) {

	const tracer = new provider.TraceProvider(context.extensionUri);

	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(provider.TraceProvider.viewType, tracer));

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
		vscode.commands.registerCommand('elpi.watch_start', () => {
			tracer.watch_start();
		}));

	context.subscriptions.push(
		vscode.commands.registerCommand('elpi.watch_stop', () => {
			tracer.watch_stop();
		}));

	context.subscriptions.push(
		vscode.commands.registerCommand('elpi.clear', () => {
			tracer.clear();
		}));
}
