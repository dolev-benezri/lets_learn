import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layoutMap, makeKeep, chainOf, nodeRadius, edgePath, G, truncate, edgeEnds, sameColPath, geometry, fitScale, mapSvg, courseYears, asideIds } from '../web/ui-map.js';
import { unlockCounts } from '../web/solver-core.js';
import { yearView } from '../web/app.js';
import { classify, withAfterA } from '../web/rules.js';

const read = (s) => JSON.parse(readFileSync(new URL(`../web/data/afeka/2027-${s}/30-2026.json`, import.meta.url), 'utf8'));
const A = read(1), B = read(2);
const data = { ...yearView(A, B), fetchedAt: A.fetchedAt };
const state = { passed: data.lists[0].courses, failed: { [data.lists[1].courses[0]]: 1 }, profile: { year: 2, amirnet: 110 } };
const statuses = withAfterA(data, state, classify(data, state)).statuses;
const geo = (keep) => { const L = layoutMap(data, keep), g = geometry(L, (id) => data.courses[id]?.credits); return { L, g }; };
const mini = (courses) => ({ lists: [{ name: "קורסי חובה שנה א'", courses: Object.keys(courses), minCredits: 0 }], courses });
const mc = (name, prereqs = []) => ({ name, credits: 3, offered: true, prereqs, groups: [] });

test('layout: a קדם edge from an earlier study year always flows leftwards, almost every other edge does too', () => {
  const { L, g } = geo(), at = Object.fromEntries(g.nodes.map((n) => [n.key, n]));
  assert.ok(L.paths.length > 40);
  const real = L.paths.filter((e) => at[e.from] && at[e.to]);
  for (const e of real) if (at[e.from].year && at[e.to].year && at[e.from].year < at[e.to].year) assert.ok(at[e.from].x > at[e.to].x, `${e.from} -> ${e.to}`);
  assert.ok(real.filter((e) => at[e.from].x < at[e.to].x).length <= real.length * 0.05);
});

test('layout: "או" diamonds only for requirements with more than one distinct option', () => {
  const L = layoutMap(data);
  const multi = Object.values(data.courses).flatMap((c) => c.prereqs).filter((p) => new Set(p.anyOf.map((a) => a.id ?? a.name)).size > 1).length;
  assert.equal(L.diamonds.length, multi);
  for (const d of L.diamonds) assert.ok(L.paths.filter((e) => e.to === d.key || e.from === d.key).length >= 3, d.key); // two options in, one out
  // 30163 lists the same parallel option twice: no diamond for it
  assert.ok(!L.diamonds.some((d) => d.key.startsWith('or:30163:2')));
});

test('layout: outside-the-program prerequisites become ext nodes, one per band and name', () => {
  const L = layoutMap(data);
  const ext = L.nodes.filter((n) => n.type === 'ext');
  assert.ok(ext.length > 0);
  assert.equal(new Set(ext.map((n) => n.key)).size, ext.length);
  assert.ok(ext.every((n) => n.name && L.paths.some((e) => e.from === n.key)));
  assert.ok(ext.some((n) => n.name.includes('מכינה')));
});

test('layout: one band per study year, א׳ rightmost; the electives band comes last (leftmost); semester א right of ב; columns run by depth', () => {
  const { L, g } = geo();
  assert.deepEqual(L.bands.map((b) => b.year), [1, 2, 3, 4, null]);
  assert.deepEqual(L.bands.map((b) => b.name), ['שנה א׳', 'שנה ב׳', 'שנה ג׳', 'שנה ד׳', 'קורסי בחירה']);
  assert.deepEqual(g.bands.map((b) => b.x), [...g.bands.map((b) => b.x)].sort((a, b) => b - a)); // later bands further left
  assert.ok(g.bands.every((b, i) => i === 0 || b.x + b.w < g.bands[i - 1].x)); // a gap between bands
  const yr = courseYears(data);
  for (const n of g.nodes.filter((n) => n.type === 'course')) {
    const b = g.bands[L.bands.findIndex((x) => n.col >= x.first && n.col < x.first + x.n)];
    assert.equal(b.year, yr.get(n.id) ?? null, n.id);
    assert.ok(n.x > b.x && n.x < b.x + b.w);
  }
  g.bands.forEach((b) => { if (b.cols.length === 2) assert.ok(b.cols[0].x > b.cols[1].x && b.cols[0].label.includes('א') && b.cols[1].label.includes('ב')); });
  for (let c = 0; c < L.cols.length; c++) { const d = L.nodes.filter((n) => n.col === c).map((n) => n.depth); assert.deepEqual(d, [...d].sort((a, b) => a - b)); }
  assert.equal(L.nodes.filter((n) => n.type === 'course').length, Object.keys(data.courses).length);
});

