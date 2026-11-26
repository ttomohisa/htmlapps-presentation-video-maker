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
    const start = html.search(new RegExp('^      function ' + name + '\\(', 'm'));
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
