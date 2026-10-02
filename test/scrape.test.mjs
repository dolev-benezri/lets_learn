import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeRequester, ThrottledError, semestersIn, writeResults, run, unitsOf, cachedRequester, writeCatalog } from '../scripts/scrape.mjs';

const throttled = readFileSync('scripts/fixtures/throttled.html', 'utf8');
const rejected = readFileSync('scripts/fixtures/rejected.html', 'utf8');
const OK = '<html><body>קורסים</body></html>';

// A fake fetch that replays `steps`: a string is a 200 body, an object is { status, headers, body }, an Error is thrown.
function rig(steps, extra = {}) {
  const calls = [], sleeps = [], queue = [...steps];
  const fetchFn = async (url, init) => {
    calls.push({ url, init });
    const s = queue.shift();
    if (s instanceof Error) throw s;
    const { status = 200, headers = {}, body = '' } = typeof s === 'string' ? { body: s } : s;
    return { status, ok: status < 400, headers: { get: (k) => headers[k.toLowerCase()] ?? null, getSetCookie: () => [] }, text: async () => body };
  };
  const request = makeRequester({ fetchFn, sleep: async (ms) => { sleeps.push(ms); }, delay: 2500, rnd: () => 0.5, log: () => {}, ...extra });
  return { request, calls, sleeps };
}

test('request: polite headers, timeout signal, jittered delay before each request', async () => {
  const { request, calls, sleeps } = rig([OK, OK]);
  assert.equal(await request('a=1'), OK);
  await request('a=2');
  assert.equal(calls[0].init.headers['User-Agent'], 'afeka-scheduler/1.1 (+https://github.com/dolhack/lets_learn)');
  assert.ok(calls[0].init.signal instanceof AbortSignal);
  assert.deepEqual(sleeps, [2500, 2500]);
});

test('request: the hourly throttle page stops the run at once with the retry hour', async () => {
  const { request, calls } = rig([throttled, OK]);
  await assert.rejects(request('a=1'), (e) => e instanceof ThrottledError && /^\d{2}:\d{2}$/.test(e.until));
  assert.equal(calls.length, 1);
});

test('request: the per-minute throttle waits 65 s and retries', async () => {
  const { request, sleeps } = rig(['<br>יותר מידי שאילתות בדקה', OK]);
  assert.equal(await request('a=1'), OK);
  assert.ok(sleeps.includes(65000));
});

test('request: 3 rejections in a row stop the run, a success in between resets the streak', async () => {
  const bad = rig([rejected, rejected, rejected, OK]);
  await assert.rejects(bad.request('a=1'), /rejected/);
  assert.equal(bad.calls.length, 3);
  const good = rig([rejected, rejected, OK, rejected, rejected, OK]);
  await good.request('a=1');
  await good.request('a=2');
  assert.equal(good.calls.length, 6);
});

test('request: Retry-After on 429 and 503 is honoured', async () => {
  const { request, sleeps } = rig([{ status: 429, headers: { 'retry-after': '7' } }, { status: 503, headers: { 'retry-after': '3' } }, OK]);
  assert.equal(await request('a=1'), OK);
  assert.deepEqual(sleeps, [2500, 7000, 3000]);
});

test('request: a Retry-After longer than 5 minutes stops the run instead of sleeping', async () => {
  const { request } = rig([{ status: 429, headers: { 'retry-after': '3600' } }, OK]);
  await assert.rejects(request('a=1'), /Retry-After/);
});

test('request: network errors and timeouts retry; the whole run has a budget of 10 retries', async () => {
  const net = rig([new TypeError('fetch failed'), Object.assign(new Error('t'), { name: 'TimeoutError' }), OK]);
  assert.equal(await net.request('a=1'), OK);
  const down = rig(Array.from({ length: 20 }, () => ({ status: 503 })));
  await assert.rejects(down.request('a=1'), /budget/);
  assert.equal(down.calls.length, 11);
  // the budget is shared by all requests of the run
  const shared = rig([{ status: 503 }, OK, { status: 503 }, OK], { budget: 1 });
  await shared.request('a=1');
  await assert.rejects(shared.request('a=2'), /budget/);
});

