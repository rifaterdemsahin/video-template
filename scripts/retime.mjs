// Re-times script/scenes.json from the measured voiceover lengths and exports YouTube chapters to spec/publish.json.
//   duration = ceil(voSeconds + 1.5) whole seconds (0.25 s lead-in, room to breathe and fade); scenes without voSeconds keep their duration
//   start    = running total of the durations before it
// Usage: node scripts/retime.mjs        (gen-voiceover.sh runs it at the end)
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const path = resolve(root, "script/scenes.json");
const publishPath = resolve(root, "spec/publish.json");

const fmtTime = (sec) => {
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
};

const S = JSON.parse(readFileSync(path, "utf8"));
let t = 0;
const chapters = [];
for (const s of S.scenes) {
  if (typeof s.voSeconds === "number") s.duration = Math.ceil(s.voSeconds + 1.5);
  s.start = t;
  chapters.push(`${fmtTime(t)} ${s.title || s.label || s.id}`);
  t += s.duration;
}
S.totalSecondsApprox = t;
writeFileSync(path, JSON.stringify(S, null, 2) + "\n");

if (existsSync(publishPath)) {
  const pub = JSON.parse(readFileSync(publishPath, "utf8"));
  pub.chapters = chapters;
  writeFileSync(publishPath, JSON.stringify(pub, null, 2) + "\n");
}

for (const s of S.scenes) console.log(`${s.id}\tstart ${s.start}\t${s.duration}s${s.voSeconds ? `\t(voice ${s.voSeconds}s)` : "\t(no voice yet)"}`);
console.log(`total ${t}s (${fmtTime(t)})`);
console.log("chapters:\n" + chapters.join("\n"));
