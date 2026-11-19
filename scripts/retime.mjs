// Re-times script/scenes.json from the measured voiceover lengths.
//   duration = ceil(voSeconds + 1.5) whole seconds (0.25 s lead-in, room to breathe and fade); scenes without voSeconds keep their duration
//   start    = running total of the durations before it
// Usage: node scripts/retime.mjs        (gen-voiceover.sh runs it at the end)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const path = resolve(dirname(fileURLToPath(import.meta.url)), "..", "script/scenes.json");
const S = JSON.parse(readFileSync(path, "utf8"));
let t = 0;
for (const s of S.scenes) {
  if (typeof s.voSeconds === "number") s.duration = Math.ceil(s.voSeconds + 1.5);
  s.start = t;
  t += s.duration;
}
S.totalSecondsApprox = t;
writeFileSync(path, JSON.stringify(S, null, 2) + "\n");
for (const s of S.scenes) console.log(`${s.id}\tstart ${s.start}\t${s.duration}s${s.voSeconds ? `\t(voice ${s.voSeconds}s)` : "\t(no voice yet)"}`);
console.log(`total ${t}s (${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")})`);
