'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const vm = require('node:vm');

// Mirror the order and APIs of the classic embedded worker. No fetch, XHR,
// imports, filesystem or other network loaders are available in this context.
const context = vm.createContext({atob, Blob, DecompressionStream, Response});
context.self = context;
context.kokoroCreateSpellingReader = async () => {
  const url = pathToFileURL(path.resolve(__dirname, '../vendor/local-tts-phonemes/espeak-en-us.mjs'));
  const {default: createEphone} = await import(url.href);
  return createEphone();
};
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

test('Japanese reads familiar English terms as words and keeps Japanese letter names for initials', async () => {
  const script = '今日は、Presentation Video MakerとPowerPoint、APIとPDFを紹介します。';
  const reading = await phones(script, 'ja');
  const expected = await Promise.all(['プレゼンテーション', 'ビデオ', 'メーカー', 'パワーポイント'].map(word => phones(word, 'ja')));
  assert.ok(reading.includes(expected.slice(0, 3).join(' ')));
  assert.ok(reading.includes(expected[3].replaceAll(' ', '')));
  assert.match(reading, /eːpʲiːai.*pʲiːdʲiːeɸɯ/);
  assert.equal(await phones('ＰＲＥＳＥＮＴＡＴＩＯＮ', 'ja'), await phones('プレゼンテーション', 'ja'));
  assert.equal(await phones('API PDF', 'ja'), 'eːpʲiːai pʲiːdʲiːeɸɯ');
  assert.equal(await phones('QZX', 'ja'), await phones('Q Z X', 'ja').then(reading => reading.replaceAll(' ', '')));
});

test('Japanese uses the English pronunciation lexicon for other English words', async () => {
  const english = await phones('Collaboration', 'en');
  const mixed = await phones('今日はCollaborationについて説明します。', 'ja');
  assert.ok(mixed.includes(english));
  assert.match(mixed, /seːmeː|seʦɨmeː|seʦɨmei/);
});

test('Japanese infers the pronunciation of unfamiliar English spellings', async () => {
  assert.equal(await phones('Lumivexa', 'ja'), 'lˈumɪvˌɛksə');
  assert.equal(await phones('Blorvinate', 'ja'), 'blˈɔɹvᵻnˌAt');
  assert.match(await phones('新しいLumivexaを紹介します。', 'ja'), /lˈumɪvˌɛksə o ɕoːkai/);
  assert.equal(await phones('SORA', 'ja'), await phones('sora', 'ja'));
});

test('empty narration and unsupported languages are explicit', async () => {
  assert.equal(await phones(' \n ', 'ja'), '');
  await assert.rejects(phones('test', 'zz'), /language/);
  await assert.rejects(phones('𠮷', 'ja'), {code: 'reading'});
});
