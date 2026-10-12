import * as vscode from 'vscode';

// What the tests of the extension share, on a computer (src/test/desktop) and
// in the browser (src/web/test): checks (the assert module of node is not in
// the browser), waiting for the server, and a runner.

export function ok(cond: unknown, message: string): asserts cond {
	if (!cond) { throw new Error(message); }
}
export function match(text: string, re: RegExp) {
	ok(re.test(text), `${JSON.stringify(text)} does not match ${re}`);
}
export function equal<T>(x: T, y: T) {
	ok(x === y, `${x} is not ${y}`);
}

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// a file of the workspace folder (the fixtures of the tests)
export function fixture(name: string): vscode.Uri {
	const folder = vscode.workspace.workspaceFolders?.[0];
	ok(folder, 'no workspace folder');
	return vscode.Uri.joinPath(folder.uri, name);
}

export async function open(uri: vscode.Uri): Promise<vscode.TextDocument> {
	const doc = await vscode.workspace.openTextDocument(uri);
	await vscode.window.showTextDocument(doc);
	return doc;
}

// the diagnostics of [uri], once there are at least [atLeast]
export async function diagnostics(uri: vscode.Uri, atLeast: number): Promise<vscode.Diagnostic[]> {
	for (let i = 0; i < 300; i++) {
		const ds = vscode.languages.getDiagnostics(uri);
		if (ds.length >= atLeast) { return ds; }
		await sleep(100);
	}
	return vscode.languages.getDiagnostics(uri);
}

// the position of the k-th character of the first occurrence of needle
export function at(doc: vscode.TextDocument, needle: string, k = 0): vscode.Position {
	const i = doc.getText().indexOf(needle);
	ok(i >= 0, `${needle} not found`);
	return doc.positionAt(i + k);
}

// the text of the hover at [pos], once the server gives one
export async function hoverText(uri: vscode.Uri, pos: vscode.Position): Promise<string> {
	for (let i = 0; i < 300; i++) {
		const hovers = await vscode.commands.executeCommand<vscode.Hover[]>('vscode.executeHoverProvider', uri, pos);
		const text = hovers.flatMap(h => h.contents.map(c => typeof c === 'string' ? c : c.value)).join('\n');
		if (text !== '') { return text; }
		await sleep(100);
	}
	return '';
}

// the URI of the definition at [pos]
export async function definitionUri(uri: vscode.Uri, pos: vscode.Position): Promise<vscode.Uri> {
	const defs = await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
		'vscode.executeDefinitionProvider', uri, pos);
	equal(defs.length, 1);
	return 'uri' in defs[0] ? defs[0].uri : defs[0].targetUri;
}

export type Test = [string, () => Promise<void>];

// runs the tests in turn, the results on the console; fails if one fails
export async function runTests(tests: Test[]): Promise<void> {
	let failures = 0;
	for (const [name, test] of tests) {
		try {
			await test();
			console.log(`ok: ${name}`);
		} catch (e) {
			failures++;
			console.log(`FAILED: ${name}: ${e instanceof Error ? e.message : e}`);
		}
	}
	console.log(`${tests.length - failures} passed, ${failures} failed`);
	if (failures > 0) { throw new Error(`${failures} tests failed`); }
}
