# APP_SPEC.md — Presentation Video Maker

## 1. Product summary

Presentation Video Maker is a Browser Kitty app for turning a local PowerPoint deck into a narrated video without uploading the deck, scripts, or narration audio.

Version `2.0.0` adds local Japanese and US English model narration. Slides can inherit the presentation language or use an explicit language. The application loads a user-selected Kokoro model and voice, generates scene audio locally, and saves that audio in the project. [Local TTS design](docs/superpowers/specs/2026-11-25-local-tts-design.md)

Version `1.3.0` keeps the tested v1.2.0 smartphone/project/narration behavior and adds an accelerated local video-export path. On browsers that can encode H.264 and AAC with WebCodecs, the app avoids real-time MediaRecorder composition and writes encoded tracks directly into MP4 with a built-in ISO BMFF muxer; FFmpeg WASM is not started on this path. The v1.2.0 MediaRecorder + FFmpeg pipeline remains the compatibility fallback. Native PowerPoint animations/transitions remain out of scope.

## 2. Current release

- Version: `2.0.0`
- Readable one-file build: `dist/index.html`
- Self-extracting one-file build: `dist/index.self-extract.html`
- Japanese and English in the same HTML. The header language switch shows `EN` in Japanese and `JA` in English, with a localized target-language accessible name and tooltip. Help retains its localized title and tooltip.
- Intended hosting: GitHub Pages / Azure Static Web Apps.
- Direct `file://` opening supports PPTX parsing, rendering, editing, and model narration. Browser capture policy may require HTTP(S) for system-audio capture.

## 3. Primary flow

1. **Open file.** Open a .pptx up to 150 MB. Import notes and use slide text as the draft when notes are absent. A .pvm opens in Narration or Video after restoration, depending on whether the audio is ready.
2. **Narration.** Prepare the deck’s audio. Compatible desktop browsers default to local model narration with Japanese selected. Phones can select local model narration and default to the microphone where available. An environment with neither path defaults to audio files. Model setup lists the shared model and missing languages for the batch. Creating and listening to a sample produces the actual WAV for that slide.
3. **Edit individual slides.** Choose a slide to edit its script or settings. Batch synthesis and batch computer-speech capture skip audio that is already usable for the selected method. An included reading slide with an empty script can appear without narration. Audio recorded through the microphone or selected from a file can be used with an empty script.
4. **Video.** Show the output duration, included slide count and resolution. Link unmet audio requirements to the affected slide. Show progress, cancellation, preview and saving at the same location. Provide transition, BGM, subtitle and timeline controls under Finishing settings, and text exports under a separate disclosure.
5. **Save work.** Store deck and individual audio methods as optional fields in the v2 manifest, alongside the existing actual method. Older projects restore their saved methods as explicit choices. Preserve source and model compatibility across reopening.

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

Presentation content is not persisted automatically in LocalStorage or IndexedDB. Language preference is the only current LocalStorage preference. Explicit `.pvm` project save/open remains the persistence path: the user chooses when to create or reopen a local project file containing the PPTX, scene settings, narration assets, BGM, and output settings.

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

Known v1.2.0 visual limitations:

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
- recording fields are empty/zero until capture succeeds;
- new PPTX scenes default to `mic` on phones with recording support and `local` on supported desktop browsers. Loading an existing `.pvm` preserves its saved narration source.

The recorded Blob intentionally contains only a small technical lead/tail around speech. `recordingSpeechStartOffset` and `recordingSpeechEndOffset` identify the spoken region for video composition. User-configured pre/post padding is **not waited out during capture**; it remains timeline metadata.

## 8. Narration editing and stale recordings

Changes to the script, speech settings, or audio source can make scene audio stale. The old recording remains playable while a replacement is needed. For local model synthesis, changing the effective language invalidates its previous audio. Changing only whether the slide is included leaves its audio reusable.

This prevents accidental loss while making it clear that current settings and current audio no longer match.

Applying voice/rate to all scenes and restoring source scripts preserve Undo behavior for scene settings/status.

## 9. Narration sources

Each scene has `audioSource` with one of `local`, `tts`, `mic`, or `file`. A successful audio asset records its provenance in `recordingSource`. Switching sources preserves the previous Blob and makes an unmatched recording stale.

- `local`: synthesizes WAV audio from the selected Kokoro model and Japanese or US English voice, entirely inside a browser worker. A scene inherits the project language or overrides it, and can set its own speed. The worker uses the English lexicon and spelling rules when Japanese scripts contain English words. Typical abbreviations retain letter-by-letter readings. Compatible phones and desktop Chrome or Edge can generate local model audio. A phone releases the Kokoro worker before generating video so its runtime memory can be reclaimed.
- `tts`: uses SpeechSynthesis and Windows system-audio capture on supported desktop browsers. The selected scene or all eligible scenes can be captured. Smartphones can preview browser speech where available and use microphone or file narration for the supported recording workflow.
- `mic`: uses `getUserMedia({audio:true})` and MediaRecorder to record the selected slide directly from the microphone. Existing audio is not destroyed until a new recording succeeds.
- `file`: accepts a local audio file up to 100 MB, reads duration locally, and stores the File directly as the scene audio Blob.

