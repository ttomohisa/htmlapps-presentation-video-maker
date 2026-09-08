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
- Test preview start/stop, including rapidly pressing Preview twice.
- Confirm the rate slider changes the SpeechSynthesis rate.
- Confirm script/voice/rate/source changes mark old recordings stale without deleting them immediately.

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
