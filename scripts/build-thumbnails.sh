#!/usr/bin/env bash
# Renders thumbnails/thumb-*.html to 1280x720 JPGs (YouTube spec: 1280x720, under 2 MB) with headless Chrome + ffmpeg.
# The text is HTML on purpose: AI image models garble text. Usage: scripts/build-thumbnails.sh
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -z "${CHROME:-}" ]; then
  CHROME=$(command -v google-chrome || command -v chromium || command -v chromium-browser || true)
  if [ -z "$CHROME" ] && [ -x "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ]; then
    CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
  fi
fi
[ -n "${CHROME:-}" ] && [ -x "$CHROME" ] || { echo "Chrome/Chromium not found. Install Chrome/Chromium or set CHROME=/path/to/chrome" >&2; exit 1; }
command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg not found. Please install ffmpeg." >&2; exit 1; }

TMP=$(mktemp -d)
for f in thumbnails/thumb-*.html; do
  [ -e "$f" ] || continue
  name=$(basename "$f" .html)
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
    --window-size=1280,720 --screenshot="$TMP/$name.png" "file://$PWD/$f" >/dev/null 2>&1
  ffmpeg -y -loglevel error -i "$TMP/$name.png" -q:v 3 "thumbnails/$name.jpg"
  echo "$name.jpg $(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 thumbnails/$name.jpg) $(wc -c < thumbnails/$name.jpg | tr -d ' ') bytes"
done
rm -rf "$TMP"
