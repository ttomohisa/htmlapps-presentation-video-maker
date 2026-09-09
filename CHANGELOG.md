# Changelog

## [1.3.0] - 2026-09-09

### Added

- Add an automatically selected WebCodecs fast-export path on browsers that can encode H.264 and AAC locally.
- Add internal export-stage timing so development builds can compare slide rasterization, video encoding, audio encoding, muxing, and the legacy MediaRecorder/FFmpeg path via `PVMPerformance.getLastReport()`.
- Add a developer-only `PVMPerformance.setMode("auto" | "fast" | "legacy")` switch for repeatable performance comparisons without adding technical controls to the general-user UI.

### Changed

- Avoid real-time MediaRecorder composition on supported browsers: slide frames and narration audio are encoded as fast as the device allows with WebCodecs.
- Use variable-duration video samples on the fast path: unchanged slide regions are encoded once for their full display duration, while new frames are emitted only for subtitle changes and fade steps. This avoids encoding 30 identical frames per second during static presentation content.
- Write WebCodecs H.264/AAC directly into MP4 with the built-in ISO BMFF muxer on the fast path, removing both the intermediate WebM and the FFmpeg step from accelerated export.
- Keep the v1.2.0 MediaRecorder + FFmpeg transcoding pipeline as an automatic compatibility fallback when WebCodecs H.264/AAC is unavailable or the accelerated path cannot complete.
- Keep smartphone progressive slide rasterization and all existing local-processing, project, narration, subtitle, BGM, transition, and final-frame behavior.

### Fixed

- Stabilize VFR fade timing by making each long variable-duration visual span an H.264 key-frame anchor and starting every fade with a new GOP. This prevents codec frame reordering from affecting transition pacing while keeping static-frame reduction.
- Remove the early fast-path attempt to pass generic FFmpeg CLI arguments into the specialized `video-compressor` WASM runner. The accelerated path now muxes WebCodecs AVC/AAC directly and does not invoke that runner.

### Verification

- Confirm JavaScript syntax, CSP, translation parity, the built-in H.264/AAC MP4 muxer against FFmpeg/ffprobe, and the unchanged compatibility export path after adding the accelerated exporter.
- Confirm variable-duration MP4 sample tables with one-frame and three-frame H.264 fixtures plus AAC; ffprobe reports the intended duration and FFmpeg decodes the complete file without errors.
- Confirm the fast path performs capability detection at runtime and never contacts an external service.
- Expose the actual encoded-frame count, 30 fps-equivalent frame count, and frame-reduction percentage in the developer performance report for VFR regression checks.
- On the same Windows Chrome fixture used during optimization, confirm the accelerated exporter at 2.932 s total / 1.874 s video encoding versus the previous 16.957 s total / 15.718 s video encoding baseline before VFR static-span reduction. Real-device browser codec support remains capability-dependent.

## [1.2.0] - 2026-09-09

### Added

- Add a smartphone workflow for opening PPTX/`.pvm`, editing scripts, recording/importing narration, and generating/saving MP4 entirely in the browser.
- Add an explicit smartphone notice that on-device SpeechSynthesis can be previewed but cannot be captured as narration; use microphone recording or a local audio file on smartphones.
- Add a 720p smartphone default plus a warning when 1080p is selected because of the higher mobile memory requirement.
- Add a lower-peak-memory smartphone composition path that rasterizes slide snapshots progressively instead of retaining the full deck in Canvas memory.
- Request Screen Wake Lock during smartphone video generation when the browser supports it.

### Changed

- Default newly loaded smartphone PPTX scenes to microphone narration while keeping the desktop default on-device SpeechSynthesis behavior unchanged.
- Simplify smartphone bottom navigation to **Slides / Script & audio / Video** and hide desktop-only TTS capture controls on smartphones.
- Release temporary Canvas backing stores more aggressively during smartphone export and dispose the FFmpeg WASM runner after the export completes.
- Use mobile-safe form sizing and temporarily hide the fixed bottom navigation while the virtual keyboard is open.

### Verification

