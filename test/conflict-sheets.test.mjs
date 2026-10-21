import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sheets, COLUMNS } from '../scripts/conflict-sheets.mjs';
import { cleanSettings } from '../web/settings.js';

const programs = {
  10: { name: 'הנדסת תוכנה', dept: 10, deptName: 'תוכנה' },
  12: { name: 'הנדסת תוכנה (ערב)', dept: 10, deptName: 'תוכנה' },
  20: { name: 'הנדסת חשמל', dept: 20, deptName: 'חשמל' },
  30: { name: 'הנדסה מכנית', dept: 30, deptName: 'מכנית' },
};
const settings = cleanSettings({ programs: {
  10: { conflicts: [{ cohorts: [2024], text: 'א', plan: 'פ1', yedion: 'י1', tool: 'כ1' }] },
  12: { conflicts: [{ cohorts: [2024, 2025], text: 'ב' }] },
  20: { approved: { 2024: '2026-07-01' } },
} });

test('columns are the five the departments read', () => {
  assert.deepEqual(COLUMNS, ['מה מצאנו', 'תוכנית הלימודים', 'הידיעון', 'מה הכלי עושה היום', 'ההחלטה שלכם']);
});

test('one sheet per department with a conflict, none for the others', () => {
  const s = sheets(settings, programs);
  assert.deepEqual(s.map((x) => [x.dept, x.deptName]), [[10, 'תוכנה']]);
});

test('a department with conflicts in two programs lists both', () => {
  const [s] = sheets(settings, programs);
  assert.ok(s.html.includes('הנדסת תוכנה (ערב)') && s.html.includes('>ב<') && s.html.includes('>א<'));
  assert.equal((s.html.match(/<tr class="row">/g) ?? []).length, 2);
});

test('each sheet has the five columns, an A4 page rule and a blank decision cell', () => {
  const [s] = sheets(settings, programs);
  for (const c of COLUMNS) assert.ok(s.html.includes(`<th>${c}</th>`), c);
  assert.ok(s.html.includes('@page') && s.html.includes('A4'));
  assert.ok(s.html.includes('dir="rtl"'));
});

test('a column with no source reads "לבדיקת המחלקה"; given texts are shown', () => {
  const [s] = sheets(settings, programs);
  assert.equal((s.html.match(/לבדיקת המחלקה/g) ?? []).length, 3, 'program 12 has no plan, yedion or tool text');
  assert.ok(s.html.includes('>פ1<') && s.html.includes('>י1<') && s.html.includes('>כ1<'));
});

test('texts are escaped', () => {
  const st = cleanSettings({ programs: { 10: { conflicts: [{ cohorts: [2024], text: '<img src=x onerror=1>', plan: '"&"' }] } } });
  const [s] = sheets(st, programs);
  assert.ok(!s.html.includes('<img') && s.html.includes('&lt;img') && s.html.includes('&quot;&amp;&quot;'));
});

test('a program missing from programs.json is skipped, not a crash', () => {
  assert.deepEqual(sheets(cleanSettings({ programs: { 99: { conflicts: [{ cohorts: [2024], text: 'x' }] } } }), programs), []);
});

test('the shipped settings: every section-21 conflict fills plan, yedion and tool; one sheet per department', () => {
  const st = cleanSettings(JSON.parse(readFileSync(new URL('../web/settings.json', import.meta.url), 'utf8')));
  const progs = JSON.parse(readFileSync(new URL('../scripts/programs.json', import.meta.url), 'utf8'));
  for (const id of [22, 20, 32, 12, 11, 112, 19]) {
    for (const c of st.programs[id].conflicts) for (const k of ['plan', 'yedion', 'tool']) assert.ok(c[k], `${id} has ${k}`);
  }
  assert.deepEqual(sheets(st, progs).map((s) => s.dept), [10, 11, 19, 20, 30]);
});

test('docs/conflicts holds the sheets the shipped settings build (run npm run report:conflicts after a change)', () => {
  const st = cleanSettings(JSON.parse(readFileSync(new URL('../web/settings.json', import.meta.url), 'utf8')));
  const progs = JSON.parse(readFileSync(new URL('../scripts/programs.json', import.meta.url), 'utf8'));
  for (const s of sheets(st, progs)) assert.equal(readFileSync(new URL(`../docs/conflicts/${s.dept}.html`, import.meta.url), 'utf8'), s.html, `docs/conflicts/${s.dept}.html is stale`);
});
