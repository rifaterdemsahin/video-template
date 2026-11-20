// Generates the Hyperframes project from script/scenes.json:
//   video/index.html                     root: mounts one sub-composition per scene, plus the voiceover clips
//   video/compositions/<scene-id>.html   one file per scene (background, text, placeholder frame, captions)
//   node scripts/build-video.mjs         first draft (small FIRST DRAFT tag)
//   node scripts/build-video.mjs --final no draft tag
// Rules followed (video/CLAUDE.md): timed elements have class="clip", data-start, data-duration; each composition
// registers one paused timeline on window.__timelines under its own id; no Date.now / Math.random / network at render time.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const S = JSON.parse(readFileSync(`${root}/script/scenes.json`, "utf8"));
const readJsonSafe = (p, fallback) => { try { return JSON.parse(readFileSync(`${root}/${p}`, "utf8")); } catch { return fallback; } };
const style = readJsonSafe("presets/style.json", {});
const renderCfg = readJsonSafe("presets/render.json", {});
const layoutsDoc = readJsonSafe("presets/layouts.json", { layouts: [] });
const enabledLayouts = new Set((layoutsDoc.layouts || []).filter((l) => l.enabled).map((l) => l.id));
const colors = {
  ink: "#ffffff",
  accent: "#4cc3d9",
  warn: "#ffd166",
  tagText: "#04222a",
  loadText: "#3a2a00",
  ...(style.colors || {}),
};
const font = style.font || 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const FINAL = process.argv.includes("--final");
const DRAFT_N = (() => { try { return JSON.parse(readFileSync(`${root}/draft/versions.json`, "utf8")).latest || 1; } catch { return 1; } })();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const r2 = (n) => Math.round(n * 100) / 100;

const scenes = S.scenes;
const total = scenes[scenes.length - 1].start + scenes[scenes.length - 1].duration;
const VO_LEAD = 0.25; // the voice starts a quarter second into the scene

const CSS = `
    :root { --ink: ${colors.ink}; --accent: ${colors.accent}; --warn: ${colors.warn}; --font: ${font}; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    .scene { position: absolute; inset: 0; width: 1920px; height: 1080px; overflow: hidden; font-family: var(--font); color: var(--ink); opacity: 0; }
    .bg { position: absolute; inset: -60px; background-size: cover; background-position: center; transform-origin: 50% 50%; }
    .shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(0,0,0,.72) 0%, rgba(0,0,0,.45) 55%, rgba(0,0,0,.25) 100%), linear-gradient(0deg, rgba(0,0,0,.7) 0%, rgba(0,0,0,0) 38%); }
    .prog { position: absolute; left: 0; top: 0; width: 1920px; height: 8px; background: var(--accent); transform-origin: 0 50%; transform: scaleX(0); }
    .tag { position: absolute; top: 56px; left: 80px; padding: 8px 20px; border-radius: 8px; background: var(--accent); color: ${colors.tagText}; font-weight: 800; font-size: 28px; letter-spacing: .08em; opacity: 0; }
    .stack { position: absolute; left: 120px; top: 210px; width: 1200px; display: flex; flex-direction: column; gap: 18px; }
    .stack.narrow { width: 820px; }
    h1 { font-size: 84px; line-height: 1.05; font-weight: 800; letter-spacing: -.02em; text-shadow: 0 4px 24px rgba(0,0,0,.6); opacity: 0; }
    .narrow h1 { font-size: 72px; }
    .line { font-size: 42px; line-height: 1.25; font-weight: 600; padding: 14px 26px; background: rgba(0,0,0,.55); border-left: 6px solid var(--accent); border-radius: 10px; opacity: 0; }
    .ph { position: absolute; right: 100px; top: 230px; width: 780px; height: 440px; border: 4px dashed var(--warn); border-radius: 18px; background: rgba(0,0,0,.55); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; text-align: center; padding: 30px; opacity: 0; }
    .footage { position: absolute; right: 100px; top: 230px; width: 780px; height: 440px; border-radius: 18px; overflow: hidden; border: 2px solid rgba(255,255,255,.18); background: #000; box-shadow: 0 18px 48px rgba(0,0,0,.6); opacity: 0; }
    .footage.large { right: 60px; top: 200px; width: 1000px; height: 590px; }
    .footage video, .footage img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .phi { font-size: 70px; color: var(--warn); }
    .pht { font-size: 34px; font-weight: 800; color: var(--warn); letter-spacing: .06em; }
    .phd { font-size: 28px; color: #e8ecf1; line-height: 1.3; }
    .cap { position: absolute; left: 50%; bottom: 74px; transform: translateX(-50%); width: 1560px; text-align: center; font-size: 40px; line-height: 1.3; font-weight: 600; padding: 14px 30px; background: rgba(0,0,0,.72); border-radius: 12px; opacity: 0; }
    .stack.dense { gap: 12px; top: 190px; }
    .dense .line { font-size: 34px; padding: 9px 22px; }
    .dense h1 { font-size: 66px; }
    .stack.narrow.wideph { width: 700px; }
    .wideph h1 { font-size: 60px; }
    .wideph .line { font-size: 36px; }
    .ph.large { right: 60px; top: 200px; width: 1000px; height: 590px; }
    .logo { position: absolute; right: 80px; top: 100px; width: 240px; height: 120px; border-radius: 14px; background: #fff; display: flex; align-items: center; justify-content: center; opacity: 0; }
    .logo img { max-width: 200px; max-height: 80px; }
    .logo.missing { background: rgba(0,0,0,.6); border: 4px dashed var(--warn); color: var(--warn); font-weight: 800; font-size: 28px; text-align: center; line-height: 1.15; padding: 10px; }
    .fx { position: absolute; right: 70px; top: 240px; width: 860px; height: 520px; opacity: 0; }
    .lever { position: absolute; left: 40px; top: 330px; width: 780px; height: 20px; background: #e8ecf1; border-radius: 10px; transform-origin: 480px 10px; }
    .fulcrum { position: absolute; left: 470px; top: 342px; width: 0; height: 0; border-left: 50px solid transparent; border-right: 50px solid transparent; border-bottom: 100px solid var(--accent); }
    .effort { position: absolute; left: 45px; top: 250px; width: 110px; height: 80px; background: var(--accent); color: ${colors.tagText}; font-weight: 800; font-size: 28px; display: flex; align-items: center; justify-content: center; border-radius: 10px; }
    .load { position: absolute; left: 655px; top: 180px; width: 190px; height: 150px; background: var(--warn); color: ${colors.loadText}; font-weight: 800; font-size: 28px; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
    .fxcap { position: absolute; left: 0; top: 460px; width: 860px; text-align: center; font-size: 32px; font-weight: 700; color: #fff; }
    .layout-split-left-media .stack { left: 920px; width: 880px; }
    .layout-split-left-media .ph, .layout-split-left-media .footage { right: auto; left: 80px; }
    .layout-centered-statement .tag { left: 50%; transform: translateX(-50%); }
    .layout-centered-statement .stack { left: 260px; top: 260px; width: 1400px; text-align: center; align-items: center; }
    .layout-centered-statement .line { border-left: 0; border-bottom: 4px solid var(--accent); }
    .layout-bullets-focus .stack { top: 170px; width: 1320px; gap: 12px; }
    .layout-bullets-focus h1 { font-size: 66px; }
    .layout-bullets-focus .line { font-size: 34px; padding: 10px 22px; }
    .layout-comparison-two-col .stack { left: 100px; top: 150px; width: 1720px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .layout-comparison-two-col h1 { grid-column: 1 / -1; font-size: 64px; }
    .layout-lower-third-pip .footage, .layout-lower-third-pip .ph { left: 60px; right: 60px; top: 60px; width: 1800px; height: 820px; }
    .layout-lower-third-pip .stack { left: 80px; top: auto; bottom: 200px; width: 1040px; background: rgba(0,0,0,.72); padding: 18px 24px; border-radius: 12px; }
    .layout-lower-third-pip h1 { font-size: 48px; }
    .layout-lower-third-pip .line { font-size: 28px; padding: 8px 14px; }
    .layout-quote-spotlight .stack { left: 180px; top: 250px; width: 1560px; }
    .layout-quote-spotlight h1 { font-size: 74px; border-left: 8px solid var(--accent); padding-left: 32px; }
    .layout-cta-endcard .stack { left: 120px; top: 260px; width: 1300px; }
    .layout-cta-endcard .line { border-left-color: var(--warn); }`;