test('request: a non-retryable HTTP error throws', async () => {
  await assert.rejects(rig([{ status: 404 }]).request('a=1'), /HTTP 404/);
});

test('semestersIn lists the semesters that have meetings, in site order', () => {
  const raw = { 1: { groups: [{ meetings: [{ semester: 'ב' }] }, { meetings: [{ semester: 'א' }, { semester: 'א' }] }] }, 2: { groups: [], details: null } };
  assert.deepEqual(semestersIn(raw), ['א', 'ב']);
});

test('semestersIn includes summer when it has meetings, after ב', () => {
  const raw = { 1: { groups: [{ meetings: [{ semester: 'קיץ' }, { semester: 'ב' }] }, { meetings: [{ semester: 'א' }] }] } };
  assert.deepEqual(semestersIn(raw), ['א', 'ב', 'קיץ']);
  assert.deepEqual(semestersIn({ 1: { groups: [{ meetings: [{ semester: 'א' }] }] } }), ['א']);
});

// ---- writing ----
const ds = (n, full = false) => ({ fetchedAt: 'T', year: 2027, courses: { c: { groups: Array.from({ length: n }, (_, i) => ({ id: `g${i}`, full })) } } });
const dirs = () => { const root = mkdtempSync(join(tmpdir(), 'afeka-')); return { status: join(root, 'status.json'), file: (k) => join(root, `${k}.json`) }; };
const job = (d, key, dataset, prev = null, now = 'N1') => ({ key, file: d.file(key), dataset: { ...dataset, fetchedAt: now }, prev });
const json = (f) => JSON.parse(readFileSync(f, 'utf8'));

test('writeResults: new data is written, status gets checkedAt, hash and changedAt', async () => {
  const d = dirs();
  const summary = await writeResults({ results: [job(d, '2027-1', ds(2))], statusFile: d.status, now: 'N1' });
  assert.equal(json(d.file('2027-1')).fetchedAt, 'N1');
  const st = json(d.status);
  assert.equal(st.checkedAt, 'N1'); assert.equal(st.ok, true);
  assert.match(st.semesters['2027-1'].hash, /^[0-9a-f]{64}$/); assert.equal(st.semesters['2027-1'].changedAt, 'N1');
  assert.match(summary, /^data\(afeka\): 2027-1 \+2 groups/);
});

test('writeResults: unchanged data leaves the file alone; only checkedAt moves', async () => {
  const d = dirs();
  await writeResults({ results: [job(d, '2027-1', ds(2))], statusFile: d.status, now: 'N1' });
  const before = readFileSync(d.file('2027-1'), 'utf8');
  const summary = await writeResults({ results: [job(d, '2027-1', ds(2), JSON.parse(before), 'N2')], statusFile: d.status, now: 'N2' });
  assert.equal(readFileSync(d.file('2027-1'), 'utf8'), before, 'file keeps its old fetchedAt');
  const st = json(d.status);
  assert.equal(st.checkedAt, 'N2'); assert.equal(st.semesters['2027-1'].changedAt, 'N1');
  assert.equal(summary, 'data(afeka): no changes');
});

test('writeResults: a changed semester gets a new hash and changedAt, the other keeps its own', async () => {
  const d = dirs();
  await writeResults({ results: [job(d, '2027-1', ds(2)), job(d, '2027-2', ds(2))], statusFile: d.status, now: 'N1' });
  const before = json(d.status);
  const summary = await writeResults({
    results: [job(d, '2027-1', ds(5, true), json(d.file('2027-1')), 'N2'), job(d, '2027-2', ds(2), json(d.file('2027-2')), 'N2')],
    statusFile: d.status, now: 'N2',
  });
  const st = json(d.status);
  assert.equal(st.semesters['2027-1'].changedAt, 'N2'); assert.notEqual(st.semesters['2027-1'].hash, before.semesters['2027-1'].hash);
  assert.equal(st.semesters['2027-2'].changedAt, 'N1');
  assert.equal(summary, 'data(afeka): 2027-1 +3 groups, 5 became full');
});

