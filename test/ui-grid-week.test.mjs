// renderWeek for the edit page: ghosts, changed groups and movable marks; a build call stays exactly as it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { renderWeek } = await import('../web/ui-grid.js');
const g = (id, day, start, end) => ({ id, type: 'הרצאה', primary: true, linked: [], full: false, lecturer: 'L', exams: [], meetings: [{ day, start, end, room: 'r' }] });
const data = {
  courses: {
    A: { name: 'אלף', credits: 3, offered: true, prereqs: [], groups: [g('A1', 1, '08:00', '09:50')] },
    B: { name: 'בית', credits: 3, offered: true, prereqs: [], groups: [g('B1', 2, '10:00', '11:50')] }
  }
};
const ctx = {
  data, res: { groups: ['A1', 'B1'] }, range: { from: 8, to: 13, days: 5 }, colors: new Map([['A', 0], ['B', 1]]), dashed: new Set(), pins: ['A1'], friends: [], day: 1
};

test('renderWeek without ghosts, changed or movable is the build output, byte for byte', () => {
  assert.equal(renderWeek(ctx), "<div class=\"wk\" style=\"--cols:5;--span:300\">\n    <div class=\"wk-head\" aria-hidden=\"true\"><div></div><div class=\"dh\"><b>א׳</b><span>ראשון</span></div><div class=\"dh\"><b>ב׳</b><span>שני</span></div><div class=\"dh\"><b>ג׳</b><span>שלישי</span></div><div class=\"dh\"><b>ד׳</b><span>רביעי</span></div><div class=\"dh\"><b>ה׳</b><span>חמישי</span></div></div>\n    <div class=\"hours\" aria-hidden=\"true\"><span style=\"--s:0\">08:00</span><span style=\"--s:60\">09:00</span><span style=\"--s:120\">10:00</span><span style=\"--s:180\">11:00</span><span style=\"--s:240\">12:00</span></div>\n    <div class=\"day on\" role=\"group\" aria-label=\"יום ראשון\"><button type=\"button\" class=\"blk c0 pinned\" data-act=\"block\" data-gid=\"A1\" data-k=\"b-A1-1-08:00\"\n    aria-haspopup=\"dialog\" style=\"--s:0;--d:110\">\n    <span class=\"sr\">יום א׳, </span><span class=\"blk-name\">אלף</span>\n    <span class=\"blk-meta\"><bdi dir=\"ltr\">08:00<span class=\"blk-end\">–09:50</span></bdi></span>\n    <span class=\"blk-room\">הרצאה · r</span>\n    <span class=\"blk-pin\"><svg class=\"icon\" viewBox=\"0 0 24 24\" aria-hidden=\"true\"><path d=\"M12 17v5\"/><path d=\"M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z\"/></svg><span class=\"sr\">, נעוץ</span></span>\n    \n    <span class=\"sr\"> (A)</span></button></div><div class=\"day\" role=\"group\" aria-label=\"יום שני\"><button type=\"button\" class=\"blk c1\" data-act=\"block\" data-gid=\"B1\" data-k=\"b-B1-2-10:00\"\n    aria-haspopup=\"dialog\" style=\"--s:120;--d:110\">\n    <span class=\"sr\">יום ב׳, </span><span class=\"blk-name\">בית</span>\n    <span class=\"blk-meta\"><bdi dir=\"ltr\">10:00<span class=\"blk-end\">–11:50</span></bdi></span>\n    <span class=\"blk-room\">הרצאה · r</span>\n    \n    \n    <span class=\"sr\"> (B)</span></button></div><div class=\"day\" role=\"group\" aria-label=\"יום שלישי\"></div><div class=\"day\" role=\"group\" aria-label=\"יום רביעי\"></div><div class=\"day\" role=\"group\" aria-label=\"יום חמישי\"></div>\n  </div>");
  assert.equal(renderWeek({ ...ctx, ghosts: undefined, changed: undefined, movable: undefined }), renderWeek(ctx));
});

test('renderWeek: a ghost is a dashed "היה כאן" box in its day, not a button', () => {
  const html = renderWeek({ ...ctx, ghosts: [{ day: 3, start: '09:00', end: '10:50' }] });
  assert.ok(html.includes('היה כאן'));
  assert.match(html, /<div class="off ghost"[^>]*--s:60;--d:110/);
  assert.equal((html.match(/data-act="block"/g) ?? []).length, 2, 'ghosts add no block');
});

test('renderWeek: changed groups carry the class, movable marks every block in words', () => {
  const html = renderWeek({ ...ctx, changed: new Set(['B1']), movable: new Set(['A']) });
  assert.match(html, /class="blk c1 changed/);
  assert.doesNotMatch(html, /class="blk c0[^"]*changed/);
  assert.match(html, /class="blk c0 movable/);
  assert.equal((html.match(/יכול לזוז/g) ?? []).length, 1);
  assert.equal((html.match(/נשאר במקום/g) ?? []).length, 1);
});
