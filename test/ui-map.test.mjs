import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layoutMap, makeKeep, chainOf, SIZE, nodeRadius, edgePath, G, truncate, edgeEnds, sameLayerPath, geometry, balance, pickCols, fitScale, mapSvg } from '../web/ui-map.js';
import { unlockCounts } from '../web/solver-core.js';
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

test('nodeRadius grows with credits and is clamped', () => {
  assert.equal(nodeRadius(0), 14); assert.equal(nodeRadius(100), 30);
  assert.ok(nodeRadius(5) > nodeRadius(2));
});

test('edgePath is a horizontal-tangent cubic between two points', () => {
  assert.equal(edgePath({ x: 300, y: 50 }, { x: 100, y: 150 }), 'M300,50 C200,50 200,150 100,150');
});

const geo = (keep) => { const L = layoutMap(data, keep), g = geometry(L, (id) => data.courses[id]?.credits); return { L, g }; };

test('truncate: 18 characters including the ellipsis, short names untouched', () => {
  assert.equal(truncate('קצר'), 'קצר');
  assert.equal(truncate('א'.repeat(18)), 'א'.repeat(18));
  assert.equal(truncate('א'.repeat(19)), `${'א'.repeat(17)}…`);
});

test('edgeEnds: leaves the near edge of one circle and enters the near edge of the next, either direction', () => {
  const a = { x: 300, y: 10, hw: 20 }, b = { x: 100, y: 50, hw: 14 };
  assert.deepEqual(edgeEnds(a, b), [{ x: 280, y: 10 }, { x: 114, y: 50 }]);
  assert.deepEqual(edgeEnds(b, a), [{ x: 114, y: 50 }, { x: 280, y: 10 }]);
});

test('sameLayerPath: a bowed cubic between two nodes of one column (edgePath would be a straight line)', () => {
  const d = sameLayerPath({ x: 200, y: 10, hw: 20 }, { x: 200, y: 110, hw: 14 });
  assert.equal(d, `M220,10 C${220 + G.bulge},10 ${214 + G.bulge},110 214,110`);
});

test('fitScale: the whole graph on a desktop (never above 1), by height on a phone (floor 0.3)', () => {
  assert.equal(fitScale(1440, 900, 976, 1000), 0.9); assert.equal(fitScale(1440, 2000, 976, 1000), 1);
  assert.ok(Math.abs(fitScale(800, 900, 1000, 1000) - 0.8) < 1e-9); assert.equal(fitScale(700, 100, 1000, 1000), 0.2);
  assert.ok(Math.abs(fitScale(375, 500, 976, 1100) - 500 / 1100) < 1e-9); assert.equal(fitScale(375, 200, 976, 1100), 0.3);
});

test('geometry: one evenly spread column per layer, same height for all, layer 0 on the right, no overlaps, Tab order by layer', () => {
  const { L, g } = geo();
  const ok = (v) => Number.isFinite(v);
  assert.ok(g.nodes.every((n) => [n.x, n.y, n.r, n.hw].every(ok)) && g.ors.every((o) => [o.x, o.y].every(ok)));
  assert.ok(g.edges.length === L.paths.length && g.edges.every((e) => /^M[-\d.]+,[-\d.]+ C/.test(e.d) && !/NaN|undefined/.test(e.d)));
  assert.ok(g.H < 1500 && g.nodes.every((n) => n.x - n.hw >= 0 && n.x + n.hw <= g.W && n.y - n.r >= 0 && n.y + n.r + 22 <= g.H), `H=${g.H}`); // 22 = the name under the circle
  const at = Object.fromEntries(g.nodes.map((n) => [n.key, n]));
  for (const e of L.edges) assert.ok(e.kind === 'קדם' ? at[e.from].x > at[e.to].x : at[e.from].x >= at[e.to].x, `${e.from} -> ${e.to}`); // balancing keeps every edge flowing leftwards
  const per = Object.values(Object.groupBy(g.nodes, (n) => n.layer)).map((a) => a.length);
  assert.ok(Math.max(...per) - Math.min(...per) <= 2, `columns ${per}`);
  assert.equal(Math.max(...g.nodes.map((n) => n.x)), g.W - G.padX); // layer 0 is the rightmost column
  const all = [...g.nodes, ...g.ors];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y) >= all[i].r + all[j].r, `${all[i].key} / ${all[j].key}`);
  assert.deepEqual(g.nodes.map((n) => n.layer), [...g.nodes.map((n) => n.layer)].sort((a, b) => a - b));
  const tall = new Map(); g.nodes.forEach((n) => tall.set(n.layer, [...(tall.get(n.layer) ?? []), n.y]));
  for (const ys of tall.values()) for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] >= G.row - 1e-6); // evenly spread, never closer than a row
});

