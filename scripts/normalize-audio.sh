#!/usr/bin/env bash
# Normalize all voiceover clips (video/assets/vo/*.mp3) and optional BGM (video/assets/bgm.mp3) to YouTube -14 LUFS standard.
# Usage: scripts/normalize-audio.sh
set -euo pipefail
cd "$(dirname "$0")/.."
command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg not found. Please install ffmpeg." >&2; exit 1; }

normalize_file() {
  local f="$1"
  local tmp="${f}.norm.mp3"
  ffmpeg -y -loglevel error -i "$f" -af "loudnorm=I=-14:TP=-1.5:LRA=11" -b:a 192k "$tmp"
  mv "$tmp" "$f"
  echo "normalized (-14 LUFS): $f"
}

for f in video/assets/vo/*.mp3; do
  [ -e "$f" ] || continue
  normalize_file "$f"
done

if [ -f "video/assets/bgm.mp3" ]; then
  normalize_file "video/assets/bgm.mp3"
fi
