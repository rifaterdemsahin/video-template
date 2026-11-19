# Recommendations

Results of a sanity check of this template, and what is still open. Status: ✅ done and tested, 💡 open.

## ✅ Done

### 1. ⏱️ Auto-retime scenes
**Problem:** the voiceover script measures each clip (`voSeconds`), but nothing updated `start` and `duration`, so every voice change meant re-timing every scene by hand.
**Fix:** `scripts/retime.mjs` sets `duration = ceil(voSeconds + 1.5)` and `start` as a running total. `scripts/gen-voiceover.sh` runs it at the end. Scenes without a voice keep their duration.
**Tested:** with made-up voice lengths. The real fal.ai voiceover was not run.

### 2. 🔑 Guards on the fal.ai scripts
**Problem:** with a blank `FAL_KEY`, `gen-voiceover.sh` called the API anyway and printed only `FAILED s01-hook`. It would also have spoken `<<placeholder>>` text.
**Fix:** `gen-voiceover.sh` and `gen-backgrounds.sh` stop early if `.env` or `FAL_KEY` is missing, and skip scenes or plates that still contain `<<...>>`.
**Tested:** with no `.env`, a blank key and a fake key.

### 3. 📌 One place for the Hyperframes version
**Problem:** the version was pinned in `video/package.json`, `presets/render.json` and `AGENTS.md`, so an upgrade meant three edits that could drift.
**Fix:** `video/package.json` is the only pin. `scripts/render.sh` reads it from there.
**Tested:** the version is read correctly. A render with it was not run.

### 4. 🧪 Validate before rendering
**Problem:** leftover `<<...>>` text, an unknown `bg`, overlapping scenes or missing media only showed up late, in `npm run check` or the finished video.
**Fix:** `scripts/validate.mjs`, run by `scripts/render.sh`.

| Finding | `render.sh draft` | `render.sh final` |
|---|---|---|
| Template not initialised, duplicate or invalid scene ids, start times that do not follow on, voice longer than its slot, unknown `bg` | blocks | blocks |
| Unfilled `<<...>>` text, missing background or voiceover files | warns | blocks |

**Tested:** on a clean copy and on a deliberately broken one.

### 5. 🐛 Placeholder filler rewrote the wrong files
**Problem found while testing:** `fill-placeholders.mjs` replaced `{{...}}` in every text file. That rewrote `new-video.sh` while it was running, which broke it, and it rewrote the README's description of the placeholders.
**Fix:** it now touches only `script/`, `spec/`, `plan/`, `thumbnails/`, `prompts/`, `checklists/`, `presets/` and `video.yaml`.
**Tested:** a full `new-video.sh` run, then a second run, which is refused as intended.

## 💡 Open

| # | Idea | Why | Effort |
|---|---|---|---|
| A | 🎬 Render a real video from a fresh copy | Not verified so far: `render.sh`, a full MP4 and the fal.ai scripts with a real key. Best first step. | Small |

### Newly Implemented (2026-11-19)
- ✅ **Cross-platform Chrome & no `jq` dependency**: `scripts/build-thumbnails.sh` auto-detects Chrome/Chromium on Linux and macOS; `render.sh`, `gen-voiceover.sh`, and `gen-backgrounds.sh` use Node.js instead of `jq`.
- ✅ **Local GSAP bundle**: `gsap` is installed in `video/package.json` and referenced locally by `build-video.mjs` (with CDN fallback) for deterministic offline renders.
- ✅ **Style preset (`presets/style.json`)**: Colors and fonts extracted from `build-video.mjs` into `presets/style.json`.
- ✅ **BGM & ducking support**: Optional `bgm` config in `presets/render.json` mounts `assets/bgm.mp3` with GSAP volume ducking during voiceover clips.
- ✅ **Automated YouTube chapters**: `scripts/retime.mjs` exports formatted `mm:ss` chapters into `spec/publish.json`.
- ✅ **Pacing & readability linter**: `scripts/validate.mjs` warns on fast/slow WPM and overly dense overlays.
- ✅ **Static storyboard reviewer**: `scripts/build-storyboard.mjs` generates `plan/storyboard.html` for visual/audio review without rendering.
- ✅ **Thumbnail A/B variants**: Added `thumbnails/thumb-b.html` and `thumbnails/thumb-c.html`.
- ✅ **Multi-video series support**: Added `scripts/new-episode.sh <slug>` for `videos/<slug>/` series layouts.

## Notes
- The source project had no DaVinci Resolve presets, so `presets/` holds Hyperframes render settings and caption rules instead.
- `npm run check` reports missing `assets/bg/*.jpg` and `assets/vo/*.mp3` on a fresh copy, because media is git-ignored. That is expected until they are generated.
