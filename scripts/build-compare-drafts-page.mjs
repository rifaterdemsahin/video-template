// Builds compare-drafts.html: pick two rendered drafts and watch them side by side, in sync.
//   node scripts/build-compare-drafts-page.mjs        (also run by render-draft.mjs)
// Reads draft/versions.json, draft/vN/{video.mp4,meta.json,frames/*.jpg}, script/scenes.json.
// Links: compare-drafts.html?a=1&b=2 (defaults: the two newest rendered drafts).
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { P } from "./lib/project.mjs";

const root = P.root;
const J = (p) => JSON.parse(readFileSync(`${root}/${p}`, "utf8"));
const S = J("script/scenes.json");
const VERS = existsSync(`${root}/draft/versions.json`) ? J("draft/versions.json") : { latest: 0, versions: [] };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const drafts = (VERS.versions || [])
  .filter((v) => existsSync(`${root}/draft/v${v.n}/video.mp4`))
  .map((v) => {
    const meta = existsSync(`${root}/draft/v${v.n}/meta.json`) ? J(`draft/v${v.n}/meta.json`) : {};
    const frames = Object.fromEntries(S.scenes.map((s) => [s.id, existsSync(`${root}/draft/v${v.n}/frames/${s.id}.jpg`) ? `draft/v${v.n}/frames/${s.id}.jpg` : null]));
    return {
      n: v.n, label: v.label, date: v.date, changes: v.changes || [],
      src: `draft/v${v.n}/video.mp4`,
      mb: Math.round(statSync(`${root}/draft/v${v.n}/video.mp4`).size / 104857.6) / 10,
      duration: meta.duration ?? null, renderSeconds: meta.renderSeconds ?? null, check: meta.check ?? null, frames,
    };
  })
  .sort((a, b) => a.n - b.n);
const SC = existsSync(`${root}/draft/scores.json`) ? J("draft/scores.json") : null;
drafts.forEach((d) => { d.score = SC?.drafts?.[String(d.n)] || null; });
const scenes = S.scenes.map((s, i) => ({ id: s.id, n: i + 1, title: s.title, start: s.start }));

