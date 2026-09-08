# APP_SPEC.md — Presentation Video Maker

## 1. Product summary

Presentation Video Maker is a Browser Kitty app for turning a local PowerPoint deck into a narrated video without uploading the deck, scripts, or narration audio.

Version `1.0.1` is the current stable patch release. Version `1.0.0` was the first stable release.

The v1 product promise is:

> Open the PowerPoint. Review the notes. Choose how each slide should sound. Create a narrated video without uploading the deck or audio.

Version `1.0.1` creates H.264/AAC MP4 through the tested local pipeline with optional fade transitions, burned-in subtitles, and local BGM. Native PowerPoint animations/transitions remain out of scope.

## 2. Release target

- Version: `1.0.1`
- Readable one-file build: `dist/index.html`
- Self-extracting one-file build: `dist/index.self-extract.html`
- Japanese and English in the same HTML.
- Intended hosting: GitHub Pages / Azure Static Web Apps.
- Direct `file://` opening remains supported for PPTX parsing, rendering, scene editing, and SpeechSynthesis preview. Browser capture policy may require HTTP(S) for system-audio capture.

## 3. Primary v1.0.1 flow

1. Open the app.
2. Drop or choose one `.pptx` file, up to 150 MB.
3. Parse the PPTX package locally and extract slide text and speaker notes.
4. Build the high-fidelity presentation model with pinned `@aiden0z/pptx-renderer@1.2.4` when the dependency is embedded.
5. Treat each slide as one scene.
6. Use speaker notes as the narration script when present; otherwise create a plain draft from slide text.
7. Edit per-scene script, include/exclude state, before/after padding, and choose one narration source: on-device speech, microphone, or local audio file.
8. For on-device speech scenes, choose voice/rate and use **Record all scenes**. For microphone scenes, record the selected slide directly. For file scenes, choose a local audio file.
9. For the TTS subset only, request display capture once, require `displaySurface === "monitor"` plus an audio track, and run a short measurable-signal preflight.
10. Reuse that same system-audio stream across all target TTS scenes. Each TTS scene gets its own MediaRecorder Blob; an empty/no-signal scene is retried once automatically.
11. For microphone scenes, request microphone access only after the user presses the selected-slide record action, and keep the previous scene audio until the replacement succeeds.
12. For file scenes, accept a local audio file up to 100 MB, read its duration locally, and keep the File/Blob in memory without upload.
13. Keep all successful per-scene audio Blobs locally and expose playback. Different narration sources may coexist in the same presentation.
14. If the active narration source changes, preserve the old Blob but mark it stale until a matching replacement exists.
15. Verify that every included scene that requires narration has a fresh successful recording from its currently selected source before video creation.
16. Render each included slide to a 720p or 1080p snapshot using the high-fidelity renderer plus origin-clean html2canvas rasterization when available; keep the simple preview only as an editing fallback.
17. Choose Cut or Fade transitions, optional burned-in subtitles, and optional local BGM with volume/loop settings.
18. Create a Canvas video stream and Web Audio mix, apply each scene's pre-padding, recorded narration, subtitles, transition, post-padding, and BGM, and record an intermediate WebM locally with MediaRecorder.
19. Convert the intermediate WebM to H.264/AAC MP4 with the embedded FFmpeg WASM Builder v1.6.0 `video-compressor` core.
20. Preview the resulting MP4, edit the output filename, and save it through an explicit user action.

## 4. Local-processing boundary

The app must not send the selected PPTX, extracted slide text, speaker notes, scripts, renderer output, captured system audio, or per-scene recording Blobs to any server.

Runtime network requirements:

- No CDN.
- No external font.
- No analytics or telemetry.
- No AI API.
- No cloud TTS API.
- CSP keeps `connect-src 'none'`.
- Third-party JavaScript needed at runtime is downloaded only during the build and embedded into the standalone HTML.

Only voices where `SpeechSynthesisVoice.localService === true` are selectable.

## 5. PPTX input and lifecycle

Accepted: `.pptx` only. Maximum size: 150 MB.

Changing the input file is a hard state boundary:

- increment source-generation token;
- cancel active speech;
- stop display/system-audio tracks;
- stop active MediaRecorder;
- release per-scene recording Blob URLs;
- dispose renderer handles and media Blob URLs;
- clear presentation and scene state;
- ignore stale parse/render results.

