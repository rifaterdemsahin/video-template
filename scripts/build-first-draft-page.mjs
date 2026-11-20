// Builds first-draft.html from draft/versions.json + draft/vN/meta.json + script/scenes.json.
// Signal over noise: the video, what is real vs still a placeholder, and what you need to do.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { P } from "./lib/project.mjs";

const root = P.root;
const J = (p) => JSON.parse(readFileSync(`${root}/${p}`, "utf8"));
const S = J("script/scenes.json");
const VERS = existsSync(`${root}/draft/versions.json`) ? J("draft/versions.json") : { latest: 0, versions: [] };
const N = VERS.latest || 0;
const DV = (VERS.versions || []).find((v) => v.n === N) || null;
const PREV = (VERS.versions || []).filter((v) => v.n !== N).sort((a, b) => b.n - a.n);

let renderedN = N;
while (renderedN > 0 && !existsSync(`${root}/draft/v${renderedN}/video.mp4`)) {
  renderedN--;
}
const hasRender = renderedN > 0;
const isRenderPending = N > 0 && renderedN !== N;
const videoSrc = hasRender ? `draft/v${renderedN}/video.mp4` : "";
const firstId = S.scenes[0]?.id || "s01-hook";
const posterSrc = N > 0 && existsSync(`${root}/draft/v${N}/frames/${firstId}.jpg`)
  ? `draft/v${N}/frames/${firstId}.jpg`
  : (hasRender && existsSync(`${root}/draft/v${renderedN}/frames/${firstId}.jpg`) ? `draft/v${renderedN}/frames/${firstId}.jpg` : "");
const M = N > 0 && existsSync(`${root}/draft/v${N}/meta.json`)
  ? J(`draft/v${N}/meta.json`)
  : (hasRender && existsSync(`${root}/draft/v${renderedN}/meta.json`) ? J(`draft/v${renderedN}/meta.json`) : null);
