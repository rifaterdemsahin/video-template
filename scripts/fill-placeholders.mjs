// Replaces {{VIDEO_TITLE}}, {{SERIES}}, {{PUBLISH_DATE}} and {{SLUG}} in the content folders only (never in scripts, README or AGENTS.md,
// which describe the placeholders and must keep them).
// Usage: node scripts/fill-placeholders.mjs <slug>      (values for the first three come from video.yaml)
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const slug = process.argv[2];
if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) { console.error("slug must be lowercase letters, digits and dashes"); process.exit(1); }

const yaml = readFileSync(`${root}/video.yaml`, "utf8");
const get = (k) => {
  const m = yaml.match(new RegExp(`^${k}:\\s*"?(.*?)"?\\s*(#.*)?$`, "m"));
  return m ? m[1].trim() : "";
};
const vals = { VIDEO_TITLE: get("title"), SERIES: get("series"), PUBLISH_DATE: get("publish_date"), SLUG: slug };
for (const k of ["VIDEO_TITLE", "SERIES", "PUBLISH_DATE"]) {
  if (!vals[k] || vals[k].includes("{{")) { console.error(`video.yaml: fill in ${k === "VIDEO_TITLE" ? "title" : k.toLowerCase()} first`); process.exit(1); }
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(vals.PUBLISH_DATE)) { console.error("publish_date must be YYYY-MM-DD"); process.exit(1); }

// JSON files need escaped values, everything else takes the text as is
const forJson = (s) => JSON.stringify(s).slice(1, -1);
const ROOTS = [
  "script", "spec", "plan", "thumbnails", "prompts", "checklists", "presets", "video.yaml",
  "index.html", "nav.js", "master-spec.html", "script.html", "review.html", "maturity.html",
  "kanban.html", "publish.html", "release-checklist.html", "recommendations.html", "agents.html", "artifacts.html"
];
const TEXT = /\.(md|json|ya?ml|html|mjs|js|sh|txt|css)$/;
let changed = 0;
const walk = (p) => {
  if (statSync(p).isDirectory()) { for (const f of readdirSync(p)) walk(join(p, f)); return; }
  const f = p.split("/").pop();
  if (!TEXT.test(f)) return;
  const before = readFileSync(p, "utf8");
  if (!before.includes("{{")) return;
  const json = f.endsWith(".json");
  const after = before.replace(/\{\{(VIDEO_TITLE|SERIES|PUBLISH_DATE|SLUG)\}\}/g, (_, k) => (json ? forJson(vals[k]) : vals[k]));
  if (after !== before) { writeFileSync(p, after); changed++; }
};
ROOTS.forEach((r) => walk(`${root}/${r}`));
console.log(`filled placeholders in ${changed} file(s) for "${slug}"`);
