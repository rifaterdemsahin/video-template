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
const FINAL = process.argv.includes("--final");
const DRAFT_N = (() => { try { return JSON.parse(readFileSync(`${root}/draft/versions.json`, "utf8")).latest; } catch { return 1; } })();
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const r2 = (n) => Math.round(n * 100) / 100;

const scenes = S.scenes;
const total = scenes[scenes.length - 1].start + scenes[scenes.length - 1].duration;
const VO_LEAD = 0.25; // the voice starts a quarter second into the scene

const CSS = `
    :root { --ink: #ffffff; --accent: #4cc3d9; --warn: #ffd166; --font: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    .scene { position: absolute; inset: 0; width: 1920px; height: 1080px; overflow: hidden; font-family: var(--font); color: var(--ink); opacity: 0; }
    .bg { position: absolute; inset: -60px; background-size: cover; background-position: center; transform-origin: 50% 50%; }
    .shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(0,0,0,.72) 0%, rgba(0,0,0,.45) 55%, rgba(0,0,0,.25) 100%), linear-gradient(0deg, rgba(0,0,0,.7) 0%, rgba(0,0,0,0) 38%); }
    .prog { position: absolute; left: 0; top: 0; width: 1920px; height: 8px; background: var(--accent); transform-origin: 0 50%; transform: scaleX(0); }
    .tag { position: absolute; top: 56px; left: 80px; padding: 8px 20px; border-radius: 8px; background: var(--accent); color: #04222a; font-weight: 800; font-size: 28px; letter-spacing: .08em; opacity: 0; }
    .stack { position: absolute; left: 120px; top: 210px; width: 1200px; display: flex; flex-direction: column; gap: 18px; }
    .stack.narrow { width: 820px; }
    h1 { font-size: 84px; line-height: 1.05; font-weight: 800; letter-spacing: -.02em; text-shadow: 0 4px 24px rgba(0,0,0,.6); opacity: 0; }
    .narrow h1 { font-size: 72px; }
    .line { font-size: 42px; line-height: 1.25; font-weight: 600; padding: 14px 26px; background: rgba(0,0,0,.55); border-left: 6px solid var(--accent); border-radius: 10px; opacity: 0; }
    .ph { position: absolute; right: 100px; top: 230px; width: 780px; height: 440px; border: 4px dashed var(--warn); border-radius: 18px; background: rgba(0,0,0,.55); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; text-align: center; padding: 30px; opacity: 0; }
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
    .effort { position: absolute; left: 45px; top: 250px; width: 110px; height: 80px; background: var(--accent); color: #04222a; font-weight: 800; font-size: 28px; display: flex; align-items: center; justify-content: center; border-radius: 10px; }
    .load { position: absolute; left: 655px; top: 180px; width: 190px; height: 150px; background: var(--warn); color: #3a2a00; font-weight: 800; font-size: 28px; display: flex; align-items: center; justify-content: center; border-radius: 12px; }
    .fxcap { position: absolute; left: 0; top: 460px; width: 860px; text-align: center; font-size: 32px; font-weight: 700; color: #fff; }`;

const GSAP = `<script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>`;

mkdirSync(`${root}/video/compositions`, { recursive: true });
// remove files for scenes that no longer exist
const keep = new Set(scenes.map((s) => `${s.id}.html`));
for (const f of readdirSync(`${root}/video/compositions`)) if (f.endsWith(".html") && !keep.has(f)) unlinkSync(`${root}/video/compositions/${f}`);

let rootClips = "";
let rootAudio = "";

scenes.forEach((s, i) => {
  const [head, ...lines] = s.overlay;
  const hasPh = !!s.ph;
  const fx = s.fx && s.fx.type === "leverage" ? s.fx : null;
  const dense = lines.length >= 5;
  const wide = s.phSize === "large";
  const logoFile = s.logo ? ["svg", "png", "webp", "jpg"].map((e) => `assets/logos/${s.logo}.${e}`).find((f) => existsSync(`${root}/video/${f}`)) : null;
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

  const file = `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <!-- GENERATED by scripts/build-video.mjs from script/scenes.json. Edit the script, not this file. -->
  ${GSAP}
  <style>${CSS}
  </style>
</head>
<body>
  <div data-composition-id="${s.id}" data-width="1920" data-height="1080">
    <div id="scene" class="scene">
      <div id="bg" class="bg" data-layout-ignore style="background-image:url(../assets/bg/${esc(s.bg || "calm")}.jpg)"></div>
      <div class="shade" data-layout-ignore></div>
      <div id="prog" class="prog"></div>
      <div id="tag" class="tag">${esc(s.label)}</div>
      <div class="stack${hasPh || fx ? " narrow" : ""}${dense ? " dense" : ""}${wide ? " wideph" : ""}">
        <h1 id="head">${esc(head)}</h1>
        ${lines.map((l, j) => `<p id="l${j}" class="line">${esc(l)}</p>`).join("\n        ")}
      </div>
      ${fx ? `<div id="fx" class="fx"><div id="lever" class="lever"></div><div class="fulcrum"></div><div id="effort" class="effort">YOU</div><div id="load" class="load">RESULTS</div><div class="fxcap">A small push, a bigger result</div></div>` : ""}
      ${s.logo ? (logoFile ? `<div id="logo" class="logo"><img src="../${logoFile}" alt="${esc(s.logo)} logo"></div>` : `<div id="logo" class="logo missing">${esc(s.logo)} LOGO<br>NEEDED</div>`) : ""}
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

const index = `<!doctype html>
<html lang="en" data-resolution="landscape">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=1920, height=1080" />
  <!-- GENERATED by scripts/build-video.mjs from script/scenes.json. Edit the script, not this file. -->
  ${GSAP}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 1920px; height: 1080px; overflow: hidden; background: #000; }
    #root { position: relative; width: 1920px; height: 1080px; overflow: hidden; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .draft { position: absolute; top: 56px; right: 80px; padding: 6px 16px; border: 3px solid #ffd166; color: #ffd166; border-radius: 8px; font-weight: 800; font-size: 28px; letter-spacing: .1em; opacity: .85; z-index: 10; }
  </style>
</head>
<body>
  <div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="1920" data-height="1080" data-fps="30">${rootClips}${rootAudio}
${FINAL ? "" : `    <div id="draft-tag" class="clip draft" data-start="0" data-duration="${total}" data-track-index="2">DRAFT V${DRAFT_N}</div>`}
  </div>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({ paused: true });
    window.__timelines["main"] = tl;
    tl.seek(0);
  </script>
</body>
</html>
`;
writeFileSync(`${root}/video/index.html`, index);
console.log(`wrote video/index.html + ${scenes.length} scene files in video/compositions: ${total} s (${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}), ${FINAL ? "final" : "first draft"}`);
