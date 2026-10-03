import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { specCodes } from '../web/rules.js';

const programs = JSON.parse(readFileSync(new URL('../scripts/programs.json', import.meta.url), 'utf8'));
const codesOf = (p, y) => (Array.isArray(p.lists) ? p.lists : p.lists[y]);

for (const [id, p] of Object.entries(programs)) {
  test(`programs.json ${id} ${p.name}: every cohort has lists, specializations point at listed codes, ids are unique`, () => {
    for (const y of p.cohorts ?? []) assert.ok(codesOf(p, y)?.length, `no lists for cohort ${y}`);
    for (const y of p.cohorts ?? []) {
      const have = new Set(codesOf(p, y));
      for (const s of p.specializations ?? []) for (const [, code] of specCodes(s)) assert.ok(have.has(code), `${s.id}: list ${code} is not in the ${y} lists`);
    }
    const ids = (p.specializations ?? []).map((s) => s.id);
    assert.equal(new Set(ids).size, ids.length, 'duplicate specialization id');
    assert.equal(p.specRule?.groups, undefined, 'specRule.groups (main + secondary area) is no longer supported: industrial engineering picks one area');
    assert.ok(p.name && p.deptName && p.degree, 'name, deptName and degree are required');
  });
}
