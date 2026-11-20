#!/usr/bin/env bash
# Generates the cinematic music bed with fal.ai ACE-Step (open model, Apache-2.0) and records where it came from.
#   scripts/gen-music.sh            skips if video/assets/music/bed-raw.* already exists (delete it to regenerate)
# Writes video/assets/music/bed-raw.<ext> and video/assets/music/source.json. Needs FAL_KEY in .env.
# The film's mix (ducking under the voice, swells) is made from this file by scripts/mix-music.mjs.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; source .env; set +a
OUT=video/assets/music
mkdir -p "$OUT"
ls "$OUT"/bed-raw.* >/dev/null 2>&1 && { echo "skip: $(ls "$OUT"/bed-raw.*) exists"; exit 0; }

MODEL="fal-ai/ace-step"
SEED=20261121
DURATION=240
# Draft v13: inspiring and piano-led (Draft v12 used a darker orchestral bed: seed 20261120, see git history)
TAGS="inspiring, uplifting, cinematic, solo piano lead, felt piano, soft strings, warm pads, hopeful, emotional build, instrumental, no vocals, film score, 80 bpm, major key"
BODY=$(jq -n --arg t "$TAGS" --argjson d "$DURATION" --argjson s "$SEED" '{tags:$t, lyrics:"[inst]", duration:$d, seed:$s}')

SUBMIT=$(curl -sS "https://queue.fal.run/$MODEL" -H "Authorization: Key $FAL_KEY" -H "Content-Type: application/json" --data "$BODY")
RID=$(echo "$SUBMIT" | jq -r '.request_id')
STATUS_URL=$(echo "$SUBMIT" | jq -r '.status_url')
RESP_URL=$(echo "$SUBMIT" | jq -r '.response_url')
[ "$RID" != "null" ] || { echo "submit failed: $SUBMIT" >&2; exit 1; }
echo "queued $RID"
for _ in $(seq 1 120); do
  S=$(curl -sS "$STATUS_URL" -H "Authorization: Key $FAL_KEY" | jq -r '.status')
  [ "$S" = "COMPLETED" ] && break
  [ "$S" = "FAILED" ] || [ "$S" = "ERROR" ] && { echo "generation failed" >&2; exit 1; }
  sleep 5
done
RESULT=$(curl -sS "$RESP_URL" -H "Authorization: Key $FAL_KEY")
URL=$(echo "$RESULT" | jq -r '.audio.url // .audio_file.url // empty')
[ -n "$URL" ] || { echo "no audio in result: $(echo "$RESULT" | head -c 300)" >&2; exit 1; }
EXT="${URL##*.}"; EXT="${EXT%%\?*}"
curl -sS "$URL" -o "$OUT/bed-raw.$EXT"
jq -n --arg model "$MODEL" --arg tags "$TAGS" --argjson seed "$SEED" --argjson duration "$DURATION" --arg rid "$RID" \
  --arg file "bed-raw.$EXT" --arg date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{file:$file, generator:"fal.ai", model:$model, modelWeights:"ACE-Step/ACE-Step-v1-3.5B", modelLicense:"Apache-2.0",
    modelLicenseUrl:"https://huggingface.co/ACE-Step/ACE-Step-v1-3.5B", falTerms:"https://fal.ai/terms",
    tags:$tags, lyrics:"[inst]", seed:$seed, durationSeconds:$duration, falRequestId:$rid, generatedAt:$date}' > "$OUT/source.json"
echo "ok $OUT/bed-raw.$EXT"
