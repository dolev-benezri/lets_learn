import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { discover, draftPrograms } from '../scripts/discover.mjs';

const fx = (n) => readFileSync(`scripts/fixtures/${n}`, 'utf8');
const L = (code, name) => ({ code, name });

test('discover: asks for each department, year and track, in that order, and reads the pages', async () => {
  const asked = [];
  const request = async (query, form) => {
    if (query || form?.PRGNAME === 'Enter_Search') return '';
    asked.push(form.PRGNAME === 'JSON' ? `tracks ${form.Faculty} ${form.Year}` : `lists ${form.HUG} ${form.R1C1} ${form.R1C2}`);
    return form.PRGNAME === 'JSON' ? fx('tracks-20-2026.json') : fx('sprog-20-2026-23.html');
  };
  const found = await discover({ request, depts: [20], years: [2026] });
  assert.equal(asked.length, 1 + 7);
  assert.deepEqual(asked.slice(0, 3), ['tracks 20 2026', 'lists 20 2026 20', 'lists 20 2026 21']);
  assert.equal(found[20][2026].length, 7);
  assert.deepEqual(found[20][2026][3].lists.map((l) => l.code), [20115, 20116]);
});

const found = {
  20: {
    2025: [{ code: 20, name: 'הנדסת חשמל מסלול יום', lists: [L(20001, "קורסי חובה שנה א'")] }, { code: 23, name: 'התמחות הספק', lists: [L(20115, 'הספק-חובה'), L(20116, 'הספק-בחירה')] }],
    2026: [{ code: 20, name: 'הנדסת חשמל מסלול יום', lists: [L(20001, "קורסי חובה שנה א'"), L(60003, 'אנגלית')] },
      { code: 22, name: 'הנדסת חשמל מסלול ערב', lists: [L(22001, "קורסי חובה שנה א'")] },
      { code: 23, name: 'התמחות מערכות הספק', lists: [L(20115, 'הספק-חובה'), L(20116, 'הספק-בחירה')] },
      { code: 21, name: 'התמחות תקשורת', lists: [L(20111, 'תקשורת-חובה'), L(20112, 'תקשורת-בחירה')] },
      { code: 99, name: 'התמחות ריקה', lists: [] }],
  },
  30: { 2026: [{ code: 30, name: 'הנדסה מכנית מסלול יום', lists: [L(30001, "קורסי חובה שנה א'")] },
    { code: 302, name: 'התמחות מערכות רכב', lists: [L(30121, 'רכב-חובה'), L(30122, 'רכב-בחירה'), L(30127, 'רכב-חובה לרכב לבד')] }] },
};

test('draftPrograms: a program per main track, the specializations shared by day and evening, lists and cohorts per year', () => {
  const p = draftPrograms(found);
  assert.deepEqual(Object.keys(p), ['20', '22', '30']);
  assert.deepEqual([p[20].name, p[22].name], ['הנדסת חשמל', 'הנדסת חשמל (ערב)']);
  assert.deepEqual(p[20].cohorts, [2025, 2026]);
  assert.deepEqual(p[20].lists, { 2025: [20001, 20115, 20116], 2026: [20001, 60003, 20115, 20116, 20111, 20112] });
  assert.deepEqual(p[22].cohorts, [2026], 'the evening track only exists from 2026 here');
  assert.deepEqual(p[22].lists[2026], [22001, 20115, 20116, 20111, 20112], 'the evening track uses the same specializations');
  assert.deepEqual(p[20].specializations.map((s) => [s.id, s.mandatory, s.elective]), [['power', 20115, 20116], ['comm', 20111, 20112], ['s99', undefined, undefined]]);
  assert.deepEqual([p[20].dept, p[20].deptName, p[20].specRule, p[20].degree], [20, 'חשמל', { pick: 2, alone: ['power'] }, { total: 160 }]);
  assert.deepEqual(p[30].specializations, [{ id: 'vehicle', name: 'מערכות רכב', mandatory: 30121, elective: 30122, aloneExtra: 30127 }]);
  assert.equal(p[30].anchor, null, 'the anchor course is chosen by hand');
});

test('draftPrograms: several mandatory or elective lists of one area become arrays, a plain area list or a seminar is mandatory', () => {
  const p = draftPrograms({ 10: { 2026: [{ code: 10, name: 'הנדסת תוכנה מסלול יום', lists: [L(10001, "קורסי חובה שנה א'")] },
    { code: 13, name: 'התמחות טכנולוגיות תוכנה ומידע', lists: [L(10101, 'התמחות טכנולוגיות תוכנה ומידע'), L(10102, 'קורסי בחירה נוספים'), L(10103, 'סמינר חובה')] },
    { code: 24, name: 'התמחות עיבוד אותות,עיבוד תמונה', lists: [L(20117, 'חובה'), L(20118, 'בחירה'), L(20133, 'חובה מעבדה')] }] } });
  assert.deepEqual(p[10].specializations, [{ id: 'tech', name: 'טכנולוגיות תוכנה ומידע', mandatory: [10101, 10103], elective: 10102 },
    { id: 'signals', name: 'עיבוד אותות, עיבוד תמונה', mandatory: [20117, 20133], elective: 20118 }]);
});

test('draftPrograms: industrial engineering main and secondary areas get stable ids, spelled-out names and the main+secondary rule', () => {
  const p = draftPrograms({ 40: { 2026: [{ code: 40, name: 'הנדסת תעשייה וניהול מסלול יום', lists: [L(40001, "קורסי חובה שנה א'")] },
    { code: 47, name: 'התמחות ראשית מערכות מידע', lists: [L(40121, 'חובה'), L(40122, 'בחירה')] },
    { code: 49, name: "התמחות ראש' אנליטיקה", lists: [L(40127, 'חובה'), L(40128, 'בחירה')] },
    { code: 407, name: 'התמחות משנית מערכות מידע', lists: [L(40123, 'חובה')] },
    { code: 409, name: "התמחות מש' אנליטיקה", lists: [L(40129, 'חובה')] }] } });
  assert.deepEqual(p[40].specializations.map((s) => [s.id, s.name]), [['mis', 'ראשית מערכות מידע'], ['bi', 'ראשית אנליטיקה'], ['smis', 'משנית מערכות מידע'], ['sbi', 'משנית אנליטיקה']]);
  assert.deepEqual(p[40].specRule, { pick: 1 }, 'one area; programs.json folds the secondary tracks into its electives');
});
