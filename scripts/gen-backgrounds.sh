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

node -e '
  const cfg = JSON.parse(require("fs").readFileSync("prompts/backgrounds.json", "utf8"));
  for (const name of Object.keys(cfg.plates || {})) console.log(name);
' | while read -r name; do
  [ -s "$OUT/$name.jpg" ] && { echo "skip $name"; continue; }
  payload=$(node -e '
    const cfg = JSON.parse(require("fs").readFileSync("prompts/backgrounds.json", "utf8"));
    const prompt = cfg.plates[process.argv[1]] || "";
    if (prompt.includes("<<")) { console.error("SKIP_PLACEHOLDER"); process.exit(2); }
    console.log(JSON.stringify({
      prompt: `${prompt}, ${cfg.suffix || ""}`,
      image_size: "landscape_16_9",
      num_images: 1,
      num_inference_steps: 4,
      enable_safety_checker: true
    }));
  ' "$name" 2>&1) || {
    if [[ "$payload" == *"SKIP_PLACEHOLDER"* ]]; then
      echo "skip $name: fill in its prompt in prompts/backgrounds.json first"
      continue
    fi
    echo "FAILED $name: $payload" >&2
    exit 1
  }
  resp=$(curl -sS https://fal.run/fal-ai/flux/schnell \
    -H "Authorization: Key $FAL_KEY" -H "Content-Type: application/json" \
    --data "$payload")
  url=$(node -e '
    try {
      const r = JSON.parse(process.argv[1]);
      console.log(r?.images?.[0]?.url || "");
    } catch { console.log(""); }
  ' "$resp")
  [ -n "$url" ] && [ "$url" != "null" ] || { echo "FAILED $name" >&2; exit 1; }
  curl -sS "$url" -o "$OUT/$name.jpg"
  echo "ok $name"
done
