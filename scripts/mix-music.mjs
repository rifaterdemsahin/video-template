// Mixes the music bed for the film: quiet under the voice, swelling where nobody speaks.
//   node scripts/mix-music.mjs
// In:  video/assets/music/bed-raw.mp3 (scripts/gen-music.sh), video/assets/vo/<scene>.mp3, script/scenes.json
// Out: video/assets/music/bed-mix.mp3 (whole film, starts at 0) + video/assets/music/mix.json (levels and swell windows)
// Steps: stretch the bed to the film length -> level envelope (base, hook, swells) -> duck under the voice with a
// sidechain compressor keyed on the voiceover -> fade out. build-video.mjs mounts the result as <audio id="music">.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const S = JSON.parse(readFileSync(`${root}/script/scenes.json`, "utf8"));
const M = `${root}/video/assets/music`;
const RAW = `${M}/bed-raw.mp3`;
if (!existsSync(RAW)) throw new Error("run scripts/gen-music.sh first");
const VO_LEAD = 0.25; // same as build-video.mjs
const scenes = S.scenes;
const total = scenes.at(-1).start + scenes.at(-1).duration;
const r2 = (n) => Math.round(n * 100) / 100;
const run = (args) => { const r = spawnSync("ffmpeg", ["-hide_banner", "-y", ...args], { encoding: "utf8", maxBuffer: 1 << 26 }); if (r.status !== 0) throw new Error(r.stderr.slice(-1500)); return r.stderr; };
const probe = (f) => Number(spawnSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f], { encoding: "utf8" }).stdout.trim());

// ---- levels (dB, relative to the bed normalised to -20 LUFS)
const LEVEL = { base: -7, hook: -2, swell: 2, subscribe: -4, ending: 4 };
const RAMP = 0.6; // seconds to rise or fall into a window
const TRIM = -15; // the voice clips sit around -28 dB mean: this keeps the bed ~17 dB under the voice and the swells near voice level

// ---- windows where the music comes up
const voEnd = (s) => s.start + VO_LEAD + (s.voSeconds || s.duration - 0.5);
// light: true = the music stays up under the voice there (light ducking), so the swell is heard while he speaks
const windows = [{ from: 0, to: scenes[0].start + scenes[0].duration, level: LEVEL.hook, light: true, why: "hook" }];
scenes.forEach((s, i) => {
  const next = scenes[i + 1];
  const end = next ? next.start + VO_LEAD : total;
  if (end - voEnd(s) > 0.4) windows.push({ from: r2(voEnd(s)), to: r2(end), level: next ? LEVEL.swell : LEVEL.ending, light: !next, why: next ? `gap after ${s.id}` : "final tail" });
});
const cta = scenes.find((s) => /cta/i.test(s.id) || /cta/i.test(s.label || ""));
// optional build on CTA scene if keynote beats mention comment/subscribe
const sub = cta?.keynote?.find((b) => /comment/i.test(b.text)) || cta?.keynote?.find((b) => /subscribe/i.test(b.text));
if (cta && sub && sub.at) {
  const words = cta.vo.split(/\s+/);
  const idx = words.findIndex((w, j) => sub.at.split(/\s+/).every((a, q) => (words[j + q] || "").replace(/[^\w]/g, "").toLowerCase() === a.replace(/[^\w]/g, "").toLowerCase()));
  if (idx >= 0) {
    const t = cta.start + VO_LEAD + ((cta.voSeconds || cta.duration - 0.5) * idx) / words.length;
    windows.push({ from: r2(t), to: r2(voEnd(cta)), level: LEVEL.subscribe, light: true, why: "CTA build (under the voice)" });
    const gap = windows.find((w) => w.why === `gap after ${cta.id}`);
    if (gap) { gap.level = LEVEL.ending; gap.why = "CTA ending (swell)"; }
  }
}
windows.sort((a, b) => a.from - b.from);

// level curves, sampled every 0.1 s: each window is a trapezoid (RAMP in, flat, RAMP out); overlapping windows take the max
const trap = (w, t, v) => { const r0 = w.from === 0 ? 0 : RAMP; if (t < w.from - r0 || t > w.to + RAMP) return null; const k = t < w.from ? (t - (w.from - r0)) / r0 : t > w.to ? 1 - (t - w.to) / RAMP : 1; return k; };
function curve(valueAt) {
  const pts = [];
  for (let t = 0; t <= total + 1e-6; t = r2(t + 0.1)) pts.push([t, Math.round(valueAt(t) * 100) / 100]);
  const keep = pts.filter((p, i) => i === 0 || i === pts.length - 1 || (p[1] - pts[i - 1][1]) !== (pts[i + 1][1] - p[1]));
  let e = String(keep.at(-1)[1]);
  for (let i = keep.length - 2; i >= 0; i--) { const [t0, g0] = keep[i], [t1, g1] = keep[i + 1]; e = `if(lt(t,${t1}),${g0}+(${r2(g1 - g0)})*(t-${t0})/${r2(t1 - t0)},${e})`; }
  return e;
}
const levelAt = (t) => windows.reduce((m, w) => { const k = trap(w, t); return k == null ? m : Math.max(m, LEVEL.base + (w.level - LEVEL.base) * k); }, LEVEL.base);
const lightAt = (t) => windows.filter((w) => w.light).reduce((m, w) => { const k = trap(w, t); return k == null ? m : Math.max(m, k); }, 0);
const gainExpr = `pow(10,(${curve(levelAt)})/20)`;
const wexpr = curve(lightAt);

