const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const removed = [
  "ヘルプ内をスクロールして最後まで読めます。開いている間は背景ページがスクロールしません。",
  "Scroll inside Help to read to the end. The background page does not scroll while Help is open. "
];
for (const file of ["src/index.template.html", "presentation-video-maker.html"]) {
  test(`${file}: user help omits implementation commentary`, () => {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    for (const text of removed) assert.ok(!html.includes(text), `Remove implementation copy from ${file}`);
  });
}
