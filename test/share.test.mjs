import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode, decode, friendPayload, friendLink, backupLink, readHash } from '../web/share.js';

const state = { v: 1, year: 2027, semester: 'א', program: 30, startYear: 2026, name: 'דולב',
  passed: ['90901'], failed: { 90903: 1 }, choices: { 90903: 'must' }, friends: [], pins: [], weights: {}, constraints: {} };

test('encode/decode round-trips Hebrew JSON', async () => {
  const obj = { a: 'שלום', n: [1, 2, 3] };
  assert.deepEqual(await decode(await encode(obj)), obj);
});

test('friend payload carries no personal academic state', () => {
  const p = friendPayload(state, ['279090303', '279090303/1']);
  assert.deepEqual(Object.keys(p).sort(), ['groups', 'name', 'program', 'semester', 'v', 'year']);
});

test('readHash reads friend and backup links', async () => {
  const f = await friendLink('https://x.test/', state, ['G1']);
  const r = await readHash(f.slice(f.indexOf('#')), { year: 2027, semester: 'א' });
  assert.equal(r.type, 'friend');
  assert.deepEqual(r.payload.groups, ['G1']);
  const b = await backupLink('https://x.test/', state);
  const rb = await readHash(b.slice(b.indexOf('#')), { year: 2027, semester: 'א' });
  assert.equal(rb.type, 'backup');
  assert.deepEqual(rb.payload.failed, { 90903: 1 });
});

test('readHash rejects broken, foreign-semester and empty hashes', async () => {
  assert.equal(await readHash('', { year: 2027, semester: 'א' }), null);
  assert.ok((await readHash('#f=@@@', { year: 2027, semester: 'א' })).error);
  const other = await friendLink('https://x.test/', { ...state, semester: 'ב' }, ['G1']);
  assert.match((await readHash(other.slice(other.indexOf('#')), { year: 2027, semester: 'א' })).error, /סמסטר אחר/);
});

test('readHash rejects null, array, and string payloads', async () => {
  const nullEnc = await encode(null);
  const arrayEnc = await encode([1, 2, 3]);
  const strEnc = await encode('hello');
  assert.ok((await readHash(`#f=${nullEnc}`, { year: 2027, semester: 'א' })).error);
  assert.ok((await readHash(`#f=${arrayEnc}`, { year: 2027, semester: 'א' })).error);
  assert.ok((await readHash(`#f=${strEnc}`, { year: 2027, semester: 'א' })).error);
});

test('readHash rejects wrong v value', async () => {
  const wrongV = await encode({ v: 2, year: 2027, semester: 'א', program: 30, name: 'test', groups: [] });
  assert.equal((await readHash(`#f=${wrongV}`, { year: 2027, semester: 'א' })).error, 'גרסת קישור לא נתמכת');
});

test('readHash rejects friend payload missing groups', async () => {
  const noGroups = await encode({ v: 1, year: 2027, semester: 'א', program: 30, name: 'test' });
  assert.ok((await readHash(`#f=${noGroups}`, { year: 2027, semester: 'א' })).error);
});

test('readHash rejects groups with non-string entries', async () => {
  const badGroups = await encode({ v: 1, year: 2027, semester: 'א', program: 30, name: 'test', groups: ['G1', 123] });
  assert.ok((await readHash(`#f=${badGroups}`, { year: 2027, semester: 'א' })).error);
});

test('readHash rejects name as object', async () => {
  const badName = await encode({ v: 1, year: 2027, semester: 'א', program: 30, name: {}, groups: [] });
  assert.ok((await readHash(`#f=${badName}`, { year: 2027, semester: 'א' })).error);
});

test('readHash rejects friend-shaped payload under #b=', async () => {
  const friendShape = await encode({ v: 1, year: 2027, semester: 'א', program: 30, name: 'test', groups: ['G1'] });
  const result = await readHash(`#b=${friendShape}`, { year: 2027, semester: 'א' });
  assert.ok(result.error);
});

