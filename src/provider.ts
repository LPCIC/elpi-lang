import * as vscode from 'vscode';
import * as parser from './trace';

import    os = require('node:os');
import    cp = require('child_process');
import    fs = require('fs');
// import   tmp = require('tmp');
import shiki = require('shiki');

import chokidar = require('chokidar');

export class TraceProvider implements vscode.WebviewViewProvider {

    public static readonly viewType = 'elpi.tracer';

    private _cat: string;
    private _elpi: string;
    private _elpi_trace_elaborator: string;
    private _highlighter: shiki.Highlighter | undefined;
    private _options: string;
    private _options_default: string;
    private _view?: vscode.WebviewView;
    private _source: string;
    private _target: string;
    private _target_raw: string;
    private _target_dir: string;
    private _watcher: chokidar.FSWatcher | undefined;
    private _watcher_target: string;
    private _watcher_target_elaborated: string;

    private _channel: any = vscode.window.createOutputChannel('Elpi');

    constructor(
        private readonly _extensionUri: vscode.Uri,
    ) {
        
        this._channel.appendLine("Running extension for " + os.platform() + " - " + os.release());

        let elpi_lang_grammar_path = vscode.Uri.joinPath(this._extensionUri, 'syntaxes', 'elpi.tmLanguage.json').path;

        if (os.platform().toString().toLowerCase() == "win32")
            elpi_lang_grammar_path = elpi_lang_grammar_path.slice(1);
        
        this._channel.appendLine("Loading grammar file " + elpi_lang_grammar_path);

        const elpi_lang_grammer = JSON.parse(fs.readFileSync(elpi_lang_grammar_path, 'utf8'));
        const elpi_lang = {
            id: "elpi",
            scopeName: 'source.elpi',
            grammar: elpi_lang_grammer
        };

        this._elpi = "";
        this._elpi_trace_elaborator = "";

        this._options = "-test";
        this._options_default = "";

        this._source = "";
        
        if (os.platform().toString().toLowerCase() == "win32")
            this._target_dir = process.env.APPDATA + '\\';
        else
            this._target_dir = '/tmp/';

        this._target = this._target_dir + "trace.json";
        this._target_raw = this._target_dir + "trace.tmp.json";

        this._watcher_target = this._target_dir + "traced.tmp.json";
        this._watcher_target_elaborated = this._target_dir + "traced.json";

        shiki.getHighlighter({theme: 'css-variables'}).then(highlighter => {
            this._highlighter = highlighter;
            this._highlighter.loadLanguage(elpi_lang);
        });

        if (os.platform().toString().toLowerCase() == "win32")
            this._cat = "type";
        else
            this._cat = "cat";
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
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

            case 'highlight':
            {
                const code = message.value;
                const indx = message.index;
                  let html = undefined;

                if (this._highlighter)
                    html = this._highlighter.codeToHtml(code, { lang: 'elpi' });

                if (this._view)
                    this._view.webview.postMessage({
                        type: 'highlight',
                        html: html,
                        indx: indx
                    });

                break;
            }
            case 'highlight_elided':
            {
                const code = message.value;
                const indx = message.index;
                let html = undefined;
                
                if (this._highlighter)
                    html = this._highlighter.codeToHtml(code, { lang: 'elpi' });
                
                if (this._view)
                    this._view.webview.postMessage({
                        type: 'highlight_elided',
                        html: html,
                        indx: indx
                    });
    
                break;
            }
            case 'highlight_inline':
            {
                const code = message.value;
                const id = message.id;
                let html = undefined;
                
                if (this._highlighter)
                    html = this._highlighter.codeToHtml(code, { lang: 'elpi' });
                
                if (this._view)
                    this._view.webview.postMessage({
                        type: 'highlight_inline',
                        html: html,
                        id: id
                    });
    
                break;
            }
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

                let configuration = vscode.workspace.getConfiguration('elpi');
        
                this._elpi_trace_elaborator = configuration.elpi_trace_elaborator.path;

                this._channel.appendLine("Opening raw trace: " + fileUri[0].fsPath);

                if (this._view)
                    this._view.webview.postMessage({ type: 'progress', state: 'on' });

                this.exec(this._cat + " " + fileUri[0].fsPath + " | " + this._elpi_trace_elaborator + " > " + this._target);

                const trace = parser.readTrace(JSON.parse(fs.readFileSync(this._target, 'utf8')));

                this._source = fileUri[0].fsPath;

                let enable_highlighting = configuration.elpi_trace_view.syntax_highlighting;

                if (this._view)
                    this._view.webview.postMessage({ type: 'trace', trace: trace, file: fileUri[0].fsPath, enable_highlighting: enable_highlighting });
                
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

    public watch_start() {

        let message;

        this._watcher = chokidar.watch(this._watcher_target, {
            persistent: true,
            ignoreInitial: true
        });

        if (this._view)
            this._view.webview.postMessage({ type: 'watcher', status: 'on' });

        this._watcher.on('change', path => {

            let configuration = vscode.workspace.getConfiguration('elpi');
                    
            this._elpi                  = configuration.elpi.path;
            this._elpi_trace_elaborator = configuration.elpi_trace_elaborator.path;

            let enable_highlighting = configuration.elpi_trace_view.syntax_highlighting;

            message = `File ${path} has been changed`;

            vscode.window.showInformationMessage(message);
            this._channel.appendLine(message);

            this.exec("eval $(opam env) && cat " + this._watcher_target + " | " + this._elpi_trace_elaborator + " > " + this._watcher_target_elaborated);

            const trace = parser.readTrace(JSON.parse(fs.readFileSync(this._watcher_target_elaborated, 'utf8')));

            this._source = this._watcher_target;

            if (this._view)
                this._view.webview.postMessage({ type: 'trace', trace: trace, file: 'Watched', enable_highlighting: enable_highlighting });
        });

        message = "Me watch has started. Try me by touching " + this._watcher_target;

        vscode.window.showInformationMessage(message);

        this._channel.appendLine(message);
    }

    public watch_stop() {

        if (this._watcher != undefined
         && this._view    != undefined) {

            this._watcher.close().then(() => {

                const message = "Me watch has ended.";

                vscode.window.showInformationMessage(message);
                
                this._channel.appendLine(message);

                if (this._view)
                    this._view.webview.postMessage({ type: 'watcher', status: 'off' });
            });
        }
    }

    public trace() {

        let configuration = vscode.workspace.getConfiguration('elpi');
        let current_file = '';
        
        this._elpi                  = configuration.elpi.path;
        this._elpi_trace_elaborator = configuration.elpi_trace_elaborator.path;

        this._options_default = configuration.elpi.options;

        let enable_highlighting = configuration.elpi_trace_view.syntax_highlighting;

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
            
        // cp.execSync(this._elpi + " " + this._options + " " + this._options_default + " " + current_file);
        
        this.exec(this._cat + " " + this._target_raw + " | " + this._elpi_trace_elaborator + " > " + this._target);
        
        // --

        if(!fs.existsSync(this._target)) {
            vscode.window.showInformationMessage(`Trace generation failed`);
            this._channel.appendLine("Trace generation failed.");
            return;
        } else {
            this._channel.appendLine("Trace generation successful.");
        }

        // --

        this._source = this._target_raw;

        // --

        const trace = parser.readTrace(JSON.parse(fs.readFileSync(this._target, 'utf8')))

        // --- Send message to the view backend

        if (this._view)
            this._view.webview.postMessage({ type: 'trace', trace: trace, file: current_file, enable_highlighting: enable_highlighting });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {

        const      jqueryUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'jquery-3.6.0.js'));
        const         vueUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vue.js'));
        const        fuzzUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'fuzzball.umd.min.js'));
        const     bulmaQVUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'bulma-quickview.js'));
        const     bulmaACUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'bulma-collapsible.min.js'));
        const      popperUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'popper.min.js'));
        const      scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));

        const    styleResetUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'reset.css'));
        const   styleVSCodeUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'vscode.css'));
        const    styleBulmaUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'bulma.css'));
        const  styleBulmaDVUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'bulma-divider.css'));
        const  styleBulmaTTUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'bulma-tooltip.css'));
        const  styleBulmaQVUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'bulma-quickview.min.css'));
        const  styleBulmaPLUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'bulma-pageloader.min.css'));
        const  styleBulmaACUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'bulma-collapsible.min.css'));
        const      styleMDIUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'materialdesignicons.css'));
        const     styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));

