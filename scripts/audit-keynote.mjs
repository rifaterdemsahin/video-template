// Keynote text audit: steps every scene's timeline in headless Chrome and flags each on-screen moment
// that breaks the "Steve Jobs keynote" rules (one idea per screen, almost no text).
//   node scripts/audit-keynote.mjs --label=v10 [--mp4=draft/v10/video.mp4] [--step=0.25]
// Writes docs/keynote-audit/<label>.json, docs/keynote-audit/<label>.md, a 2 s contact sheet and one
// thumbnail per flagged moment (taken from the MP4, so text inside images or video shows up too).
// No dependencies: drives Google Chrome over the DevTools protocol with Node's built-in WebSocket.
//
// A moment is TOO MUCH TEXT when any of these hold:
//   words>6 · lines>2 · list (li, bullet, numbered, " · " run) · >1 text element (tiny labels excepted)
//   · font-size <96px (1920x1080) · text boxes cover >20% of the frame
import { spawn, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, rmSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import os from "node:os";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || "").split("=")[1] || d;
const LABEL = arg("label", "current");
const MP4 = arg("mp4", "");
const STEP = Number(arg("step", "0.25"));
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const S = JSON.parse(readFileSync(`${root}/script/scenes.json`, "utf8"));
const OUT = `${root}/docs/keynote-audit`;
mkdirSync(`${OUT}/${LABEL}`, { recursive: true });

