// Builds a draft end to end, TIMING every step, and records the measurements for the Performance page.
//   node scripts/render-draft.mjs [--version=N]
// Steps: generate project -> hyperframes check -> render 1080p draft with sound -> light web copy -> scene frames -> build site pages.
// Writes: draft/vN/video.mp4, draft/vN/frames/*.jpg, draft/vN/meta.json, spec/performance.json (appends one run, keeps the last 20).
import { readFileSync, writeFileSync, mkdirSync, statSync, existsSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import os from "node:os";
import { P } from "./lib/project.mjs";

const root = P.root;
const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: root, encoding: "utf8", maxBuffer: 1 << 28, ...opts });
const S = JSON.parse(readFileSync(`${root}/script/scenes.json`, "utf8"));
const hfPkg = existsSync(`${root}/video/package.json`) ? JSON.parse(readFileSync(`${root}/video/package.json`, "utf8")) : {};
const HF_VER = (hfPkg.dependencies?.hyperframes || hfPkg.devDependencies?.hyperframes || "0.9.67").replace(/^[^\d]*/, "");

const versPath = `${root}/draft/versions.json`;
const VERS = existsSync(versPath) ? JSON.parse(readFileSync(versPath, "utf8")) : { latest: 0, versions: [] };
const argV = Number((process.argv.find((a) => a.startsWith("--version=")) || "").split("=")[1]);
const VN = argV || (VERS.latest > 0 ? VERS.latest : 1);
if (!VERS.versions.some((v) => v.n === VN)) {
  VERS.versions.push({ n: VN, date: new Date().toISOString().slice(0, 10), label: `Draft v${VN}`, changes: [] });
}
if (VN > (VERS.latest || 0)) VERS.latest = VN;
mkdirSync(`${root}/draft`, { recursive: true });
writeFileSync(versPath, JSON.stringify(VERS, null, 2) + "\n");

const VDIR = `draft/v${VN}`;
const steps = [];
const clock = () => Number(process.hrtime.bigint()) / 1e9;
function step(name, note, fn) {
  const t0 = clock();
  const extra = fn();
  const seconds = Math.round((clock() - t0) * 10) / 10;
  steps.push({ name, seconds, note: [note, extra].filter(Boolean).join(" · ") });
  console.log(`${String(seconds).padStart(6)} s  ${name}`);
}
const need = (r, what) => { if (r.status !== 0) { console.error(`${what} failed:\n${(r.stdout || "") + (r.stderr || "")}`.slice(-1500)); process.exit(1); } return r; };

mkdirSync(`${root}/${VDIR}/frames`, { recursive: true });
mkdirSync(`${root}/video/renders`, { recursive: true });
const runStart = clock();

step("Generate the Hyperframes project", `${S.scenes.length} scene files + root from scenes.json`, () => { need(sh(process.execPath, ["scripts/build-video.mjs"]), "build-video"); });

let checkSummary = "";
step("Hyperframes check", "lint, runtime, layout, motion, contrast, craft (no cache)", () => {
  const r = sh("npm", ["run", "check", "--", "--no-cache"], { cwd: `${root}/video` });
  need(r, "check");
  const out = (r.stdout || "") + (r.stderr || "");
  let e = 0, w = 0;
  for (const m of out.matchAll(/(\d+) error\(s\), (\d+) warning\(s\)/g)) { e += +m[1]; w += +m[2]; }
  checkSummary = `${e} errors, ${w} warnings`;
  return checkSummary;
});

let renderInfo = {};
step(`Render draft v${VN} (1080p, 30 fps, with sound, high quality)`, "local, drawelement capture", () => {
  const r = sh("npx", ["-y", `hyperframes@${HF_VER}`, "render", "--quality", "looks", "--output", "renders/first-draft.mp4"], { cwd: `${root}/video` });
  need(r, "render");
  const out = (r.stdout || "") + (r.stderr || "");
  const m = out.match(/rendered in ([\d.]+)s/);
  const wk = out.match(/"workerCount":(\d+)/);
  renderInfo = { reported: m ? +m[1] : null, workers: wk ? +wk[1] : null };
  return `${renderInfo.workers ?? "?"} workers`;
});

