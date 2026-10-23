// Downloads VS Code, and runs the tests of src/test/desktop in it, on the
// folder test-fixtures/desktop (npm run test-desktop)

import * as fs from 'fs';
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
	const root = path.resolve(__dirname, '../../..');
	// set when this runs from a terminal of VS Code: VS Code would then start
	// as node
	delete process.env.ELECTRON_RUN_AS_NODE;
	// the user settings: no elpi-lsp, so the extension falls back to the
	// bundled server (the tests change them, at the user level)
	const userData = path.join(root, '.vscode-test/user-data-desktop');
	fs.rmSync(userData, { recursive: true, force: true });
	fs.mkdirSync(path.join(userData, 'User'), { recursive: true });
	fs.writeFileSync(path.join(userData, 'User/settings.json'),
		JSON.stringify({ 'elpi.bin': '/nonexistent-elpi-bin-for-the-tests' }, null, 2));
	try {
		await runTests({
			extensionDevelopmentPath: root,
			extensionTestsPath: path.resolve(__dirname, 'index'),
			launchArgs: [path.join(root, 'test-fixtures/desktop'), '--disable-extensions', '--disable-workspace-trust',
				`--user-data-dir=${userData}`],
			// the directory of an elpi-lsp executable, for the test that uses it
			extensionTestsEnv: { ELPI_LSP_TEST_BIN: process.env.ELPI_LSP_TEST_BIN },
		});
	} catch (e) {
		console.error(e);
		process.exit(1);
	}
}

main();
