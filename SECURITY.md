# Security and privacy notes

Presentation Video Maker is designed as a local-first browser application.

## Trust boundary

The application accepts a local `.pptx` selected by the user and parses it in the browser. Slide text, speaker notes, scene scripts, preview output, narration assets, BGM, explicit `.pvm` project files, intermediate video, and generated MP4 remain on the device and are not uploaded by the application.

The high-fidelity visual path uses pinned standalone browser builds of `@aiden0z/pptx-renderer@1.2.4` and `html2canvas@1.4.1`. Both packages are acquired by repository build tooling, hash-locked, and embedded in the generated HTML. They are not fetched at application runtime. html2canvas uses its normal Canvas renderer with `foreignObjectRendering: false`; local Blob media/Canvas content is normalized before rasterization to avoid exporting a tainted Canvas under `file://` / opaque origins.

Narration can come from three local sources:

- **On-device speech**: local `SpeechSynthesis` voices plus explicit `getDisplayMedia()` system-audio capture on supported desktop browsers. The same capture engine can target only the selected TTS scene or the full TTS batch. Smartphone TTS recording is intentionally unavailable; mobile users are directed to microphone or local audio-file narration.
- **Microphone**: `getUserMedia({audio:true})` after the user explicitly starts recording the selected slide.
- **Local audio file**: a user-selected audio file read locally and used as the scene recording.

`AudioContext` is used for local signal measurement, decoding, BGM mixing, and video audio composition. MediaStreams, Files, and Blobs are not transmitted to a server.

Video export remains local. On the v1.3 accelerated path, encoded H.264/AAC chunks and the generated MP4 are kept in browser memory while narration audio is decoded per scene; there is no real-time intermediate WebM and FFmpeg WASM is not started. The MP4 container is written by the app’s built-in ISO BMFF muxer. If WebCodecs H.264/AAC is unavailable or the accelerated path fails, the app uses the v1.2 compatibility path with an intermediate WebM and embedded FFmpeg WASM. On detected smartphones, slide snapshots are still created progressively and temporary Canvas backing stores are released promptly. The bundled FFmpeg JavaScript/WebAssembly runtime is embedded at build time and does not fetch media or code at runtime.

Project save/resume is also local. A `.pvm` file is created only after an explicit save action and contains the source PPTX, editable scene state, narration assets, optional BGM, and output settings. The app does not autosave presentation content to LocalStorage or IndexedDB, and generated MP4 is intentionally not embedded in the project. TXT/SRT/VTT exports are generated as local Blob downloads.

## Network policy

The standalone HTML keeps a restrictive Content Security Policy. In particular:

```text
connect-src 'none'
```

`script-src` permits `'wasm-unsafe-eval'` only so the embedded FFmpeg WebAssembly core can compile locally. It does not enable general `'unsafe-eval'`. `frame-src` is limited to local `self`, `data:`, and `blob:` because html2canvas uses an internal clone iframe.

No runtime CDN, analytics, telemetry, external font, cloud TTS API, AI API, or cloud storage API is used.

## File and renderer lifecycle

- Maximum PPTX size: 150 MB.
- Maximum local narration/BGM audio file size: 100 MB each.
- Replacing the presentation invalidates stale parsing/rendering work.
- Presentation/narration/video/project content is not stored automatically in LocalStorage or IndexedDB. Explicit `.pvm` files are saved only where the user chooses through the browser download flow.
- Renderer-owned and recording Blob URLs are revoked when replaced or when the page exits.
- Microphone and display-capture tracks are stopped when cancelled/replaced or when the page exits.
- Existing narration audio and generated MP4 are preserved until a replacement succeeds where practical.
- Export occurs only after an explicit user action.

## Browser permissions

The application does not request microphone or display/system-audio capture on page load. The user must initiate the relevant action, and browser/operating-system permission dialogs remain authoritative.

System-audio capture can include notification sounds or unrelated application audio. The UI asks the user to stop unrelated audio while recording on-device speech. On smartphones, the UI does not offer TTS/system-audio recording as a supported path and explicitly explains that TTS is preview-only there.

## Reporting

Please report security issues privately to the repository maintainer rather than opening a public issue containing sensitive presentation data.

## Smartphone execution

On detected smartphones, the app defaults new PPTX scenes to microphone narration and video output to 720p. Microphone permission is still requested only after an explicit record action. Video export may request Screen Wake Lock where available; Wake Lock is optional and is released when export ends or the page exits. No smartphone-specific cloud service or fallback upload is introduced.
