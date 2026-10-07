// Draft of the F-17 regression test (proposed home: the same new file as F-02, test/ui-search.test.mjs). Run: node --test f17-regression-draft.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';

const appMod = await import((process.env.WEB ?? '../../web/') + 'app.js');
const el = () => ({ dataset: {}, classList: { toggle() {}, add() {}, remove() {} }, setAttribute() {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] });
globalThis.document = { getElementById: () => el(), querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, activeElement: null, body: { dataset: { view: 'plan' } } };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
Object.assign(globalThis, { matchMedia: () => ({ matches: false, addEventListener() {} }), CSS: { escape: (s) => s }, addEventListener() {} });
const { CHG } = await import((process.env.WEB ?? '../../web/') + 'ui-actions.js');

test('CHG.myName stores the trimmed name and does not ask for a new search', () => {
  appMod.app.state = appMod.normalize({ v: 1 });
  assert.equal(CHG.myName({ value: '  Dana ' }), 'save');
  assert.equal(appMod.app.state.name, 'Dana');
});
