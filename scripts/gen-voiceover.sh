#!/usr/bin/env bash
# Generate one voiceover clip per scene with fal.ai Kokoro (British English). Key comes from ./.env.
# Usage: scripts/gen-voiceover.sh [voice]   (default bm_george; others: bm_lewis, bf_emma, bf_isabella)
# Writes video/assets/vo/<scene-id>.mp3 and stores the measured length as voSeconds in script/scenes.json.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
VOICE="${1:-bm_george}"
OUT=video/assets/vo
mkdir -p "$OUT"

jq -r '.scenes[].id' script/scenes.json | while read -r id; do
  [ -s "$OUT/$id.mp3" ] && { echo "skip $id"; continue; }
  text=$(jq -r --arg id "$id" '.scenes[]|select(.id==$id)|.vo' script/scenes.json)
  url=$(curl -sS https://fal.run/fal-ai/kokoro/british-english \
    -H "Authorization: Key $FAL_KEY" -H "Content-Type: application/json" \
    --data "$(jq -n --arg p "$text" --arg v "$VOICE" '{prompt:$p,voice:$v}')" | jq -r '.audio.url')
  [ -n "$url" ] && [ "$url" != "null" ] || { echo "FAILED $id" >&2; exit 1; }
  curl -sS "$url" -o "/tmp/$id.wav"
  ffmpeg -y -loglevel error -i "/tmp/$id.wav" -ac 1 -b:a 128k "$OUT/$id.mp3"
  rm -f "/tmp/$id.wav"
  echo "ok $id"
done

# record measured lengths
tmp=$(mktemp)
cp script/scenes.json "$tmp"
for f in "$OUT"/*.mp3; do
  id=$(basename "$f" .mp3)
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
  jq --arg id "$id" --argjson d "$(printf '%.1f' "$d")" '(.scenes[]|select(.id==$id)|.voSeconds)=$d|(.scenes[]|select(.id==$id)|.voice)="'"$VOICE"'"' "$tmp" > "$tmp.n" && mv "$tmp.n" "$tmp"
done
mv "$tmp" script/scenes.json
jq -r '.scenes[]|"\(.id)\t\(.duration)s slot\t\(.voSeconds)s voice"' script/scenes.json
