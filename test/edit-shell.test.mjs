// The edit page's shell: its route, and when the first-entry mode choice shows (pure parts; the screens are in test/browser/edit-shell.spec.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => store.get(k) ?? null,
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};
const { app, routeOf, isEditHash } = await import('../web/app.js');
const { acceptTerms } = await import('../web/ui-common.js');
const { needsModeChoice, setMode, MODE_KEY } = await import('../web/ui-mode.js');

test('routeOf: the edit hashes route to edit, a friend link still to the plans', () => {
  assert.equal(routeOf('#edit'), 'edit');
  assert.equal(routeOf('#edit/changes'), 'edit');
  assert.equal(routeOf('#f=abc'), 'plan');
  assert.equal(routeOf('#editor'), 'plan');
  assert.deepEqual(['#edit', '#edit/x', '#editor', '#me', ''].map(isEditHash), [true, true, false, false, false]);
});

test('needsModeChoice: terms accepted, no stored choice, no track yet, no explicit link', () => {
  app.state = { programSet: false };
  assert.equal(needsModeChoice(''), false, 'the terms come first');
  acceptTerms();
  assert.equal(needsModeChoice(''), true);
  for (const h of ['#edit', '#edit/changes', '#me', '#courses', '#prefs', '#f=x', '#b=x']) assert.equal(needsModeChoice(h), false, h);
  app.state = { programSet: true };
  assert.equal(needsModeChoice(''), false, 'a known student is not asked');
  app.state = { programSet: false };
  setMode('edit');
  assert.equal(store.get(MODE_KEY), 'edit');
  assert.equal(needsModeChoice(''), false, 'the choice is remembered');
});
