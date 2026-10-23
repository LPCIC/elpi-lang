import * as vscode from 'vscode';
import { Test, at, definitionUri, diagnostics, equal, fixture, hoverText, match, open } from '../../test/helpers';

// the tests of the extension in the browser, in order
export const tests: Test[] = [

	['syntax and type errors', async () => {
		const uri = fixture('bad.elpi');
		await open(uri);
		const messages = (await diagnostics(uri, 2)).map(d => d.message).join('\n');
		match(messages, /Parser/);
		match(messages, /literal "a" has type string/);
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

	['a document that is not a file', async () => {
		const doc = await vscode.workspace.openTextDocument({ language: 'elpi', content: 'pred p i:int.\np "x".\n' });
		match((await diagnostics(doc.uri, 1)).map(d => d.message).join('\n'), /has type string/);
	}],

	['accumulate fails', async () => {
		const uri = fixture('acc.elpi');
		await open(uri);
		match((await diagnostics(uri, 1)).map(d => d.message).join('\n'), /good/);
	}],
];
