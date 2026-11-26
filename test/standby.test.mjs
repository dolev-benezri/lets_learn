import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Loading inside each test keeps every missing behavior visible before the script exists.
const api = () => import('../scripts/standby.mjs');
const now = Date.parse('2026-11-26T12:00:00Z');
const ago = (hours) => new Date(now - hours * 36e5).toISOString();
const run = (extra = {}) => ({ head_branch: 'main', event: 'schedule', status: 'in_progress', created_at: ago(1), ...extra });
const response = (data) => ({ ok: true, json: async () => data });

for (const [name, seedMarkers, localMarkers, replace, reason] of [
  ['newer', { 2027: ago(1) }, { 2027: ago(2) }, true, /newer/],
  ['equal', { 2027: ago(1) }, { 2027: ago(1) }, false, /equal/],
  ['older', { 2027: ago(2) }, { 2027: ago(1) }, false, /older/],
  ['local missing', { 2027: ago(1) }, {}, true, /no local marker/],
  ['seed missing', {}, { 2027: ago(1) }, false, /seed.*missing/],
  ['seed invalid', { 2027: 'garbage' }, { 2027: ago(1) }, false, /seed.*invalid/],
  ['seed empty', { 2027: '  ' }, { 2027: ago(1) }, false, /seed.*invalid/],
  ['local invalid', { 2027: ago(1) }, { 2027: 'garbage' }, false, /local.*invalid/],
  ['both missing', {}, {}, false, /seed.*missing/],
  ['invalid seed without local', { 2027: 'garbage' }, {}, false, /seed.*invalid/],
  ['several years all newer', { 2027: ago(1), 2028: ago(2) }, { 2027: ago(2), 2028: ago(3) }, true, /newer/],
  ['one equal year vetoes replacement', { 2027: ago(1), 2028: ago(2) }, { 2027: ago(2), 2028: ago(2) }, false, /2028.*equal/],
  ['one older year vetoes replacement', { 2027: ago(1), 2028: ago(3) }, { 2027: ago(2), 2028: ago(2) }, false, /2028.*older/],
  ['a missing seed year vetoes replacement', { 2027: ago(1) }, { 2027: ago(2), 2028: ago(3) }, false, /2028.*seed.*missing/],
  ['timestamps compare by date, not text', { 2027: '2026-11-26T13:00:00+02:00\n' }, { 2027: '2026-11-26T10:00:00Z' }, true, /newer/],
]) {
  test(`cache seed comparison: ${name}`, async () => {
    const { cacheSeedDecision } = await api();
    const decision = cacheSeedDecision({ seedMarkers, localMarkers });
    assert.equal(decision.replace, replace);
    assert.match(decision.why, reason);
  });
}

test('cache seed CLI: reads per-year published-at markers; root and answer files do not decide freshness', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'seed-compare-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const seed = join(root, 'seed'), local = join(root, 'local');
  for (const dir of [seed, local]) await mkdir(join(dir, '2027'), { recursive: true });
  await writeFile(join(seed, 'published-at'), 'garbage'); // yearCache never passes the root to cacheBehind
  await writeFile(join(local, 'published-at'), ago(-10));
  await writeFile(join(seed, '2027', 'answer.html'), 'public-shaped fixture');
  await writeFile(join(seed, '2027', 'published-at'), ago(1));
  await writeFile(join(local, '2027', 'published-at'), ago(2));
  const invoke = (...args) => spawnSync(process.execPath, ['scripts/standby.mjs', '--compare-seed', ...args], {
    encoding: 'utf8', timeout: 5000,
    env: { ...process.env, NODE_OPTIONS: '' },
  });
  const check = (args, status, message) => {
    const child = invoke(...args);
    assert.equal(child.status, status, child.stderr || child.stdout);
    assert.match(child.stdout, message);
    assert.equal(child.stdout.trim().split('\n').length, 1);
  };
  check([seed, local], 0, /^replace:.*newer/);
  await writeFile(join(local, '2027', 'published-at'), ago(0));
  check([seed, local], 1, /^keep:.*older/);
  await mkdir(join(local, '2028'));
  await writeFile(join(local, '2027', 'published-at'), ago(2));
  await writeFile(join(local, '2028', 'published-at'), ago(3));
  check([seed, local], 1, /^keep:.*2028.*missing/);
  check([seed, join(root, 'absent')], 0, /^replace:.*no local marker/);
  check([seed], 2, /^keep:.*comparison failed/);
});

