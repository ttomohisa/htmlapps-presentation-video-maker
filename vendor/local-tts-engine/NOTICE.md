# Local speech inference

ONNX Runtime Web 1.31.1 is copyright Microsoft Corporation and is distributed under the MIT License. This directory includes its license and upstream third-party notices. The worker uses the single-threaded WebAssembly CPU execution provider. [Release sources](https://github.com/microsoft/onnxruntime/tree/v1.31.1) · [MIT license](https://cdn.jsdelivr.net/gh/microsoft/onnxruntime@v1.31.1/LICENSE) · [Third-party notices](https://cdn.jsdelivr.net/gh/microsoft/onnxruntime@v1.31.1/ThirdPartyNotices.txt)

The phoneme IDs in `src/local-tts-worker.js` come from the Kokoro-82M v1.0 ONNX tokenizer. The model card identifies the license as Apache-2.0. The worker adds token 0 to both ends of each sequence. The model and chosen speaker files are supplied by the user. [Pinned ONNX conversion and tokenizer](https://huggingface.co/onnx-community/Kokoro-82M-v1.0-ONNX/tree/1939ad2a8e416c0acfeecc08a694d14ef25f2231) · [Kokoro model card](https://huggingface.co/hexgrad/Kokoro-82M/tree/f3ff3571791e39611d31c381e3a41a3af07b4987) · [Speaker information](https://huggingface.co/hexgrad/Kokoro-82M/blob/f3ff3571791e39611d31c381e3a41a3af07b4987/VOICES.md) · [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0.txt)

## Reproducing the bundled runtime

1. Download the [npm release tarball](https://registry.npmjs.org/onnxruntime-web/-/onnxruntime-web-1.31.1.tgz) and check its SHA-256 against the table below.
2. Extract `package/dist/ort.wasm.bundle.min.mjs` unchanged. It includes Emscripten's JavaScript glue.
3. Extract `package/dist/ort-wasm-simd-threaded.wasm` and gzip it as `ort-wasm.wasm.gz`. The checked-in copy uses Python 3.12, zlib 1.3.1 and `gzip.GzipFile(filename="", mode="wb", fileobj=destination, mtime=0, compresslevel=9)`.
4. Copy the linked upstream license and third-party notices to `ORT-LICENSE.txt` and `ORT-ThirdPartyNotices.txt`. Copy the Apache license to `Kokoro-LICENSE.txt`.
5. Run the repository's standalone build. It embeds the module, packed WASM, worker and notices. The worker imports the module through a local blob URL and supplies the decompressed bytes to `ort.env.wasm.wasmBinary`.

| File | SHA-256 |
| --- | --- |
| onnxruntime-web-1.31.1.tgz | `bdccdb9fbb9ab537247c0c734e9b1d2b1b338b4f2a09faa58f0dc1cfa27c312c` |
| ort.wasm.bundle.min.mjs | `51bd7168175767324ab0acfcfc4ca94a096a3826e3ebac9ccc4f195eb865f8dd` |
| ort-wasm-simd-threaded.wasm | `4b884c203b0fa48d057be3332c65513ff85aa3c5bddd6946acc0fab7ecda001d` |
| ort-wasm.wasm.gz | `88c54205b36d2539db355fda334085465e837b71b777a2049c7973a69a17be1c` |
| tokenizer.json | `77a02c8e164413299b4b4c403b14f8e0e1c1b727db4d46a09d6327b861060a34` |
| model_quantized.onnx | `fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478` |
| jf_alpha.bin | `56b479360aad9f367aeb8cef908f9201cf48b4555e488c5f4590c9dfcd978bb6` |
| af_heart.bin | `d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b` |