No presentation, narration, intermediate video, or generated MP4 data is persisted in LocalStorage or IndexedDB in v1.0.1. Language preference is the only local preference stored by the current app.

## 6. PPTX parser and renderer

The browser-native ZIP/XML parser remains responsible for scene metadata, speaker-note extraction, and compatibility hints. It uses `DataView`, `DecompressionStream('deflate-raw')`, and `DOMParser`.

Primary renderer:

```text
@aiden0z/pptx-renderer@1.2.4
```

The renderer is pinned through the template dependency system and must be embedded at build time. No runtime CDN import is allowed. Rendering remains serialized, selected-slide work receives higher priority than thumbnails, and disposable handles/Blob URLs are released when no longer needed.

Video snapshot rasterization uses pinned `html2canvas@1.4.1`, also embedded through the dependency system. The export path must use html2canvas's normal Canvas renderer (`foreignObjectRendering: false`) and must not serialize the slide DOM into an SVG `foreignObject`, because that path can taint Canvas under `file://` / opaque origins. Local Blob media and embedded Canvas content are normalized before rasterization, and the intermediate Canvas is checked for origin cleanliness before video composition.
The CSP keeps `connect-src 'none'`. `frame-src` is limited to local `self`, `data:`, and `blob:` because html2canvas uses an internal DOM clone iframe; this does not permit network upload or external frame content.

If the high-fidelity renderer is unavailable, the built-in simple preview remains usable for script/narration work.

Known v1.0.1 visual limitations:

- PowerPoint animations are static.
- PowerPoint transitions are not replayed.
- Embedded PowerPoint audio/video is not played.
- Exact PowerPoint pixel parity is not promised.

## 7. Scene model

One PowerPoint slide equals one scene.

Each scene carries at least:

```text
index
slideNumber
slideText
notesText
script
scriptSource
voiceURI
rate
narrationDuration
enabled
prePadding
postPadding
transition
subtitle
limits
recordingStatus
recordingBlob
recordingUrl
recordingMime
recordingBytes
recordingMaxRms
recordingAttempts
recordingNarrationDuration
recordingSpeechStartOffset
recordingSpeechEndOffset
audioSource
recordingSource
recordingFileName
```

Defaults:

- `script`: speaker notes when present, otherwise extracted slide text;
- `enabled`: true;
- `rate`: 1.0;
- `prePadding`: 0.4 seconds;
- `postPadding`: 0.8 seconds;
- `recordingStatus`: `pending`;
- recording fields are empty/zero until capture succeeds.

The recorded Blob intentionally contains only a small technical lead/tail around speech. `recordingSpeechStartOffset` and `recordingSpeechEndOffset` identify the spoken region for video composition. User-configured pre/post padding is **not waited out during capture**; it remains timeline metadata.

## 8. Narration editing and stale recordings

Changing script, voice, speech rate, or include/exclude state invalidates a previously recorded scene for final output. The previous Blob is not immediately destroyed; the scene is marked `stale / 再録音` and the old recording remains playable until a successful replacement or source reset.

This prevents accidental loss while making it clear that current settings and current audio no longer match.

Applying voice/rate to all scenes and restoring source scripts preserve Undo behavior for scene settings/status.

## 9. Narration sources

Each scene has `audioSource` with one of `tts`, `mic`, or `file`. A successful audio asset records its provenance in `recordingSource`. If the user switches to a different source, the previous Blob is preserved but marked stale until a matching replacement is created.

- `tts`: uses the existing on-device SpeechSynthesis + Windows system-audio capture path. Only TTS scenes are included in the batch recording plan.
- `mic`: uses `getUserMedia({audio:true})` and MediaRecorder to record the selected slide directly from the microphone. Existing audio is not destroyed until a new recording succeeds.
- `file`: accepts a local audio file up to 100 MB, reads duration locally, and stores the File directly as the scene audio Blob.

All three sources remain local and can coexist in one final MP4.

## 10. On-device SpeechSynthesis

The app:

- enumerates `speechSynthesis.getVoices()`;
- lists only voices where `localService === true`;
- supports a 0.8x–1.5x rate slider in UI;
- stores voice/rate per scene;
- splits long scripts into bounded chunks before speaking;
- measures completed scene narration duration;
- cancels speech when capture is cancelled or source changes.

