'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Mirror the order and APIs of the classic embedded worker. No fetch, XHR,
// imports, filesystem or other network loaders are available in this context.
const context = vm.createContext({atob, Blob, DecompressionStream, Response});
context.self = context;
for (const file of ['vendor/local-tts-phonemes/runtime.js', 'src/local-tts-phonemes.js']) {
  const source = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
  assert.doesNotMatch(source, /<\/script/i);
  vm.runInContext(source, context, {filename: file});
}
const phones = context.kokoroPhonemize;

test('Japanese reads contextual kanji, particles, punctuation and counters', async () => {
  assert.equal(await phones('本日は、3つの計画を紹介します。', 'ja'),
    'hoɲʥiʦɨ βa, mʲiʔʦɨ no keikakɯ o ɕoːkai ɕi masɨ.');
  assert.equal(await phones('東京へ向かいます。', 'ja'), 'toːkʲoː e mɯkai masɨ.');
  assert.equal(await phones('二千二十六年三月四日', 'ja'), await phones('２０２６年３月４日', 'ja'));
  assert.match(await phones('四日市', 'ja'), /joʔkaiʨi/);
  assert.equal(await phones('１２．５％', 'ja'), 'ʥɨːɲiteŋɡo paːsento');
});

test('US English reads years, decimals, ordinals, acronyms and abbreviations', async () => {
  assert.equal(await phones('Dr. Lee presented 3 charts to NASA and the U.S. team.', 'en'),
    'dˈɑktəɹ lˈi pɹizˈɛntᵻd θɹˈi ʧˈɑɹts tə nˈæsə ænd ðə jˌuˈɛs tˈim.');
  assert.equal(await phones('We have three plans for 2026.', 'en'),
    'wˌi hæv θɹˈi plˈænz fɔɹ twˈɛnti twˈɛnti sˈɪks.');
  assert.equal(await phones('4.5% on December 21st.', 'en'),
    'fˈɔɹ pYnt fˈIv pəɹsˈɛnt ˌɔn disˈɛmbəɹ twˈɛnti fˈɜɹst.');
});

test('empty narration and unsupported languages are explicit', async () => {
  assert.equal(await phones(' \n ', 'ja'), '');
  await assert.rejects(phones('test', 'zz'), /language/);
  await assert.rejects(phones('𠮷', 'ja'), {code: 'reading'});
});