- Confirmed JavaScript syntax and Japanese/English translation-key parity after the smartphone workflow changes.
- Verified the standalone CSP continues to block runtime connections with `connect-src 'none'` and keeps the tested origin-clean html2canvas path.
- Verified smartphone UI behavior at 360 px, 390 px, and 430 px without horizontal page overflow in Chromium emulation.
- Verified a 720p smartphone-path MP4 export with local narration assets in Chromium and a 1080p desktop-path MP4 export with the same three-scene fixture.
- Verified smartphone `.pvm` save/open restores an edited script, local scene audio, three-slide structure, and the 720p output setting.
- Real-device iPhone Safari and Android Chrome checks remain part of release-candidate validation because permission dialogs, memory pressure, and save behavior cannot be fully represented by desktop emulation.

## [1.1.0] - 2026-09-09

### Added

- Add **Record this slide** for on-device SpeechSynthesis narration, reusing the established Entire Screen + system-audio capture path for one selected TTS scene. Existing audio is replaced only after a successful capture.
- Add local `.pvm` project save/open so the source PPTX, scene scripts/settings, narration recordings, BGM, and output settings can be resumed later without upload. Generated MP4 is intentionally not embedded in the project file.
- Add scene-progress counts for ready, unrecorded, stale, and failed narration plus **Next item to fix** navigation for larger presentations.
- Add local TXT script export and SRT/VTT subtitle export based on the current video timeline.
- Add per-row narration actions to the scene recording list: record TTS/microphone scenes directly, stop an active microphone recording, or choose/replace the local audio file for file-backed scenes.

### Changed

- Separate the `.pvm` project opener from the PowerPoint drop zone and restrict its file picker to `.pvm`, so resuming a project cannot accidentally open the PPTX picker.
- Keep project persistence explicit: the app does not autosave and still stores no presentation content in LocalStorage or IndexedDB.
- Remove the failed-scene batch re-record action; failed or stale narration is corrected individually from the per-scene narration list.
- Make scene playback controls clearly interactive with pointer cursors and hover/active feedback.
- Keep the existing all-scene TTS, microphone, local-audio, high-fidelity rendering, final-frame flush, and FFmpeg WASM MP4 pipeline unchanged.

### Verification

- Verified `.pvm` save/open with an embedded PPTX, imported scene audio, BGM, scripts, and output settings in Chromium.
- Verified TXT/SRT/VTT download output and project restoration after a fresh page load.
- Verified 30-slide layouts at 1200 px, 390 px, and 360 px without horizontal page overflow.
- Confirmed the v1.1.0 release-candidate interaction fixes on the Windows browser flow before promoting the release to stable.

## [1.0.1] - 2026-09-08

### Fixed

- Remove the stable-release feature banner from the application UI.
- Keep all-scene TTS recording running when the user reviews or moves to another slide from the slide list or Script & voice panel.
- Snapshot each all-scene TTS recording job at capture start so slide navigation cannot change the script, voice, or rate being recorded mid-run. If narration settings are edited during capture, the resulting audio is preserved as stale instead of being treated as current.
- Prevent manual speech preview and PowerPoint replacement from interrupting an active all-scene recording.

## [1.0.0] - 2026-09-08

### Stable release

- Promote Presentation Video Maker to the first stable release after the v0.9.0 release-candidate regression.
- Finalize the English and Japanese README files in the Browser Kitty repository format used by PDF Organizer.
- Refresh Japanese, English, and smartphone screenshots for the stable UI.
- Keep the tested PPTX renderer, html2canvas origin-clean rasterization path, three-source narration model, final-frame flush, generated-video preservation, and embedded FFmpeg WASM MP4 pipeline unchanged.
- Finalize release metadata and standalone/self-extract artifacts as v1.0.0.
- Remove version-specific smoke-test/release-status documents and other development-only handoff artifacts; keep one evergreen release checklist instead.
- Review the complete repository tree and retain only current source, build/verification tooling, legal/security documentation, screenshots, fixtures, vendor runtime assets, and release artifacts.

All notable changes to Presentation Video Maker are documented in this file.

## [0.9.0] - 2026-09-08

### Changed

- Freeze the feature scope for release-candidate regression; v0.9.0 intentionally adds no new media pipeline or narration feature.
- Carry forward the completed v0.8.0 desktop/mobile workflow, including the always-visible PowerPoint chooser icon.
- Expand release checks around larger decks, long filenames/scripts, source switching, stale narration, generated-video preservation, and 360/390 px layouts.

### Verification

- Consolidate release regression checks into `docs/RELEASE_CHECKLIST.md`.
- Keep the v0.7.0 narration pipeline and v0.6.2 high-fidelity/html2canvas pipeline unchanged.

## [0.8.0] - 2026-09-08

### Changed