test('writeResults: a semester not in this run keeps its status entry', async () => {
  const d = dirs();
  await writeResults({ results: [job(d, '2027-1', ds(2)), job(d, '2027-2', ds(2))], statusFile: d.status, now: 'N1' });
  await writeResults({ results: [job(d, '2027-1', ds(2), json(d.file('2027-1')), 'N2')], statusFile: d.status, now: 'N2' });
  assert.deepEqual(Object.keys(json(d.status).semesters), ['2027-1', '2027-2']);
});

// ---- the whole run, with fixtures instead of the site ----
const fx = (n) => readFileSync(`scripts/fixtures/${n}`, 'utf8');
const site = (onCall = () => {}) => {
  let n = 0;
  return async (query) => {
    onCall(++n);
    if (!query) return fx('exams-2026.html');
    if (query.startsWith('prgname=S_SHOW_PROGS')) return fx('prog-30001.html');
    if (query.startsWith('prgname=S_LOOK_FOR_NOSE')) return fx('groups-90903.html');
    if (query.startsWith('prgname=S_CourseDetails')) return fx('details-90903.html');
    return OK;
  };
};
const opt = { year: '2027', start: '2026', program: '30', semester: 'א', 'all-semesters': true, delay: '0' };

test('run: the throttle page arriving mid-run writes nothing', async () => {
  const d = dirs();
  const dataDir = join(d.status, '..');
  const request = site((n) => { if (n === 6) throw new ThrottledError('19:00'); });
  await assert.rejects(run({ opt, request, dataDir, log: () => {} }), ThrottledError);
  assert.deepEqual(readdirSync(dataDir), []);
});

test('run: a failing check on any semester writes nothing', async () => {
  const d = dirs();
  const dataDir = join(d.status, '..');
  // fixture data is far smaller than a real semester, so validate() refuses it
  await assert.rejects(run({ opt, request: site(), dataDir, log: () => {} }), /checks failed, nothing written/);
  assert.deepEqual(readdirSync(dataDir), []);
});

test('run: lists, department, anchor and specializations come from the program config', async () => {
  const root = join(dirs().status, '..'), seen = { lists: [], exams: null }, real = site();
  const request = async (query, form) => {
    if (query?.startsWith('prgname=S_SHOW_PROGS')) seen.lists.push(query.split(',-N')[1]);
    if (form?.PRGNAME === 'S_EXAMS') seen.exams = form.R1C28;
    return real(query, form);
  };
  const programs = { 77: { name: 'x', dept: 8, deptName: 'ח', lists: [30001], specializations: [], degree: { total: 100, specCredits: 0 }, anchor: { course: '90903', name: 'p', minPrimaryGroups: 1 } } };
  let anchor;
  await run({ opt: { ...opt, program: '77' }, request, programs, dataDir: root, log: () => {}, check: (d, prev, a) => { anchor = a; return { errors: [], warnings: [] }; } });
  assert.deepEqual(seen, { lists: ['30001'], exams: '8' });
  assert.deepEqual(anchor, programs[77].anchor);
  assert.ok(readdirSync(join(root, '2027-1')).includes('77-2026.json'));
  await assert.rejects(run({ opt: { ...opt, program: '78' }, request, programs, dataDir: root, log: () => {} }), /no list codes configured for program 78/);
});

test('every committed data file carries the specializations, their lists and the degree', () => {
  const root = 'web/data/afeka', files = readdirSync(root).filter((d) => /^\d{4}-\d$/.test(d)).map((d) => `${root}/${d}/30-2026.json`);
  assert.ok(files.length >= 2);
  for (const f of files) {
    const d = json(f), codes = new Set(d.lists.map((l) => l.code));
    assert.deepEqual(d.specializations.map((s) => s.id), ['solid', 'flow', 'mech', 'vehicle', 'materials', 'aero'], f);
    assert.ok(d.specializations.every((s) => codes.has(s.mandatory) && codes.has(s.elective)), f);
    assert.equal(d.specializations.find((s) => s.id === 'vehicle').aloneExtra, 30127);
    assert.deepEqual(d.degree, { total: 160, specCredits: 27 });
  }
});

