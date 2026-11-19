# Caption preset

Captions are burned in by `scripts/build-video.mjs` from each scene's `vo` text, timed by each sentence's share of the words (or the voiceover length, `voSeconds`).

| Setting | Value | Where to change it |
|---|---|---|
| Position | centred, 74 px from the bottom | `.cap` in `scripts/build-video.mjs` |
| Size | 40 px, weight 600, line height 1.3 | `.cap` |
| Box | black at 72% opacity, 12 px radius, 14 x 30 px padding | `.cap` |
| Width | 1560 px max, inside the safe area | `.cap` |
| Minimum on screen | 0.5 s plus 0.3 s per word, shorter sentences merge | `caps` logic in the script |

Rules: captions match the audio word for word, never cover the on-screen text, and stay inside the 1920x1080 safe area. Upload a separate caption file to YouTube if you want viewers to be able to switch them off.

The `final` render has no DRAFT tag: run `scripts/render.sh final` for the file you upload.
