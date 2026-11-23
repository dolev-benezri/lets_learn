import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'node-html-parser';
import { sheetExpandHtml, sheetScrollY } from '../web/phone-sheet.js';

test('phone sheets have distinct native buttons with the Hebrew action and expansion state', () => {
  for (const kind of ['panel', 'edit']) for (const expanded of [false, true]) {
    const button = parse(sheetExpandHtml(kind, expanded)).querySelector('button');
    assert.equal(button.getAttribute('type'), 'button');
    assert.equal(button.getAttribute('data-k'), `expand-${kind}`);
    assert.equal(button.getAttribute('data-sheet'), kind);
    assert.equal(button.getAttribute('aria-expanded'), String(expanded));
    assert.equal(button.getAttribute('aria-label'), expanded ? 'הקטנה' : 'הגדלה');
    assert.equal(button.querySelector('.a-sheet-handle').getAttribute('aria-hidden'), 'true');
  }
});

test('opening a sheet reveals the first lesson below the chrome, without moving an already visible row', () => {
  assert.equal(sheetScrollY(180, -30, 64, 260), 78, 'a row above the screen is brought back');
  assert.equal(sheetScrollY(0, 430, 64, 260), 358, 'a row covered by the sheet moves above it');
  assert.equal(sheetScrollY(180, 90, 64, 260), 180, 'an already visible row stays put');
  assert.equal(sheetScrollY(0, 10, 64, 260), 0, 'never scroll before the document start');
  assert.equal(sheetScrollY(0, 430, -50, 260), 422, 'chrome scrolled out of view leaves the screen available');
});
