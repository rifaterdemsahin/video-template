// Builds performance.html from spec/performance.json (written by scripts/render-draft.mjs).
// Shows how long the pipeline takes right now (latest measured run), the history, and real deploy times from GitHub.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { P as PROJ } from "./lib/project.mjs";

const root = PROJ.root;
const P = existsSync(`${root}/spec/performance.json`) ? JSON.parse(readFileSync(`${root}/spec/performance.json`, "utf8")) : { runs: [], deploys: [] };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = (s) => (s >= 60 ? `${Math.floor(s / 60)} min ${Math.round(s % 60)} s` : `${s} s`);
const latest = (P.runs || [])[P.runs.length - 1];
const repoUrl = PROJ.repo ? `https://github.com/${PROJ.repo}` : "";

let body;
if (!latest) {
  body = `<p class="note">No run has been measured yet. Run <code>node scripts/render-draft.mjs</code> to build, check, render, and record real pipeline timings.</p>`;
} else {
  const steps = latest.steps || [];
  const max = Math.max(...steps.map((s) => s.seconds), 1);
  const total = latest.total ?? steps.reduce((a, s) => a + s.seconds, 0);
  const render = steps.find((s) => s.name.startsWith("Render"));
  const check = steps.find((s) => s.name.startsWith("Hyperframes check"));
  const speed = render && render.seconds > 0 ? (latest.videoSeconds / render.seconds).toFixed(1) : null;
  const longest = [...steps].sort((a, b) => b.seconds - a.seconds)[0];
  const deploys = (P.deploys || []).slice(0, 8);
  const dAvg = deploys.length ? Math.round(deploys.reduce((a, d) => a + d.seconds, 0) / deploys.length) : null;
  const dMax = deploys.length ? Math.round(Math.max(...deploys.map((d) => d.seconds))) : null;

  body = `
  <div class="kpis">
    <div><b>${fmt(Math.round(total))}</b><small>whole pipeline, script to published pages</small></div>
    ${render ? `<div><b>${fmt(render.seconds)}</b><small>to render ${Math.round(latest.videoSeconds)} s of video${speed ? ` (${speed}x faster than real time)` : ""}</small></div>` : ""}
    ${dAvg !== null ? `<div><b>about ${dAvg} s</b><small>for a push to go live (average of the last ${deploys.length} deploys, slowest ${dMax} s)</small></div>` : ""}
  </div>
  ${(() => { const prev = P.runs[P.runs.length - 2]; const pr = prev && prev.steps.find((x) => x.name.startsWith("Render")); if (render && pr && render.seconds > pr.seconds * 1.5) return `<p class="note">⚠️ <b>Slower than last time.</b> This render took ${fmt(render.seconds)} for ${Math.round(latest.videoSeconds)} s of film, ${(render.seconds / pr.seconds).toFixed(1)}x the previous run (${fmt(pr.seconds)} for ${Math.round(prev.videoSeconds)} s). Possible causes: other apps using the CPU or GPU.</p>`; return ""; })()}
  <p class="meas">Measured <span id="ago" data-at="${esc(latest.at)}"></span> on ${esc(latest.machine)}, Hyperframes ${esc(latest.hyperframes)}, Node ${esc(latest.node)}.</p>

  <h2>Where the time goes</h2>
  <div class="bars">${steps.map((s) => `<div class="row${s === longest ? " top" : ""}"><span class="nm">${esc(s.name)}</span><span class="tr"><i style="width:${Math.max(2, (s.seconds / max) * 100)}%"></i></span><span class="v">${fmt(s.seconds)}</span></div>`).join("")}</div>
  ${longest ? `<p>The slowest step is <b>${esc(longest.name.toLowerCase())}</b> at ${fmt(longest.seconds)}, ${Math.round((longest.seconds / Math.max(total, 1)) * 100)}% of the total.${check && render && check.seconds > render.seconds ? " The quality check takes longer than the render itself, which is the price of checking every frame's layout, motion and contrast." : ""}</p>` : ""}
  <div class="tw"><table><tr><th>Step</th><th>Time</th><th>Detail</th></tr>${steps.map((s) => `<tr><td>${esc(s.name)}</td><td>${fmt(s.seconds)}</td><td>${esc(s.note || "")}</td></tr>`).join("")}</table></div>

  ${deploys.length ? `<h2>Deploys: push to live</h2>
  <p>GitHub's own record of each Pages build (build time only; the page then needs up to a few seconds to appear everywhere).</p>
  <div class="bars">${deploys.map((d) => `<div class="row"><span class="nm">${repoUrl ? `<a href="${repoUrl}/commit/${esc(d.commit)}">${esc(d.commit)}</a>` : esc(d.commit)}</span><span class="tr"><i style="width:${Math.max(2, (d.seconds / Math.max(...deploys.map((x) => x.seconds), 1)) * 100)}%"></i></span><span class="v">${fmt(Math.round(d.seconds))}</span></div>`).join("")}</div>` : ""}

  ${P.runs.length > 1 ? `<h2>Earlier runs</h2><div class="tw"><table><tr><th>When</th><th>Total</th><th>Render</th><th>Check</th></tr>${[...P.runs].reverse().slice(1, 9).map((r) => { const rr = r.steps.find((x) => x.name.startsWith("Render")), cc = r.steps.find((x) => x.name.startsWith("Hyperframes check")); return `<tr><td>${esc(r.at.slice(0, 16).replace("T", " "))}</td><td>${fmt(Math.round(r.total))}</td><td>${rr ? fmt(rr.seconds) : "-"}</td><td>${cc ? fmt(cc.seconds) : "-"}</td></tr>`; }).join("")}</table></div>` : ""}

  <h2>What this means</h2>
  <ul>
    <li>A full draft, from changed script to a rendered, checked film, takes about <b>${fmt(Math.round(total))}</b> on this machine.</li>
    <li>Page-only changes (wording, spec, checklist) skip the render entirely and go live in about ${dAvg ?? "?"} seconds after the push.</li>
    <li>Rendering is local and free.</li>
  </ul>`;
}

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Performance · ${esc(PROJ.title)}</title>
<link rel="stylesheet" href="site.css">
<style>
.kpis{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));margin:14px 0}.kpis div{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 16px}.kpis b{display:block;font-size:26px;color:var(--accent)}.kpis small{color:var(--mute)}
.meas{color:var(--mute);font-size:14px}.bars{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 14px}
.row{display:grid;grid-template-columns:minmax(120px,300px) 1fr 90px;gap:10px;align-items:center;margin:7px 0;font-size:14px}.row .tr{background:var(--bg);border-radius:6px;height:14px;overflow:hidden}.row i{display:block;height:100%;background:var(--accent);border-radius:6px}.row.top i{background:var(--warn)}.row .v{text-align:right;font-variant-numeric:tabular-nums}
@media(max-width:600px){.row{grid-template-columns:1fr 70px}.row .tr{grid-column:1/-1;order:3}}
</style></head><body>
<script src="nav.js"></script>
<main>
  <div class="crumbs">🔍 2 Review · Performance</div>
  <h1>⏱️ Performance</h1>
  <p class="lead">How long the pipeline takes: turning <code>script/scenes.json</code> into a checked, rendered film and a published site.</p>
  <p class="note">Every number is measured by <code>scripts/render-draft.mjs</code> on the real project, not estimated. Deploy times come from GitHub. Rebuild with <code>node scripts/render-draft.mjs</code>.</p>
  ${body}
</main>
<script>
(function(){var el=document.getElementById("ago");if(!el)return;var t=new Date(el.dataset.at);
function p(){var s=Math.max(0,Math.round((Date.now()-t)/1000)),m=Math.floor(s/60),h=Math.floor(m/60);
el.textContent=s<60?"just now":m<60?m+" min ago":h<48?h+" h ago":Math.floor(h/24)+" days ago";}
p();setInterval(p,30000);})();
</script>
</body></html>
`;
writeFileSync(`${root}/performance.html`, html);
console.log(`wrote performance.html (${(P.runs || []).length} runs, ${(P.deploys || []).length} deploys)`);
