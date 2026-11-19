# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Cursor) working in a video made from this template. Humans: start with README.md.

## What this repo is

A video production workspace: a script, a spec and a Hyperframes project (`video/`) that renders the MP4. One repo per video.

The source of truth is `script/scenes.json` (scenes, voiceover text, timings, overlays) and `spec/project.json` (brief, rules, acceptance criteria, risks, decisions). `video.yaml` holds the title, series, publish date and slug.

## Layout

| Path | What it is | Edit by hand? |
|---|---|---|
| `video.yaml` | Title, series, publish date, slug | Once, before `new-video.sh` |
| `script/scenes.json` | Scenes: voiceover, B-roll, overlays, timings | Yes |
| `spec/project.json`, `spec/publish.json` | Brief, rules, acceptance; title options, description, tags | Yes |
| `plan/` | Outline and shot list | Yes |
| `checklists/` | Plan, build and release checklists | Tick as you go |
| `prompts/` | Background plate prompts and AI assistant prompts | Yes |
| `presets/` | Render settings and caption rules | Yes |
| `thumbnails/*.html` | Thumbnail designs (text is HTML, never AI-drawn) | Yes |
| `video/` | Hyperframes project. `index.html` and `compositions/*.html` are generated | Edit the script, not these files |
| `scripts/` | Generators and helpers | Yes |

## Commands

```bash
./new-video.sh <slug>                  # once: fill placeholders from video.yaml, write video/meta.json, build the project
node scripts/build-video.mjs [--final] # regenerate video/index.html + video/compositions from scenes.json
scripts/gen-backgrounds.sh             # fal.ai text-free background plates from prompts/backgrounds.json (needs FAL_KEY in .env)
scripts/gen-voiceover.sh [voice]       # fal.ai draft voiceover; writes voSeconds into scenes.json
scripts/build-thumbnails.sh            # thumbnails/thumb-*.html to 1280x720 JPG (headless Chrome + ffmpeg)
node scripts/retime.mjs                # set scene start/duration from the measured voice lengths (gen-voiceover runs it)
node scripts/validate.mjs [--strict]   # fast checks before rendering; render.sh runs it (final is strict)
scripts/render.sh [draft|final]        # validate, build, check and render locally into video/renders/
cd video && npm run check && npx hyperframes snapshot --at 1,3,5
```

After changing `scenes.json`: voiceover (delete the mp3 of any scene whose text changed; the script skips existing files), re-time the slots, then `node scripts/build-video.mjs`.

## Workflow rules

1. **No secrets in git.** `FAL_KEY` lives only in `.env` (git-ignored). Run `git grep` for key prefixes before every commit.
2. **No media in git.** `.gitignore` blocks video, audio and image files. Keep footage and renders outside the repo or in cloud storage.
3. **Edit the source, not the generated files.** Change `script/scenes.json` or `scripts/build-video.mjs`, then regenerate.
4. **State what you did not verify.** Say when a number is your estimate, when a source is the vendor's own, and when you did not look at the rendered result.
5. **Do not invent links, prices or facts.** Ask, or mark the item `<<TO CONFIRM>>`.

## Content rules

The rules in `spec/project.json` win. Defaults: no AI-generated text, numbers, documents or screens in images (fal.ai makes text-free mood plates only); real footage for real things; blur personal data at the source; one main call to action; keep the disclaimer if there is one.

## Hyperframes project notes

- `video/package.json` is the one place that pins the Hyperframes version (`hyperframes@x.y.z` in each script); `scripts/render.sh` reads it from there. Read the release notes before upgrading, and change every script line in that file.
- Follow `video/CLAUDE.md` for the render contract: timed elements need `data-start` and `class="clip"`, the root timeline is paused and registered on `window.__timelines`, and only deterministic logic.
- Always run `npm run check`, then look at snapshots, before reporting a scene done.
- Render locally.