step(`Make the light web copy of draft v${VN} (1280x720 HD sharp)`, "H.264 CRF 23, AAC 128k", () => {
  need(sh("ffmpeg", ["-y", "-loglevel", "error", "-i", "video/renders/first-draft.mp4", "-vf", "scale=1280:720", "-c:v", "libx264", "-crf", "23", "-preset", "slow", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", `${VDIR}/video.mp4`]), "ffmpeg web copy");
});

step("Extract one frame per scene", `${S.scenes.length} JPG frames`, () => {
  for (const s of S.scenes) {
    const t = s.start + Math.min(s.duration * 0.45, 5.5);
    need(sh("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(t), "-i", "video/renders/first-draft.mp4", "-frames:v", "1", "-vf", "scale=640:-1", "-q:v", "4", `${VDIR}/frames/${s.id}.jpg`]), `frame ${s.id}`);
  }
});

const probe = need(sh("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", "video/renders/first-draft.mp4"]), "ffprobe").stdout.trim();
const duration = Math.round(parseFloat(probe) * 10) / 10;
const meta = {
  check: checkSummary,
  renderSeconds: renderInfo.reported ?? steps.find((x) => x.name.startsWith("Render"))?.seconds ?? null,
  workers: renderInfo.workers,
  fullBytes: statSync(`${root}/video/renders/first-draft.mp4`).size,
  webBytes: statSync(`${root}/${VDIR}/video.mp4`).size,
  duration,
  date: new Date().toISOString().slice(0, 10),
  hyperframes: HF_VER,
  version: VN,
};
writeFileSync(`${root}/${VDIR}/meta.json`, JSON.stringify(meta, null, 2) + "\n");

const cpu = (() => { try { return execFileSync("sysctl", ["-n", "machdep.cpu.brand_string"], { encoding: "utf8" }).trim(); } catch { return os.cpus()[0]?.model || "unknown"; } })();
const perfPath = `${root}/spec/performance.json`;
const perf = existsSync(perfPath) ? JSON.parse(readFileSync(perfPath, "utf8")) : { runs: [], deploys: [] };
const run = {
  at: new Date().toISOString(),
  machine: `${cpu}, ${os.cpus().length} cores, ${Math.round(os.totalmem() / 2 ** 30)} GB`,
  hyperframes: HF_VER,
  node: process.version,
  videoSeconds: duration,
  scenes: S.scenes.length,
  steps,
};
const save = () => {
  run.total = Math.round(steps.reduce((a, s) => a + s.seconds, 0) * 10) / 10;
  perf.runs = [...perf.runs.filter((r) => r.at !== run.at), run].slice(-20);
  writeFileSync(perfPath, JSON.stringify(perf, null, 2) + "\n");
};
save();

if (P.repo) {
  try {
    const raw = execFileSync("gh", ["api", `repos/${P.repo}/pages/builds?per_page=20`, "--jq", "[.[] | select(.status==\"built\") | {at: .created_at, seconds: ((.duration // 0) / 1000), commit: .commit[0:7]}]"], { encoding: "utf8" });
    perf.deploys = JSON.parse(raw).filter((d) => d.seconds > 0);
  } catch (e) { console.log("could not read Pages build history (gh not available): keeping the previous deploys"); }
  save();
}

step("Build the site pages", "storyboard, review, renders, compare-drafts, first-draft, performance", () => {
  for (const f of ["build-storyboard", "build-first-draft-page", "build-review-page", "build-renders-page", "build-compare-drafts-page"]) {
    if (existsSync(`${root}/scripts/${f}.mjs`)) need(sh(process.execPath, [`scripts/${f}.mjs`]), f);
  }
});
save();
if (existsSync(`${root}/scripts/build-performance-page.mjs`)) need(sh(process.execPath, ["scripts/build-performance-page.mjs"]), "build-performance-page");

const total = Math.round((clock() - runStart) * 10) / 10;
console.log(`\nTotal wall time ${total} s. Draft ${duration} s long, render ${renderInfo.reported ?? "?"} s, check: ${checkSummary}.`);
