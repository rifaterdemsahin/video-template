// Fast checks before rendering. Usage: node scripts/validate.mjs [--strict]
//   ERROR   always blocks: broken scene data, timings that overlap or leave gaps, voice longer than its slot, template not initialised
//   WARN    blocks only with --strict (used by `scripts/render.sh final`): unfilled <<...>> text, missing background or voiceover files
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STRICT = process.argv.includes("--strict");
const errors = [], warns = [];
const err = (m) => errors.push(m), warn = (m) => warns.push(m);
const J = (p) => { try { return JSON.parse(readFileSync(`${root}/${p}`, "utf8")); } catch (e) { err(`${p}: ${e.message}`); return null; } };

if (readFileSync(`${root}/video.yaml`, "utf8").includes('"{{SLUG}}"')) err("video.yaml: template not initialised. Fill it in and run ./new-video.sh <slug>");

const S = J("script/scenes.json");
const plates = Object.keys((J("prompts/backgrounds.json") || {}).plates || {});
if (S) {
  if (!Array.isArray(S.scenes) || !S.scenes.length) err("script/scenes.json: no scenes");
  const seen = new Set();
  let t = 0;
  for (const s of S.scenes || []) {
    const id = s.id || "(no id)";
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) err(`${id}: id must be lowercase letters, digits and dashes`);
    if (seen.has(id)) err(`${id}: duplicate id`);
    seen.add(id);
    if (!(s.duration > 0)) err(`${id}: duration must be above 0`);
    if (s.start !== t) err(`${id}: start is ${s.start}, expected ${t} (run node scripts/retime.mjs)`);
    t = (s.start ?? t) + (s.duration || 0);
    if (!Array.isArray(s.overlay) || !s.overlay.length) err(`${id}: overlay needs at least a headline`);
    if (!s.vo || !String(s.vo).trim()) err(`${id}: vo is empty`);
    if (typeof s.voSeconds === "number" && s.voSeconds + 0.25 > s.duration) err(`${id}: voice (${s.voSeconds}s) does not fit the ${s.duration}s slot (run node scripts/retime.mjs)`);
    const text = JSON.stringify([s.vo, s.overlay, s.broll, s.ph, s.realAsset]);
    if (text.includes("<<")) warn(`${id}: still has <<...>> placeholder text`);
    else {
      // Pacing & readability checks on filled scenes
      const words = String(s.vo).trim().split(/\s+/).filter(Boolean).length;
      const talkSec = typeof s.voSeconds === "number" ? s.voSeconds : Math.max(1, (s.duration || 1) - 1.5);
      const wpm = Math.round((words / talkSec) * 60);
      if (words >= 10 && wpm > 160) warn(`${id}: speech rate is fast (~${wpm} WPM; target 120-150 WPM)`);
      if (words >= 10 && wpm < 100) warn(`${id}: speech rate is slow (~${wpm} WPM; target 120-150 WPM)`);
      if (Array.isArray(s.overlay)) {
        const [headline, ...bodyLines] = s.overlay;
        const headWords = String(headline || "").trim().split(/\s+/).filter(Boolean).length;
        if (headWords > 6) warn(`${id}: overlay headline has ${headWords} words (recommended <= 6)`);
        if (bodyLines.length > 4) warn(`${id}: overlay has ${bodyLines.length} body lines (recommended <= 4)`);
        bodyLines.forEach((line, idx) => {
          const lw = String(line).trim().split(/\s+/).filter(Boolean).length;
          if (lw > 10) warn(`${id}: overlay line ${idx + 1} has ${lw} words (keep concise, <= 10)`);
        });
      }
    }
    const bg = s.bg || "calm";
    if (!plates.includes(bg) && !existsSync(`${root}/video/assets/bg/${bg}.jpg`)) err(`${id}: bg "${bg}" is not in prompts/backgrounds.json and has no image in video/assets/bg/`);
    if (!existsSync(`${root}/video/assets/bg/${bg}.jpg`)) warn(`${id}: missing video/assets/bg/${bg}.jpg (scripts/gen-backgrounds.sh)`);
    if (!existsSync(`${root}/video/assets/vo/${id}.mp3`)) warn(`${id}: missing video/assets/vo/${id}.mp3 (scripts/gen-voiceover.sh, or add your own)`);
  }
}
for (const f of ["spec/project.json", "spec/publish.json"]) {
  const raw = existsSync(`${root}/${f}`) ? readFileSync(`${root}/${f}`, "utf8") : null;
  if (raw === null) err(`${f}: missing`);
  else if (raw.includes("<<")) warn(`${f}: still has <<...>> fields to fill in`);
}

const show = (tag, list) => list.forEach((m) => console.log(`${tag} ${m}`));
show("ERROR", errors); show(STRICT ? "ERROR" : "WARN ", warns);
const blocking = errors.length + (STRICT ? warns.length : 0);
console.log(blocking ? `validate: ${blocking} problem(s) block the render` : `validate: ok${warns.length ? `, ${warns.length} warning(s) (final render will block on these)` : ""}`);
process.exit(blocking ? 1 : 0);
