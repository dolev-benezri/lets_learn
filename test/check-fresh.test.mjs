import { test } from 'node:test';
import assert from 'node:assert/strict';
import { staleReason, fetchStatus, check } from '../scripts/check-fresh.mjs';

const NOW = Date.parse('2026-11-04T05:41:00Z');
const ago = (hours) => ({ checkedAt: new Date(NOW - hours * 36e5).toISOString() });

test('staleReason: a check up to 48 hours old is fine, a minute more is not', () => {
  assert.equal(staleReason(ago(6), NOW), null);
  assert.equal(staleReason(ago(48), NOW), null);
  assert.match(staleReason(ago(48 + 1 / 60), NOW), /too old/);
});

test('staleReason: the limit can be set, and 0 fails anything (the mail test)', () => {
  assert.equal(staleReason(ago(6), NOW, 12), null);
  assert.match(staleReason(ago(13), NOW, 12), /too old/);
  assert.match(staleReason(ago(1), NOW, 0), /on purpose/);
  assert.match(staleReason(ago(-0.5), NOW, 0), /on purpose/, 'also with a clock a little ahead');
});

test('staleReason: a missing, broken or future stamp is no proof of life', () => {
  for (const bad of [null, {}, { checkedAt: null }, { checkedAt: 5 }, { checkedAt: 'never' }])
    assert.match(staleReason(bad, NOW), /no valid checkedAt/, JSON.stringify(bad));
  assert.match(staleReason(ago(-2), NOW), /future/);
  assert.equal(staleReason(ago(-0.5), NOW), null, 'a clock half an hour apart is not an alarm');
});

const answer = (json, ok = true, status = 200) => ({ ok, status, json: async () => json });
const quick = { wait: 0, timeout: 50 };

test('check: passes on a fresh status, and fails on an old one, a bad limit or no status', async () => {
  const site = (json) => async () => answer(json);
  await check(48, { ...quick, fetch: site(ago(6)), now: NOW });
  await assert.rejects(check(48, { ...quick, fetch: site(ago(49)), now: NOW }), /too old/);
  await assert.rejects(check(0, { ...quick, fetch: site(ago(1)), now: NOW }), /on purpose/);
  for (const bad of [NaN, -1]) await assert.rejects(check(bad, { ...quick, fetch: site(ago(1)), now: NOW }), /bad hours/);
  await assert.rejects(check(48, { ...quick, fetch: async () => answer(null, false, 500), now: NOW }), /status unavailable/);
});

test('fetchStatus: a passing blip is retried, so it is not reported as old data', async () => {
  let n = 0;
  const fetch = async () => {
    n++;
    if (n === 1) throw new Error('reset');
    if (n === 2) return answer(null, false, 503);
    return answer({ checkedAt: 'x' });
  };
  assert.deepEqual(await fetchStatus('u', { ...quick, fetch }), { checkedAt: 'x' });
  assert.equal(n, 3);
});

test('fetchStatus: after three tries it says the status is unavailable, not that the data is old', async () => {
  let n = 0;
  const fetch = async () => {
    n++;
    return answer(null, false, 404);
  };
  await assert.rejects(fetchStatus('u', { ...quick, fetch }), /status unavailable: HTTP 404/);
  assert.equal(n, 3);
  const notJson = async () => ({ ok: true, status: 200, json: async () => JSON.parse('<html>') });
  await assert.rejects(fetchStatus('u', { ...quick, fetch: notJson }), /status unavailable/);
});

test('fetchStatus: a server that never answers is given up on', async () => {
  const fetch = (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
  await assert.rejects(fetchStatus('u', { ...quick, fetch }), /status unavailable/);
});
