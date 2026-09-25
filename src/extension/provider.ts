import * as vscode from 'vscode';
import * as path from 'path';

import * as os from 'node:os';
import * as cp from 'child_process';
import * as fs from 'fs';

import mainPage from '../shared/mainPage.mjs';

export class TraceProvider implements vscode.WebviewViewProvider {

    public static readonly viewType = 'elpi.tracer';

    private _elpi: string;
    private _options: string;
    private _options_default: string;
    private _view?: vscode.WebviewView;
    private _source: string;
    private _target_raw: string;
    private _target_dir: string;

    private _channel: any = vscode.window.createOutputChannel('Elpi');

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) {

        this._channel.appendLine("Running extension for " + os.platform() + " - " + os.release());

        this._elpi = "";

        this._options = "-test";
        this._options_default = "";

        this._source = "";

        if (os.platform().toString().toLowerCase() == "win32")
            this._target_dir = process.env['APPDATA'] + '\\';
        else
            this._target_dir = '/tmp/';

        this._target_raw = this._target_dir + "trace.tmp.json";
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,

            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(message => {
            switch (message.command) {
            case 'notify':
            {
                vscode.window.showInformationMessage(message.value);

                break;
            }
            case 'hopTo':
            {
                if (!message.value.startsWith('builtin')) {

                    const file = message.value.split(' ')[0];
                    const position = message.value.split(' ')[1];
                    // const character = position.substring(
                    //     position.indexOf("(") + 1,
                    //     position.lastIndexOf("@")
                    // );
                    const line = position.substring(
                        position.indexOf("L") + 1,
                        position.lastIndexOf(":")
                    );
                    const column = position.substring(
                        position.indexOf("C") + 1,
                        position.lastIndexOf(")")
                    );

                    let openPath = file;

                    vscode.workspace.openTextDocument(openPath).then(async (doc) => {
                        let pos1 = new vscode.Position(0, 0);
                        let pos2 = new vscode.Position(0, 0);
                        let sel = new vscode.Selection(pos1, pos2);
                        vscode.window.showTextDocument(doc, vscode.ViewColumn.One).then((e) => {
                            e.selection = sel;
                            vscode.commands
                                .executeCommand("cursorMove", {
                                    to: "down",
                                    by: "line",
                                    value: parseInt(line) - 1,
                                })
                                .then(() =>
                                    vscode.commands.executeCommand("cursorMove", {
                                        to: "right",
                                        by: "character",
                                        value: parseInt(column) - 1,
                                    })
                                );
                        });
                    });

                    this._channel.appendLine(`Hoping to file ${file} at ${line}:${column}`);
                }

                break;
            }
            case 'options_changed':
            {
                this._options = message.value;
                this._channel.appendLine(`Options changed to: ${this._options}`);
                break;
            }
            default:
                break;
            }
        });
    }

    private findFileOnPath(name: string) {
        if (name.startsWith('/')) { return true };

        const paths = (process.env['PATH'] || '')
          .split(path.delimiter)
          .map(x => path.resolve(x, name));

        for (const p of paths) {
          if (fs.existsSync(p)) {
            return true;
          }
        }
        return false;
      }

    private exec(command: string) {

        let result = cp.execSync(command).toString();

        if (result == "")
            result = "OK.";

        this._channel.appendLine(command + ": " + result);
    }

    public clear() {

        if (this._view)
            this._view.webview.postMessage({ type: 'clear' });
    }

    public open() {
        const options: vscode.OpenDialogOptions = {
            canSelectMany: false,
            openLabel: 'Open trace',
            canSelectFiles: true,
            canSelectFolders: false
        };

        vscode.window.showOpenDialog(options).then(fileUri => {
            if (fileUri && fileUri[0]) {

                this._channel.appendLine("Opening raw trace: " + fileUri[0].fsPath);

                if (this._view)
                    this._view.webview.postMessage({ type: 'progress', state: 'on' });

                const input = fs.readFileSync(fileUri[0].fsPath, 'utf-8');

                this._source = fileUri[0].fsPath;

                if (this._view)
                    this._view.webview.postMessage({ type: 'trace', source: input, file: fileUri[0].fsPath });

                if (this._view)
                    this._view.webview.postMessage({ type: 'progress', state: 'off' });
            }
        });
    }

    public save() {
        const options: vscode.SaveDialogOptions = {
            saveLabel: 'Save raw trace as'
        };

        vscode.window.showSaveDialog(options).then(fileUri => {
            if (fileUri) {
                this._channel.appendLine("Saving trace as: " + fileUri.toString() + " from " + this._source);

                fs.copyFile(this._source, fileUri.toString().slice(7), (err) => { // slice(7) chops 'file://'
                    if (err) {
                        this._channel.appendLine("Error saving raw trace to " + fileUri.toString().slice(7) + " " + err.toString());
                    } else {
                        this._channel.appendLine("Raw trace saved to " + fileUri.toString().slice(7));
                    }
                });
            }
        });
    }

    public trace() {

        let configuration = vscode.workspace.getConfiguration('elpi');
        let current_file = '';

        this._elpi                  = configuration['elpi'].path;

        if(!this.findFileOnPath(this._elpi)) {
          vscode.window
            .showInformationMessage(`Failed to find elpi`, 'Go to settings')
            .then(action => {
            if (action == 'Go to settings')
              vscode.commands.executeCommand('workbench.action.openSettings', '@ext:gares.elpi-lang');
          });
          return;
        }

        this._options_default = configuration['elpi'].options;

        if(vscode.window.activeTextEditor == undefined)
            return;

        current_file = vscode.window.activeTextEditor.document.fileName;
        vscode.window.showInformationMessage(`Tracing: ${current_file}`);

        this._channel.appendLine("Trace started: " + current_file);

        // --

        if(os.platform().toString().toLowerCase() == "win32")
            this.exec('cd ' + this._target_dir);

        // this.exec("eval $(opam env) && " + this._elpi + " " + this._options + " " + this._options_default + " " + current_file);
        this.exec(this._elpi + " " + this._options + " " + this._options_default.replace('[OUTPUT]', this._target_raw) + " " + current_file);

        // --

        this._source = this._target_raw;

        // --

        const input = fs.readFileSync(this._target_raw, 'utf-8');


        // --- Send message to the view backend

        if (this._view)
            this._view.webview.postMessage({ type: 'trace', source: input, file: current_file });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {

        const      jqueryUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', 'jquery', 'dist', 'jquery.min.js'));
        const         vueUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', 'vue', 'dist', 'vue.min.js'));
        const        fuzzUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', 'fuzzball', 'dist', 'fuzzball.umd.min.js'));
        const     bulmaQVUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', 'bulma-quickview', 'dist', 'js', 'bulma-quickview.min.js'));
        const     bulmaACUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@creativebulma', 'bulma-collapsible', 'dist', 'js', 'bulma-collapsible.min.js'));
        const      scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
        const      sharedUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'shared'));

        const    styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css'));
        const   styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
        const    styleBulmaUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', 'bulma', 'css', 'bulma.min.css'));
        const  styleBulmaDVUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', 'bulma-divider', 'dist', 'css', 'bulma-divider.min.css'));
        const  styleBulmaTTUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', 'bulma-tooltip', 'dist', 'css', 'bulma-tooltip.min.css'));
        const  styleBulmaQVUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', 'bulma-quickview', 'dist', 'css', 'bulma-quickview.min.css'));
        const  styleBulmaPLUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', 'bulma-pageloader', 'dist', 'css', 'bulma-pageloader.min.css'));
        const  styleBulmaACUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@creativebulma', 'bulma-collapsible', 'dist', 'css', 'bulma-collapsible.min.css'));
        const      styleMDIUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'node_modules', '@mdi', 'font', 'css', 'materialdesignicons.min.css'));
        const     styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));

        return mainPage({
          styles: {
            reset: styleResetUri.toString(),
            vscode: styleVSCodeUri.toString(),
            bulma: styleBulmaUri.toString(),
            divider: styleBulmaDVUri.toString(),
            tooltip: styleBulmaTTUri.toString(),
            quickview: styleBulmaQVUri.toString(),
            pageloader: styleBulmaPLUri.toString(),
            collapsible: styleBulmaACUri.toString(),
            mdicons: styleMDIUri.toString(),
            main: styleMainUri.toString(),
          },
          scripts: {
            jquery: jqueryUri.toString(),
            vue: vueUri.toString(),
            fuzz: fuzzUri.toString(),
            quickview: bulmaQVUri.toString(),
            collapsible: bulmaACUri.toString(),
          },
          imports: {
            shared: sharedUri.toString()
          },
          modules: {
            main: scriptUri.toString()
          }
        }, b => b);
    }
}