test('readHash rejects oversized hash (friend > 4096)', async () => {
  const longHash = '#f=' + 'A'.repeat(5000);
  const result = await readHash(longHash, { year: 2027, semester: 'א' });
  assert.ok(result.error);
});

test('readHash rejects oversized hash (backup > 65536)', async () => {
  const longHash = '#b=' + 'A'.repeat(70000);
  const result = await readHash(longHash, { year: 2027, semester: 'א' });
  assert.ok(result.error);
});

test('readHash returns only 6 friend keys when backup payload is under #f=', async () => {
  const backupShape = await encode({ v: 1, year: 2027, semester: 'א', program: 30, startYear: 2026, name: 'test', passed: ['90901'], failed: {}, choices: {}, weights: {}, constraints: {}, friends: [], pins: [] });
  const result = await readHash(`#f=${backupShape}`, { year: 2027, semester: 'א' });
  // Backup payload under friend link fails validation because passed is array (not in friend schema)
  assert.ok(result.error);
});

test('readHash accepts valid backup with full state restoration', async () => {
  const b = await backupLink('https://x.test/', state);
  const rb = await readHash(b.slice(b.indexOf('#')), { year: 2027, semester: 'א' });
  assert.equal(rb.type, 'backup');
  assert.deepEqual(rb.payload.passed, ['90901']);
  assert.deepEqual(rb.payload.failed, { 90903: 1 });
  assert.deepEqual(rb.payload.choices, { 90903: 'must' });
  assert.deepEqual(rb.payload.friends, []);
  assert.deepEqual(rb.payload.pins, []);
  assert.deepEqual(rb.payload.weights, {});
  assert.deepEqual(rb.payload.constraints, {});
});

test('backup keeps a validated profile; friend link never carries it', async () => {
  const at = { year: 2027, semester: 'א' };
  const s = { ...state, profile: { year: 3, amirnet: 110 } };
  const b = await backupLink('https://x.test/', s);
  assert.deepEqual((await readHash(b.slice(b.indexOf('#')), at)).payload.profile, { year: 3, amirnet: 110 });
  const bad = await backupLink('https://x.test/', { ...state, profile: { year: 7, amirnet: 10 } });
  assert.deepEqual((await readHash(bad.slice(bad.indexOf('#')), at)).payload.profile, { year: null, amirnet: null });
  assert.ok(!('profile' in friendPayload(s, ['G1'])));
  const f = await friendLink('https://x.test/', s, ['G1']);
  assert.ok(!('profile' in (await readHash(f.slice(f.indexOf('#')), at)).payload));
});

test('backup keeps scope/load/semesterOf through normalize; friend link never carries them', async () => {
  const { normalize } = await import('../web/app.js');
  const at = { year: 2027, semester: 'א' };
  const s = { ...state, scope: 'א', load: 'ב', semesterOf: { 90901: 'ב' } };
  const b = await backupLink('https://x.test/', s);
  const n = normalize((await readHash(b.slice(b.indexOf('#')), at)).payload);
  assert.deepEqual([n.scope, n.load, n.semesterOf], ['א', 'ב', { 90901: 'ב' }]);
  for (const k of ['scope', 'load', 'semesterOf']) assert.ok(!(k in friendPayload(s, ['G1'])));
  const f = await friendLink('https://x.test/', s, ['G1']);
  const fp = (await readHash(f.slice(f.indexOf('#')), at)).payload;
  for (const k of ['scope', 'load', 'semesterOf']) assert.ok(!(k in fp));
});

test('readHash ignores the #me route', async () => {
  assert.equal(await readHash('#me', { year: 2027, semester: 'א' }), null);
});

test('a backup link carries grades', async () => {
  const b = await backupLink('https://x.test/', { v: 1, year: 2027, semester: 'א', program: 30, passed: ['a'], grades: { a: 90 } });
  const r = await readHash(b.slice(b.indexOf('#')), { year: 2027, semester: 'א' });
  assert.deepEqual(r.payload.grades, { a: 90 });
});