- Add a collapsible four-step quick navigation near the top of the app; it automatically compacts after a PowerPoint is loaded and can be expanded again at any time.
- Hide the PowerPoint drop area after a successful load while keeping the loaded-file summary and Replace action visible.
- Rework the desktop editor grid so Step 3 / Step 4 begin directly below the slide workspace while Script & voice remains in the right column, using the previously empty left-side space without introducing nested scrolling.
- Keep Previous / Next scene controls side-by-side with explicit labels on desktop and smartphone.
- Replace playback-rate preset buttons with a continuous 0.8x–1.5x slider and show the current rate clearly.
- Show the full selected voice in a wrapping summary so long OS voice names do not disappear in narrow panels.
- Turn the system-audio sharing warning into a prominent three-point checklist for Entire Screen, system audio, and notification/music suppression.
- Refine the smartphone Script workflow with a compact three-way narration-source selector instead of stacking all source choices vertically.
- Keep the selected-slide context visible near the top of the smartphone Script view while editing long narration scripts.
- Allow the smartphone Script panel to use viewport sticky positioning instead of trapping the selected-slide context inside the panel overflow boundary.
- Show the current scene narration state next to its source summary so pending, ready, stale, failed, recording, and skipped states are easier to distinguish.
- Add small state indicators to the smartphone bottom navigation for Slides, Script, and Output without changing the existing three-tab structure.
- Make microphone/file source actions easier to tap on narrow screens and constrain long per-scene recording lists to a scrollable area.
- Auto-scroll the selected slide into view when moving between scenes.
- Localize navigation, narration-source, playback-rate, timeline, and Output shortcut accessibility labels.

### Fixed

- Keep the PowerPoint chooser icon clearly visible in both normal and hover states instead of inheriting the drop-zone accent color against the green primary button.
- Keep Stop available when Preview is pressed twice quickly by ignoring stale callbacks from the cancelled Web Speech utterance.
- Apply the visible narration-speed slider value directly to Web Speech preview and persist the value immediately for the selected slide.
- Remove redundant Script & voice shortcut buttons whose destination was already covered by Quick navigation.
- Replace the general-user FFmpeg wording with a plain explanation that video composition takes roughly the video duration and is followed by local MP4 finishing.
- Keep the selected scene summary consistent with the active narration source after script edits instead of always showing a TTS voice summary.
- Prevent a late local-voice refresh from replacing the selected microphone/file source status with an unrelated “no local voice” warning.
- Keep dynamic status-chip translation keys in sync so JA/EN switching does not visually revert loaded/recording/export states to their initial labels.
- Treat pending narration as an idle mobile Script indicator instead of incorrectly showing it as ready.
- Preserve the v0.7.0 narration-source/stale-audio behavior and the v0.6.2 high-fidelity export path without changing the media pipeline.

## [0.7.0] - 2026-09-08

### Added

- Add per-scene narration source selection: on-device SpeechSynthesis, microphone recording, or local audio file.
- Add direct microphone recording for the selected slide with local MediaRecorder audio and explicit Stop control.
- Add local narration file import/replacement up to 100 MB with local duration detection and no upload.
- Allow TTS, microphone, and file-based narration to be mixed across scenes in the same MP4.
- Preserve the previous scene audio as stale when changing narration source instead of silently deleting it.

### Changed

- Limit the one-click all-scene system-audio capture plan to scenes that use on-device speech; microphone/file scenes are prepared from the slide editor.
- Make video duration, validation, playback, and composition use successful microphone/file audio even when the narration script is empty.
- Keep v0.6.2 high-fidelity slide rasterization, fade/subtitle/BGM export, final-slide flush, and generated-video preservation behavior.

## [0.6.2] - 2026-09-07

### Fixed

- Replace the high-fidelity export DOM → SVG `foreignObject` → Canvas path, which can taint Canvas under `file://` / opaque origins even when all nested media are local.
- Rasterize the prepared high-fidelity preview DOM with embedded `html2canvas@1.4.1` using its normal Canvas renderer (`foreignObjectRendering: false`).
- Normalize computed styles, embedded Canvas content, and local `blob:` media before rasterization, then verify the intermediate Canvas is origin-clean before copying it into the video Canvas.
- Preserve the v0.6.1 behavior that keeps an already generated MP4 when output settings change or a replacement export fails.

## [0.6.1] - 2026-09-07

### Fixed

