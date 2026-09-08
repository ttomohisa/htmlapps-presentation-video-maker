# Release checklist

Use this checklist for every Presentation Video Maker release. Version-specific smoke-test documents are intentionally not kept in the repository; release history belongs in `CHANGELOG.md`.

## Metadata and documentation

- `app.config.json`, visible version labels, README files, and `CHANGELOG.md` agree on the release version.
- `README.md` and `README.ja.md` describe the current behavior and limitations.
- `SECURITY.md` and `THIRD_PARTY_NOTICES.md` match the current dependency/runtime set.
- Japanese, English, and smartphone screenshots are current.

## Standalone and privacy

- Run `scripts/check-repository.ps1` on Windows.
- Open `dist/index.html` directly and verify no unresolved build placeholder remains.
- Confirm CSP contains `connect-src 'none'`.
- Confirm plain `'unsafe-eval'` is not enabled.
- Confirm `foreignObjectRendering: false` remains in the video snapshot path.
- Confirm the self-extract artifact restores byte-for-byte to `dist/index.html`.
- Inspect the browser Network panel after the HTML has loaded and confirm no unexpected external request occurs.

## Desktop and smartphone UI

- Test Japanese and English desktop UI.
- Test at least 390 px and 360 px widths with no horizontal page overflow.
- Confirm the PPTX drop area closes after a successful load.
- Confirm Quick navigation can be collapsed and reopened.
- Confirm Previous / Next scene controls remain usable.
- Test long file names, long scripts, and a many-slide fixture.

## Narration

- On Windows Chrome/Edge, test local SpeechSynthesis using **Entire Screen + system audio** sharing.
- Test microphone narration.
- Test local audio-file narration.
- Test the three narration sources mixed across scenes.
- On Windows Chrome/Edge, test **Record this slide** for TTS and confirm only the selected TTS scene is replaced after successful capture.
- Confirm cancelling/failing selected-scene TTS preserves the previous scene audio.
- Test preview start/stop, including rapidly pressing Preview twice.
- Confirm the rate slider changes the SpeechSynthesis rate.
- While **Record all scenes** is running, move to other slides from both the slide list and Script & voice Previous/Next controls; capture must continue without cancelling the current TTS utterance.
- Confirm manual speech preview and PowerPoint replacement are unavailable while all-scene capture is active.
- Confirm script/voice/rate/source changes mark old recordings stale without deleting them immediately.

## Project save / resume and text export

- Load a PPTX, edit at least one script, import/record scene audio, set BGM and output options, then save a `.pvm` project.
- Reload the app, open the `.pvm`, and confirm source PPTX, slide count, scripts, narration source/status/audio, BGM, selected slide, and output settings are restored.
- Confirm generated MP4 is not embedded in `.pvm`.
- Confirm project save/open is blocked while TTS capture, microphone recording, or video generation is active.
- Confirm opening a project over current work asks for confirmation.
- Confirm the initial `.pvm` project picker is visually separate from the PPTX drop zone and its file input accepts `.pvm` only.
- Confirm each scene row exposes the appropriate narration action: TTS record, microphone record/stop, or local-audio selection.
- Confirm scene playback shows a pointer cursor plus hover feedback and remains keyboard-focusable.
- Test narration progress counts for ready / unrecorded / stale / failed and **Next item to fix** navigation.
- Confirm failed/stale narration is corrected from each scene row and no failed-scene batch retry action is shown.
- Save TXT, SRT, and VTT; verify UTF-8 text, cue ordering, timestamps, and filenames.

## Video output

- Generate 720p H.264/AAC MP4.
- Generate 1080p H.264/AAC MP4.
- Test Fade, burned-in subtitles, and local BGM.
- Confirm the last slide remains in the final video.
- Confirm cancelling or failing a replacement export does not delete the previous successful MP4.
- Confirm the output filename is editable and the saved file opens normally.

## Final packaging

- Exclude `.cache/`, transient regression outputs, and generated diagnostic files from the release ZIP.
- Keep the release archive limited to source, build/verification tooling, required vendor assets, current documentation, screenshots, fixtures, and generated standalone artifacts.