// ---- summer ----
const withSummer = () => { // course 1 (and only it) has its ב meetings moved to summer
  const real = site();
  let n = 0;
  return async (query) => {
    const html = await real(query);
    return query?.startsWith('prgname=S_LOOK_FOR_NOSE') && ++n === 1 ? html.replaceAll('&nbsp;ב<', '&nbsp;קיץ<') : html;
  };
};
const noErrors = () => ({ errors: [], warnings: [] });

test('run: a summer that fails its checks is skipped with a warning; א and ב are still written', async () => {
  const root = join(dirs().status, '..'), logs = [];
  const check = (d) => ({ errors: d.semester === 'קיץ' ? ['no groups'] : [], warnings: [] });
  const summary = await run({ opt, request: withSummer(), dataDir: root, log: (m) => logs.push(m), check });
  assert.deepEqual(readdirSync(root).sort(), ['2027-1', '2027-2', 'status.json']);
  assert.ok(logs.some((m) => m.startsWith('WARN summer not written') && m.includes('2027-3/30-2026: no groups')));
  assert.ok(!summary.includes('2027-3'));
  assert.deepEqual(Object.keys(json(join(root, 'status.json')).semesters).sort(), ['2027-1/30-2026', '2027-2/30-2026']);
});

test('run: a summer that passes is written to 2027-3 with the specializations', async () => {
  const root = join(dirs().status, '..');
  await run({ opt, request: withSummer(), dataDir: root, log: () => {}, check: noErrors });
  assert.deepEqual(readdirSync(root).sort(), ['2027-1', '2027-2', '2027-3', 'status.json']);
  const d = json(join(root, '2027-3', '30-2026.json'));
  assert.equal(d.semester, 'קיץ');
  assert.deepEqual(d.specializations.map((s) => s.id), ['solid', 'flow', 'mech', 'vehicle', 'materials', 'aero']);
  assert.deepEqual(d.degree, { total: 160, specCredits: 27 });
  assert.deepEqual(d.specializations.find((s) => s.id === 'vehicle'), { id: 'vehicle', name: 'מערכות רכב', mandatory: 30121, elective: 30122, aloneExtra: 30127 });
});

test('run: a failure in א or ב still aborts everything, even when summer is fine', async () => {
  const root = join(dirs().status, '..');
  const check = (d) => ({ errors: d.semester === 'ב' ? ['boom'] : [], warnings: [] });
  await assert.rejects(run({ opt, request: withSummer(), dataDir: root, log: () => {}, check }), /2027-2\/30-2026: boom/);
  assert.deepEqual(readdirSync(root), []);
});

// ---- several programs in one run ----
const cfg = (extra = {}) => ({ name: 'x', dept: 8, deptName: 'ח', lists: [30001], specializations: [], degree: { total: 100, specCredits: 0 }, anchor: null, cohorts: [2026], ...extra });
const multi = { ...opt, 'all-programs': true, program: undefined };
const counting = () => {
  const real = site(), seen = { lists: 0, groups: 0, exams: [] };
  const request = async (query, form) => {
    if (query?.startsWith('prgname=S_SHOW_PROGS')) seen.lists++;
    if (query?.startsWith('prgname=S_LOOK_FOR_NOSE')) seen.groups++;
    if (form?.PRGNAME === 'S_EXAMS') seen.exams.push(form.R1C28);
    return real(query, form);
  };
  return { request, seen };
};

test('unitsOf: one pair by default, every program and cohort with --all-programs, --programs narrows, lists may differ per cohort', () => {
  const programs = { 30: cfg({ cohorts: [2025, 2026] }), 20: cfg({ lists: { 2026: [20001] }, cohorts: [2026] }) };
  assert.deepEqual(unitsOf({ program: '30', start: '2026' }, programs).map((u) => [u.program, u.start]), [[30, 2026]]);
  assert.deepEqual(unitsOf({ 'all-programs': true, start: '2026' }, programs).map((u) => [u.program, u.start]), [[20, 2026], [30, 2025], [30, 2026]]);
  assert.deepEqual(unitsOf({ 'all-programs': true, programs: '30' }, programs).map((u) => [u.program, u.start]), [[30, 2025], [30, 2026]]);
  assert.deepEqual(unitsOf({ 'all-programs': true }, programs)[0].codes, [20001]);
  assert.throws(() => unitsOf({ 'all-programs': true }, { 20: cfg({ lists: { 2025: [1] }, cohorts: [2026] }) }), /program 20 cohort 2026/);
  assert.throws(() => unitsOf({ program: '5' }, programs), /program 5/);
});