The user already confirmed on a real Windows environment that Web Speech API narration is recordable through **Entire Screen + system audio**.

## 11. System-audio preflight

Before any scene recordings are replaced, the capture run must verify:

1. `getDisplayMedia` is available;
2. the user selected an entire screen (`displaySurface === "monitor"`);
3. the returned stream contains an audio track;
4. an `AudioContext` analyser can observe measurable RMS while a short local TTS phrase is spoken.

If preflight fails, existing scene recordings are preserved.

System audio can contain notification sounds or audio from other apps. UI must instruct the user to stop unrelated audio during capture.

## 12. Efficient all-scene recording

A normal full-deck run requests sharing **once**.

The selected system-audio track is wrapped as an audio-only `MediaStream`. The same stream and analyser are reused across the full run.

Each scene gets its own MediaRecorder instance/Blob while sharing permission remains active. Benefits:

- no need to split a long WebM later;
- failed scene retry is isolated;
- successful scenes are retained when another scene fails;
- video export can consume per-scene audio directly.

At batch start, every target scene is snapshotted with its script, selected local voice, speech rate, include state, and narration source. The user may continue reviewing and moving between slides while capture runs; scene navigation must not cancel the active batch SpeechSynthesis utterance. If narration settings are actually edited during capture, the captured Blob is kept but marked stale when it no longer matches the snapshot. Manual speech preview and PowerPoint replacement are disabled while batch capture is active so they cannot interrupt the shared system-audio recording session.

For each scene:

1. start MediaRecorder;
2. wait only a small technical lead-in;
3. reset RMS measurement;
4. speak all text chunks using the scene's voice/rate;
5. record spoken start/end offsets and elapsed narration duration;
6. wait only a small technical tail;
7. stop recorder;
8. require non-empty Blob and RMS above the capture threshold;
9. on success replace the old scene Blob and revoke its old Blob URL.

A no-signal/empty-data scene is automatically tried one additional time before being marked failed.

## 13. Local video generation

Video export requires all enabled scenes with non-empty narration scripts to have `recordingStatus === "success"` and a local `recordingBlob`. A stale, missing, or failed recording blocks export and directs the user back to narration capture.

Output options in v1.0.1:

- H.264 + AAC MP4
- 720p or 1080p height
- aspect ratio inherited from the PowerPoint slide size
- editable filename, with `.mp4` added separately
- explicit save after successful generation

The video pipeline is:

```text
slide snapshot(s)
+ per-scene recorded narration
+ pre/post padding metadata
        ↓
Canvas + Web Audio + MediaRecorder
        ↓
intermediate WebM
        ↓
embedded FFmpeg WASM Builder v1.6.0 video-compressor core
        ↓
H.264 / AAC MP4
```

The composition stage intentionally runs approximately in real time because MediaRecorder captures the browser-generated Canvas/Web Audio timeline. MP4 transcoding runs after composition. No intermediate or final media is uploaded.

The FFmpeg runtime:

- is embedded in the standalone HTML;
- uses the Builder `video-compressor` profile;
- does not require SharedArrayBuffer or cross-origin isolation;
- uses no runtime network access;
- carries GPL-2.0-or-later terms because the profile links x264.

The application repository is distributed under GPL-3.0 in v1.0.1. See `THIRD_PARTY_NOTICES.md` for exact Builder/runtime revisions and corresponding-source information.

## 14. Failure, retry, and cancellation

- Permission denial, wrong surface, missing audio track, or failed preflight aborts the run before replacing scene audio.
- A single scene failure does not discard other completed scenes.
- Failed scenes are listed with `Failed / 失敗` and can be retried as a smaller follow-up capture run.
- Cancellation stops SpeechSynthesis, active MediaRecorder, and display tracks.
- Completed recordings from earlier scenes remain available after cancellation.
- Any scene left in transient `recording` state after interruption is normalized to `stale` when an older Blob exists, otherwise `pending`.

## 15. UI / UX

### Desktop

Use a four-step quick-navigation model while keeping the existing editor panels:

1. PowerPoint / slide preview
2. Script & voice
3. Narration assets / all-scene capture
4. Video creation

The quick navigation is shown near the top, can be collapsed, and auto-compacts after a successful PowerPoint load. The PowerPoint drop area is hidden after loading while the loaded-file summary and Replace action remain visible. On desktop, Step 3 / 4 starts directly below the slide workspace in the left column while Script & voice remains in the right column, so the next workflow step is visible sooner without nested right-pane scrolling.

