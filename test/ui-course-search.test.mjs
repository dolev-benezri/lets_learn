// The course search's HTML (web/ui-course-search.js): a group tagged מלא has no "הוספה" and no "מעבר לקבוצה", only the tag (manager's ruling, phase 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'node-html-parser';

await import('../web/app.js'); // app.js starts init() only when it sees a document: import it before anything else
const { courseHtml } = await import('../web/ui-course-search.js');

const opt = (over) => ({ ids: ['273000302'], line: 'הרצאה 02 · יום ד׳ 14:00–15:50', lecturer: 'ד"ר פלוני', fit: 'fits', clash: [], ...over });
const row = (over) => ({ id: '30003', name: 'מבוא לכימיה', code: '30003', credits: 4, options: [opt()], open: true, inSchedule: false, readOnly: false, ...over });
const buttons = (r) => parse(courseHtml(r)).querySelectorAll('button').map((b) => b.getAttribute('data-ed'));

test('an option that fits has "הוספה" for a course not in the schedule, and "מעבר לקבוצה" for one that is', () => {
  assert.deepEqual(buttons(row()), ['csAdd']);
  assert.deepEqual(buttons(row({ inSchedule: true })), ['csSwap']);
});

test('a full group has the tag and no button, whether or not the course is in the schedule', () => {
  for (const inSchedule of [false, true]) {
    const full = row({ inSchedule, options: [opt({ fit: 'full' })] });
    const root = parse(courseHtml(full));
    assert.deepEqual(buttons(full), [], `inSchedule ${inSchedule}: no add, no switch`);
    assert.equal(root.querySelector('.cs-opt .tag').text, 'מלא');
    assert.match(root.querySelector('.cs-opt').text, /הרצאה 02/, 'its line is still there');
  }
});

test('only the full group loses its button: a free one beside it keeps it', () => {
  const r = row({ options: [opt({ fit: 'full' }), opt({ ids: ['273000303'], line: 'הרצאה 03 · יום ה׳ 10:00–11:50' })] });
  assert.deepEqual(buttons(r), ['csAdd']);
  assert.equal(parse(courseHtml(r)).querySelectorAll('.cs-opt').length, 2);
});

test('a read-only course (another program) and a closed one have no buttons either', () => {
  assert.deepEqual(buttons(row({ readOnly: true, readOnlyWhy: 'תוכנית אחרת' })), []);
  assert.deepEqual(buttons(row({ open: false })), []);
});
