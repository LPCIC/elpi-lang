// The tests of the extension in the browser, run by @vscode/test-web
// (npm run test-web) in the extension host of VS Code for the web.

import { runTests } from '../../test/helpers';
import { tests } from './extension.test';

export function run(): Promise<void> {
	return runTests(tests);
}
