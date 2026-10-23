import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

// The executables of Elpi (elpi, elpi-lsp, elpi-trace-elaborator) are looked
// for in the directory of the setting elpi.bin; when it is empty, in the PATH.

function expandHome(p: string): string {
	if (p === '~') { return os.homedir(); }
	if (p.startsWith('~/')) { return path.join(os.homedir(), p.slice(2)); }
	return p;
}

// The command that launches [name]: the name itself (the PATH is searched) or
// the file of that name in the directory elpi.bin
export function binary(name: string): string {
	const dir = (vscode.workspace.getConfiguration('elpi').get<string>('bin') || '').trim();
	if (dir === '') { return name; }
	const file = path.join(expandHome(dir), name);
	if (os.platform() === 'win32' && !fs.existsSync(file) && fs.existsSync(file + '.exe')) { return file + '.exe'; }
	return file;
}

// whether a command exists: a file when it is a path, else a file of the PATH
export function exists(command: string): boolean {
	if (path.isAbsolute(command)) { return fs.existsSync(command); }
	return (process.env.PATH || '')
		.split(path.delimiter)
		.some(dir => fs.existsSync(path.resolve(dir, command)) || (os.platform() === 'win32' && fs.existsSync(path.resolve(dir, command + '.exe'))));
}
