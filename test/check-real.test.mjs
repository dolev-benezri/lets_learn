// scripts/check-real.mjs: the data rules (layer 2) on synthetic cases and on a 3-program sample of the real data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dataRules, crossProgram } from '../scripts/check-real.mjs';

const req = (...ids) => ({ kind: 'קדם', anyOf: ids.map((id) => ({ id, name: id ?? 'outside' })) });
const c = (...prereqs) => ({ name: 'c', credits: 3, offered: true, prereqs, groups: [{ id: 'g' }] });
const ds = (courses, lists = []) => ({ courses, lists });
const bad = (d) => dataRules(d, 'f.json').errors.map((e) => e.match(/course (\S+)/)?.[1] ?? e).sort();

test('a requirement on a course the file does not have, and a course requiring itself, are errors', () => {
  assert.equal(dataRules(ds({ A: c(req('Z')) }), 'f.json').errors.length >= 1, true);
  assert.ok(dataRules(ds({ A: c(req('A')) }), 'f.json').errors.some((e) => /itself/.test(e)));
});
test('achievability is AND over requirements, OR inside one, a fixed point (not cycle reachability)', () => {
  assert.deepEqual(bad(ds({ A: c(req('B')), B: c(req('A')) })), ['A', 'B']);
  assert.deepEqual(bad(ds({ A: c(req('B')), B: c(req('A', 'C')), C: c() })), [], 'B can come through C');
  assert.deepEqual(bad(ds({ A: c(req('B')), B: c(req('C')), C: c(req('B')) })), ['A', 'B', 'C'], 'a cycle downstream');
  assert.deepEqual(bad(ds({ A: c(req('B')), B: c(req('C', 'D')), C: c(req('A')), D: c() })), [], 'a nested escape');
  assert.deepEqual(bad(ds({ A: c(req('B'), req('C')), B: c(), C: c(req('D')), D: c(req('C')) })), ['A', 'C', 'D'], 'one AND part fails');
  assert.deepEqual(bad(ds({ A: c(req('B', null)), B: c(req('A')) })), [], 'an outside alternative is a route');
});
test('a prerequisite only in a later year\'s mandatory list is unachievable, unless another alternative is earlier', () => {
  const lists = [{ code: 1, name: "חובה שנה א'", courses: ['A', 'E'] }, { code: 2, name: "חובה שנה ב'", courses: ['L'] }];
  assert.deepEqual(bad(ds({ A: c(req('L')), L: c(), E: c() }, lists)), ['A']);
  assert.deepEqual(bad(ds({ A: c(req('L', 'E')), L: c(), E: c() }, lists)), []);
  const onlyA = [{ code: 1, name: "חובה שנה א'", courses: ['A'] }];
  assert.deepEqual(bad(ds({ A: c(req('X')), X: c() }, onlyA)), [], 'a prerequisite in no year list: placement unknown, not an error');
});
test('the same id twice in one requirement is a warning, not an error', () => {
  const r = dataRules(ds({ A: c(req('B', 'B')), B: c() }), 'f.json');
  assert.deepEqual(r.errors, []);
  assert.equal(r.warnings.length, 1);
});
test('crossProgram: a course whose prerequisites differ between programs is one warning', () => {
  const w = crossProgram([['1.json', ds({ A: c(req('B')), B: c() })], ['2.json', ds({ A: c(req('C')), C: c() })], ['3.json', ds({ A: c(req('B')), B: c() })]]);
  assert.equal(w.length, 1);
  assert.match(w[0], /A/);
});
test('the 3 sample programs have no data errors', () => {
  for (const f of ['2027-1/19-2026.json', '2027-1/20-2026.json', '2027-1/30-2026.json']) {
    const d = JSON.parse(readFileSync(new URL(`../web/data/afeka/${f}`, import.meta.url), 'utf8'));
    assert.deepEqual(dataRules(d, f).errors, [], f);
  }
});
