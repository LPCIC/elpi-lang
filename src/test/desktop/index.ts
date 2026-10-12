// The tests of the extension on a computer, run by @vscode/test-electron
// (npm run test-desktop) in the extension host of VS Code.

import { runTests } from '../helpers';
import { tests } from './extension.test';

export function run(): Promise<void> {
	return runTests(tests);
}
