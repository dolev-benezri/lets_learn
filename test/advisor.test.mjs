import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'node-html-parser';
import { advisorHtml, advisorBlocks } from '../web/advisor.js';
import { classify } from '../web/rules.js';
import { DISCLAIMER } from '../web/ui-text.js';
import { mini } from './fixtures/mini-data.mjs';

const catalog = { programs: [{ id: 30, name: 'הנדסת מכונות' }] };
const world = (over = {}) => {
  const data = mini();
  const state = { passed: ['A'], grades: { A: 90 }, failed: {}, profile: { year: 2 }, name: 'דנה', ...over };
  const res = { courses: ['B', 'Q'], groups: ['B1', 'Q1'], split: [], breakdown: { compact: 1 }, explanation: '' };
  return { data, state, cls: classify(data, state), catalog, res, now: new Date('2026-10-21T21:30:00Z') };
};
const text = (html) => parse(html).text.replace(/\s+/g, ' ');

test('advisorHtml: the four headings, the title and the disclaimer', () => {
  const html = advisorHtml(world());
  for (const h of ['סיכום לפגישה עם יועץ לימודים', 'המצב שלי', 'החלופה שבחרתי', 'שימו לב'])
    assert.ok(html.includes(h), h);
  assert.ok(text(html).includes(DISCLAIMER));
});

test('advisorHtml: the situation (program, year, credits of the goal, passed, missing, average)', () => {
  const t = text(advisorHtml(world()));
  for (const s of [
    'הנדסת מכונות',
    'שנה ב׳',
    '5 מתוך 10 נ״ז הנדרשים עד סוף שנה א׳',
    'פיזיקה-מכניקה',
    'חדו"א 1',
    'דנה',
    '90'
  ])
    assert.ok(t.includes(s), s);
  assert.ok(!t.includes('לא נלמד'), 'only the required courses that are not passed');
});

test('advisorHtml: failed courses not passed again are listed (bot report #6)', () => {
  assert.ok(!text(advisorHtml(world())).includes('נכשלתי'));
  const t = text(advisorHtml(world({ failed: { B: 1, A: 1 } })));
  assert.ok(t.includes('קורסים שנכשלתי בהם ועוד לא עברתי: דינמיקה'), t);
  const line = t.split('ועוד לא עברתי: ')[1].split('קורסי חובה')[0];
  assert.ok(!line.includes('חדו"א 1'), `A was passed again: ${line}`);
});

test('advisorHtml: a course the site assumed is not claimed as passed, and is said to be assumed', () => {
  const w = world({ passed: ['A'], assumed: ['A'], grades: {} }),
    t = text(advisorHtml(w)),
    nameA = w.data.courses.A.name;
  assert.ok(!t.includes('קורסים שעברתי'), t);
  assert.ok(t.includes(`קורסים בהנחה, לא אושרו: ${nameA}`), t);
  assert.ok(t.includes('כולל קורס אחד בהנחה'), t);
});

test('advisorHtml: confirmed and assumed courses each under their own words', () => {
  const w = world({ passed: ['A', 'Q'], assumed: ['Q'] }),
    t = text(advisorHtml(w));
  assert.ok(t.includes(`קורסים שעברתי: ${w.data.courses.A.name}`), t);
  assert.ok(t.includes(`קורסים בהנחה, לא אושרו: ${w.data.courses.Q.name}`), t);
});

test('advisorHtml: nothing assumed reads as before; an assumed course gone from the catalog stays by its id', () => {
  for (const over of [{}, { assumed: [] }, { assumed: null }]) {
    const t = text(advisorHtml(world(over)));
    assert.ok(t.includes('קורסים שעברתי:') && !t.includes('בהנחה'), t);
  }
  assert.ok(text(advisorHtml(world({ passed: ['A', 'gone'], assumed: ['gone'] }))).includes('קורסים בהנחה, לא אושרו: gone'));
});

test('advisorHtml: a course marked passed over a failed prerequisite is named under "שימו לב"', () => {
  const w = world({ passed: ['B'], failed: { A: 1 }, grades: {} }),
    t = text(advisorHtml(w));
  assert.ok(t.includes(`${w.data.courses.B.name}: שים לב`), t);
  assert.ok(t.includes('וסומן שנכשלת בו'), t);
  assert.ok(!text(advisorHtml(world())).includes(': שים לב'));
});

test('advisorHtml: rules no department approved, and open conflicts between sources, are said', () => {
  const t = text(advisorHtml({ ...world(), approved: null, conflicts: ['מספר נ״ז בחירה'] }));
  assert.ok(t.includes('הכללים לא אושרו על ידי המחלקה'), t);
  assert.ok(t.includes('יש סתירה בין המקורות הרשמיים לגבי מספר נ״ז בחירה'), t);
  assert.ok(!text(advisorHtml({ ...world(), approved: '2026-10-05', conflicts: [] })).includes('לא אושרו על ידי המחלקה'));
});

test('advisorHtml: each course of the result with its groups and meeting times', () => {
  const t = text(advisorHtml(world()));
  for (const s of ['דינמיקה', 'משוואות', 'קבוצה B1', 'יום ב׳ 10:00–11:50', 'קבוצה Q1', 'יום א׳ 10:00–11:50', '8 נ״ז'])
    assert.ok(t.includes(s), s);
});

