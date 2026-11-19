#!/usr/bin/env bash
# Generate one voiceover clip per scene with fal.ai Kokoro (British English). Key comes from ./.env.
# Usage: scripts/gen-voiceover.sh [voice]   (default bm_george; others: bm_lewis, bf_emma, bf_isabella)
# Writes video/assets/vo/<scene-id>.mp3 and stores the measured length as voSeconds in script/scenes.json.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "no .env: copy .env.example to .env and add FAL_KEY" >&2; exit 1; }
set -a; source .env; set +a
[ -n "${FAL_KEY:-}" ] || { echo "FAL_KEY is empty: put your key in .env (see .env.example)" >&2; exit 1; }
command -v ffmpeg >/dev/null 2>&1 || { echo "ffmpeg not found. Please install ffmpeg." >&2; exit 1; }
VOICE="${1:-bm_george}"
OUT=video/assets/vo
mkdir -p "$OUT"

node -e '
  const S = JSON.parse(require("fs").readFileSync("script/scenes.json", "utf8"));
  for (const s of S.scenes || []) console.log(s.id);
' | while read -r id; do
  [ -s "$OUT/$id.mp3" ] && { echo "skip $id"; continue; }
  payload=$(node -e '
    const S = JSON.parse(require("fs").readFileSync("script/scenes.json", "utf8"));
    const s = (S.scenes || []).find((x) => x.id === process.argv[1]);
    const text = s?.vo || "";
    if (text.includes("<<")) { console.error("SKIP_PLACEHOLDER"); process.exit(2); }
    console.log(JSON.stringify({ prompt: text, voice: process.argv[2] }));
  ' "$id" "$VOICE" 2>&1) || {
    if [[ "$payload" == *"SKIP_PLACEHOLDER"* ]]; then
      echo "skip $id: voiceover text still has <<...>> placeholders"
      continue
    fi
    echo "FAILED $id: $payload" >&2
    exit 1
  }
  resp=$(curl -sS https://fal.run/fal-ai/kokoro/british-english \
    -H "Authorization: Key $FAL_KEY" -H "Content-Type: application/json" \
    --data "$payload")
  url=$(node -e '
    try {
      const r = JSON.parse(process.argv[1]);
      console.log(r?.audio?.url || "");
    } catch { console.log(""); }
  ' "$resp")
  [ -n "$url" ] && [ "$url" != "null" ] || { echo "FAILED $id" >&2; exit 1; }
  curl -sS "$url" -o "/tmp/$id.wav"
  ffmpeg -y -loglevel error -i "/tmp/$id.wav" -af "loudnorm=I=-14:TP=-1.5:LRA=11" -ac 1 -b:a 128k "$OUT/$id.mp3"
  rm -f "/tmp/$id.wav"
  echo "ok $id"
done

# record measured lengths
for f in "$OUT"/*.mp3; do
  [ -e "$f" ] || continue
  id=$(basename "$f" .mp3)
  d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$f")
  node -e '
    const fs = require("fs");
    const path = "script/scenes.json";
    const S = JSON.parse(fs.readFileSync(path, "utf8"));
    const s = (S.scenes || []).find((x) => x.id === process.argv[1]);
    if (s) {
      s.voSeconds = Math.round(parseFloat(process.argv[2]) * 10) / 10;
      s.voice = process.argv[3];
      fs.writeFileSync(path, JSON.stringify(S, null, 2) + "\n");
    }
  ' "$id" "$d" "$VOICE"
done
node scripts/retime.mjs
