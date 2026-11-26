# Third-party notices

Presentation Video Maker includes the following components.

## Local narration

The app imports the user's copy of Kokoro-82M v1.0 (Apache-2.0) and the selected speaker file. The build embeds the inference runtime and the text-processing resources. The distribution includes their license texts, notices and source references under `vendor/local-tts-engine/` and `vendor/local-tts-phonemes/`. The local model panel makes the notices available offline. [Kokoro model card and attribution](https://huggingface.co/hexgrad/Kokoro-82M) · [Speaker credits](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md) · [Pinned ONNX and speaker files](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/tree/1939ad2a8e416c0acfeecc08a694d14ef25f2231)

For unfamiliar English spellings in Japanese narration, the browser worker uses eSpeak NG through ephone 1.0.2 (GPL-3.0-or-later). The standalone contains the American English data only. The pinned source tree contains the engine, dictionaries, Emscripten build scripts, and wrapper. The repository's `scripts/prepare-local-tts-phonemes.py` verifies the npm archive and links the bundled module. [Corresponding source](https://github.com/sjmik/ephone-js/tree/4f6d246c1d3acf67a4d814e20da02fa3967bc92d) · [Packaged license](vendor/local-tts-phonemes/ephone-COPYING)

## PowerPoint renderer

- Package: `@aiden0z/pptx-renderer`
- Version: `1.2.4`
- License: Apache-2.0
- Project: https://github.com/aiden0z/pptx-renderer

The renderer is downloaded only by repository build tooling, hash-locked through the Browser Kitty single-HTML template dependency system, and embedded into the generated HTML. It is not fetched from a CDN at runtime.


## DOM-to-Canvas rasterizer

- Package: `html2canvas`
- Version: `1.4.1`
- License: MIT
- Project: https://github.com/niklasvh/html2canvas

The ESM browser build is downloaded only by repository build tooling, hash-locked by the same template dependency system as the PPTX renderer, and embedded in the generated single HTML. Presentation Video Maker uses html2canvas's normal Canvas renderer with `foreignObjectRendering: false`; it is not fetched at runtime.

## FFmpeg WASM Builder v1.6.0 generated core

- Project: `ttomohisa/htmlapps-ffmpeg-wasm-builder`
- Builder release: `v1.6.0`
- Builder profile: `video-compressor`
- Embedded runtime glue: `browser-ffmpeg.js`
- Embedded generated files: `ffmpeg.js`, `ffmpeg.wasm` (stored gzip-compressed in the standalone HTML)
- Generated core license: GPL-2.0-or-later
- Release: https://github.com/ttomohisa/htmlapps-ffmpeg-wasm-builder/releases/tag/v1.6.0
- Corresponding-source asset: `ffmpeg-wasm-sources-v1.6.0.tar.gz`

The embedded Builder manifest pins:

- FFmpeg `n9.0.1`, commit `bf1b838f2ab88b4f8fd83443325c782ea0e0f7fa`
- x264 commit `31e19f92f00c7003fa115047ce50978bc98c3a0d`
- libvpx `v1.16.0`, commit `1024874c5919305883187e2953de8fcb4c3d7fa6`
- Opus `v1.5.2`, commit `ddbe48383984d56acd9e1ab6a090c54ca6b735a6`
- Emscripten `6.0.6`

The Builder's own scripts/runtime glue are MIT-licensed, but that does not relicense the generated WebAssembly core. The `video-compressor` profile enables GPL FFmpeg components and links x264, so the generated core is distributed under GPL-2.0-or-later.

The application repository is distributed under GPL-3.0 so that the single-HTML distribution containing the GPL-compatible generated runtime is licensed consistently.

## Runtime behavior

No third-party asset is fetched at runtime. The PPTX renderer, html2canvas rasterizer, FFmpeg runtime glue, FFmpeg core JavaScript, and WebAssembly are embedded in the standalone HTML. CSP keeps `connect-src 'none'`. `script-src` permits `'wasm-unsafe-eval'` only for local WebAssembly compilation; general `'unsafe-eval'` is not enabled.

The application uses browser-native APIs for PPTX ZIP/XML parsing, Web Speech API narration, system-audio capture, microphone capture, local audio-file input, Web Audio, Canvas, MediaRecorder, and local file saving.

Keep this file, `LICENSE`, the Builder manifest under `vendor/`, and corresponding-source information with source redistributions of this application.
