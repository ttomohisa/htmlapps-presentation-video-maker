# Architecture

## Overview

Presentation Video Maker is developed as a browser-only application and distributed as a self-contained HTML file.

```text
app.config.json              Product metadata and build settings
dependencies.json            Exact npm dependencies and embedded asset paths
dependencies.lock.json       Committed npm tarball SHA-256 lock
src/index.template.html      Editable application source
build-standalone.ps1         Standalone HTML builder
vendor/                      Pinned FFmpeg WASM runtime produced by FFmpeg WASM Builder
scripts/                     Build, verification, and dependency-maintenance tools
dist/index.html              Readable single-HTML release artifact
dist/index.self-extract.html Gzip self-extracting single-HTML variant
```

Generated files under `dist/` must not be edited directly.

## Runtime flow

1. The user selects a local `.pptx` file.
2. `@aiden0z/pptx-renderer` parses and renders the presentation in the browser.
3. Speaker notes become the initial narration script where available; otherwise slide text is used as a fallback.
4. Each scene can use one of three narration sources:
   - local `SpeechSynthesis` voice captured through explicit system-audio display sharing, either for the selected scene or as an all-scene TTS batch;
   - microphone recording through `getUserMedia()`;
   - a local audio file.
5. The app tracks ready / unrecorded / stale / failed narration and can jump to the next scene needing attention.
6. The user may explicitly save/open a local `.pvm` project containing the source PPTX, scene settings, narration assets, optional BGM, and output settings.
7. TXT scripts and SRT/VTT subtitle cues can be generated locally from the current scene/timeline data.
8. Slide visuals are rasterized to an origin-clean Canvas with `html2canvas` and `foreignObjectRendering: false`.
9. Canvas frames and Web Audio are composed into an intermediate WebM with `MediaRecorder`.
10. The embedded FFmpeg WASM runtime converts the intermediate WebM to H.264/AAC MP4.
11. The MP4 remains in browser memory until the user saves it.

No presentation, `.pvm` project, narration, BGM, intermediate video, or generated MP4 is uploaded by the application.

## Project container

The v1.1.0 `.pvm` project format is a local, dependency-free binary container:

```text
PVMPRJ1\n                       # 8-byte magic
<4-byte LE JSON length>
<UTF-8 JSON manifest>
<raw payload blobs>              # PPTX, scene audio, optional BGM
```

The manifest stores schema/version metadata, per-scene editable state, output settings, and byte ranges into the raw payload. The generated MP4 is not duplicated into the project file. Projects are saved only after an explicit user action; presentation content is not autosaved to LocalStorage or IndexedDB.

Opening a project reconstructs the source PPTX locally, runs the normal PPTX parser/renderer, then restores saved scene/audio/BGM/output state. Project save/open is disabled while capture, microphone recording, or video generation is active.

## Build pipeline

1. Read `app.config.json`, `dependencies.json`, and `dependencies.lock.json`.
2. Require one matching lock entry for each configured npm dependency.
3. Download a dependency only when the exact tarball is not already cached.
4. Verify its SHA-256 against `dependencies.lock.json`.
5. Read only the declared browser assets and embed them in the generated HTML.
6. Embed the canonical `assets/favicon.svg` as both browser favicon and upper-left app icon.
7. Embed the pinned FFmpeg runtime from `vendor/ffmpeg-video-compressor-v1.6.0/`.
8. Generate and verify `dist/index.html`.
9. Generate `dist/index.self-extract.html` and verify byte-for-byte restoration of `dist/index.html`.
10. Write dependency, self-extract, and size manifests under `dist/`.

## Security boundary

The standalone HTML keeps `connect-src 'none'`, so ordinary runtime fetch/XHR/WebSocket traffic is blocked. The app does not use a CDN, analytics, telemetry, cloud TTS, or an AI API.

`script-src` permits `'wasm-unsafe-eval'` for local FFmpeg WebAssembly compilation, but plain `'unsafe-eval'` is not enabled. `frame-src 'self' data: blob:` is retained for html2canvas's local clone iframe.

The browser's microphone and display-sharing permission dialogs remain authoritative. The application requests those permissions only after an explicit user action.
