type StyleName =
  | 'reset' | 'vscode'
  | 'bulma' | 'divider' | 'tooltip' | 'quickview' | 'pageloader' | 'collapsible'
  | 'mdicons'
  | 'main';

type ScriptName =
  | 'fuzz'
  | 'quickview' | 'collapsible';

type ImportName =
  | 'shared' | 'client';

type ModuleName =
  | 'main';

export type MainConfig = {
  styles: Record<StyleName, string> & { [key: string]: string },
  scripts: Record<ScriptName, string> & { [key: string]: string },
  imports: Record<ImportName, string>,
  modules: Record<ModuleName, string> & { [key: string]: string }
};

export default (
  { styles, scripts, imports, modules }: MainConfig,
  contentCB: (body: string) => string
) => `<!DOCTYPE html>
<html lang="en">
    <head>
        <meta charset="UTF-8">

        <meta name="viewport" content="width=device-width, initial-scale=1.0">

        ${Object.values(styles).map(style => `<link href="${style}" rel="stylesheet">`).join('\n')}

        <title>Elpi Tracer</title>
    </head>
    <body class="has-navbar-fixed-top has-navbar-fixed-bottom">
       ${contentCB(`
        <div class="columns">

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
                                    <span class="mdi mdi-filter"><span id="filter-text" class="is-size-7">Filter by goal</span>
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
                        <a id="lambda" class="button has-tooltip-arrow has-tooltip-bottom" data-tooltip="Code Snippet" data-show="quickview" data-target="quickviewDefault" style="flex: 1 1 auto;">
                            <span class="mdi mdi-lambda"></span>
                        </a>
                    </div>
                </div>
            </nav>

            <nav id="navstack" class="navbar is-fixed-bottom breadcrumb has-arrow-separator" aria-label="breadcrumbs" style="display: flex;"></nav>


            <!-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
                 ;; Message Feed
                 ;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!-->

            <div class="column is-5 messages hero is-fullheight is-hidden" id="message-feed"></div>

            <!-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
                 ;; Message Pane
                 ;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!-->

            <div class="column is-7 messages hero is-fullheight is-hidden" id="message-pane">

           <!-- !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
                ;; Message Pane - Preview
                ;; !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!-->

               <div class="box message-preview">

                   <div class="top">

                       <div class="tags has-addons" style="float:right; margin-top: 5px;">
                           <span class="tag">Step</span>
                           <span id="message-pane-sid" class="tag is-info sid"></span>
                       </div>

                       <div class="tags has-addons" style="float:right; margin-right: 10px; margin-top: 5px;">
                           <span class="tag">Runtime</span>
                           <span id="message-pane-rid" class="tag is-info rid"></span>
                       </div>

                       <div class="tags has-addons" style="float:left; margin-right: 10px; margin-top: 5px;">
                           <span class="tag">
                              <span class="mdi mdi-card-bulleted" style="font-size: 12px;"></span>
                              Goal
                           </span>
                           <span id="message-pane-goal-id" class="tag is-info goal_id"></span>
                       </div>

                       <br/>
                       <br/>
                       <br/>

                       <div id="message-pane-goal" class="goal"></div>

                       <!-- <hr/> -->

                       <div id="message-pane-card-content" class="card_content"></div>
                   </div>
                </div>

				<br/>
				<br/>
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

        ${Object.values(scripts).map(s => `<script src="${s}"></script>`).join('\n')}
        <script type="importmap">
          { "imports": {
            "shared/": "${imports.shared}/",
            "client/": "${imports.client}/"
          } }
        </script>
        ${Object.values(modules).map(m => `<script type="module" src="${m}"></script>`).join('\n')}
      `)}
    </body>
</html>`