test('advisorHtml: the date is Israel time (21:30 UTC on 21.10.2026 is already the 22nd)', () => {
  assert.ok(text(advisorHtml(world())).includes('22.10.2026'));
});

test('advisorHtml: split courses are listed only when there are any', () => {
  assert.ok(!text(advisorHtml(world())).includes('הפרדת הרצאה'));
  const w = world();
  w.res.split = ['B'];
  const t = text(advisorHtml(w));
  assert.ok(t.includes('הפרדת הרצאה ותרגול') && t.includes('דורש אישור ההכוון האקדמי') && t.includes('דינמיקה'));
});

test('advisorHtml: regulation warnings and a year pair with a heading per semester', () => {
  const w = world({ failed: { A: 3 } });
  w.res = {
    a: { courses: ['B'], groups: ['B1'], split: [] },
    b: { courses: ['Q'], groups: ['Q1'], split: ['Q'] },
    warnings: ['אזהרת זוג'],
    missing: [],
    split: ['Q']
  };
  w.sem = { 'א': w.data, 'ב': w.data };
  const t = text(advisorHtml(w));
  for (const s of ['סמסטר א׳', 'סמסטר ב׳', 'אזהרת זוג', 'לפי התקנון (11.5.2) מצב זה יכול להוות הרחקה', 'משוואות']) assert.ok(t.includes(s), s);
  assert.ok(t.includes('הפרדת הרצאה'));
});

test('advisorHtml: no result still renders (nothing to list)', () => {
  const w = world();
  w.res = null;
  const html = advisorHtml(w);
  assert.ok(html.includes('המצב שלי') && html.includes('שימו לב'));
});

test('advisorHtml: hostile names come out escaped', () => {
  const P = '<xss-t></xss-t>" onxss=1 \'';
  const w = world({ name: P });
  w.data.courses.A.name += P;
  w.data.courses.B.name += P;
  w.data.courses.Q0.name += P;
  w.data.courses.B.groups[0].meetings[0].room = P;
  w.catalog = { programs: [{ id: 30, name: P }] };
  w.cls.warnings.push(P);
  w.res.groups = [P, 'B1'];
  const html = advisorHtml(w);
  assert.ok(html.includes('&lt;xss-t&gt;'));
  assert.equal(parse(html).querySelectorAll('xss-t').length, 0);
  assert.ok(!/<[^>]+ onxss/.test(html));
});

test('advisorHtml: a met list names no missing course (same logic as the credit figure)', () => {
  const w = world();
  w.data.lists[0].minCredits = 5;
  const t = text(advisorHtml(w));
  assert.ok(t.includes('5 מתוך 5 נ״ז') && t.includes('קורסי חובה משנים קודמות שחסרים: אין'), t);
});

test('advisor summary carries the close exam warnings of each semester', () => {
  const pair = [{ days: 0, a: { course: 'B', date: '2027-02-05', time: '09:00' }, b: { course: 'Q', date: '2027-02-05', time: '13:00' } }];
  const w = world();
  const one = text(advisorHtml({ ...w, res: { ...w.res, closeExams: pair } }));
  assert.ok(one.includes('שתי בחינות באותו יום'), one);
  assert.ok(one.includes('05.02.2027 בשעות 09:00 ו-13:00'), one);
  const year = text(advisorHtml({
    ...w,
    res: { a: { courses: ['B'], groups: ['B1'], split: [], closeExams: [] }, b: { courses: ['Q'], groups: ['Q1'], split: [], closeExams: pair }, credits: { a: 1, b: 1 }, missing: [], warnings: [] }
  }));
  assert.ok(year.includes('שתי בחינות באותו יום'), year);
});

test('advisor summary names a mandatory course the year plan could not place (res.missing)', () => {
  const d = mini();
  const html = advisorHtml({
    data: d, state: { passed: [], failed: {}, profile: { year: 1 } },
    res: { a: { courses: ['A'], groups: ['A2'] }, b: null, missing: ['B'], warnings: [] }, cls: { warnings: [] }
  });
  assert.match(html, /קורסי חובה שביקשת ולא נכנסו לאף סמסטר: דינמיקה/);
});

test('advisorBlocks: plain strings in order, for a renderer that is not HTML', () => {
  const w = world({ failed: { B: 1 }, name: 'דנה <b>' });
  const b = advisorBlocks(w);
  assert.deepEqual(
    b.filter((x) => x.k === 'h3').map((x) => x.t),
    ['המצב שלי', 'החלופה שבחרתי', 'שימו לב']
  );
  assert.equal(b[0].k, 'h2');
  assert.ok(b.some((x) => x.k === 'li' && x.t === 'שם: דנה <b>'), 'not escaped: only the HTML renderer escapes');
  assert.ok(b.some((x) => x.k === 'li' && x.t.startsWith('קורסים שנכשלתי בהם')));
  const c = b.find((x) => x.k === 'course' && x.name === 'דינמיקה');
  assert.ok(c.credits > 0);
  assert.match(c.groups[0], /קבוצה B1: יום ב׳ 10:00–11:50/);
});
