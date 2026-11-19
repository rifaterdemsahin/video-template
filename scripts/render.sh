#!/usr/bin/env bash
# Build, check and render locally. Usage: scripts/render.sh [draft|final]   (default: draft)
# Settings come from presets/render.json. Output goes to video/renders/ (git-ignored).
set -euo pipefail
cd "$(dirname "$0")/.."
MODE="${1:-draft}"

HF=$(node -e '
  const p = JSON.parse(require("fs").readFileSync("video/package.json", "utf8"));
  const m = (p.scripts?.check || "").match(/hyperframes@([0-9.]+)/);
  if (!m) process.exit(1);
  console.log(m[1]);
') || { echo "cannot read the hyperframes version from video/package.json" >&2; exit 1; }

QUALITY=$(node -e '
  const p = JSON.parse(require("fs").readFileSync("presets/render.json", "utf8"));
  const m = process.argv[1];
  if (!p[m] || !p[m].quality) process.exit(1);
  console.log(p[m].quality);
' "$MODE") || { echo "unknown mode: $MODE (see presets/render.json)" >&2; exit 1; }

SLUG=$(node -e '
  const fs = require("fs");
  const proj = JSON.parse(fs.readFileSync("spec/project.json", "utf8"));
  const scenes = JSON.parse(fs.readFileSync("script/scenes.json", "utf8"));
  const slug = proj.slug || scenes.slug || "video";
  console.log(slug.includes("{{") ? "video" : slug);
')
OUT="video/renders/${SLUG}-${MODE}.mp4"

if [ "$MODE" = final ]; then
  node scripts/validate.mjs --strict
  node scripts/build-video.mjs --final
else
  node scripts/validate.mjs
  node scripts/build-video.mjs
fi
( cd video && npx --yes "hyperframes@$HF" check )
( cd video && npx --yes "hyperframes@$HF" render --quality "$QUALITY" --output "../$OUT" )
echo "rendered $OUT"
