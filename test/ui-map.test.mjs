import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layoutMap, makeKeep, chainOf, SIZE } from '../web/ui-map.js';
import { yearView } from '../web/app.js';
import { classify, withAfterA } from '../web/rules.js';

const read = (s) => JSON.parse(readFileSync(new URL(`../web/data/afeka/2027-${s}/30-2026.json`, import.meta.url), 'utf8'));
const A = read(1), B = read(2);
const data = { ...yearView(A, B), fetchedAt: A.fetchedAt };
const state = { passed: data.lists[0].courses, failed: { [data.lists[1].courses[0]]: 1 }, profile: { year: 2, amirnet: 110 } };
const statuses = withAfterA(data, state, classify(data, state)).statuses;

test('layout: every קדם edge goes to a strictly higher layer, מקביל to the same or a higher one', () => {
  const L = layoutMap(data), at = Object.fromEntries(L.nodes.map((n) => [n.key, n.layer]));
  assert.ok(L.edges.length > 40);
  for (const e of L.edges) {
    assert.ok(e.kind === 'קדם' ? at[e.from] < at[e.to] : at[e.from] <= at[e.to], `${e.from} -> ${e.to} (${e.kind})`);
  }
});

test('layout: "או" diamonds only for requirements with more than one distinct option', () => {
  const L = layoutMap(data);
  const multi = Object.values(data.courses).flatMap((c) => c.prereqs).filter((p) => new Set(p.anyOf.map((a) => a.id ?? a.name)).size > 1).length;
  assert.equal(L.diamonds.length, multi);
  for (const d of L.diamonds) assert.ok(L.edges.filter((e) => e.via === d.key).length >= 2, d.key);
  // 30163 lists the same parallel option twice: no diamond for it
  assert.ok(!L.diamonds.some((d) => d.key.startsWith('or:30163:2')));
});

test('layout: outside-the-program prerequisites become ext nodes, one per lane and name', () => {
  const L = layoutMap(data);
  const ext = L.nodes.filter((n) => n.type === 'ext');
  assert.ok(ext.length > 0);
  assert.equal(new Set(ext.map((n) => n.key)).size, ext.length);
  assert.ok(ext.every((n) => n.name && L.edges.some((e) => e.from === n.key)));
  assert.ok(ext.some((n) => n.name.includes('מכינה')));
});

test('layout: nothing overlaps, everything sits inside the canvas, nodes stay in their lane', () => {
  const L = layoutMap(data), S = SIZE;
  const boxes = [...L.nodes, ...L.diamonds];
  for (const b of boxes) assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= L.width && b.y + b.h <= L.height, b.key);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${a.key} overlaps ${b.key}`);
  }
  for (const n of L.nodes) { const l = L.lanes.find((x) => x.i === n.lane); assert.ok(n.y >= l.top && n.y + n.h <= l.y + l.h - S.lanePad + 1, n.key); }
  assert.equal(L.nodes.filter((n) => n.type === 'course').length, Object.keys(data.courses).length);
  assert.ok(L.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
});

test('layout: RTL, roots on the right and the flow runs leftwards', () => {
  const L = layoutMap(data);
  for (const p of L.edges) {
    const a = L.nodes.find((n) => n.key === p.from), b = L.nodes.find((n) => n.key === p.to);
    if (a.layer < b.layer) assert.ok(a.x > b.x);
  }
});

test('filter "מה שנשאר לי" drops done and exempt courses (and their edges); "year" keeps one list', () => {
  const keep = makeKeep('remaining', data, statuses, 2);
  const L = layoutMap(data, keep);
  const ids = new Set(L.nodes.filter((n) => n.type === 'course').map((n) => n.id));
  for (const [id, s] of Object.entries(statuses)) assert.equal(ids.has(id), !['done', 'exempt'].includes(s.status), id);
  assert.ok(ids.size < Object.keys(data.courses).length);
  assert.ok(L.edges.every((e) => ids.has(e.to) && (L.nodes.find((n) => n.key === e.from).type === 'ext' || ids.has(e.from))));
  const Y = layoutMap(data, makeKeep('year', data, statuses, 2));
  assert.deepEqual(new Set(Y.nodes.filter((n) => n.type === 'course').map((n) => n.id)), new Set(data.lists[1].courses));
  assert.equal(Y.lanes.length, 1);
});

test('layout: a tiny graph with an alternative, a parallel course and a cycle still terminates', () => {
  const c = (name, prereqs = []) => ({ name, credits: 3, offered: true, prereqs, groups: [] });
  const d = { lists: [{ name: "קורסי חובה שנה א'", courses: ['a', 'b', 'c', 'd', 'e'], minCredits: 0 }], courses: {
    a: c('A'), b: c('B'), c: c('C', [{ kind: 'קדם', anyOf: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }]),
    d: c('D', [{ kind: 'מקביל', anyOf: [{ id: 'c', name: 'C' }] }, { kind: 'קדם', anyOf: [{ id: null, name: 'חוץ' }] }]),
    e: c('E', [{ kind: 'מקביל', anyOf: [{ id: 'd', name: 'D' }] }]),
  } };
  d.courses.a.prereqs = [{ kind: 'מקביל', anyOf: [{ id: 'e', name: 'E' }] }]; // a -> e -> d -> c -> a cycle through parallels
  const L = layoutMap(d);
  assert.equal(L.diamonds.length, 1);
  assert.equal(L.nodes.filter((n) => n.type === 'ext').length, 1);
  assert.ok(L.paths.every((p) => /^M/.test(p.d)));
});

test('chainOf: all upstream and downstream, nothing from siblings', () => {
  const paths = [['a', 'b'], ['b', 'c'], ['x', 'c'], ['c', 'd'], ['b', 'e'], ['z', 'y']].map(([from, to], id) => ({ id, from, to }));
  const r = chainOf(paths, 'c');
  assert.deepEqual([...r.nodes].sort(), ['a', 'b', 'c', 'd', 'x']);
  assert.deepEqual([...r.paths].sort(), [0, 1, 2, 3]);
});
