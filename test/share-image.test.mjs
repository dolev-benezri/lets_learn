// The share image's layout (web/share-image.js): pure, measured with a fake text width so it runs in node.
import { test } from 'node:test';
import assert from 'node:assert/strict';

await import('../web/app.js'); // app.js starts init() only when it sees a document: import it before anything else
const { headerLabel, fitLines, shareModel } = await import('../web/share-image.js');

const measure = (s) => s.length * 12;
const L = (over = {}) => ({ course: 'c1', name: 'מכניקת מוצקים', type: 'תרגול', group: '273011204/1', day: 1, start: '12:00', end: '13:30', color: 0, changed: false, ...over });
const input = (over = {}) => ({
  name: 'נועה', semester: 'א', label: 'המערכת הנוכחית', link: true, range: { from: 8, to: 19, days: 5 }, lessons: [L()], ghosts: [], ...over
});
const inCol = (m, it) => m.cols.some((c) => it.x >= c.x - 0.5 && it.x + it.w <= c.x + c.w + 0.5);
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test('headerLabel: a proposal, pending edits, or the current schedule', () => {
  assert.equal(headerLabel({ index: 2, count: 5, pending: false }), 'הצעה 2 מתוך 5');
  assert.equal(headerLabel({ index: 0, count: 5, pending: true }), 'שינויים שעוד לא נשמרו');
  assert.equal(headerLabel({ index: 0, count: 0, pending: false }), 'המערכת הנוכחית');
});

test('fitLines wraps by words and ends a cut text with …, every line within the width', () => {
  const lines = fitLines('משוואות דיפרנציאליות רגילות למהנדסים', 200, 2, measure);
  assert.ok(lines.length <= 2);
  for (const l of lines) assert.ok(measure(l) <= 200, l);
  assert.ok(lines.at(-1).endsWith('…'));
  assert.deepEqual(fitLines('תרמודינמיקה', 200, 3, measure), ['תרמודינמיקה']);
});

test('header: the name (or "המערכת שלי"), then the semester and the label', () => {
  const m = shareModel(input({ label: 'הצעה 2 מתוך 5' }), measure);
  assert.equal(m.width, 1080);
  assert.equal(m.title, 'המערכת של נועה');
  assert.equal(m.sub, 'סמסטר א׳ · הצעה 2 מתוך 5');
  assert.equal(shareModel(input({ name: '' }), measure).title, 'המערכת שלי');
  assert.equal(shareModel(input({ semester: 'קיץ' }), measure).sub, 'סמסטר קיץ · המערכת הנוכחית');
});

test('day columns: five, six with Friday, Sunday on the right', () => {
  const five = shareModel(input(), measure), six = shareModel(input({ range: { from: 8, to: 19, days: 6 } }), measure);
  assert.deepEqual(five.cols.map((c) => c.label), ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי']);
  assert.equal(six.cols.length, 6);
  assert.equal(six.cols.at(-1).label, 'שישי');
  for (let i = 1; i < five.cols.length; i++) assert.ok(five.cols[i].x < five.cols[i - 1].x, 'each next day is further left');
});

test('a lesson sits at its hours, with "{type} · קב׳ {number}" and its time', () => {
  const m = shareModel(input({ lessons: [L({ day: 2, start: '10:00', end: '11:30' }), L({ course: 'c2', type: 'סופי-הרצאה+תרגול', group: '273011204', day: 3 }), L({ course: 'x', group: null, type: 'הרצאה', day: 4 })] }), measure);
  const [a, b, c] = m.items;
  assert.equal(a.y, m.grid.top + 2 * m.grid.hour);
  assert.ok(Math.abs(a.h - 1.5 * m.grid.hour) <= 8, 'an hour and a half, less the gap');
  assert.equal(a.meta.join(' '), 'תרגול · קב׳ 04/1');
  assert.equal(b.meta.join(' '), 'הרצאה+תרגול · קב׳ 04');
  assert.deepEqual(c.meta, ['הרצאה'], 'a fixed lesson: the type alone');
  assert.equal(m.items.find((i) => i.time === '12:00–13:30') !== undefined, true);
  assert.ok(m.items.every((i) => i.kind === 'lesson' && inCol(m, i)));
  assert.equal(m.cols.find((col) => col.day === 2).x <= a.x, true);
});

test('the legend only when something moved', () => {
  assert.equal(shareModel(input(), measure).legend, false);
  assert.equal(shareModel(input({ lessons: [L({ changed: true })] }), measure).legend, true);
  assert.equal(shareModel(input({ ghosts: [{ course: 'c1', name: 'מכניקת מוצקים', day: 4, start: '10:00', end: '11:30', color: 0 }] }), measure).legend, true);
});

test('an old place: "היה כאן" and the course name', () => {
  const m = shareModel(input({ ghosts: [{ course: 'c1', name: 'מכניקת מוצקים', day: 4, start: '10:00', end: '11:30', color: 0 }] }), measure);
  const g = m.items.find((i) => i.kind === 'ghost');
  assert.equal(g.name[0], 'היה כאן');
  assert.equal(g.name.slice(1).join(' '), 'מכניקת מוצקים');
  assert.equal(g.color, 0);
});

test('the footer: the link line only when a link goes with the image', () => {
  const on = shareModel(input(), measure), off = shareModel(input({ link: false }), measure);
  assert.equal(on.footer.right, 'נבנתה במתכנן המערכת · אפקה');
  assert.equal(on.footer.left, 'הקישור בהודעה');
  assert.equal(off.footer.left, '');
});

test('a long name in a 50-minute lesson: the hours go first, the name keeps a line, the group stays, all fits', () => {
  const m = shareModel(input({ lessons: [L({ name: 'שרטוט הנדסי ממוחשב למהנדסי מכונות מתקדמים', start: '10:00', end: '10:50' })] }), measure);
  const [a] = m.items;
  assert.equal(a.time, null);
  assert.equal(a.name.length, 1);
  assert.ok(a.name[0].endsWith('…'));
  assert.ok(a.meta.length >= 1, 'the group number is what a friend needs');
  for (const line of [...a.name, ...a.meta]) assert.ok(measure(line) <= a.w, line);
  assert.ok((a.name.length * 28 + a.meta.length * 26) <= a.h - 16, 'fits the height');
});

test('two lessons at the same time and an old place under them sit side by side, none over another', () => {
  const m = shareModel(input({
    lessons: [L({ day: 2, start: '10:00', end: '11:30' }), L({ course: 'c2', day: 2, start: '10:30', end: '12:00' })],
    ghosts: [{ course: 'c3', name: 'תרמודינמיקה', day: 2, start: '10:00', end: '11:30', color: 2 }]
  }), measure);
  assert.equal(m.items.length, 3);
  for (const it of m.items) assert.ok(inCol(m, it), 'inside the column');
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) assert.equal(meets(m.items[i], m.items[j]), false, `${i} and ${j}`);
});

