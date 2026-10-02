import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { layoutMap, planPaths, progressInfo, newlyUnlocked, progressHtml, makeKeep, chainOf, nodeRadius, edgePath, G, truncate, edgeEnds, sameColPath, geometry, fitScale, wheelStep, mapSvg, courseYears, asideIds } from '../web/ui-map.js';
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

test('layout: bands are the pre-degree band, one per study year (א׳ rightmost) and the electives band last; no semester labels anywhere', () => {
  const { L, g } = geo();
  assert.deepEqual(L.bands.map((b) => b.year), [null, 1, 2, 3, 4, null]);
  assert.deepEqual(L.bands.map((b) => b.kind), ['pre', 'year', 'year', 'year', 'year', 'other']);
  assert.deepEqual(L.bands.map((b) => b.name), ['לפני התואר (מכינה)', 'שנה א׳', 'שנה ב׳', 'שנה ג׳', 'שנה ד׳', 'חובה כללית ובחירה']);
  assert.deepEqual(g.bands.map((b) => b.x), [...g.bands.map((b) => b.x)].sort((a, b) => b - a)); // later bands further left
  assert.ok(g.bands.every((b, i) => i === 0 || b.x + b.w < g.bands[i - 1].x)); // a gap between bands
  const yr = courseYears(data);
  for (const n of g.nodes.filter((n) => n.type === 'course')) {
    const b = g.bands[L.bands.findIndex((x) => n.col >= x.first && n.col < x.first + x.n)];
    assert.equal(b.year, yr.get(n.id) ?? null, n.id);
    assert.ok(n.x > b.x && n.x < b.x + b.w);
  }
  for (let c = 0; c < L.cols.length; c++) { const d = L.nodes.filter((n) => n.col === c).map((n) => n.depth); assert.deepEqual(d, [...d].sort((a, b) => a - b)); }
  assert.equal(L.nodes.filter((n) => n.type === 'course').length, Object.keys(data.courses).length);
  const text = JSON.stringify({ b: L.bands, g: g.bands }) + [...mapSvg({ data, st: statuses, L, g, year: 2, unlocks: {}, mode: 'all', plan: new Set() }).matchAll(/<text class="b[ts]"[^>]*>[^<]*/g)].join(); // band headers (course names may say סמסטר)
  assert.ok(!/מוצע|סמסטר/.test(text), 'no semester or suggested labels');
  assert.ok(g.bands.every((b) => !('cols' in b)));
});

test('layout: inside a year band the columns are prerequisite depth: a course sits right of what it needs, a crowded depth wraps into more columns', () => {
  const pre = (id) => [{ kind: 'קדם', anyOf: [{ id, name: id }] }];
  const d = { lists: [{ name: "קורסי חובה שנה א'", courses: ['a', 'b', 'c', 'd'], minCredits: 0 }, { name: "קורסי חובה שנה ב'", courses: ['e'], minCredits: 0 }], courses: { a: mc('A'), b: mc('B', pre('a')), c: mc('C', pre('b')), d: mc('D'), e: mc('E', pre('a')) } };
  const L = layoutMap(d), at = Object.fromEntries(L.nodes.map((n) => [n.id, n]));
  assert.ok(at.a.col < at.b.col && at.b.col < at.c.col); // right to left in flow order
  assert.equal(at.d.col, at.a.col); // no prerequisite: depth 0
  assert.equal(at.e.depth, 0); // a prerequisite from another year says nothing about the column inside the band
  assert.equal(L.bands.find((b) => b.year === 1).n, 3);
  const many = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, mc(`K${i}`)]));
  assert.equal(layoutMap(mini(many)).bands[0].n, 3); // 20 at one depth: three columns (7, 7, 6)
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
  assert.ok(g.edges[0].d.includes(`C${g.nodes[0].x + g.nodes[0].hw + G.bulge + Math.min(40, Math.abs(g.nodes[1].y - g.nodes[0].y) / 6)},`));
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
  assert.equal((html.match(/class="band( mine| pre)?" aria-hidden="true"/g) ?? []).length, g.bands.length);
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

test('asideIds: an elective is aside unless chosen חובה/אולי, passed, exempt or being retaken; required courses (year, English, final project) never are', () => {
  const d = { lists: [{ name: "קורסי חובה שנה א'", courses: ['y'] }, { name: 'קורסי חובה לימודי אנגלית', courses: ['n'] }, { name: 'פרויקט גמר', courses: ['p'] }, { name: 'בחירה', courses: ['a', 'b', 'c', 'e', 'f', 'g'] }], courses: Object.fromEntries(['y', 'n', 'p', 'a', 'b', 'c', 'e', 'f', 'g', 'h'].map((k) => [k, mc(k)])) };
  const st = { e: { status: 'done' }, f: { status: 'retake' }, g: { status: 'blocked' } };
  // h is in no list at all: an elective too
  assert.deepEqual(asideIds(d, st, { a: 'must', b: 'optional', c: 'no' }).sort(), ['c', 'g', 'h']);
  assert.deepEqual(asideIds(d, {}).sort(), ['a', 'b', 'c', 'e', 'f', 'g', 'h']);
});

