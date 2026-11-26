(() => {
  "use strict";

  const SAMPLE_RATE = 24000;
  const STYLE_SIZE = 256;
  // Keep the model's per-chunk working memory bounded on long slides.
  const CHUNK_LIMIT = 160;
  const MODEL = {size: 92361116, sha256: "fbae9257e1e05ffc727e951ef9b9c98418e6d79f1c9b6b13bd59f5c9028a1478"};
  const VOICES = {
    ja: {size: 522240, sha256: "56b479360aad9f367aeb8cef908f9201cf48b4555e488c5f4590c9dfcd978bb6"},
    en: {size: 522240, sha256: "d583ccff3cdca2f7fae535cb998ac07e9fcb90f09737b9a41fa2734ec44a8f0b"}
  };
  // Tokenizer vocabulary from the pinned Kokoro v1.0 ONNX conversion.
  const VOCAB = {
    ";":1, ":":2, ",":3, ".":4, "!":5, "?":6, "—":9, "…":10, '"':11, "(":12, ")":13, "“":14, "”":15, " ":16,
    "̃":17, "ʣ":18, "ʥ":19, "ʦ":20, "ʨ":21, "ᵝ":22, "ꭧ":23, A:24, I:25, O:31, Q:33, S:35, T:36, W:39, Y:41, "ᵊ":42,
    a:43, b:44, c:45, d:46, e:47, f:48, h:50, i:51, j:52, k:53, l:54, m:55, n:56, o:57, p:58, q:59,
    r:60, s:61, t:62, u:63, v:64, w:65, x:66, y:67, z:68, "ɑ":69, "ɐ":70, "ɒ":71, "æ":72, "β":75,
    "ɔ":76, "ɕ":77, "ç":78, "ɖ":80, "ð":81, "ʤ":82, "ə":83, "ɚ":85, "ɛ":86, "ɜ":87, "ɟ":90, "ɡ":92,
    "ɥ":99, "ɨ":101, "ɪ":102, "ʝ":103, "ɯ":110, "ɰ":111, "ŋ":112, "ɳ":113, "ɲ":114, "ɴ":115,
    "ø":116, "ɸ":118, "θ":119, "œ":120, "ɹ":123, "ɾ":125, "ɻ":126, "ʁ":128, "ɽ":129, "ʂ":130,
    "ʃ":131, "ʈ":132, "ʧ":133, "ʊ":135, "ʋ":136, "ʌ":138, "ɣ":139, "ɤ":140, "χ":142, "ʎ":143,
    "ʒ":147, "ʔ":148, "ˈ":156, "ˌ":157, "ː":158, "ʰ":162, "ʲ":164, "↓":169, "→":171, "↗":172, "↘":173, "ᵻ":177
  };
  let ort;
  let session;
  const voices = new Map();

  function failure(code, message) {
    return Object.assign(new Error(message), {code});
  }

  async function readVerified(file, expected, code) {
    if (file.size === expected.size) {
      const bytes = await file.arrayBuffer();
      const hash = await crypto.subtle.digest("SHA-256", bytes);
      const hex = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, "0")).join("");
      if (hex === expected.sha256) return bytes;
    }
    throw failure(code, "The selected " + code + " file does not match the published Kokoro file.");
  }

  async function initialize(ortSource, wasmGzip, model) {
    const modelBytes = await readVerified(model, MODEL, "model");
    const url = URL.createObjectURL(new Blob([ortSource], {type: "text/javascript"}));
    try {
      ort = await import(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const encoded = atob(wasmGzip);
    const compressed = new Uint8Array(encoded.length);
    for (let i = 0; i < encoded.length; i++) compressed[i] = encoded.charCodeAt(i);
    const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("gzip"));
    ort.env.wasm.wasmBinary = await new Response(stream).arrayBuffer();
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    session = await ort.InferenceSession.create(new Uint8Array(modelBytes), {executionProviders: ["wasm"]});
    ort.env.wasm.wasmBinary = undefined;
  }

  function* chunks(phones) {
    const symbols = Array.from(phones.replace(/\s+/gu, " ")).filter(symbol => VOCAB[symbol] !== undefined);
    let start = 0;
    while (start < symbols.length) {
      let end = Math.min(start + CHUNK_LIMIT, symbols.length);
      if (end < symbols.length) {
        // Prefer a sentence, then a clause, then a word. An unbroken token
        // sequence still progresses without dropping the remainder.
        const window = symbols.slice(start, end).join("");
        for (const pattern of [/[.!?…]/gu, /[,;:—]/gu, / /gu]) {
          const breaks = Array.from(window.matchAll(pattern));
          if (breaks.length) {
            end = start + breaks[breaks.length - 1].index + 1;
            break;
          }
        }
      }
      const ids = symbols.slice(start, end).join("").trim().split("").map(symbol => VOCAB[symbol]);
      if (ids.some(id => id >= 18)) yield ids;
      start = end;
    }
  }

  async function synthesizeChunk(ids, voice, rate) {
    // The ONNX conversion selects its 256-float style row by unpadded length.
    const offset = ids.length * STYLE_SIZE;
    const input = {
      input_ids: new ort.Tensor("int64", BigInt64Array.from([0, ...ids, 0], BigInt), [1, ids.length + 2]),
      style: new ort.Tensor("float32", voice.subarray(offset, offset + STYLE_SIZE), [1, STYLE_SIZE]),
      speed: new ort.Tensor("float32", Float32Array.of(rate), [1])
    };
    let output;
    try {
      output = await session.run(input);
      const samples = output.waveform.data;
      if (!samples.length) throw failure("runtime", "The model produced no audio.");
      const pcm = new Int16Array(samples.length);
      for (let i = 0; i < samples.length; i++) {
        const sample = samples[i];
        if (!Number.isFinite(sample)) throw failure("runtime", "The model produced invalid audio.");
        pcm[i] = Math.round(Math.min(1, Math.max(-1, sample)) * (sample < 0 ? 32768 : 32767));
      }
      return pcm;
    } finally {
      for (const tensor of Object.values(input)) tensor.dispose();
      for (const tensor of Object.values(output || {})) tensor.dispose();
    }
  }

  function wavHeader(byteLength) {
    const buffer = new ArrayBuffer(44);
    const bytes = new Uint8Array(buffer);
    const view = new DataView(buffer);
    const label = (at, value) => bytes.set(new TextEncoder().encode(value), at);
    label(0, "RIFF");
    view.setUint32(4, 36 + byteLength, true);
    label(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, SAMPLE_RATE, true);
    view.setUint32(28, SAMPLE_RATE * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    label(36, "data");
    view.setUint32(40, byteLength, true);
    return buffer;
  }

  self.onmessage = async ({data}) => {
    try {
      if (data.voice) {
        const bytes = await readVerified(data.voice, VOICES[data.language], "voice");
        voices.set(data.language, new Float32Array(bytes));
      }
      if (data.model) await initialize(data.ortSource, data.wasmGzip, data.model);
      const pcmParts = [];
      let byteLength = 0;
      for (const paragraph of data.text.split(/[\r\n]+/u)) {
        if (!paragraph.trim()) continue;
        const phones = await self.kokoroPhonemize(paragraph, data.language);
        for (const ids of chunks(phones)) {
          const pcm = await synthesizeChunk(ids, voices.get(data.language), data.rate);
          byteLength += pcm.byteLength;
          if (byteLength > 0xffffffff - 36) throw failure("text", "The narration exceeds the WAV size limit.");
          pcmParts.push(pcm);
        }
      }
      if (!byteLength) throw failure("text", "The script contains no pronounceable text.");
      const blob = new Blob([wavHeader(byteLength), ...pcmParts], {type: "audio/wav"});
      self.postMessage({blob, duration: byteLength / (2 * SAMPLE_RATE)});
    } catch (error) {
      self.postMessage({error: error.message || String(error), code: error.code || "runtime"});
    }
  };
})();