test('the height covers the header, the hours and the footer', () => {
  const m = shareModel(input(), measure);
  assert.ok(m.height >= m.grid.top + 11 * m.grid.hour);
  assert.equal(m.hours.length, 11);
  assert.equal(m.hours[0].text, '08:00');
});

test('line order: a 90-minute short-named lesson keeps its hours; a 30-minute one drops them, keeps one name line, and the group only if it fits', () => {
  const long = shareModel(input({ lessons: [L({ name: 'פיזיקה', start: '10:00', end: '11:30' })] }), measure).items[0];
  assert.equal(long.time, '10:00–11:30');
  assert.ok(long.meta.length >= 1);
  const short = shareModel(input({ lessons: [L({ name: 'משוואות דיפרנציאליות', start: '10:00', end: '10:30' })] }), measure).items[0];
  assert.equal(short.time, null);
  assert.equal(short.name.length, 1);
  assert.ok(short.name.length * 28 + short.meta.length * 26 <= short.h - 16, 'what is left fits the height');
  const tiny = shareModel(input({ lessons: [L({ start: '10:00', end: '10:20' })] }), measure).items[0];
  assert.deepEqual([tiny.name.length, tiny.meta.length, tiny.time], [1, 0, null], 'too short for the group line: the name alone');
});

test('fitLines: a word wider than the line is cut there with …, wherever it falls', () => {
  for (const text of ['אאאאאאאאאאאאאאאאאאאא ב', 'ב אאאאאאאאאאאאאאאאאאאא ג', 'אאאאאאאאאאאאאאאאאאאא']) {
    const lines = fitLines(text, 100, 3, measure);
    for (const l of lines) assert.ok(measure(l) <= 100, `${text}: ${l}`);
    assert.ok(lines.at(-1).endsWith('…'), text);
  }
  assert.deepEqual(fitLines('', 100, 2, measure), []);
  assert.deepEqual(fitLines('אב גד', 60, 2, measure), ['אב גד'], 'an exact fit is not cut');
});

test('a 30-minute old place has room for one line: the course name', () => {
  const g = shareModel(input({ ghosts: [{ course: 'c1', name: 'מכניקת מוצקים', day: 4, start: '10:00', end: '10:30', color: 0 }] }), measure).items.find((i) => i.kind === 'ghost');
  assert.equal(g.name.length, 1);
  assert.notEqual(g.name[0], 'היה כאן');
  assert.ok(g.name.length * 26 <= g.h - 16);
});

test('a long student name is cut to the title width', () => {
  const m = shareModel(input({ name: 'א'.repeat(200) }), measure);
  assert.ok(measure(m.title) <= m.pos.right - m.pos.left);
  assert.ok(m.title.endsWith('…'));
});

test('fitLines: a word too wide for any line moves to the next line before it is cut', () => {
  assert.deepEqual(fitLines('משוואות דיפרנציאליות', 120, 3, measure), ['משוואות', 'דיפרנציאל…']);
});

test('canvas fonts are all weight 400: WebKit draws a variable font at its default weight whatever the canvas asks, so bold is a stroke', async () => {
  const { FONTS, BOLD } = await import('../web/share-image.js');
  for (const [k, f] of Object.entries(FONTS)) assert.match(f, /^400 /, k);
  assert.deepEqual(Object.keys(BOLD).sort(), ['day', 'name', 'title'], 'bold by role: the sub, legend and footer share a size with bold roles');
  for (const r of Object.keys(BOLD)) assert.ok(r in FONTS && BOLD[r] > 0, r);
});

test('the group number never leaves "קב׳" on the line above it', () => {
  const m = shareModel(input({ lessons: [L({ type: 'תרגול', group: '273011221/2' })] }), (s) => s.length * 14);
  assert.ok(m.items[0].meta.some((l) => /קב׳ 21\/2/.test(l)), JSON.stringify(m.items[0].meta));
});
