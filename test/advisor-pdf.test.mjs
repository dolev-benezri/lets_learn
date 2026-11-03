import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { PDFDocument, rgb } from '../web/vendor/pdf/pdf-lib.esm.min.js';
import bidiFactory from '../web/vendor/pdf/bidi.min.mjs';
import * as pdfjs from '../web/vendor/pdfjs/pdf.min.mjs';
import { buildAdvisorPdf, visualRuns } from '../web/advisor-pdf.js';
import { advisorBlocks } from '../web/advisor.js';
import { classify } from '../web/rules.js';
import { mini } from './fixtures/mini-data.mjs';

// The UMD build sets module.exports; this package is type: module, so require() would read it as an ES module.
const umd = { exports: {} };
new Function('module', 'exports', readFileSync('web/vendor/pdf/fontkit.umd.min.js', 'utf8'))(umd, umd.exports);
const fontkit = umd.exports;
// pdf.js reads the files back here and needs these; Node 24, which CI runs, does not have them yet
Uint8Array.prototype.toHex ??= function () {
  return Array.from(this, (b) => b.toString(16).padStart(2, '0')).join('');
};
for (const C of [Map, WeakMap]) {
  C.prototype.getOrInsertComputed ??= function (key, make) {
    if (!this.has(key)) this.set(key, make(key));
    return this.get(key);
  };
}
pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL('web/vendor/pdfjs/pdf.worker.min.mjs').href;

const bidi = bidiFactory();
const fontBytes = (n) => readFileSync(`web/vendor/pdf/rubik-${n}-normal.woff`);
const libs = { PDFDocument, rgb, fontkit, bidi, fontBytes };
const faces = Object.fromEntries(
  Object.entries({ he: 'hebrew-400', la: 'latin-400', ar: 'arabic-400', cy: 'cyrillic-400', lx: 'latin-ext-400' }).map(([k, n]) => [k, fontkit.create(fontBytes(n))])
);
const runs = (line) => visualRuns(line, bidi, faces);
// The line as it stands on the page, left to right: the glyphs fontkit really lays out for each run.
const visual = (line) =>
  runs(line)
    .map((r) => faces[r.font].layout(r.draw).glyphs.flatMap((g) => g.codePoints.map((c) => String.fromCodePoint(c))).join(''))
    .join('');
const noNotdef = (line) => runs(line).every((r) => faces[r.font].layout(r.draw).glyphs.every((g) => g.id !== 0));

const read = async (bytes) => {
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false });
  const doc = await task.promise;
  const items = [];
  for (let n = 1; n <= doc.numPages; n++) items.push(...(await (await doc.getPage(n)).getTextContent()).items.filter((i) => i.str));
  const { info } = await doc.getMetadata();
  const pages = doc.numPages;
  await task.destroy();
  return { pages, items, info, text: items.map((i) => i.str).join(' ') };
};
const li = (t) => ({ k: 'li', t });

test('brackets mirror: the visual line reads (nz 3.5) then the course', () => {
  assert.equal(visual('דינמיקה (3.5 נ״ז)'), '(ז״נ 3.5) הקימניד');
});

test('Latin and Hebrew in one line keep their order, in the fonts of their own script', () => {
  assert.equal(visual('A שלום'), 'םולש A');
  assert.equal(visual('מבוא ל-Python 2'), 'Python 2-ל אובמ'); // a number after Latin joins it (UAX 9 W7), as on screen
  assert.deepEqual(runs('A שלום').map((r) => r.font).filter((f, i, a) => a[i - 1] !== f), ['he', 'la']);
});

test('numbers, times, dates and addresses are not reversed', () => {
  for (const s of ['08:30-10:00', '15.02.2027', 'afeka.ac.il', '62.5']) assert.ok(visual(`בדיקה ${s} סוף`).includes(s), s);
});