test('run: programs that share lists and courses fetch each once; exams once per department', async () => {
  const root = join(dirs().status, '..'), { request, seen } = counting();
  const programs = { 77: cfg({ dept: 8, cohorts: [2026, 2025] }), 78: cfg({ dept: 9, verified: false }) };
  const one = counting();
  await run({ opt: { ...opt, program: '77' }, request: one.request, programs, dataDir: join(dirs().status, '..'), log: () => {}, check: noErrors });
  await run({ opt: multi, request, programs, dataDir: root, log: () => {}, check: noErrors });
  assert.equal(seen.groups, one.seen.groups, 'two programs and two cohorts cost the same course requests as one');
  assert.equal(seen.lists, 2, 'the list is per cohort, not per program');
  assert.equal(json(join(root, '2027-1', '78-2026.json')).verified, false, 'an unverified program says so in its data');
  assert.ok(!('verified' in json(join(root, '2027-1', '77-2026.json'))));
  assert.deepEqual(seen.exams.sort(), ['8', '9']);
  assert.deepEqual(readdirSync(join(root, '2027-1')).sort(), ['77-2025.json', '77-2026.json', '78-2026.json']);
  assert.deepEqual(Object.keys(json(join(root, 'status.json')).semesters).filter((k) => k.startsWith('2027-1')).sort(), ['2027-1/77-2025', '2027-1/77-2026', '2027-1/78-2026']);
});

test('run: a check failing in one program writes nothing for any program', async () => {
  const root = join(dirs().status, '..');
  const check = (d) => ({ errors: d.program === 78 ? ['boom'] : [], warnings: [] });
  await assert.rejects(run({ opt: multi, request: site(), programs: { 77: cfg(), 78: cfg() }, dataDir: root, log: () => {}, check }), /2027-1\/78-2026: boom/);
  assert.deepEqual(readdirSync(root), []);
});

test('writeCatalog: lists the cohorts of the run, keeps programs that were not in it, writes nothing when unchanged', async () => {
  const root = join(dirs().status, '..'), file = join(root, 'catalog.json');
  const programs = { 20: cfg({ name: 'חשמל' }), 30: cfg({ name: 'מכונות' }) };
  await writeCatalog(file, [{ program: 30, start: 2026 }, { program: 30, start: 2025 }], programs);
  assert.deepEqual(json(file), { programs: [{ id: 30, name: 'מכונות', startYears: [2025, 2026] }] });
  await writeCatalog(file, [{ program: 20, start: 2026 }], programs);
  assert.deepEqual(json(file).programs.map((p) => [p.id, p.startYears]), [[20, [2026]], [30, [2025, 2026]]]);
  const before = readFileSync(file, 'utf8');
  await writeCatalog(file, [{ program: 20, start: 2026 }], programs);
  assert.equal(readFileSync(file, 'utf8'), before);
});

test('cachedRequester: a cached answer costs no request; the session requests are replayed before the first miss only; offline refuses a miss', async () => {
  const dir = join(dirs().status, '..', 'cache'), calls = [];
  const inner = async (q, f) => { calls.push(q ?? f.PRGNAME); return `<p>${q ?? f.PRGNAME}</p>`; };
  const r = cachedRequester(inner, dir);
  await r('prgname=Enter_Search');
  await r(null, { PRGNAME: 'Enter_Search', ARGUMENTS: 'x' });
  assert.deepEqual(calls, [], 'swallowed until needed');
  assert.equal(await r('prgname=S_X&arguments=-N1'), '<p>prgname=S_X&arguments=-N1</p>');
  assert.deepEqual(calls, ['prgname=Enter_Search', 'Enter_Search', 'prgname=S_X&arguments=-N1']);
  await r('prgname=S_X&arguments=-N1');
  await r(null, { PRGNAME: 'S_Y', A: '1' });
  assert.equal(calls.length, 4, 'the repeat came from disk');
  const offline = cachedRequester(inner, dir, { offline: true });
  assert.equal(await offline('prgname=S_X&arguments=-N1'), '<p>prgname=S_X&arguments=-N1</p>');
  await assert.rejects(offline('prgname=S_Z'), /offline and not in the cache/);
  assert.equal(calls.length, 4);
});

