#!/usr/bin/env bash
# Build, check and render locally. Usage: scripts/render.sh [draft|final]   (default: draft)
# Settings come from presets/render.json. Output goes to video/renders/ (git-ignored).
set -euo pipefail
cd "$(dirname "$0")/.."
MODE="${1:-draft}"
HF=$(jq -r '.scripts.check | capture("hyperframes@(?<v>[0-9.]+)").v' video/package.json)
[ -n "$HF" ] || { echo "cannot read the hyperframes version from video/package.json" >&2; exit 1; }
QUALITY=$(jq -r --arg m "$MODE" '.[$m].quality' presets/render.json)
OUT="video/renders/$(jq -r '.slug // "video"' spec/project.json)-$MODE.mp4"
[ "$QUALITY" != "null" ] || { echo "unknown mode: $MODE (see presets/render.json)" >&2; exit 1; }

if [ "$MODE" = final ]; then node scripts/build-video.mjs --final; else node scripts/build-video.mjs; fi
( cd video && npx --yes "hyperframes@$HF" check )
( cd video && npx --yes "hyperframes@$HF" render --quality "$QUALITY" --output "../$OUT" )
echo "rendered $OUT"