test('Arabic digits and Arabic punctuation come out in order, each as fontkit lays it', () => {
  assert.equal(visual('מספר ١٢٣'), '١٢٣ רפסמ');
  assert.equal(visual('שלום ،؟'), '؟، םולש');
});

test('a mirrored form no font holds stays as it was, with no empty box', () => {
  assert.ok(noNotdef('א \u2215 ב'));
});

test('a run is split where the bidi level changes, and spaces stay inside their run', () => {
  const r = runs('שלום עולם 12');
  assert.deepEqual(r.map((x) => x.font), ['la', 'la', 'he']);
  assert.equal(r[2].draw, 'שלום עולם');
});

test('the Hebrew text prints in order and every word can be found in the file', async () => {
  const { bytes } = await buildAdvisorPdf([{ k: 'h2', t: 'סיכום לפגישה' }, li('קורסים שעברתי: דינמיקה (3.5 נ״ז)')], libs);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 5)), '%PDF-');
  const { text } = await read(bytes);
  for (const w of ['סיכום', 'לפגישה', 'קורסים', 'שעברתי', 'דינמיקה', '3.5']) assert.ok(text.includes(w), `${w} in ${text}`);
});

test('the real summary carries its warnings into the file: what is assumed, the rules, conflicts, a pass over a failed prerequisite', async () => {
  const data = mini(),
    state = { passed: ['B', 'Q'], assumed: ['Q'], failed: { A: 1 }, grades: {}, exempt: [], profile: { year: 2 } };
  const blocks = advisorBlocks({ state, data, cls: classify(data, state), catalog: { programs: [] }, approved: null, conflicts: ['מספר נקודות'] });
  const wanted = blocks.filter((b) => b.k === 'li').map((b) => b.t);
  for (const t of ['בהנחה, לא אושרו', 'הכללים לא אושרו על ידי המחלקה', 'יש סתירה בין המקורות', 'וסומן שנכשלת בו'])
    assert.ok(wanted.some((x) => x.includes(t)), t);
  const { bytes, dropped } = await buildAdvisorPdf(blocks, libs);
  assert.deepEqual(dropped, []);
  const out = await read(bytes);
  assert.equal(out.pages, 1);
  for (const w of ['סתירה', 'אושרו', 'בהנחה', 'שנכשלת']) assert.ok(out.text.includes(w), w);
});

test('a typical year pair is one page', async () => {
  const course = (i) => ({ k: 'course', name: `מכניקת זורמים מתקדמת ${i}`, credits: 3.5, groups: [`הרצאה 2100${i}: יום א׳ 08:30–10:00; תרגול 2110${i}: יום ג׳ 14:15–15:45`] });
  const blocks = [
    { k: 'h2', t: 'סיכום לפגישה עם יועץ לימודים' },
    { k: 'p', t: '3.11.2026 · שנת הלימודים תשפ״ז' },
    { k: 'h3', t: 'המצב שלי' },
    ...['שם: דנה לוי', 'תוכנית: הנדסת מכונות', 'שנה ב׳ בלימודים', 'ממוצע: 84.3'].map(li),
    li(`קורסים שעברתי: ${Array.from({ length: 16 }, (_, i) => `חשבון דיפרנציאלי ${i}`).join(', ')}`),
    li(`קורסים בהנחה, לא אושרו: ${Array.from({ length: 6 }, (_, i) => `אנגלית מתקדמים ${i}`).join(', ')}`),
    { k: 'h3', t: 'החלופה שבחרתי' },
    { k: 'h4', t: 'סמסטר א׳' },
    ...[1, 2, 3, 4, 5, 6].map(course),
    { k: 'h4', t: 'סמסטר ב׳' },
    ...[1, 2, 3, 4, 5, 6].map(course),
    { k: 'h3', t: 'שימו לב' },
    li('הכללים לא אושרו על ידי המחלקה.'),
    li('יש סתירה בין המקורות הרשמיים לגבי מספר נקודות הזכות בבחירה.'),
    li('הכלי הוא עזר בלבד. המידע הקובע הוא של המכללה, ויש לבדוק כל שיבוץ בידיעון לפני ההרשמה.')
  ];
  assert.equal((await read((await buildAdvisorPdf(blocks, libs)).bytes)).pages, 1);
});

