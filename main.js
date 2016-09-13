
// Page size inspector - popup page
// by tomi.mickelsson@iki.fi

// background page that has the network data
var bgpage;
// target tab being inspected
var tabid;
var tab_url;
// monkberry view
var mainview;

// an extension or testing popup as normal page?
var is_testing = false;


function init() {
    // monkberry template filters
    var filters = {
        len: function(arr) { return arr && arr.length ? arr.length : ''; },
        size: function(n) { return n ? numberWithCommas(n) : ''; }
    };

    mainview = Monkberry.render(popup, document.body, {filters:filters});
//    viewupdate({is_active: false});

    is_testing = !chrome.tabs;
    if (is_testing) {
        test_data();
//        viewupdate({ is_loading:true, error:"" });
    } else {
        bgpage = chrome.extension.getBackgroundPage();

        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            var active = tabs[0];
            tabid = active.id;
            tab_url = active.url;

            // start debugger or open popup
            var state = bgpage.getState(tabid);
            if (state.is_debugger_on) {
                build_popup(bgpage.get_tab_network_requests(tabid),
                    tab_url, bgpage.getState(tabid));
            } else {
                if (bgpage.startDebugger(tabid))
                    reload(tabid, false);
            }
        });

        chrome.runtime.onMessage.addListener(on_message);
    }

    // click handlers - delegation
    document.body.addEventListener('click', function(event) {
        var targ = event.target;

        if (targ.id === 'stop') {
            // stop tracking
            bgpage.stopDebugger(tabid);
            window.close();
        } else if (targ.id === 'reload') {
            // load page data
            var ch = getelem("disablecache");
            reload(tabid, ch.checked);
        } else if (targ.id === 'disablecache') {
            // toggle cache
            bgpage.setCache(tabid, targ.checked);
            reload(tabid, targ.checked);
        } else if (targ.id === 'copy2clipboard') {
            // copy report to clipboard
            copy_report_clipboard();
            event.preventDefault();
        } else if (is_child_of(targ, "mid")) {
            // toggle rows visibility
            var p = is_child_of(targ, "mid");
            for (const elem of get_siblings(p, "h")) {
                elem.classList.toggle("show");
            }
            event.preventDefault();
        } else if (targ.getAttribute("href") == "#") {
            // noop
            event.preventDefault();
        }
    });

}

document.addEventListener('DOMContentLoaded', init);

// background page sends us a message
function on_message(request, sender, sendResponse) {

    if (request.load_completed) {
        var state = bgpage.getState(tabid);
        build_popup(bgpage.get_tab_network_requests(tabid), tab_url,
            state);
    } else if (request.attach_error) {
//        showErr("Devtools is active - please close it");
        showErr(request.attach_error);
    }

    //sendResponse({frompopup: "goodbye"});
}

// reload page or navigate to url + update view
function reload(tabid, full_reload) {
    if (!full_reload)
        bgpage.navigate(tabid, tab_url);
    else
        bgpage.reload(tabid);

    viewupdate({ is_loading:true, error:"" });
}

function build_popup(raw_data, url, state) {

//    if (!raw_data) {
//        showErr("empty");
//        return;
//    }

    var d = convert_raw_data(raw_data);

    d.error = '';
    d.url = url;

    if (is_testing) {
        d.loadtime = 1.56;
    } else {
        load = bgpage.get_tab_load_time(tabid)/1000;
        d.loadtime = load.toFixed(2);
    }

//    d.loadtime_red = 4;

    d.is_loading = false;
    d.is_cache_disabled = state.is_cache_disabled;

    d.total = d.sections.total; // shortcut

    viewupdate(d);
}

function convert_raw_data(raw) {
    var o = {};
    o.sections = {};

    if (raw) {
        for(const obj of raw) {
            convert_single_request(o, obj);
        }
    }

    return o;
}

// convert 1 raw network request into UI item
function convert_single_request(data, orig) {
    var obj = {};

    var t = orig.type;

    if (orig.cached) {
        obj.cached = 1;
        obj.sizecache = orig.size;
    } else {
        obj.size = orig.size;
    }

    if (!orig.url.startsWith("data:"))
        obj.url = orig.url;

    obj.url_display = sanitize_url(orig.url);
    obj.code = orig.code;

    // add the request to one of lists
    if (t != "Document" && t != "Script" && t != "Stylesheet" &&
        t != "Image" && t != "XHR" && t != "Font") {
        obj.type = t;
        t = "Other";
    }
    var list = data.sections[t];
    if (!list) {
        data.sections[t] = [];
        list = data.sections[t];
    }
    list.push(obj);

    // update counts
    var names = ["total", t+"count"];
    for (const name of names) {
        var total = get_counters(data, name);
//        total["reqtotal"] += 1;
//        total["kbtotal"] += orig.size;
        if (orig.cached) {
            total["reqcached"] += 1;
            total["kbcached"] += orig.size;
        } else {
            total["reqtransf"] += 1;
            total["kbtransf"] += orig.size;
        }
    }

}

// init and get counters
function get_counters(o, name) {
    var c = o.sections[name];
    if (!c) {
        c = {"reqtotal":0, "reqtransf":0, "reqcached":0,
             "kbtotal":0,  "kbtransf":0,  "kbcached":0};
        o.sections[name] = c;
    }
    return c;
}

// update UI
function viewupdate(data) {
    deb("update", data);
    mainview.update(data);
}

// show an error
function showErr(msg) {
    viewupdate({error: msg});
}

// copies report to clipboard
function copy_report_clipboard() {
    // this is too simple now, improve!

    // first show all rows
    for (var elem of document.getElementsByClassName('h')) {
        elem.classList.add("show");
    }

    // build text
    var txt = getelem("maintable").innerText;

    var head = "Page Size Inspector report\n"
    head += Date().toString() + "\n";
    head += tab_url + "\n\n";

    txt = head + txt;

    // copy
    copy2clipboard(txt);

    // hide all rows
    for (var elem of document.getElementsByClassName('h')) {
        elem.classList.remove("show");
    }
}

