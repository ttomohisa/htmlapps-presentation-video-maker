// Dependency-free regressions against the app's actual functions and event handlers.
// DOM/media boundaries are lightweight doubles; these are not browser or codec tests.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { File } = require('node:buffer');
const source = fs.readFileSync(process.env.PVM_TEST_HTML || path.join(__dirname, '../src/index.template.html'), 'utf8');
function extract(name, required = true) {
  const match = new RegExp(`^      (?:async )?function ${name}\\(`, 'm').exec(source);
  if (!match) { assert.ok(!required, `Missing production function ${name}`); return ''; }
  const next = source.slice(match.index + 7).search(/\n      (?:async )?function /);
  assert.ok(next >= 0, `Missing function boundary after ${name}`);
  return source.slice(match.index, match.index + 7 + next);
}
function element() {
  return { value:'', textContent:'', checked:true, open:false, hidden:false, dataset:{}, children:[], handlers:{},
    classList:{ add(){},remove(){},toggle(){} }, setAttribute(){}, append(...children){this.children.push(...children);},
    addEventListener(type, fn){ this.handlers[type]=fn; }, focus(){throw new Error('Preview must not move focus');} };
}
function scene(overrides = {}) {
  return {enabled:true, script:'First sentence.', slideText:'Slide', voiceURI:'', rate:1, audioSource:'tts', prePadding:0, postPadding:0, narrationDuration:10, recordingNarrationDuration:0, ...overrides};
}
function harness() {
  const controls = new Map(), downloads=[], toasts=[];
  const $ = selector => {if (!controls.has(selector)) controls.set(selector, element()); return controls.get(selector);};
  $('#videoTransition').value='fade'; $('#videoOutputName').value='Synthetic title'; $('#subtitlePreviewFormat').value='SRT';
  for (const id of ['#subtitlePreviewText','#subtitlePreviewCount']) Object.defineProperty($(id),'innerHTML',{set(){throw new Error('Narration must remain literal text');}});
  const translations = JSON.parse(source.match(/const translations = (\{[^\n]+\});/)[1]);
  const ctx = vm.createContext({Blob,File,console,URL,TextEncoder,TextDecoder,DataView,Uint8Array,DecompressionStream,
    language:'en', state:{slides:[],selectedSlideIndex:-1,rate:1,sourceGeneration:0,videoTransition:'fade'}, $, $$:()=>[],
    window:{}, HTMLCanvasElement:{prototype:{}}, document:{createElement:element,documentElement:{}}, APP_CONFIG:{name:'Test',nameJa:'Test'},
    projectBaseName:()=>'presentation', downloadBlob:(blob,filename)=>downloads.push({blob,filename}), showToast:message=>toasts.push(message),
    confirm:()=>true, selectedVoice:()=>null, voiceForScene:()=>null, formatRate:String,
    setRateControl:value=>{ctx.state.rate=value;return value;}, performance:{now:()=>12000},
    speak:(text,callback)=>{ctx.speechCallback=callback;return true;}, captureIsBusy:()=>false,
    sceneRecordingVisualState:()=> 'pending', sceneRecordingStatusLabel:()=> 'Pending', sceneListActionState:()=>({action:'record',label:'Record'}),
    isSmartphoneMode:()=>false, bytesLabel:String, setChip(){},
    projectOperationBusy:()=>false, AppToast:{show(){}},
    t:key=>translations[ctx.language][key]||key,
    format:(key,values={})=>Object.entries(values).reduce((text,[k,v])=>text.replaceAll(`{${k}}`,String(v)),translations[ctx.language][key]||key)
  });
  for (const name of ['updateMobileResolutionWarning','updateMobileNavIndicators','updateWorkflowNavIndicators','updateProjectButtons','updateCurrentSceneAudioStatus','updateSceneProgress','updateRecordingPlan','renderSlides','selectSlide','updateSceneEditor','updateCompatibility','renderSelectedSlide','setRendererState','updateDeckSummary','refreshVoices','applyDeviceUi','refreshCaptureReady','cancelSpeech','cancelMicRecording','stopDisplayStream','cleanupRecording','clearVideoResult','cancelVideo','disposeRendererState','setWorkflowNavCollapsed','markVideoResultStale']) ctx[name]=()=>{};
  const names=['formatSubtitleTime','subtitleTimelineEntries','exportSubtitles','textExportBase','safeOutputBase','videoSceneIndexes','sceneVideoDuration','estimateSpeechSeconds','splitSubtitleSegments','videoTransitionSeconds','videoEstimatedSeconds','formatClock','videoValidation','setVideoExportChip','renderVideoTimeline','updateVideoExportState','narrationSource','sourceLabel','narrationSourceLabel','recordingSourceLabel','renderSceneRecordings','saveCurrentScript','resetCurrentScript','applyNarrationToAll','updateNarrationDuration','markSceneRecordingStale','invalidateSource','commitSceneAudio','restoreProjectSlide','openProjectFile','applyLanguage'];
  vm.runInContext(names.map(name=>extract(name)).join('\n')+'\n'+['serializeSubtitles','updateSubtitlePreview'].map(name=>extract(name,false)).join('\n'),ctx);
  const eventLines=source.split('\n').filter(line=>line.startsWith("      $('#")&&line.includes(".addEventListener(")&&['#subtitlePreview','#videoTransition','#previewVoiceButton','#rateRange'].some(id=>line.includes(`$('${id}')`)));
  vm.runInContext(eventLines.join('\n'),ctx);
  return {ctx,$,downloads,toasts,translations};
}
function open(h) {assert.equal(typeof h.ctx.updateSubtitlePreview,'function','Preview must be implemented'); h.$('#subtitlePreview').open=true; h.ctx.updateSubtitlePreview();}
function preview(h){return h.$('#subtitlePreviewText').value;}
function editControls(h,s) {h.ctx.state.selectedSlideIndex=0; h.$('#scriptInput').value=s.script;h.$('#prePaddingInput').value=String(s.prePadding);h.$('#postPaddingInput').value=String(s.postPadding);h.$('#sceneEnabledInput').checked=s.enabled;}

