// Automated quality & readiness evals for video-template.
// Usage: node tests/evals.mjs
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(resolve(root, p), "utf8");
const readJson = (p) => JSON.parse(read(p));

const results = [];
const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail });

// 1. Budget & Art Direction Eval
const project = readJson("spec/project.json");
const style = readJson("presets/style.json");
check("Budget cap < $2.00", typeof project.budgetMaxUsd === "number" && project.budgetMaxUsd <= 2.0, `budgetMaxUsd=${project.budgetMaxUsd}`);
const artKeys = ["visualStyle", "soundVoice", "musicBgm", "soundEffects", "backgrounds", "greenKey", "lowerThirds", "transitions"];
const missingArt = artKeys.filter((k) => !style.artDirection?.[k]);
check("Art Director 8-layer defaults", missingArt.length === 0, missingArt.length ? `missing: ${missingArt.join(", ")}` : "all 8 layers present");

// 2. Prompt & Panel Completeness Eval
const panel = read("panel/index.html");
check("Panel RCCT prompt framework", ["## Role", "## Context", "## Constraints", "## Task"].every((h) => panel.includes(h)), "Role/Context/Constraints/Task present");
check("Panel API key & format intake", panel.includes("falKey") && panel.includes("deepinfraKey") && panel.includes("videoFormat"), "fal.ai + DeepInfra + format present");

// 3. Scene Schema & Pacing Eval
const scenesDoc = readJson("script/scenes.json");
let t = 0;
let seqOk = true;
for (const s of scenesDoc.scenes || []) {
  if (s.start !== t) seqOk = false;
  t += s.duration;
}
check("Scene timeline continuity", seqOk && scenesDoc.scenes.length > 0, `${scenesDoc.scenes.length} scenes, total ${t}s`);

// 4. Hyperframes Determinism Eval (on generated compositions if present)
const compDir = resolve(root, "video/compositions");
const comps = existsSync(compDir) ? readdirSync(compDir).filter((f) => f.endsWith(".html")) : [];
let detOk = true;
for (const f of comps) {
  const html = readFileSync(resolve(compDir, f), "utf8");
  if (html.includes("Math.random") || html.includes("Date.now")) detOk = false;
}
check("Deterministic compositions", detOk, comps.length ? `checked ${comps.length} composition(s)` : "no generated compositions (clean template)");

// 5. Documentation & Version Eval
const ver = read("VERSION").trim();
const changelog = read("change.log");
check("Version & change.log sync", ver.length > 0 && changelog.includes(`[${ver}]`), `VERSION=${ver}`);

// Print Eval Scorecard
let failed = 0;
console.log("\n=== video-template Quality Evals ===");
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name} — ${r.detail}`);
}
console.log(`\nScore: ${results.length - failed}/${results.length} passed\n`);
process.exit(failed ? 1 : 0);
