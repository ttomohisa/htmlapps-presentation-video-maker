'use strict';

// Run against a built HTML and the three pinned user downloads (see VERIFY_OFFLINE.md).
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium, devices} = require('playwright');

const app = pathToFileURL(path.resolve(process.env.PVM_TEST_HTML || 'dist/index.html')).href;
const fixtures = process.env.PVM_KOKORO_DIR;
const timeout = 180000;
const narration = ['本日は、Presentation Video Makerと新製品Lumivexaを紹介します。', 'We have three plans for 2026.\nNext, we will go over the schedule.'];

async function download(page, button, destination) {
  const ready = page.waitForEvent('download');
  await page.locator(button).click();
  await (await ready).saveAs(destination);
  return fs.readFile(destination);
}

function checkProject(bytes) {
  const end = 12 + bytes.readUInt32LE(8);
  const project = JSON.parse(bytes.toString('utf8', 12, end));
  assert.equal(project.schemaVersion, 2);
  assert.equal(project.settings.deckMethod, 'local');
  assert.equal(project.slides[2].enabled, false);
  assert.equal(project.slides[2].audioSource, 'tts');
  assert.equal(project.slides[2].followsDeckMethod, false);
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

function checkMp4(bytes) {
  assert.equal(bytes.toString('ascii', 4, 8), 'ftyp');
  assert.ok(bytes.includes(Buffer.from('soun')), 'MP4 has an audio track');
  assert.ok(bytes.includes(Buffer.from('vide')), 'MP4 has a video track');
}

async function chooseKokoroFile(page, slot, file=path.join(fixtures,slot)) {
  const row=page.locator(`[data-model-file="${slot}"]`);
  const opening=page.waitForEvent('filechooser');
  await row.locator('[data-load-local-file]').click();
  const chooser=await opening;
  assert.equal(chooser.isMultiple(),false);
  assert.equal(await chooser.element().getAttribute('data-local-file'),slot);
  await chooser.setFiles(file);
  return row;
}

async function loadKokoroFile(page, slot) {
  const row=await chooseKokoroFile(page,slot);
  await row.locator('[data-local-ready]:not([hidden])').waitFor({state:'attached',timeout});
}

async function watchSpeechProgress(page) {
  await page.evaluate(() => {
    const root = document.querySelector('#localTtsRun');
    const status = root.querySelector('#localTtsStatus');
    const meter = root.querySelector('#localTtsProgress');
    const count = root.querySelector('#localTtsCount');
    window.pvmTestSpeechProgress = [];
    new MutationObserver(() => {
      if (meter.hidden) return;
      window.pvmTestSpeechProgress.push({
        status: status.textContent, count: count.textContent, fraction: meter.position,
      });
    }).observe(root, {subtree: true, childList: true, attributes: true});
  });
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
    await page.locator('#guideSlideSettings > summary').click();
    await page.locator('[data-narration-source="tts"]').click();
    await page.locator('#sceneEnabledInput').uncheck();
    assert.equal(await page.locator('#guideMethod').inputValue(),'local');
    for (const [i, script] of narration.entries()) {
      await slides.nth(i).click();
      assert.equal(await page.locator('[data-narration-source="local"]').getAttribute('aria-pressed'), 'true');
      if (i === 0) await page.locator('#localTtsDefaultLanguage').selectOption('ja');
      await page.locator('#localTtsLanguage').selectOption(i === 0 ? 'inherit' : 'en');
      await page.locator('#scriptInput').fill(script);
    }
    await slides.first().click();
    await loadKokoroFile(page,'model_quantized.onnx');
    await chooseKokoroFile(page,'jf_alpha.bin',path.join(fixtures,'af_heart.bin'));
    await page.getByText(/Load jf_alpha\.bin/).waitFor();
    await page.locator('[data-model-file="model_quantized.onnx"] [data-local-ready]').waitFor();
    await loadKokoroFile(page,'jf_alpha.bin');
    await page.getByRole('link',{name:/English voice/}).waitFor();
    await page.locator('#guideSample').click();
    await page.waitForFunction(() => document.querySelector('#guideCoverage').textContent.includes('1 / 2'), null, {timeout});
    const player = page.locator('#guideAudioPlayer');
    await player.waitFor();
    await page.waitForFunction(()=>document.querySelector('#guideAudioPlayer').currentTime>0);
    assert.equal(await player.evaluate(audio=>audio.controls),true);
    await player.evaluate(audio=>{
      audio.pause();
      audio.currentTime=audio.duration/2;
    });
    await page.waitForFunction(()=>{
      const audio=document.querySelector('#guideAudioPlayer');
      return audio.paused&&!audio.seeking&&Math.abs(audio.currentTime-audio.duration/2)<0.1;
    });
    await player.evaluate(audio=>audio.play());
    await slides.nth(1).click();
    assert.equal(await player.isVisible(),false);
    assert.equal(await player.getAttribute('src'),null);
    await slides.first().click();
    const samplePath = path.join(workspace, 'sample.pvm');
    const sample = await download(page, '#saveProjectButton', samplePath);
    console.log('Generated Japanese narration offline.');
    await loadKokoroFile(page,'af_heart.bin');
    await page.locator('#guidePrimary[data-action="batch"]').click();
    await page.locator('#guidePrimary[data-action="output"]').click({timeout});
    await page.locator('#videoResolution').selectOption('720');
    await page.getByText('Subtitles, music and transitions',{exact:true}).click();
    await page.locator('#videoSubtitles').check();
    const pvm = path.join(workspace, 'bilingual.pvm');
    const project = await download(page, '#saveProjectButton', pvm);
    checkProject(project);
    function wav(bytes,index) {
      const end=12+bytes.readUInt32LE(8), manifest=JSON.parse(bytes.toString('utf8',12,end));
      const asset=manifest.slides[index].recordingAsset;
      return bytes.subarray(end+asset.offset,end+asset.offset+asset.length);
    }
    assert.deepEqual(wav(project,0),wav(sample,0));
    console.log('Verified both generated audio assets in the saved project.');
    await page.close();
    page = await context.newPage();
    await page.goto(app);
    await page.locator('#projectInput').setInputFiles(pvm);
    await page.locator('#createVideoButton').click();
    await page.locator('#videoResultPreview[src]').waitFor({timeout});
    const result = await download(page, '#saveVideoButton', path.join(workspace, 'bilingual.mp4'));
    checkMp4(result);
    await page.locator('summary[data-i18n="textExportTitle"]').click();
    const subtitles = await download(page, '#exportSrtButton', path.join(workspace, 'bilingual.srt'));
    const subtitleText = subtitles.toString('utf8').replace(/^\uFEFF/, '').split(/\r?\n/)
      .filter(line => line && !/^\d+$/.test(line) && !line.includes(' --> '))
      .join('').replace(/\s+/g, '');
    assert.equal(subtitleText, narration.join('').replace(/\s+/g, ''));
    const step = key => page.locator('[data-guide-step="'+key+'"]');
    await step('script').click();
    await page.locator('#slideList .slide-item').nth(1).click();
    await page.locator('#guideSlideSettings > summary').click();
    await page.locator('#sceneEnabledInput').uncheck();
    await step('output').click();
    assert.equal(await page.locator('#videoResultStale').isVisible(), true);
    await step('script').click();
    await page.locator('#sceneEnabledInput').check();
    const update=page.getByRole('button',{name:'Update audio for this slide'});
    assert.equal(await update.isVisible(),false);
    await page.locator('#scriptInput').fill('Here are the new plans.');
    await update.waitFor();
    assert.match(await page.locator('#guideCoverage').textContent(), /1 \/ 2/);
    await page.setViewportSize({width: 390, height: 844});
    await step('output').click();
    await page.locator('#guideVideoIssue').click();
    assert.equal(await step('script').getAttribute('aria-current'),'step');
    assert.equal(await page.locator('#scriptInput').inputValue(),'Here are the new plans.');
    await page.locator('#guideSlideSettings > summary').click();
    await update.click();
    assert.equal(await page.getByRole('button',{name:'Choose saved file (shared model)'}).evaluate(el=>el===document.activeElement),true);
    await loadKokoroFile(page,'model_quantized.onnx');
    await loadKokoroFile(page,'af_heart.bin');
    assert.equal(await update.evaluate(el=>el===document.activeElement),true);
    await update.click();
    await page.locator('#guideSlideAudio + #localTtsRun #localTtsProgress').waitFor();
    await page.locator('#localTtsCancel').click();
    await page.locator('#localTtsProgress').waitFor({state:'hidden'});
    await update.click({timeout});
    await page.locator('#guidePrimary[data-action="output"]').waitFor({timeout});
    assert.equal(await update.isVisible(),false);
    assert.equal(await page.locator('#guideSlideSettings').evaluate(el=>el.open),false);
    await page.locator('#guidePlaySlide').click();
    await page.locator('#guideAudioPlayer').waitFor();
    const revised=await download(page,'#saveProjectButton',path.join(workspace,'revised.pvm'));
    assert.deepEqual(wav(revised,0),wav(project,0));
    assert.notDeepEqual(wav(revised,1),wav(project,1));
    await step('output').click();
    assert.equal(await page.locator('#guideAudioPlayer').getAttribute('src'),null);
    await page.setViewportSize({width: 1280, height: 720});
    if (process.env.PVM_LEGACY_PROJECT) {
      const legacy = await fs.readFile(process.env.PVM_LEGACY_PROJECT);
      const manifest = JSON.parse(legacy.toString('utf8',12,12+legacy.readUInt32LE(8)));
      assert.equal(manifest.schemaVersion,1);
      const selected = manifest.selectedSlideIndex || 0;
      await page.locator('#projectInput').setInputFiles(process.env.PVM_LEGACY_PROJECT);
      await page.waitForFunction(expected => document.querySelector('#scriptInput').value === expected, manifest.slides[selected].script);
      const savedAgain = await download(page,'#saveProjectButton',path.join(workspace,'legacy-restored.pvm'));
      const restored = JSON.parse(savedAgain.toString('utf8',12,12+savedAgain.readUInt32LE(8)));
      assert.equal(restored.slides[selected].audioSource,manifest.slides[selected].audioSource);
      assert.equal(restored.slides[selected].followsDeckMethod,false);
      for(const [index,slide] of manifest.slides.entries()){
        if(slide.recordingAsset) assert.deepEqual(wav(savedAgain,index),wav(legacy,index));
      }
      console.log('Reopened a v1 project and recovered its audio.');
    }
    const mobileOptions = {...devices['Pixel 7'], locale:'en-US', offline:true};
    const mobile = await browser.newContext(mobileOptions);
    mobile.on('request', request => {
      if (/^https?:/.test(request.url())) errors.push(request.url());
    });
    const phone = await mobile.newPage();
    phone.on('pageerror', error => errors.push(error.message));
    phone.on('dialog',dialog=>dialog.accept());
    await phone.goto(app);
    await phone.locator('#pptxInput').setInputFiles('test-data/presentation-video-maker-notes-sample.pptx');
    await phone.locator('#guideModelSetup').waitFor();
    assert.equal(await phone.locator('#guideMethod').inputValue(),'local');
    assert.equal(await phone.locator('[data-model-file="jf_alpha.bin"]').isVisible(),true);
    assert.equal(await phone.locator('[data-model-file="af_heart.bin"]').isVisible(),false);
    assert.equal(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await phone.getByText('Only downloads connect to Hugging Face (external site). Audio is generated on your device.').waitFor();
    assert.equal(await phone.locator('#guideModelCount').innerText(),'0 of 2 loaded');
    await loadKokoroFile(phone,'model_quantized.onnx');
    assert.equal(await phone.locator('#guideModelCount').innerText(),'1 of 2 loaded');
    await loadKokoroFile(phone,'jf_alpha.bin');
    await phone.locator('[data-guide-step="output"]').click();
    await phone.getByRole('button',{name:'Prepare audio from notes'}).click();
    assert.equal(await phone.locator('#guidePrimary[data-action="batch"]').evaluate(button=>button===document.activeElement),true);
    await watchSpeechProgress(phone);
    await phone.locator('#guidePrimary[data-action="batch"]').click();
    await phone.locator('#guidePrimary[data-action="output"]').waitFor({timeout});
    const batchUpdates = await phone.evaluate(() => window.pvmTestSpeechProgress);
    const fractions = batchUpdates.map(update => update.fraction);
    assert.deepEqual(fractions, [...fractions].sort((a,b) => a-b), 'batch progress never goes backwards');
    assert.ok(batchUpdates.some(update => update.count === '2 of 3 complete' && update.fraction === 2/3
      && update.status === 'Generating audio for slide 3…'));
    await phone.reload();
    await phone.locator('#projectInput').setInputFiles(samplePath);
    await phone.locator('[data-model-file="af_heart.bin"]').waitFor();
    assert.equal(await phone.locator('#guideMethod').inputValue(), 'local');
    assert.equal(await phone.locator('#guideCapture').isVisible(), false);
    await loadKokoroFile(phone,'model_quantized.onnx');
    await loadKokoroFile(phone,'af_heart.bin');
    await watchSpeechProgress(phone);
    const workerStarted = phone.waitForEvent('worker');
    await phone.locator('#guidePrimary[data-action="batch"]').click();
    const worker = await workerStarted;
    assert.equal(await worker.evaluate(() => self.name), 'Kokoro speech synthesis');
    await phone.locator('#guidePrimary[data-action="output"]').click({timeout});
    const updates=await phone.evaluate(()=>window.pvmTestSpeechProgress);
    assert.ok(updates.some(update=>update.fraction===-1&&update.status.startsWith('Preparing the model')));
    assert.ok(updates.some(update=>update.count==='0 of 1 complete'&&update.status==='Generating audio for slide 2…'
      &&update.fraction>0&&update.fraction<1));
    assert.ok(updates.some(update=>update.fraction===1));
    assert.equal(await phone.locator('#localTtsProgress').isVisible(),false);
    const phoneProject = await download(phone, '#saveProjectButton', path.join(workspace, 'mobile-bilingual.pvm'));
    checkProject(phoneProject);
    assert.deepEqual(wav(phoneProject,0),wav(sample,0));
    const workerClosed = worker.waitForEvent('close');
    await phone.locator('#createVideoButton').click();
    await workerClosed;
    const phoneMp4 = await download(phone, '#saveVideoButton', path.join(workspace, 'mobile-bilingual.mp4'));
    checkMp4(phoneMp4);
    await mobile.close();

    const limited = await browser.newContext(mobileOptions);
    const fallback = await limited.newPage();
    fallback.on('pageerror', error => errors.push(error.message));
    await fallback.addInitScript(() => { window.BigInt64Array = undefined; });
    await fallback.goto(app);
    await fallback.locator('#projectInput').setInputFiles(samplePath);
    await fallback.locator('#guidePrimary[data-action="fallback"]').click();
    assert.match(await fallback.locator('#selectedSlideLabel').textContent(), /2/);
    await fallback.locator('[data-narration-source="file"]').click();
    await fallback.locator('#narrationFileInput').setInputFiles('test-data/narration-regression-tone.wav');
    await fallback.locator('#guidePrimary[data-action="output"]').click();
    assert.equal(await fallback.locator('#createVideoButton').isEnabled(), true);
    const fallbackProject = await download(fallback, '#saveProjectButton', path.join(workspace, 'mobile-fallback.pvm'));
    assert.deepEqual(wav(fallbackProject,0),wav(sample,0));
    await limited.close();
    assert.deepEqual(errors, []);
    console.log('Verified mobile Kokoro synthesis, MP4 export, and file fallback. Output: ' + workspace);
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
