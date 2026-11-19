#!/usr/bin/env bash
# Start a new video from this template.
# Usage: ./new-video.sh <slug>      e.g. ./new-video.sh intro-to-n8n
# Fill in video.yaml (title, series, publish_date) first. Run it once, in a fresh copy of the template.
set -euo pipefail
cd "$(dirname "$0")"
SLUG="${1:-}"
[ -n "$SLUG" ] || { echo "usage: ./new-video.sh <slug>" >&2; exit 1; }
grep -q '{{SLUG}}' video.yaml || { echo "video.yaml already has a slug: this copy was already initialised. Make a fresh copy of the template for a new video." >&2; exit 1; }

node scripts/fill-placeholders.mjs "$SLUG"
printf '{\n  "id": "%s",\n  "name": "%s",\n  "createdAt": "%s"\n}\n' "$SLUG" "$SLUG" "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" > video/meta.json
cp -n .env.example .env 2>/dev/null || true
node scripts/build-video.mjs

cat <<MSG

Ready: $SLUG
Next:
  1. Write your scenes in script/scenes.json (outline in plan/outline.md, shots in plan/shot-list.md)
  2. Fill the <<...>> fields in spec/project.json and spec/publish.json
  3. Optional drafts: put FAL_KEY in .env, edit prompts/backgrounds.json, then
       scripts/gen-backgrounds.sh && scripts/gen-voiceover.sh
  4. node scripts/build-video.mjs && scripts/render.sh draft
  5. Work through checklists/ and publish
MSG
