// Production result lifecycle and settings handlers with DOM/URL boundaries doubled.
// The scoped CSS assertion complements the real-browser visibility regression.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(process.env.PVM_TEST_HTML || path.join(__dirname, '../src/index.template.html'), 'utf8');

function extract(name) {
  const match = new RegExp(`^      (?:async )?function ${name}\\(`, 'm').exec(source);
  assert.ok(match, `Missing production function ${name}`);
  const next = source.slice(match.index + 7).search(/\n      (?:async )?function /);
  assert.ok(next >= 0, `Missing function boundary after ${name}`);
  return source.slice(match.index, match.index + 7 + next);
}

function harness() {
  const controls = new Map(), created = [], revoked = [], downloads = [];
  const $ = selector => {
    if (!controls.has(selector)) controls.set(selector, {
      hidden: true, value: '', checked: false, handlers: {},
      addEventListener(type, handler) { this.handlers[type] = handler; },
      pause() {}, load() {}, removeAttribute(name) { delete this[name]; }
    });
    return controls.get(selector);
  };
  const ctx = vm.createContext({
    $, state: {videoResultBlob: null, videoResultUrl: '', videoResultDuration: 0, videoResultStale: false},
    URL: {
      createObjectURL(blob) { const url = `blob:synthetic-${created.length}`; created.push({blob, url}); return url; },
      revokeObjectURL(url) { revoked.push(url); }
    },
    document: {
      body: {append() {}},
      createElement() { return {click() { downloads.push({href: this.href, filename: this.download}); }, remove() {}}; }
    },
    formatClock: String, bytesLabel: String, t: key => key,
    updateMobileResolutionWarning() {}, updateVideoExportState() {}, showToast() {}, setTimeout() {}
  });
  vm.runInContext(['updateVideoResultStaleNotice', 'markVideoResultStale', 'clearVideoResult', 'replaceVideoResult', 'safeOutputBase', 'saveVideo'].map(extract).join('\n'), ctx);
  const eventLines = source.split('\n').filter(line =>
    line.startsWith("      $('#") && line.includes('.addEventListener(') &&
    ['#videoOutputName', '#videoTransition'].some(id => line.includes(`$('${id}')`)));
  vm.runInContext(eventLines.join('\n'), ctx);
  return {ctx, $, created, revoked, downloads};
}

function complete(h, content = 'synthetic MP4') {
  const blob = new Blob([content], {type: 'video/mp4'});
  h.ctx.replaceVideoResult(blob, 4, 1280, 720);
  return blob;
}

function localScene(h) {
  const slide = {
    script: 'Edited', enabled: true, rate: 1, localLanguage: 'inherit',
    audioSource: 'local', recordingSource: 'local', recordingStatus: 'success',
    recordingBlob: new Blob(['edited narration']), narrationDuration: 2
  };
  h.ctx.state.slides = [slide];
  h.ctx.state.selectedSlideIndex = 0;
  h.ctx.state.rate = 1;
  h.ctx.state.localDefaultLanguage = 'ja';
  h.$('#scriptInput').value = slide.script;
  h.$('#sceneEnabledInput').checked = true;
  Object.assign(h.ctx, {
    narrationSource: scene => scene.audioSource,
    selectedVoice: () => null, format: () => '', formatRate: String,
    sourceScript: () => 'Original', updateNarrationDuration() {},
    renderSceneRecordings() {}, updateRecordingPlan() {}, updateVideoExportState() {}, syncNarrationControlsForScene() {},
    AppToast: {show({onAction}) { h.undo = onAction; }}
  });
  vm.runInContext(['markSceneRecordingStale', 'saveCurrentScript', 'resetCurrentScript', 'localLanguage', 'applyNarrationToAll'].map(extract).join('\n'), h.ctx);
  return slide;
}

test('excluding local narration or editing its padding makes the old MP4 stale without invalidating speech', () => {
  const h = harness(), slide = localScene(h);
  for (const [id, key, value] of [['#sceneEnabledInput', 'checked', false], ['#prePaddingInput', 'value', '0.7']]) {
    complete(h);
    h.$(id)[key] = value;
    h.ctx.saveCurrentScript();
    assert.equal(h.ctx.state.videoResultStale, true);
    assert.equal(slide.recordingStatus, 'success');
  }
});

test('undoing a script reset marks narration generated since the reset stale', () => {
  const h = harness(), slide = localScene(h);
  h.ctx.resetCurrentScript();
  const replacement = new Blob(['original narration']);
  slide.recordingBlob = replacement;
  slide.recordingStatus = 'success';
  slide.recordingStaleReason = '';
  complete(h);
  h.undo();
  assert.equal(slide.script, 'Edited');
  assert.equal(slide.recordingBlob, replacement);
  assert.equal(slide.recordingStatus, 'stale');
  assert.equal(h.ctx.state.videoResultStale, true);
});

