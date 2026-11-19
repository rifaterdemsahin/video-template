#!/usr/bin/env bash
# Scaffold a new episode in a multi-video series repository under videos/<slug>/.
# Usage: scripts/new-episode.sh <slug>
# Shares root prompts/, presets/, scripts/, and video/assets/logos/ across episodes.
set -euo pipefail
cd "$(dirname "$0")/.."
SLUG="${1:-}"
[ -n "$SLUG" ] || { echo "usage: scripts/new-episode.sh <slug>" >&2; exit 1; }
if ! [[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "slug must be lowercase letters, digits and dashes" >&2
  exit 1
fi

DIR="videos/$SLUG"
if [ -d "$DIR" ]; then
  echo "$DIR already exists" >&2
  exit 1
fi

mkdir -p "$DIR"
cp -r script spec plan thumbnails checklists "$DIR/"
cp video.yaml "$DIR/video.yaml"
echo "Created episode workspace: $DIR"
echo "Next:"
echo "  1. Fill in $DIR/video.yaml"
echo "  2. Edit $DIR/script/scenes.json and $DIR/spec/project.json"
echo "  3. Symlink or copy active episode files to root when building/rendering"
