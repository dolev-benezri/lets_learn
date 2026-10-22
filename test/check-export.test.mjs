import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkExport } from '../scripts/check-export.mjs';

const SRC = 'web/data/afeka';
const FILE = '2027-1/30-2026.json';

// One program, one cohort, all three semesters: small enough to copy and break in each test.
function mini(edit = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'export-'));
  for (const n of [1, 2, 3]) {
    mkdirSync(`${dir}/2027-${n}`);
    cpSync(`${SRC}/2027-${n}/30-2026.json`, `${dir}/2027-${n}/30-2026.json`);
  }
  const cat = { year: 2027, programs: [{ id: 30, name: 'הנדסת מכונות', startYears: [2026] }] };
  writeFileSync(`${dir}/catalog.json`, JSON.stringify(cat));
  writeFileSync(`${dir}/status.json`, JSON.stringify({ checkedAt: '2026-10-16T18:08:48.356Z', ok: true }));
  for (const [rel, fn] of Object.entries(edit)) {
    const p = `${dir}/${rel}`;
    if (fn === null) {
      rmSync(p);
      continue;
    }
    writeFileSync(p, JSON.stringify(fn(JSON.parse(readFileSync(p, 'utf8')))));
  }
  return dir;
}
const check = (edit) => {
  const dir = mini(edit);
  try {
    return checkExport(dir);
  } finally {
    rmSync(dir, { recursive: true });
  }
};
const firstGroup = (d) => Object.values(d.courses).flatMap((c) => c.groups)[0];

test('the data the site ships passes', () => {
  assert.deepEqual(checkExport(SRC).errors, []);
});

test('a group without meetings is an error that names its path', () => {
  const { errors } = check({
    [FILE]: (d) => {
      delete firstGroup(d).meetings;
      return d;
    }
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^2027-1\/30-2026\.json: courses\.\d+\.groups\[0\]\.meetings: missing$/);
});

test('an unknown field and a missing seatsLeft / fetchedAt are fine', () => {
  const { errors } = check({
    [FILE]: (d) => {
      delete d.fetchedAt;
      firstGroup(d).roomMap = 'x';
      d.extra = 1;
      return d;
    }
  });
  assert.deepEqual(errors, []);
});

test('a present seatsLeft must be a non-negative integer', () => {
  const { errors } = check({
    [FILE]: (d) => {
      firstGroup(d).seatsLeft = -1;
      return d;
    }
  });
  assert.match(errors.join(), /seatsLeft/);
});

test('a missing catalog.json is an error', () => {
  assert.match(check({ 'catalog.json': null }).errors.join(), /catalog\.json/);
});

test('status.json without checkedAt is an error', () => {
  assert.match(check({ 'status.json': () => ({ ok: true }) }).errors.join(), /status\.json.*checkedAt/);
});

test('semester א is required, ב and summer only warn', () => {
  const { errors, warnings } = check({ '2027-2/30-2026.json': null, '2027-3/30-2026.json': null });
  assert.deepEqual(errors, []);
  assert.equal(warnings.filter((w) => /missing/.test(w)).length, 2);
  assert.match(check({ [FILE]: null }).errors.join(), /2027-1\/30-2026\.json/);
});

test('a file that disagrees with its path is an error', () => {
  assert.match(check({ [FILE]: (d) => ({ ...d, startYear: 2025 }) }).errors.join(), /startYear/);
});

test('compareToPrevious: an export that lost half the courses is flagged against the current data', () => {
  const dir = mini({
    [FILE]: (d) => {
      for (const id of Object.keys(d.courses).slice(0, 60)) delete d.courses[id];
      d.lists = [];
      return d;
    }
  });
  try {
    assert.match(checkExport(dir, { against: SRC }).warnings.join(), /course count dropped/);
  } finally {
    rmSync(dir, { recursive: true });
  }
});

test('an exam without a time yet (time: null) passes; a time not HH:mm fails (J18)', () => {
  const withExam = (time) => ({
    [FILE]: (d) => {
      firstGroup(d).exams = [{ kind: 'בחינה', moed: 1, date: '2027-02-04', time }];
      return d;
    }
  });
  assert.deepEqual(check(withExam(null)).errors, []);
  assert.deepEqual(check(withExam('09:00')).errors, []);
  assert.equal(check(withExam('9:00')).errors.length, 1);
});
