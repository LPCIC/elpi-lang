// This script will be run within the webview itself
// It cannot access the main VS Code APIs directly.
(function () {
    const vscode = acquireVsCodeApi();

    const oldState = vscode.getState();

    // Handle messages sent from the extension to the webview
    window.addEventListener('message', event => {
        const message = event.data; // The json data that the extension sent
        switch (message.type) {
            case 'highlight':
                // console.log('Got', message.html, 'for', message.indx);
                window.inbox[message.indx].goal_text_highlighted = message.html;
                break;
            case 'highlight_elided':
                    // console.log('Got', message.html, 'for', message.indx);
                    window.inbox[message.indx].goal_text_highlighted_elided = message.html;
                    break;
            case 'highlight_inline':
                $('#' + message.id).html(message.html);
                break;
            case 'trace':
                clear();
                trace(message.trace);
                $("#trace-information").val(message.file + ' on ' + new Date().toISOString());
                break;
            case 'clear':
                clear();
                break;
            case 'watcher':
                update_watcher_state(message.status);
                break;
            case 'progress':
                if (message.state == 'on')
                    $('#loader').addClass('is-active');
                else
                    $('#loader').removeClass('is-active');
                break;
            default:
                break;
        }
    });

    function elide(i, str) {

        if (str.length < i)
            return str;

        return str.replace(str.slice(i,-i),' ... ');
    }

    // /////////////////////////////////////////////////////////////////////////////
    // NOTE: Goal mapping refactoring helpers
    // /////////////////////////////////////////////////////////////////////////////

    function intersect(a, b) {
        var t;
        if (b.length > a.length) t = b, b = a, a = t; // indexOf to loop over shorter
        return a.filter(function (e) {
            return b.indexOf(e) > -1;
        });
    }

    function ids_for_rt(rt) {

        let ids = [];

        for(var i = 0; i < window.rts.length; i++)
            if (window.rts[i] === rt)
                ids.push(i);

        return ids;
    }

    function ids_for_st(st) {

        let ids = [];

        for(var i = 0; i < window.sts.length; i++)
            if (window.sts[i] === st)
                ids.push(i);

        return ids;
    }

    function ids_for_gl(gl) {

        let ids = [];

        for(var i = 0; i < window.gls.length; i++)
            if (window.gls[i] === gl)
                ids.push(i);

        return ids;
    }

    function ids_for_rt_gl_not(rt, gl, id) {

        // console.log('ids_for_rt_gl_not', rt, gl, id);

        let rt_ids = ids_for_rt(rt);
        let gl_ids = ids_for_gl(gl);
        let it_ids = intersect(rt_ids, gl_ids);

        // console.log('ids_for_rt_gl_not - rt_ids', '[' + rt_ids.join(', ') + ']');
        // console.log('ids_for_rt_gl_not - gl_ids', '[' + gl_ids.join(', ') + ']');
        // console.log('ids_for_rt_gl_not - it_ids', '[' + it_ids.join(', ') + ']');

        let ids = [];

        for(var i = 0; i < it_ids.length; i++)
            if (it_ids[i] !== id)
                ids.push(it_ids[i]);

        return ids;
    }

    function ids_for_rt_st(rt, st) {

        let rt_ids = ids_for_rt(rt);
        let st_ids = ids_for_st(st);
        let it_ids = intersect(rt_ids, st_ids);

        return it_ids;
    }

    function ids_for_rt_gl(rt, gl) {

        let rt_ids = ids_for_rt(rt);
        let gl_ids = ids_for_gl(gl);
        let it_ids = intersect(rt_ids, gl_ids);

        return it_ids;
    }

    function ids_for_rt_st_gl(rt, st, gl) {
        let rt_ids = ids_for_rt(rt);
        let st_ids = ids_for_st(st);
        let gl_ids = ids_for_gl(gl);
        let it_ids = intersect(intersect(rt_ids, st_ids), gl_ids);

        // console.log('ids_for_rt_st_gl', rt, st, gl, '[' + it_ids.join(', ') + ']');

        return it_ids;
    }

    function map_rt(c, rt) {

        if (window.rts.length > c)
            console.error('map_rt: RTS already has a key for index', c);
        
        window.rts[c] = rt;

        // console.log('map_rt:', c, '[' + window.rts.join(', ') + ']');
    }

    function map_st(c, st) {

        if (window.sts.length > c)
            console.error('map_st: STS already has a key for index', c);
        
        window.sts[c] = st;

        // console.log('map_st:', c, '[' + window.sts.join(', ') + ']');
    }

    function map_gl(c, gl) {

        if (window.gls.length > c)
            console.error('map_gl: GLS already has a key for index', c);
        
        window.gls[c] = gl;

        // console.log('map_gl:', c, '[' + window.gls.join(', ') + ']');
    }
    
    // /////////////////////////////////////////////////////////////////////////////
    // Kind wise helper functions
    // /////////////////////////////////////////////////////////////////////////////

    function goal_kind(step) {

        return step.kind;
    }

    function goal_id(step) {

        // console.log('goal_id:', JSON.stringify(step));

        let kind = step.kind;
        let id = -1;

        if (kind == "Init") {
            id = step.value.goal_id;
        } else if (kind == "Inference") {
            id = step.value.current_goal_id;
        } else if (kind == "Findall") {
            id = step.value.findall_goal_id;
        } else if (kind == "Cut") {
            id = step.value.cut_goal_id;
        } else if (kind == "Suspend") {
            id = step.value.suspend_goal_id;
        } else if (kind == "Resume") {
            id = 'none'; // step.value.current_goal_id;
        } else if (kind == "CHR") {
            id = 'none'; // step.value.current_goal_id;
        } else {
            console.error('goal_id', 'Unknown step kind', kind);
        }

        return id;
    }

    function goal_text(step) {

        // console.log('goal_text:', JSON.stringify(step));

        let kind = step.kind;
        let text = "";

        if (kind == "Init") {
            text = step.value.goal_text;
        } else if (kind == "Inference") {
            text = step.value.current_goal_text;
        } else if (kind == "Findall") {
            text = step.value.findall_goal_text;
        } else if (kind == "Cut") {
            text = "Cut";
        } else if (kind == "Suspend") {
            text = step.value.suspend_goal_text;
        } else if (kind == "Resume") {
            text = "Resume";
        } else if (kind == "CHR") {
            text = "CHR";
        } else {
            console.error('goal_text', 'Unknown step kind', kind);
        }

        return text;
    }

    function goal_predicate(step) {

        // console.log('goal_predicate:', JSON.stringify(step));

        let kind = step.kind;
        let predicate = "";

        if (kind == "Init") {
            predicate = "? (INIT kind)";
        } else if (kind == "Inference") {
            predicate = step.value.current_goal_predicate;
        } else if (kind == "Findall") {
            predicate = "? (FINDALL kind)";
        } else if (kind == "Cut") {
            predicate = "? (CUT kind)";
        } else if (kind == "Suspend") {
            predicate = "? (SUSPEND kind)";
        } else if (kind == "Resume") {
            predicate = "? (RESUME kind)";
        } else if (kind == "CHR") {
            predicate = "? (CHR kind)";
        } else {
            console.error('goal_predicate', 'Unknown step kind', kind);
        }

        return predicate;
    }

    function goal_status(card)
    {
        // console.log('goal_status', JSON.stringify(card));

        let status = card.color.kind;

        return "dot-" + status.toLowerCase();
    }

    function goal_footer(card)
    {
        // console.log('goal_status', JSON.stringify(card));

        let status = card.color.kind;

        return "card-footer card-footer-" + status.toLowerCase();
    }

    // This one has a terrible complexity, tends to quadratic, Urf, TO BE REVIEWED

    function goal_status_label(card, trace, ds_r)
    {
        let status = card.color.kind;

        if (!status.includes("Yellow") && card.step.kind != "Inference")
            return [];

        // console.log('goal_status_label', JSON.stringify(card));

        let destinations = [];
        let min_step = 99999999;
        let ds_s = -1;
        let ds_g = -1;

        for(var i = 0; i < card.step.value.more_successful_attempts.length; i++) {
            let step_id = card.step.value.more_successful_attempts[i];
            let runt_id = card.runtime_id;

            // console.log('goal_status_label', 'seeking goal id for', step_id, runt_id);

            // for(var j = 0; j < trace.length; j++) {

            //     if(trace[j].step_id    == step_id
            //     && trace[j].runtime_id == runt_id) {

            //         goal_ds[0] =         trace[j].step_id;
            //         goal_ds[1] = goal_id(trace[j].step);

            //         if (goal_ds[0] != undefined && goal_ds[1] != undefined) {
            //             // console.log('goal_status_label', 'pushing', goal_ds[0], goal_ds[1]);
            //             destinations.push(goal_ds);
            //         }
            //     }
            // }

            for(var j = 0; j < trace.length; j++) {

                if(trace[j].step_id    == step_id
                && trace[j].runtime_id == runt_id
                && trace[j].step_id     < min_step) {

                    ds_s =         trace[j].step_id;
                    ds_g = goal_id(trace[j].step);

                    min_step = trace[j].step_id;
                }
            }
        }

        if (min_step < 99999999) {

            let goal_ds = [];

            goal_ds[0] = ds_s;
            goal_ds[1] = ds_g;
            goal_ds[2] = ids_for_rt_st_gl(ds_r, ds_s, ds_g)[0];

            if (goal_ds[0] != undefined && goal_ds[1] != undefined) {
                // console.log('goal_status_label', 'pushing', goal_ds[0], goal_ds[1]);
                destinations.push(goal_ds);
            }
        }

        // (step_id, goal_id, card_index)

        // console.log('goal_status_label', '[' + destinations.join(', ') + ']');

        return destinations;
    }

    // /////////////////////////////////////////////////////////////////////////////
    // Ergonomic helper functions
    // /////////////////////////////////////////////////////////////////////////////

    function filter(text) {
        // console.log('Filtering with', text, 'on', window.filter_type, 'there are', window.inboxCount, 'goal cards');

        if (text == '') {
            for (var i = 0; i < window.inboxCount; i++) {
                $('#msg-card-' + window.inbox[i].card_index).removeClass("hidden");
            }
            return;
        }

        for (var i = 0; i < window.inboxCount; i++) {

            // console.log('Iterating on', i, window.inbox[i]);

            if (window.filter_type == "goal") {
                var ratio = fuzzball.ratio(text, window.inbox[i].goal_text);

                if(ratio > 80 || window.inbox[i].goal_text.startsWith(text) || window.inbox[i].goal_text.includes(text)) {
                    // console.log('Compared', text, 'with', window.inbox[i].goal_text, ratio);
                    $('#msg-card-' + window.inbox[i].card_index).removeClass("hidden");
                } else {
                    $('#msg-card-' + window.inbox[i].card_index).addClass("hidden");
                }
            }

            if (window.filter_type == "predicate") {
                var ratio = fuzzball.ratio(text, window.inbox[i].goal_predicate);

                if(ratio > 80 || window.inbox[i].goal_predicate.startsWith(text) || window.inbox[i].goal_predicate.includes(text)) {
                    // console.log('Compared', text, 'with', window.inbox[i].goal_predicate, ratio);
                    $('#msg-card-' + window.inbox[i].card_index).removeClass("hidden");
                } else {
                    $('#msg-card-' + window.inbox[i].card_index).addClass("hidden");
                }
            }

            if (window.filter_type == "kind") {
                var ratio = fuzzball.ratio(text, window.inbox[i].type);

                if(ratio > 80 || window.inbox[i].kind.startsWith(text) || window.inbox[i].kind.includes(text)) {
                    // console.log('Compared', text, 'with', window.inbox[i].type, ratio);
                    $('#msg-card-' + window.inbox[i].card_index).removeClass("hidden");
                } else {
                    $('#msg-card-' + window.inbox[i].card_index).addClass("hidden");
                }
            }
        }
    }
    
    function back() {

        // console.log('Backwards on goal');

        if (window.goal_navigation_index < 1)
            return;

        $("#filter").val(''); filter('');
        
        window.goal_navigation_index = window.goal_navigation_index - 1;
        
        var previous = window.goal_navigation_stack[window.goal_navigation_index];

        window.prevent_nav_handling = true;
        
        window.inboxVue.showMessage(previous.msg, previous.index);

        scrollTo(previous.index);

        window.prevent_nav_handling = false;
    }

    function forw() {

        // console.log('Forwards on goal');

        if (window.goal_navigation_index == window.goal_navigation_stack.length - 1)
            return;

        $("#filter").val(''); filter('');
        
        window.goal_navigation_index = window.goal_navigation_index + 1;
        
        var following = window.goal_navigation_stack[window.goal_navigation_index];

        window.prevent_nav_handling = true;
        
        window.inboxVue.showMessage(following.msg, following.index);

        scrollTo(following.index);

        window.prevent_nav_handling = false;
    }

    function scrollTo(index) {

        $("#message-feed").animate({
            scrollTop: $("#msg-card-" + index).offset().top - 40 // -40 is header height, me css fu sucks
        }, 500);
    }

    // /////////////////////////////////////////////////////////////////////////////
    // Formatting functions
    // /////////////////////////////////////////////////////////////////////////////

    function format(msg) {

        let card = msg.data;
        let step = card.step;
        let kind = step.kind;

        let r_id = card.runtime_id;
        let s_id = card.step_id;

        // console.log('format', JSON.stringify(card));

        if (kind == "Init") {

        } else if (kind == "Inference") {
            return format_inference(msg, r_id, s_id);
        } else if (kind == "Findall") {
            return format_findall(msg, r_id, s_id);
        } else if (kind == "Cut") {
            return format_cut(msg, r_id, s_id);
        } else if (kind == "Suspend") {
            return format_suspend(msg, r_id, s_id);
        } else if (kind == "Resume") {
            return format_resume(msg, r_id, s_id);
        } else if (kind == "CHR") {
            return format_CHR(msg, r_id, s_id);
        } else {
            console.error('format', 'Unknown step kind', kind);
        }

        return '<br/>Contents for ' + kind.toUpperCase() + ' card kind go here';
    }

    function format_inference(msg, r_id, s_id) {

        let card = msg.data;
        let step = card.step;
        let status = card.color.kind;

        // console.log('format_inference', JSON.stringify(card));

        let contents = "<hr/>";

        contents += format_failed_attempts(step.value.failed_attempts, r_id, s_id);
        contents += format_successful_attempts(step.value.successful_attempts, r_id, s_id);
        if (status.includes("Yellow") && card.step.kind == "Inference")
        {
            contents += format_more_successful_attempts(msg.data, window.trace, r_id, s_id);
        }
        contents += format_stack(step.value.stack, r_id, s_id);

        return contents;
    }

    function format_findall(msg, r_id, s_id) {

        let card = msg.data;
        let step = card.step;

        // console.log('format_findall', JSON.stringify(card));

        let contents = "<hr/>";

        contents += `
<article class="panel">
  <div class="panel-heading">
    Solution
  </div>
  <div class="panel-block">
${step.value.findall_solution_text}
  </div>
  <div class="panel-element panel-element-footer"></div>
</article>
<br/>
`;

        contents += format_stack(step.value.findall_stack, r_id, s_id);

        return contents;
    }

    function format_cut(msg, r_id, s_id) {

        let card = msg.data;
        let step = card.step;

        // console.log('format_cut', JSON.stringify(card));

        let contents = "<hr/>";

        for(var i = 0; i < step.value.cut_victims.length; i++) {

            let element = {
                "kind": "UserRule",
                "value": step.value.cut_victims[i].cut_branch
            };

// /////////////////////////////////////////////////////////////////////////////
//
// /////////////////////////////////////////////////////////////////////////////

            let ds = ids_for_rt_gl(r_id, step.value.cut_victims[i].cut_branch_for_goal.goal_id)[0];

// /////////////////////////////////////////////////////////////////////////////

            contents += `
<article class="panel">
    <div class="panel-heading">
        Cut branch for <span onclick="inboxVue.jump(${ds});" class="has-tooltip-arrow has-tooltip-bottom" data-tooltip="Goal ID: ${step.value.cut_victims[i].cut_branch_for_goal.goal_id} - (${window.inbox[ds].rt}, ${window.inbox[ds].id})`;
	    contents += '\n\n' + step.value.cut_victims[i].cut_branch_for_goal.goal_text.replace(/['"]+/g, '');
	    contents += `">
          ${elide(20, step.value.cut_victims[i].cut_branch_for_goal.goal_text)}
        </span>
    </div>

    <div>
`;

            contents += format_rule(element, r_id, s_id);
            contents += `
    </div>
    <div class="panel-element panel-element-footer"></div>
</article>
`;
        }

        return contents;
    }

    function format_suspend(msg, r_id, s_id) {

        let card = msg.data;
        let step = card.step;

        // console.log('format_suspend', JSON.stringify(card));

        let rule_id = r_id + '-' + s_id + '-' + 'sus' + '-' + window.rnb++;

        let ds = ids_for_rt_gl(r_id, step.value.suspend_sibling.goal_id)[0];

        let contents = "<hr/>";

        contents += `
<article class="panel">
  <div class="panel-heading">
    Sibling
  </div>
  <div>

    <div class="panel-element">
       <span style="float: right;" class="tag tag-spaced">
          <a href="#${rule_id}" data-action="collapse" class="no_jump_hack">
             <span class="mdi mdi-lambda" aria-hidden="true"></span>
          </a>
      </span>
      <span onclick="inboxVue.jump(${ds});" class="has-tooltip-arrow has-tooltip-bottom" data-tooltip="Goal ID: ${step.value.suspend_sibling.goal_id} - - (${window.inbox[ds].rt}, ${window.inbox[ds].id})">
        ${elide(20, step.value.suspend_sibling.goal_text)}
      </span>
    </div>
    <div id="${rule_id}" class="is-collapsible rule-inline">
       ${step.value.suspend_sibling.goal_text}
    </div>
  </div>
  <div class="panel-element panel-element-footer"></div>
</article>
<br/>
`;

        vscode.postMessage({
            command: 'highlight_inline',
            id: rule_id,
            value: step.value.suspend_sibling.goal_text
        });

        contents += format_stack(step.value.suspend_stack, r_id, s_id);

        return contents;
    }

    function format_resume(msg, r_id, s_id) {

        let card = msg.data;
        let step = card.step;

        // console.log('format_resume', JSON.stringify(card));

        let contents = "<hr/>";

        contents += `
<article class="panel">
  <div class="panel-heading">
    Resumed goals (${step.value.length})
  </div>
  <div>
`;

        for(var i = 0; i < step.value.length; i++) {

            let rule_id = r_id + '-' + s_id + '-' + 'res' + '-' + window.rnb++;

            let ds = ids_for_rt_gl(r_id, step.value[i].goal_id)[0];

            contents += `
    <div class="panel-element">
      <span style="float: right;" class="tag tag-spaced">
          <a href="#${rule_id}" data-action="collapse" class="no_jump_hack">
             <span class="mdi mdi-lambda" aria-hidden="true"></span>
          </a>
      </span>
      <span onclick="inboxVue.jump(${ds});" class="has-tooltip-arrow has-tooltip-bottom" data-tooltip="Goal ID: ${step.value[i].goal_id} - (${window.inbox[ds].rt}, ${window.inbox[ds].id})">
        ${elide(20, step.value[i].goal_text)}
      </span>
    </div>
    <div id="${rule_id}" class="is-collapsible rule-inline">
       ${step.value[i].goal_text}
    </div>
`;

            vscode.postMessage({
                command: 'highlight_inline',
                id: rule_id,
                value: step.value[i].goal_text
            });

        }

      contents += `
  </div>
  <div class="panel-element panel-element-footer"></div>
</article>
<br/>
`;

        return contents;
    }

    function format_CHR(msg, r_id, s_id) {
        let card = msg.data;
        let step = card.step;

        // console.log('format_CHR', JSON.stringify(card));

        let contents = "<hr/>";

        contents += format_chr_failed_attempts(step.value.chr_failed_attempts, r_id, s_id);
        contents += format_chr_successful_attempts(step.value.chr_successful_attempts, r_id, s_id);
        contents += format_chr_store_before(step.value.chr_store_before, r_id, s_id);
        contents += format_chr_store_after(step.value.chr_store_after, r_id, s_id);

        return contents;
    }

    function format_findall(msg, r_id, s_id) {

        let card = msg.data;
        let step = card.step;

        // console.log('format_findall', JSON.stringify(card));

        let contents = "<hr/>";

        contents += `
<article class="panel">
  <div class="panel-heading">
    Solution
  </div>
  <div class="panel-block">
${step.value.findall_solution_text}
  </div>
  <div class="panel-element panel-element-footer"></div>
</article>
<br/>
`;

        contents += format_stack(step.value.findall_stack, r_id, s_id);

        return contents;
    }

// /////////////////////////////////////////////////////////////////////////////

    function format_failed_attempts(element, r_id, s_id)
    {
        // console.log('Formatting failed attempts', JSON.stringify(element));

        let contents = "";

        if(element == undefined)
            return contents;

        contents = `
<article class="panel is-danger">
    <div class="panel-heading">
        Failed attempts (${element.length})
        <span id="toggle_f" class="tag" style="float:right;">Toggle</span>
    </div>
    <div>
`;

        for(var i = 0; i < element.length; i++) {
            contents += format_rule(element[i].rule, r_id, s_id);
            contents += format_events(element[i].events, r_id, s_id);
        }

        contents += `
    </div>
    <div class="panel-element panel-element-footer"></div>
</article>
`;

        return contents;
    }

    function format_successful_attempts(element, r_id, s_id)
    {
        // console.log('Formatting successful attempts', JSON.stringify(element));

        let contents = "";

        if(element == undefined)
            return contents;

        contents = `
<article class="panel is-success">
    <div class="panel-heading">
        Successful attempts (${element.length})
        <span id="toggle_s" class="tag" style="float:right;">Toggle</span>
    </div>
    <div>
`;

        for(var i = 0; i < element.length; i++) {
            contents += format_rule(element[i].attempt.rule, r_id, s_id);
            contents += format_events(element[i].attempt.events, r_id, s_id);
            if (element[i].siblings.length)
            contents += '<div class="divider">Subgoals</div>';
            contents += format_siblings(element[i].siblings, r_id, s_id);
        }

        contents += `
    </div>
    <div class="panel-element panel-element-footer"></div>
</article>
`;

        return contents;
    }

    function format_more_successful_attempts(card, trace, r_id, s_id)
    {
        // console.log('Formatting more successful attempts', JSON.stringify(card.step.value.more_successful_attempts));

        let contents = "";

        if(card.step.value.more_successful_attempts == undefined)
            return contents;

        contents = `
<article class="panel is-success">
    <div class="panel-heading">
        More successful attempts (${card.step.value.more_successful_attempts.length})
        <span id="toggle_ms" class="tag" style="float:right;">Toggle</span>
    </div>
    <div>
`;

        let destinations = goal_status_label(card, trace, r_id);

        for(var i = 0; i < destinations.length; i++) {
            contents += `
    <div class="panel-element">
      <span onclick="inboxVue.jump(${destinations[i][2]});" class="has-tooltip-arrow has-tooltip-bottom" data-tooltip="Goal ID: ${destinations[i][1]}">
        ${destinations[i][0]}
      </span>
    </div>
`;
        }

        contents += `
    </div>
    <div class="panel-element panel-element-footer"></div>
</article>
`;

        return contents;
    }

    function format_chr_failed_attempts(element, r_id, s_id) {

        // console.log('Formatting CHR failed attempts', JSON.stringify(element));

        let contents = "";

        if(element == undefined)
            return contents;

        contents = `
<article class="panel is-danger">
    <div class="panel-heading">
        Failed attempts (${element.length})
        <span id="toggle_f" class="tag" style="float:right;">Toggle</span>
    </div>
    <div>
`;

        for(var i = 0; i < element.length; i++) {
            contents += format_chr_attempt(element[i], r_id, s_id);
        }

        contents += `
    </div>
    <div class="panel-element panel-element-footer"></div>
</article>
`;

        return contents;
    }

    function format_chr_successful_attempts(element, r_id, s_id)
    {
        // console.log('Formatting CHR successful attempts', JSON.stringify(element));

        let contents = "";

        if(element == undefined)
            return contents;

        contents = `
<article class="panel is-success">
    <div class="panel-heading">
        Successful attempts (${element.length})
        <span id="toggle_s" class="tag" style="float:right;">Toggle</span>
    </div>
    <div>
`;

        for(var i = 0; i < element.length; i++) {
            contents += format_chr_successful_attempt(element[i], r_id, s_id);
        }

        contents += `
    </div>
    <div class="panel-element panel-element-footer"></div>
</article>
`;

        return contents;
    }

    function format_stack(element, r_id, s_id)
    {
        // console.log('Formatting stack', JSON.stringify(element));

        let fmt = "";

        fmt = `
<article class="panel">
    <div class="panel-heading">
        Stack
        <span id="toggle_t" class="tag" style="float:right;">Toggle</span>
    </div>

    <div>
`;

        for(var i = 0; i < element.length; i++) {

            // fmt += '<div class="divider" onclick="inboxVue.jump('
            // + goal_id_for_step_and_runtime(element[i].step_id, element[i].runtime_id)
            // + ');">
            // <a>' + ' (' + element[i].runtime_id + '|' + element[i].step_id + ') ' /* + element[i].rule.value.rule_text */
            // + '</a></div>'

            let rr_id = element[i].runtime_id;
            let rs_id = element[i].step_id;
            let it_ids = ids_for_rt_st(rr_id, rs_id);

            // console.log('format_stack:', 'it_ids', '[' + it_ids.join(', ') + ']');

            fmt += format_rule(element[i].rule, rr_id, rs_id, window.gls[it_ids[0]]);

            // TODO: Display the destination card HERE as a tooltip
            //
            // ... Maybe using jquery tooltip ...
        }

        fmt += `
    </div>
    <div class="panel-element panel-element-footer"></div>
</article>
`;

        return fmt;
    }

    function format_rule(element, r_id, s_id, g_id)
    {
        // console.log('Formatting rule', JSON.stringify(element));

        const rule_type = element.kind;

        let rule_text = "";
        let rule_id = r_id + '-' + s_id + '-' + g_id + '-' + window.rnb++;

        if (rule_type == "UserRule")
            rule_text = element.value.rule_text;

        if (rule_type == "BuiltinRule")
            rule_text = element.value.kind + ' - ' + element.value.value;

        let fmt = `
<div class="panel-element">
`;

        if(element.value.rule_loc) {

            const rule_loc_type = element.value.rule_loc.kind;

            // console.log('Rule has a location of type', rule_loc_type);

            if (rule_loc_type == "File") {

                const rule_loc_file = element.value.rule_loc.value.filename;
                const rule_loc_line = element.value.rule_loc.value.line;
                const rule_loc_column = element.value.rule_loc.value.column;
                const rule_loc_character = element.value.rule_loc.value.character;

                fmt += `
    <span style="float: right;" class="tag"
onclick="inboxVue.hop('${rule_loc_file} (${rule_loc_character}@L${rule_loc_line}:C${rule_loc_column})')"
class="has-tooltip-arrow has-tooltip-bottom" data-tooltip="${rule_loc_file} (${rule_loc_character}@L${rule_loc_line}:C${rule_loc_column})">
      ${rule_loc_type} Location
    </span>
`;
            }

            if (rule_loc_type == "Context") {

                const rule_loc_ctx = element.value.rule_loc.value;

                fmt += `
    <span style="float: right;" class="tag" class="has-tooltip-arrow has-tooltip-bottom" data-tooltip="${rule_loc_ctx}">
      ${rule_loc_type} Location
    </span>
`;
            }
        }

        fmt += `<span style="float: right;" class="tag tag-spaced">${rule_type}</span>`;

        fmt += `<span style="float: right;" class="tag tag-spaced">
                   <a href="#${rule_id}" data-action="collapse" class="no_jump_hack">
                      <span class="mdi mdi-lambda" aria-hidden="true"></span>
                   </a>
                </span>`

        if (r_id != undefined && s_id != undefined && g_id != undefined && g_id != 'none') {
            let ds = ids_for_rt_st_gl(r_id, s_id, g_id)[0];

            fmt += `<span onclick="inboxVue.jump(${ds});" class="has-tooltip-arrow has-tooltip-bottom" data-tooltip="Goal ID: ${g_id} - (${r_id}|${s_id})">`;
        } else {
            fmt += `<span>`;
        }
            fmt += `
    ${elide(20, rule_text)}
  </span>

</div>
<div id="${rule_id}" class="is-collapsible rule-inline">
   ${rule_text}
</div>`;

        vscode.postMessage({
            command: 'highlight_inline',
            id: rule_id,
            value: rule_text
        });

        return fmt;
    }

    function format_events(element, r_id, s_id)
    {
        // console.log('Formatting event', JSON.stringify(element));

        let fmt = "";

        for(var i = 0; i < element.length; i++) {

            let rule_id = r_id + '-' + s_id + '-' + 'evt' + '-' + window.rnb++;

            fmt += `<div class="panel-element">
                       <span style="float: right;" class="tag">Event</span>
                       <span style="float: right;" class="tag tag-spaced">
                          <a href="#${rule_id}" data-action="collapse" class="no_jump_hack">
                             <span class="mdi mdi-lambda" aria-hidden="true"></span>
                          </a>
                       </span>
                       <span style="float: left; margin-right: 10px;" class="tag">
                          ${element[i].kind}
                       </span>
                       <span>
                         ${elide(20, element[i].value)}
                       </span>
                    </div>
                    <div id="${rule_id}" class="is-collapsible rule-inline">
                       ${element[i].value}
                    </div>`;
        
            vscode.postMessage({
                command: 'highlight_inline',
                id: rule_id,
                value: element[i].value
            });
        }

        return fmt;
    }

    function format_siblings(element, r_id, s_id) // TODO: HERE - Assuming that
    {
        console.log('Formating sibling', JSON.stringify(element));

        let fmt = "";

        for(var i = 0; i < element.length; i++) {

            // console.log('1', window.goal_to_index.get(element[i].goal_id));
            // console.log('2', window.inbox[window.goal_to_index.get(element[i].goal_id)]);

            let rule_id = r_id + '-' + s_id + '-' + 'sib' + '-' + window.rnb++;
            let  own_id = ids_for_rt_st(r_id, s_id);

            let idxes = ids_for_rt_gl_not(r_id, element[i].goal_id, own_id); // window.goal_to_index.get(element[i].goal_id)

            // console.log('3', idxes, r_id, element[i].goal_id, s_id);

            let index = idxes[0];
            let entry = index == undefined ? undefined : window.inbox[index];

            // console.log('4', entry);

            let ds = ids_for_rt_gl(r_id, element[i].goal_id)[0];

            if(entry != undefined) // e.g. source cut case
            {
                let card = entry.data;
                let status = card.color.kind.toLowerCase();

                fmt += `<div class="panel-element">
                          <span class="tag tag-${status}" style="float: right;">Sibling</span>
                          <span style="float: right;" class="tag tag-spaced">
                             <a href="#${rule_id}" data-action="collapse" class="no_jump_hack">
                                <span class="mdi mdi-lambda" aria-hidden="true"></span>
                             </a>
                          </span>
                          <span onclick="inboxVue.jump(${ds});" class="has-tooltip-arrow has-tooltip-bottom" data-tooltip="Goal ID: ${element[i].goal_id}">
                             ${elide(20, element[i].goal_text)}
                          </span>
                        </div>
                        <div id="${rule_id}" class="is-collapsible rule-inline">
                           ${element[i].goal_text}
                        </div>`;
            } else {

                fmt += `<div class="panel-element">
                          <span class="tag" style="float: right;">Sibling</span>
                          <span style="float: right;" class="tag tag-spaced">
                             <a href="#${rule_id}" data-action="collapse" class="no_jump_hack">
                                <span class="mdi mdi-lambda" aria-hidden="true"></span>
                             </a>
                          </span>
                          <span onclick="inboxVue.jump(${ds});" class="has-tooltip-arrow has-tooltip-bottom" data-tooltip="Goal ID: ${element[i].goal_id}">
                             ${elide(20, element[i].goal_text)}
                          </span>
                        </div>
                        <div id="${rule_id}" class="is-collapsible rule-inline">
                           ${element[i].goal_text}
                        </div>`;
            }

            vscode.postMessage({
                command: 'highlight_inline',
                id: rule_id,
                value: element[i].goal_text
            });
        }

        return fmt;
    }

    function format_chr_attempt(element, r_id, s_id) {

        // console.log('Formatting CHR attempt', JSON.stringify(element));

        let rule_id = r_id + '-' + s_id + '-' + 'cha' + '-' + window.rnb++;

        let attempt_text = element.chr_text;

        let fmt = `
<div class="panel-element">
`;

        const attempt_loc_file = element.chr_loc.filename;
        const attempt_loc_line = element.chr_loc.line;
        const attempt_loc_column = element.chr_loc.column;
        const attempt_loc_character = element.chr_loc.character;

        fmt += `
    <span style="float: right;" class="tag"
onclick="inboxVue.hop('${attempt_loc_file} (${attempt_loc_character}@L${attempt_loc_line}:C${attempt_loc_column})')"
class="has-tooltip-arrow has-tooltip-bottom" data-tooltip="${attempt_loc_file} (${attempt_loc_character}@L${attempt_loc_line}:C${attempt_loc_column})">
      File Location
    </span>
    <span style="float: right;" class="tag tag-spaced">
    <a href="#${rule_id}" data-action="collapse" class="no_jump_hack">
       <span class="mdi mdi-lambda" aria-hidden="true"></span>
    </a>
</span>
`;

        fmt += `
    <span>${elide(20, attempt_text)}</span>
</div>
<div id="${rule_id}" class="is-collapsible rule-inline">
   ${attempt_text}
</div>`;

        vscode.postMessage({
            command: 'highlight_inline',
            id: rule_id,
            value: attempt_text
        });

        return fmt;
    }

    function format_chr_successful_attempt(element, r_id, s_id) {

        // console.log('Formatting CHR SUCCESSFUL attempt', JSON.stringify(element));

        let fmt = format_chr_attempt(element.chr_attempt, r_id, s_id);

        fmt += '<div class="divider">Removed goals</div>';

        for(var i = 0; i < element.chr_removed_goals.length; i++) {

            let ds = ids_for_rt_gl(r_id, element.chr_removed_goals[i])[0];

            fmt += `
    <div class="panel-element">
      <span onclick="inboxVue.jump(${ds});" class="has-tooltip-arrow has-tooltip-bottom" data-tooltip="Goal ID: ${element.chr_removed_goals[i]}">
        ${element.chr_removed_goals[i]}
      </span>
    </div>
`;
        }

        fmt += '<div class="divider">New goals</div>';

        for(var i = 0; i < element.chr_new_goals.length; i++) {

            let rule_id = r_id + '-' + s_id + '-' + 'csa' + '-' + window.rnb++;

            let ds = ids_for_rt_gl(r_id, element.chr_new_goals[i].goal_id)[0];

            fmt += `
    <div class="panel-element">
       <span style="float: right;" class="tag tag-spaced">
          <a href="#${rule_id}" data-action="collapse" class="no_jump_hack">
             <span class="mdi mdi-lambda" aria-hidden="true"></span>
          </a>
      </span>
      <span onclick="inboxVue.jump(${ds});" class="has-tooltip-arrow has-tooltip-bottom" data-tooltip="Goal ID: ${element.chr_new_goals[i].goal_id}">
        ${elide(20, element.chr_new_goals[i].goal_text)}
      </span>
    </div>
    <div id="${rule_id}" class="is-collapsible rule-inline">
       ${element.chr_new_goals[i].goal_text}
    </div>
`;

            vscode.postMessage({
                command: 'highlight_inline',
                id: rule_id,
                value: element.chr_new_goals[i].goal_text
            });
        }

        return fmt;
    }

    function format_chr_store_before(element, r_id, s_id) {

        // console.log('Formatting CHR store before', JSON.stringify(element));

        let fmt = `
<article class="panel">
    <div class="panel-heading">
        Store before (${element.length})
        <span id="toggle_stb" class="tag" style="float:right;">Toggle</span>
    </div>

    <div>
`;

        for(var i = 0; i < element.length; i++) {

            let rule_id = r_id + '-' + s_id + '-' + 'cstb' + '-' + window.rnb++;

            let ds = ids_for_rt_gl(r_id, element[i].goal_id)[0];

            fmt += `
    <div class="panel-element">
       <span style="float: right;" class="tag tag-spaced">
          <a href="#${rule_id}" data-action="collapse" class="no_jump_hack">
             <span class="mdi mdi-lambda" aria-hidden="true"></span>
          </a>
       </span>
      <span onclick="inboxVue.jump(${ds});" class="has-tooltip-arrow has-tooltip-bottom" data-tooltip="Goal ID: ${element[i].goal_id}">
        ${elide(20, element[i].goal_text)}
      </span>
    </div>
    <div id="${rule_id}" class="is-collapsible rule-inline">
       ${element[i].goal_text}
    </div>
`;

            vscode.postMessage({
                command: 'highlight_inline',
                id: rule_id,
                value: element[i].goal_text
            });
        }

        fmt += `
    </div>
    
    <div class="panel-element panel-element-footer"></div>
</article>
`;

        return fmt;
    }

    function format_chr_store_after(element, r_id, s_id) {

        // console.log('Formatting CHR store qfter', JSON.stringify(element));

        let fmt = `
<article class="panel">
    <div class="panel-heading">
        Store after (${element.length})
        <span id="toggle_sta" class="tag" style="float:right;">Toggle</span>
    </div>

    <div>
`;

        for(var i = 0; i < element.length; i++) {

            let rule_id = r_id + '-' + s_id + '-' + 'csta' + '-' + window.rnb++;

            let ds = ids_for_rt_gl(r_id, element[i].goal_id)[0];

            fmt += `
    <div class="panel-element">
      <span style="float: right;" class="tag tag-spaced">
         <a href="#${rule_id}" data-action="collapse" class="no_jump_hack">
            <span class="mdi mdi-lambda" aria-hidden="true"></span>
         </a>
      </span>
      <span onclick="inboxVue.jump(${ds});" class="has-tooltip-arrow has-tooltip-bottom" data-tooltip="Goal ID: ${element[i].goal_id}">
        ${elide(20, element[i].goal_text)}
      </span>
    </div>
    <div id="${rule_id}" class="is-collapsible rule-inline">
       ${element[i].goal_text}
    </div>
`;

            vscode.postMessage({
                command: 'highlight_inline',
                id: rule_id,
                value: element[i].goal_text
            });
        }

        fmt += `
    </div>
    <div class="panel-element panel-element-footer"></div>
</article>
`;

        return fmt;
    }

// /////////////////////////////////////////////////////////////////////////////
//
// /////////////////////////////////////////////////////////////////////////////

    function update_watcher_state(status) {

        if(status == 'off') {
            $("#watcher_state").removeClass("mdi-eye");
            $("#watcher_state").addClass("mdi-eye-off");
        } else {
            $("#watcher_state").removeClass("mdi-eye-off");
            $("#watcher_state").addClass("mdi-eye");
        }
    }

    // /////////////////////////////////////////////////////////////////////////////

    function clear() {

        if (window.inboxVue !== undefined && window.inboxCount !== undefined) {
            window.inboxVue.clear();
            window.inboxVue.clear_navigation();
            
            $("#filter").val(''); filter('');
            $("#trace-information").val("");
        }
    }

// /////////////////////////////////////////////////////////////////////////////
// Main entry point
// /////////////////////////////////////////////////////////////////////////////

    function trace(data) {

        // console.log('Tracing ...');

        window.trace = data;
        window.inbox = {};

// /////////////////////////////////////////////////////////////////////////////
// NOTE: Refactoring goal mapping
// /////////////////////////////////////////////////////////////////////////////

        // window.goal_to_index = new Map();

        window.rts = [];
        window.sts = [];
        window.gls = [];
        window.rnb = 0;
        
// /////////////////////////////////////////////////////////////////////////////

        window.goal_navigation_stack = new Array();
        window.goal_navigation_index = -1;
        window.current_rt = -1;
        window.current_id = -1;

// /////////////////////////////////////////////////////////////////////////////

        window.popCount = 0;

// /////////////////////////////////////////////////////////////////////////////
// NOTE: Here: intertweening findall cards
// /////////////////////////////////////////////////////////////////////////////

        let parseSubRuns = (window, data, i, c, from) => {

// /////////////////////////////////////////////////////////////////////////////
// NOTE: FindALL Case
// /////////////////////////////////////////////////////////////////////////////

            // console.log('parseSubRuns', 'for', JSON.stringify(window.inbox[from]));

            if (window.inbox[from].kind == "Findall") {

                // console.log('Parsing subcards for', data[i].step);

                for (var j = 0; j < data[i].step.value.findall_cards.length; j++) {

                    if (j == 0) {
                        window.inbox[from].rt_sub.push(data[i].step.value.findall_cards[j].runtime_id);

                        if (window.inbox[from].rt_sub.length > 1) {
                            window.inbox[c - 1].card_class = "card-indented-last";
                        }
                    }

                    if (goal_kind(data[i].step.value.findall_cards[j].step) == "Init")
                        continue;

                    // console.log('Parsing subcard', data[i].step.value.findall_cards[j]);

                    window.inbox[c] = {
                        id: data[i].step.value.findall_cards[j].step_id,
                        rt: data[i].step.value.findall_cards[j].runtime_id,
                        rt_sub: [],
                        data: data[i].step.value.findall_cards[j],
                        kind: goal_kind(data[i].step.value.findall_cards[j].step),
                        goal_id: goal_id(data[i].step.value.findall_cards[j].step),
                        goal_text: goal_text(data[i].step.value.findall_cards[j].step),
                        goal_text_elided: '',
                        goal_text_highlighted: '',
                        goal_text_highlighted_elided: '',
                        goal_predicate: goal_predicate(data[i].step.value.findall_cards[j].step),
                        status: goal_status(data[i].step.value.findall_cards[j]),
                        // status_label: goal_status_label(data[i].step.value.findall_cards[j], data, data[i].step.value.findall_cards[j].runtime_id),
                        card_class: "card-indented",
                        card_index: c,
                        footer: goal_footer(data[i].step.value.findall_cards[j]),
                        timestamp: null,
                    };

                    map_rt(c, window.inbox[c].rt);
                    map_st(c, window.inbox[c].id);
                    map_gl(c, window.inbox[c].goal_id);

                    // if(!window.goal_to_index.has(window.inbox[c].goal_id))
                    //     window.goal_to_index.set(window.inbox[c].goal_id, c);

                    // console.log('MAP: Goal ID', window.inbox[c].goal_id, '->', c);

                    c++; // Ok, that is nerdy

                    c = parseSubRuns(window, data, i, c, c - 1);
                }
            }

// /////////////////////////////////////////////////////////////////////////////
// NOTE: CHR Case
// /////////////////////////////////////////////////////////////////////////////

            if (window.inbox[from].kind == "CHR") {

                // console.log('Parsing subcards for', JSON.stringify(data[i].step));

                for (j = 0; j < data[i].step.value.chr_failed_attempts.length; j++) {

                    // console.log('Parsing CHR FAILED subcard', data[i].step.value.chr_failed_attempts[j].chr_condition_cards);

                    for (var k = 0; k < data[i].step.value.chr_failed_attempts[j].chr_condition_cards.length; k++) {

                        // console.log('Parsing subcard', data[i].step.value.chr_failed_attempts[j].chr_condition_cards[k]);

                        if (k == 0) {
                            window.inbox[from].rt_sub.push(data[i].step.value.chr_failed_attempts[j].chr_condition_cards[k].runtime_id);

                            if (window.inbox[from].rt_sub.length > 1) {
                                window.inbox[c - 1].card_class = "card-indented-last";
                            }
                        }

                        if (goal_kind(data[i].step.value.chr_failed_attempts[j].chr_condition_cards[k].step) == "Init")
                            continue;

                        window.inbox[c] = {
                            id: data[i].step.value.chr_failed_attempts[j].chr_condition_cards[k].step_id,
                            rt: data[i].step.value.chr_failed_attempts[j].chr_condition_cards[k].runtime_id,
                            rt_sub: [],
                            data: data[i].step.value.chr_failed_attempts[j].chr_condition_cards[k],
                            kind: goal_kind(data[i].step.value.chr_failed_attempts[j].chr_condition_cards[k].step),
                            goal_id: goal_id(data[i].step.value.chr_failed_attempts[j].chr_condition_cards[k].step),
                            goal_text: goal_text(data[i].step.value.chr_failed_attempts[j].chr_condition_cards[k].step),
                            goal_text_elided: '',
                            goal_text_highlighted: '',
                            goal_text_highlighted_elided: '',
                            goal_predicate: goal_predicate(data[i].step.value.chr_failed_attempts[j].chr_condition_cards[k].step),
                            status: goal_status(data[i].step.value.chr_failed_attempts[j].chr_condition_cards[k]),
                            // status_label: goal_status_label(data[i].step.value.chr_failed_attempts[j].chr_condition_cards[k], data, data[i].step.value.chr_failed_attempts[j].chr_condition_cards[k].runtime_id),
                            card_class: "card-indented",
                            card_index: c,
                            footer: goal_footer(data[i].step.value.chr_failed_attempts[j].chr_condition_cards[k]),
                            timestamp: null,
                        };

                        map_rt(c, window.inbox[c].rt);
                        map_st(c, window.inbox[c].id);
                        map_gl(c, window.inbox[c].goal_id);

                        // if(!window.goal_to_index.has(window.inbox[c].goal_id))
                        //     window.goal_to_index.set(window.inbox[c].goal_id, c);

                        // console.log('MAP: Goal ID', window.inbox[c].goal_id, '->', c);

                        c++; // Ok, that is nerdy

                        c = parseSubRuns(window, data, i, c, c - 1);
                    }
                }

                for (j = 0; j < data[i].step.value.chr_successful_attempts.length; j++) {

                    // console.log('Parsing CHR SUCCESSFUL subcard', data[i].step.value.chr_successful_attempts[j].chr_attempt.chr_condition_cards);

                    for (k = 0; k < data[i].step.value.chr_successful_attempts[j].chr_attempt.chr_condition_cards.length; k++) {

                        if (k == 0) {
                            window.inbox[from].rt_sub.push(data[i].step.value.chr_successful_attempts[j].chr_attempt.chr_condition_cards[k].runtime_id);

                            if (window.inbox[from].rt_sub.length > 1) {
                                window.inbox[c - 1].card_class = "card-indented-last";
                            }
                        }

                        if (goal_kind(data[i].step.value.chr_successful_attempts[j].chr_attempt.chr_condition_cards[k].step) == "Init")
                            continue;

                        // console.log('Parsing subcard', data[i].step.value.chr_successful_attempts[j].chr_attempt.chr_condition_cards[k]);

                        window.inbox[c] = {
                            id: data[i].step.value.chr_successful_attempts[j].chr_attempt.chr_condition_cards[k].step_id,
                            rt: data[i].step.value.chr_successful_attempts[j].chr_attempt.chr_condition_cards[k].runtime_id,
                            rt_sub: [],
                            data: data[i].step.value.chr_successful_attempts[j].chr_attempt.chr_condition_cards[k],
                            kind: goal_kind(data[i].step.value.chr_successful_attempts[j].chr_attempt.chr_condition_cards[k].step),
                            goal_id: goal_id(data[i].step.value.chr_successful_attempts[j].chr_attempt.chr_condition_cards[k].step),
                            goal_text: goal_text(data[i].step.value.chr_successful_attempts[j].chr_attempt.chr_condition_cards[k].step),
                            goal_text_elided: '',
                            goal_text_highlighted: '',
                            goal_text_highlighted_elided: '',
                            goal_predicate: goal_predicate(data[i].step.value.chr_successful_attempts[j].chr_attempt.chr_condition_cards[k].step),
                            status: goal_status(data[i].step.value.chr_successful_attempts[j].chr_attempt.chr_condition_cards[k]),
                            // status_label: goal_status_label(data[i].step.value.chr_successful_attempts[j].chr_attempt.chr_condition_cards[k], data, data[i].step.value.chr_successful_attempts[j].chr_attempt.chr_condition_cards[k].runtime_id),
                            card_class: "card-indented",
                            card_index: c,
                            footer: goal_footer(data[i].step.value.chr_successful_attempts[j].chr_attempt.chr_condition_cards[k]),
                            timestamp: null,
                        };

                        map_rt(c, window.inbox[c].rt);
                        map_st(c, window.inbox[c].id);
                        map_gl(c, window.inbox[c].goal_id);

                        // if(!window.goal_to_index.has(window.inbox[c].goal_id))
                        //     window.goal_to_index.set(window.inbox[c].goal_id, c);

                        // console.log('MAP: Goal ID', window.inbox[c].goal_id, '->', c);

                        c++; // Ok, that is nerdy

                        c = parseSubRuns(window, data, i, c, c - 1);
                    }
                }
            }

// /////////////////////////////////////////////////////////////////////////////

            return c;
        };

        let c = 0;

        for (var i = 0; i < data.length; i++) {

            // console.log('---------------------');
            // console.log(JSON.stringify(data[i]));

            if (goal_kind(data[i].step) == "Init") continue;

            window.inbox[c] = {
                id: data[i].step_id,
                rt: data[i].runtime_id,
                rt_sub: [],
                data: data[i],
                kind: goal_kind(data[i].step),
                goal_id: goal_id(data[i].step),
                goal_text: goal_text(data[i].step),
                goal_text_elided: '',
                goal_text_highlighted: '',
                goal_text_highlighted_elided: '',
                goal_predicate: goal_predicate(data[i].step),
                status: goal_status(data[i]),
                // status_label: goal_status_label(data[i], data, data[i].runtime_id),
                card_class: "card",
                card_index: c,
                footer: goal_footer(data[i]),
                timestamp: null,
            };

            map_rt(c, window.inbox[c].rt);
            map_st(c, window.inbox[c].id);
            map_gl(c, window.inbox[c].goal_id);

            // if(!window.goal_to_index.has(window.inbox[c].goal_id))
            //     window.goal_to_index.set(window.inbox[c].goal_id, c);

            // console.log('MAP: Goal ID', window.inbox[c].goal_id, '->', c);

            c++; // Ok, that is nerdy

            c = parseSubRuns(window, data, i, c, c - 1);
        }

        window.inboxCount = c;

        for (var i = 0; i < c; i++) {
        
            window.inbox[i].status_label = goal_status_label(window.inbox[i].data, data, window.inbox[i].rt);
        
// /////////////////////////////////////////////////////////////////////////////
// Syntax highlighting
// /////////////////////////////////////////////////////////////////////////////

            window.inbox[i].goal_text_elided = elide(25, window.inbox[i].goal_text);

            vscode.postMessage({
                command: 'highlight',
                index: i,
                value: window.inbox[i].goal_text
            });

            vscode.postMessage({
                command: 'highlight_elided',
                index: i,
                value: window.inbox[i].goal_text_elided
            });

// /////////////////////////////////////////////////////////////////////////////
        }

// /////////////////////////////////////////////////////////////////////////////

        $('#message-feed').removeClass('is-hidden');

        if (window.inboxVue !== undefined) {
            window.inboxVue.messages = window.inbox;
            window.inboxVue.stack = window.goal_navigation_stack;

            for(var i = 0; i < window.inboxCount; i++)
                $('#msg-card-' + i).removeClass('active');

            return;
        }

        window.inboxVue = new Vue({
            el: '#tracer',
            data: {
                messages: window.inbox,
                stack: window.goal_navigation_stack,
            },
            updated: () => {

                return;

                if(window.popCount == window.inboxCount)
                    return;

                for (var i = 0; i < window.inboxCount; i++, window.popCount++) {
                    const pop = document.querySelector('#popcard-'+i);
                    const tot = document.querySelector('#popttip-'+i);
                    
                    console.log('Creating popper for', i, pop, top);
                    
                    const popperInstance = Popper.createPopper(pop, tot, {
                        placement: 'bottom',
                        modifiers: [{
                            name: 'offset',
                            options: {
                                offset: [0, 8],
                            },
                        }],
                    });
                    
                    function show() {
                        // Make the tooltip visible
                        tot.setAttribute('data-show', '');
                        
                        // Enable the event listeners
                        popperInstance.setOptions((options) => ({
                            ...options,
                            modifiers: [
                                ...options.modifiers,
                                { name: 'eventListeners', enabled: true },
                            ],
                        }));
                        
                        // Update its position
                        popperInstance.update();
                    }
                    
                    function hide() {
                        // Hide the tooltip
                        tot.removeAttribute('data-show');
                        
                        // Disable the event listeners
                        popperInstance.setOptions((options) => ({
                            ...options,
                            modifiers: [
                                ...options.modifiers,
                                { name: 'eventListeners', enabled: false },
                            ],
                        }));
                    }
                    
                    const showEvents = ['mouseenter', 'focus'];
                    const hideEvents = ['mouseleave', 'blur'];
                    
                    showEvents.forEach((event) => {
                        pop.addEventListener(event, show);
                    });
                    
                    hideEvents.forEach((event) => {
                        pop.addEventListener(event, hide);
                    });
                }
            },
            methods: {

                toggleSubCards: function(runtime_ids) {

                    // console.log('Toggling subcards for runtimes', runtime_ids);

                    for(var i = 0; i < window.inboxCount; i++) {

                        for(var r = 0; r < runtime_ids.length; r++) {

                            // console.log('Testing card of index', window.inbox[i].card_index, "of runtime id", window.inbox[i].rt, "with", runtime_ids[r]);

                            if(window.inbox[i].rt == runtime_ids[r]) {

                                // console.log('Toggling card of index', window.inbox[i].card_index);

                                if ($('#msg-card-' + window.inbox[i].card_index).hasClass("hidden"))
                                    $('#msg-card-' + window.inbox[i].card_index).removeClass("hidden")
                                else
                                    $('#msg-card-' + window.inbox[i].card_index).addClass("hidden")
                            }
                        }
                    }
                },
                showMessage: function(msg, index) {

                    // console.log('Try & show message', window.switch_anyways, msg.rt, window.current_rt, msg.id, window.current_id);
                    // console.log('Try & show message', JSON.stringify(msg));

                    if(!window.switch_anyways && msg.rt == window.current_rt && msg.id == window.current_id)
                        return;

                    window.current_rt = msg.rt;
                    window.current_id = msg.id;

                    // console.log('Showing', msg, index);

                    $('#message-pane').removeClass('is-hidden');
                    $('.card').removeClass('active');
                    $('.card-indented').removeClass('active');
                    $('.card-indented-last').removeClass('active');
                    $('#msg-card-' + index).addClass('active');

                    let code = `
<div onclick="window.inboxVue.set_snippet(${index});">
`;
                    code += msg.goal_text_highlighted_elided;
                    code += `
</div>
`;
                    $('.message .goal').html(code);
		    
                    // $('.message .goal').html(msg.goal_text_highlighted);

                    $('.message .goal_id').html(msg.goal_id);

                    $('.message .top .tags .rid').text(msg.rt);
                    $('.message .top .tags .sid').text(msg.id);

// /////////////////////////////////////////////////////////////////////////////
// TODO: Card pane refactoring entry point
// /////////////////////////////////////////////////////////////////////////////

                    $('.message .card_content').html(format(msg));

// /////////////////////////////////////////////////////////////////////////////

                    // /////////////////////////////////////////////////////////////////////////////
                    // NOTE: Handling the navigation stack
                    // /////////////////////////////////////////////////////////////////////////////

                    // console.log('NAV: Length', window.goal_navigation_stack.length);
                    // console.log('NAV: Current', window.goal_navigation_index);
                    
                    if(window.prevent_nav_handling == false) {

                        // console.log('NAV: Pushing', msg.goal_id);

                        if (window.goal_navigation_stack.length > window.goal_navigation_index) {

                            // console.log('NAV: Adjusting');

                            while (window.goal_navigation_stack.length > window.goal_navigation_index + 1)
                                window.inboxVue.$delete(window.inboxVue.stack, window.goal_navigation_stack.pop());
                        }

                        window.goal_navigation_index = window.goal_navigation_index + 1;
                        window.goal_navigation_stack.push({
                            goal: msg.goal_id,
                            rt: msg.rt,
                            id: msg.id,
                            active: "",
                            msg: msg,
                            index: index
                        });

                        $("#nav_clear").removeClass('is-hidden');
                    }

                    if (window.goal_navigation_stack.length > 1)
                        $("#back_b").removeClass('inactive');

                    if (window.goal_navigation_index == 0)
                        $("#back_b").addClass('inactive');

                    if (window.goal_navigation_index < window.goal_navigation_stack.length - 1)
                        $("#forw_b").removeClass('inactive');
                    else
                        $("#forw_b").addClass('inactive');
                    
                    // console.log('showMessage: NAV STACK STATE', window.goal_navigation_stack, '(' + window.goal_navigation_index + ')');

                    for(var i = 0; i < window.goal_navigation_stack.length; i++) {
                        window.goal_navigation_stack[i].active = "";
                    }

                    window.goal_navigation_stack[window.goal_navigation_index].active = "active";
                    window.switch_anyways = false;

                    // /////////////////////////////////////////////////////////////////////////////
                    // Toggling
                    // /////////////////////////////////////////////////////////////////////////////

                    $("#toggle_f").on('click', (e) => {
                        e.currentTarget.parentElement.parentElement.childNodes[3].classList.toggle('is-hidden');
                    });
                    $("#toggle_s").on('click', (e) => {
                        e.currentTarget.parentElement.parentElement.childNodes[3].classList.toggle('is-hidden');
                    });
                    $("#toggle_t").on('click', (e) => {
                        e.currentTarget.parentElement.parentElement.childNodes[3].classList.toggle('is-hidden');
                    });
                    $("#toggle_ms").on('click', (e) => {
                        e.currentTarget.parentElement.parentElement.childNodes[3].classList.toggle('is-hidden');
                    });
                    $("#toggle_stb").on('click', (e) => {
                        e.currentTarget.parentElement.parentElement.childNodes[3].classList.toggle('is-hidden');
                    });
                    $("#toggle_sta").on('click', (e) => {
                        e.currentTarget.parentElement.parentElement.childNodes[3].classList.toggle('is-hidden');
                    });

                    accordions = bulmaCollapsible.attach('.is-collapsible');

                    $('.no_jump_hack').click(function(e)
                    {
                        e.preventDefault();
                        
                        return false;
                    });
                },
                clear: function() {

                    for(var i = 0; i < window.inboxCount; i++) {
                        // console.log('Deleting card', i);
                        window.inboxVue.$delete(window.inboxVue.messages, i);
                    }

                    for(var i = 0; i < window.goal_navigation_stack.length; i++) {
                        // console.log('Deleting card', i);
                        window.inboxVue.$delete(window.inboxVue.stack, i);
                    }

                    $('#message-pane').addClass('is-hidden');

                    window.inboxCount = 0;
                },
                clear_navigation: function() {
                    window.goal_navigation_index = -1;

                    while(window.goal_navigation_stack.length > 0)
                        window.goal_navigation_stack.pop();
        
                    $("#back_b").addClass('inactive');
                    $("#forw_b").addClass('inactive');

                    $("#nav_clear").addClass('is-hidden');
                },
                set_snippet: (index) => {

                    console.log('Setting snippet for index', index);
            
                    $("#snippet").html(window.inbox[index].goal_text_highlighted);
                    
                    console.log(quickviews);
                    console.log(quickviews[0]);
                    
                    quickviews[0].quickview.classList.toggle('is-active');
                    quickviews[0].emit('quickview:toggle', {
                          element: quickviews[0].element,
                        quickview: quickviews[0].quickview,
                    });
                },
                hop: function(destination) {
                    vscode.postMessage({
                        command: 'hopTo',
                        value: destination
                    });
                },
                jump: function(index) {

                    // if(goal == 'none') {
                    //     vscode.postMessage({
                    //         command: 'notify',
                    //         value: 'There is no such goal to jump to: ' + goal
                    //     });
                    //     return;
                    // }

                    $("#filter").val(''); filter('');

                    // console.log('jumping to', index);

                    // const index = window.goal_to_index.get(goal);

                    // console.log('got index', index, 'for goal', goal);

                    if (index !== undefined) {
                        window.inboxVue.showMessage(window.inbox[index], index);

                        scrollTo(index);

                    } // else {
                    //     vscode.postMessage({
                    //         command: 'notify',
                    //         value: 'There is no such goal to jump to: ' + goal
                    //     });
                    // }
                },
                switchTo: function(index) {

                    // console.log('Switching to', index);
                    
                    $("#filter").val(''); filter('');

                    window.goal_navigation_index = index;

                    var destination = window.goal_navigation_stack[window.goal_navigation_index];

                    window.prevent_nav_handling = true;
                    window.switch_anyways = true;

                    window.inboxVue.showMessage(destination.msg, destination.index);

                    scrollTo(index);

                    window.prevent_nav_handling = false;
                }
            }
        });
    }

    // /////////////////////////////////////////////////////////////////////////////
    // Initial display
    // /////////////////////////////////////////////////////////////////////////////

    trace({});

    window.prevent_nav_handling = false;
    window.switch_anyways = true;
    window.filter_type = "goal";

    // /////////////////////////////////////////////////////////////////////////////
    // Filtering
    // /////////////////////////////////////////////////////////////////////////////

    $("#filter").on("change", function() { // use the "input" event for filtering on each keystroke instead
        filter($(this).val());
    });
    
    $("#back_b").on("click", function() {
        back();
    });
    
    $("#forw_b").on("click", function() {
        forw();
    });

    // /////////////////////////////////////////////////////////////////////////////
    // Filtering section
    // /////////////////////////////////////////////////////////////////////////////

    $('.dropdown:not(.is-hoverable)').each(function() {
        $(this).on('click', function() {
            $(this).toggleClass("is-active");
        });
    });

    $('#filter-by-goal').on('click', function() {
        $('#filter-text').html("Filter by goal");
        window.filter_type = "goal";
        filter($("#filter").val());
    });

    $('#filter-by-predicate').on('click', function() {
        $('#filter-text').html("Filter by predicate");
        window.filter_type = "predicate";
        filter($("#filter").val());
    });

    $('#filter-by-kind').on('click', function() {
        $('#filter-text').html("Filter by kind");
        window.filter_type = "kind";
        filter($("#filter").val());
    });

    $('#options').on("input", function () {
        vscode.postMessage({
            command: 'options_changed',
            value: $(this).val()
        });
    });

    // $(document).on("click", "a", function() {
    //     if ($(this).hasClass('file-location')) {
    //         vscode.postMessage({
    //             command: 'hopTo',
    //             value: $(this).text()
    //         });
    //     }
    // });

    var quickviews = bulmaQuickview.attach();
    var accordions;
}());
