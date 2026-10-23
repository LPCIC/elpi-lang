import * as vscode from 'vscode';
import { Test, at, definitionUri, diagnostics, equal, fixture, hoverText, match, ok, open } from '../helpers';
import type { Api } from '../../lsp';

// The tests of the extension on a computer, in test-fixtures/desktop, with
// user settings that point elpi.bin to a directory that does not exist (see
// runTests.ts): the extension must fall back to the bundled server, and say so.

async function api(): Promise<Api> {
	const ext = vscode.extensions.getExtension<Api>('gares.elpi-lang');
	ok(ext, 'the extension is not installed');
	return ext.activate();
}

// the tests, in order: the first one opens a file, which activates the extension
export const tests: Test[] = [

	['syntax and type errors', async () => {
		const uri = fixture('bad.elpi');
		await open(uri);
		const messages = (await diagnostics(uri, 2)).map(d => d.message).join('\n');
		match(messages, /Parser/);
		match(messages, /literal "a" has type string/);
	}],

	['the bundled server is used, since elpi-lsp is not found', async () => {
		const server = (await api()).server();
		ok(server, 'no server');
		equal(server.kind, 'bundled');
		ok(server.kind === 'bundled' && server.reason === 'not found', `reason: ${JSON.stringify(server)}`);
	}],

	['a popup says so', async () => {
		match((await api()).notices().join('\n'), /using the server bundled with the extension, since the executable .* was not found/);
	}],

	['hover gives the type', async () => {
		const uri = fixture('good.elpi');
		const doc = await open(uri);
		match(await hoverText(uri, at(doc, 'double 3')), /int/);
	}],

	['definition in the standard library', async () => {
		const uri = fixture('good.elpi');
		const doc = await open(uri);
		const target = await definitionUri(uri, at(doc, 'std.map', 4));
		equal(target.scheme, 'elpi-builtin');
		match((await vscode.workspace.openTextDocument(target)).getText(), /func map /);
	}],

	['the setting elpi-lsp.useBundled forces the bundled server', async () => {
		const before = (await api()).notices().length;
		await vscode.workspace.getConfiguration('elpi-lsp').update('useBundled', true, vscode.ConfigurationTarget.Global);
		try {
			await vscode.commands.executeCommand('elpi-lsp.restart');
			const server = (await api()).server();
			ok(server && server.kind === 'bundled' && server.reason === 'setting', `server: ${JSON.stringify(server)}`);
			match((await api()).notices().slice(before).join('\n'), /since the setting elpi-lsp.useBundled is on/);
		} finally {
			await vscode.workspace.getConfiguration('elpi-lsp').update('useBundled', undefined, vscode.ConfigurationTarget.Global);
		}
	}],

	// with the directory of an elpi-lsp executable in ELPI_LSP_TEST_BIN
	['an installed elpi-lsp is used, without popup', async () => {
		const bin = process.env.ELPI_LSP_TEST_BIN;
		if (!bin) { console.log('  (skipped: ELPI_LSP_TEST_BIN is not set)'); return; }
		const before = (await api()).notices().length;
		await vscode.workspace.getConfiguration('elpi').update('bin', bin, vscode.ConfigurationTarget.Global);
		try {
			await vscode.commands.executeCommand('elpi-lsp.restart');
			const server = (await api()).server();
			ok(server && server.kind === 'executable', `server: ${JSON.stringify(server)}`);
			equal((await api()).notices().length, before);
			const uri = fixture('good.elpi');
			const doc = await open(uri);
			match(await hoverText(uri, at(doc, 'double 3')), /int/);
		} finally {
			await vscode.workspace.getConfiguration('elpi').update('bin', undefined, vscode.ConfigurationTarget.Global);
			await vscode.commands.executeCommand('elpi-lsp.restart');
		}
	}],

	['accumulate works (the bundled server reads the files)', async () => {
		const uri = fixture('acc.elpi');
		await open(uri);
		const messages = (await diagnostics(uri, 1)).map(d => d.message).join('\n');
		match(messages, /literal "a" has type string/);
		ok(!/good/.test(messages), `an error about the accumulated file: ${messages}`);
	}],
];
