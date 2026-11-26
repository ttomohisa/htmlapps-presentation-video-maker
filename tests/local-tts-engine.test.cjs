'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {File} = require('node:buffer');

const source = fs.readFileSync(path.resolve(__dirname, '../src/local-tts-engine.js'), 'utf8');

function harness() {
  const workers = [];
  class Worker {
    constructor() { workers.push(this); }
    postMessage(message) { this.lastMessage = message; }
    terminate() { this.terminated = true; }
  }
  const window = {addEventListener() {}};
  const document = {getElementById: id => ({textContent: id})};
  vm.runInNewContext(source, {Worker, File, Blob, DOMException, URL, window, document});
  const model = new File(['model'], 'model_quantized.onnx');
  const voice = new File(['voice'], 'jf_alpha.bin');
  const args = {text: '日本語のテスト。', language: 'ja', rate: 1, model, voice};
  return {workers, args, engine: window.LocalTTS};
}

test('successive slides share a session and switching language sends the new voice', async () => {
  const {workers, args, engine} = harness();
  const previous = engine.synthesize(args);
  assert.equal(workers[0].lastMessage.model, args.model);
  const blob = new Blob(['sample']);
  workers[0].onmessage({data: {blob, duration: 1.2}});
  assert.equal((await previous).blob, blob);
  const voice = new File(['second'], 'af_heart.bin');
  const next = engine.synthesize({...args, voice, language: 'en'});
  assert.equal(workers.length, 1);
  assert.equal(workers[0].lastMessage.model, undefined);
  assert.equal(workers[0].lastMessage.voice, voice);
  workers[0].onmessage({data: {blob, duration: 1.2}});
  await next;
  engine.dispose();
});

test('cancel releases the worker and a late reply cannot finish the next slide', async () => {
  const {workers, args, engine} = harness();
  const controller = new AbortController();
  const canceled = engine.synthesize({...args, signal: controller.signal});
  controller.abort();
  await assert.rejects(canceled, {name: 'AbortError'});
  assert.equal(workers[0].terminated, true);
  const retry = engine.synthesize(args);
  workers[0].onmessage({data: {duration: 99}});
  workers[1].onmessage({data: {duration: 2}});
  assert.equal((await retry).duration, 2);
  engine.dispose();
});
