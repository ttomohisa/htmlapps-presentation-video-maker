# Test data

`presentation-video-maker-notes-sample.pptx` is the primary three-slide fixture for PPTX parsing, speaker-note extraction, narration, and video regression tests.

Expected speaker notes:

1. `Presentation Video Maker の技術テストです。PowerPoint の発表者ノートを端末内の音声で読み上げます。`
2. `このスライドでは、端末内の音声を使う仕組みを確認します。オンラインの音声サービスへ台本は送りません。`
3. `録音テストを開始したら、「画面全体」と「システム音声を共有」を選択してください。読み上げ音声を取得できればテスト成功です。`

The fixture contains no personal information and is intended to remain in the repository.

- `presentation-video-maker-30-slides-long-content.pptx`: 30-slide long-content fixture for responsive layout, scrolling, and many-scene regression tests.

- `narration-regression-tone.wav`: short local WAV for narration-source and MP4 pipeline regression.
