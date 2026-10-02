import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pageKind, throttleUntil, nextDelay, stableJson, dataHash, retryAfterMs, changeSummary } from '../scripts/polite.mjs';
const throttled = readFileSync('scripts/fixtures/throttled.html', 'utf8');
test('pageKind recognises the hourly throttle page and the F5 rejection', () => {
  assert.equal(pageKind(throttled), 'throttled');
  assert.equal(pageKind('<html><title>Request Rejected</title>The requested URL was rejected'), 'rejected');
  assert.equal(pageKind(readFileSync('scripts/fixtures/rejected.html', 'utf8')), 'rejected');
  assert.equal(pageKind('<html><body>קורסים</body></html>'), 'ok');
});
test('throttleUntil reads the retry hour', () => {
  assert.match(throttleUntil(throttled), /^\d{2}:\d{2}$/);
  assert.equal(throttleUntil('<html>ok</html>'), null);
});
test('nextDelay stays within base ± 500', () => {
  assert.equal(nextDelay(2500, () => 0), 2000); assert.equal(nextDelay(2500, () => 0.999999), 2999);
  assert.equal(nextDelay(0, () => 0), 0);
});
test('stableJson drops fetchedAt and is deterministic', () => {
  const a = stableJson({ fetchedAt: '1', year: 2027, courses: {} }), b = stableJson({ fetchedAt: '2', year: 2027, courses: {} });
  assert.equal(a, b); assert.ok(!a.includes('fetchedAt'));
});
test('dataHash is sha256 hex', () => {
  assert.equal(dataHash('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
test('retryAfterMs reads seconds and HTTP dates, null otherwise', () => {
  assert.equal(retryAfterMs('30'), 30000);
  assert.equal(retryAfterMs('Thu, 01 Oct 2026 00:01:00 GMT', Date.parse('Thu, 01 Oct 2026 00:00:00 GMT')), 60000);
  assert.equal(retryAfterMs(null), null);
  assert.equal(retryAfterMs('soon'), null);
});
test('changeSummary counts group delta and groups that became full', () => {
  const ds = (groups) => ({ courses: { c: { groups } } });
  const prev = ds([{ id: 'a', full: false }, { id: 'b', full: false }, { id: 'c', full: true }]);
  const next = ds([{ id: 'a', full: true }, { id: 'b', full: true }, { id: 'c', full: true }, { id: 'd', full: false }]);
  assert.equal(changeSummary(prev, next), '+1 groups, 2 became full');
  assert.equal(changeSummary(null, next), '+4 groups, 3 became full'); // brand-new file: everything is new
  assert.equal(changeSummary(prev, { courses: { c: { groups: [{ id: 'a', full: false }, { id: 'b', full: false }, { id: 'c', full: true }], name: 'x' } } }), 'updated');
});

import { msUntil } from '../scripts/polite.mjs';
test('msUntil: the next HH:MM on Jerusalem time (UTC+3 in October 2026) plus a minute, across midnight too', () => {
  const at = (iso, hhmm) => msUntil(hhmm, new Date(iso)) / 1000;
  assert.equal(at('2026-10-02T17:19:31Z', '21:00'), 40 * 60 + 29 + 60, '20:19:31 Jerusalem -> 21:00');
  assert.equal(at('2026-10-02T20:59:00Z', '00:00'), 60 + 60, '23:59 -> 00:00');
  assert.equal(at('2026-10-02T18:00:00Z', '21:00'), 86400 + 60, 'already 21:00: the next day');
});
