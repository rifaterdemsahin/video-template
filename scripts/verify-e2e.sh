#!/usr/bin/env bash
# End-to-end verification runner: runs tests, evals, and (if FAL_KEY + ffmpeg are available) full asset generation + render + thumbnails.
# Usage: scripts/verify-e2e.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "1/3 Running template unit/integration tests..."
npm test

echo "2/3 Running quality evals..."
npm run eval

if [ -f .env ] && grep -qE '^FAL_KEY=.+' .env && command -v ffmpeg >/dev/null 2>&1; then
  echo "3/3 FAL_KEY + ffmpeg detected: running full asset generation, normalization, render, and thumbnails..."
  scripts/gen-backgrounds.sh
  scripts/gen-voiceover.sh
  scripts/normalize-audio.sh
  scripts/render.sh final
  scripts/build-thumbnails.sh
else
  echo "3/3 Skipping live fal.ai/ffmpeg render (add FAL_KEY to .env and install ffmpeg to run full MP4 verification)."
fi
