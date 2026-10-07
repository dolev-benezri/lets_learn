// Candidate regression test for F-03 (parse side) against the current parser and the fixed copy.
// Run: node solver-audit/plan-probes/data-p1-parsetest.mjs
import assert from 'node:assert/strict';
import { parseDetails as cur } from '../../scripts/parse.mjs';
import { parseDetails as fixed } from './scripts-fixed/parse.mjs';
import fs from 'node:fs';
const row = (kind, name) => `<div class="row"><div class="col">&nbsp;${kind}</div><div class="col">&nbsp;</div><div class="col">&nbsp;${name}</div><div class="col">&nbsp;</div></div>`;
const html = `<div class="card"><h2>תנאי קדם לנושא</h2><div class="Table">${row('תנאי קדם - עליך לעבור את הקורס שמשמאל (או קורס חליפי לו) לפני שתוכל להירשם לקורס המבוקש', 'פיזיקה 1')}${row('תנאי אקסקלוסיבי - לא ניתן להירשם לקורס המבוקש אם כבר נרשמת לקורס שמשמאל', 'אתיקה')}${row('תנאי מקביל - עליך להירשם לקורס שמשמאל', 'מעבדה')}</div></div>`;
for (const [lab, f] of [['CURRENT', cur], ['FIXED', fixed]]) {
  try { assert.deepEqual(f(html).prereqs.map((p) => [p.kind, p.names]), [['קדם', ['פיזיקה 1']], ['מקביל', ['מעבדה']]]); console.log(`TEST parseDetails exclusion row on ${lab}: PASS`); }
  catch (e) { console.log(`TEST parseDetails exclusion row on ${lab}: FAIL ${JSON.stringify(f(html).prereqs.map((p) => p.kind))}`); }
}
const fx = fs.readFileSync(new URL('../repro/fixtures/yedion-details-10825.html', import.meta.url), 'utf8');
console.log('INFO real 10825 page: current', JSON.stringify(cur(fx).prereqs), 'fixed', JSON.stringify(fixed(fx).prereqs));
