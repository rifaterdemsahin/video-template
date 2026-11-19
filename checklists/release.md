# Checklist: release

## Render and quality
- [ ] `npm run check` in `video/` passes
- [ ] Final MP4 rendered with `scripts/render.sh final` at 1920x1080, 30 fps
- [ ] Watched once, with sound, end to end
- [ ] Every scene starts within about 1 second of its planned time
- [ ] Audio in sync, no clipping, music sits under the voice
- [ ] Captions match the audio and stay inside the safe area (`presets/captions.md`)

## Privacy and legal
- [ ] No login, name, address, account number or personal data readable in any frame (check the exported file, not the preview)
- [ ] Disclaimer on screen and in the description, if one is required
- [ ] Anything that needs an expert's sign-off has it
- [ ] No API key or secret in the repo, the video or the description (`git grep` for key prefixes before every commit)

## Packaging
- [ ] Title chosen from `spec/publish.json` (subject or the viewer's question first, no promised outcome)
- [ ] Description filled, every `[LINK]` placeholder replaced, chapters pasted in
- [ ] Thumbnail built with `scripts/build-thumbnails.sh`, 1280x720, under 2 MB, checked at small size
- [ ] Captions file uploaded or auto-captions reviewed
- [ ] End screen and the one call to action set
- [ ] Added to the series playlist

## After publishing
- [ ] Add the video link to `README.md`
- [ ] Note what to change in the template for the next video
