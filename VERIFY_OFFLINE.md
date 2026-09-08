# Offline verification

1. Run `prepare-and-build.bat` for a first build, or `build-standalone.bat` when dependencies are already cached.
2. Open `dist/index.html` directly with `file://`.
3. Clear the browser Network panel, enable offline mode (or disconnect the network), and reload.
4. Load the sample PPTX from `test-data/` and exercise slide rendering, script editing, local audio import, and video export.
5. Confirm there is no failed external resource request and no unexpected console error.
6. Confirm generated MP4 files save and open correctly.
7. Repeat with `dist/index.self-extract.html` and confirm its loader disappears and the restored app behaves the same way.
8. Run `scripts/verify-self-extract.ps1` to confirm the self-extract payload restores byte-for-byte to `dist/index.html`.

## Permission-dependent narration

Microphone and system-audio capture still require browser/OS permission even when the application is offline.

For local SpeechSynthesis capture on Windows, start recording from the app, choose **Entire Screen**, enable **Share system audio**, and stop unrelated notification/music audio during recording. No cloud TTS service is used.