test('filter "מה שנשאר לי" drops done and exempt courses (and their edges); "year" keeps one list', () => {
  const keep = makeKeep('remaining', data, statuses, 2);
  const L = layoutMap(data, keep);
  const ids = new Set(L.nodes.filter((n) => n.type === 'course').map((n) => n.id));
  for (const [id, s] of Object.entries(statuses)) assert.equal(ids.has(id), !['done', 'exempt'].includes(s.status), id);
  assert.ok(ids.size < Object.keys(data.courses).length);
  assert.ok(L.paths.every((e) => (ids.has(e.to) || e.to.startsWith('or:')) && (ids.has(e.from) || e.from.startsWith('or:') || L.nodes.find((n) => n.key === e.from)?.type === 'ext')));
  const Y = layoutMap(data, makeKeep('year', data, statuses, 2));
  assert.deepEqual(new Set(Y.nodes.filter((n) => n.type === 'course').map((n) => n.id)), new Set(data.lists[1].courses));
  assert.equal(Y.bands.length, 1);
});

test('layout: a tiny graph with an alternative, a parallel course and a cycle still terminates', () => {
  const d = { lists: [{ name: "קורסי חובה שנה א'", courses: ['a', 'b', 'c', 'd', 'e'], minCredits: 0 }], courses: {
    a: mc('A'), b: mc('B'), c: mc('C', [{ kind: 'קדם', anyOf: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] }]),
    d: mc('D', [{ kind: 'מקביל', anyOf: [{ id: 'c', name: 'C' }] }, { kind: 'קדם', anyOf: [{ id: null, name: 'חוץ' }] }]),
    e: mc('E', [{ kind: 'מקביל', anyOf: [{ id: 'd', name: 'D' }] }]),
  } };
  d.courses.a.prereqs = [{ kind: 'מקביל', anyOf: [{ id: 'e', name: 'E' }] }]; // a -> e -> d -> c -> a cycle through parallels
  const L = layoutMap(d);
  assert.equal(L.diamonds.length, 1);
  assert.equal(L.nodes.filter((n) => n.type === 'ext').length, 1);
  assert.ok(L.paths.every((p) => p.from && p.to) && geometry(L, () => 3).edges.every((e) => /^M/.test(e.d)));
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

test('sameColPath: a bowed cubic between two nodes of one column (edgePath would be a straight line), further out for a longer hop', () => {
  const k = G.bulge + 100 / 6, d = sameColPath({ x: 200, y: 10, hw: 20 }, { x: 200, y: 110, hw: 14 });
  assert.equal(d, `M220,10 C${220 + k},10 ${214 + k},110 214,110`);
  assert.ok(sameColPath({ x: 0, y: 0, hw: 10 }, { x: 0, y: 600, hw: 10 }).includes(`C${10 + G.bulge + 40},`)); // capped
});

test('fitScale: the whole graph on a desktop (never above 1), by height on a phone (floor 0.3)', () => {
  assert.equal(fitScale(1440, 900, 976, 1000), 0.9); assert.equal(fitScale(1440, 2000, 976, 1000), 1);
  assert.ok(Math.abs(fitScale(800, 900, 1000, 1000) - 0.8) < 1e-9); assert.equal(fitScale(700, 100, 1000, 1000), 0.2);
  assert.ok(Math.abs(fitScale(375, 500, 976, 1100) - 500 / 1100) < 1e-9); assert.equal(fitScale(375, 200, 976, 1100), 0.3);
});

test('geometry: columns right to left by band, finite, inside the canvas, no overlaps, Tab order by column then top to bottom', () => {
  const { L, g } = geo(), ok = (v) => Number.isFinite(v);
  assert.ok(g.nodes.every((n) => [n.x, n.y, n.r, n.hw].every(ok)) && g.ors.every((o) => [o.x, o.y].every(ok)));
  assert.ok(g.edges.length === L.paths.length && g.edges.every((e) => /^M[-\d.]+,[-\d.]+ C/.test(e.d) && !/NaN|undefined/.test(e.d)));
  assert.ok(g.nodes.every((n) => n.x - n.hw >= 0 && n.x + n.hw <= g.W && n.y - n.r >= g.head && n.y + n.r + 22 <= g.H)); // 22 = the name under the circle; the band headers sit above g.head
  assert.ok(g.bands.every((b) => b.x >= 0 && b.x + b.w <= g.W));
  const all = [...g.nodes, ...g.ors];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y) >= all[i].r + all[j].r, `${all[i].key} / ${all[j].key}`);
  assert.deepEqual(g.nodes.map((n) => n.col), [...g.nodes.map((n) => n.col)].sort((a, b) => a - b));
  for (const col of Object.values(Object.groupBy(g.nodes, (n) => n.col))) for (let i = 1; i < col.length; i++) assert.ok(col[i].y - col[i - 1].y >= col[i].r + col[i - 1].r + 22 - 1e-6, `${col[i - 1].key} / ${col[i].key}`); // both circles and the name between them
});