// ---- Chrome over CDP
const port = 9400 + Math.floor((process.pid % 500));
const profile = mkdtempSync(join(os.tmpdir(), "kn-audit-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--hide-scrollbars", "--allow-file-access-from-files", "--window-size=1920,1080", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page"); } catch {}
}
if (!target) { chrome.kill(); throw new Error("Chrome did not start"); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let seq = 0;
const pending = new Map();
const waiters = [];
ws.addEventListener("message", (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  else if (m.method) waiters.filter((w) => w.method === m.method).forEach((w) => { waiters.splice(waiters.indexOf(w), 1); w.res(m.params); });
});
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const once = (method) => new Promise((res) => waiters.push({ method, res }));
await cdp("Page.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });

// ---- the in-page audit (runs inside each scene file)
const AUDIT = String(async function audit(sceneId, dur, step) {
  for (let i = 0; i < 100 && !(window.__timelines && window.__timelines[sceneId]); i++) await new Promise((r) => setTimeout(r, 50));
  await document.fonts.ready;
  const tl = window.__timelines[sceneId];
  const comp = document.querySelector(`[data-composition-id="${sceneId}"]`);
  const W = 1920, H = 1080;
  // timed elements: emulate the runtime (shown over [start, start + duration)), relative starts "id" or "id + n"
  const timed = [...comp.querySelectorAll("[data-start]")];
  const cache = new Map();
  const startOf = (el, depth = 0) => {
    if (cache.has(el)) return cache.get(el);
    const raw = (el.dataset.start || "0").trim();
    let v = Number(raw);
    if (Number.isNaN(v)) {
      const m = raw.match(/^([\w-]+)(?:\s*([+-])\s*([\d.]+))?$/);
      const ref = m && document.getElementById(m[1]);
      v = ref && depth < 50 ? startOf(ref, depth + 1) + Number(ref.dataset.duration || 0) + (m[2] ? (m[2] === "-" ? -1 : 1) * Number(m[3]) : 0) : 0;
    }
    cache.set(el, v);
    return v;
  };
  const effOpacity = (el) => {
    let o = 1;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === "none" || cs.visibility === "hidden") return 0;
      o *= Number(cs.opacity);
    }
    return o;
  };
  const nameOf = (el) => { for (let e = el; e && e !== comp; e = e.parentElement) if (e.id) return e.id === el.id ? `#${e.id}` : `#${e.id} ${el.tagName.toLowerCase()}${el.classList[0] ? "." + el.classList[0] : ""}`; return el.tagName.toLowerCase(); };
  const moments = [];
  let prevSig = null;
  for (let t = 0; t < dur - 1e-6; t += step) {
    tl.seek(t, false);
    for (const el of timed) { const s = startOf(el), d = Number(el.dataset.duration || 1e9); el.style.visibility = t >= s && t < s + d ? "" : "hidden"; }
    // text blocks: nearest non-inline ancestor of each text node with letters or digits
    const blocks = new Map();
    const walker = document.createTreeWalker(comp, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode());) {
      if (!/[\p{L}\p{N}]/u.test(n.textContent)) continue;
      const p = n.parentElement;
      if (!p || p.closest("script,style")) continue;
      let b = p;
      while (b !== comp && getComputedStyle(b).display.startsWith("inline")) b = b.parentElement;
      if (!blocks.has(b)) blocks.set(b, []);
      blocks.get(b).push(n);
    }
    const items = [];
    for (const [b, nodes] of blocks) {
      if (effOpacity(nodes[0].parentElement) < 0.15) continue;
      const rects = [];
      let minFont = 1e9;
      for (const n of nodes) {
        if (effOpacity(n.parentElement) < 0.15) continue;
        const r = document.createRange(); r.selectNodeContents(n);
        for (const q of r.getClientRects()) {
          const x0 = Math.max(0, q.left), y0 = Math.max(0, q.top), x1 = Math.min(W, q.right), y1 = Math.min(H, q.bottom);
          if (x1 - x0 > 1 && y1 - y0 > 1) rects.push({ x0, y0, x1, y1 });
        }
        minFont = Math.min(minFont, parseFloat(getComputedStyle(n.parentElement).fontSize));
      }
      if (!rects.length) continue;
      const text = nodes.filter((n) => effOpacity(n.parentElement) >= 0.15).map((n) => n.textContent).join(" ").replace(/\s+/g, " ").trim();
      const words = text.split(" ").filter((w) => /[\p{L}\p{N}£$%]/u.test(w)).length;
      const lines = new Set(rects.map((q) => Math.round(q.y0 / 6))).size;
      const area = rects.reduce((a, q) => a + (q.x1 - q.x0) * (q.y1 - q.y0), 0);
      const list = !!b.closest("li,ul,ol") || /^\s*([•\-–]|\d+[.)]\s|\d️?⃣)/u.test(text) || /\s·\s/.test(text) || /\d️?⃣.*\d️?⃣/u.test(text);
      items.push({ id: nameOf(b), text, words, lines, font: Math.round(minFont), area, list });
    }
    const tiny = (it) => it.words <= 2 && it.font <= 40;
    const main = items.filter((it) => !tiny(it));
    const words = items.reduce((a, i) => a + i.words, 0);
    const lines = items.reduce((a, i) => a + i.lines, 0);
    const area = items.reduce((a, i) => a + i.area, 0) / (W * H);
    const flags = [];
    if (words > 6) flags.push(`${words} words`);
    if (lines > 2) flags.push(`${lines} lines`);
    if (items.some((i) => i.list)) flags.push("list");
    if (main.length > 1) flags.push(`${main.length} text elements`);
    const minF = Math.min(...items.map((i) => i.font));
    if (items.length && minF < 96) flags.push(`font ${minF}px`);
    if (area > 0.2) flags.push(`${Math.round(area * 100)}% text area`);
    const sig = items.map((i) => i.id + "|" + i.text).sort().join("\n");
    if (sig !== prevSig) { moments.push({ t: Math.round(t * 100) / 100, items: items.map(({ area, ...r }) => r), words, lines, area: Math.round(area * 1000) / 10, flags }); prevSig = sig; }
    else { const m = moments[moments.length - 1]; for (const f of flags) if (!m.flags.includes(f)) m.flags.push(f); }
  }
  for (let i = 0; i < moments.length; i++) moments[i].end = i + 1 < moments.length ? moments[i + 1].t : dur;
  return moments;
});