// ---- nightly cache policy and waiting out the hourly limit ----
import { utimesSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { nightlyTtl, patient } from '../scripts/scrape.mjs';

test('nightlyTtl: groups and exams every run, an unoffered course (no groups) and everything else weekly', () => {
  const WEEK = 7 * 86400e3;
  assert.equal(nightlyTtl('prgname=S_LOOK_FOR_NOSE&arguments=-N90903', fx('groups-90903.html')), 0);
  assert.equal(nightlyTtl('prgname=S_LOOK_FOR_NOSE&arguments=-N1', '<html></html>'), WEEK);
  assert.equal(nightlyTtl('PRGNAME=S_EXAMS&ARGUMENTS=R1C28', fx('exams-2026.html')), 0);
  for (const k of ['prgname=S_SHOW_PROGS&arguments=-N2026,-N30001', 'prgname=S_CourseDetails&arguments=x', 'PRGNAME=S_PROG&HUG=30']) assert.equal(nightlyTtl(k, OK), WEEK);
});

test('cachedRequester with a ttl: a stale answer is fetched again, a fresh one is not', async () => {
  const dir = join(dirs().status, '..', 'cache2'), calls = [];
  const inner = async (q) => { calls.push(q); return `<p>${calls.length}</p>`; };
  const r = cachedRequester(inner, dir, { ttl: (key) => (key.includes('fresh') ? 0 : 1000) });
  await r('prgname=S_a&x=slow');
  await r('prgname=S_a&x=slow');
  assert.equal(calls.length, 1, 'within the ttl');
  const file = `${dir}/${createHash('sha1').update('prgname=S_a&x=slow').digest('hex')}.html`;
  utimesSync(file, new Date(Date.now() - 5000), new Date(Date.now() - 5000));
  assert.equal(await r('prgname=S_a&x=slow'), '<p>2</p>');
  await r('prgname=S_b&x=fresh');
  await new Promise((res) => setTimeout(res, 5));
  await r('prgname=S_b&x=fresh');
  assert.equal(calls.length, 4, 'ttl 0 asks every time');
});

test('patient: waits for the named hour, starts a new session, retries; gives up on a long wait or too many waits', async () => {
  const log = [], sleeps = [];
  let fail = 1;
  const base = async (q, f) => { log.push(q ?? f.PRGNAME); if (!q?.startsWith('prgname=S_') ) return ''; if (fail-- > 0) throw new ThrottledError('21:00'); return 'ok'; };
  const now = () => new Date('2026-10-02T17:19:31Z');
  const request = patient(base, { year: '2027', sleep: async (ms) => { sleeps.push(ms); }, now, log: () => {} });
  assert.equal(await request('prgname=S_X'), 'ok');
  assert.deepEqual(sleeps, [(40 * 60 + 29 + 60) * 1000]);
  assert.deepEqual(log, ['prgname=S_X', 'prgname=Enter_Search', 'Enter_Search', 'prgname=S_X']);
  fail = 9;
  await assert.rejects(patient(base, { year: '2027', sleep: async () => {}, now, log: () => {}, maxWaits: 2 })('prgname=S_X'), ThrottledError);
  fail = 1;
  await assert.rejects(patient(base, { year: '2027', sleep: async () => {}, now, log: () => {}, maxWaitMs: 60000 })('prgname=S_X'), ThrottledError);
  fail = 1;
  await assert.rejects(patient(async () => { throw new Error('other'); }, { year: '2027' })('prgname=S_X'), /other/);
});

test('writeResults: many changed files give a short one-line summary', async () => {
  const d = dirs();
  const keys = Array.from({ length: 20 }, (_, i) => `2027-${i}`);
  const summary = await writeResults({ results: keys.map((k) => job(d, k, ds(2))), statusFile: d.status, now: 'N1' });
  assert.ok(!summary.includes('\n') && summary.length < 400, summary);
  assert.match(summary, /and 14 more of 20 files$/);
});