test('undoing changes to browser voices leaves later local narration edits stale', () => {
  const h = harness(), slide = localScene(h);
  h.ctx.state.slides.push({audioSource: 'tts', voiceURI: 'previous', rate: 1, script: 'Browser speech'});
  h.ctx.selectedVoice = () => ({voiceURI: 'new'});
  h.ctx.applyNarrationToAll();
  h.$('#scriptInput').value = 'Changed after applying browser voices';
  h.ctx.saveCurrentScript();
  h.undo();
  assert.equal(h.ctx.state.slides[1].voiceURI, 'previous');
  assert.equal(slide.recordingStatus, 'stale');
});

test('the hidden stale notice overrides its visible flex layout', () => {
  assert.match(source, /\.video-result-stale\s*\{[^}]*display\s*:\s*flex\s*;/);
  assert.match(source, /\.video-result-stale\[hidden\]\s*\{\s*display\s*:\s*none\s*!important\s*;?\s*\}/,
    'The hidden attribute must suppress the stale warning despite its author-level display:flex');
});

test('fresh successful output hides the stale warning and exposes the new MP4', () => {
  const h = harness(), blob = complete(h);
  assert.equal(h.ctx.state.videoResultBlob, blob);
  assert.equal(h.ctx.state.videoResultStale, false);
  assert.equal(h.$('#videoResultStale').hidden, true);
  assert.equal(h.$('#videoResult').hidden, false);
  assert.equal(h.$('#videoResultPreview').src, h.ctx.state.videoResultUrl);
  assert.equal(h.ctx.state.videoResultDuration, 4);
  assert.equal(h.$('#videoResultResolution').textContent, '1280 × 720');
});

for (const [id, event, property, value] of [
  ['#videoResolution', 'change', 'value', '1080'],
  ['#videoTransition', 'change', 'value', 'cut'],
  ['#videoSubtitles', 'change', 'checked', true],
  ['#bgmLoop', 'change', 'checked', false],
  ['#bgmVolume', 'input', 'value', '25']
]) test(`${id} edits show a real stale warning while preserving the last MP4`, () => {
  const h = harness(), blob = complete(h), url = h.ctx.state.videoResultUrl;
  h.$(id)[property] = value;
  h.$(id).handlers[event]();
  assert.equal(h.ctx.state.videoResultStale, true);
  assert.equal(h.$('#videoResultStale').hidden, false);
  assert.equal(h.ctx.state.videoResultBlob, blob);
  assert.equal(h.ctx.state.videoResultUrl, url);
  assert.equal(h.$('#videoResultPreview').src, url);
  assert.deepEqual(h.revoked, []);
});

test('successful regeneration hides the warning and releases only the previous result URL', () => {
  const h = harness(); complete(h);
  const oldUrl = h.ctx.state.videoResultUrl;
  h.$('#videoTransition').value = 'cut'; h.$('#videoTransition').handlers.change();
  const blob = complete(h, 'replacement MP4');
  assert.equal(h.ctx.state.videoResultBlob, blob);
  assert.equal(h.ctx.state.videoResultStale, false);
  assert.equal(h.$('#videoResultStale').hidden, true);
  assert.notEqual(h.ctx.state.videoResultUrl, oldUrl);
  assert.deepEqual(h.revoked, [oldUrl]);
});

test('clearing a stale result removes the output and hides the warning', () => {
  const h = harness(); complete(h); h.ctx.markVideoResultStale();
  const oldUrl = h.ctx.state.videoResultUrl;
  h.ctx.clearVideoResult();
  assert.equal(h.ctx.state.videoResultBlob, null);
  assert.equal(h.ctx.state.videoResultUrl, '');
  assert.equal(h.ctx.state.videoResultDuration, 0);
  assert.equal(h.ctx.state.videoResultStale, false);
  assert.equal(h.$('#videoResultStale').hidden, true);
  assert.equal(h.$('#videoResult').hidden, true);
  assert.equal(h.$('#videoResultPreview').src, undefined);
  assert.deepEqual(h.revoked, [oldUrl]);
});

test('settings changes before the first export do not create a stale result', () => {
  const h = harness();
  h.ctx.updateVideoResultStaleNotice();
  h.$('#videoTransition').value = 'cut'; h.$('#videoTransition').handlers.change();
  assert.equal(h.ctx.state.videoResultBlob, null);
  assert.equal(h.ctx.state.videoResultStale, false);
  assert.equal(h.$('#videoResultStale').hidden, true);
});

test('renaming and saving a fresh output preserves freshness and the exact result Blob', () => {
  const h = harness(), blob = complete(h), url = h.ctx.state.videoResultUrl;
  h.$('#videoOutputName').value = 'Reviewed output'; h.$('#videoOutputName').handlers.input();
  h.ctx.saveVideo();
  assert.equal(h.ctx.state.videoResultBlob, blob);
  assert.equal(h.ctx.state.videoResultUrl, url);
  assert.equal(h.ctx.state.videoResultStale, false);
  assert.equal(h.$('#videoResultStale').hidden, true);
  assert.equal(h.created.at(-1).blob, blob);
  assert.deepEqual(h.downloads, [{href: h.created.at(-1).url, filename: 'Reviewed output.mp4'}]);
});
