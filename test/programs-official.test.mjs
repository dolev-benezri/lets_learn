import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { specRule, validSpecs } from '../web/rules.js';

// Values from Afeka's current curricula (תכנית לימודים תשפ״ז, page 2) and the yedion, as compared on 3.10.2026 (docs/superpowers/plans/2026-10-04-program-config-vs-afeka.md).
// Cohort Y started in year Y. Specialization credits exclude the final project: 160 minus the minCredits of the lists outside the specializations.
const P = JSON.parse(readFileSync('scripts/programs.json', 'utf8'));
const data = (id, y) => JSON.parse(readFileSync(`web/data/afeka/2027-1/${id}-${y}.json`, 'utf8'));
// The numbers that depend on the scraped lists (specialization credits per cohort, computer science reaching 120) live in scripts/audit.mjs (officialDrift):
// a yedion change warns in the nightly scrape instead of failing this suite and holding back the deploy.
test('degree totals: data science is 120', () => assert.equal(P[19].degree.total, 120));

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