The output area contains:

- Entire Screen + system audio guidance;
- recording target count;
- estimated narration duration;
- recorded count;
- one primary all-scene recording action;
- cancel action while busy;
- retry-failed action when needed;
- progress/status/current scene/current voice;
- audio track / signal / recorded-scene metrics;
- per-scene list with status, duration, size, voice/rate, and playback.

### Smartphone

Use fixed bottom tabs:

- `スライド / Slides`
- `台本 / Script`
- `出力 / Output`

Smartphone requirements:

- keep Previous / Next scene actions side-by-side with explicit labels;
- use a 0.8x–1.5x playback-rate slider instead of a dense row of preset buttons;
- wrap the Current voice summary so long OS voice names remain readable;
- present the Entire Screen / system-audio requirement as a prominent three-item checklist;

- keep the three narration-source choices in one compact row instead of vertically stacking them;
- keep selected-slide context near the top of the Script view while the user scrolls through a long script;
- expose the selected scene's narration status beside its source summary;
- show lightweight status indicators on the three bottom tabs so the user can see loaded / attention / working / ready states without opening every tab;
- keep microphone/file actions at least 44 px high and full-width where narrow layout benefits from it;
- bound the per-scene recording list so a large deck does not make the entire Output page excessively long;
- scroll the selected scene into view when the user moves between slides;
- keep long filenames, narration labels, and status text from creating horizontal overflow.

No horizontal page overflow at 360–390 px. Full TTS-to-system-audio recording remains primarily targeted at desktop Chrome/Edge on Windows; unsupported mobile behavior must fail clearly rather than pretending capture is available.

## 16. Application phases

Capture phases:

- `idle`
- `requesting-share`
- `preflight`
- `recording`
- `checking`
- `success`
- `error`

Per-scene recording states:

- `pending`
- `recording`
- `success`
- `error`
- `stale`
- UI-only `skipped` for excluded/empty scenes

## 17. Build and dependency lock

`dependencies.json` pins `@aiden0z/pptx-renderer` to `1.2.4` and `html2canvas` to `1.4.1`.

Do not weaken dependency hash checks. On a source package whose lock has not yet been resolved, run once on a network-connected Windows development machine:

```powershell
.\prepare-and-build.bat
```

After the lock is committed, routine builds use:

```powershell
.\build-standalone.bat
```

Runtime remains network-free after building.

## 18. Stable-release acceptance criteria

Required for the current stable line:

- each scene can select `tts`, `mic`, or `file` as its narration source;
- all three narration sources can coexist in one presentation;
- changing script, source, voice, or rate preserves mismatched old audio as stale instead of silently deleting it;
- TTS batch capture requests sharing once, targets only TTS scenes, validates Entire Screen + system audio, verifies measurable signal, retries an empty/no-signal scene once, and keeps successful scenes when another scene fails;
- microphone permission is requested only after an explicit user action;
- local narration/BGM files remain local and are limited to 100 MB each;
- Japanese/English UI works without horizontal page overflow at 360–390 px;
- the PPTX drop area closes after a successful load while the loaded-file summary and Replace action remain available;
- quick navigation can be collapsed/reopened and scene Previous / Next controls remain usable;
- playback-rate changes are passed to `SpeechSynthesisUtterance.rate`, and repeated Preview presses do not disable Stop for the current preview;
- high-fidelity export uses html2canvas with `foreignObjectRendering: false`;
- stale, missing, or failed narration blocks video creation;
- 720p and 1080p H.264/AAC MP4 generation works with Cut/Fade, optional burned-in subtitles, and optional local BGM;
- the final slide remains visible at the end of the generated video;
- cancelling or failing a replacement export does not delete an already successful MP4;
- CSP retains `connect-src 'none'`, runtime dependencies remain embedded, and no runtime CDN/API is introduced;
- readable and self-extracting standalone outputs are generated, and the self-extract payload restores byte-for-byte to the readable HTML;
- favicon and upper-left brand icon use the same canonical SVG;
- repository/license notices remain consistent with GPL-3.0 and the bundled GPL-2.0-or-later FFmpeg/x264 runtime.

See `docs/RELEASE_CHECKLIST.md` for the reusable release regression checklist.
