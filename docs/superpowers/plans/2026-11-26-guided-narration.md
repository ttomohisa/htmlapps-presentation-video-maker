# Guided narration implementation plan

> Execute inline and verify each change against the design.

**Goal** Open a PowerPoint deck, prepare narration together and export an MP4 through three screens.

**Architecture** Keep one source of truth for slide audio and one active screen in the standalone template. Reuse the import, rendering, recording, local synthesis and video engines.

**Spec** `docs/superpowers/specs/2026-11-26-guided-narration-design.md`

- [x] Define workflow regressions for missing, recorded, stale, excluded and silent slide audio.
- [x] Move the preview and per-slide controls to Narration. Share navigation across viewport sizes and route project opens after restoring the manifest.
- [x] Add a deck-level narration action, model preflight, stored sample playback, explicit per-slide overrides and recoverable progress.
- [x] Surface export readiness and issue links. Keep advanced output settings in disclosures.
- [x] Reconcile Japanese and English help and docs. Run Node tests, repository verification and real-browser offline synthesis/export at desktop and mobile sizes.

## Verification

- The standalone repository check passed, including the readable and self-extracting builds. All 66 Node tests passed.
- Offline Chrome and Edge generated Japanese and English narration, preserved the sample WAV while generating the rest, reopened projects and exported MP4 with audio tracks and SRT. Chrome also reopened a v1 project and exported an existing v2.0.0 project at 1080p.
- Browser layout checks covered 320–1360 px, short viewports and both UI languages. A mobile browser profile continued a partially narrated deck with a local audio file. A simulated microphone covered both recording and permission denial.
- Physical phones, physical microphones, a live Windows screen-share permission flow and first-time user studies were outside this verification.
