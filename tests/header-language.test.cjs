// Exercise the production language updater; unrelated render/media boundaries are doubles.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(process.env.PVM_TEST_HTML || path.join(__dirname, '../src/index.template.html'), 'utf8');
const translations = JSON.parse(source.match(/const translations = (\{[^\n]+\});/)[1]);
const updater = source.slice(source.indexOf('      function applyLanguage(){'), source.indexOf('      function setChip('));
function harness() {
  const controls = new Map();
  function $(selector) {
    if (!controls.has(selector)) {
      const markup = source.match(new RegExp('<[^>]*id="' + selector.slice(1) + '"[^>]*>'))?.[0] || '';
      const attrs = Object.fromEntries(Array.from(markup.matchAll(/([\w-]+)="([^"]*)"/g), m => [m[1],m[2]]));
      const dataset = Object.fromEntries(Object.entries(attrs).filter(([k])=>k.startsWith('data-')).map(([k,v])=>[k.slice(5).replace(/-([a-z])/g, (_,c)=>c.toUpperCase()),v]));
      controls.set(selector, {attrs,dataset,textContent:'',setAttribute(k,v){attrs[k]=String(v);},getAttribute(k){return attrs[k];}});
    }
    return controls.get(selector);
  }
  const help = $('#helpButton');
  const ctx = vm.createContext({language:'ja', state:{selectedSlideIndex:-1,slides:[{script:'Keep narration',enabled:true}],bgmName:'local.wav'},
    APP_CONFIG:{name:'Presentation Video Maker',nameJa:'Presentation Video Maker'}, document:{documentElement:{}}, $,
    $$:selector=>selector==='[data-i18n-aria-label]'?[help]:selector==='[data-i18n-title]' && help.dataset.i18nTitle?[help]:[],
    t:key=>translations[ctx.language][key]});
  for (const name of ['renderSlides','updateSceneEditor','updateCompatibility','renderSelectedSlide','setRendererState','updateDeckSummary','renderSceneRecordings','updateRecordingPlan','refreshVoices','applyDeviceUi','refreshCaptureReady','updateVideoExportState','updateWorkflowNavIndicators']) ctx[name]=()=>{};
  vm.runInContext(updater,ctx,{timeout:1000});
  return {ctx,$};
}
for(const language of ['ja','en']) {
  test(`${language} uses compact target language and localized accessible name and title`,()=>{
    const {ctx,$}=harness();ctx.language=language;ctx.applyLanguage();
    const expected=language==='ja'?'英語に切り替え':'Switch to Japanese';
    assert.equal($('#languageButton').textContent,language==='ja'?'EN':'JA');
    assert.equal($('#languageButton').getAttribute('aria-label'),expected);
    assert.equal($('#languageButton').getAttribute('title'),expected);
    assert.equal(ctx.document.documentElement.lang,language);
  });
  test(`${language} localizes Help name and tooltip without changing its icon`,()=>{
    const {ctx,$}=harness();ctx.language=language;ctx.applyLanguage();
    assert.equal($('#helpButton').getAttribute('aria-label'),translations[language].help);
    assert.equal($('#helpButton').getAttribute('title'),translations[language].help);
    assert.equal($('#helpButton').textContent,'');
  });
}
test('repeated language updates preserve scene data and local privacy translations',()=>{
  const {ctx}=harness(); const before=JSON.stringify(ctx.state);
  for(const language of ['ja','en','ja','en']) {ctx.language=language;ctx.applyLanguage();assert.equal(JSON.stringify(ctx.state),before);}
  assert.equal(translations.ja.localBadge,'完全ローカル処理');
  assert.equal(translations.en.localBadge,'Fully local processing');
});
