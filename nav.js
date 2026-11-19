// Shared top menu with sub-menus. Include with <script src="nav.js"></script> (or ../nav.js from a subfolder) right after <body>.
(function () {
  var base = document.currentScript.src.replace(/nav\.js(\?.*)?$/, "");
  var G = "https://github.com/rifaterdemsahin/video-template";
  var TITLE = "{{VIDEO_TITLE}}";
  var BRAND = TITLE.indexOf("{{") === 0 ? "🎬 video-template" : "🎬 " + TITLE;

  var MENU = [
    { label: "🏠 Home", href: "" },
    {
      label: "📋 1 Plan",
      items: [
        ["🚀 Bulk Setup Panel", "panel/index.html"],
        ["📘 Master Spec", "master-spec.html"],
        ["📜 Script & Scenes", "script.html"],
        ["🎞️ Storyboard", "plan/storyboard.html"],
        ["💡 Recommendations", "recommendations.html"]
      ]
    },
    {
      label: "🔍 2 Review",
      items: [
        ["📝 Review Hub", "review.html"],
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
    "@media(max-width:600px){#site-nav .menu{position:static;box-shadow:none;min-width:0}}";
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
  nav.innerHTML = html;
  document.body.insertBefore(nav, document.body.firstChild);

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
  document.addEventListener("click", function (e) { if (!nav.contains(e.target)) closeAll(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeAll(); });

  var rel = location.href.split("#")[0].split("?")[0];
  rel = rel.indexOf(base) === 0 ? rel.slice(base.length) : rel;
  rel = rel.replace(/index\.html$/, "");
  var key = rel === "" ? "index.html" : rel;
  window.SITE_INFO = { base: base, repo: G, key: key, title: document.title, url: location.origin + location.pathname };

  var ready = function (fn) { document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", fn) : fn(); };
  ready(function () {
    var f = document.createElement("footer");
    f.id = "site-foot";
    f.innerHTML = '🎬 <b>' + BRAND + '</b> · template v1.1.0 · Series: <code>{{SERIES}}</code> · Publish: <code>{{PUBLISH_DATE}}</code> · <a href="' + base + 'change.log">change.log</a> · <a href="' + G + '" target="_blank" rel="noopener">GitHub</a>';
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