const scenes = [];
for (const s of S.scenes) {
  const url = pathToFileURL(`${root}/video/compositions/${s.id}.html`).href;
  const loaded = once("Page.loadEventFired");
  await cdp("Page.navigate", { url });
  await loaded;
  const r = await cdp("Runtime.evaluate", { expression: `(${AUDIT})(${JSON.stringify(s.id)}, ${s.duration}, ${STEP})`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`${s.id}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  const moments = r.result.value.map((m) => ({ ...m, global: Math.round((s.start + m.t) * 100) / 100 }));
  scenes.push({ id: s.id, start: s.start, duration: s.duration, moments });
  process.stdout.write(`${s.id}: ${moments.filter((m) => m.items.length).length} text moments, ${moments.filter((m) => m.flags.length).length} flagged\n`);
}
ws.close();
const exited = new Promise((r) => chrome.once("exit", r));
chrome.kill();
await Promise.race([exited, sleep(3000)]);
try { rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}

// ---- thumbnails + 2 s contact sheet from the rendered MP4
const tcode = (x) => `${String(Math.floor(x / 60)).padStart(2, "0")}:${(x % 60).toFixed(2).padStart(5, "0")}`;
const flagged = scenes.flatMap((s) => s.moments.filter((m) => m.flags.length).map((m) => ({ ...m, scene: s.id })));
const textMoments = scenes.flatMap((s) => s.moments.filter((m) => m.items.length));
if (MP4 && existsSync(`${root}/${MP4}`)) {
  for (const m of flagged) {
    const at = m.global + Math.min(0.4, (m.end - m.t) / 2);
    m.thumb = `${LABEL}/${tcode(m.global).replace(/[:.]/g, "-")}.jpg`;
    spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-ss", String(at), "-i", `${root}/${MP4}`, "-frames:v", "1", "-vf", "scale=384:-1", "-q:v", "6", `${OUT}/${m.thumb}`]);
  }
  spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", `${root}/${MP4}`, "-vf", "fps=1/2,scale=240:-1,tile=10x13", "-frames:v", "1", "-q:v", "5", `${OUT}/${LABEL}/contact-sheet-every-2s.jpg`]);
}

const summary = { label: LABEL, mp4: MP4 || null, step: STEP, textMoments: textMoments.length, flagged: flagged.length, pass: flagged.length === 0 };
writeFileSync(`${OUT}/${LABEL}.json`, JSON.stringify({ summary, scenes }, null, 1) + "\n");
const cell = (s) => String(s).replace(/\|/g, "\\|").replace(/\n/g, " ");
const md = [
  `# Keynote text audit: ${LABEL}`,
  "",
  `Generated by \`node scripts/audit-keynote.mjs --label=${LABEL}${MP4 ? ` --mp4=${MP4}` : ""}\`. Each scene's timeline was stepped every ${STEP} s in headless Chrome at 1920x1080 and every visible text block measured.`,
  "",
  `**${textMoments.length} moments with text, ${flagged.length} flagged as TOO MUCH TEXT.** ${flagged.length ? "" : "Every moment passes."}`,
  "",
  "Rules: more than 6 words · more than 2 lines · any list · more than one text element (tiny labels excepted) · font under 96 px · text over 20% of the frame.",
  MP4 ? `\nEvery 2 s of the MP4: [contact sheet](${LABEL}/contact-sheet-every-2s.jpg)\n` : "",
  "| Timestamp | Clip id | Words | Rule broken | Screenshot |",
  "|---|---|---|---|---|",
  ...flagged.map((m) => `| ${tcode(m.global)} (${m.scene} +${m.t.toFixed(2)}s) | ${cell(m.items.map((i) => `\`${i.id}\``).join(", "))} | ${m.words}: "${cell(m.items.map((i) => i.text).join(" / ").slice(0, 140))}" | ${cell(m.flags.join(", "))} | ${m.thumb ? `![](${m.thumb})` : ""} |`),
  "",
  "## Every text moment",
  "",
  "| Timestamp | Text on screen | Words | Font | Flags |",
  "|---|---|---|---|---|",
  ...textMoments.map((m) => `| ${tcode(m.global)} | ${cell(m.items.map((i) => i.text).join(" / ").slice(0, 120))} | ${m.words} | ${Math.min(...m.items.map((i) => i.font))}px | ${cell(m.flags.join(", ") || "ok")} |`),
  "",
].join("\n");
writeFileSync(`${OUT}/${LABEL}.md`, md);
console.log(`\n${LABEL}: ${textMoments.length} text moments, ${flagged.length} flagged -> docs/keynote-audit/${LABEL}.md`);
process.exitCode = flagged.length ? 2 : 0;