const DIR = `draft/v${renderedN || N || 1}`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const tc = (s) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
const total = S.scenes.length ? S.scenes[S.scenes.length - 1].start + S.scenes[S.scenes.length - 1].duration : 0;
const needs = S.scenes.filter((s) => s.ph).map((s) => ({ s, what: s.realAsset || s.ph }));

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Draft Video · ${esc(P.title)}</title>
<link rel="stylesheet" href="site.css">
<style>
.alt{display:none}body.all .alt{display:block}
video{width:100%;max-width:860px;border-radius:12px;background:#000;display:block;border:1px solid var(--line)}
.strip{display:grid;gap:8px;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));margin-top:12px;align-items:start}.sc{border:1px solid var(--line);border-radius:10px;background:var(--card);padding:6px}.sc .fbx{margin:6px 0 2px;border-style:solid}.strip button{all:unset;cursor:pointer;display:block;border:2px solid var(--line);border-radius:8px;overflow:hidden;background:var(--bg);width:100%}.strip button:hover,.strip button:focus-visible{border-color:var(--accent)}.strip img{width:100%;display:block}.strip span{display:block;padding:4px 8px;font-size:12px;color:var(--mute)}
.stat{display:flex;gap:10px 24px;flex-wrap:wrap;margin:12px 0}.stat div{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 14px}.stat b{display:block;font-size:20px;color:var(--accent)}.stat small{color:var(--mute)}
</style></head><body>
<script src="nav.js"></script>
<main>
  <div class="crumbs">🔍 2 Review · Draft Video</div>
  <h1>🎞️ ${N > 0 ? `Draft v${N}` : "Draft Video"}</h1>
  <p class="lead">${esc(P.title)}: ${tc(total)} across ${S.scenes.length} scenes, built from <code>script/scenes.json</code>.</p>
  ${M ? `<div class="stat"><div><b>${tc(Math.round(M.duration))}</b><small>length</small></div><div><b>${M.renderSeconds ?? "?"} s</b><small>to render</small></div><div><b>${esc(M.check || "—")}</b><small>Hyperframes check</small></div><div><b>${mb(M.webBytes || 0)}</b><small>web copy (full 1080p: ${mb(M.fullBytes || 0)})</small></div></div>` : ""}
  ${isRenderPending ? `<div class="note" style="margin:12px 0;background:rgba(255,209,102,.12);border-color:var(--warn);color:var(--ink)"><b>🎬 Render State:</b> Draft v${N} composition updated · Playing Draft v${renderedN} MP4 render. See all versions on the <a href="renders.html"><b>Renders page</b></a>.</div>` : ""}
  ${hasRender
    ? `<video id="v" controls preload="metadata" poster="${posterSrc}" src="${videoSrc}"></video>`
    : `<div class="note" style="margin:12px 0"><b>No draft MP4 rendered yet.</b> Run <code>node scripts/render-draft.mjs</code> (or <code>scripts/render.sh draft</code>) locally to render <code>draft/v1/video.mp4</code> and refresh this page.</div>`}
  ${DV ? `<h2 data-fb-skip>What changed in v${N}</h2>
  <div class="card"><ul>${(DV.changes || []).map((c) => `<li>${esc(c)}</li>`).join("") || "<li>Initial draft.</li>"}</ul></div>` : ""}${PREV.length ? `\n  <div class="alt card"><b>Earlier versions</b> (hidden unless <code>?all=1</code>): ${PREV.map((v) => `v${v.n} ${esc(v.label)}, ${esc(v.date)}: <a href="draft/v${v.n}/video.mp4">video</a>`).join(" · ")}</div>` : ""}
  <h2 data-fb-skip>Scenes</h2>
  <p>Click a scene to jump to it${hasRender ? ", then leave feedback right under it" : ""}.</p>
  <div class="strip">${S.scenes.map((sc, i) => {
    const frameExists = hasRender && existsSync(`${root}/${DIR}/frames/${sc.id}.jpg`);
    return `<div class="sc" id="sc-${esc(sc.id)}" data-fb="Scene ${String(i + 1).padStart(2, "0")} · ${esc(sc.title)} (${tc(sc.start)})" data-fb-id="${esc(sc.id)}" data-fb-kind="scene" data-fb-open><button data-t="${sc.start}" title="Jump to ${tc(sc.start)}">${frameExists ? `<img src="${DIR}/frames/${esc(sc.id)}.jpg" alt="" loading="lazy">` : ""}<span>${String(i + 1).padStart(2, "0")} · ${tc(sc.start)} · ${esc(sc.title)}</span></button></div>`;
  }).join("")}</div>

  ${needs.length ? `<h2>What you need to supply</h2>
  <p>These scenes wait on your footage. Everything else in the draft is generated from <code>script/scenes.json</code>.</p>
  <div class="tw"><table><tr><th>When</th><th>Scene</th><th>Footage</th></tr>${needs.map(({ s, what }) => `<tr><td>${tc(s.start)}</td><td>${esc(s.title)}</td><td>${esc(what)}</td></tr>`).join("")}</table></div>` : ""}

  <h2>Edit it in the Hyperframes Studio app</h2>
  <ol>
    <li>Open the Studio app and choose <b>Open project</b>, then pick the <code>video</code> folder of this repo. Or run <code>npx hyperframes open</code> inside <code>video/</code>.</li>
    <li>Each scene is its own file in <code>video/compositions/</code>, so the timeline shows ${S.scenes.length} scene rows plus the voiceover.</li>
    <li>For wording, edit <code>script/scenes.json</code> instead: <code>video/</code> is regenerated by <code>scripts/build-video.mjs</code>.</li>
  </ol>

  <p><small>How long this takes to build is on the <a href="performance.html">Performance</a> page. Rebuild with <code>node scripts/render-draft.mjs</code>.</small></p>
</main>
<script>
if(/[?&]all=1/.test(location.search))document.body.classList.add("all");
var v=document.getElementById("v");if(v)document.querySelectorAll(".strip button").forEach(function(b){b.onclick=function(){v.currentTime=+b.dataset.t;v.play();v.scrollIntoView({block:"center",behavior:"smooth"})}});
</script>
</body></html>
`;
writeFileSync(`${root}/first-draft.html`, html);
console.log(`wrote first-draft.html (${S.scenes.length} scenes, ${needs.length} need your footage)`);
