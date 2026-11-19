# Prompt: outline to scenes

Paste into your AI assistant together with `plan/outline.md` and `spec/project.json`.

```
You are helping me write the script for a video. Use only the brief and outline I gave you.
Write script/scenes.json in the existing schema (id, label, title, start, duration, broll, vo, realAsset, bg, overlay, ph).
Rules:
- vo is spoken text: short sentences, one idea each, 130 words per minute.
- duration (seconds) is the vo length plus about 1.5 seconds; start is the sum of the previous durations.
- overlay is on-screen text: a headline of six words or fewer, then at most four short lines.
- bg is one of the plate names in prompts/backgrounds.json.
- realAsset names footage I must supply, or null. Never invent footage, numbers, quotes, links or prices: mark them <<TO CONFIRM>>.
- Exactly one call to action, in the last scene.
- Keep the disclaimer from spec/project.json, if there is one.
```
