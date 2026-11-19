# video-template

> Check the template : https://rifaterdemsahin.github.io/video-template/

A template for producing a video with [Hyperframes](https://hyperframes.heygen.com): script, spec, checklists, prompts, thumbnail and metadata templates, and a pipeline that builds scenes from `script/scenes.json` and renders the MP4. One repo per video.

## Start a new video

1. On GitHub, click **Use this template → Create a new repository** (or `gh repo create my-video --template rifaterdemsahin/video-template --public --clone`), then `cd` into it.
2. Fill in `video.yaml`: `title`, `series`, `publish_date` (YYYY-MM-DD).
3. Run `./new-video.sh <slug>`, for example `./new-video.sh intro-to-n8n`. It replaces `{{VIDEO_TITLE}}`, `{{SERIES}}`, `{{PUBLISH_DATE}}` and `{{SLUG}}` everywhere, writes `video/meta.json`, copies `.env.example` to `.env` and builds the project. Run it once per copy.
4. Plan: `plan/outline.md`, then `script/scenes.json`, then `plan/shot-list.md`. `prompts/script-from-outline.md` helps an AI assistant draft the scenes. Tick `checklists/preproduction.md`.
5. Fill the `<<...>>` fields in `spec/project.json` and `spec/publish.json`.
6. Optional drafts: put `FAL_KEY` in `.env`, write your plate prompts in `prompts/backgrounds.json`, then `scripts/gen-backgrounds.sh` and `scripts/gen-voiceover.sh`.
7. Build and review: `scripts/render.sh draft`. Work through `checklists/production.md`.
8. Release: `scripts/build-thumbnails.sh`, `scripts/render.sh final`, then `checklists/release.md`.

Needs: Node 20+, `jq`, `ffmpeg`, and Google Chrome (thumbnails). Paths in `scripts/build-thumbnails.sh` assume macOS; set `CHROME` to use another browser.

## What is in here

| Path | Purpose |
|---|---|
| `video.yaml` | Title, series, publish date, slug |
| `script/scenes.json` | Scenes: voiceover, B-roll, overlays, timings (the single source of truth) |
| `spec/project.json`, `spec/publish.json` | Brief, rules, acceptance, risks; YouTube titles, description, tags |
| `plan/` | Outline and shot list |
| `checklists/` | Plan, build, release |
| `prompts/` | Background plate prompts and AI assistant prompts |
| `presets/` | Render settings (`render.json`) and caption rules (`captions.md`) |
| `thumbnails/` | HTML thumbnail template |
| `video/` | Hyperframes project; `assets/` folders are empty and git-ignored for media |
| `scripts/` | `build-video.mjs`, `validate.mjs`, `retime.mjs`, `render.sh`, `gen-backgrounds.sh`, `gen-voiceover.sh`, `build-thumbnails.sh`, `fill-placeholders.mjs` |
| `AGENTS.md` | Instructions for AI coding agents |

## Notes

- Recommendations and open ideas: [docs/RECOMMENDATIONS.md](docs/RECOMMENDATIONS.md)
- Maturity score and a per-video scorecard: [docs/MATURITY.md](docs/MATURITY.md)

- Media files are git-ignored on purpose (`*.mp4`, `*.mp3`, `*.jpg`, `*.png`, ...). Generate them or keep them outside the repo.
- `npm run check` reports missing `assets/bg/*.jpg` and `assets/vo/*.mp3` until you generate or add them (step 6). That is expected on a fresh copy.
- The render presets are Hyperframes settings, not DaVinci Resolve presets.
- `build-video.mjs` has an optional `fx: {"type": "leverage"}` scene effect and a `logo` field; neither is needed.
