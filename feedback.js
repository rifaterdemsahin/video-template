// Section-by-section feedback system for every page. Loaded automatically by nav.js.
// Set <body data-feedback="custom"> to opt out on a specific page.
(function () {
  if (document.body.dataset.feedback === "custom") return;
  var info = window.SITE_INFO || {};
  var REPO = info.repo || "https://github.com/rifaterdemsahin/video-template";
  var KEY = "fb-v1:" + (info.key || location.pathname);
  var saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) {}
  var persist = function () { try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) {} };

  var main = document.querySelector("main") || document.body;
  var st = document.createElement("style");
  st.textContent =
    ".fbx{margin:12px 0;border:1px dashed var(--line,#232a35);border-radius:8px;padding:6px 10px;background:transparent}" +
    ".fbx summary{cursor:pointer;font:13px system-ui,sans-serif;color:var(--mute,#8b95a5)}.fbx[open] summary{margin-bottom:6px}" +
    ".fbx.has summary{color:var(--accent,#4cc3d9);font-weight:600}" +
    ".fbx textarea{width:100%;min-height:64px;font:14px system-ui,sans-serif;background:var(--bg,#0e1116);color:var(--ink,#e8ecf1);border:1px solid var(--line,#232a35);border-radius:6px;padding:8px;resize:vertical}" +
    "#fbbar{position:sticky;bottom:0;z-index:900;display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 16px;background:#0e1116ee;border-top:1px solid #232a35;backdrop-filter:blur(6px);font:13px system-ui,sans-serif;color:#8b95a5}" +
    "#fbbar button{font:inherit;font-size:14px;border:1px solid #232a35;background:#171b22;color:#e8ecf1;padding:8px 14px;border-radius:8px;cursor:pointer}" +
    "#fbbar #fbcopy{background:#4cc3d9;color:#04222a;font-weight:700;border-color:#4cc3d9}" +
    "#fbbar #fbissue{background:#1e293b;color:#ffd166;border-color:#ffd166}" +
    "#fbfallback{width:100%;min-height:110px;margin-top:8px}";
  document.head.appendChild(st);

  var h2s = Array.prototype.slice.call(main.querySelectorAll("h2"));
  var boxes = [];

  function makeBox(id, title, summary) {
    var d = document.createElement("details");
    d.className = "fbx";
    var s = document.createElement("summary");
    var t = document.createElement("textarea");
    t.placeholder = "What should change, move, be added or cut?";
    t.value = saved[id] || "";
    s.textContent = "💬 " + summary;
    d.appendChild(s); d.appendChild(t);
    var sync = function () { d.classList.toggle("has", !!t.value.trim()); };
    sync();
    if (t.value.trim()) d.open = true;
    t.addEventListener("input", function () { saved[id] = t.value; persist(); sync(); count(); });
    boxes.push({ id: id, title: title, el: t });
    return d;
  }

  h2s.forEach(function (h, i) {
    if (h.hasAttribute("data-fb-skip")) return;
    var title = h.textContent.replace(/\s+/g, " ").trim();
    var box = makeBox("s" + i, title, "Feedback on this section");
    var container = h.closest("section, article");
    if (container && container !== main && main.contains(container)) { container.appendChild(box); return; }
    var n = h.nextElementSibling;
    while (n && n.tagName !== "H2") n = n.nextElementSibling;
    if (n) main.insertBefore(box, n); else main.appendChild(box);
  });

  var general = makeBox("general", "General", "General feedback for this page");
  main.appendChild(general);

  var bar = document.createElement("div");
  bar.id = "fbbar";
  bar.innerHTML =
    '<button id="fbcopy">📋 Copy feedback</button>' +
    '<button id="fbissue">🚀 Open GitHub Issue</button>' +
    '<button id="fbclear">Clear notes</button>' +
    '<span id="fbcount"></span>' +
    '<textarea id="fbfallback" hidden></textarea>';
  document.body.appendChild(bar);

  var countEl = bar.querySelector("#fbcount");
  function filled() {
    return boxes.filter(function (b) { return b.el.value.trim(); });
  }
  function count() {
    var n = filled().length;
    countEl.textContent = n ? n + " note(s) on this page" : "No notes yet";
  }
  count();

  function build() {
    var f = filled();
    if (!f.length) return "";
    var h1 = document.querySelector("h1");
    var head = 'Feedback on "' + (h1 ? h1.textContent.replace(/\s+/g, " ").trim() : document.title) + '"\n' + (info.url || location.href);
    return head + "\n\n" + f.map(function (b) { return "## " + b.title + "\n- " + b.el.value.trim().replace(/\n/g, "\n  "); }).join("\n\n");
  }

  var btn = bar.querySelector("#fbcopy");
  btn.onclick = function () {
    var t = build();
    var label = "📋 Copy feedback";
    if (!t) { btn.textContent = "Nothing to copy yet"; return setTimeout(function () { btn.textContent = label; }, 1600); }
    var done = function (ok) {
      btn.textContent = ok ? "✅ Copied!" : "Select text below";
      if (!ok) { var ta = bar.querySelector("#fbfallback"); ta.hidden = false; ta.value = t; ta.select(); }
      setTimeout(function () { btn.textContent = label; }, 2500);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { done(true); }, function () { done(false); });
    else done(false);
  };

  bar.querySelector("#fbissue").onclick = function () {
    var t = build() || ("Feedback on " + (info.url || location.href));
    var h1 = document.querySelector("h1");
    var title = encodeURIComponent("[Feedback] " + (h1 ? h1.textContent.replace(/\s+/g, " ").trim() : document.title));
    var body = encodeURIComponent(t);
    window.open(REPO + "/issues/new?title=" + title + "&body=" + body, "_blank", "noopener");
  };

  bar.querySelector("#fbclear").onclick = function () {
    if (!confirm("Clear all notes on this page?")) return;
    saved = {}; persist();
    boxes.forEach(function (b) { b.el.value = ""; b.el.parentNode.classList.remove("has"); });
    count();
  };
})();
