'use strict';
// Focused native layout test. Only synthetic data; no clipboard/camera/permission use.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url'),{chromium}=require('playwright');
const cfg={"slug": "presentation-video-maker", "bp": 600, "nav": "#workflowNav"};
const evidence=path.resolve('test-results/mobile-layout');
async function bounds(locator,width,height,label,vertical=true){const r=await locator.boundingBox();assert.ok(r&&r.x>=-1&&r.x+r.width<=width+1&&(!vertical||(r.y>=-1&&r.y+r.height<=height+1)),label+': bounds '+JSON.stringify(r));}
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
assert.equal(await badge.isVisible(),width>cfg.bp,label+': local processing badge visibility');
if(await badge.isVisible())await bounds(badge,width,height,label,false);
assert.equal(await page.locator('main > footer.footer').isVisible(),width>cfg.bp,label+': informational footer');

if(cfg.nav&&file!==cfg.slug+'.html')assert.equal(await page.locator(cfg.nav).isVisible(),false,label+': navigation starts after opening a deck');
for(const w of [cfg.bp+1,cfg.bp,width]){await page.setViewportSize({width:w,height});assert.equal(await page.locator('main > footer.footer').isVisible(),w>cfg.bp,label+': footer resize');assert.equal(await badge.isVisible(),w>cfg.bp,label+': badge resize');}
await page.evaluate(()=>scrollTo({left:0,top:0,behavior:'instant'}));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),label+': page width');
await page.locator('#helpButton').click();const body=page.locator('#helpDialog .help-body'),scroll=page.locator('#helpDialog .help-body');const final=page.locator('#helpDialog #buildVersion');assert.equal(await page.locator('#buildVersion').count(),1);assert.equal(await page.locator('main #buildVersion').count(),0);assert.match(await page.locator('#builtAt').textContent(),/^\d{4}-/);await scroll.evaluate(e=>{e.scrollTop=e.scrollHeight;});const last=await body.locator('.help-build').evaluate(el=>{const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node,last;while(node=walker.nextNode())if(node.textContent.trim())last=node;const range=document.createRange();range.setStart(last,last.textContent.trimEnd().length-1);range.setEnd(last,last.textContent.trimEnd().length);const r=range.getBoundingClientRect();let top=0,bottom=innerHeight;for(let p=el.parentElement;p;p=p.parentElement)if(/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflowY)){const b=p.getBoundingClientRect();top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom);}return{top:r.top,bottom:r.bottom,clipTop:top,clipBottom:bottom};});assert.ok(last.top>=last.clipTop-1&&last.bottom<=last.clipBottom+1,label+': Help end '+JSON.stringify(last));assert.ok(await body.evaluate(e=>e.scrollWidth<=e.clientWidth+1),label+': Help width');await bounds(page.locator('#helpDialog .help-head'),width,height,label);await bounds(page.locator('#helpDialog .help-head h2'),width,height,label);await bounds(page.locator('#closeHelpButton'),width,height,label);
await body.evaluate(el=>{el.scrollTop=0;});
await checkHelpScroll(page,label);
if(file==='dist/index.html'&&[1360,320].includes(width)){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));await page.screenshot({path:path.join(evidence,`${language}-${width}.png`)});}
const box=await page.locator('#helpDialog').boundingBox(),point=[[1,1],[width-1,1],[1,height-1],[width-1,height-1]].find(([x,y])=>x<box.x||x>box.x+box.width||y<box.y||y>box.y+box.height);assert.ok(point,label+': genuine backdrop');const y=await page.evaluate(()=>scrollY);await page.mouse.move(...point);await page.mouse.wheel(0,400);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>scrollY),y,label+': background locked');
await page.keyboard.press('Escape');assert.equal(await page.locator('#helpDialog').isVisible(),false);await page.locator('#languageButton').click();await page.locator('#languageButton').click();assert.equal(await page.locator('#buildVersion').count(),1);assert.match(await page.locator('#builtAt').textContent(),/^\d{4}-/);await page.locator('#helpButton').click();await page.locator('#closeHelpButton').click();assert.equal(await page.locator('#helpDialog').isVisible(),false);
if(file==='dist/index.html'){
await page.locator('#pptxInput').setInputFiles(path.resolve('test-data/presentation-video-maker-30-slides-long-content.pptx'));
await page.locator('#guideNarrationHeading').waitFor({timeout:30000});
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
assert.equal(await page.locator('[data-guide-page]:visible').count(),1);
await page.locator('#guideVideoIssue').click();
assert.equal(await page.locator('[aria-current="step"]').getAttribute('data-guide-step'),'script');
assert.equal(await page.locator('[data-model-file="model_quantized.onnx"] [data-load-local-file]').evaluate(el=>el===document.activeElement),true);
}
assert.deepEqual(errors,[],label+': console errors');assert.deepEqual(requests,[],label+': runtime requests');console.log('PASS '+label);
}catch(e){await page.screenshot({path:path.join(evidence,'failure.png')}).catch(()=>{});throw new Error(label+': '+e.message,{cause:e});}finally{await context.close();}}
}finally{await browser.close();}}
main().catch(e=>{console.error(e);process.exitCode=1;});
