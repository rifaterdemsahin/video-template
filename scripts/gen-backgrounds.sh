#!/usr/bin/env bash
# Generate text-free background plates with fal.ai from prompts/backgrounds.json. Key comes from ./.env (git-ignored).
# Usage: scripts/gen-backgrounds.sh
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo "no .env: copy .env.example to .env and add FAL_KEY" >&2; exit 1; }
set -a; source .env; set +a
[ -n "${FAL_KEY:-}" ] || { echo "FAL_KEY is empty: put your key in .env (see .env.example)" >&2; exit 1; }
OUT=video/assets/bg
mkdir -p "$OUT"
SUFFIX=$(jq -r '.suffix' prompts/backgrounds.json)

jq -r '.plates | keys[]' prompts/backgrounds.json | while read -r name; do
  [ -s "$OUT/$name.jpg" ] && { echo "skip $name"; continue; }
  prompt=$(jq -r --arg n "$name" '.plates[$n]' prompts/backgrounds.json)
  case "$prompt" in *"<<"*) echo "skip $name: fill in its prompt in prompts/backgrounds.json first"; continue ;; esac
  url=$(curl -sS https://fal.run/fal-ai/flux/schnell \
    -H "Authorization: Key $FAL_KEY" -H "Content-Type: application/json" \
    --data "$(jq -n --arg p "$prompt, $SUFFIX" '{prompt:$p,image_size:"landscape_16_9",num_images:1,num_inference_steps:4,enable_safety_checker:true}')" \
    | jq -r '.images[0].url')
  [ "$url" != "null" ] && [ -n "$url" ] || { echo "FAILED $name" >&2; exit 1; }
  curl -sS "$url" -o "$OUT/$name.jpg"
  echo "ok $name"
done
