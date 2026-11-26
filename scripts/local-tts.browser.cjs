'use strict';

// Run against a built HTML and the three pinned user downloads (see VERIFY_OFFLINE.md).
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');

const app = pathToFileURL(path.resolve(process.env.PVM_TEST_HTML || 'dist/index.html')).href;
const fixtures = process.env.PVM_KOKORO_DIR;
const timeout = 180000;
const narration = ['本日は、Presentation Video Makerと新製品Lumivexaを紹介します。', 'We have three plans for 2026.'];

async function download(page, button, destination) {
  const ready = page.waitForEvent('download');
  await page.locator(button).click();
  await (await ready).saveAs(destination);
  return fs.readFile(destination);
}

function checkProject(bytes) {
  const end = 12 + bytes.readUInt32LE(8);
  const project = JSON.parse(bytes.toString('utf8', 12, end));
  assert.equal(project.appVersion, '2.0.0');
  assert.equal(project.slides[2].enabled, false);
  assert.equal(project.slides[2].audioSource, 'tts');
  for (const [i, script] of narration.entries()) {
    const slide = project.slides[i];
    assert.equal(slide.script, script);
    assert.equal(slide.localAsset.language, i === 0 ? 'ja' : 'en');
    assert.equal(slide.recordingStatus, 'success');
    assert.ok(slide.recordingNarrationDuration > 0.4);
    const start = end + slide.recordingAsset.offset;
    const audio = bytes.subarray(start, start + slide.recordingAsset.length);
    assert.equal(audio.toString('ascii', 0, 4), 'RIFF');
    assert.equal(audio.toString('ascii', 8, 12), 'WAVE');
    assert.ok(audio.subarray(44).some(byte => byte !== 0));
  }
  assert.ok(bytes.length < 5000000, 'project should contain narration and slides only');
}

async function main() {
  assert.ok(fixtures, 'Set PVM_KOKORO_DIR to the directory containing the pinned model and voices.');
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'pvm-offline-test-'));
  const browser = await chromium.launch({channel: process.env.PVM_BROWSER_CHANNEL || 'chrome'});
  const context = await browser.newContext({locale: 'en-US', offline: true, acceptDownloads: true});
  const errors = [];
  context.on('request', request => {
    if (/^https?:/.test(request.url())) errors.push(request.url());
  });
  context.on('page', page => {
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') console.error(message.text()); });
    page.on('dialog', dialog => dialog.accept());
  });
  try {
    let page = await context.newPage();
    await page.goto(app);
    await page.locator('#pptxInput').setInputFiles('test-data/presentation-video-maker-notes-sample.pptx');
    const slides = page.locator('#slideList .slide-item');
    await slides.nth(2).click();
    await page.locator('#sceneEnabledInput').uncheck();
    await slides.first().click();
    await page.locator('[data-narration-source="local"]').click();
    await page.locator('#localTtsApply').click();
    for (const [i, script] of narration.entries()) {
      await slides.nth(i).click();
      assert.equal(await page.locator('[data-narration-source="local"]').getAttribute('aria-pressed'), 'true');
      if (i === 0) await page.locator('#localTtsDefaultLanguage').selectOption('ja');
      await page.locator('#localTtsLanguage').selectOption(i === 0 ? 'inherit' : 'en');
      await page.locator('#scriptInput').fill(script);
    }
    await slides.first().click();
    const input = page.locator('#localTtsFiles');
    await input.setInputFiles({name: 'jf_alpha.bin', mimeType: 'application/octet-stream', buffer: Buffer.alloc(522240)});
    await page.getByText(/Could not verify jf_alpha\.bin/).waitFor();
    await input.setInputFiles(['model_quantized.onnx', 'jf_alpha.bin'].map(name => path.join(fixtures, name)));
    await page.locator('#localTtsGenerate').click();
    await page.waitForFunction(() => document.querySelector('#progressReadyCount').textContent === '1', null, {timeout});
    console.log('Generated Japanese narration offline.');
    await input.setInputFiles(path.join(fixtures, 'af_heart.bin'));
    await page.locator('#localTtsBatch').click();
    await page.waitForFunction(() => document.querySelector('#progressReadyCount').textContent === '2', null, {timeout});
    await page.locator('#videoResolution').selectOption('720');
    await page.locator('#videoSubtitles').check();
    const pvm = path.join(workspace, 'bilingual.pvm');
    checkProject(await download(page, '#saveProjectButton', pvm));
    console.log('Verified both generated audio assets in the saved project.');
    await page.close();
    page = await context.newPage();
    await page.goto(app);
    await page.locator('#projectInput').setInputFiles(pvm);
    await page.locator('#createVideoButton').click();
    await page.locator('#videoResultPreview[src]').waitFor({timeout});
    const result = await download(page, '#saveVideoButton', path.join(workspace, 'bilingual.mp4'));
    assert.equal(result.toString('ascii', 4, 8), 'ftyp');
    assert.ok(result.includes(Buffer.from('soun')), 'MP4 has an audio track');
    assert.ok(result.includes(Buffer.from('vide')), 'MP4 has a video track');
    const subtitles = await download(page, '#exportSrtButton', path.join(workspace, 'bilingual.srt'));
    const subtitleText = subtitles.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
      .filter(line => line && !/^\d+$/.test(line) && !line.includes(' --> '))
      .join('').replace(/\s+/g, '');
    assert.equal(subtitleText, narration.join('').replace(/\s+/g, ''));
    await page.locator('#slideList .slide-item').nth(1).click();
    await page.locator('#sceneEnabledInput').uncheck();
    assert.equal(await page.locator('#videoResultStale').isVisible(), true);
    assert.equal(await page.locator('#progressStaleCount').textContent(), '0');
    await page.locator('#sceneEnabledInput').check();
    await page.locator('#scriptInput').fill('Here are the new plans.');
    assert.equal(await page.locator('#progressReadyCount').textContent(), '1');
    assert.equal(await page.locator('#createVideoButton').isDisabled(), true);
    await page.locator('#localTtsFiles').setInputFiles(['model_quantized.onnx', 'af_heart.bin'].map(name => path.join(fixtures, name)));
    await page.locator('#localTtsBatch').click();
    await page.waitForFunction(() => document.querySelector('#progressReadyCount').textContent === '2', null, {timeout});
    await page.setViewportSize({width: 390, height: 844});
    await page.locator('[data-mobile-key="output"]').click();
    await page.locator('[data-scene-action="generate-local"][data-scene-action-index="0"]').click();
    assert.equal(await page.locator('[data-mobile-key="script"]').getAttribute('aria-current'), 'page');
    await page.getByText(/Slide 1 needs: jf_alpha\.bin/).waitFor();
    await page.setViewportSize({width: 1280, height: 720});
    if (process.env.PVM_LEGACY_PROJECT) {
      await page.locator('#projectInput').setInputFiles(process.env.PVM_LEGACY_PROJECT);
      await page.waitForFunction(() => document.querySelector('#scriptInput').value.startsWith('Presentation Video Maker'));
      assert.equal(await page.locator('#progressReadyCount').textContent(), '1');
      assert.equal(await page.locator('[data-narration-source="file"]').getAttribute('aria-pressed'), 'true');
      console.log('Reopened a v1.3.3 project and recovered its audio.');
    }
    assert.deepEqual(errors, []);
    console.log('Verified project resume, MP4 tracks, SRT, and stale narration. Output: ' + workspace);
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