- Keep the previously generated MP4 visible and downloadable when resolution, transition, subtitle, or BGM settings change; mark it as created with the previous settings until a new export succeeds.
- Preserve the previous MP4 if a replacement export is cancelled or fails.
- Inline `blob:` media references found inside computed CSS (including background/mask images and similar style URLs) before high-fidelity slide rasterization. Blob images are rasterized locally through `<img>` + Canvas instead of `fetch()`, so the strict `connect-src 'none'` CSP remains intact while exported slides follow the on-screen high-fidelity preview.
- Continue to clear generated video only when the source PowerPoint itself is replaced or the page is closed.

## 0.6.0 - 2026-09-07

- Added Cut / Fade transitions between slides.
- Added optional burned-in subtitles generated locally from each narration script and timed across the recorded narration duration.
- Added optional local BGM file mixing with volume control and looping; BGM never leaves the device.
- Added a compact output timeline preview showing included scenes, durations, and transition type.
- Preserved v0.5.2 final-slide flush and tainted-canvas safe fallback behavior.


## [0.5.2] - 2026-09-07

### Fixed

- Ensured the final static slide is retained in exported video by explicitly requesting and flushing canvas frames before MediaRecorder stops.
- Added scene-boundary frame requests so static slides receive stable video timestamps even when the canvas content does not continuously change.

## [0.5.1] - 2026-09-07

### Fixed
- Prevent MP4 export from failing with `SecurityError: Tainted canvases may not be exported` when a high-fidelity PowerPoint render contains canvas-unsafe media.
- Treat `canvas.toBlob()` as part of the high-fidelity snapshot attempt; if serialization is blocked, discard the tainted canvas and redraw the scene on a fresh safe fallback canvas before continuing video generation.

## [0.5.0] - 2026-09-07

### Added
- Add local 720p / 1080p video creation from included PowerPoint scenes and fresh per-scene narration recordings.
- Compose slide snapshots, narration, and pre/post padding into an intermediate WebM with Canvas, Web Audio, and MediaRecorder.
- Embed FFmpeg WASM Builder v1.6.0 `video-compressor` runtime into the standalone HTML and convert the intermediate WebM to H.264/AAC MP4.
- Add video readiness validation, progress stages, cancellation, MP4 preview, editable filename, and explicit save.
- Preserve the PowerPoint slide aspect ratio when choosing 720p / 1080p output.
- Add a simple slide rendering fallback for export if high-fidelity snapshot generation fails.

### Changed
- Start the video AudioContext from the Create video user gesture so later asynchronous slide preparation does not lose browser audio activation.
- Move the repository license to GPL-3.0 because the embedded FFmpeg/x264 generated core is GPL-2.0-or-later.
- Keep `connect-src 'none'`; FFmpeg JavaScript and WebAssembly are embedded and require no runtime network access.

### Not yet included
- Subtitle, fade, and editable timeline controls remain planned for v0.6.0.
- Microphone narration, BGM, and audio replacement remain planned for v0.7.0.

## [0.4.1] - 2026-09-07

### Fixed
- Kept the all-scene recording panel inside the left workflow column so it no longer sits behind the sticky narration editor on desktop.
- Refined the Browser Kitty icon: presentation at upper-left, conversion arrow at lower-left, and separated video/audio symbols at lower-right for better small-size legibility.

## [0.4.0] - 2026-09-07

### Added

- Record all enabled narration scenes from one Entire Screen + Windows system-audio sharing session.
- Add a short real-signal preflight before replacing any existing narration asset.
- Store each scene as its own local MediaRecorder Blob with MIME, size, RMS, attempts, narration duration, and speech offsets.
- Split long narration scripts into bounded SpeechSynthesis chunks while keeping one scene recording open.
- Automatically retry an empty/no-signal scene once within the same sharing session.
- Preserve successful scenes when another scene fails and add a retry-failed-scenes action.
- Add per-scene recording status, duration/size, voice/rate, and playback UI.
- Add stale-recording handling so script/voice/rate edits do not silently destroy the previous audio.
- Replace the canonical favicon/header icon with a Browser Kitty-style #16624F presentation → arrow → video+audio SVG.

### Changed

- Promote the proven v0.1.1 system-audio path from diagnostic test to the v0.4.0 narration production path.
- Avoid waiting for user pre/post padding during TTS capture; padding remains timeline metadata for v0.5.0.
- Keep completed scene recordings after cancellation and normalize interrupted scene state safely.
- Update Japanese/English help, README, APP_SPEC, and mobile Output UI for all-scene recording.