let html;
if (drafts.length < 2) {
  html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Compare Drafts · ${esc(P.title)}</title>
<link rel="stylesheet" href="site.css">
</head><body>
<script src="nav.js"></script>
<main style="max-width:920px">
  <div class="crumbs">🔍 2 Review &nbsp;·&nbsp; Compare drafts</div>
  <h1>🆚 Compare drafts</h1>
  <p class="lead">Pick two rendered drafts and watch them side by side, in sync. One set of controls drives both.</p>
  <div class="note" style="margin:18px 0">
    <b>Need at least 2 rendered drafts to compare</b> (currently ${drafts.length} rendered).
    <p style="margin:8px 0 0">Render Draft v1 and Draft v2 locally with <code>node scripts/render-draft.mjs</code>, then this page automatically enables synced dual-player scrubbing, A/B audio switching, per-scene frame diffs, and optional value scores (<code>draft/scores.json</code>).</p>
  </div>
  <div class="next">
    <a href="review.html">← Review Hub</a>
    <a href="renders.html">Renders &amp; Timing →</a>
  </div>
</main>
</body></html>
`;
  writeFileSync(`${root}/compare-drafts.html`, html);
  console.log(`wrote compare-drafts.html (empty state: ${drafts.length} rendered drafts, need >= 2)`);
  process.exit(0);
}

html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Compare Drafts · ${esc(P.title)}</title>
<link rel="stylesheet" href="site.css">
<style>
.picker{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:14px 0}
.picker label{font-size:13px;color:var(--mute);font-weight:700}
.picker select{font:inherit;font-size:14px;padding:6px 10px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--ink);max-width:100%}
.btn{font:inherit;font-size:13px;padding:6px 12px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer}
.btn:hover{border-color:var(--accent);color:var(--accent)}
.btn.pri{background:var(--accent);border-color:var(--accent);color:#04222a;font-weight:800}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media (max-width:860px){.pair{grid-template-columns:1fr}}
.side{min-width:0}
.side h3{margin:0 0 6px;font-size:15px;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
.tagA,.tagB{display:inline-block;min-width:24px;text-align:center;border-radius:6px;font-weight:900;font-size:12px;padding:1px 6px;color:#04222a}
.tagA{background:#ffd166}.tagB{background:var(--accent)}
.side video{width:100%;aspect-ratio:16/9;background:#000;border-radius:10px;border:1px solid var(--line);display:block}
.controls{position:sticky;bottom:52px;z-index:5;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin:12px 0;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.controls input[type=range]{flex:1 1 220px;min-width:0;accent-color:var(--accent)}
.time{font:600 14px ui-monospace,monospace;min-width:120px}
.seg{display:inline-flex;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.seg button{font:inherit;font-size:12px;border:0;background:transparent;color:var(--ink);padding:5px 9px;cursor:pointer}
.seg button.on{background:var(--accent);color:#04222a;font-weight:800}
.chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 4px}
.chips button{font:inherit;font-size:12px;padding:4px 9px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer}
.chips button:hover{border-color:var(--accent)}
.stat{font-size:13px;color:var(--mute);margin:6px 0 0}
.stat b{color:var(--ink)}
.changes{font-size:13.5px;margin:6px 0;padding-left:18px}
.frames td{width:50%}.frames img{width:100%;border-radius:6px;display:block;background:#000}
.frames .none{font-size:12px;color:var(--mute)}
.drift{font-size:12px;color:var(--mute)}
.score{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-top:8px;font-size:13px}
.score .big{font-size:26px;font-weight:900;line-height:1}.score .big small{font-size:13px;font-weight:600}
.score .why{color:var(--mute);margin:6px 0}
.crit{display:grid;grid-template-columns:96px 1fr 34px;gap:6px;align-items:center;font-size:12px;margin:3px 0}
.bar{display:block;height:7px;border-radius:99px;background:var(--line);overflow:hidden}.bar i{display:block;height:100%;background:var(--accent);border-radius:99px}
.delta{font-weight:800}.delta.up{color:var(--ok)}.delta.down{color:#e53e3e}
.rank td{vertical-align:middle}.rank tr.selA td{background:rgba(255,209,102,.12)}.rank tr.selB td{background:rgba(76,195,217,.12)}
.rank .tot{font-weight:900;font-size:16px;white-space:nowrap}.rank .wide{min-width:140px}
</style></head><body>
<script src="nav.js"></script>
<main style="max-width:1280px">
  <div class="crumbs">🔍 2 Review &nbsp;·&nbsp; Compare drafts</div>
  <h1 style="margin:0 0 4px">🆚 Compare drafts</h1>
  <p class="lead" style="margin:0">Pick two rendered drafts and watch them side by side, in sync. One set of controls drives both.</p>

  <div class="picker">
    <label for="selA"><span class="tagA">A</span></label>
    <select id="selA">${drafts.map((d) => `<option value="${d.n}">Draft v${d.n} · ${esc(d.label)} (${esc(d.date)})</option>`).join("")}</select>
    <button class="btn" id="swap" title="Swap A and B">⇄ Swap</button>
    <label for="selB"><span class="tagB">B</span></label>
    <select id="selB">${drafts.map((d) => `<option value="${d.n}">Draft v${d.n} · ${esc(d.label)} (${esc(d.date)})</option>`).join("")}</select>
    <button class="btn" id="copyLink" title="Copy a link to this comparison">🔗 Copy link</button>
  </div>

  <div class="pair">
    <div class="side"><h3><span class="tagA">A</span><span id="titleA"></span></h3><video id="vA" preload="auto" playsinline></video><p class="stat" id="statA"></p><div class="score" id="scoreA"></div></div>
    <div class="side"><h3><span class="tagB">B</span><span id="titleB"></span></h3><video id="vB" preload="auto" playsinline></video><p class="stat" id="statB"></p><div class="score" id="scoreB"></div></div>
  </div>

  <div class="controls" id="controls">
    <button class="btn pri" id="play">▶ Play</button>
    <button class="btn" id="back5" title="Back 5 s (J)">−5s</button>
    <button class="btn" id="backF" title="Back one frame (←)">◀ frame</button>
    <button class="btn" id="fwdF" title="Forward one frame (→)">frame ▶</button>
    <button class="btn" id="fwd5" title="Forward 5 s (L)">+5s</button>
    <span class="time" id="time">0:00.00</span>
    <input type="range" id="scrub" min="0" max="244" step="0.01" value="0" aria-label="Position">
    <span class="seg" id="audio" title="Which side you hear"><button data-a="A">🔊 A</button><button data-a="B" class="on">🔊 B</button><button data-a="off">🔇</button></span>
    <select id="rate" class="btn" title="Speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.5">1.5×</option><option value="2">2×</option></select>
    <span class="drift" id="drift"></span>
  </div>

  <div class="chips" id="chips">${scenes.map((s) => `<button data-t="${s.start}" title="${esc(s.title)}">S${String(s.n).padStart(2, "0")} · ${Math.floor(s.start / 60)}:${String(s.start % 60).padStart(2, "0")}</button>`).join("")}</div>
  <p style="font-size:12.5px;color:var(--mute);margin:2px 0 0">Scene jumps use the current script's timings; older drafts can be timed a little differently. Keys: Space play/pause · ← → one frame · J L five seconds.</p>

  <h2 style="margin-top:28px">Estimated value score</h2>
  <p style="font-size:13px;color:var(--mute);margin-top:-6px">${esc(SC ? SC._about : "No scores yet: add draft/scores.json.")} ${SC ? esc(SC.method) : ""} Click a row to put that draft on side B.</p>
  ${SC ? `<div class="tw"><table class="rank"><thead><tr><th>Draft</th><th>Score</th><th class="wide">Value</th>${SC.criteria.map((c) => `<th title="${esc(c.desc)}">${esc(c.label)} <small>×${c.weight}</small></th>`).join("")}<th>Why</th></tr></thead><tbody id="rank"></tbody></table></div>` : ""}

  <h2 style="margin-top:28px">What changed</h2>
  <div class="pair">
    <div class="card"><b><span class="tagA">A</span> <span id="chTitleA"></span></b><ul class="changes" id="chA"></ul></div>
    <div class="card"><b><span class="tagB">B</span> <span id="chTitleB"></span></b><ul class="changes" id="chB"></ul></div>
  </div>

  <h2 style="margin-top:28px">Scene by scene</h2>
  <p style="font-size:13px;color:var(--mute);margin-top:-6px">One frame per scene, taken by render-draft.mjs a few seconds into each scene. Click a row to jump both players there.</p>
  <div class="tw"><table class="frames">
    <thead><tr><th><span class="tagA">A</span> <span id="fhA"></span></th><th><span class="tagB">B</span> <span id="fhB"></span></th></tr></thead>
    <tbody id="frames"></tbody>
  </table></div>
</main>

<script>
(function () {
  var DRAFTS = ${JSON.stringify(drafts)};
  var CRIT = ${JSON.stringify(SC ? SC.criteria : [])};
  var SCENES = ${JSON.stringify(scenes)};
  var FPS = 30;
  var byN = {}; DRAFTS.forEach(function (d) { byN[d.n] = d; });
  var q = new URLSearchParams(location.search);
  var newest = DRAFTS[DRAFTS.length - 1].n, prev = DRAFTS[DRAFTS.length - 2].n;
  var a = byN[q.get("a")] ? +q.get("a") : prev, b = byN[q.get("b")] ? +q.get("b") : newest;
  var $ = function (id) { return document.getElementById(id); };
  var vA = $("vA"), vB = $("vB"), selA = $("selA"), selB = $("selB"), scrub = $("scrub");
  var audio = "B", scrubbing = false;
  var tc = function (x) { x = Math.max(0, x || 0); var m = Math.floor(x / 60), s = x - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2); };
  var secs = function (n) { return n == null ? "–" : n >= 60 ? Math.floor(n / 60) + " min " + Math.round(n % 60) + " s" : Math.round(n) + " s"; };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  var maxDur = function () { return Math.max(vA.duration || 0, vB.duration || 0) || 60; };
  function setT(t) {
    t = Math.max(0, Math.min(t, maxDur() - 0.01));
    vA.currentTime = Math.min(t, (vA.duration || t + 1) - 0.01);
    vB.currentTime = Math.min(t, (vB.duration || t + 1) - 0.01);
    paint();
  }
  function applyAudio() {
    vA.muted = audio !== "A"; vB.muted = audio !== "B";
    document.querySelectorAll("#audio button").forEach(function (x) { x.classList.toggle("on", x.dataset.a === audio); });
  }
  function side(which, d) {
    $("title" + which).textContent = "Draft v" + d.n + " · " + d.label;
    $("stat" + which).innerHTML = "<b>" + esc(d.date) + "</b> · " + (d.duration ? tc(d.duration).replace(/\\.\\d+$/, "") : "?") + " long · " + d.mb + " MB · rendered in " + secs(d.renderSeconds) + (d.check ? " · check: " + esc(d.check) : "");
    $("chTitle" + which).textContent = "Draft v" + d.n + " · " + d.label;
    $("ch" + which).innerHTML = d.changes.map(function (c) { return "<li>" + esc(c) + "</li>"; }).join("") || "<li>No notes.</li>";
    $("fh" + which).textContent = "Draft v" + d.n;
    var sc = d.score, el = $("score" + which);
    if (!sc) { el.innerHTML = '<span class="why">No score for this draft yet.</span>'; return; }
    var other = byN[which === "A" ? b : a].score, delta = other ? Math.round((sc.total - other.total) * 10) / 10 : null;
    el.innerHTML = '<div class="big">' + sc.total + ' <small>/ 100 · estimated value</small>' + (delta !== null && delta !== 0 ? ' <span class="delta ' + (delta > 0 ? "up" : "down") + '">' + (delta > 0 ? "+" : "") + delta + " vs " + (which === "A" ? "B" : "A") + "</span>" : "") + '</div>' +
      '<p class="why">' + esc(sc.why) + "</p>" +
      CRIT.map(function (c) { var v = sc.scores[c.id]; return '<div class="crit" title="' + esc(c.desc) + '"><span>' + esc(c.label) + '</span><span class="bar"><i style="width:' + v * 10 + '%"></i></span><b>' + v + "</b></div>"; }).join("");
  }
  function rank() {
    var body = $("rank"); if (!body) return;
    var rows = DRAFTS.filter(function (d) { return d.score; }).sort(function (x, y) { return y.score.total - x.score.total; });
    body.innerHTML = rows.map(function (d) {
      return '<tr data-n="' + d.n + '" class="' + (d.n === a ? "selA" : d.n === b ? "selB" : "") + '" style="cursor:pointer"><td><b>v' + d.n + "</b>" + (d.n === a ? ' <span class="tagA">A</span>' : "") + (d.n === b ? ' <span class="tagB">B</span>' : "") + '</td><td class="tot">' + d.score.total + '</td><td class="wide"><span class="bar"><i style="width:' + d.score.total + '%"></i></span></td>' +
        CRIT.map(function (c) { return "<td>" + d.score.scores[c.id] + "</td>"; }).join("") + '<td style="font-size:12.5px;min-width:260px">' + esc(d.score.why) + "</td></tr>";
    }).join("");
  }
  function load() {
    var t = vB.currentTime || vA.currentTime || 0, playing = !vB.paused || !vA.paused;
    var dA = byN[a], dB = byN[b];
    selA.value = a; selB.value = b;
    vA.src = dA.src; vB.src = dB.src;
    side("A", dA); side("B", dB); rank();
    $("frames").innerHTML = SCENES.map(function (s) {
      var cell = function (d) { var f = d.frames[s.id]; return f ? '<img loading="lazy" src="' + f + '" alt="Draft v' + d.n + ', scene ' + s.n + '">' : '<span class="none">No frame for this scene in v' + d.n + "</span>"; };
      return '<tr data-t="' + s.start + '" style="cursor:pointer"><td colspan="2" style="padding:8px 12px 2px;font-weight:700;font-size:13px">S' + (s.n < 10 ? "0" : "") + s.n + " · " + esc(s.title) + '</td></tr><tr data-t="' + s.start + '" style="cursor:pointer"><td>' + cell(dA) + "</td><td>" + cell(dB) + "</td></tr>";
    }).join("");
    history.replaceState(null, "", "?a=" + a + "&b=" + b + location.hash);
    var once = 0, ready = function () { if (++once === 2) { setT(t); applyAudio(); if (playing) playBoth(); } };
    vA.addEventListener("loadedmetadata", ready, { once: true });
    vB.addEventListener("loadedmetadata", ready, { once: true });
  }
  function playBoth() { vB.currentTime = vA.currentTime; Promise.all([vA.play(), vB.play()]).catch(function () {}); $("play").textContent = "⏸ Pause"; tick(); }
  function pauseBoth() { vA.pause(); vB.pause(); vB.currentTime = Math.min(vA.currentTime, (vB.duration || 1e9) - 0.01); $("play").textContent = "▶ Play"; paint(); }
  function paint() {
    var t = Math.max(vA.currentTime || 0, vB.currentTime || 0);
    scrub.max = maxDur().toFixed(2);
    if (!scrubbing) scrub.value = t.toFixed(2);
    var sc = SCENES.filter(function (s) { return s.start <= t + 0.001; }).pop();
    $("time").textContent = tc(t) + (sc ? "  S" + (sc.n < 10 ? "0" : "") + sc.n : "");
  }
  function tick() {
    if (vA.paused && vB.paused) return;
    var d = (vB.currentTime - vA.currentTime);
    if (!vA.ended && !vB.ended && Math.abs(d) > 0.1) vB.currentTime = vA.currentTime;
    $("drift").textContent = "sync ±" + Math.round(Math.abs(d) * 1000) + " ms";
    paint();
    requestAnimationFrame(tick);
  }
  vA.addEventListener("ended", function () { if (vB.ended || vB.paused) pauseBoth(); });
  vB.addEventListener("ended", function () { if (vA.ended || vA.paused) pauseBoth(); });
  $("play").onclick = function () { (vA.paused && vB.paused) ? playBoth() : pauseBoth(); };
  $("back5").onclick = function () { setT(vA.currentTime - 5); };
  $("fwd5").onclick = function () { setT(vA.currentTime + 5); };
  $("backF").onclick = function () { pauseBoth(); setT(vA.currentTime - 1 / FPS); };
  $("fwdF").onclick = function () { pauseBoth(); setT(vA.currentTime + 1 / FPS); };
  scrub.addEventListener("input", function () { scrubbing = true; setT(+scrub.value); });
  scrub.addEventListener("change", function () { scrubbing = false; });
  $("rate").onchange = function () { vA.playbackRate = vB.playbackRate = +this.value; };
  document.querySelectorAll("#audio button").forEach(function (x) { x.onclick = function () { audio = x.dataset.a; applyAudio(); }; });
  $("chips").onclick = function (e) { var t = e.target.closest("button"); if (t) setT(+t.dataset.t + 0.5); };
  $("frames").onclick = function (e) { var r = e.target.closest("tr[data-t]"); if (r) { setT(+r.dataset.t + 0.5); window.scrollTo({ top: $("vA").getBoundingClientRect().top + scrollY - 80, behavior: "smooth" }); } };
  if ($("rank")) $("rank").onclick = function (e) { var r = e.target.closest("tr[data-n]"); if (r && +r.dataset.n !== a) { b = +r.dataset.n; load(); window.scrollTo({ top: 0, behavior: "smooth" }); } };
  selA.onchange = function () { a = +selA.value; load(); };
  selB.onchange = function () { b = +selB.value; load(); };
  $("swap").onclick = function () { var x = a; a = b; b = x; load(); };
  $("copyLink").onclick = function () { navigator.clipboard && navigator.clipboard.writeText(location.href).then(function () { $("copyLink").textContent = "✓ Copied"; setTimeout(function () { $("copyLink").textContent = "🔗 Copy link"; }, 1500); }); };
  document.addEventListener("keydown", function (e) {
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable || e.metaKey || e.ctrlKey) return;
    if (e.key === " ") { e.preventDefault(); $("play").click(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); $("backF").click(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); $("fwdF").click(); }
    else if (e.key === "j" || e.key === "J") $("back5").click();
    else if (e.key === "l" || e.key === "L") $("fwd5").click();
  });
  vA.addEventListener("timeupdate", paint);
  vB.addEventListener("timeupdate", paint);
  load();
})();
</script>
</body></html>
`;
writeFileSync(`${root}/compare-drafts.html`, html);
console.log(`wrote compare-drafts.html (${drafts.length} rendered drafts, default v${drafts.at(-2).n} vs v${drafts.at(-1).n})`);
