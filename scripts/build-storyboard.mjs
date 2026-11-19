// Generates a standalone HTML storyboard reviewer at plan/storyboard.html from script/scenes.json.
// Usage: node scripts/build-storyboard.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJsonSafe = (p, fallback) => { try { return JSON.parse(readFileSync(`${root}/${p}`, "utf8")); } catch { return fallback; } };
const S = readJsonSafe("script/scenes.json", { scenes: [] });
const proj = readJsonSafe("spec/project.json", {});
const style = readJsonSafe("presets/style.json", {});
const accent = style.colors?.accent || "#4cc3d9";
const warn = style.colors?.warn || "#ffd166";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = (sec) => `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;

const scenes = S.scenes || [];
const total = scenes.reduce((acc, s) => acc + (s.duration || 0), 0);

const cards = scenes.map((s, idx) => {
  const bgName = s.bg || "calm";
  const bgExists = existsSync(`${root}/video/assets/bg/${bgName}.jpg`);
  const voExists = existsSync(`${root}/video/assets/vo/${s.id}.mp3`);
  const words = String(s.vo || "").trim().split(/\s+/).filter(Boolean).length;
  const talkSec = typeof s.voSeconds === "number" ? s.voSeconds : Math.max(1, (s.duration || 1) - 1.5);
  const wpm = Math.round((words / talkSec) * 60);
  const [headline, ...lines] = Array.isArray(s.overlay) ? s.overlay : [];

  return `
  <article class="card">
    <div class="meta">
      <span class="badge">#${idx + 1} · ${esc(s.id)}</span>
      <span class="time">${fmt(s.start || 0)} – ${fmt((s.start || 0) + (s.duration || 0))} (${s.duration}s)</span>
      <span class="wpm">${words} words · ~${wpm} WPM</span>
    </div>
    <div class="grid">
      <div class="preview ${bgExists ? "" : "no-bg"}" style="${bgExists ? `background-image:url('../video/assets/bg/${esc(bgName)}.jpg')` : ""}">
        <div class="shade"></div>
        <div class="tag">${esc(s.label)}</div>
        <div class="overlay">
          <h3>${esc(headline)}</h3>
          ${lines.map((l) => `<div class="line">${esc(l)}</div>`).join("")}
        </div>
        ${s.ph ? `<div class="ph"><strong>PLACEHOLDER:</strong> ${esc(s.ph)}</div>` : ""}
        ${!bgExists ? `<div class="missing">Missing bg: ${esc(bgName)}.jpg</div>` : ""}
      </div>
      <div class="details">
        <h4>Title: ${esc(s.title)}</h4>
        <p class="vo"><strong>Voiceover:</strong> ${esc(s.vo)}</p>
        <p class="broll"><strong>B-roll / Visual:</strong> ${esc(s.broll)}</p>
        ${s.realAsset ? `<p class="asset"><strong>Real Asset Needed:</strong> ${esc(s.realAsset)}</p>` : ""}
        <div class="audio-row">
          ${voExists ? `<audio controls src="../video/assets/vo/${esc(s.id)}.mp3"></audio>` : `<span class="missing-vo">No voiceover MP3 yet (video/assets/vo/${esc(s.id)}.mp3)</span>`}
        </div>
      </div>
    </div>
  </article>`;
}).join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Storyboard · ${esc(S.title || proj.title || "Video")}</title>
  <style>
    :root { --accent: ${accent}; --warn: ${warn}; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: #e2e8f0; padding: 32px; max-width: 1200px; margin: 0 auto; }
    header { margin-bottom: 28px; border-bottom: 1px solid #334155; padding-bottom: 16px; display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 12px; }
    h1 { font-size: 26px; color: #fff; }
    .summary { color: #94a3b8; font-size: 14px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 18px; margin-bottom: 20px; }
    .meta { display: flex; gap: 12px; align-items: center; margin-bottom: 14px; font-size: 13px; color: #94a3b8; flex-wrap: wrap; }
    .badge { background: var(--accent); color: #04222a; font-weight: 700; padding: 3px 10px; border-radius: 999px; }
    .grid { display: grid; grid-template-columns: 440px 1fr; gap: 20px; }
    @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
    .preview { position: relative; aspect-ratio: 16/9; background: #020617 center/cover; border-radius: 8px; overflow: hidden; padding: 16px; display: flex; flex-direction: column; justify-content: center; border: 1px solid #475569; }
    .shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(0,0,0,.78), rgba(0,0,0,.35)); }
    .tag { position: relative; z-index: 1; align-self: flex-start; background: var(--accent); color: #04222a; font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 4px; margin-bottom: 8px; }
    .overlay { position: relative; z-index: 1; }
    .overlay h3 { font-size: 18px; color: #fff; margin-bottom: 6px; }
    .overlay .line { font-size: 12px; background: rgba(0,0,0,.55); border-left: 3px solid var(--accent); padding: 4px 8px; margin-bottom: 4px; border-radius: 4px; }
    .ph { position: relative; z-index: 1; margin-top: 6px; font-size: 11px; border: 1px dashed var(--warn); color: var(--warn); padding: 4px 8px; border-radius: 4px; background: rgba(0,0,0,.6); }
    .missing { position: absolute; bottom: 8px; right: 8px; z-index: 2; font-size: 11px; background: #7f1d1d; color: #fecaca; padding: 2px 6px; border-radius: 4px; }
    .details { display: flex; flex-direction: column; gap: 10px; font-size: 14px; line-height: 1.5; }
    .details h4 { color: #fff; font-size: 16px; }
    .asset { color: var(--warn); }
    .missing-vo { font-size: 12px; color: #94a3b8; font-style: italic; }
    audio { width: 100%; height: 34px; margin-top: 4px; }
  </style>
</head>
<body>
  <header>
    <h1>Storyboard: ${esc(S.title || proj.title || "Untitled Video")}</h1>
    <div class="summary">${scenes.length} scenes · Total ${fmt(total)} (${total}s) · Audience: ${esc(proj.audience || "—")}</div>
  </header>
  ${cards}
</body>
</html>
`;

writeFileSync(`${root}/plan/storyboard.html`, html);
console.log(`wrote plan/storyboard.html (${scenes.length} scenes, ${fmt(total)})`);