for (const vtt of [false,true]) test(`${vtt?'VTT':'SRT'} timestamps carry rounded milliseconds and handle invalid inputs`,()=>{
  const {ctx}=harness();
  for(const [seconds,expected] of [[0,'00:00:00,000'],[-1,'00:00:00,000'],[NaN,'00:00:00,000'],[Infinity,'00:00:00,000'],[-Infinity,'00:00:00,000'],[Number.MAX_VALUE,'00:00:00,000'],[.125,'00:00:00,125'],[1.234,'00:00:01,234'],[.9994,'00:00:00,999'],[.9996,'00:00:01,000'],[59.9994,'00:00:59,999'],[59.9996,'00:01:00,000'],[60,'00:01:00,000'],[3599.9996,'01:00:00,000'],[3600,'01:00:00,000'],[360000.001,'100:00:00,001'],['1.25','00:00:01,250']]) {
    const actual=ctx.formatSubtitleTime(seconds,{vtt}); assert.equal(actual,vtt?expected.replace(',','.'):expected,`${seconds}`); assert.match(actual,/^\d{2,}:\d{2}:\d{2}[,.]\d{3}$/);
  }
});
test('boundary bug is fixed in actual exported Blob payloads', async()=>{
  const h=harness(); h.ctx.state.slides=[scene({recordingNarrationDuration:59.9996,recordingBlob:new Blob(['audio'])})];
  for(const format of ['SRT','VTT']) h.ctx.exportSubtitles(format);
  for(const {blob} of h.downloads) assert.match(await blob.text(),/00:01:00[,.]000/);
});
test('native preview starts collapsed with localized labels and a full read-only scrollable field',()=>{
  const details=source.match(/<details[^>]*id="subtitlePreview"[^>]*>/); assert.ok(details); assert.doesNotMatch(details[0],/\sopen(?:[\s=>])/);
  assert.match(source,/<summary[^>]*data-i18n="subtitlePreviewTitle"/);
  assert.match(source,/<label[^>]*for="subtitlePreviewFormat"/);
  const textarea=source.match(/<textarea[^>]*id="subtitlePreviewText"[^>]*>/)?.[0]; assert.ok(textarea); assert.match(textarea,/\breadonly\b/); assert.doesNotMatch(textarea,/maxlength/); assert.match(textarea,/aria-describedby="subtitlePreviewNote"/); assert.match(textarea,/data-i18n-aria-label/);
  assert.match(source,/#subtitlePreviewText\s*\{[^}]*overflow:auto/); assert.match(source,/\.subtitle-preview-controls\s*\{[^}]*flex-wrap:wrap/);
});
for(const language of ['en','ja']) for(const format of ['SRT','VTT']) test(`${language} ${format} preview and download share literal Unicode content, cues, filename and BOM`,async()=>{
  const h=harness();h.ctx.language=language; h.$('#subtitlePreviewFormat').value=format;
  h.ctx.state.slides=[scene({script:'日本語 café 😀。<img onerror=alert(1)>。End.'}),scene({script:'Excluded secret',enabled:false}),scene({script:'  '}),scene({script:'End.'})];
  h.$('#videoOutputName').value='Review: 字幕 / draft';open(h); const before=JSON.stringify(h.ctx.state);
  h.ctx.exportSubtitles(format);const {blob,filename}=h.downloads[0];const bytes=new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual(Array.from(bytes.slice(0,3)),[239,187,191]); assert.equal(await blob.text(),preview(h)); assert.ok(preview(h).includes('<img onerror=alert(1)>')); assert.ok(preview(h).includes('😀')); assert.ok(!preview(h).includes('Excluded secret'));
  assert.equal(filename,`Review- 字幕 - draft.${format.toLowerCase()}`); assert.equal(blob.type,format==='VTT'?'text/vtt;charset=utf-8':'text/plain;charset=utf-8');assert.equal(JSON.stringify(h.ctx.state),before);
  assert.equal(h.$('#subtitlePreviewCount').textContent,h.ctx.format('subtitlePreviewCues',{count:h.ctx.subtitleTimelineEntries().length}));
});
test('empty narration clears old text and gives no download for either format',()=>{
  const h=harness();h.ctx.state.slides=[scene()];open(h);assert.ok(preview(h));
  h.ctx.state.slides=[scene({script:' '})];
  for(const format of ['SRT','VTT']){h.$('#subtitlePreviewFormat').value=format;h.ctx.updateSubtitlePreview();assert.equal(preview(h),'');h.ctx.exportSubtitles(format);}
  assert.equal(h.downloads.length,0);assert.equal(h.$('#subtitlePreviewCount').textContent,'0 cues');
});
test('repeated toggle and format events recompute without state changes, downloads or closed serialization',()=>{
  const h=harness();h.ctx.state.slides=[scene()];open(h);const before=JSON.stringify(h.ctx.state);
  assert.equal(typeof h.$('#subtitlePreview').handlers.toggle,'function');assert.equal(typeof h.$('#subtitlePreviewFormat').handlers.change,'function');
  for(let i=0;i<3;i++) {
    h.$('#subtitlePreview').open=false; const serializer=h.ctx.serializeSubtitles;h.ctx.serializeSubtitles=()=>{throw new Error('Collapsed preview serialized');};h.$('#subtitlePreview').handlers.toggle();h.ctx.updateVideoExportState();h.ctx.serializeSubtitles=serializer;
    h.$('#subtitlePreview').open=true;h.$('#subtitlePreview').handlers.toggle();assert.ok(preview(h));
    h.$('#subtitlePreviewFormat').value='VTT';h.$('#subtitlePreviewFormat').handlers.change();assert.ok(preview(h).startsWith('WEBVTT\n\n'));
  }
  assert.equal(JSON.stringify(h.ctx.state),before);assert.equal(h.downloads.length,0);
});
test('editing scripts, inclusion and both paddings refreshes an open preview through production save/render paths',()=>{
  const h=harness(); const s=scene({audioSource:'mic'});h.ctx.state.slides=[s,scene({script:'Second.'})];editControls(h,s);open(h);
  h.$('#scriptInput').value='Edited.';h.ctx.saveCurrentScript();assert.ok(preview(h).includes('Edited.'));assert.ok(!preview(h).includes('First sentence.'));
  h.$('#prePaddingInput').value='2';h.$('#postPaddingInput').value='3';h.ctx.saveCurrentScript();assert.match(preview(h),/00:00:02,000/);assert.equal(preview(h),h.ctx.serializeSubtitles(h.ctx.subtitleTimelineEntries()));
  h.$('#sceneEnabledInput').checked=false;h.ctx.saveCurrentScript();assert.ok(!preview(h).includes('Edited.'));assert.match(preview(h),/00:00:00,000/);
});
test('recorded duration and transition changes refresh the open preview',()=>{
  const h=harness();h.ctx.state.slides=[scene(),scene({script:'Second.'})];open(h);
  h.ctx.commitSceneAudio(h.ctx.state.slides[0],new Blob(['synthetic']),{source:'file',duration:4});assert.match(preview(h),/00:00:04,000/);assert.match(preview(h),/00:00:04,350/);
  h.$('#videoTransition').value='cut';h.$('#videoTransition').handlers.change();assert.match(preview(h),/00:00:04,045/);
});
test('measured speech refreshes even when the selected scene changed while speech was playing',()=>{
  const h=harness();h.ctx.state.slides=[scene(),scene({script:'Second.'})];editControls(h,h.ctx.state.slides[0]);open(h);h.$('#previewVoiceButton').handlers.click();
  h.ctx.state.selectedSlideIndex=1;h.ctx.performance.now=()=>18000;h.ctx.speechCallback(null);assert.match(preview(h),/00:00:06,000/);
});
test('live narration rate changes refresh estimated timing',()=>{
  const h=harness();h.ctx.state.slides=[scene({narrationDuration:null,script:'A long enough synthetic narration to observe rate changes without media.'})];editControls(h,h.ctx.state.slides[0]);open(h);const before=preview(h);
  h.$('#rateRange').value='1.5';h.$('#rateRange').handlers.input();assert.notEqual(preview(h),before);assert.equal(preview(h),h.ctx.serializeSubtitles(h.ctx.subtitleTimelineEntries()));
});
test('source invalidation immediately clears the previous deck while open or collapsed',()=>{
  for(const collapsed of [false,true]) {const h=harness();h.ctx.state.slides=[scene()];open(h);h.$('#subtitlePreview').open=!collapsed;h.ctx.invalidateSource();assert.equal(preview(h),'');assert.equal(h.ctx.state.slides.length,0);h.$('#subtitlePreview').open=true;h.ctx.updateSubtitlePreview();assert.equal(preview(h),'');}
});
test('project opening replaces old preview with restored scripts, timings and output format settings',async()=>{
  const h=harness();h.ctx.state.slides=[scene({script:'Old deck.'})];open(h);
  const file=new File(['synthetic'],'fixture.pvm');h.ctx.readProjectManifest=async()=>({payloadStart:0,manifest:{slideCount:1,source:{name:'fixture.pptx',asset:{}},slides:[{script:'Restored 日本語.',enabled:true,narrationDuration:3,prePadding:2}],settings:{videoTransition:'cut'}}});
  h.ctx.projectAssetBlob=()=>new Blob(['synthetic']);h.ctx.loadPptx=async()=>{h.ctx.invalidateSource();assert.equal(preview(h),'');h.ctx.state.slides=[scene()];};
  await h.ctx.openProjectFile(file);assert.ok(preview(h).includes('Restored 日本語.'));assert.ok(!preview(h).includes('Old deck.'));assert.match(preview(h),/00:00:02,000 --> 00:00:05,000/);
});
test('language changes refresh cue count and keep complete large content',()=>{
  const h=harness();h.ctx.state.slides=[scene({script:Array(120).fill('Long literal narration.').join(' ')})];open(h);assert.ok(preview(h).length>5000);
  h.ctx.language='ja';h.ctx.applyLanguage();assert.equal(preview(h),h.ctx.serializeSubtitles(h.ctx.subtitleTimelineEntries()));assert.equal(h.$('#subtitlePreviewCount').textContent,h.ctx.format('subtitlePreviewCues',{count:h.ctx.subtitleTimelineEntries().length}));assert.notEqual(h.translations.en.subtitlePreviewCues,h.translations.ja.subtitlePreviewCues);
  for(const key of ['subtitlePreviewTitle','subtitlePreviewFormat','subtitlePreviewText','subtitlePreviewCues','subtitlePreviewNote','helpSubtitlePreviewTitle','helpSubtitlePreviewText']) for(const language of ['en','ja']) assert.ok(h.translations[language][key],`${language} ${key}`);
});
test('existing cue weighting and Cut timing stay unchanged',()=>{
  const h=harness();h.ctx.state.slides=[scene({script:'A. This is a much longer sentence.'}),scene({script:'Second.'})];h.$('#videoTransition').value='cut';const cues=h.ctx.subtitleTimelineEntries();assert.equal(cues[0].end,5);assert.equal(cues[2].start,10.045);assert.equal(h.ctx.videoTransitionSeconds(),0);
});
test('narrow screens preserve the existing 16px textarea sizing for the preview',()=>{
  const mobile=source.slice(source.lastIndexOf('@media (max-width: 600px)'));
  assert.match(mobile,/[^{}]*#subtitlePreviewText[^{}]*\{\s*font-size:16px;/,'A mobile ID selector must override the desktop preview font shorthand');
});
