# Presentation Video Maker

[![GitHub Pages](https://github.com/ttomohisa/htmlapps-presentation-video-maker/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/ttomohisa/htmlapps-presentation-video-maker/actions/workflows/deploy-pages.yml)
[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](LICENSE)
[![Single HTML](https://img.shields.io/badge/distribution-single%20HTML-0ea5e9)](https://ttomohisa.github.io/htmlapps-presentation-video-maker/)

[English README](README.md)

PowerPoint（PPTX）をブラウザで読み込み、ナレーション付きMP4へ変換する、単一HTML・完全ローカル処理のツールです。端末内読み上げ、自分の声、ローカル音声ファイルをスライドごとに使い分けられ、PPTX・発表者ノート・音声・BGM・生成動画をアプリからサーバーへ送信しません。

## 🚀 デモ

### [GitHub PagesでPresentation Video Makerを開く](https://ttomohisa.github.io/htmlapps-presentation-video-maker/)

GitHub Pages版では最初のHTML取得だけ通信します。読み込み後のPPTX解析、発表者ノート抽出、スライド描画、台本編集、音声処理、動画組み立て、MP4変換は端末内で行います。アプリで選択したファイルはアップロードしません。

[![Presentation Video Maker screenshot](assets/screenshot.png)](https://ttomohisa.github.io/htmlapps-presentation-video-maker/)

## 主な機能

- **発表者ノートをそのままナレーション台本に** — 1スライドを1シーンとして扱い、ノートがあれば台本へ、なければスライド本文を下書きとして使用します。
- **スライドごとに音声方式を選択** — 端末内読み上げ、自分の声（マイク録音）、既存のローカル音声ファイルを同じプレゼン内で混在できます。
- **ナレーションをシーン単位で編集** — 台本、動画への含有、前後余白、音声、読み上げ速度を保持し、設定変更後は古い録音を削除せず「再録音が必要」として管理します。
- **PowerPointを高品質表示** — `@aiden0z/pptx-renderer@1.2.4` でプレビューし、動画用スナップショットは `html2canvas@1.4.1` でorigin-clean Canvasへ変換します。
- **MP4までブラウザ内で作成** — 720p / 1080p、カット / フェード、字幕焼き込み、ローカルBGMに対応し、同梱FFmpeg WASMでH.264/AAC MP4へ変換します。
- **PC / スマートフォン対応** — 4工程のクイックナビゲーション、スライド移動、録音状態、長い音声名、スマホ下部タブを整理し、狭い画面でも横スクロールしない構成です。
- **単一HTML・完全ローカル処理** — 必要なランタイムをHTMLへ埋め込み、日本語 / 英語UI、`connect-src 'none'`、実行時CDNなし、解析・テレメトリなし、クラウドTTS APIなしで動作します。

## クイックスタート

### Webデモを使う

[GitHub Pages版](https://ttomohisa.github.io/htmlapps-presentation-video-maker/)を開くだけです。登録・インストールは不要です。

### 単一HTMLを使う

1. GitHub Actions / Release成果物から `dist/index.html` を取得するか、下記手順でローカルビルドします。
2. 現行のChromium系ブラウザで開きます。
3. Windowsの端末内読み上げを録音する場合は、アプリの案内に従って **「画面全体」** を選び、**「システム音声も共有」** を有効にします。

### 完全埋め込み版を自分でビルドする

1. Windowsでこのリポジトリをダウンロードまたはcloneします。
2. 初回は `prepare-and-build.bat` を実行します。
3. `dependencies.json` で固定した依存を取得し、lockとSHA-256を検証して単一HTMLへ埋め込みます。
4. 依存準備後の通常ビルドは `build-standalone.bat` を使用できます。
5. 生成された `dist/index.html` を好きな場所へコピーして利用できます。

通常のWindowsビルドにNode.js、Python、ローカルWebサーバーは不要です。PowerShellとWindows標準の `tar.exe` を使用します。

## 使い方

1. `.pptx` をドロップするか「PowerPointを選択」から読み込みます。現在の上限は150 MBです。
2. スライドを選び、高品質プレビューとナレーション原稿を確認します。
3. 台本、開始前 / 終了後の余白、動画へ含めるかどうかを編集します。
4. 各スライドで **端末内読み上げ / 自分の声 / 音声ファイル** を選びます。
5. 端末内読み上げではOSのローカル音声を選び、0.8x〜1.5xの速度スライダーを調整します。現在の音声と速度をTTSスライドへ一括適用できます。
6. 自分の声では選択中スライドだけをマイク録音します。音声ファイルでは端末内の既存音声を選択します。
7. TTSを録音するときは「全シーンのナレーションを録音する」を開始し、共有画面で **「画面全体」** と **「システム音声も共有」** を選びます。録音中は通知音・音楽など不要な音を止めます。
8. 動画に含めるすべてのシーンで、現在の設定に対応した音声が準備できていることを確認します。未録音・失敗・再録音が必要なシーンがある場合は動画作成を開始できません。
9. 720p / 1080p、カット / フェード、字幕、BGM、BGM音量・ループを設定します。
10. 動画を作成し、MP4をプレビューしてファイル名を指定して保存します。

3スライドのサンプルPPTXや回帰用データは `test-data/` に含まれています。

## 動画生成の仕組み

動画は完全ローカルで2段階に生成します。

1. スライドを描画し、Canvas / Web Audio上でナレーション、字幕、フェード、BGMをタイムラインに合わせて再生しながらMediaRecorderで中間WebMを作成します。この工程はタイムラインを実際に再生して録画するため、おおむね動画の長さと同程度の時間がかかります。
2. 同梱している FFmpeg WASM Builder v1.6.0 `video-compressor` のランタイムで、中間WebMをH.264/AAC MP4へ変換します。

新しい動画が正常に完成するまでは、以前に作成したMP4を保持します。出力設定を変更した場合は「以前の設定で作成された動画」として残り、再生成をキャンセル・失敗した場合も前の成功済みMP4は消えません。

## PowerPoint表示

高品質プレビューには次を使用します。

```text
@aiden0z/pptx-renderer@1.2.4
```

動画用スナップショットには次も使用します。

```text
html2canvas@1.4.1
```

どちらもバージョンを固定し、SHA-256 lockを作成してビルド時だけ取得し、生成HTMLへ埋め込みます。動画側は `foreignObjectRendering: false` を使用し、`file://` / opaque originで発生したSVG `foreignObject` 経由のCanvas汚染を避けています。

## GitHub Pagesで公開する

リポジトリには `dist/` をビルドしてGitHub Pagesへ配信するworkflowが含まれています。

1. `ttomohisa/htmlapps-presentation-video-maker` としてGitHubへpushします。
2. **Settings → Pages → Build and deployment → Source** で **GitHub Actions** を選択します。
3. `main` へpushするか、Actionsから **Deploy standalone app to GitHub Pages** を手動実行します。
4. デプロイ成功後は `https://ttomohisa.github.io/htmlapps-presentation-video-maker/` で利用できます。

デプロイ時も固定依存から単一HTMLを再生成し、検証後に公開します。

## 開発・ビルド構成

```text
.
├─ src/index.template.html                 # アプリ本体テンプレート
├─ app.config.json                         # アプリ情報・リリース版数
├─ dependencies.json                       # 固定するブラウザ依存
├─ dependencies.lock.json                  # 解決済み依存・ハッシュ
├─ vendor/ffmpeg-video-compressor-v1.6.0/  # FFmpegランタイム
├─ build-standalone.bat                    # 通常ビルド
├─ prepare-and-build.bat                   # 依存準備 + ビルド
├─ dist/index.html                         # 読みやすい単一HTML
├─ dist/index.self-extract.html            # 圧縮自己展開版
└─ .github/workflows/
   ├─ build-standalone.yml                 # PR時の検証
   ├─ dependency-updates.yml               # 依存更新チェック
   └─ deploy-pages.yml                     # GitHub Pages配信
```

### 依存を更新する

`dependencies.json` の固定バージョンを更新し、次を実行します。

```bat
prepare-and-build.bat
```

ビルドでは以下を行います。

- npm tarballをビルド時だけ取得
- `dependencies.lock.json` にSHA-256を記録・検証
- PowerPoint rendererとhtml2canvasを単一HTMLへ埋め込み
- MP4変換用FFmpeg runtime/coreを埋め込み
- 未解決placeholderや実行時外部script / stylesheetを検出
- `dist/dependency-manifest.json` を生成
- 自己展開版単一HTMLを生成・検証

## プライバシー / 外部通信

HTML読込後は **完全ローカル処理** を前提としています。

- PPTXはブラウザのメモリ内で読み込みます。
- 発表者ノートと台本はサーバーへ送りません。
- マイク録音、システム音声録音、ローカル音声ファイル、BGMは端末内に留まります。
- 中間WebMと生成MP4も外部送信しません。
- CSPは `connect-src 'none'` を維持します。
- 実行時CDN、アクセス解析、テレメトリ、クラウドTTS API、外部フォントを使用しません。

GitHub Pages版は最初のHTML取得には通信が必要です。ネットワークなしで利用する場合は、生成済み `dist/index.html` をローカルで開いてください。

## 制限事項

- PowerPointのアニメーションは静止状態で表示し、再生しません。
- PowerPoint本体のスライド切り替え効果は再現せず、動画出力ではアプリ独自のカット / フェードを使用します。
- PowerPointへ埋め込まれた音声・動画は再生しません。
- Microsoft PowerPointとの完全なピクセル一致は保証しません。
- Web Speech APIの音声とシステム音声共有はOS・ブラウザ依存です。確認済みのTTS録音方式はWindowsの **「画面全体 + システム音声」** です。
- システム音声にはWindows通知や他アプリの音も入る可能性があります。
- MediaRecorderでタイムラインを再生しながら動画を組み立てるため、FFmpeg変換前におおむね動画の長さと同程度の時間がかかります。
- 大きなPPTX、複雑なスライド、1080p動画は端末メモリを多く使用する場合があります。
- 現在はPPTX 1ファイル最大150 MB、ナレーション/BGM音声は各100 MBまでです。

## 依存ライブラリ

| ライブラリ / ランタイム | バージョン | ライセンス | 用途 |
| --- | ---: | --- | --- |
| @aiden0z/pptx-renderer | 1.2.4 | Apache-2.0 | PPTX解析・高品質DOM/SVGプレビュー |
| html2canvas | 1.4.1 | MIT | 動画用スライドをorigin-clean Canvasへ変換 |
| FFmpeg WASM Builder生成core | Builder 1.6.0 / `video-compressor` | GPL-2.0-or-later | H.264/AAC MP4変換 |

FFmpeg / x264の固定revisionと対応ソースについては [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。

## Contributing

不具合報告・機能提案はGitHub Issuesで受け付けます。開発方法は [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

## License

Copyright © 2026 ttomohisa

[GNU General Public License v3.0](LICENSE) で公開します。
