# Offline verification

1. Run `prepare-and-build.bat` for a first build, or `build-standalone.bat` when dependencies are already cached.
2. Open `dist/index.html` directly with `file://`.
3. Clear the browser Network panel, enable offline mode (or disconnect the network), and reload.
4. Load the sample PPTX from `test-data/` and exercise slide rendering, script editing, local audio import, and video export.
5. Confirm there is no failed external resource request and no unexpected console error.
6. Confirm generated MP4 files save and open correctly.
7. Repeat with `dist/index.self-extract.html` and confirm its loader disappears and the restored app behaves the same way.
8. Run `scripts/verify-self-extract.ps1` to confirm the self-extract payload restores byte-for-byte to `dist/index.html`.

## Local model narration

For the local TTS path, save the pinned `model_quantized.onnx`, `jf_alpha.bin` and `af_heart.bin` from the in-app download links. With the browser offline, load the model and each voice from its own row, then generate and listen to a Japanese slide before generating the remaining English slide from the deck action, save the project, close the tab, and reopen the project. Export MP4 before selecting any model files again.

The repeatable desktop test uses Playwright with Google Chrome and the checked-in three-slide deck. With Playwright available to Node, set the environment variable `PVM_KOKORO_DIR` to the directory with the three downloaded files and run `node scripts/local-tts.browser.cjs` from the repository root. Set `PVM_TEST_HTML` to exercise another standalone build. The test also runs a Pixel phone profile. It reopens a deck with one missing voice, checks that audio already generated on desktop remains identical, generates the remaining narration and exports an MP4. The script saves its projects, videos and subtitles in a temporary directory and prints the path.

## Permission-dependent narration

Microphone and system-audio capture still require browser/OS permission even when the application is offline.

For local SpeechSynthesis capture on Windows, start recording from the app, choose **Entire Screen**, enable **Share system audio**, and stop unrelated notification/music audio during recording. No cloud TTS service is used.

## Smartphone verification

On a smartphone browser, verify PPTX loading, Narration editing, Japanese and English Kokoro generation, microphone or audio-file narration, `.pvm` save/open, and 720p MP4 export. Check that browser voice preview is separate from Kokoro narration and the desktop system-audio controls are hidden. 1080p may remain selectable but must show the mobile memory warning.