test('a long summary flows to page 2 and loses nothing', async () => {
  const names = Array.from({ length: 1500 }, (_, i) => `קורס${i}`);
  const { pages, text } = await read((await buildAdvisorPdf([li(names.join(', '))], libs)).bytes);
  assert.ok(pages >= 2, `${pages} pages`);
  assert.equal(text.match(/קורס/g).length, names.length);
});

test('every text item stays inside the margins: a very long word, and bold lines at the width limit', async () => {
  const bold = Array.from({ length: 30 }, () => 'דינמיקה').join(' ');
  const { items } = await read((await buildAdvisorPdf([li('א'.repeat(300)), { k: 'h3', t: bold }, { k: 'course', name: bold, credits: 3, groups: [] }], libs)).bytes);
  for (const i of items) {
    const x = i.transform[4];
    assert.ok(x >= 39 && x + i.width <= 595.28 - 39, `${x} + ${i.width}: ${i.str.slice(0, 20)}`);
  }
});

test('a name in Arabic or Russian prints, without a missing glyph', async () => {
  for (const name of ['ليلى حداد', 'Иван Петров', 'Şule Çelik']) {
    assert.ok(noNotdef(`שם: ${name}`), name);
    const { bytes, dropped } = await buildAdvisorPdf([li(`שם: ${name}`)], libs);
    assert.deepEqual(dropped, [], name);
    assert.ok((await read(bytes)).items.length > 1, name);
  }
});

test('a character no font holds is left out and reported, and nothing is split', async () => {
  const { bytes, dropped } = await buildAdvisorPdf([li('קורס😀 סוף')], libs);
  assert.deepEqual(dropped, ['😀']);
  const { text } = await read(bytes);
  assert.ok(text.includes('קורס') && text.includes('סוף'));
  assert.ok(!/[\ud800-\udfff]/.test(text), 'no lone surrogate');
});

test('a line left with no value is left out', async () => {
  const { bytes, dropped } = await buildAdvisorPdf([li('שם: 😀'), li('ממוצע: 90')], libs);
  assert.deepEqual(dropped, ['😀']);
  const { text } = await read(bytes);
  assert.ok(!text.includes('שם'), text);
  assert.ok(text.includes('ממוצע'));
});

test('a line that really ends in a colon stays', async () => {
  const { text } = await read((await buildAdvisorPdf([li('שם: דנה:')], libs)).bytes);
  assert.ok(text.includes('דנה'), text);
});

test('combining marks are left out: pdf-lib cannot place them', async () => {
  const { bytes, dropped } = await buildAdvisorPdf([li('נִקּוּד'), li('A\u0301 סוף')], libs);
  assert.deepEqual(dropped, []);
  const { text, items } = await read(bytes);
  assert.ok(text.includes('נקוד'), text);
  assert.ok(text.includes('\u00c1'), 'a letter written in two parts joins into one');
  for (const i of items) assert.ok(i.transform[4] + i.width <= 595.28 - 39);
});

test('direction marks steer the text and draw nothing', () => {
  assert.ok(noNotdef('דינמיקה‏ (א)‎'));
  assert.ok(runs('דינמיקה‏').every((r) => !/[‎‏]/.test(r.draw)));
});

test('the file names no author and holds a title for the viewer', async () => {
  const { info } = await read((await buildAdvisorPdf([li('שם: דנה לוי')], libs)).bytes);
  assert.equal(info.Author, undefined);
  assert.equal(info.Title, 'סיכום לפגישה עם יועץ לימודים');
  assert.ok(!JSON.stringify(info).includes('דנה'));
});
