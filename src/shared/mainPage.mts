type StyleName =
  | 'reset' | 'vscode'
  | 'bulma' | 'divider' | 'tooltip' | 'quickview' | 'pageloader' | 'collapsible'
  | 'mdicons'
  | 'main';

type ScriptName =
  | 'jquery'
  | 'vue'
  | 'fuzz'
  | 'quickview' | 'collapsible';

type ImportName =
  | 'shared';

type ModuleName =
  | 'main';

export type MainConfig = {
  styles: Record<StyleName, string>,
  scripts: Record<ScriptName, string>,
  imports: Record<ImportName, string>,
  modules: Record<ModuleName, string>
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
                        <a id="lambda" class="button has-tooltip-arrow has-tooltip-bottom" data-tooltip="Code Snippet" data-show="quickview" data-target="quickviewDefault" style="flex: 1 1 auto;">
                            <span class="mdi mdi-lambda"></span>
                        </a>
                    </div>
                </div>
            </nav>

            <nav class="navbar is-fixed-bottom breadcrumb has-arrow-separator" aria-label="breadcrumbs" style="display: flex;">

                <p>Navigation history:</p>

                <ul>
                    <li v-for="(step, index) in stack" v-bind:id="'bd-goal-'+index" :class="step.active" v-on:click="switchTo(index, step.rt, step.id)">
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
                        <!--    <div class="poptip" v-bind:id="'popttip-'+index" role="tooltip"> -->
                        <!--    <div v-html="step.goal_text_highlighted"></div> -->
                        <!--    <div id="arrow" data-popper-arrow></div> -->
                        <!--    </div> -->
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
            </div>

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
          { "imports": { "shared/": "${imports.shared}/" } }
        </script>
        ${Object.values(modules).map(m => `<script type="module" src="${m}"></script>`).join('\n')}
      `)}
    </body>
</html>`
