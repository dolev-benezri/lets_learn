import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'node-html-parser';
import { advisorHtml } from '../web/advisor.js';
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
  for (const h of ['סיכום לפגישה עם יועץ לימודים', 'המצב שלי', 'החלופה שבחרתי', 'שימו לב']) assert.ok(html.includes(h), h);
  assert.ok(text(html).includes(DISCLAIMER));
});

test('advisorHtml: the situation (program, year, credits of the goal, passed, missing, average)', () => {
  const t = text(advisorHtml(world()));
  for (const s of ['הנדסת מכונות', 'שנה ב׳', '5 מתוך 10 נ״ז הנדרשים עד סוף שנה א׳', 'פיזיקה-מכניקה', 'חדו"א 1', 'דנה', '90']) assert.ok(t.includes(s), s);
  assert.ok(!t.includes('לא נלמד'), 'only the required courses that are not passed');
});

test('advisorHtml: each course of the result with its groups and meeting times', () => {
  const t = text(advisorHtml(world()));
  for (const s of ['דינמיקה', 'משוואות', 'קבוצה B1', 'יום ב׳ 10:00–11:50', 'קבוצה Q1', 'יום א׳ 10:00–11:50', '8 נ״ז']) assert.ok(t.includes(s), s);
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
  w.res = { a: { courses: ['B'], groups: ['B1'], split: [] }, b: { courses: ['Q'], groups: ['Q1'], split: ['Q'] }, warnings: ['אזהרת זוג'], missing: [], split: ['Q'] };
  w.sem = { 'א': w.data, 'ב': w.data };
  const t = text(advisorHtml(w));
  for (const s of ['סמסטר א׳', 'סמסטר ב׳', 'אזהרת זוג', 'הרחקה (תקנון 11.5.2)', 'משוואות']) assert.ok(t.includes(s), s);
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
  w.data.courses.A.name += P; w.data.courses.B.name += P; w.data.courses.Q0.name += P;
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
