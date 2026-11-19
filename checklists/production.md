# Checklist: build

- [ ] Background prompts filled in `prompts/backgrounds.json`, plates generated (`scripts/gen-backgrounds.sh`) or your own images added to `video/assets/bg/`
- [ ] Draft voiceover generated (`scripts/gen-voiceover.sh`) or final voiceover placed in `video/assets/vo/<scene-id>.mp3`
- [ ] Scene slots re-timed to the voice length (`voSeconds` in `script/scenes.json`)
- [ ] `node scripts/build-video.mjs`
- [ ] `cd video && npm run check` passes with no errors
- [ ] Snapshots of every scene looked at: `npx hyperframes snapshot --at 1,3,5`
- [ ] Draft rendered (`scripts/render.sh draft`) and watched end to end with sound
- [ ] Real footage replaces every placeholder frame
