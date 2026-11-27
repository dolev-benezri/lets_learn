import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as rules from '../web/rules.js';
import * as appModule from '../web/app.js';

for (const [label, lists, expected] of [
  ['none', undefined, 0],
  ['empty', [], 0],
  ['aleph through gimel', ['א', 'ב', 'ג'].map((y) => ({ name: `חובה שנה ${y}'` })), 3],
  ['aleph through he', ['א', 'ב', 'ג', 'ד', 'ה'].map((y) => ({ name: `חובה שנה ${y}'` })), 5],
  ['unrelated names', [{ name: 'בחירה' }, { name: "סמסטר ה'" }], 0]
])
  test(`listYears: ${label}`, () => {
    assert.equal(rules.listYears(lists), expected);
    assert.equal(rules.yearsOf({ lists }), expected >= 2 ? expected : 4, 'yearsOf keeps its partial-data fallback');
  });

for (const years of [3, 'bad'])
  test(`catalog load accepts years ${JSON.stringify(years)} without falling back`, async (t) => {
    const catalog = { year: 2027, programs: [{ id: 11, name: 'מדעי המחשב', startYears: [2026], years }] };
    t.mock.method(globalThis, 'fetch', async (url) => {
      assert.equal(url, 'data/afeka/catalog.json');
      return { ok: true, json: async () => catalog };
    });
    assert.equal(await appModule.loadCatalog(), catalog);
  });
