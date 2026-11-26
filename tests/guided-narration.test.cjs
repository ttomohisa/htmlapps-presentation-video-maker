'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(process.env.PVM_TEST_HTML || path.join(__dirname, '../src/index.template.html'), 'utf8');

function production(names) {
  const context = vm.createContext({});
  vm.runInContext(names.map(name => {
    const start = html.search(new RegExp('^      (?:async )?function ' + name + '\\(', 'm'));
    assert.ok(start >= 0, name);
    const end = html.indexOf('\n      }', start);
    assert.ok(end > start, name);
    return html.slice(start, end + 8);
  }).join('\n'), context);
  return context;
}

test('the workflow has three screens and one common navigation', () => {
  assert.deepEqual([...html.matchAll(/data-guide-page="([^"]+)"/g)].map(match => match[1]), ['slides', 'script', 'output']);
  assert.deepEqual([...html.matchAll(/data-guide-step="([^"]+)"/g)].map(match => match[1]), ['slides', 'script', 'output']);
});

test('phones open new decks with Kokoro and fall back to recording or files', () => {
  const context = production(['canUseMethod', 'defaultDeckMethod']);
  Object.assign(context, {
    navigator: {userAgent: 'iPhone Safari', mediaDevices: {getUserMedia(){}, getDisplayMedia(){}}},
    isSmartphoneMode: () => true,
    window: {
      LocalTTS: {}, Worker(){}, WebAssembly: {}, DecompressionStream(){}, BigInt64Array,
      crypto: {subtle: {}}, MediaRecorder(){}, speechSynthesis: {},
    },
  });
  assert.equal(context.canUseMethod('local'), true);
  assert.equal(context.canUseMethod('tts'), false);
  assert.equal(context.defaultDeckMethod(), 'local');
  delete context.window.crypto.subtle;
  assert.equal(context.canUseMethod('local'), false);
  assert.equal(context.defaultDeckMethod(), 'mic');
  delete context.window.MediaRecorder;
  assert.equal(context.defaultDeckMethod(), 'file');
});

test('model and language voices have independent single-file inputs', () => {
  const inputs=Array.from(html.matchAll(/<input\b[^>]*\bdata-local-file="([^"]+)"[^>]*>/g));
  assert.deepEqual(inputs.map(match=>match[1]), ['model_quantized.onnx','jf_alpha.bin','af_heart.bin']);
  assert.ok(inputs.every(match=>!/\bmultiple\b/.test(match[0])));
});

test('a file must match its own Kokoro slot and an invalid choice keeps loaded files', async () => {
  const context=production(['selectLocalFile']);
  const valid={name:'downloaded voice (1).bin',size:1,arrayBuffer:async()=>Uint8Array.of(0x12).buffer};
  const wrong={name:'af_heart.bin',size:1,arrayBuffer:async()=>Uint8Array.of(0x34).buffer};
  const fileState={localFiles:new Map([['af_heart.bin',wrong]]),slides:[]};
  Object.assign(context,{
    state:fileState,
    LOCAL_FILES:{'jf_alpha.bin':{size:1,sha256:'12'},'af_heart.bin':{size:1,sha256:'34'}},
    window:{crypto:{subtle:{digest:async(_algorithm,bytes)=>bytes}}},
    projectOperationBusy:()=>false,
    renderLocalControls(){},renderGuidedNarration(){},
  });
  await context.selectLocalFile('jf_alpha.bin',wrong);
  assert.equal(fileState.localFiles.has('jf_alpha.bin'),false);
  assert.equal(fileState.localFiles.get('af_heart.bin'),wrong);
  assert.equal(fileState.localFileMessage.values.expected,'jf_alpha.bin');
  await context.selectLocalFile('jf_alpha.bin',valid);
  assert.equal(fileState.localFiles.get('jf_alpha.bin'),valid);
  assert.equal(fileState.localFileMessage,null);
  assert.equal(fileState.localChecking,false);
});

test('Kokoro saves a valid WAV using the sample duration from the worker', async () => {
  const context = production(['generateLocalAudio']);
  const slide = {enabled: true, audioSource: 'local', script: 'Hello', rate: 1.0};
  const blob = new Blob(['audio']);
  const saved = [];
  Object.assign(context, {
    AbortController,
    state: {slides: [slide], selectedSlideIndex: 0, localFiles: new Map()},
    window: {LocalTTS: {synthesize: async () => ({blob, duration: 1.25})}},
    LOCAL_FILES: {'model_quantized.onnx': {sha256: 'test'}},
    projectOperationBusy: () => false, canUseMethod: () => true,
    saveCurrentScript(){}, narrationSource: value => value.audioSource,
    missingLocalFiles: () => [], localLanguage: () => 'en', localVoiceName: () => 'af_heart.bin',
    audioBlobDuration: async () => { throw new Error('Media metadata unavailable'); },
    commitSceneAudio: (slide, audio, options) => saved.push({audio, duration: options.duration}),
    renderSceneRecordings(){}, refreshCaptureReady(){},
  });
  await context.generateLocalAudio();
  assert.deepEqual(saved, [{audio: blob, duration: 1.25}]);
});

test('batch progress keeps completed slides on the bar while the next slide runs', () => {
  const context = production(['renderLocalProgress']);
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, {removeAttribute(name) { delete this[name]; }});
    return elements.get(id);
  }
  Object.assign(context, {state: {localRun: {}}, $: element, format: key => key});
  const meter = element('#localTtsProgress');
  function render(total, completed, phase, chunksCompleted, totalChunks) {
    context.state.localProgress = {total, completed, slide: completed + 1, phase, chunksCompleted, totalChunks};
    context.renderLocalProgress();
    return meter.value === undefined ? null : meter.value / meter.max;
  }
  assert.equal(render(3, 0, 'model'), null);
  assert.equal(render(3, 0, 'synthesis', 0, 1), null);
  assert.equal(render(3, 0, 'synthesis', 1, 1), 1 / 3);
  assert.equal(render(3, 1, 'preparing'), 1 / 3);
  assert.equal(render(3, 1, 'synthesis', 1, 2), 1 / 2);
  assert.equal(render(3, 2, 'model'), 2 / 3);
  assert.equal(render(3, 2, 'script'), 2 / 3);
  assert.equal(render(3, 2, 'synthesis', 0, 1), 2 / 3);
  assert.equal(render(3, 2, 'synthesis', 1, 1), 1);
  assert.equal(render(1, 0, 'synthesis', 0, 1), null);
});

