import * as vscode from 'vscode';

// The files of the standard library of Elpi, as the server gives them to go to
// definition: elpi-builtin:/ID/NAME documents, ID being the instance of Elpi
// of the document (the web server, and the bundled server on a computer),
// whose text comes from the server with the request elpi/builtinFile. Shared by the extension on a computer and in the browser.

export const libraryScheme = 'elpi-builtin';

export class LibraryProvider implements vscode.TextDocumentContentProvider {
	// [request uri] asks the server for the text of [uri]
	constructor(private request: (uri: string) => Promise<string | null | undefined>) { }

	async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
		return (await this.request(uri.toString(true))) ?? '';
	}
}
