// Shared top menu with sub-menus. Include with <script src="nav.js"></script> (or ../nav.js from a subfolder) right after <body>.
(function () {
  var base = document.currentScript.src.replace(/nav\.js(\?.*)?$/, "");
  var G = "https://github.com/rifaterdemsahin/video-template";
  var TITLE = "{{VIDEO_TITLE}}";
  var BRAND = TITLE.indexOf("{{") === 0 ? "🎬 video-template" : "🎬 " + TITLE;

  var MENU = [
    { label: "🏠 Home", href: "" },
    { label: "📦 Artifacts", href: "artifacts.html" },
    {
      label: "📋 1 Plan",
      items: [
        ["🚀 Bulk Setup Panel", "panel/index.html"],
        ["📘 Master Spec", "master-spec.html"],
        ["📜 Script & Scenes", "script.html"],
        ["🎨 Scene Layouts", "layouts.html"],
        ["🎞️ Storyboard", "plan/storyboard.html"],
        ["💡 Recommendations", "recommendations.html"]
      ]
    },
    {
      label: "🔍 2 Review",
      items: [
        ["📝 Review Hub", "review.html"],
        ["🆚 Compare Drafts", "compare-drafts.html"],
        ["🎞️ Draft Video", "first-draft.html"],
        ["🎬 Renders & Timing", "renders.html"],
        ["⏱️ Performance", "performance.html"],
        ["📊 Maturity Matrix", "maturity.html"],
        ["📋 Kanban Board", "kanban.html"]
      ]
    },
    {
      label: "🚀 3 Publish",
      items: [
        ["📣 Title, Description & Thumbnails", "publish.html"],
        ["🖼️ Thumbnail A", "thumbnails/thumb-a.html"],
        ["🖼️ Thumbnail B", "thumbnails/thumb-b.html"],
        ["🖼️ Thumbnail C", "thumbnails/thumb-c.html"],
        ["✅ Release Checklist", "release-checklist.html"]
      ]
    },
    {
      label: "⚙️ 4 Project",
      items: [
        ["📦 Base Artifacts (Azure)", "artifacts.html"],
        ["🤖 AGENTS.md", "agents.html"],
        ["🐙 GitHub Repo ↗", G],
        ["🤖 CI Actions ↗", G + "/actions"]
      ]
    }
  ];

  var url = function (h) { return /^https?:/.test(h) ? h : base + h; };
  var norm = function (u) { return u.split("#")[0].split("?")[0].replace(/index\.html$/, ""); };
  var here = norm(location.href);
  var isHere = function (h) { return !/^https?:/.test(h) && norm(url(h)) === here; };

  var css = document.createElement("style");
  css.textContent =
    "#site-nav{position:sticky;top:0;z-index:1000;display:flex;gap:2px;align-items:center;flex-wrap:wrap;padding:6px 12px;" +
    "background:#0e1116;border-bottom:1px solid #232a35;font:14px system-ui,sans-serif}" +
    "#site-nav .brand{color:#e8ecf1;font-weight:700;margin-right:10px;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    "#site-nav a,#site-nav button.top{color:#8b95a5;text-decoration:none;padding:6px 10px;border-radius:6px;background:none;border:0;font:inherit;cursor:pointer;white-space:nowrap}" +
    "#site-nav a:hover,#site-nav button.top:hover,#site-nav .dd.open>button.top{color:#e8ecf1;background:#171b22}" +
    "#site-nav .on{color:#04222a!important;background:#4cc3d9!important;font-weight:600}" +
    "#site-nav .dd{position:relative}" +
    "#site-nav .menu{display:none;position:absolute;top:100%;left:0;min-width:250px;padding:4px;background:#171b22;border:1px solid #232a35;border-radius:8px;box-shadow:0 8px 24px #0008;z-index:1001}" +
    "#site-nav .dd.open .menu{display:block}" +
    "@media(hover:hover){#site-nav .dd:hover .menu{display:block}}" +
    "#site-nav .menu a{display:block}" +
    "#site-nav .nav-search{position:relative;margin-left:auto}" +
    "#site-nav .nav-search input{background:#171b22;color:#e8ecf1;border:1px solid #232a35;border-radius:6px;padding:5px 10px;font:13px system-ui,sans-serif;width:190px;outline:none}" +
    "#site-nav .nav-search input:focus{border-color:#4cc3d9;width:230px}" +
    "#site-nav .nav-search-res{display:none;position:absolute;top:100%;right:0;min-width:270px;max-height:320px;overflow-y:auto;padding:4px;background:#171b22;border:1px solid #232a35;border-radius:8px;box-shadow:0 8px 24px #0008;z-index:1002;margin-top:4px}" +
    "#site-nav .nav-search-res.open{display:block}" +
    "#site-nav .nav-search-res a{display:block;padding:6px 10px;border-radius:6px;color:#e8ecf1;font-size:13px}" +
    "#site-nav .nav-search-res a small{display:block;color:#8b95a5;font-size:11px}" +
    "@media(max-width:600px){#site-nav .menu{position:static;box-shadow:none;min-width:0}#site-nav .nav-search{margin-left:0;width:100%}#site-nav .nav-search input{width:100%}}";
  document.head.appendChild(css);

  var nav = document.createElement("nav");
  nav.id = "site-nav";
  nav.setAttribute("aria-label", "Site");
  var html = '<span class="brand" title="' + BRAND.replace(/"/g, "&quot;") + '">' + BRAND + "</span>";
  MENU.forEach(function (m, i) {
    if (!m.items) {
      html += '<a href="' + url(m.href) + '"' + (isHere(m.href) ? ' class="on"' : "") + ">" + m.label + "</a>";
      return;
    }
    var active = m.items.some(function (it) { return isHere(it[1]); });
    html += '<div class="dd" data-i="' + i + '"><button class="top' + (active ? " on" : "") + '" aria-haspopup="true" aria-expanded="false">' + m.label + ' ▾</button><div class="menu">';
    m.items.forEach(function (it) {
      var ext = /^https?:/.test(it[1]) ? ' target="_blank" rel="noopener"' : "";
      html += '<a href="' + url(it[1]) + '"' + ext + (isHere(it[1]) ? ' class="on" aria-current="page"' : "") + ">" + it[0] + "</a>";
    });
    html += "</div></div>";
  });
  html += '<div class="nav-search"><input id="navSearchInput" type="search" placeholder="Search pages & artifacts..." aria-label="Search pages and artifacts" autocomplete="off" /><div id="navSearchRes" class="nav-search-res"></div></div>';
  nav.innerHTML = html;
  document.body.insertBefore(nav, document.body.firstChild);

  var KEYWORDS = {
    "artifacts.html": "azure blob upload repo base logos intro outro background audio uksouth dpprojects",
    "panel/index.html": "setup bulk init prompt fal deepinfra",
    "master-spec.html": "brief audience goal cta rules",
    "script.html": "scenes voiceover vo overlay broll",
    "layouts.html": "layout grid split media lower third pip safe zone api",
    "plan/storyboard.html": "visual cards frames",
    "review.html": "review draft timestamp drawing canvas azure feedback verification",
    "compare-drafts.html": "compare drafts side by side sync ab score diff",
    "first-draft.html": "draft video player scenes footage",
    "renders.html": "renders mp4 timing pipeline compositions cli",
    "performance.html": "performance render speed deploy timing",
    "publish.html": "youtube title description chapters thumbnails"
  };
  var searchPages = [];
  MENU.forEach(function (m) {
    if (m.items) m.items.forEach(function (it) { searchPages.push({ label: it[0], href: it[1], kw: KEYWORDS[it[1]] || "" }); });
    else searchPages.push({ label: m.label, href: m.href, kw: KEYWORDS[m.href] || "" });
  });

  var sInput = nav.querySelector("#navSearchInput");
  var sRes = nav.querySelector("#navSearchRes");
  var renderSearch = function () {
    var q = sInput.value.trim().toLowerCase();
    if (!q) { sRes.classList.remove("open"); sRes.innerHTML = ""; return; }
    var hits = searchPages.filter(function (p) {
      return (p.label + " " + p.href + " " + p.kw).toLowerCase().indexOf(q) !== -1;
    }).map(function (p) {
      var ext = /^https?:/.test(p.href) ? ' target="_blank" rel="noopener"' : "";
      return '<a href="' + url(p.href) + '"' + ext + '>' + p.label + '<small>' + (p.href || "index.html") + '</small></a>';
    });
    try {
      var shared = JSON.parse(localStorage.getItem("video_template_base_artifacts_v1") || "{}");
      (shared.artifacts || []).forEach(function (a) {
        if (((a.name || "") + " " + (a.category || "")).toLowerCase().indexOf(q) !== -1) {
          hits.push('<a href="' + url("artifacts.html") + '">📦 ' + a.name + '<small>Artifact · ' + (a.category || "other") + '</small></a>');
        }
      });
    } catch (e) {}
    sRes.innerHTML = hits.length ? hits.slice(0, 10).join("") : '<span style="display:block;padding:6px 10px;color:#8b95a5;font-size:13px">No matches</span>';
    sRes.classList.add("open");
  };
  sInput.addEventListener("input", renderSearch);
  sInput.addEventListener("focus", renderSearch);
  sInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      var first = sRes.querySelector("a");
      if (first) { e.preventDefault(); first.click(); }
    }
  });

  var closeAll = function () {
    nav.querySelectorAll(".dd.open").forEach(function (d) {
      d.classList.remove("open");
      d.querySelector("button").setAttribute("aria-expanded", "false");
    });
  };
  nav.addEventListener("click", function (e) {
    var b = e.target.closest("button.top");
    if (!b) return;
    var dd = b.parentNode, was = dd.classList.contains("open");
    closeAll();
    if (!was) { dd.classList.add("open"); b.setAttribute("aria-expanded", "true"); }
  });
  document.addEventListener("click", function (e) { if (!nav.contains(e.target)) { closeAll(); sRes.classList.remove("open"); } });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closeAll(); sRes.classList.remove("open"); } });

  var rel = location.href.split("#")[0].split("?")[0];
  rel = rel.indexOf(base) === 0 ? rel.slice(base.length) : rel;
  rel = rel.replace(/index\.html$/, "");
  var key = rel === "" ? "index.html" : rel;
  window.SITE_INFO = { base: base, repo: G, key: key, title: document.title, url: location.origin + location.pathname };

  var ready = function (fn) { document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", fn) : fn(); };
  ready(function () {
    var f = document.createElement("footer");
    f.id = "site-foot";
    f.innerHTML = '🎬 <b>' + BRAND + '</b> · template v1.2.0 · Series: <code>{{SERIES}}</code> · Publish: <code>{{PUBLISH_DATE}}</code> · <a href="' + base + 'change.log">change.log</a> · <a href="' + G + '" target="_blank" rel="noopener">GitHub</a>';
    var st = document.createElement("style");
    st.textContent = "#site-foot{max-width:920px;margin:0 auto;padding:16px;color:var(--mute,#8b95a5);font:13px system-ui,sans-serif;text-align:center}#site-foot a{color:var(--accent,#4cc3d9)}";
    document.head.appendChild(st);
    document.body.appendChild(f);

    if (document.body.dataset.feedback !== "custom") {
      var s = document.createElement("script");
      s.src = base + "feedback.js";
      document.head.appendChild(s);
    }
  });
})();