test('layout: aside electives are not drawn; a chosen one joins the last band', () => {
  const aside = new Set(asideIds(data, {}, {}));
  assert.ok(aside.size > 20);
  const L0 = layoutMap(data, (id) => !aside.has(id));
  assert.deepEqual(L0.bands.map((b) => b.year), [null, 1, 2, 3, 4, null]); // nothing chosen: the last band still holds English and the final project
  assert.ok(L0.nodes.every((n) => n.type === 'ext' || !aside.has(n.id)));
  const pick = [...aside][0], off = new Set(asideIds(data, {}, { [pick]: 'optional' })), L1 = layoutMap(data, (id) => !off.has(id));
  assert.equal(L1.bands.at(-1).year, null);
  assert.equal(L1.nodes.find((n) => n.id === pick).year, null);
});

test('layout: required courses are always drawn, chosen or not; the filter hides only electives that are in no required list', () => {
  const required = new Set(data.lists.filter((l) => /חובה|פרויקט גמר/.test(l.name)).flatMap((l) => l.courses));
  const aside = new Set(asideIds(data, {}, {})); // nothing chosen at all
  for (const id of required) assert.ok(!aside.has(id), id);
  const L = layoutMap(data, (id) => !aside.has(id)), drawn = new Set(L.nodes.filter((n) => n.type === 'course').map((n) => n.id));
  for (const id of data.lists[0].courses) assert.ok(drawn.has(id), `year-א course ${id} unchosen but present`);
});

test('layout: מכינה / קורס הכנה outside items form their own band, right of year א׳, one pill per name; other outside items stay in their target\'s band', () => {
  const { L, g } = geo(), pre = L.bands[0], ext = L.nodes.filter((n) => n.type === 'ext');
  assert.equal(pre.kind, 'pre'); assert.equal(pre.note, 'רק למי שנדרש/ה לפי תנאי הקבלה'); assert.equal(g.bands[0].x > g.bands[1].x, true);
  const inPre = ext.filter((n) => n.col >= pre.first && n.col < pre.first + pre.n), rest = ext.filter((n) => !inPre.includes(n));
  assert.ok(inPre.length >= 3 && inPre.every((n) => n.pre && /מכינה|קורס הכנה/.test(n.name)));
  assert.ok(rest.length > 0 && rest.every((n) => !n.pre && !/מכינה|קורס הכנה/.test(n.name)));
  assert.equal(new Set(inPre.map((n) => n.name)).size, inPre.length);
  assert.equal(L.nodes.filter((n) => n.col >= pre.first && n.col < pre.first + pre.n && n.type !== 'ext').length, 0); // nothing but the pre-degree pills in that band
  for (const n of rest) { const t = L.nodes.find((c) => c.type === 'course' && L.paths.some((p) => p.from === n.key && (p.to === c.id || L.diamonds.some((d) => d.key === p.to && d.target === c.id)))); assert.equal(n.band, t.band, n.key); }
  // a map with no pre-academic requirement has no such band
  const stripped = Object.fromEntries(Object.entries(data.courses).map(([k, c]) => [k, { ...c, prereqs: c.prereqs.map((p) => ({ ...p, anyOf: p.anyOf.filter((a) => !/מכינה|קורס הכנה/.test(a.name)) })).filter((p) => p.anyOf.length) }]));
  assert.ok(layoutMap({ ...data, courses: stripped }).bands.every((b) => b.kind !== 'pre'));
});

test('mapSvg: the pre-degree band is muted and captioned; outside pills say who they are for', () => {
  const { L, g } = geo(), html = mapSvg({ data, st: statuses, L, g, year: 2, unlocks: {}, mode: 'all', plan: new Set() });
  assert.ok(html.includes('class="band pre"') && html.includes('לפני התואר (מכינה)') && html.includes('לפי תנאי הקבלה'));
  assert.ok(html.includes('class="ext pre"') && html.includes('לא בתוכנית שלך'));
});

test('planPaths: edges out of a planned course, and the "או" hop after a planned option', () => {
  const paths = [['a', 'b'], ['c', 'or1'], ['d', 'or1'], ['or1', 'e'], ['x', 'y']].map(([from, to], id) => ({ id, from, to }));
  assert.deepEqual([...planPaths(paths, new Set(['a', 'c']))].sort(), [0, 1, 3]);
  assert.equal(planPaths(paths, new Set()).size, 0);
});

