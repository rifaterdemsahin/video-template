# Video production maturity score

A way to rate how repeatable and safe a video pipeline is, and where this template stands today. The scores are my own judgement from reading and testing the repo, not an external benchmark. Re-score after each change.

## Levels

| Level | Name | Meaning |
|---|---|---|
| 1 | 🌱 Ad hoc | Done by hand each time. Depends on the person. |
| 2 | 📝 Documented | Steps written down (checklist or README), still done by hand. |
| 3 | ⚙️ Templated | Files and structure come from a template. Some steps are scripted. |
| 4 | 🤖 Automated | Steps run by script, with checks that stop bad output. |
| 5 | 🔁 Proven | Verified end to end on real videos, measured, improved from the results. |

## Scorecard (this template, as pushed)

| Area | Score | Evidence | What would raise it |
|---|---|---|---|
| 📋 Planning | 3 | `video.yaml`, `plan/outline.md`, `plan/shot-list.md`, `spec/project.json`, `checklists/preproduction.md`. Forms to fill, not enforced. | `validate.mjs` also checks the brief fields are filled. |
| ✍️ Scripting | 3 | One schema in `script/scenes.json`. `prompts/script-from-outline.md` for AI drafting. | Word-count and reading-pace check per scene. |
| 🎨 Assets | 3 | `gen-backgrounds.sh` and `gen-voiceover.sh` from prompts, with key and placeholder guards. Footage is manual. | Asset manifest that lists what is still missing. |
| 🏗️ Build | 4 | `build-video.mjs` generates every scene. `retime.mjs` sets timings from voice length. | Style (palette, font) moved out of the script into config. |
| 🧪 Quality checks | 4 | `validate.mjs` blocks bad data, strict on final. Hyperframes `check` runs in `render.sh`. | Automatic snapshot review, a loudness check. |
| 🎬 Render and delivery | 3 | `render.sh draft\|final` with presets. **Not run end to end by me.** | A real render from a fresh copy (would move this to 4). |
| 📦 Packaging | 3 | `publish.json` (titles, description, tags), `thumb-a.html` and `build-thumbnails.sh`, prompts, release checklist. One thumbnail layout. | Chapters generated from scene starts, more thumbnail variants. |
| 👀 Review loop | 1 | No review site or feedback capture in the template. The source repo has one; it was left out. | Add a generic review page (open idea B in `RECOMMENDATIONS.md`). |
| 🚀 Reuse and onboarding | 4 | GitHub template, README steps, `new-video.sh`, tested on a clean copy, re-run guard. One video per repo. | Several videos per repo, cross-platform scripts. |
| 🔒 Hygiene and safety | 4 | `.gitignore` blocks media and `.env`, `.env.example`, key guard. No secrets in the diff. Privacy rules in the checklists. | A pre-commit hook that runs the secret grep. |

**Overall: 3.2 / 5 (average of the ten areas) → Level 3, close to 4.**

Strongest: build, quality checks, reuse, hygiene. Weakest: the review loop. Biggest unknown: the render, because the scripts were tested but a full MP4 was not produced from the template.

## Why not higher

- Level 5 needs proof from real videos. The template has been used for zero videos so far.
- Scores for areas I did not run (render, fal.ai generation) assume the scripts behave as read.
- Checklists are advice. Only `validate.mjs` and the guards actually stop mistakes.

## Score a video

Copy this table for each video. Mark one level per area, then write what you will fix next time.

| Area | 1 | 2 | 3 | 4 | 5 | Fix next time |
|---|---|---|---|---|---|---|
| 📋 Planning | ☐ | ☐ | ☐ | ☐ | ☐ | |
| ✍️ Scripting | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 🎨 Assets | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 🏗️ Build | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 🧪 Quality checks | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 🎬 Render and delivery | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 📦 Packaging | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 👀 Review loop | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 🚀 Reuse and onboarding | ☐ | ☐ | ☐ | ☐ | ☐ | |
| 🔒 Hygiene and safety | ☐ | ☐ | ☐ | ☐ | ☐ | |

Level guide per area: 1 = by hand, 2 = written steps, 3 = from a template, 4 = scripted with checks, 5 = proven on real videos and measured.

## Next steps by payoff

1. 🎬 Render one real video from a fresh copy (verifies render, lifts Render to 4, and starts moving towards level 5).
2. 👀 Add a minimal review loop (lifts the weakest area from 1).
3. 🧪 Extend `validate.mjs` to the brief and word counts.

See `docs/RECOMMENDATIONS.md` for the full list of open ideas.