// ---- voice bus (sidechain key only; the film plays the voice clips itself)
const voInputs = scenes.flatMap((s) => ["-i", `${root}/video/assets/vo/${s.id}.mp3`]);
const voFilter = scenes.map((s, i) => `[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${Math.round((s.start + VO_LEAD) * 1000)}:all=1[v${i}]`).join(";")
  + `;${scenes.map((_, i) => `[v${i}]`).join("")}amix=inputs=${scenes.length}:normalize=0,apad=whole_dur=${total}[vo]`;
const voBus = `${M}/.vo-bus.wav`;
run([...voInputs, "-filter_complex", voFilter, "-map", "[vo]", "-t", String(total), voBus]);

// ---- music: stretch to the film, normalise, envelope, duck, fade
// the generated piece has its own ending and goes quiet before the file ends: use the audible part only,
// so the music's natural ending lands on the film's last frame
const rawFile = probe(RAW);
const sil = run(["-i", RAW, "-af", "silencedetect=noise=-30dB:d=0.5", "-f", "null", "-"]); // where the music itself stops
const starts = [...sil.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1])).filter((x) => x > rawFile * 0.8);
const rawDur = r2(Math.min(rawFile, (starts[0] ?? rawFile) + 1.6)); // keep 1.6 s of its natural decay for the film's last seconds
const tempo = rawDur / total;
const chain = [
  `[0:a]atrim=0:${rawDur},aresample=48000,atempo=${tempo.toFixed(5)},apad=whole_dur=${total},atrim=0:${total},loudnorm=I=-20:TP=-2:LRA=11,aresample=48000,volume=${TRIM}dB,volume='${gainExpr}':eval=frame[bed]`,
  `[bed]asplit=2[b1][b2]`,
  `[1:a]asplit=3[k1][k2][kc]`,
  `[b1][k1]sidechaincompress=threshold=0.02:ratio=10:attack=40:release=650:knee=4:makeup=1[heavy]`,
  `[b2][k2]sidechaincompress=threshold=0.06:ratio=2.5:attack=60:release=500:knee=4:makeup=1[light]`,
  `[heavy]volume='1-(${wexpr})':eval=frame[h2]`,
  `[light]volume='${wexpr}':eval=frame[l2]`,
  `[h2][l2]amix=inputs=2:normalize=0[duck]`,
  `[duck]afade=t=in:st=0:d=0.8,afade=t=out:st=${r2(total - 1.2)}:d=1.2,alimiter=limit=0.7[out]`,
  `[kc]anullsink`,
].join(";");
run(["-i", RAW, "-i", voBus, "-filter_complex", chain, "-map", "[out]", "-t", String(total), "-c:a", "libmp3lame", "-b:a", "192k", `${M}/bed-mix.mp3`]);

// ---- measure: music level while the voice speaks vs when it does not
const meanDb = (file, from, dur) => Number((run(["-ss", String(from), "-t", String(dur), "-i", file, "-af", "volumedetect", "-f", "null", "-"]).match(/mean_volume: (-?[\d.]+)/) || [])[1]);
const under = scenes.map((s) => meanDb(`${M}/bed-mix.mp3`, s.start + 2, Math.min(5, (s.voSeconds || 5) - 3)));
const voice = scenes.map((s) => meanDb(voBus, s.start + 2, Math.min(5, (s.voSeconds || 5) - 3)));
const gaps = windows.filter((w) => w.why.startsWith("gap") && w.to - w.from > 1).map((w) => meanDb(`${M}/bed-mix.mp3`, w.from + 0.3, Math.min(1.5, w.to - w.from - 0.4)));
const lightUnder = windows.filter((w) => w.light && w.to - w.from > 2).map((w) => ({ why: w.why, music: meanDb(`${M}/bed-mix.mp3`, w.from + 0.5, Math.min(3, w.to - w.from - 1)), voice: meanDb(voBus, w.from + 0.5, Math.min(3, w.to - w.from - 1)) }));
const avg = (a) => Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10;
const report = {
  file: "bed-mix.mp3", from: "bed-raw.mp3", rawSecondsUsed: rawDur, filmSeconds: total, tempo: Number(tempo.toFixed(5)), levelsDb: LEVEL, trimDb: TRIM, rampSeconds: RAMP,
  ducking: "sidechaincompress keyed on the voiceover: heavy (threshold 0.02, ratio 10) everywhere; light (threshold 0.06, ratio 2.5) crossfaded in for the hook, the Subscribe ending and the final tail so the swell is heard under the voice",
  windows,
  measured: { voiceMeanDb: avg(voice), musicUnderVoiceMeanDb: avg(under), voiceAboveMusicDb: Math.round((avg(voice) - avg(under)) * 10) / 10, musicInGapsMeanDb: avg(gaps), swellsUnderVoice: lightUnder },
};
writeFileSync(`${M}/mix.json`, JSON.stringify(report, null, 2) + "\n");
spawnSync("rm", ["-f", voBus]);
console.log(`wrote video/assets/music/bed-mix.mp3: ${windows.length} swell windows; voice ${report.measured.voiceMeanDb} dB, music under voice ${report.measured.musicUnderVoiceMeanDb} dB (${report.measured.voiceAboveMusicDb} dB below), music in gaps ${report.measured.musicInGapsMeanDb} dB`);