test('mapSvg: planned courses get the plan marker and their edges are highlighted; a passed course is never marked', () => {
  const d = mini({ a: mc('A'), b: mc('B', [{ kind: 'קדם', anyOf: [{ id: 'a', name: 'A' }] }]), c: mc('C') }), L = layoutMap(d), g = geometry(L, () => 3);
  const html = mapSvg({ data: d, st: { c: { status: 'done' } }, L, g, year: 1, unlocks: {}, mode: 'all', plan: new Set(['a', 'c']) });
  assert.equal((html.match(/class="plan-ring"/g) ?? []).length, 1); // a only
  assert.ok(html.includes('בתכנון') && html.includes('class="e k plan"'));
  assert.ok(!mapSvg({ data: d, st: {}, L, g, year: 1, unlocks: {}, mode: 'all' }).includes('plan-ring'));
});

test('progressInfo: a course counts once, a list never past its minimum; plan credits count only for what is not done', () => {
  const co = (credits) => ({ ...mc('x'), credits });
  const d = { lists: [{ name: "קורסי חובה שנה א'", courses: ['a', 'b'], minCredits: 7 }, { name: 'בחירה', courses: ['b', 'e1', 'e2'], minCredits: 4 }, { name: 'אנגלית', courses: ['en'], minCredits: 0 }], courses: { a: co(4), b: co(3), e1: co(3), e2: co(3), en: co(2) } };
  assert.deepEqual(progressInfo(d, {}), { total: 11, done: 0, planned: 0, adds: 0 });
  const st = { a: { status: 'done' }, e1: { status: 'exempt' }, en: { status: 'done' } };
  assert.deepEqual(progressInfo(d, st, new Set(['b', 'e2', 'a'])), { total: 11, done: 7, planned: 3 + 1, adds: 6 }); // done: a 4 + e1 3; planned: b 3 (year א), e2 1 (what is left of the elective minimum); a is done
});

test('newlyUnlocked: courses blocked now and open once the plan counts as passed (the plan itself excluded)', () => {
  const pre = (id) => [{ kind: 'קדם', anyOf: [{ id, name: id }] }];
  const d = mini({ a: mc('A'), b: mc('B', pre('a')), c: mc('C', pre('b')), z: mc('Z') });
  assert.equal(newlyUnlocked(d, { passed: [] }, new Set(['a'])), 1); // b (c still needs b)
  assert.equal(newlyUnlocked(d, { passed: [] }, new Set(['a', 'b'])), 1); // c; b is in the plan
  assert.equal(newlyUnlocked(d, { passed: [] }, new Set()), 0);
});

test('progressHtml: an accessible progressbar with the same numbers as the text; plan sentence only when there is a plan; escaped', () => {
  const base = { prog: { total: 100, done: 40, planned: 10, adds: 12 }, opened: 3 };
  const html = progressHtml(base);
  assert.ok(html.includes('role="progressbar"') && html.includes('aria-valuemax="100"') && html.includes('aria-valuenow="50"') && html.includes('title="'));
  assert.ok(html.includes('המערכת שנבחרה מוסיפה 12 נ״ז ופותחת 3 קורסים') && html.includes('width:40%') && html.includes('width:10%'));
  const plain = progressHtml({ prog: { total: 100, done: 40, planned: 0, adds: 0 }, opened: 0 });
  assert.ok(!plain.includes('המערכת שנבחרה') && plain.includes('aria-valuenow="40"'));
  assert.ok(progressHtml({ prog: { total: 100, done: 1, planned: 1, adds: 3 }, opened: 1 }).includes('ופותחת קורס אחד'));
  assert.equal(progressHtml({ prog: { total: 0, done: 0, planned: 0, adds: 0 }, opened: 0 }), '');
});

test('wheelStep: a mouse notch is about 16% (either browser), small trackpad events stay gentle, huge ones are capped', () => {
  const pct = (e) => Math.exp(wheelStep(e) / 3) - 1;
  assert.ok(Math.abs(pct({ deltaY: 100, deltaMode: 0 }) - 0.16) < 0.01 && Math.abs(pct({ deltaY: -100 }) - 0.16) < 0.01 && Math.abs(pct({ deltaY: 3, deltaMode: 1 }) - 0.16) < 0.01);
  assert.ok(pct({ deltaY: 4 }) < 0.02 && pct({ deltaY: 0, deltaX: 0 }) > 0);
  assert.equal(wheelStep({ deltaY: 5000 }), 0.6);
  assert.equal(wheelStep({ deltaY: 0, deltaX: 100 }), wheelStep({ deltaY: 100 })); // shift+wheel on a Mac
});
