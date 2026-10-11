// Static source/artifact guards. Native wheel, focus and viewport checks remain browser tests.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(process.env.PVM_TEST_HTML || path.join(__dirname, '../src/index.template.html'), 'utf8');
const css = source.match(/<style>([\s\S]*?)<\/style>/)[1].replace(/\/\*[\s\S]*?\*\//g, '');
const translations = JSON.parse(source.match(/const translations = (\{[^\n]+\});/)[1]);
const rules = Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g), match => ({
  selectors: match[1].split(',').map(selector => selector.trim()),
  declarations: Object.fromEntries(match[2].split(';').filter(part => part.includes(':')).map(part => {
    const colon = part.indexOf(':');
    return [part.slice(0, colon).trim(), part.slice(colon + 1).trim()];
  }))
}));
function declarationsFor(selector) {
  return Object.assign({}, ...rules.filter(rule => rule.selectors.includes(selector)).map(rule => rule.declarations));
}

for (const element of ['html', 'body']) {
  test(`${element} locks background scrolling only while a native dialog is modal`, () => {
    const declaration = declarationsFor(`${element}:has(dialog:modal)`);
    assert.equal(declaration.overflow, 'hidden', `${element} needs a native-modal overflow lock`);
    assert.equal(declaration['overscroll-behavior'], 'none', `${element} must not chain modal-edge scrolling`);
    assert.notEqual(declarationsFor(element).overflow, 'hidden', 'ordinary page scrolling must remain available');
  });
}

test('Help retains its grid header/body shell and viewport-bounded internal scrolling', () => {
  assert.match(source, /<dialog\b[^>]*id="helpDialog"/);
  const shell = declarationsFor('.help-shell');
  assert.equal(shell.display, 'grid');
  assert.equal(shell['grid-template-rows'], 'auto minmax(0,1fr)');
  assert.ok(rules.some(rule => rule.selectors.includes('.help-shell') && rule.declarations['max-height'] === 'min(82vh,760px)'));
  assert.equal(shell['max-height'], 'calc(100dvh - 18px)');
  assert.equal(declarationsFor('.help-body').overflow, 'auto');
  assert.match(source, /class="help-head"[\s\S]*?id="closeHelpButton"[\s\S]*?<div class="help-body">/);
  assert.match(source, /data-i18n="helpSubtitlePreviewText"[\s\S]*?<!-- APP:HELP:END -->/);
});

test('Help continues using native showModal, Close and geometric backdrop dismissal', () => {
  assert.match(source, /\$\('#helpButton'\)\.addEventListener\('click',\(\)=>helpDialog\.showModal\(\)\)/);
  assert.match(source, /\$\('#closeHelpButton'\)\.addEventListener\('click',\(\)=>helpDialog\.close\(\)\)/);
  assert.match(source, /if\(event\.clientX<rect\.left\|\|event\.clientX>rect\.right\|\|event\.clientY<rect\.top\|\|event\.clientY>rect\.bottom\) helpDialog\.close\(\)/);
  assert.doesNotMatch(source, /helpDialog\.addEventListener\(['"]cancel['"]/);
});

test('the existing local-processing badge keeps its decorative shield and labels', () => {
  const badge = source.match(/<span class="local-badge">([\s\S]*?)<span data-i18n="localBadge">/)[1];
  assert.match(badge, /aria-hidden="true"/);
  assert.match(badge, /M12 3 5 6v5c0 4\.6 2\.8 8\.2 7 10 4\.2-1\.8 7-5\.4 7-10V6l-7-3Z/);
  assert.equal(translations.ja.localBadge, '完全ローカル処理');
  assert.equal(translations.en.localBadge, 'Fully local processing');
});

test('Help omits implementation commentary and retains user instructions', () => {
  assert.match(source, /<!-- APP:HELP:BEGIN -->[\s\S]*?data-i18n="helpDialogText"[\s\S]*?<!-- APP:HELP:END -->/);
  assert.doesNotMatch(translations.ja.helpDialogText || '', /背景ページ.*スクロールしません/);
  assert.match(translations.ja.helpDialogText || '', /閉じるボタン.*Esc.*枠外/);
  assert.doesNotMatch(translations.en.helpDialogText || '', /background page does not scroll/);
  assert.match(translations.en.helpDialogText || '', /Close button.*Esc.*outside/);
});
