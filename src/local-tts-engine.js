(() => {
  "use strict";

  let worker = null;
  let workerUrl = null;
  let currentModel = null;
  const currentVoices = new Map();
  let pending = null;

  function failure(code, message) {
    return Object.assign(new Error(message), {code});
  }

  function abortError() {
    return new DOMException("Speech generation canceled.", "AbortError");
  }

  function finish(error, result) {
    if (!pending) return;
    const {resolve, reject, signal, onAbort} = pending;
    pending = null;
    signal?.removeEventListener("abort", onAbort);
    if (error) reject(error);
    else resolve(result);
  }

  function dispose(error = abortError()) {
    worker?.terminate();
    worker = null;
    if (workerUrl) URL.revokeObjectURL(workerUrl);
    workerUrl = null;
    currentModel = null;
    currentVoices.clear();
    finish(error);
  }

  function assetText(id) {
    const source = document.getElementById(id)?.textContent;
    if (!source?.trim()) throw failure("runtime", "Missing embedded speech asset: " + id);
    return source;
  }

  function startWorker() {
    const source = new Blob([assetText("local-tts-phonemes"), "\n;\n", assetText("local-tts-worker")], {type: "text/javascript"});
    workerUrl = URL.createObjectURL(source);
    const instance = new Worker(workerUrl, {name: "Kokoro speech synthesis"});
    worker = instance;
    instance.onerror = event => {
      if (instance === worker) dispose(failure("runtime", event.message || "Speech worker failed."));
    };
    instance.onmessage = ({data}) => {
      if (instance !== worker) return;
      if (data.progress) {
        pending?.onProgress?.(data.progress);
        return;
      }
      if (data.error) dispose(failure(data.code || "runtime", data.error));
      else finish(null, {blob: data.blob, duration: data.duration});
    };
  }

  async function synthesize({text, language, rate = 1, model, voice, signal, onProgress}) {
    if (signal?.aborted) throw abortError();
    if (!text?.trim()) throw failure("text", "Enter a narration script.");
    if (!["ja", "en"].includes(language)) throw failure("voice", "Unsupported voice language.");
    if (!(model instanceof File)) throw failure("model", "Select model_quantized.onnx.");
    if (!(voice instanceof File)) throw failure("voice", "Select the voice file for this language.");
    if (!Number.isFinite(rate) || rate < 0.8 || rate > 1.5) throw failure("text", "Invalid narration speed.");
    if (currentModel && currentModel !== model) dispose();
    if (pending) throw failure("runtime", "A speech generation is already running.");
    return new Promise((resolve, reject) => {
      const onAbort = () => dispose();
      pending = {resolve, reject, signal, onAbort, onProgress};
      signal?.addEventListener("abort", onAbort, {once: true});
      try {
        const message = {text, language, rate};
        if (!worker) {
          startWorker();
          message.ortSource = assetText("local-tts-ort");
          message.wasmGzip = assetText("local-tts-wasm");
          message.spellingSource = assetText("local-tts-espeak");
          message.model = model;
          currentModel = model;
        }
        if (currentVoices.get(language) !== voice) {
          message.voice = voice;
          currentVoices.set(language, voice);
        }
        worker.postMessage(message);
      } catch (error) {
        dispose(failure("runtime", error.message));
      }
    });
  }

  window.LocalTTS = {synthesize, dispose};
  window.addEventListener("pagehide", () => dispose());
})();