for (const [name, checkedAt, githubBusy, expected] of [
  ['11 hours stands by', ago(11), false, false],
  ['12 hours runs', ago(12), false, true],
  ['30 hours but busy stands by', ago(30), true, false],
  ['missing time runs', undefined, false, true],
  ['invalid time runs', 'garbage', false, true],
  ['busy overrides missing time', undefined, true, false],
  ['busy overrides invalid time', 'garbage', true, false],
]) {
  test(`standbyDecision: ${name}`, async () => {
    const { standbyDecision } = await api();
    const decision = standbyDecision({ checkedAt, now, hours: 12, githubBusy });
    assert.equal(decision.run, expected);
    assert.match(decision.why, /age .* h/);
  });
}

test('standbyDecision: a custom age threshold is respected', async () => {
  const { standbyDecision } = await api();
  assert.equal(standbyDecision({ checkedAt: ago(11), now, hours: 10, githubBusy: false }).run, true);
});

test('standby fetches status and one unfiltered main runs page with a 20 second timeout each', async (t) => {
  const { checkStandby } = await api();
  const timeouts = [], calls = [];
  t.mock.method(AbortSignal, 'timeout', (ms) => (timeouts.push(ms), new AbortController().signal));
  const result = await checkStandby({ now, token: 'test-token', fetchFn: async (url, options) => {
    calls.push({ url: new URL(url), options });
    return response(url.includes('status.json') ? { checkedAt: ago(13) } : { workflow_runs: [] });
  } });
  assert.equal(result.run, true);
  assert.deepEqual(timeouts, [20_000, 20_000]);
  assert.ok(calls.every(({ options }) => options.signal instanceof AbortSignal));
  const status = calls.find(({ url }) => url.pathname.endsWith('/status.json'));
  assert.equal(status.url.origin + status.url.pathname, 'https://lets-learn-il.github.io/data/afeka/status.json');
  assert.ok([...status.url.searchParams].length, 'bypass any cached status');
  const runs = calls.filter(({ url }) => url.hostname === 'api.github.com');
  assert.equal(runs.length, 1);
  assert.equal(runs[0].url.pathname, '/repos/lets-learn-il/lets-learn-il.github.io/actions/workflows/nightly.yml/runs');
  assert.equal(runs[0].url.searchParams.get('per_page'), '20');
  assert.equal(runs[0].url.searchParams.get('branch'), 'main');
  assert.equal(runs[0].url.searchParams.has('status'), false);
  assert.equal(runs[0].options.headers.Authorization, 'Bearer test-token');
  assert.equal(status.options.headers?.Authorization, undefined, 'the API token is only sent to GitHub');
});

for (const endpoint of ['status', 'runs']) {
  for (const failure of ['HTTP 500', 'timeout', 'bad JSON', 'missing field']) {
    test(`standby fetch: ${endpoint} ${failure} fails open`, async () => {
      const { checkStandby } = await api();
      const decision = await checkStandby({ now, fetchFn: async (url) => {
        const status = url.includes('status.json');
        if ((endpoint === 'status') === status) {
          if (failure === 'HTTP 500') return { ok: false, json: () => { throw Error('must not read error body'); } };
          if (failure === 'timeout') throw new DOMException('timed out', 'TimeoutError');
          if (failure === 'bad JSON') return { ok: true, json: async () => { throw new SyntaxError('bad JSON'); } };
          return response({});
        }
        return response(status ? { checkedAt: ago(30) } : { workflow_runs: [] });
      } });
      assert.equal(decision.run, true);
      if (endpoint === 'status') assert.match(decision.why, /age unknown h/);
    });
  }
}