All four sources remain local and can coexist in one final MP4.

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

System audio on smartphones:

- SpeechSynthesis may still be used for preview when the browser exposes local voices.
- TTS capture buttons and all-scene system-audio controls are unavailable on detected smartphones.
- The UI describes the browser voice as a sample and identifies Kokoro as the route for generating narration audio on compatible phones.
- Do not emulate a mobile TTS recording path with cloud APIs or network services.

## 11. System-audio preflight

Before any scene recordings are replaced, the capture run must verify:

1. `getDisplayMedia` is available;
2. the user selected an entire screen (`displaySurface === "monitor"`);
3. the returned stream contains an audio track;
4. an `AudioContext` analyser can observe measurable RMS while a short local TTS phrase is spoken.

If preflight fails, existing scene recordings are preserved.

System audio can contain notification sounds or audio from other apps. UI must instruct the user to stop unrelated audio during capture.

## 12. Selected-scene and efficient all-scene TTS recording

A selected-scene TTS run and a normal full-deck TTS run use the same capture engine. A full-deck run requests sharing **once** for all target TTS scenes; a selected-scene run requests sharing once for that single target.

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

A no-signal/empty-data scene is automatically tried one additional time before being marked failed. After a scene is marked failed, the user re-records that scene individually from the per-scene narration list; there is no failed-scene batch retry action.

## 13. Project save/resume and text export

Project persistence is explicit and file-based. The app does not autosave presentation content.

The `.pvm` container uses a small local binary format with no additional runtime dependency:

```text
8 bytes   magic: PVMPRJ1\n
4 bytes   little-endian JSON manifest length
N bytes   UTF-8 JSON manifest
remaining raw payload blobs (PPTX / scene audio / BGM)
```

The manifest identifies `presentation-video-maker-project`. v2.0.0 writes schema version `2` and reads versions `1` and `2`. It stores source metadata, one record per slide, optional BGM, output settings, and byte ranges for embedded assets. Active model generation, browser speech capture, microphone recording, and video export block project operations. Opening a project with current work loaded requires confirmation.

The project includes:

- source PPTX;
- per-scene script, include state, narration source, voice, rate, timing/padding, transition/subtitle flags;
- project default and per-scene override for local narration language, plus model and voice identifiers for generated audio;
- successful/stale scene audio assets where present;
- optional BGM file;
- current video output filename/resolution/transition/subtitle/BGM settings;
- selected scene index.

Model and voice files stay separate from the project. Saved narration can be played and exported before selecting model files again. The generated MP4 also stays separate.

TXT export writes non-empty scripts grouped by slide. SRT/VTT export uses enabled-scene ordering, pre-padding, scene duration, and the existing subtitle-export transition timing. Recorded/measured narration duration is preferred; otherwise the current estimate is used. External cues retain equal segment timing and the existing 45 ms Cut gap, so exact synchronization with burned-in subtitles or the accelerated video path is not guaranteed. All exports are created locally through explicit download actions.

The text-export card includes a native, initially collapsed subtitle preview with a labeled SRT/VTT selector, localized cue count, and a read-only, selectable, scrollable text field. It displays the complete current download text (without the invisible UTF-8 BOM), using the same serializer as the download actions. Opening or changing the format recomputes the preview; while open, script, inclusion, padding, measured/recorded duration, narration rate/source, transition, language, project-open and source changes refresh it without moving focus. Source invalidation clears old content immediately. Collapsed previews do not serialize scripts. Preview actions never create downloads or mutate project/media state, and preview preferences are not saved in the project format.

Subtitle timestamps round nonnegative finite seconds to a single integer-millisecond total before deriving hours/minutes/seconds/milliseconds, so carry propagates correctly at second, minute and hour boundaries. Invalid/non-finite values produce zero, milliseconds always have three digits, and hours above 99 are retained. Narration is assigned to the text field as literal text, never HTML. The preview and in-app help explain that unmeasured narration uses estimates and that exported timing may differ from burned-in subtitles.

## 14. Local video generation

Video export requires all enabled scenes with non-empty narration scripts to have `recordingStatus === "success"` and a local `recordingBlob`. A stale, missing, or failed recording blocks export and directs the user back to narration capture.

Output options in v1.3.0:

- H.264 + AAC MP4
- 720p or 1080p height
- aspect ratio inherited from the PowerPoint slide size
- editable filename, with `.mp4` added separately
- explicit save after successful generation

The previous successful MP4 remains available when output settings change. Show its outdated-output warning only while that result is stale; a successful generation or regeneration must hide the warning, including when its visible layout uses flex. Renaming or saving the MP4 does not mark it stale, and clearing the result hides both the output and warning.

The preferred video pipeline is:

```text
slide snapshot(s)
+ per-scene recorded narration
+ pre/post padding / subtitles / fade / BGM
        ↓
WebCodecs H.264 + AAC encoding
        ↓
built-in ISO BMFF MP4 mux
        ↓
H.264 / AAC MP4
```

