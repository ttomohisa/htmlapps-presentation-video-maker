# 依存ライブラリの管理

Presentation Video Makerは、実行時に必要な依存を生成HTMLへ埋め込みます。実行時CDNは使用しません。

## npm依存

`dependencies.json` では現在、次を固定しています。

| ID | package | version | 用途 |
| --- | --- | ---: | --- |
| `pptx-renderer` | `@aiden0z/pptx-renderer` | 1.2.4 | PPTX解析・高品質スライド表示 |
| `html2canvas` | `html2canvas` | 1.4.1 | 動画用スライドのorigin-clean Canvas化 |

`dependencies.lock.json` には、各npm tarballのSHA-256を固定しています。取得済み・新規取得を問わず、lockと一致しなければビルドを停止します。

意図的にlockを更新する場合：

```powershell
.\scripts\sync-dependency-lock.ps1
```

個別依存の更新をレビューして適用する場合：

```powershell
.\scripts\update-dependency.ps1 -Id pptx-renderer
.\scripts\update-dependency.ps1 -Id html2canvas
```

`.github/workflows/dependency-updates.yml` は新版をGitHub Issueで通知するだけで、依存バージョンを自動変更しません。

## FFmpeg WASM

MP4変換では次の固定runtimeを使用します。

```text
vendor/ffmpeg-video-compressor-v1.6.0/
```

vendor manifestにはBuilder版数、FFmpeg/x264 revision、capability、hashが記録されています。ブラウザ実行時にFFmpegをダウンロードすることはありません。

FFmpeg vendor runtimeを更新する場合は、次を一式で確認します。

1. 対応するFFmpeg WASM Builder releaseでビルド・検証する。
2. vendor directoryを一式で差し替える。
3. `THIRD_PARTY_NOTICES.md` とライセンス条件を確認する。
4. 単一HTMLを再ビルドする。
5. `scripts/check-repository.ps1` とrelease checklistを実行する。
6. ブラウザでH.264/AAC MP4生成を回帰確認する。

## ローカルTTSの依存資材

単一HTMLには `vendor/local-tts-engine/` と `vendor/local-tts-phonemes/` のONNX Runtime Web、読み変換辞書、発音推定用の資材を埋め込みます。各ディレクトリの通知文書に出典とライセンスを記録しています。`scripts/prepare-local-tts-phonemes.py` は固定ハッシュ付きの配布物から辞書とeSpeakの資材を再作成します。通常のWindowsビルドは同梱資材を使います。Kokoroのモデル本体と声は利用者が別途ダウンロードします。

## ビルドキャッシュ

`.cache/` はnpm tarballや展開済みpackageを保持するローカルキャッシュで、release ZIPには含めません。Windowsで初回ビルドするときやcacheがない場合は `prepare-and-build.bat` を使用してください。