test('standby fetch: busy overrides missing status, and fresh status survives a runs failure', async () => {
  const { checkStandby } = await api();
  const busy = await checkStandby({ now, fetchFn: async (url) => {
    if (url.includes('status.json')) throw Error('unreachable');
    return response({ workflow_runs: [run()] });
  } });
  assert.equal(busy.run, false);
  assert.match(busy.why, /busy/);
  const fresh = await checkStandby({ now, fetchFn: async (url) => {
    if (!url.includes('status.json')) throw Error('unreachable');
    return response({ checkedAt: ago(11) });
  } });
  assert.equal(fresh.run, false);
});

for (const [suffix, failure, reason] of [
  ['', async () => ({ ok: false, status: 403 }), /GitHub runs unreadable \(HTTP 403\)/],
  [' (network)', async () => { throw Error('unreachable'); }, /GitHub runs unreadable \(network\)/],
]) {
  test(`checkStandby: an unreadable runs page is said in why${suffix}`, async () => {
    const { checkStandby } = await api();
    const decision = await checkStandby({ now, fetchFn: async (url) => url.includes('status.json')
      ? response({ checkedAt: ago(11) }) : failure() });
    assert.equal(decision.run, false, 'fresh data still stands by when runs cannot be read');
    assert.match(decision.why, /published data is under 12 h old; age 11\.0 h; /);
    assert.match(decision.why, reason);
  });
}

test('standby fetch: every unfinished status is busy only on main, with an allowed event in the last six hours', async () => {
  const { checkStandby } = await api();
  const cases = [
    ...['queued', 'in_progress', 'waiting', 'pending', 'requested', 'action_required', 'new_status'].map((status) => [run({ status }), true]),
    [run({ event: 'workflow_dispatch', created_at: ago(6) }), true],
    [run({ status: 'completed' }), false],
    [run({ created_at: ago(6.01) }), false],
    [run({ created_at: ago(-1) }), false],
    [run({ head_branch: 'branch' }), false],
    [run({ event: 'push' }), false],
    ...['status', 'head_branch', 'event', 'created_at'].map((field) => [run({ [field]: undefined }), false]),
    [run({ created_at: 'garbage' }), false],
    [null, false],
  ];
  for (const [entry, busy] of cases) {
    const result = await checkStandby({ now, fetchFn: async (url) => response(url.includes('status.json')
      ? { checkedAt: ago(30) } : { workflow_runs: [entry] }) });
    assert.equal(result.run, !busy, JSON.stringify(entry));
  }
});

test('standby fetch: anonymous requests omit authorization and malformed runs are not busy', async () => {
  const { checkStandby } = await api();
  for (const workflow_runs of [null, {}, 'wrong']) {
    const headers = [];
    const result = await checkStandby({ now, token: '', fetchFn: async (url, options) => {
      headers.push(options.headers);
      return response(url.includes('status.json') ? {} : { workflow_runs });
    } });
    assert.equal(result.run, true);
    // Assert outside fetch because a failed fetch is deliberately swallowed by the standby check.
    assert.equal(headers.length, 2);
    for (const header of headers) assert.equal(header.Authorization, undefined);
  }
});

test('standby CLI: one age line, default 12 hours, custom threshold, and fetch failures exit zero', async () => {
  await api();
  // A preload supplies public-shaped responses without a live request from the test process.
  const preload = `globalThis.fetch = async (url) => ({ ok: true, json: async () => url.includes('status.json')
    ? { checkedAt: new Date(Date.now() - 11 * 36e5).toISOString() } : { workflow_runs: [] } });`;
  for (const [hours, prefix] of [['', 'standby:'], ['10', 'run:'], ['garbage', 'standby:']]) {
    const child = spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(preload)}`, 'scripts/standby.mjs'], {
      encoding: 'utf8', env: { ...process.env, STANDBY_HOURS: hours },
    });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout.trim().split('\n').length, 1);
    assert.ok(child.stdout.startsWith(prefix), child.stdout);
    assert.match(child.stdout, /age .* h/);
  }
  const child = spawnSync(process.execPath, ['--import', 'data:text/javascript,globalThis.fetch=async()=>{throw Error("offline")}', 'scripts/standby.mjs'], { encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  assert.match(child.stdout, /^run:.*age unknown h; GitHub runs unreadable \(network\)\n$/);
});
