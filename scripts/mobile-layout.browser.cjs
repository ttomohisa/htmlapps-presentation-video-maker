'use strict';
// Focused native layout test. Only synthetic data; no clipboard/camera/permission use.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const cfg={"slug": "presentation-video-maker", "bp": 600, "nav": "#workflowNav"};
const evidence=path.resolve('test-results/mobile-layout');
async function bounds(locator,width,height,label,vertical=true){const r=await locator.boundingBox();assert.ok(r&&r.x>=-1&&r.x+r.width<=width+1&&(!vertical||(r.y>=-1&&r.y+r.height<=height+1)),label+': bounds '+JSON.stringify(r));}
async function checkHelpGuide(page,language){
  const title=language==='ja'?'使い方と注意事項':'How to use & notes';
  const dialog=page.getByRole('dialog',{name:title,exact:true});
  assert.equal(await dialog.locator('.help-steps > li').count(),3);
  assert.match(await dialog.locator('.help-save').innerText(),/\.pvm/);
  const topic=dialog.locator('details').filter({has:page.locator('[data-i18n="helpEditTitle"]')});
  const instructions=topic.locator('[data-i18n="helpEditText"]');
  assert.equal(await instructions.isVisible(),false);
  await topic.locator('summary').focus();
  await page.keyboard.press('Enter');
  assert.match(await instructions.innerText(),language==='ja'?/このスライドの音声を更新/:/Update audio for this slide/);
  assert.equal(await instructions.isVisible(),true);
  await page.keyboard.press('Enter');
  assert.equal(await instructions.isVisible(),false);
}
async function checkHelpScroll(page,label){
  const dialog=page.locator('#helpDialog'), body=dialog.locator('.help-body'), head=dialog.locator('.help-head');
  const outer=await dialog.evaluate(el=>({client:el.clientHeight,content:el.scrollHeight,overflow:getComputedStyle(el).overflowY}));
  assert.equal(outer.content,outer.client,label+': Help frame has no scrollable overflow');
  assert.equal(outer.overflow,'clip',label+': only the Help body can scroll');
  if(await body.evaluate(el=>el.scrollHeight>el.clientHeight)){
    const before=await head.boundingBox();
    await body.hover();
    await page.mouse.wheel(0,240);
    await page.waitForFunction(()=>document.querySelector('#helpDialog .help-body').scrollTop>0);
    assert.deepEqual(await head.boundingBox(),before,label+': Help header stays fixed');
    assert.equal(await dialog.evaluate(el=>el.scrollTop),0,label+': body wheel never moves Help frame');
  }
}
async function main(){fs.mkdirSync(evidence,{recursive:true});const browser=await chromium.launch();
try{const cases=[];for(const language of ['ja','en'])for(const [width,height]of [[1360,900],[cfg.bp+1,568],[cfg.bp,568],[320,568],[393,252]])cases.push({file:'dist/index.html',language,width,height});cases.push({file:'dist/index.self-extract.html',language:'en',width:360,height:640},{file:cfg.slug+'.html',language:'ja',width:1360,height:900});
for(const {file,language,width,height}of cases){const context=await browser.newContext({viewport:{width,height},locale:language,reducedMotion:'reduce'}),page=await context.newPage(),errors=[],requests=[],label=`${file} ${language} ${width}x${height}`;
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
try{await page.goto(pathToFileURL(path.resolve(file)).href);await page.locator('#helpButton').waitFor();
await page.waitForFunction(()=>/^\d+\.\d+\.\d+$/.test(document.querySelector('#buildVersion').textContent));
if(await page.locator('html').getAttribute('lang')!==language)await page.locator('#languageButton').click();
const intro=page.locator('.page-intro'),badge=intro.locator('.local-badge');
assert.equal(await intro.getByRole('heading').count(),0,label+': introduction has no heading');
assert.equal(await intro.locator('p').textContent(),language==='ja'?'PowerPointからナレーション付きMP4を作れます。':'Turn PowerPoint slides into a narrated MP4.');
await bounds(intro.locator('p'),width,height,label,false);
assert.equal((await badge.locator('[data-i18n="localBadge"]').textContent()).trim(),language==='ja'?'完全ローカル処理':'Fully local processing');
const resume=page.getByRole('button',{name:language==='ja'?'保存した作業を開く（.pvm）':'Open saved work (.pvm)',exact:true});
assert.ok((await resume.boundingBox()).height>=44,label+': saved work button has a touch target');
assert.equal(await badge.isVisible(),width>cfg.bp,label+': local processing badge visibility');
if(await badge.isVisible()){
  await bounds(badge,width,height,label);
  const [description,mark,drop]=await Promise.all([intro.locator('p').boundingBox(),badge.boundingBox(),page.locator('#dropZone').boundingBox()]);
  assert.ok(description.x+description.width<=mark.x&&Math.abs(description.y+description.height/2-mark.y-mark.height/2)<2,label+': badge beside description');
  assert.ok(mark.y+mark.height<=drop.y&&Math.abs(mark.x+mark.width-drop.x-drop.width)<=3,label+': badge above right edge of drop zone');
}
assert.equal(await page.locator('main > footer.footer').isVisible(),width>cfg.bp,label+': informational footer');

if(cfg.nav&&file!==cfg.slug+'.html')assert.equal(await page.locator(cfg.nav).isVisible(),false,label+': navigation starts after opening a deck');
for(const w of [cfg.bp+1,cfg.bp,width]){await page.setViewportSize({width:w,height});assert.equal(await page.locator('main > footer.footer').isVisible(),w>cfg.bp,label+': footer resize');assert.equal(await badge.isVisible(),w>cfg.bp,label+': badge resize');}
await page.evaluate(()=>scrollTo({left:0,top:0,behavior:'instant'}));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+': page width');
await page.locator('#helpButton').click();const body=page.locator('#helpDialog .help-body'),scroll=page.locator('#helpDialog .help-body');const final=page.locator('#helpDialog #buildVersion');assert.equal(await page.locator('#buildVersion').count(),1);assert.equal(await page.locator('main #buildVersion').count(),0);assert.match(await page.locator('#builtAt').textContent(),/^\d{4}-/);await scroll.evaluate(e=>{e.scrollTop=e.scrollHeight;});const last=await body.locator('.help-build').evaluate(el=>{const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node,last;while(node=walker.nextNode())if(node.textContent.trim())last=node;const range=document.createRange();range.setStart(last,last.textContent.trimEnd().length-1);range.setEnd(last,last.textContent.trimEnd().length);const r=range.getBoundingClientRect();let top=0,bottom=innerHeight;for(let p=el.parentElement;p;p=p.parentElement)if(/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflowY)){const b=p.getBoundingClientRect();top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom);}return{top:r.top,bottom:r.bottom,clipTop:top,clipBottom:bottom};});assert.ok(last.top>=last.clipTop-1&&last.bottom<=last.clipBottom+1,label+': Help end '+JSON.stringify(last));assert.ok(await body.evaluate(e=>e.scrollWidth<=e.clientWidth+1),label+': Help width');await bounds(page.locator('#helpDialog .help-head'),width,height,label);await bounds(page.locator('#helpDialog .help-head h2'),width,height,label);await bounds(page.locator('#closeHelpButton'),width,height,label);
await checkHelpGuide(page,language);
await body.evaluate(el=>{el.scrollTop=0;});
if(file==='dist/index.html'&&[1360,320].includes(width)){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({path:path.join(evidence,`${language}-${width}.png`)});}
await checkHelpScroll(page,label);
const box=await page.locator('#helpDialog').boundingBox(),point=[[1,1],[width-1,1],[1,height-1],[width-1,height-1]].find(([x,y])=>x<box.x||x>box.x+box.width||y<box.y||y>box.y+box.height);assert.ok(point,label+': genuine backdrop');const y=await page.evaluate(()=>scrollY);await page.mouse.move(...point);await page.mouse.wheel(0,400);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>scrollY),y,label+': background locked');
await page.mouse.click(...point);
assert.equal(await page.locator('#helpDialog').isVisible(),false,label+': backdrop click closes Help');
await page.locator('#helpButton').click();
await page.keyboard.press('Escape');assert.equal(await page.locator('#helpDialog').isVisible(),false);await page.locator('#languageButton').click();await page.locator('#languageButton').click();assert.equal(await page.locator('#buildVersion').count(),1);assert.match(await page.locator('#builtAt').textContent(),/^\d{4}-/);await page.locator('#helpButton').click();await page.locator('#closeHelpButton').click();assert.equal(await page.locator('#helpDialog').isVisible(),false);
if(file==='dist/index.html'){
await page.locator('#pptxInput').setInputFiles(path.resolve('test-data/presentation-video-maker-30-slides-long-content.pptx'));
await page.locator('#guideNarrationHeading').waitFor({timeout:30000});
assert.equal(await badge.isVisible(),false,label+': badge hidden after loading a deck');
assert.equal(await page.locator('[aria-current="step"]').getAttribute('data-guide-step'),'script');
assert.equal(await page.locator('[data-guide-page]:visible').count(),1);
assert.equal(await page.locator('#slideList button').count(),30);
if(width<=cfg.bp) {
  await page.locator('#guideSlides > summary').click();
  await page.locator('#guidePreview > summary').click();
}
await page.waitForFunction(()=>{
  const mount=document.querySelector('#slideList [data-thumb-index="0"]');
  return mount?.clientWidth>=54 && mount.querySelector('.pptx-render-frame,.fallback-slide')?.getBoundingClientRect().width>=50;
});
assert.match(await page.locator('#guideModelSetup').innerText(),language==='ja'?/Hugging Face\(外部サイト\)/:/Hugging Face \(external site\)/);
assert.equal(await page.locator('[data-model-file="model_quantized.onnx"] button').innerText(),language==='ja'?'保存したファイルを選ぶ':'Choose saved file');
const modelRow=page.locator('[data-model-file="model_quantized.onnx"]');
const picker=modelRow.getByRole('button',{name:language==='ja'?'保存したファイルを選ぶ（共通モデル）':'Choose saved file (shared model)',exact:true});
const [pick,download]=await Promise.all([picker.boundingBox(),modelRow.getByRole('link').boundingBox()]);
assert.ok(pick.height>=44&&download.height>=44,label+': both file actions have touch targets');
assert.ok(pick.x>=download.x+download.width||pick.y>=download.y+download.height||download.x>=pick.x+pick.width,label+': file actions do not overlap');
if(width===320){
  const choosing=page.waitForEvent('filechooser');
  await picker.locator('svg').click();
  const chooser=await choosing;
  assert.equal(await chooser.element().getAttribute('data-local-file'),'model_quantized.onnx');
  await chooser.setFiles([]);
}
await page.waitForFunction(()=>{
  const frame=document.querySelector('#slidePreviewMount .pptx-render-frame,#slidePreviewMount .fallback-slide');
  return frame?.getBoundingClientRect().width>70;
});
await page.locator('#slideList button').nth(1).click();
assert.match(await page.locator('#selectedSlideLabel').innerText(),/2$/);
if(width<=cfg.bp) {
  assert.equal(await page.locator('#guideSlides').evaluate(el=>el.open),false);
  assert.equal(await page.locator('#guideSlideHeader').evaluate(el=>el===document.activeElement),true);
}
await page.locator('#prevSceneButton').click();
assert.match(await page.locator('#selectedSlideLabel').innerText(),/1$/);
await bounds(page.locator('#workflowNav'),width,height,label,false);
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+': loaded page width');
await page.locator('[data-guide-step="output"]').click();
assert.equal(await badge.isVisible(),false,label+': badge hidden during export');
assert.equal(await page.locator('summary[data-i18n="guideFinishing"]').innerText(),language==='ja'?'字幕・BGM・切り替え':'Subtitles, music and transitions');
assert.equal(await page.locator('[data-guide-page]:visible').count(),1);
await page.locator('#guideVideoIssue').click();
assert.equal(await page.locator('[aria-current="step"]').getAttribute('data-guide-step'),'script');
assert.equal(await page.locator('[data-model-file="model_quantized.onnx"] [data-load-local-file]').evaluate(el=>el===document.activeElement),true);
await page.locator('[data-guide-step="slides"]').click();
assert.equal(await badge.isVisible(),false,label+': badge stays hidden on returning to the loaded deck');
if(language==='ja'&&width===1360){
  const saved=page.waitForEvent('download');
  await page.locator('#saveProjectButton').click();
  const project=await saved;
  await page.reload();
  await badge.waitFor({state:'visible'});
  await page.locator('#projectInput').setInputFiles({name:project.suggestedFilename(),mimeType:'application/octet-stream',buffer:fs.readFileSync(await project.path())});
  await page.locator('#guideNarrationHeading').waitFor();
  await page.locator('[data-guide-step="slides"]').click();
  assert.equal(await badge.isVisible(),false,label+': badge stays hidden for a restored project');
}
}
assert.deepEqual(errors,[],label+': console errors');assert.deepEqual(requests,[],label+': runtime requests');console.log('PASS '+label);
}catch(e){await page.screenshot({path:path.join(evidence,'failure.png')}).catch(()=>{});throw new Error(label+': '+e.message,{cause:e});}finally{await context.close();}}
}finally{await browser.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