const hasLocalGsap = existsSync(`${root}/video/node_modules/gsap/dist/gsap.min.js`);
const GSAP_SCENE = hasLocalGsap
  ? `<script src="../node_modules/gsap/dist/gsap.min.js"></script>`
  : `<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>`;
const GSAP_ROOT = hasLocalGsap
  ? `<script src="node_modules/gsap/dist/gsap.min.js"></script>`
  : `<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>`;

// ---------------------------------------------------------------------------------------------
// KEYNOTE STYLE ("style": "keynote" in script/scenes.json): one idea per screen, max 6 words.
// Each scene plays its `keynote` beats in order: { at, text, key, image?, visual? }.
// Beats align to word timestamps when video/assets/vo/<id>.transcript.json exists (Whisper LCS),
// or estimate from word position. Dropped overlay text is saved in HTML comments + video/notes.md.
// ---------------------------------------------------------------------------------------------
const KEYNOTE = S.style === "keynote";
const KN = { accent: style.colors?.keynoteAccent || "#2997ff", ink: style.colors?.ink || "#f5f5f7", font: "Inter", lead: 0.15, minBeat: 0.9 };
const KN_CSS = `
    :root { --kn-ink: ${KN.ink}; --kn-accent: ${KN.accent}; --kn-font: ${KN.font}, system-ui, sans-serif; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
    .scene { position: absolute; inset: 0; width: 1920px; height: 1080px; overflow: hidden; font-family: var(--kn-font); color: var(--kn-ink); opacity: 0; }
    .kn-ground { position: absolute; inset: 0; background: radial-gradient(circle at 50% 50%, #1a1a1a 0%, #000 72%); }
    .beat { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
    .kt { max-width: 1600px; text-align: center; text-wrap: balance; font-weight: 300; letter-spacing: -0.02em; line-height: 1.04; color: var(--kn-ink); opacity: 0; }
    .key { font-weight: 600; color: var(--kn-accent); }
    .kimg { position: absolute; inset: 0; background-size: cover; background-position: center; opacity: 0; }
    .kimg-shade { position: absolute; inset: 0; background: linear-gradient(0deg, rgba(0,0,0,.82) 0%, rgba(0,0,0,0) 45%); }
    .beat-img { align-items: flex-end; }
    .kcap { position: relative; margin-bottom: 120px; font-size: 96px; }
    .beat-vis { flex-direction: column; gap: 56px; }
    .kvis { width: 480px; height: 360px; overflow: visible; fill: none; stroke: var(--kn-ink); stroke-width: 7; stroke-linecap: round; stroke-linejoin: round; }
    .kvis .d { stroke-dasharray: 1; stroke-dashoffset: 1; }
    .kvis .a { stroke: var(--kn-accent); }
    .kvis .dim, .kvis .tick { stroke: rgba(245,245,247,.35); }
    .kvis .f { fill: var(--kn-accent); stroke: none; }
    .kvis .sto, .kvis .dot, .kvis .node, .kvis .st, .kvis .end, .kvis .gem { fill: none; stroke: var(--kn-ink); }
    .kvis .bar, .kvis .book, .kvis .cb:not(.f) { fill: rgba(245,245,247,.88); stroke: none; }
    .kvis .book.a { fill: var(--kn-accent); }
    .kvis .env rect, .kvis .env path { fill: none; stroke: var(--kn-ink); stroke-width: 5; }
    .kvis .env.a rect, .kvis .env.a path { stroke: var(--kn-accent); }
    .kvis .bx, .kvis .wb { fill: none; stroke: var(--kn-ink); stroke-width: 6; }
    .kvis .wb.a { stroke: var(--kn-accent); }`;