test('geometry: a same-layer מקביל edge is bowed, not a straight line through the column', () => {
  const c = (name, prereqs = []) => ({ name, credits: 3, offered: true, prereqs, groups: [] });
  const d = { lists: [{ name: "קורסי חובה שנה א'", courses: ['a', 'b'], minCredits: 0 }], courses: { a: c('A'), b: c('B', [{ kind: 'מקביל', anyOf: [{ id: 'a', name: 'A' }] }]) } };
  const L = layoutMap(d), g = geometry(L, () => 3);
  assert.equal(L.nodes[0].layer, L.nodes[1].layer);
  assert.match(g.edges[0].d, /^M[\d.]+,[\d.]+ C/);
  assert.ok(g.edges[0].d.includes(`${g.nodes[0].x + g.nodes[0].hw + G.bulge}`));
});

test('mapSvg: one button per course in Tab order, labelled and titled; ext pills and "או" circles are not buttons; all text escaped', () => {
  const { L, g } = geo(), st = statuses, doneIds = Object.keys(st).filter((id) => st[id].status === 'done');
  const evil = { ...data, courses: { ...data.courses, [Object.keys(data.courses)[0]]: { ...data.courses[Object.keys(data.courses)[0]], name: '<img onerror=x>' + 'א'.repeat(30) } } };
  const html = mapSvg({ data: evil, st, L, g, year: 2, unlocks: unlockCounts(evil, doneIds), mode: 'all' });
  assert.equal((html.match(/role="button"/g) ?? []).length, Object.keys(data.courses).length);
  assert.equal((html.match(/<title>/g) ?? []).length, g.nodes.length);
  assert.ok(!html.includes('<img') && html.includes('&lt;img'));
  assert.ok(!/NaN|undefined/.test(html));
  assert.ok(!html.includes('class="ml') && html.includes('mine-halo') && html.includes(' mine"'));
  assert.ok(html.includes('class="ext"') && html.includes('class="or"'));
  assert.ok([...html.matchAll(/<g class="(?:ext|or)"[^>]*>/g)].every(([m]) => m.includes('aria-hidden="true"') && !m.includes('role=')));
  for (const s of ['done', 'retake', 'blocked']) if (Object.values(st).some((x) => x.status === s)) assert.ok(html.includes(`st-${s}`));
});

test('pickCols: never fewer columns than layers, at most 12, and more columns for a wider screen', () => {
  assert.equal(pickCols(97, 375, 600, 6), 6);
  assert.ok(pickCols(97, 1440, 760, 6) > 6 && pickCols(97, 2400, 700, 6) <= 12);
  assert.ok(pickCols(97, 2400, 700, 6) >= pickCols(97, 1440, 760, 6));
  assert.equal(pickCols(0, 1440, 760, 1), 1);
});

test('wide layout: 1440x760 fits at 0.8 or more, every edge still flows leftwards, columns are level, nothing overlaps', () => {
  const L = layoutMap(data), mc = pickCols(L.nodes.length, 1440, 760, L.cols), g = geometry(L, (id) => data.courses[id]?.credits, mc);
  assert.ok(mc > L.cols && g.cols > L.cols);
  assert.ok(fitScale(1440, 760, g.W, g.H) >= 0.8, `scale ${fitScale(1440, 760, g.W, g.H)} (${g.W}x${g.H})`);
  const at = Object.fromEntries(g.nodes.map((n) => [n.key, n]));
  for (const e of L.edges) assert.ok(e.kind === 'קדם' ? at[e.from].x > at[e.to].x : at[e.from].x >= at[e.to].x, `${e.from} -> ${e.to}`);
  const per = Object.values(Object.groupBy(g.nodes, (n) => n.layer)).map((a) => a.length);
  assert.ok(Math.max(...per) - Math.min(...per) <= 3, `columns ${per}`);
  const all = [...g.nodes, ...g.ors];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y) >= all[i].r + all[j].r, `${all[i].key} / ${all[j].key}`);
  assert.ok(g.nodes.every((n) => [n.x, n.y].every(Number.isFinite)) && g.W > 0 && g.H > 0);
});