return `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8">

        <meta name="viewport" content="width=device-width, initial-scale=1.0">

        <link href="${styleResetUri}" rel="stylesheet">
        <link href="${styleVSCodeUri}" rel="stylesheet">
        <link href="${styleBulmaUri}" rel="stylesheet">
        <link href="${styleBulmaDVUri}" rel="stylesheet">
        <link href="${styleBulmaTTUri}" rel="stylesheet">
        <link href="${styleBulmaQVUri}" rel="stylesheet">
        <link href="${styleBulmaPLUri}" rel="stylesheet">
        <link href="${styleBulmaACUri}" rel="stylesheet">
        <link href="${styleMDIUri}" rel="stylesheet">
        <link href="${styleMainUri}" rel="stylesheet">

        <title>Elpi Tracer</title>
    </head>
    <body>

        <div class="columns" id="tracer">

<!-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
;; Panel header: navigation, filtering, informations & options
;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!! -->

            <nav class="navbar is-fixed-top information" aria-label="information" style="display: flex; align-items: stretch; flex-direction: row;">
                <div class="action-buttons" style="display: flex;">
                    <div class="control is-grouped" style="display: flex;">
                        <a id="back_b" class="button inactive" style="flex: 1 1 auto;"><span class="mdi mdi-chevron-left"></span></a>
                        <a id="forw_b" class="button inactive" style="flex: 1 1 auto;"><span class="mdi mdi-chevron-right"></span></a>
                        <input id="filter" class="input" type="text" style="padding: 10px;"/>

                        <div class="dropdown">
                            <div class="dropdown-trigger">
                                <button class="button" aria-haspopup="true" aria-controls="dropdown-menu3" style="flex: 1 1 auto;">
                                    <span class="mdi mdi-filter"><span id="filter-text" class="is-size-7">Filter by Goal</span>
                                </button>
                            </div>
                            <div class="dropdown-menu" id="dropdown-menu3" role="menu">
                                <div class="dropdown-content">
                                    <a class="dropdown-item" id="filter-by-goal">
                                        Goal
                                    </a>
                                    <hr class="dropdown-divider">
                                    <a class="dropdown-item" id="filter-by-predicate">
                                        Predicate
                                    </a>
                                    <hr class="dropdown-divider">
                                    <a class="dropdown-item" id="filter-by-kind">
                                        Kind
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="action-buttons" style="display: flex; flex: 1;">
                    <div class="control is-grouped" style="display: flex; width: 100%">
                        <a class="button has-tooltip-arrow has-tooltip-bottom" data-tooltip="Trace information">
                            <span class="mdi mdi-book-information-variant"></span>
                        </a>
                        <input id="trace-information" class="input" type="text" style="padding: 10px; flex: 1;" value=""/>
                    </div>
                </div>

                <div class="action-buttons" style="display: flex; margin-right: 10px;">
                    <div class="control is-grouped" style="display: flex;">
                        <a class="button has-tooltip-arrow has-tooltip-bottom" data-tooltip="Elpi command line options" style="flex: 1 1 auto;">
                            <span class="mdi mdi-console-line"></span>
                        </a>
                        <input id="options" class="input" type="text" style="padding: 10px;" value="-test"/>
                    </div>
                </div>

                <div class="action-buttons" style="display: flex; margin-right: 10px;">
                    <div class="control is-grouped" style="display: flex;">
                        <a class="button has-tooltip-arrow has-tooltip-bottom" data-tooltip="Watcher state" style="flex: 1 1 auto;">
                            <span id="watcher_state" class="mdi mdi-eye-off"></span>
                        </a>
                    </div>
                </div>

                <div class="action-buttons" style="display: flex; margin-right: 10px;">
                    <div class="control is-grouped" style="display: flex;">
                        <a id="lambda" class="button has-tooltip-arrow has-tooltip-bottom" data-tooltip="Code Snippet" data-show="quickview" data-target="quickviewDefault" style="flex: 1 1 auto;">
                            <span class="mdi mdi-lambda"></span>
                        </a>
                    </div>
                </div>
            </nav>

            <nav class="navbar is-fixed-bottom breadcrumb has-arrow-separator" aria-label="breadcrumbs" style="display: flex;">

                <p>Navigation history:</p>

                <ul>
                    <li v-for="(step, index) in stack" v-bind:id="'bd-goal-'+index" :class="step.active" v-on:click="switchTo(index)">
                        <a><span class="mdi mdi-card-bulleted"></span>({{ step.rt }}, {{ step.id }})</a>
                    </li>
                </ul>

                <span id="nav_clear" class="mdi mdi-close-circle-outline is-hidden" style="display: block; font-size: 18px; float: right; margin-right: 10px;" onclick="window.inboxVue.clear_navigation()"></span>
            </nav>


            <!-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
                 ;; Message Feed
                 ;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!-->

            <div class="column is-5 messages hero is-fullheight is-hidden" id="message-feed">

                <!-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
                     ;; Message Feed - Messages aka Cards
                     ;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!-->

                <div class="inbox-messages" id="inbox-messages">
                    <div v-for="(step, index) in messages" :class="step.card_class" v-bind:id="'msg-card-'+index" v-on:click="showMessage(step,index)" v-bind:data-preview-id="index">
                        <div class="card-content">
                            <div class="msg-header">
                                <span v-bind:id="'popcard-'+index" v-html="step.goal_text_highlighted_elided" aria-describedby="tooltip"></span>
                                <div class="poptip" v-bind:id="'popttip-'+index" role="tooltip">
                                <div v-html="step.goal_text_highlighted"></div>
                                <div id="arrow" data-popper-arrow></div>
                                </div>
                                <span class="msg-timestamp"></span>
                                <span class="msg-attachment tag"><small>{{ step.goal_id }} - ({{step.rt}}|{{ step.id }})</small></span>
                            </div>
                            <div class="msg-subject">
                                <strong>Kind:</strong> {{ step.kind }}
                            </div>
                            <div class="msg-snippet">
                                <span v-if="step.kind == 'Inference'"><strong>Predicate:</strong> {{ step.goal_predicate }}</span>
                                <span v-if="step.kind == 'Init'">Entry point</span>
                                <span v-if="step.kind == 'Findall'">
                                    <br/>
                                    <button class="button is-small" style="width: 100%" v-on:click.stop="toggleSubCards(step.rt_sub)">Toggle</button>
                                </span>
                                <span v-if="step.kind == 'CHR'">
                                    <br/>
                                    <button class="button is-small" style="width: 100%" v-on:click.stop="toggleSubCards(step.rt_sub)">Toggle</button>
                                </span>
                            </div>
                           <div class="msg-footer" v-if="step.status_label.length > 0">
                               <strong>Next:</strong>
                               <a v-for="entry in step.status_label" v-on:click.stop="jump(entry[2]);">
                                   {{entry[0]}}
                                   <span> </span>
                               </a>
                           </div>
                        </div>
                        <div :class="step.footer">

                        </div>
                    </div>
                </div>

                <br/>
            </div>a

            <!-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
                 ;; Message Pane
                 ;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!-->

            <div class="column is-7 message hero is-fullheight is-hidden" id="message-pane">

           <!-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
                ;; Message Pane - Preview
                ;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!-->

               <div class="box message-preview">

                   <div class="top">

                       <div class="tags has-addons" style="float:right; margin-top: 5px;">
                           <span class="tag">Step</span>
                           <span class="tag is-info sid"></span>
                       </div>

                       <div class="tags has-addons" style="float:right; margin-right: 10px; margin-top: 5px;">
                           <span class="tag">Runtime</span>
                           <span class="tag is-info rid"></span>
                       </div>

                       <div class="tags has-addons" style="float:left; margin-right: 10px; margin-top: 5px;">
                           <span class="tag">
                              <span class="mdi mdi-card-bulleted" style="font-size: 12px;"></span>
                              Goal
                           </span>
                           <span class="tag is-info goal_id"></span>
                       </div>
                       
                       <br/>
                       <br/>
                       <br/>

                       <div class="goal"></div>

                       <!-- <hr/> -->

                       <div class="card_content"></div>
                   </div>
                </div>
            </div>
        </div>

        <div id="quickviewDefault" class="quickview">
           <header class="quickview-header">
              <p class="title">Code snippet</p>
              <span class="delete" data-dismiss="quickview"></span>
            </header>

            <div class="quickview-body">
                <div class="quickview-block" id="snippet">
                
                </div>
            </div>
        </div>

        <div id="loader" class="pageloader">
            <span class="title">Computing trace</span>
        </div>

        <!-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
             ;; Additional logic (JS)
             ;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!-->

        <script src="${jqueryUri}"></script>
        <script src="${vueUri}"></script>
        <script src="${fuzzUri}"></script>
        <script src="${bulmaQVUri}"></script>
        <script src="${bulmaACUri}"></script>
        <script src="${popperUri}"></script>
        <script src="${scriptUri}"></script>
    </body>
</html>`;
    }
}
