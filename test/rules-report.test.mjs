import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { rulesHtml, indexHtml, main } from '../scripts/rules-report.mjs';
import { approvedOn, cleanSettings } from '../web/settings.js';
import { approvedText, esc, heb } from '../web/ui-text.js';

const data = JSON.parse(readFileSync('web/data/afeka/2027-1/30-2026.json', 'utf8'));
const entry = { id: 30, name: 'הנדסה מכנית', startYears: [2026] };
const settings = cleanSettings({ programs: { 30: { approved: { 2026: '2026-10-05' }, conflicts: [{ cohorts: [2026], text: 'סתירה לדוגמה' }] } } });
const html = rulesHtml(data, entry, cleanSettings({}));

test('rulesHtml: program, cohort and total credits', () => {
  assert.match(html, /הנדסה מכנית/);
  assert.match(html, /מחזור 2026/);
  assert.match(html, new RegExp(`${data.degree.total} נ״ז`));
});

test('rulesHtml: every list with its minimum credits and every course id', () => {
  for (const l of data.lists) {
    assert.ok(html.includes(esc(heb(l.name))), l.name);
    assert.ok(html.includes(`לפחות ${l.minCredits} נ״ז`), `${l.name} minimum`);
    for (const id of l.courses) assert.ok(html.includes(`>${id}<`), `${l.name}: ${id}`);
  }
});

test('rulesHtml: each course shows its prerequisites by name', () => {
  const listed = new Set(data.lists.flatMap((l) => l.courses));
  let seen = 0;
  for (const id of listed) for (const p of data.courses[id]?.prereqs ?? []) for (const a of p.anyOf) { seen++; assert.ok(html.includes(esc(heb(a.name))), a.name); }
  assert.ok(seen > 0);
});

test('rulesHtml: the specialization rule, the signature block, no approval when none is listed', () => {
  assert.match(html, /בוחרים 2 תחומי התמחות/);
  assert.match(html, /מערכות רכב/); // the area that can be chosen alone
  assert.ok(html.includes('אישור המחלקה: שם ________ תפקיד ________ תאריך ________ חתימה ________'));
  assert.ok(!html.includes('אושר על ידי המחלקה'));
});

test('rulesHtml: an approved cohort says so; open conflicts are listed; text is escaped', () => {
  const h = rulesHtml(data, { ...entry, name: 'א<b>ב' }, settings);
  assert.ok(h.includes('אושר על ידי המחלקה, 5.10.2026'));
  assert.ok(h.includes('סתירה לדוגמה'));
  assert.ok(!h.includes('א<b>ב') && h.includes('א&lt;b&gt;ב'));
});

test('indexHtml: links a program per cohort and says when a data file is missing', () => {
  const h = indexHtml([{ entry, files: [{ startYear: 2026, found: true }, { startYear: 2027, found: false }] }], settings);
  assert.ok(h.includes('href="30-2026.html"'));
  assert.ok(h.includes('לא נמצא קובץ נתונים'));
  assert.ok(!h.includes('href="30-2027.html"'));
});

test('approvedOn: the date for a listed cohort, null otherwise', () => {
  assert.equal(approvedOn(settings, 30, 2026), '2026-10-05');
  assert.equal(approvedOn(settings, 30, 2025), null);
  assert.equal(approvedOn(settings, 31, 2026), null);
  assert.equal(approvedOn(cleanSettings(null), 30, 2026), null);
  assert.equal(approvedOn(settings, '__proto__', 2026), null);
  assert.equal(approvedText('2026-10-05'), 'אושר על ידי המחלקה, 5.10.2026');
});

test('main: writes a page per found data file and marks a missing one in the index', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'rules-'));
  try {
    mkdirSync(`${root}/data/afeka/2027-1`, { recursive: true });
    writeFileSync(`${root}/data/afeka/catalog.json`, JSON.stringify({ year: 2027, programs: [{ id: 30, name: 'הנדסה מכנית', startYears: [2026, 2027] }] }));
    copyFileSync('web/data/afeka/2027-1/30-2026.json', `${root}/data/afeka/2027-1/30-2026.json`);
    const programs = main(root, `${root}/out`);
    assert.deepEqual(programs[0].files, [{ startYear: 2026, found: true }, { startYear: 2027, found: false }]);
    assert.ok(existsSync(`${root}/out/30-2026.html`) && !existsSync(`${root}/out/30-2027.html`));
    assert.match(readFileSync(`${root}/out/index.html`, 'utf8'), /2027 \(לא נמצא קובץ נתונים\)/);
  } finally { rmSync(root, { recursive: true }); }
});
