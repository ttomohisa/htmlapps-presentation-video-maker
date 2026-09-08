# Dependency maintenance

Presentation Video Maker embeds all runtime dependencies into the generated HTML. Runtime CDN loading is not used.

## npm dependencies

`dependencies.json` currently pins:

| ID | Package | Version | Purpose |
| --- | --- | ---: | --- |
| `pptx-renderer` | `@aiden0z/pptx-renderer` | 1.2.4 | PPTX parsing and high-fidelity slide rendering |
| `html2canvas` | `html2canvas` | 1.4.1 | Origin-clean Canvas rasterization for video snapshots |

`dependencies.lock.json` records the exact npm tarball SHA-256 for each package. A build stops if the downloaded or cached tarball does not match the committed lock.

To refresh lock entries intentionally:

```powershell
.\scripts\sync-dependency-lock.ps1
```

To review and apply an update for one dependency:

```powershell
.\scripts\update-dependency.ps1 -Id pptx-renderer
.\scripts\update-dependency.ps1 -Id html2canvas
```

The scheduled `.github/workflows/dependency-updates.yml` workflow only reports available updates through a GitHub Issue. It does not change dependency versions automatically.

## FFmpeg WASM

MP4 conversion uses the checked-in runtime under:

```text
vendor/ffmpeg-video-compressor-v1.6.0/
```

The vendor manifest records the builder version, FFmpeg/x264 revisions, runtime capabilities, and source hashes. This runtime is not downloaded by the browser.

When replacing the FFmpeg vendor runtime:

1. build and verify it through the corresponding FFmpeg WASM Builder release;
2. replace the complete vendor directory as one reviewed unit;
3. review `THIRD_PARTY_NOTICES.md` and license implications;
4. rebuild the standalone HTML;
5. run `scripts/check-repository.ps1` and the release checklist;
6. confirm H.264/AAC MP4 output in a browser regression.

## Build cache

The local `.cache/` directory stores npm tarballs/extracted packages for faster rebuilds and is not part of the release archive. Use `prepare-and-build.bat` for the first build on Windows or when the cache is missing.