test('geometry: the whole map (electives not chosen stay aside) fits a laptop screen at a readable scale', () => {
  const aside = new Set(asideIds(data, statuses, {})), { g } = geo((id) => !aside.has(id));
  assert.ok(fitScale(1440, 760, g.W, g.H) >= 0.6, `scale ${fitScale(1440, 760, g.W, g.H)} (${g.W}x${g.H})`);
});

test('geometry: a same-column מקביל edge is bowed, not a straight line through the column', () => {
  const d = { lists: [{ name: "קורסי חובה שנה א'", courses: ['a', 'b'], minCredits: 0 }], courses: { a: mc('A'), b: mc('B', [{ kind: 'מקביל', anyOf: [{ id: 'a', name: 'A' }] }]) } };
  const L = layoutMap(d), g = geometry(L, () => 3);
  assert.equal(L.nodes[0].col, L.nodes[1].col);
  assert.match(g.edges[0].d, /^M[\d.]+,[\d.]+ C/);
  assert.ok(g.edges[0].d.includes(`C${g.nodes[0].x + g.nodes[0].hw + G.bulge + 12},`));
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

test('mapSvg: a header per band (the student\'s year marked), decorative only', () => {
  const { L, g } = geo(), html = mapSvg({ data, st: statuses, L, g, year: 2, unlocks: {}, mode: 'all' });
  for (const b of L.bands) assert.ok(html.includes(`>${b.name}</text>`), b.name);
  assert.equal((html.match(/class="band mine"/g) ?? []).length, 1);
  assert.equal((html.match(/class="band( mine)?" aria-hidden="true"/g) ?? []).length, g.bands.length);
  assert.ok(!/NaN|undefined/.test(html));
});

test('geometry: the cycle graph and an empty filter both give finite geometry', () => {
  const cyc = mini({ a: mc('A', [{ kind: 'מקביל', anyOf: [{ id: 'b', name: 'B' }] }]), b: mc('B', [{ kind: 'מקביל', anyOf: [{ id: 'a', name: 'A' }] }]) });
  const g = geometry(layoutMap(cyc), () => 3);
  assert.ok(g.nodes.length === 2 && [g.W, g.H, ...g.nodes.flatMap((n) => [n.x, n.y])].every(Number.isFinite));
  const none = geometry(layoutMap(data, () => false), () => 3);
  assert.equal(none.nodes.length, 0); assert.ok(Number.isFinite(none.W) && Number.isFinite(none.H) && none.W > 0 && none.H > 0);
});

test('chainOf: a node with no edges lights only itself', () => {
  const r = chainOf([], 'q');
  assert.deepEqual([...r.nodes], ['q']); assert.equal(r.paths.size, 0);
});

test('mapSvg: an outside-the-program name with markup and a quote is escaped', () => {
  const d = mini({ a: mc('A', [{ kind: 'קדם', anyOf: [{ id: null, name: "<b x=\"1\">'" }] }]) });
  const L = layoutMap(d), html = mapSvg({ data: d, st: {}, L, g: geometry(L, () => 3), year: 1, unlocks: {}, mode: 'all' });
  assert.ok(html.includes('class="ext"') && !html.includes('<b x=') && html.includes('&lt;b x=&quot;1&quot;&gt;&#39;'));
});

test('courseYears: only "חובה שנה X\'" lists give a year; the first list wins', () => {
  const d = { lists: [{ name: "קורסי חובה שנה ב'", courses: ['a', 'b'] }, { name: "קורסי חובה שנה א'", courses: ['b', 'c'] }, { name: 'קורסי יחידה ללימודי חברה ורוח', courses: ['d', 'zz'] }], courses: { a: mc('A'), b: mc('B'), c: mc('C'), d: mc('D') } };
  assert.deepEqual([...courseYears(d)], [['a', 2], ['b', 2], ['c', 1]]);
  assert.equal(courseYears(data).size, new Set(data.lists.filter((l) => /חובה שנה \S'/.test(l.name)).flatMap((l) => l.courses)).size);
});

test('asideIds: an elective is aside unless chosen חובה/אולי, passed, exempt or being retaken; year courses never are', () => {
  const d = { lists: [{ name: "קורסי חובה שנה א'", courses: ['y'] }, { name: 'בחירה', courses: ['a', 'b', 'c', 'e', 'f', 'g'] }], courses: Object.fromEntries(['y', 'a', 'b', 'c', 'e', 'f', 'g', 'h'].map((k) => [k, mc(k)])) };
  const st = { e: { status: 'done' }, f: { status: 'retake' }, g: { status: 'blocked' } };
  // h is in no list at all: an elective too
  assert.deepEqual(asideIds(d, st, { a: 'must', b: 'optional', c: 'no' }).sort(), ['c', 'g', 'h']);
  assert.deepEqual(asideIds(d, {}).sort(), ['a', 'b', 'c', 'e', 'f', 'g', 'h']);
});

test('layout: aside electives are not drawn; a chosen one gets the electives band, last', () => {
  const aside = new Set(asideIds(data, {}, {}));
  assert.ok(aside.size > 20);
  const L0 = layoutMap(data, (id) => !aside.has(id));
  assert.deepEqual(L0.bands.map((b) => b.year), [1, 2, 3, 4]); // nothing chosen: no electives band
  assert.ok(L0.nodes.every((n) => n.type === 'ext' || !aside.has(n.id)));
  const pick = [...aside][0], off = new Set(asideIds(data, {}, { [pick]: 'optional' })), L1 = layoutMap(data, (id) => !off.has(id));
  assert.equal(L1.bands.at(-1).year, null);
  assert.equal(L1.nodes.find((n) => n.id === pick).year, null);
});

test('layout: a course offered in one semester sits in that column; others follow their in-band prerequisite; the surplus moves to ב', () => {
  const sc = (name, semesters, prereqs = []) => ({ ...mc(name, prereqs), semesters });
  const d = mini({ a: sc('A', ['א']), b: sc('B', ['ב']), c: sc('C', ['א', 'ב'], [{ kind: 'קדם', anyOf: [{ id: 'a', name: 'A' }] }]), d: sc('D', ['א', 'ב']), e: sc('E', ['א', 'ב']), f: sc('F', []) });
  const L = layoutMap(d), sem = Object.fromEntries(L.nodes.map((n) => [n.id, n.sem])), cnt = (v) => L.nodes.filter((n) => n.sem === v).length;
  assert.equal(sem.a, 0); assert.equal(sem.b, 1); assert.equal(sem.c, 1); // c needs a, so it cannot share a's semester
  assert.ok(Math.abs(cnt(0) - cnt(1)) <= 1);
  assert.equal(layoutMap(mini({ a: mc('A'), b: mc('B') })).cols.length, 1); // single-semester data: one column
});