test('the deck does not count mismatched, failed or stale audio as usable', () => {
  const { guidedAudioState } = production(['guidedAudioState']);
  const slide = { enabled: true, script: 'Notes', recordingSource: 'local', recordingStatus: 'success', recordingBlob: {size: 20} };
  assert.equal(guidedAudioState(slide, 'local'), 'ready');
  assert.equal(guidedAudioState(slide, 'file'), 'missing');
  assert.equal(guidedAudioState({...slide, recordingStatus: 'error'}, 'local'), 'error');
  assert.equal(guidedAudioState({...slide, recordingStatus: 'stale'}, 'local'), 'stale');
  assert.equal(guidedAudioState({...slide, script: ' '}, 'local'), 'silent');
  assert.equal(guidedAudioState({...slide, script: ' '}, 'mic'), 'missing');
  assert.equal(guidedAudioState({...slide, enabled: false}, 'local'), 'excluded');
});

test('deck-wide changes protect explicit, excluded and previously recorded slides', () => {
  const { followsDeckMethod } = production(['followsDeckMethod']);
  const slide = { enabled: true, followsDeckMethod: true };
  assert.equal(followsDeckMethod(slide), true);
  assert.equal(followsDeckMethod({...slide, enabled: false}), false);
  assert.equal(followsDeckMethod({...slide, followsDeckMethod: false}), false);
  assert.equal(followsDeckMethod({...slide, recordingBlob: {size: 20}}), false);
  assert.equal(followsDeckMethod({enabled: true}), false);
});

test('empty speaker notes do not import PowerPoint slide numbers or footers', () => {
  const { notesBodyText } = production(['notesBodyText']);
  const shape = (type, ...nodes) => ({
    getElementsByTagNameNS: (_ns, tag) => tag === 't' ? nodes : type ? [{getAttribute: () => type}] : [],
  });
  const text = content => ({textContent: content});
  const doc = (...shapes) => ({getElementsByTagNameNS: () => shapes});
  const pageNumber = shape('sldNum', text('1'));
  assert.equal(notesBodyText(doc(shape('body'), pageNumber, shape('ftr', text('Footer')))), '');
  assert.equal(notesBodyText(doc(shape('body', text('Welcome')), pageNumber)), 'Welcome');
  assert.equal(notesBodyText(doc(shape('', text('A text box note')), pageNumber)), 'A text box note');
});
