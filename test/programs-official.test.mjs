import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { progressInfo } from '../web/map-layout.js';
import { specRule, validSpecs } from '../web/rules.js';

// Values from Afeka's current curricula (תכנית לימודים תשפ״ז, page 2) and the yedion, as compared on 3.10.2026 (docs/superpowers/plans/2026-10-04-program-config-vs-afeka.md).
// Cohort Y started in year Y. Specialization credits exclude the final project: 160 minus the minCredits of the lists outside the specializations.
const P = JSON.parse(readFileSync('scripts/programs.json', 'utf8'));
const data = (id, y) => JSON.parse(readFileSync(`web/data/afeka/2027-1/${id}-${y}.json`, 'utf8'));
const SPEC = { 30: [21.5, 27, 27, 27], 32: [23, 29.5, 27, 27], 20: [22.5, 23, 24, 24], 22: [21, 24, 19, 19], 10: [23, 20, 23, 23], 12: [15, 20, 22, 23],
  40: [23, 21.5, 23, 23], 42: [28, 21.5, 23, 23], 50: [17, 14.5, 17, 17] };

test('specialization credits follow each cohort, not one number per program', () => {
  for (const [id, want] of Object.entries(SPEC)) {
    [2024, 2025, 2026, 2027].forEach((y, i) => {
      const d = data(id, y);
      // every area at once: the pool is large enough that the derived number shows whole (one area can hold less: medical engineering)
      assert.equal(progressInfo(d, {}, new Set(), d.specializations.map((s) => s.id)).specLeft, want[i], `${id}-${y}`);
    });
  }
});

test('degree totals: data science is 120, and electives with minCredits 0 count up to 120', () => {
  assert.equal(P[19].degree.total, 120);
  // the cohorts whose electives list has minCredits 0 (the older cohorts lack retired courses in the data: named as untracked, see L4)
  for (const [id, y] of [[11, 2027], [112, 2026], [112, 2027], [19, 2027]]) {
    const d = data(id, y), all = Object.fromEntries(Object.keys(d.courses).map((c) => [c, { status: 'done' }]));
    assert.equal(progressInfo(d, all).done, 120, `${id}-${y}`);
  }
});

test('areas and pick rules match the curricula', () => {
  assert.deepEqual(P[32].specializations.map((s) => s.id), ['solid', 'flow', 'vehicle'], 'mechanical evening offers three areas');
  for (const id of [10, 12]) assert.equal(P[id].specializations.find((s) => s.id === 'mobile').name, 'ממשקי משתמש וחוויית שימוש');
  for (const id of [40, 42]) {
    const d = data(id, 2027);
    assert.equal(specRule(d).pick, 1);
    assert.deepEqual(d.specializations.map((s) => s.id), ['mis', 'dss', 'bi']);
    assert.deepEqual(validSpecs(d, ['bi']), ['bi']);
    // the chosen area's seminar and electives, plus the other two areas' courses for students of another area ("משנית")
    assert.deepEqual(P[id].specializations.find((s) => s.id === 'mis').elective, [40122, 40126, 40129]);
  }
});

test('master\'s programs 61 and 65 are out of the config, the catalog and the data', () => {
  const catalog = JSON.parse(readFileSync('web/data/afeka/catalog.json', 'utf8')).programs.map((p) => p.id);
  for (const id of [61, 65]) {
    assert.equal(P[id], undefined);
    assert.ok(!catalog.includes(id));
    assert.ok(!existsSync(`web/data/afeka/2027-1/${id}-2027.json`));
  }
  assert.deepEqual(catalog.sort((a, b) => a - b), Object.keys(P).map(Number).sort((a, b) => a - b));
});

test('every program is checked against its official curriculum', () => {
  for (const [id, p] of Object.entries(P)) {
    assert.equal(p.verified, true, id);
    assert.equal(p.degree.specCredits, undefined, `${id}: specialization credits come from the cohort's lists`);
    assert.equal(p.specRule?.verified, undefined, id);
  }
});
