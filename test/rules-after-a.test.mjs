import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify, withAfterA } from '../web/rules.js';

// searchYear counts every א׳ candidate as passed for ב׳, a conditional one too (modeFor plans it), and plans Z after
// X + Y. The year view must not call Z blocked then.
test('withAfterA: a prerequisite that is conditional in א׳ (its parallel course is there too) still makes afterA', () => {
  const c = (name, semesters, prereqs = []) => ({ name, credits: 3, offered: true, semesters, groups: [], prereqs });
  const data = {
    year: 2027, startYear: 2026, semester: 'שנה', lists: [], courses: {
      Y: c('Y', ['א']),
      X: c('X', ['א'], [{ kind: 'מקביל', anyOf: [{ id: 'Y', name: 'Y' }] }]),
      Z: c('Z', ['ב'], [{ kind: 'קדם', anyOf: [{ id: 'X', name: 'X' }] }]),
    },
  };
  const state = { passed: [], failed: {} };
  const r = withAfterA(data, state, classify(data, state)).statuses;
  assert.equal(r.X.status, 'conditional');
  assert.equal(r.Z.status, 'afterA');
  assert.deepEqual(r.Z.reasons, ['אפשר בסמסטר ב׳ אחרי X']);
});

// Audit 2026-10-23 #42: "רק ב׳" shows the ב׳ file alone. With the א׳ file at hand it makes the same assumption as the
// year view, so a ב׳ course that only waits for an א׳ candidate is not blocked.
import { readFileSync } from 'node:fs';
import { normalize } from '../web/app.js';
const real = (sem) => JSON.parse(readFileSync(new URL(`../web/data/afeka/2027-${sem}/30-2026.json`, import.meta.url), 'utf8'));
test('withAfterA on a single ב׳ file: mechanical 2026 year 1 opens the year-view courses', () => {
  const A = real(1), B = real(2);
  const state = normalize({ v: 1, program: 30, startYear: 2026, profile: { year: 1 } }, { year: 2027, programs: [{ id: 30, startYears: [2026] }] });
  const ids = ['סטטיקה של גוף קשיח', 'חשבון דיפרנציאלי אינטגרלי2', "משוואות דיפ' רגילות"]
    .map((n) => Object.keys(B.courses).find((id) => B.courses[id].name === n));
  assert.equal(ids.filter(Boolean).length, 3);
  const withA = withAfterA(B, state, classify(B, state), A).statuses;
  const alone = withAfterA(B, state, classify(B, state)).statuses;
  for (const id of ids) {
    assert.equal(withA[id].status, 'afterA', B.courses[id].name);
    assert.match(withA[id].reasons[0], /^אפשר בסמסטר ב׳ אחרי /);
    assert.equal(alone[id].status, 'blocked', B.courses[id].name);
  }
});