This path is selected only after runtime capability checks for both `VideoEncoder` H.264 and `AudioEncoder` AAC. It runs faster than media duration because frames and PCM are submitted to the encoders without waiting for wall-clock playback. Static presentation regions use variable-duration video samples: one encoded frame can represent the full unchanged interval, subtitle changes create a new frame only when the visible text changes, and fades retain a short multi-frame sequence. This substantially reduces the number of H.264 frames submitted for typical slide decks. The FFmpeg stage is not used on the fast path.

Compatibility fallback remains:

```text
Canvas + Web Audio + MediaRecorder
        ↓
intermediate WebM
        ↓
embedded FFmpeg WASM H.264/AAC transcode
        ↓
MP4
```

The fallback intentionally runs approximately in real time during MediaRecorder composition. No intermediate or final media is uploaded on either path.

Smartphone video path in v1.2.0:

- default the resolution selector to 720p for newly opened sessions on detected smartphones;
- keep 1080p selectable but show an explicit high-memory warning;
- create slide snapshots progressively while composing instead of pre-rasterizing and retaining every slide Blob at once;
- keep at most the current/next transition snapshot needed by the mobile composition loop and release temporary Canvas backing stores promptly;
- dispose the FFmpeg runner after a smartphone export so the WASM heap is not retained unnecessarily between exports;
- request Screen Wake Lock during video creation when supported, and release it on success, failure, cancellation, or page exit.

The FFmpeg runtime:

- is embedded in the standalone HTML;
- uses the Builder `video-compressor` profile;
- does not require SharedArrayBuffer or cross-origin isolation;
- uses no runtime network access;
- carries GPL-2.0-or-later terms because the profile links x264.

The application repository is distributed under GPL-3.0 in v1.3.0. See `THIRD_PARTY_NOTICES.md` for exact Builder/runtime revisions and corresponding-source information.

## 15. Failure, retry, and cancellation

- Permission denial, wrong surface, missing audio track, or failed preflight aborts the run before replacing scene audio.
- A single scene failure does not discard other completed scenes.
- Failed scenes are listed with `Failed / 失敗` and can be retried as a smaller follow-up capture run.
- Cancellation stops SpeechSynthesis, active MediaRecorder, and display tracks.
- Completed recordings from earlier scenes remain available after cancellation.
- Any scene left in transient `recording` state after interruption is normalized to `stale` when an older Blob exists, otherwise `pending`.

## 16. UI / UX

### Help

Help uses a viewport-bounded native dialog with one scrollable body and a fixed header. Closing it restores ordinary page scrolling and preserves the page position. The final build metadata remains readable in both languages at narrow, short viewport sizes.

The introduction uses a single sentence describing the PowerPoint-to-narrated-MP4 workflow. The shield-marked local-processing badge and informational footer appear above 600 px. At 600 px and below, both are hidden while navigation and controls remain available.

### Shared navigation

- Show Open file, Narration and Video once a deck is loaded. Each screen is independently accessible and maintains the current slide and edits.
- The Narration screen puts the next action above the slide editor. Use the slide list to jump to a slide or filter for slides that need audio.
- Use one stacked layout with collapsible slide list and preview on narrow screens. Screen width controls layout. Device capability determines available narration methods.
- Offer Kokoro on compatible phones and provide recording or file selection where the saved method is unavailable. Play and export valid audio that was already stored in a project.
- Use 720p by default on phones and 1080p on desktop. Preserve the resolution and finishing settings of a reopened project.
- Check explicit state labels, visible focus and no horizontal overflow at 320 px and common desktop widths.

## 17. Application phases

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

## 18. Build and dependency lock

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

## 19. Stable-release acceptance criteria

Required for the current stable line:

- each scene can select `local`, `tts`, `mic`, or `file` as its narration source;
- TTS can be captured for the selected scene alone or as an all-scene TTS batch through the same validated system-audio path;
- all four narration sources can coexist, and local model synthesis works offline for Japanese and US English;
- `.pvm` save/open round-trips PPTX, scene settings, narration assets, BGM, and output settings without network access;
- the audio status filter and video issue link work on large decks;
- TXT, SRT, and VTT export work locally from current script/timeline data;
- changing script, source, voice, or rate preserves mismatched old audio as stale instead of silently deleting it;
- TTS batch capture requests sharing once, targets only TTS scenes, validates Entire Screen + system audio, verifies measurable signal, retries an empty/no-signal scene once, and keeps successful scenes when another scene fails;
- microphone permission is requested only after an explicit user action;
- local narration/BGM files remain local and are limited to 100 MB each;
- Japanese/English UI works without horizontal page overflow at 360–390 px;
- smartphone UI shows Open file / Narration / Video without horizontal overflow at 320–390 px;
- new PPTX scenes default to microphone narration on detected smartphones while `.pvm` restore preserves saved sources;
- compatible phones can generate Japanese and English Kokoro audio and include it in MP4, while browser voice preview and desktop system-audio capture are presented separately;
- smartphone video output defaults to 720p, shows a 1080p memory warning, uses progressive snapshot composition, and releases the FFmpeg runner after export;
- smartphone video creation requests Wake Lock when available without making Wake Lock a hard requirement;
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
