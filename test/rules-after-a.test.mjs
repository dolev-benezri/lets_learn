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
