const assert = require('node:assert/strict');
const {test} = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(process.env.PVM_TEST_HTML || path.join(__dirname,'../src/index.template.html'),'utf8');
const translations = JSON.parse(source.match(/const translations = (\{[^\n]+\});/)[1]);
function extract(name) {
  const m = new RegExp(`^      (?:async )?function ${name}\\(`,'m').exec(source);
  assert.ok(m, `Missing production function ${name}`);
  const next = source.slice(m.index+7).search(/\n      (?:async )?function /);
  return source.slice(m.index,m.index+7+next);
}
function context(extra={}) {
  const controls = new Map();
  const $ = id => {if(!controls.has(id)) controls.set(id,{disabled:false,dataset:{},style:{},classList:{add(){},remove(){},toggle(){}},value:'',checked:false,textContent:'',setAttribute(){},removeAttribute(){}});return controls.get(id);};
  const ctx=vm.createContext({$,state:{slides:[],sourceGeneration:1,projectBusy:false,capturePhase:'idle',videoExportPhase:'idle'}, Blob,File,TextEncoder,TextDecoder,Uint8Array,DataView,URL,console:{error(){},warn(){}},language:'en', t:key=>translations.en[key], showToast(){}, captureIsBusy:()=>false, ...extra});
  if(source.includes('function videoIsBusy('))vm.runInContext(extract('videoIsBusy'),ctx);
  return {ctx,$};
}
test('language resolution and explicit choice use common preference without rewriting legacy storage',()=>{
  assert.match(source,/BrowserKittyUI\.resolveLanguage\(\{legacyKeys:\['pvm-language'\]\}\)/);
  assert.match(source,/BrowserKittyUI\.chooseLanguage\(language\)/);
  assert.doesNotMatch(source,/localStorage\.setItem\('pvm-language'/);
});
test('manual save shows retention instructions and honest download notifications',()=>{
  assert.match(source,/id="projectSaveStatus"/);
  assert.match(source,/mode:'manual'/);
  assert.equal(translations.en.saveProject,'Save project');
  assert.equal(translations.en.openProject,'Open project');
  for(const key of ['projectSaved','videoSaved','textExportSaved','saved']) assert.match(translations.en[key],/download started/i);
});
test('saving failures keep work and expose a persistent recovery message',async()=>{
  const h=context({updateProjectButtons(){},updateProjectSaveStatus(){},createProjectBlob:async()=>{throw Error('write');}});
  h.ctx.state.sourceFile={name:'keep.pptx'}; h.ctx.state.slides=[{script:'keep'}];
  vm.runInContext(extract('projectOperationBusy')+'\n'+extract('saveProject'),h.ctx);
  await h.ctx.saveProject();
  assert.equal(h.ctx.state.slides[0].script,'keep');
  assert.equal(h.ctx.state.projectSaveState,'error');
  assert.equal(h.ctx.state.projectBusy,false);
});
test('invalid project archive preserves loaded work before asking to replace it',async()=>{
  let replaced=0,asked=0;
  const h=context({updateProjectButtons(){},updateProjectSaveStatus(){},readProjectManifest:async()=>{throw Error('PROJECT_MAGIC');},loadPptx:async()=>{replaced++;},AppConfirm:{ask:async()=>{asked++;return true;}}});
  h.ctx.state.slides=[{script:'keep loaded work'}];
  vm.runInContext(extract('projectOperationBusy')+'\n'+extract('openProjectFile'),h.ctx);
  await h.ctx.openProjectFile(new Blob(['invalid']));
  assert.equal(replaced,0);assert.equal(asked,0);assert.equal(h.ctx.state.slides[0].script,'keep loaded work');
});
for(const problem of ['mismatch','asset','cancel']) test(`project ${problem} leaves current PPTX, narration and MP4 intact`,async()=>{
  let replaced=0,asked=0;
  const h=context({updateProjectButtons(){},updateProjectSaveStatus(){},
    readProjectManifest:async()=>({manifest:{slideCount:problem==='mismatch'?2:1,source:{asset:{},name:'new.pptx'},slides:[{recordingAsset:{bad:problem==='asset'}}]},payloadStart:0}),
    projectAssetBlob(file,start,asset){if(asset.bad) throw Error('PROJECT_ASSET_BOUNDS');return new Blob(['PPTX']);},
    parsePptxBuffer:async()=>({slides:[{}]}),confirmProjectChange:async()=>{asked++;return false;},loadPptx:async()=>{replaced++;}});
  const audio=new Blob(['existing recording']),video=new Blob(['existing MP4']);
  h.ctx.state.slides=[{script:'keep',recordingBlob:audio}];h.ctx.state.videoResultBlob=video;
  vm.runInContext(extract('projectOperationBusy')+'\n'+extract('openProjectFile'),h.ctx);
  await h.ctx.openProjectFile(new Blob(['project']));
  assert.equal(replaced,0);assert.equal(asked,problem==='cancel'?1:0);assert.equal(h.ctx.state.slides[0].recordingBlob,audio);assert.equal(h.ctx.state.videoResultBlob,video);assert.equal(h.ctx.state.projectBusy,false);
});
test('live translated progress keeps values, script and active controller',()=>{
  const h=context();h.ctx.language='ja';h.ctx.format=(key,values)=>Object.entries(values).reduce((text,[k,v])=>text.replaceAll(`{${k}}`,v),translations.ja[key]);
  h.ctx.translations=translations;h.$('#captureStatusMessage').textContent='2 / 5 · Slide 3';
  const controller={abort(){throw Error('Language must not abort');}};h.ctx.state.videoAbortController=controller;h.ctx.state.slides=[{script:'literal narration'}];
  vm.runInContext(extract('translateLiveMessages'),h.ctx);h.ctx.translateLiveMessages('en');
  assert.equal(h.$('#captureStatusMessage').textContent,'2 / 5 · スライド 3');assert.equal(h.ctx.state.slides[0].script,'literal narration');assert.equal(h.ctx.state.videoAbortController,controller);
});
test('capture cancellation sends one stop request and preserves completed scene audio',()=>{
  let stops=0;
  const h=context({captureIsBusy:()=>true,cancelSpeech(){},stopDisplayStream(){stops++;},BrowserKittyUI:require('../components/ui-conventions.js')});
  h.$('#cancelCaptureButton').removeAttribute=()=>{};
  const audio=new Blob(['completed recording']);h.ctx.state.slides=[{recordingBlob:audio}];
  vm.runInContext(extract('cancelCapture'),h.ctx);h.ctx.cancelCapture();h.ctx.cancelCapture();
  assert.equal(stops,1);assert.equal(h.$('#cancelCaptureButton').disabled,true);assert.equal(h.ctx.state.slides[0].recordingBlob,audio);
});
test('MP4 cancellation immediately disables repeated requests while retaining the previous result',()=>{
  let aborted=0;
  const h=context({BrowserKittyUI:{setButtonState(button,state){button.disabled=state!=='ready';button.dataset.bkState=state;},text:key=>key}});
  const result=new Blob(['old MP4']);h.ctx.state.videoResultBlob=result;h.ctx.state.videoExportPhase='composing';h.ctx.state.videoAbortController={abort(){aborted++;}};
  vm.runInContext(extract('cancelVideo'),h.ctx);h.ctx.cancelVideo();h.ctx.cancelVideo();
  assert.equal(aborted,1);assert.equal(h.$('#cancelVideoButton').disabled,true);assert.equal(h.$('#cancelVideoButton').dataset.bkState,'stopping');assert.equal(h.ctx.state.videoResultBlob,result);
});
test('PVM v1 binary container round-trips unchanged source and narration bytes',async()=>{
  const h=context({APP_CONFIG:{version:'1.3.3'},saveCurrentScript(){},safeOutputBase:x=>x,narrationSource:s=>s.audioSource||'tts'});
  h.ctx.state.sourceFile=new File(['PPTX bytes'],'deck.pptx');h.ctx.state.sourceBuffer=new ArrayBuffer(1);h.ctx.state.selectedSlideIndex=0;h.ctx.state.slides=[{script:'日本語 script',audioSource:'mic',recordingBlob:new Blob(['recorded audio']),recordingMime:'audio/webm',recordingStatus:'success'}];
  const constants="const PROJECT_MAGIC_TEXT='PVMPRJ1\\n',PROJECT_SCHEMA='presentation-video-maker-project',PROJECT_SCHEMA_VERSION=1;";
  vm.runInContext(constants+['addProjectAsset','projectSlideData','createProjectBlob','projectAssetBlob','readProjectManifest'].map(extract).join('\n'),h.ctx);
  const blob=await h.ctx.createProjectBlob(),{manifest,payloadStart}=await h.ctx.readProjectManifest(blob);
  assert.equal(manifest.schemaVersion,1);assert.equal(manifest.slides[0].script,'日本語 script');assert.equal(manifest.slides[0].audioSource,'mic');
  assert.equal(await h.ctx.projectAssetBlob(blob,payloadStart,manifest.source.asset).text(),'PPTX bytes');
  assert.equal(await h.ctx.projectAssetBlob(blob,payloadStart,manifest.slides[0].recordingAsset).text(),'recorded audio');
});
test('all destructive confirmations use the app dialog with safe initial cancellation',()=>{
  assert.doesNotMatch(source,/(?<![\w.])confirm\(/);
  assert.match(source,/window\.AppConfirm = Object\.freeze/);
  assert.match(source,/cancelButton\.focus\(/);
  assert.match(source,/dialog\.addEventListener\('cancel'/);
});

function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
async function flush(){for(let n=0;n<30;n++)await Promise.resolve();}
function loadBusyPredicates(ctx){
  // The optional boundary lets this regression demonstrate the original missing guard.
  if(source.includes('function videoIsBusy('))vm.runInContext(extract('videoIsBusy'),ctx);
  vm.runInContext(extract('captureIsBusy')+'\n'+extract('projectOperationBusy'),ctx);
}
for(const rejection of ['oversize','load-false'])test(`project ${rejection} cannot overwrite current scripts or clear audio`,async()=>{
  let asked=0,parsed=0,loaded=0;
  const sourceBlob={size:rejection==='oversize'?150*1024*1024+1:12,arrayBuffer:async()=>new ArrayBuffer(1)};
  class FileBoundary{constructor(parts,name){this.name=name;this.size=parts[0].size;}arrayBuffer(){return sourceBlob.arrayBuffer();}}
  const h=context({File:FileBoundary,updateProjectButtons(){},updateProjectSaveStatus(){},setChip(){},
    readProjectManifest:async()=>({payloadStart:0,manifest:{slideCount:1,source:{name:'incoming.pptx',asset:{}},slides:[{script:'incoming script'}],settings:{}}}),
    projectAssetBlob:()=>sourceBlob,parsePptxBuffer:async()=>{parsed++;return {slides:[{}]};},confirmProjectChange:async()=>{asked++;return true;},
    projectBaseName:()=>'old',renderSlides(){},selectSlide(){},renderSceneRecordings(){},updateRecordingPlan(){},updateVideoExportState(){}});
  const audio=new Blob(['existing narration']),slide={script:'keep current script',recordingBlob:audio};
  h.ctx.state.slides=[slide];h.ctx.state.sourceFile={name:'keep.pptx'};
  loadBusyPredicates(h.ctx);
  vm.runInContext(extract('restoreProjectSlide')+'\n'+extract('loadPptx')+'\n'+extract('openProjectFile'),h.ctx);
  if(rejection==='load-false')h.ctx.loadPptx=async()=>{loaded++;return false;};
  await h.ctx.openProjectFile(new Blob(['project']));
  assert.equal(slide.script,'keep current script');assert.equal(slide.recordingBlob,audio);assert.equal(h.ctx.state.sourceFile.name,'keep.pptx');
  assert.equal(asked,rejection==='oversize'?0:1);assert.equal(parsed,rejection==='oversize'?0:1);assert.equal(loaded,rejection==='oversize'?0:1);
});
test('capture stays busy through asynchronous monitor cleanup and cannot stop a newer stream',async()=>{
  const cleanup=deferred();let shares=0,closing=false,streamStops=0;
  const h=context({navigator:{mediaDevices:{getDisplayMedia:async()=>{shares++;return {getVideoTracks:()=>[{getSettings:()=>({displaySurface:'monitor'})}],getAudioTracks:()=>[{label:'audio'}]};}}},
    MediaStream:class {},performance:{now:()=>0},isSmartphoneMode:()=>false,saveCurrentScript(){},recordableSceneIndexes:()=>[0],voiceForScene:()=>({}),createCaptureJob:()=>({}),
    stopDisplayStream(){streamStops++;h.ctx.state.displayStream=null;},setCaptureMetrics(){},setCaptureProgress(){},chooseRecordingMime:()=>'',
    createSignalMonitor:async()=>({close(){closing=true;return cleanup.promise;}}),runPreflight:async()=>{throw Error('CAPTURE_CANCELLED');},
    cancelSpeech(){},renderSceneRecordings(){},refreshCaptureReady(){},updateProjectButtons(){},setChip(){}});
  h.ctx.state.slides=[{script:'keep'}];h.ctx.state.voices=[];h.ctx.state.captureRunId=0;
  loadBusyPredicates(h.ctx);vm.runInContext(extract('setCapturePhase')+'\n'+extract('runBatchCapture'),h.ctx);
  const run=h.ctx.runBatchCapture();await flush();assert.equal(closing,true);
  let retry;try{
    assert.equal(h.ctx.captureIsBusy(),true,'cleanup must still own capture readiness');
    assert.equal(h.ctx.projectOperationBusy(),true);retry=h.ctx.runBatchCapture();await flush();assert.equal(shares,1);
  }finally{cleanup.resolve();await run;if(retry)await retry;}
  assert.equal(h.ctx.captureIsBusy(),false);assert.equal(streamStops,2);
});
test('video cleanup keeps restart disabled through AudioContext close and wake-lock release',async()=>{
  const audioCleanup=deferred(),wakeCleanup=deferred();let contexts=0,closing=false,releasing=false;
  class AudioBoundary{constructor(){contexts++;this.state='running';}close(){closing=true;return audioCleanup.promise;}}
  const h=context({BrowserKittyUI:require('../components/ui-conventions.js'),AbortController,window:{AudioContext:AudioBoundary,MediaRecorder:function(){},BrowserFFmpeg:{}},HTMLCanvasElement:{prototype:{captureStream(){}}},DecompressionStream:function(){},
    PVM_PERFORMANCE:{mode:'fast'},videoValidation:()=>({ready:true,indexes:[0]}),outputDimensions:()=>({width:1280,height:720}),markVideoResultStale(){},
    performanceReportStart:()=>({details:{}}),performanceStageStart:()=>0,performanceStageEnd(){},performanceReportFinish(){},setVideoProgress(){},
    acquireVideoWakeLock:async()=>{},fastExportCapability:async()=>({}),createVideoFast:async()=>{const e=Error('cancelled');e.name='AbortError';throw e;},
    releaseVideoWakeLock:async()=>{releasing=true;await wakeCleanup.promise;},isSmartphoneMode:()=>false,
    updateSubtitlePreview(){},updateMobileResolutionWarning(){},videoEstimatedSeconds:()=>1,formatClock:String,renderVideoTimeline(){},setVideoExportChip(){},updateMobileNavIndicators(){}});
  loadBusyPredicates(h.ctx);vm.runInContext(['setVideoPhase','updateVideoExportState','createVideo'].map(extract).join('\n'),h.ctx);
  const run=h.ctx.createVideo();await flush();assert.equal(closing,true);const owner=h.ctx.state.videoAbortController;
  try{
    h.ctx.updateVideoExportState();assert.equal(h.$('#createVideoButton').disabled,true,'language-style rerender must not enable restart');
    assert.equal(h.ctx.projectOperationBusy(),true);await h.ctx.createVideo();assert.equal(contexts,1);assert.equal(h.ctx.state.videoAbortController,owner);
    audioCleanup.resolve();await flush();assert.equal(releasing,true);h.ctx.updateVideoExportState();assert.equal(h.$('#createVideoButton').disabled,true);assert.equal(h.ctx.state.videoAbortController,owner);
  }finally{audioCleanup.resolve();wakeCleanup.resolve();await run;}
  assert.equal(h.ctx.projectOperationBusy(),false);assert.equal(h.ctx.state.videoAbortController,null);assert.equal(h.$('#createVideoButton').disabled,false);
});

test('microphone stop keeps restart disabled until audio metadata finishes',async()=>{
  const metadata=deferred();let requests=0;
  class Recorder{constructor(){this.mimeType='audio/webm';this.state='inactive';}start(){this.state='recording';}stop(){this.state='inactive';}}
  const h=context({BrowserKittyUI:require('../components/ui-conventions.js'),window:{MediaRecorder:Recorder},MediaRecorder:Recorder,
    navigator:{mediaDevices:{getUserMedia:async()=>{requests++;return {};}}},performance:{now:()=>1000},
    saveCurrentScript(){},confirmProjectChange:async()=>true,chooseRecordingMime:()=>'',updateProjectSaveStatus(){},
    updateNarrationSourceUI(){},renderSceneRecordings(){},stopMicStream(){},audioBlobDuration:()=>metadata.promise,
    markVideoResultStale(){},updateRecordingPlan(){},updateVideoExportState(){},updateSceneEditor(){}});
  const old=new Blob(['previous audio']),slide={audioSource:'mic',recordingSource:'mic',recordingStatus:'success',recordingBlob:old};
  Object.assign(h.ctx.state,{sourceFile:{name:'deck.pptx'},sourceBuffer:new ArrayBuffer(1),selectedSlideIndex:0,slides:[slide]});
  loadBusyPredicates(h.ctx);vm.runInContext(['updateProjectButtons','startMicRecording','stopMicRecording','commitSceneAudio'].map(extract).join('\n'),h.ctx);
  await h.ctx.startMicRecording();const recorder=h.ctx.state.micRecorder;
  recorder.ondataavailable({data:new Blob(['replacement audio'])});h.ctx.stopMicRecording();const cleanup=recorder.onstop();await flush();
  try{
    assert.equal(h.ctx.state.micPending,true);assert.equal(slide.recordingBlob,old);
    assert.equal(h.$('#startMicRecordingButton').disabled,true,'audio metadata cleanup must keep the native button disabled');
    await h.ctx.startMicRecording();assert.equal(requests,1);
  }finally{metadata.resolve(.8);await cleanup;}
  assert.equal(h.ctx.state.micPending,false);assert.equal(h.$('#startMicRecordingButton').disabled,false);
  assert.equal(slide.recordingStatus,'success');assert.equal(await slide.recordingBlob.text(),'replacement audio');
});

test('invalid project feedback persists beside manual retention and follows language changes',async()=>{
  const h=context({BrowserKittyUI:require('../components/ui-conventions.js'),updateProjectButtons(){},readProjectManifest:async()=>{throw Error('PROJECT_MAGIC');}});
  h.ctx.state.slides=[{script:'keep'}];h.ctx.t=key=>translations[h.ctx.language][key];loadBusyPredicates(h.ctx);
  vm.runInContext(['updateProjectSaveStatus','openProjectFile'].map(extract).join('\n'),h.ctx);
  await h.ctx.openProjectFile(new Blob(['invalid']));h.ctx.updateProjectSaveStatus();
  assert.equal(h.$('#projectOpenFeedback').hidden,false);assert.match(h.$('#projectOpenFeedback').textContent,/another|different/);assert.match(h.$('#projectSaveStatus').textContent,/not saved automatically/);
  h.ctx.language='ja';h.ctx.updateProjectSaveStatus();assert.match(h.$('#projectOpenFeedback').textContent,/別の|正しい/);assert.equal(h.ctx.state.slides[0].script,'keep');
});

function sourceImportContext(extra={}){
  const h=context({updateProjectButtons(){},refreshCaptureReady(){},updateVideoExportState(){},updateMobileResolutionWarning(){},updateWorkflowNavIndicators(){},
    bytesLabel:String,format:key=>key,isSmartphoneMode:()=>false,safeOutputBase:x=>x,buildHighFidelityPresentation:async()=>true,
    setChip(){},renderSlides(){},selectSlide(){},updateDeckSummary(){},renderSceneRecordings(){},updateRecordingPlan(){},setWorkflowNavCollapsed(){},innerWidth:1024,...extra});
  loadBusyPredicates(h.ctx);vm.runInContext(extract('loadPptx'),h.ctx);return h;
}
test('standalone source parsing reserves project readiness against capture, export and save',async()=>{
  const parsing=deferred();let parsed=false,saveCalls=0,invalidations=0;
  const h=sourceImportContext({parsePptxBuffer:async()=>{parsed=true;return parsing.promise;},confirmProjectChange:async()=>false,
    invalidateSource(){invalidations++;},videoValidation:()=>({ready:true,indexes:[0]}),createProjectBlob:async()=>{saveCalls++;return new Blob();}});
  const source={name:'keep.pptx'},slide={script:'keep narration'},output=new Blob(['keep MP4']);
  h.ctx.state.sourceFile=source;h.ctx.state.slides=[slide];h.ctx.state.videoResultBlob=output;
  vm.runInContext(['runBatchCapture','createVideo','saveProject'].map(extract).join('\n'),h.ctx);
  const loading=h.ctx.loadPptx(new File(['next'],'next.pptx'));await flush();assert.equal(parsed,true);
  try{
    assert.equal(h.ctx.projectOperationBusy(),true,'parsing itself must reserve readiness');
    await h.ctx.runBatchCapture();await h.ctx.createVideo();await h.ctx.saveProject();assert.equal(saveCalls,0);
  }finally{parsing.resolve({slides:[{notesText:''}]});await loading;}
  assert.equal(invalidations,0);assert.equal(h.ctx.state.sourceFile,source);assert.equal(h.ctx.state.slides[0],slide);assert.equal(h.ctx.state.videoResultBlob,output);assert.equal(h.ctx.projectOperationBusy(),false);
});
for(const conflict of ['capture','new-owner'])test(`source parse rechecks ${conflict} ownership before replacement`,async()=>{
  const parsing=deferred();let invalidations=0,asked=0;
  const h=sourceImportContext({parsePptxBuffer:async()=>parsing.promise,confirmProjectChange:async()=>{asked++;return true;},invalidateSource(){invalidations++;}});
  const source={name:'keep.pptx'},slide={script:'keep narration'},output=new Blob(['keep MP4']);h.ctx.state.sourceFile=source;h.ctx.state.slides=[slide];h.ctx.state.videoResultBlob=output;
  const loading=h.ctx.loadPptx(new File(['next'],'next.pptx'));await flush();const newerOwner={id:'newer'};
  if(conflict==='capture'){h.ctx.state.captureActive=true;h.ctx.state.capturePhase='recording';}else h.ctx.state.sourceImportOperation=newerOwner;
  parsing.resolve({slides:[{notesText:''}]});assert.equal(await loading,false);assert.equal(asked,0);assert.equal(invalidations,0);
  assert.equal(h.ctx.state.sourceFile,source);assert.equal(h.ctx.state.slides[0],slide);assert.equal(h.ctx.state.videoResultBlob,output);
  if(conflict==='new-owner')assert.equal(h.ctx.state.sourceImportOperation,newerOwner,'old cleanup cannot release a newer import reservation');
});
test('prepared project source import can own its reservation while projectBusy remains set',async()=>{
  const h=sourceImportContext();h.ctx.state.projectBusy=true;h.ctx.invalidateSource=()=>{h.ctx.state.sourceGeneration++;};
  const file=new File(['project PPTX'],'project.pptx'),buffer=new ArrayBuffer(1),slides=[{notesText:'',script:'project narration'}];
  assert.equal(await h.ctx.loadPptx(file,{prepared:{buffer,parsed:{slides}},replaceConfirmed:true}),true);
  assert.equal(h.ctx.state.sourceFile,file);assert.equal(h.ctx.state.slides[0],slides[0]);assert.equal(h.ctx.state.projectBusy,true);assert.equal(h.ctx.state.sourceImportOperation,null);
});
