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

test('Help has a viewport-bounded grid with the body as its only scroll container', () => {
  assert.match(source, /<dialog\b[^>]*id="helpDialog"/);
  const shell = declarationsFor('.help-dialog[open]');
  const dialog = declarationsFor('.help-dialog');
  assert.equal(shell.display, 'grid');
  assert.equal(shell['grid-template-rows'], 'auto minmax(0,1fr)');
  assert.equal(dialog.overflow, 'clip');
  assert.ok(rules.some(rule => rule.selectors.includes('.help-dialog') && rule.declarations['max-height'] === 'min(82vh,760px)'));
  assert.equal(dialog['max-height'], 'calc(100dvh - 18px)');
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

test('one shield badge in the shared header identifies on-device processing', () => {
  const header = source.match(/<header class="app-header">([\s\S]*?)<\/header>/)[1];
  assert.match(header, /<span class="local-badge">\s*<svg[^>]*aria-hidden="true"[\s\S]*?<span data-i18n="localBadge">/);
  assert.equal((source.match(/data-i18n="localBadge"/g) || []).length, 1);
  const style = declarationsFor('.local-badge');
  assert.equal(style.background, 'var(--accent-soft)');
  assert.equal(style['border-radius'], '999px');
  assert.equal(translations.ja.localBadge, '完全ローカル処理');
  assert.equal(translations.en.localBadge, 'Fully local processing');
});

test('Help opens with three steps and has Japanese and English copy for every topic', () => {
  const body = source.split('<!-- APP:HELP:BEGIN -->')[1].split('<!-- APP:HELP:END -->')[0];
  const steps = body.match(/<ol\b[^>]*>([\s\S]*?)<\/ol>/);
  assert.ok(steps);
  assert.equal((steps[1].match(/<li>/g) || []).length, 3);
  for (const match of body.matchAll(/data-i18n="([^"]+)">([^<]+)</g)) {
    const key = match[1];
    assert.equal(match[2], translations.ja[key], key);
    assert.ok(translations.en[key], key);
  }
  assert.doesNotMatch(source, /helpDialogText/);
});