const knNorm = (w) => w.replace(/[^\p{L}\p{N}£$%'’-]/gu, "").toLowerCase();
const knSize = (text) => Math.max(140, Math.min(200, Math.floor(1560 / (Math.max(1, text.length) * 0.5))));
const knMarkup = (text, key) => {
  if (!key) return esc(text);
  const i = text.indexOf(key);
  return i < 0 ? esc(text) : `${esc(text.slice(0, i))}<span class="key">${esc(key)}</span>${esc(text.slice(i + key.length))}`;
};
const knNotes = [];

const starPath = (cx, cy, R, r) => { let d = ""; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, q = i % 2 ? r : R; d += `${i ? "L" : "M"}${r2(cx + q * Math.cos(a))} ${r2(cy + q * Math.sin(a))}`; } return d + "Z"; };
function knVisual(name, id, t) {
  const P = (d, cls = "") => `<path class="d ${cls}" pathLength="1" d="${d}"/>`;
  const draw = (cls, at, dur = 0.7, stagger = 0) => `
    tl.fromTo("#${id}-v ${cls}", { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: ${dur}, ease: "power2.out"${stagger ? `, stagger: ${stagger}` : ""} }, ${r2(t + at)});`;
  const pop = (cls, at, stagger = 0.12, origin = "50% 50%") => `
    tl.fromTo("#${id}-v ${cls}", { scale: 0, opacity: 0, transformOrigin: "${origin}" }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(1.7)", stagger: ${stagger} }, ${r2(t + at)});`;
  const V = {
    "market-fall": () => [`${P("M40 250 H360", "dim")}${P("M40 110 L110 80 L170 120 L230 100 L290 180 L360 235", "a")}`, draw(".dim", 0.05, 0.4) + draw(".a", 0.2, 0.9)],
    "balance": () => [`${P("M200 70 V245")}${P("M135 245 H265")}<g class="beam">${P("M80 100 H320")}${P("M80 100 L50 175 H110 Z")}${P("M320 100 L290 175 H350 Z", "a")}</g>`, draw(".d", 0.05, 0.7) + `\n    tl.fromTo("#${id}-v .beam", { rotation: -9, svgOrigin: "200 100" }, { rotation: 0, svgOrigin: "200 100", duration: 1.0, ease: "elastic.out(1, 0.5)" }, ${r2(t + 0.35)});`],
    "books": () => [`${[[110, 90, 160], [165, 70, 180], [220, 100, 150], [275, 80, 170]].map(([x, y, h], i) => `<rect class="book${i === 1 ? " a" : ""}" x="${x}" y="${250 - h}" width="44" height="${h}" rx="6"/>`).join("")}${P("M90 252 H340", "dim")}`, draw(".dim", 0.05, 0.4) + `\n    tl.fromTo("#${id}-v .book", { scaleY: 0, transformOrigin: "50% 100%" }, { scaleY: 1, duration: 0.5, ease: "power3.out", stagger: 0.1 }, ${r2(t + 0.15)});`],
    "stars": () => [`<defs><clipPath id="${id}-clip"><rect x="${320 - 26}" y="100" width="${r2(52 * 0.8)}" height="100"/></clipPath></defs>${[80, 140, 200, 260, 320].map((x) => `<path class="sto" d="${starPath(x, 150, 28, 12)}"/>`).join("")}${[80, 140, 200, 260].map((x) => `<path class="f sf" d="${starPath(x, 150, 28, 12)}"/>`).join("")}<path class="f sf" clip-path="url(#${id}-clip)" d="${starPath(320, 150, 28, 12)}"/>`, pop(".sto", 0.05, 0.06) + `\n    tl.fromTo("#${id}-v .sf", { opacity: 0 }, { opacity: 1, duration: 0.25, stagger: 0.12, ease: "power1.out" }, ${r2(t + 0.35)});`],
    "stop": () => { const pts = Array.from({ length: 8 }, (_, i) => { const a = Math.PI / 8 + (i * Math.PI) / 4; return `${i ? "L" : "M"}${r2(200 + 105 * Math.cos(a))} ${r2(150 + 105 * Math.sin(a))}`; }).join("") + "Z"; return [`${P(pts, "a")}${P("M145 150 H255")}`, draw(".a", 0.05, 0.7) + draw(".d:not(.a)", 0.55, 0.35)]; },
    "zero": () => [`<rect class="d" pathLength="1" x="80" y="75" width="240" height="150" rx="18"/>${P("M80 115 H320", "dim")}<rect class="f fillbar" x="110" y="165" width="180" height="26" rx="8"/>`, draw(".d", 0.05, 0.6) + `\n    tl.fromTo("#${id}-v .fillbar", { scaleX: 1, transformOrigin: "0% 50%" }, { scaleX: 0, duration: 0.9, ease: "power2.inOut" }, ${r2(t + 0.5)});`],
    "connect": () => { const out = [[70, 70], [330, 70], [70, 230], [330, 230]]; return [`${out.map(([x, y]) => P(`M${x} ${y} L200 150`, "dim")).join("")}${out.map(([x, y]) => `<circle class="node" cx="${x}" cy="${y}" r="18"/>`).join("")}<circle class="hub f" cx="200" cy="150" r="36"/>`, pop(".node", 0.05, 0.08) + draw(".dim", 0.3, 0.5, 0.06) + pop(".hub", 0.6, 0)]; },
    "shield": () => [`${P("M200 45 L300 80 V150 C300 205 260 240 200 260 C140 240 100 205 100 150 V80 Z", "a")}${P("M155 152 L190 186 L250 120")}`, draw(".a", 0.05, 0.8) + draw(".d:not(.a)", 0.6, 0.4)],
    "database": () => [`<ellipse class="d" pathLength="1" cx="200" cy="80" rx="100" ry="26"/>${P("M100 80 V220")}${P("M300 80 V220")}${P("M100 220 A100 26 0 0 0 300 220")}${P("M100 127 A100 26 0 0 0 300 127", "a")}${P("M100 174 A100 26 0 0 0 300 174", "a")}`, draw(".d:not(.a)", 0.05, 0.6) + draw(".a", 0.45, 0.4, 0.15)],
    "known-path": () => [`<circle class="f st" cx="45" cy="150" r="14"/>${P("M45 150 H335", "a")}${P("M305 120 L340 150 L305 180", "a")}`, pop(".st", 0.05, 0) + draw(".a", 0.2, 0.7)],
    "unknown-paths": () => [`<circle class="st" cx="45" cy="150" r="14"/>${P("M45 150 C120 150 140 70 220 70 S320 45 360 62", "a")}${P("M45 150 C120 150 170 150 240 160 S320 195 360 188", "a")}${P("M45 150 C120 150 140 232 220 240 S320 262 352 252", "a")}${[[360, 62], [360, 188], [352, 252]].map(([x, y]) => `<circle class="end" cx="${x}" cy="${y}" r="9"/>`).join("")}`, pop(".st", 0.05, 0) + draw(".a", 0.2, 0.8, 0.12) + pop(".end", 0.9, 0.08)],
    "bell": () => [`<g class="bellg">${P("M200 55 C150 55 128 95 128 150 V195 L108 222 H292 L272 195 V150 C272 95 250 55 200 55 Z", "a")}<circle class="f clap" cx="200" cy="240" r="14"/></g>`, draw(".a", 0.05, 0.7) + pop(".clap", 0.6, 0) + `\n    tl.fromTo("#${id}-v .bellg", { rotation: 0, svgOrigin: "200 55" }, { rotation: 12, svgOrigin: "200 55", duration: 0.18, ease: "sine.inOut", yoyo: true, repeat: 5 }, ${r2(t + 0.75)});`],
    "comment": () => [`${P("M95 70 H305 Q330 70 330 95 V185 Q330 210 305 210 H175 L125 250 V210 H95 Q70 210 70 185 V95 Q70 70 95 70 Z")}${[150, 200, 250].map((x) => `<circle class="f cd" cx="${x}" cy="140" r="13"/>`).join("")}`, draw(".d", 0.05, 0.7) + pop(".cd", 0.55, 0.12)],
    "bulb": () => [`${P("M200 50 C145 50 115 92 115 135 C115 168 135 188 155 205 V228 H245 V205 C265 188 285 168 285 135 C285 92 255 50 200 50 Z")}${P("M165 252 H235", "a")}${P("M175 274 H225", "a")}${P("M185 160 L200 120 L215 160", "a")}`, draw(".d:not(.a)", 0.05, 0.7) + draw(".a", 0.5, 0.35, 0.1)],
    "sprout": () => [`${P("M200 260 V140", "a")}${P("M200 175 C200 120 150 95 110 105 C112 150 150 178 200 175", "a")}${P("M200 150 C200 100 250 70 295 80 C292 128 250 155 200 150", "a")}${P("M120 262 H280", "dim")}`, draw(".dim", 0.05, 0.3) + draw(".a", 0.15, 0.6, 0.2)],
    "steps-up": () => [`${P("M60 250 H130 V200 H200 V150 H270 V100 H340", "d")}${P("M285 80 L345 60 L330 120", "a")}${P("M250 140 L340 62", "a")}`, draw(".d:not(.a)", 0.05, 0.8) + draw(".a", 0.6, 0.4)],
    "magnify": () => [`<circle class="d" pathLength="1" cx="175" cy="130" r="72"/>${P("M228 183 L300 255", "a")}${P("M140 130 H210", "dim")}${P("M140 105 H195", "dim")}${P("M140 155 H185", "dim")}`, draw(".d:not(.a):not(.dim)", 0.05, 0.6) + draw(".a", 0.45, 0.35) + draw(".dim", 0.6, 0.3, 0.08)],
    "checklist": () => [`${[80, 150, 220].map((y) => `<rect class="bx" x="90" y="${y - 22}" width="44" height="44" rx="8"/>${P(`M160 ${y} H310`, "dim")}${P(`M100 ${y} L111 ${y + 12} L128 ${y - 12}`, "a ck")}`).join("")}`, pop(".bx", 0.05, 0.1) + draw(".dim", 0.2, 0.4, 0.1) + draw(".ck", 0.5, 0.3, 0.2)],
    "loop": () => [`${P("M200 60 A90 90 0 1 1 112 170", "a")}${P("M101 195 L112 170 L132 188", "a")}<circle class="f lp" cx="200" cy="60" r="12"/>`, draw(".a", 0.05, 0.9, 0.1) + pop(".lp", 0.7, 0)],
    "lever": () => [`${P("M170 250 L200 205 L230 250 Z")}<g class="beam">${P("M60 205 H340", "a")}<circle class="f box" cx="80" cy="185" r="18"/></g>`, draw(".d:not(.a)", 0.05, 0.5) + draw(".a", 0.25, 0.5) + pop(".box", 0.5, 0) + `\n    tl.fromTo("#${id}-v .beam", { rotation: 0, svgOrigin: "200 205" }, { rotation: 14, svgOrigin: "200 205", duration: 0.7, ease: "power2.inOut" }, ${r2(t + 0.8)});`],
    "workflow": () => [`${[20, 160, 300].map((x, i) => `<rect class="wb${i === 2 ? " a" : ""}" x="${x}" y="110" width="80" height="80" rx="14"/>`).join("")}${P("M108 150 H150", "dim")}${P("M248 150 H290", "dim")}${P("M138 138 L150 150 L138 162", "dim")}${P("M278 138 L290 150 L278 162", "dim")}`, pop(".wb", 0.05, 0.2) + draw(".dim", 0.3, 0.3, 0.1)],
    "agent": () => [`<rect class="d" pathLength="1" x="120" y="95" width="160" height="125" rx="28"/>${P("M200 95 V65")}<circle class="f eye" cx="165" cy="150" r="13"/><circle class="f eye" cx="235" cy="150" r="13"/>${P("M170 190 H230", "a")}<circle class="st" cx="200" cy="58" r="9"/>`, draw(".d:not(.a)", 0.05, 0.6) + pop(".eye", 0.5, 0.1) + draw(".a", 0.7, 0.3) + pop(".st", 0.4, 0)],
    "arrow-down": () => [`<g class="arr">${P("M200 45 V235", "a")}${P("M140 178 L200 238 L260 178", "a")}</g>`, draw(".a", 0.05, 0.6) + `\n    tl.fromTo("#${id}-v .arr", { y: 0 }, { y: 16, duration: 0.45, ease: "sine.inOut", yoyo: true, repeat: 5 }, ${r2(t + 0.7)});`],
  };
  if (!V[name]) throw new Error(`unknown keynote visual "${name}"`);
  const [body, js] = V[name]();
  return { svg: `<svg id="${id}-v" class="kvis" viewBox="0 0 400 300" aria-hidden="true" data-layout-ignore>${body}</svg>`, js };
}

function knWordTimes(s, voDur) {
  const words = s.vo.split(/\s+/).filter(Boolean).map(knNorm);
  const est = words.map((_, j) => (voDur * j) / Math.max(1, words.length));
  const f = `${root}/video/assets/vo/${s.id}.transcript.json`;
  if (!existsSync(f)) return { times: est, source: "estimate" };
  const tw = JSON.parse(readFileSync(f, "utf8")).words.map((w) => ({ n: knNorm(w.text), t: w.start })).filter((w) => w.n);
  const n = words.length, m = tw.length;
  const L = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
  for (let a = n - 1; a >= 0; a--) for (let b = m - 1; b >= 0; b--) L[a][b] = words[a] === tw[b].n ? L[a + 1][b + 1] + 1 : Math.max(L[a + 1][b], L[a][b + 1]);
  const times = new Array(n).fill(null);
  for (let a = 0, b = 0; a < n && b < m;) { if (words[a] === tw[b].n) { times[a] = tw[b].t; a++; b++; } else if (L[a + 1][b] >= L[a][b + 1]) a++; else b++; }
  for (let a = 0; a < n; a++) if (times[a] == null) {
    let p = a - 1; while (p >= 0 && times[p] == null) p--;
    let q = a + 1; while (q < n && times[q] == null) q++;
    const t0 = p >= 0 ? times[p] : 0, t1 = q < n ? times[q] : voDur;
    times[a] = t0 + ((t1 - t0) * (a - p)) / (q - p);
  }
  return { times, source: "transcript" };
}

function keynoteFile(s, i, voDur) {
  const sid = s.id.split("-")[0];
  const words = s.vo.split(/\s+/).filter(Boolean).map(knNorm);
  let pos = -1;
  const wt = knWordTimes(s, voDur);
  const beats = (s.keynote || [{ text: (s.overlay || [s.title])[0], key: "" }]).map((b, k) => {
    let t = 0;
    if (k > 0 && b.at) {
      const aw = b.at.split(/\s+/).map(knNorm);
      const idx = words.findIndex((_, j) => j > pos && aw.every((w, q) => words[j + q] === w));
      if (idx < 0) throw new Error(`${s.id}: keynote anchor "${b.at}" not found in the voiceover after word ${pos}`);
      pos = idx;
      t = Math.max(0.4, VO_LEAD + wt.times[idx] - KN.lead);
    } else if (k > 0) {
      t = r2((s.duration * k) / s.keynote.length);
    }
    return { ...b, id: `${sid}-k${k}`, t: r2(t) };
  });
  beats.forEach((b, k) => {
    const end = k + 1 < beats.length ? beats[k + 1].t : s.duration;
    b.d = r2(end - b.t);
    const need = r2(0.68 + 0.225 * b.text.split(/\s+/).filter((w) => /[\p{L}\p{N}£$%]/u.test(w)).length);
    if (b.d < need) console.warn(`  ! ${s.id} beat "${b.text}" is ${b.d}s, under its ${need}s reading floor: merge or drop it`);
  });

  const moved = [...(s.overlay || [])];
  knNotes.push({ s, beats, moved });

  const html = beats.map((b, k) => {
    const start = k === 0 ? "0" : beats[k - 1].id;
    if (b.image) {
      return `
      <div id="${b.id}" class="clip beat beat-img" data-start="${start}" data-duration="${b.d}" data-track-index="2">
        <div id="${b.id}-img" class="kimg" data-layout-ignore style="background-image:url(../assets/bg/${esc(b.image)}.jpg)"></div>
        <div class="kimg-shade" data-layout-ignore></div>
        <p id="${b.id}-t" class="kt kcap">${knMarkup(b.text, b.key)}</p>
      </div>`;
    }
    if (b.visual) {
      b.vis = knVisual(b.visual, b.id, b.t);
      return `
      <div id="${b.id}" class="clip beat beat-vis" data-start="${start}" data-duration="${b.d}" data-track-index="2">
        ${b.vis.svg}
        <h1 id="${b.id}-t" class="kt" style="font-size:${Math.min(150, knSize(b.text))}px">${knMarkup(b.text, b.key)}</h1>
      </div>`;
    }
    return `
      <div id="${b.id}" class="clip beat" data-start="${start}" data-duration="${b.d}" data-track-index="2">
        <h1 id="${b.id}-t" class="kt" style="font-size:${knSize(b.text)}px">${knMarkup(b.text, b.key)}</h1>
      </div>`;
  }).join("");

  let js = `
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    ${i === 0 ? `tl.set("#scene", { opacity: 1 }, 0);` : `tl.fromTo("#scene", { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power1.out" }, 0);`}
${i === scenes.length - 1 ? "" : `    tl.to("#scene", { opacity: 0, duration: 0.4, ease: "power1.in" }, ${r2(s.duration - 0.4)});`}`;
  beats.forEach((b, k) => {
    const last = k === beats.length - 1;
    js += i === 0 && k === 0 ? `
    tl.set("#${b.id}-t", { opacity: 1, y: 0 }, 0);` : `
    tl.fromTo("#${b.id}-t", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, ${b.t});`;
    js += `
    tl.fromTo("#${b.id}-t", { scale: 1 }, { scale: 1.03, duration: ${b.d}, ease: "none" }, ${b.t});`;
    if (b.image) js += `
    tl.fromTo("#${b.id}-img", { opacity: 0, scale: 1 }, { opacity: 1, scale: 1.08, duration: ${b.d}, ease: "none" }, ${b.t});`;
    if (b.vis) js += b.vis.js;
    if (!last) js += `
    tl.to("#${b.id}-t", { opacity: 0, duration: 0.25, ease: "power1.in" }, ${r2(b.t + b.d - 0.3)});`;
    if (b.vis && !last) js += `
    tl.to("#${b.id}-v", { opacity: 0, duration: 0.25, ease: "power1.in" }, ${r2(b.t + b.d - 0.3)});`;
  });
  js += `
    window.__timelines["${s.id}"] = tl;
    tl.seek(0);`;

  const comment = moved.length ? `\n      <!-- moved to VO: ${moved.map((m) => m.replace(/--/g, "–")).join(" | ")} -->` : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <!-- GENERATED by scripts/build-video.mjs (keynote style) from script/scenes.json. Edit the script, not this file. -->
  ${GSAP_SCENE}
  <style>${KN_CSS}
  </style>
</head>
<body>
  <div data-composition-id="${s.id}" data-duration="${s.duration}" data-width="1920" data-height="1080">
    <div id="scene" class="scene">
      <div class="kn-ground" data-layout-ignore></div>${comment}${html}
    </div>
    <script>${js}
    </script>
  </div>
</body>
</html>
`;
}

function keynoteNotes() {
  const tc = (x) => `${Math.floor(x / 60)}:${(x % 60).toFixed(1).padStart(4, "0")}`;
  const out = [
    "# Keynote cut: notes",
    "",
    "GENERATED by `scripts/build-video.mjs` from `script/scenes.json` (`\"style\": \"keynote\"`). Edit the script, not this file.",
    "",
    "Every frame follows the keynote rules: one idea per screen, at most 6 words, no lists, one accent colour, 140 to 200 px type on black.",
    "",
  ];
  for (const { s, beats, moved } of knNotes) {
    out.push(`## ${s.id} (${tc(s.start)} to ${tc(s.start + s.duration)})`, "", "| On screen at | Beat | Seconds |", "|---|---|---|");
    for (const b of beats) out.push(`| ${tc(s.start + b.t)} | ${b.image ? `[image: ${b.image}] ` : ""}${b.visual ? `[visual: ${b.visual}] ` : ""}${b.text} | ${b.d} |`);
    if (moved.length) out.push("", "Moved to VO:", "", ...moved.map((m) => `- ${m}`), "");
  }
  return out.join("\n");
}

mkdirSync(`${root}/video/compositions`, { recursive: true });
// remove files for scenes that no longer exist
const keep = new Set(scenes.map((s) => `${s.id}.html`));
for (const f of readdirSync(`${root}/video/compositions`)) if (f.endsWith(".html") && !keep.has(f)) unlinkSync(`${root}/video/compositions/${f}`);

let rootClips = "";
let rootAudio = "";

scenes.forEach((s, i) => {
  const [head, ...lines] = s.overlay;
  const footageFile = ["mp4", "webm", "mov", "jpg", "png", "webp"].map((e) => `assets/footage/${s.id}.${e}`).find((f) => existsSync(`${root}/video/${f}`));
  const hasFootage = !!footageFile;
  const hasPh = !!s.ph && !hasFootage;
  const fx = s.fx && s.fx.type === "leverage" ? s.fx : null;
  const dense = lines.length >= 5;
  const wide = s.phSize === "large";
  const logoFile = s.logo ? ["svg", "png", "webp", "jpg"].map((e) => `assets/logos/${s.logo}.${e}`).find((f) => existsSync(`${root}/video/${f}`)) : null;
  const layoutId = s.layout && (!enabledLayouts.size || enabledLayouts.has(s.layout)) ? s.layout : "";
  const layoutClass = layoutId ? ` layout-${esc(layoutId)}` : "";
  const voDur = s.voSeconds || s.duration - 0.5;
  const voLocal = VO_LEAD; // local time inside the scene

  // captions: sentences timed by their share of the words. Very short sentences join the next one so none flashes by.
  let sentences = s.vo.split(/(?<=[.?!])\s+/).filter(Boolean);
  for (let k = 0; k < sentences.length - 1; k++) if (sentences[k].split(/\s+/).length < 4) { sentences[k + 1] = `${sentences[k]} ${sentences[k + 1]}`; sentences.splice(k, 1); k--; }
  const words = sentences.map((x) => x.split(/\s+/).length);
  const wTotal = words.reduce((a, b) => a + b, 0);
  let acc = 0;
  let caps = sentences.map((x, k) => {
    const t0 = voLocal + (voDur * acc) / wTotal; acc += words[k];
    const t1 = voLocal + (voDur * acc) / wTotal;
    return { text: x, t0, t1, w: words[k] };
  });
  // the last caption holds until just before the scene fades out
  caps[caps.length - 1].t1 = Math.max(caps[caps.length - 1].t1, s.duration - 0.45);
  // a caption needs about 0.5 s + 0.3 s per word on screen to be read: merge any that would flash by into the previous one
  for (let k = caps.length - 1; k > 0; k--) {
    if (caps[k].t1 - caps[k].t0 < 0.5 + 0.3 * caps[k].w) {
      caps[k - 1] = { text: `${caps[k - 1].text} ${caps[k].text}`, t0: caps[k - 1].t0, t1: caps[k].t1, w: caps[k - 1].w + caps[k].w };
      caps.splice(k, 1);
    }
  }
  if (caps.length > 1 && caps[0].t1 - caps[0].t0 < 0.5 + 0.3 * caps[0].w) {
    caps[1] = { text: `${caps[0].text} ${caps[1].text}`, t0: caps[0].t0, t1: caps[1].t1, w: caps[0].w + caps[1].w };
    caps.shift();
  }

  let js = `
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    tl.fromTo("#scene", { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power1.out" }, 0);
${i === scenes.length - 1 ? "" : `tl.to("#scene", { opacity: 0, duration: 0.4, ease: "power1.in" }, ${r2(s.duration - 0.4)});`}
    tl.fromTo("#bg", { scale: 1, x: 0 }, { scale: 1.18, x: -50, duration: ${s.duration}, ease: "none" }, 0);
    tl.fromTo("#prog", { scaleX: 0 }, { scaleX: 1, duration: ${s.duration}, ease: "none" }, 0);
    tl.fromTo("#tag", { opacity: 0, y: -16 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, 0.3);
    tl.fromTo("#head", { opacity: 0, y: 36 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, 0.5);`;
  lines.forEach((_, j) => {
    const spread = i === scenes.length - 1 ? 0.5 : 0.72; // the last scene brings its lines in earlier so the film ends on a held frame
    const t = voLocal + voDur * (0.1 + (spread * (j + 1)) / (lines.length + 0.5));
    js += `
    tl.fromTo("#l${j}", { opacity: 0, x: -50 }, { opacity: 1, x: 0, duration: 0.55, ease: "power3.out" }, ${r2(Math.min(t, s.duration - 1.2))});`;
  });
  if (fx) {
    // lever: the lever swings so a small push lifts the load; then it keeps rocking gently until the scene ends
    const cue = caps.find((c) => new RegExp(fx.cue || "leverage", "i").test(c.text)) || caps[Math.floor(caps.length / 2)];
    const t0 = Math.max(0.6, cue.t0 - 0.3);
    const swing = (a, ey, ly, at, dur) => `
    tl.to("#lever", { rotation: ${a}, duration: ${dur}, ease: "power2.inOut" }, ${r2(at)});
    tl.to("#effort", { y: ${ey}, duration: ${dur}, ease: "power2.inOut" }, ${r2(at)});
    tl.to("#load", { y: ${ly}, duration: ${dur}, ease: "power2.inOut" }, ${r2(at)});`;
    js += `
    tl.fromTo("#fx", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, ${r2(t0)});
    tl.set("#lever", { rotation: 14 }, 0); tl.set("#effort", { y: -102 }, 0); tl.set("#load", { y: 56 }, 0);`;
    js += swing(-14, 102, -56, t0 + 0.7, 1.6);
    let t = t0 + 0.7 + 1.6 + 0.5, up = false;
    while (t + 1.4 < s.duration - 0.6) { js += up ? swing(-14, 102, -56, t, 1.4) : swing(-6, 44, -24, t, 1.4); up = !up; t += 1.9; }
  }
  if (s.logo) js += `
    tl.fromTo("#logo", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.6, ease: "power3.out" }, 1.2);`;
  if (hasFootage) js += `
    tl.fromTo("#footage", { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.7, ease: "power3.out" }, 0.9);`;
  if (hasPh) js += `
    tl.fromTo("#ph", { opacity: 0, scale: 0.94 }, { opacity: 1, scale: 1, duration: 0.7, ease: "power3.out" }, 0.9);`;
  caps.forEach((c, k) => {
    js += `
    tl.fromTo("#c${k}", { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.25, ease: "power2.out" }, ${r2(c.t0)});
    tl.to("#c${k}", { opacity: 0, duration: 0.2, ease: "power1.in" }, ${r2(Math.max(c.t0 + 0.3, c.t1 - 0.2))});`;
  });
  js += `
    window.__timelines["${s.id}"] = tl;
    tl.seek(0);`;

  const file = KEYNOTE ? keynoteFile(s, i, voDur) : `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <!-- GENERATED by scripts/build-video.mjs from script/scenes.json. Edit the script, not this file. -->
  ${GSAP_SCENE}
  <style>${CSS}
  </style>
</head>
<body>
  <div data-composition-id="${s.id}" data-width="1920" data-height="1080">
    <div id="scene" class="scene${layoutClass}">
      <div id="bg" class="bg" data-layout-ignore style="background-image:url(../assets/bg/${esc(s.bg || "calm")}.jpg)"></div>
      <div class="shade" data-layout-ignore></div>
      <div id="prog" class="prog"></div>
      <div id="tag" class="tag">${esc(s.label)}</div>
      <div class="stack${hasPh || hasFootage || fx ? " narrow" : ""}${dense ? " dense" : ""}${wide ? " wideph" : ""}">
        <h1 id="head">${esc(head)}</h1>
        ${lines.map((l, j) => `<p id="l${j}" class="line">${esc(l)}</p>`).join("\n        ")}
      </div>
      ${fx ? `<div id="fx" class="fx"><div id="lever" class="lever"></div><div class="fulcrum"></div><div id="effort" class="effort">YOU</div><div id="load" class="load">RESULTS</div><div class="fxcap">A small push, a bigger result</div></div>` : ""}
      ${s.logo ? (logoFile ? `<div id="logo" class="logo"><img src="../${logoFile}" alt="${esc(s.logo)} logo"></div>` : `<div id="logo" class="logo missing">${esc(s.logo)} LOGO<br>NEEDED</div>`) : ""}
      ${hasFootage ? `<div id="footage" class="footage${wide ? " large" : ""}">${/\.(mp4|webm|mov)$/i.test(footageFile) ? `<video muted playsinline src="../${footageFile}"></video>` : `<img src="../${footageFile}" alt="${esc(s.title)}">`}</div>` : ""}
      ${hasPh ? `<div id="ph" class="ph${wide ? " large" : ""}"><div class="phi">▶</div><div class="pht">YOUR FOOTAGE GOES HERE</div><div class="phd">${esc(s.ph)}</div></div>` : ""}
      ${caps.map((c, k) => `<div id="c${k}" class="cap">${esc(c.text)}</div>`).join("\n      ")}
    </div>
    <script>${js}
    </script>
  </div>
</body>
</html>
`;
  writeFileSync(`${root}/video/compositions/${s.id}.html`, file);

  rootClips += `
    <div id="scene-${esc(s.id)}" class="clip" data-composition-id="${esc(s.id)}" data-composition-src="compositions/${esc(s.id)}.html" data-start="${s.start}" data-duration="${s.duration}" data-track-index="0"></div>`;
  rootAudio += `
    <audio id="vo-${esc(s.id)}" src="assets/vo/${esc(s.id)}.mp3" data-start="${r2(s.start + VO_LEAD)}" data-duration="${r2(Math.max(0.5, voDur - 0.06))}" data-track-index="1"></audio>`;
});

const bgmCfg = renderCfg.bgm || {};
const hasPreMixedMusic = existsSync(`${root}/video/assets/music/bed-mix.mp3`);
const hasBgm = !hasPreMixedMusic && bgmCfg.file && existsSync(`${root}/video/${bgmCfg.file}`);
const bgmVol = typeof bgmCfg.volume === "number" ? bgmCfg.volume : 0.25;
const bgmDuck = typeof bgmCfg.duckedVolume === "number" ? bgmCfg.duckedVolume : 0.08;
if (hasPreMixedMusic) {
  rootAudio += `
    <audio id="music" src="assets/music/bed-mix.mp3" data-start="0" data-duration="${total}" data-track-index="3"></audio>`;
} else if (hasBgm) {
  rootAudio += `
    <audio id="bgm" src="${esc(bgmCfg.file)}" data-start="0" data-duration="${total}" data-track-index="3"></audio>`;
}

let bgmJs = "";
if (hasBgm) {
  bgmJs = `\n    tl.set("#bgm", { volume: ${bgmVol} }, 0);`;
  scenes.forEach((s) => {
    const voDur = s.voSeconds || s.duration - 0.5;
    const tIn = r2(s.start + VO_LEAD);
    const tOut = r2(Math.min(total, tIn + voDur));
    bgmJs += `\n    tl.to("#bgm", { volume: ${bgmDuck}, duration: 0.3, ease: "power1.out" }, ${Math.max(0, r2(tIn - 0.2))});`;
    bgmJs += `\n    tl.to("#bgm", { volume: ${bgmVol}, duration: 0.4, ease: "power1.in" }, ${tOut});`;
  });
}

const index = `<!doctype html>
<html lang="en" data-resolution="landscape">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1920, height=1080" />
  <!-- GENERATED by scripts/build-video.mjs from script/scenes.json. Edit the script, not this file. -->
  ${GSAP_ROOT}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 1920px; height: 1080px; overflow: hidden; background: #000; }
    #root { position: relative; width: 1920px; height: 1080px; overflow: hidden; font-family: ${font}; }
    .draft { position: absolute; top: 56px; right: 80px; padding: 6px 16px; border: 3px solid ${colors.warn}; color: ${colors.warn}; border-radius: 8px; font-weight: 800; font-size: 28px; letter-spacing: .1em; opacity: .85; z-index: 10; }
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="1920" data-height="1080" data-fps="30">${rootClips}${rootAudio}
${FINAL ? "" : `    <div id="draft-tag" class="clip draft" data-start="0" data-duration="${total}" data-track-index="2">DRAFT V${DRAFT_N}</div>`}
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });${bgmJs}
    window.__timelines["main"] = tl;
    tl.seek(0);
  </script>
</body>
</html>
`;
writeFileSync(`${root}/video/index.html`, index);
if (KEYNOTE) writeFileSync(`${root}/video/notes.md`, keynoteNotes());
console.log(`wrote video/index.html + ${scenes.length} scene files${KEYNOTE ? " (keynote style)" : ""} in video/compositions: ${total} s (${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}), ${FINAL ? "final" : "draft v" + DRAFT_N}`);