### Not yet included

- MP4 video generation remains planned for v0.5.0.
- Subtitle/fade/timeline composition remains planned for v0.6.0.

## [0.3.0] - 2026-09-06

### Added

- Add per-scene narration voice/rate restoration when switching slides.
- Add previous/next scene controls in the narration panel for faster script editing.
- Add source-script restore from speaker notes or slide-text draft with Undo.
- Add deck-wide voice/rate apply with a full-scene Undo snapshot.
- Record measured narration duration after a successful Web Speech API preview, and invalidate it when script/voice/rate changes.
- Add a new canonical PowerPoint → narrated-video icon shared by favicon and header.

### Changed

- Treat v0.3.0 as the completed narration-editing milestone while keeping MP4 generation deferred to v0.5.0.
- Cancel active speech when scene selection changes so narration cannot continue against the wrong slide.
- Update Japanese / English help, README, specification, and roadmap for the narration-editing workflow.

### Not yet included

- Continuous all-scene narration capture remains planned for v0.4.0.
- MP4/WebM video export remains planned for later milestones.

## [0.2.0] - 2026-09-06

### Added

- Add the pinned `@aiden0z/pptx-renderer@1.2.4` standalone browser ESM as the primary high-fidelity slide renderer dependency.
- Add a slide/scene rail with lazy thumbnail rendering and a large selected-slide preview.
- Add a forward-compatible scene model for script source, enabled state, voice/rate, narration duration, pre/post padding, transition, subtitle, and compatibility hints.
- Use speaker notes as the scene script and extracted slide text as a plain narration draft when notes are missing.
- Add compatibility hints for PowerPoint animation/timing, transitions, and related audio/video.
- Add renderer lifecycle management: serialized render queue, selected-slide priority, disposable handles, bounded thumbnail cache, and shared Blob URL cleanup.
- Add a built-in simple-preview fallback when the embedded high-fidelity renderer is unavailable or cannot render a slide.
- Add `prepare-and-build.bat` for the first dependency-lock resolution on a network-connected development machine.

### Changed

- Move the desktop UI from the v0.1 feasibility cards to a scene-editing workspace.
- Change the mobile navigation labels to Slides / Script / Output while preserving the proven system-audio capture test in the Output step.
- Treat the v0.1.1 Windows system-audio TTS path as a confirmed regression requirement.
- Keep the mobile header compact at 360 px so the language switch does not wrap or force horizontal scrolling.
- Update the bundled PPTX fixture and help text to use the proven Entire Screen + Windows system-audio capture flow.

### Not yet included

- MP4/WebM video export remains planned for later milestones.
- PowerPoint animations, transitions, embedded audio, and embedded video are not replayed.

## [0.1.1] - 2026-09-06

### Changed

- Switch the Web Speech API feasibility gate from current-tab audio to Windows system-audio capture after the v0.1.0 real-device test produced no TTS signal.
- Prefer Entire Screen capture and request system audio explicitly.
- Reject a selected sharing surface that is not an entire monitor for this diagnostic build.
- Show the selected display surface and captured audio-track label in recording details.
- Reset the measured RMS immediately before TTS starts to reduce false positives from sounds made before narration.
- Update Japanese / English guidance to warn that other system sounds may be included.

## [0.1.0] - 2026-09-06

### Added

- Initial Browser Kitty technical feasibility build based on the single-HTML template.
- Local `.pptx` file picker and drag-and-drop input, with a 150 MB limit.
- Dependency-free PPTX ZIP parsing using `DataView`, `DOMParser`, and `DecompressionStream('deflate-raw')`.
- Slide text and speaker-note extraction.
- On-device-only Web Speech API voice enumeration and speech preview.
- Configurable narration speech rate presets.
- Guided `getDisplayMedia()` current-tab audio recording test.
- Audio-track, audio-signal, and recorded-Blob validation.
- Successful narration recording playback and editable WebM filename export.
- Japanese / English UI and mobile bottom-page navigation.
- Three-slide PPTX test fixture with speaker notes.
- Browser Kitty privacy boundary with `connect-src 'none'` and no runtime dependencies.

### Known limitation

- A real Windows Chrome / Edge test is still required to determine whether Web Speech API output is included in current-tab audio capture on the target environment. This is the Go / No-Go gate for the next milestone.
