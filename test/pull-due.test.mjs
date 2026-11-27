import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const api = () => import('../scripts/pull-due.mjs');
const HOUR = 36e5;
const night = '2026-12-01T00:00:00Z';
const ago = (now, hours) => new Date(Date.parse(now) - hours * HOUR).toISOString();
async function decision(extra = {}, due = true, cold = false) {
  const { pullDue } = await api();
  const result = pullDue({ now: new Date(night), event: 'schedule', started: [], checkedAt: ago(night, 12), ...extra });
  assert.equal(result.due, due);
  assert.equal(result.cold, cold);
  assert.equal(typeof result.reason, 'string');
  assert.ok(result.reason.length);
}

test('pullDue: night window is due when no pull started since 01:30', () => decision());
test('pullDue: one try per window', () => decision({ started: ['2026-11-30T23:45:00Z'] }, false));
test('pullDue: a pull before the window and outside the three-hour gap does not count', () =>
  decision({ started: [ago(night, 4)] }));
test('pullDue: a queued scrape counts as started', () => decision({ started: [ago(night, 1 / 12)] }, false));
test('pullDue: catch-up one hour before a window blocks its pull', () =>
  decision({ started: [ago(night, 1)], checkedAt: ago(night, 30) }, false));
test('pullDue: the three-hour gap is inclusive at three hours', async () => {
  await decision({ started: [ago(night, 3)] });
  await decision({ started: [ago(night, 3 - 1 / 3600)] }, false);
});
test('pullDue: outside the windows fresh data waits', () =>
  decision({ now: new Date('2026-12-01T08:00:00Z'), checkedAt: '2026-12-01T02:00:00Z' }, false));
test('pullDue: catch-up after 20 hours and missing or invalid checkedAt', async () => {
  const now = '2026-12-01T08:00:00Z';
  for (const checkedAt of [ago(now, 21), null, 'invalid']) {
    await decision({ now: new Date(now), checkedAt });
    await decision({ now: new Date(now), checkedAt, started: [ago(now, 2)] }, false);
  }
  await decision({ now: new Date(now), checkedAt: ago(now, 20) }, false);
});
test('pullDue: stale data can retry after three hours even in the same window', () =>
  decision({ now: new Date('2027-10-31T02:20:00Z'), started: ['2027-10-30T22:40:00Z'], checkedAt: ago(night, 9000) }));
for (const [local, due] of [['01:29', false], ['01:30', true], ['04:29', true], ['04:30', false],
  ['14:29', false], ['14:30', true], ['17:29', true], ['17:30', false]]) {
  test(`pullDue: window edge ${local}`, () => decision({ now: new Date(`2026-12-01T${local}:00+02:00`),
    checkedAt: '2026-11-30T22:00:00Z' }, due));
}
test('pullDue: Israel summer time', () => decision({ now: new Date('2027-07-01T22:45:00Z'), checkedAt: '2027-07-01T20:00:00Z' }));
test('pullDue: autumn DST first 01:45 blocks the second 01:45', () =>
  decision({ now: new Date('2027-10-30T23:45:00Z'), started: ['2027-10-30T22:45:00Z'], checkedAt: '2027-10-30T12:00:00Z' }, false));

test('pullDue: autumn DST first opening still governs after the three-hour gap', () =>
  decision({ now: new Date('2027-10-31T02:00:00Z'), started: ['2027-10-30T22:45:00Z'],
    checkedAt: '2027-10-31T01:00:00Z' }, false));

test('pullDue: a future start does not block an unused window', () =>
  decision({ started: [ago(night, -1)] }));
test('pullDue: Saturday night starts cold, other windows and catch-up stay warm', async () => {
  await decision({ now: new Date('2026-12-05T00:00:00Z'), checkedAt: '2026-12-04T12:00:00Z' }, true, true);
  await decision({ now: new Date('2027-07-02T23:00:00Z'), checkedAt: '2027-07-02T12:00:00Z' }, true, true);
  await decision({ now: new Date('2026-12-05T13:00:00Z'), checkedAt: '2026-12-05T01:00:00Z' });
  await decision({ now: new Date('2026-12-04T00:00:00Z'), checkedAt: '2026-12-03T12:00:00Z' });
  await decision({ now: new Date('2026-12-04T13:00:00Z'), checkedAt: '2026-12-04T01:00:00Z' });
  await decision({ now: new Date('2026-12-05T08:00:00Z'), checkedAt: null });
  await decision({ now: new Date('2026-12-05T13:00:00Z'), started: ['2026-12-05T12:45:00Z'] }, false);
});

for (const [label, instant, age, full] of [
  ['night with fresh data', night, 1, true],
  ['afternoon with fresh data', '2026-12-01T13:00:00Z', 12, false],
  ['afternoon at twenty hours', '2026-12-01T13:00:00Z', 20, false],
  ['afternoon with future data', '2026-12-01T13:00:00Z', -1, false],
  ['afternoon with stale data', '2026-12-01T13:00:00Z', 20 + 1 / 3600, true],
  ['catch-up', '2026-12-01T08:00:00Z', 21, true],
  ['missing data', '2026-12-01T13:00:00Z', null, true],
  ['invalid data', '2026-12-01T13:00:00Z', 'invalid', true],
]) {
  test(`pullDue full: ${label}`, async () => {
    const { pullDue } = await api();
    const result = pullDue({ now: new Date(instant), event: 'schedule', started: [],
      checkedAt: typeof age === 'number' ? ago(instant, age) : age });
    assert.equal(result.due, true);
    assert.equal(result.full, full, `${label}: full=${full}`);
  });
}

test('pullDue full: blocked checks never request a full pull', async () => {
  const { pullDue } = await api();
  for (const started of [null, [ago(night, 1)]]) {
    const result = pullDue({ now: new Date(night), event: 'schedule', started, checkedAt: null });
    assert.equal(result.due, false);
    assert.equal(result.full, false);
  }
  assert.equal(pullDue({ now: new Date('2026-12-01T08:00:00Z'), event: 'schedule', started: [],
    checkedAt: '2026-12-01T07:00:00Z' }).full, false);
});
test('pullDue: future checkedAt is fresh', () =>
  decision({ now: new Date('2026-12-01T08:00:00Z'), checkedAt: '2026-12-01T09:00:00Z' }, false));
test('pullDue: unknown runs never start a pull', () => decision({ started: null, checkedAt: ago(night, 30) }, false));
test('pullDue: a dispatch always runs warm even with unknown runs', async () => {
  for (const started of [null, [night]])
    await decision({ now: new Date('2026-12-05T13:00:00Z'), event: 'workflow_dispatch', started, checkedAt: null });
});

const run = (id, display_title = 'nightly') => ({ id, display_title });
const scrapeStep = (extra = {}) => ({ name: 'scrape', status: 'completed', conclusion: 'success',
  started_at: '2026-12-01T00:10:00Z', ...extra });
const job = (extra = {}) => ({ name: 'scrape', status: 'completed', conclusion: 'success',
  created_at: '2026-12-01T00:00:00Z', started_at: '2026-12-01T00:05:00Z', steps: [scrapeStep()], ...extra });
test('collectStarted: title filter and own run excluded', async () => {
  const { collectStarted } = await api();
  const paths = [];
  const started = await collectStarted({ runId: '1', mode: 'decide', api: async (path) => {
    paths.push(path);
    return path.includes('/jobs?') ? { jobs: [job()] }
      : { workflow_runs: [run(1), run(2, 'nightly smoke'), run(3, 'nightly dry run'), run(4)] };
  } });
  assert.deepEqual(started, [scrapeStep().started_at]);
  assert.equal(paths.filter((path) => path.includes('/jobs?')).length, 1);
  assert.match(paths[1], /\/runs\/4\/jobs\?/);
  const url = new URL(paths[0], 'https://example.test');
  assert.equal(url.searchParams.get('branch'), 'main');
  assert.match(url.searchParams.get('created'), /^>=/);
});
test('collectStarted: runs and jobs paginate over two pages of 100', async () => {
  const { collectStarted } = await api();
  const paths = [];
  const started = await collectStarted({ runId: 'own', mode: 'recheck', api: async (path) => {
    paths.push(path);
    const url = new URL(path, 'https://example.test');
    assert.equal(url.searchParams.get('per_page'), '100');
    const second = url.searchParams.get('page') === '2';
    if (path.includes('/jobs?')) return { jobs: second ? [job()] : Array.from({ length: 100 }, () => job({ name: 'decide' })) };
    return { workflow_runs: second ? [run(101)] : Array.from({ length: 100 }, (_, i) => run(i, 'nightly smoke')) };
  } });
  assert.deepEqual(started, [scrapeStep().started_at]);
  assert.equal(paths.length, 4);
});
for (const mode of ['decide', 'recheck']) {
  const collectJobs = async (jobs) => {
    const { collectStarted } = await api();
    return collectStarted({ runId: 'own', mode, api: async (path) =>
      path.includes('/jobs?') ? { jobs } : { workflow_runs: [run(1)] } });
  };

  test(`collectStarted: completed jobs without a started scrape do not count in ${mode} mode`, async () => {
    const jobs = [job({ name: 'decide' }),
      job({ conclusion: 'skipped', steps: [] }),
      job({ steps: [scrapeStep({ conclusion: 'skipped' })] }),
      job({ steps: [scrapeStep({ started_at: null })] }),
      job({ steps: [] }), job({ steps: undefined }),
      job({ conclusion: 'cancelled', steps: [] }),
      job({ conclusion: 'cancelled', steps: [scrapeStep({ conclusion: 'skipped', started_at: null })] }),
      job({ conclusion: 'cancelled', steps: [scrapeStep({ conclusion: 'cancelled', started_at: null })] })];
    assert.deepEqual(await collectJobs(jobs), []);
  });

  test(`collectStarted: unfinished reservations use created_at only in decide mode (${mode})`, async () => {
    const jobs = ['queued', 'pending', 'waiting', 'requested', 'in_progress'].map((status) =>
      job({ status, conclusion: null, steps: [] }));
    for (const status of ['queued', 'pending', 'waiting'])
      jobs.push(job({ status, conclusion: null, steps: [scrapeStep({ status, conclusion: null })] }));
    assert.deepEqual(await collectJobs(jobs), mode === 'decide' ? Array(jobs.length).fill(job().created_at) : []);
  });

  test(`collectStarted: actual scrape step starts count in ${mode} mode`, async () => {
    const jobs = [job({ status: 'in_progress', conclusion: null,
      steps: [{ name: 'recheck', started_at: job().started_at }, scrapeStep({ status: 'in_progress', conclusion: null })] }),
      job(), job({ conclusion: 'failure' }), job({ conclusion: 'cancelled' })];
    assert.deepEqual(await collectJobs(jobs), Array(jobs.length).fill(scrapeStep().started_at));
  });
}
test('collectStarted: any API error discards partial results', async () => {
  const { collectStarted } = await api();
  for (const failAt of [1, 3]) {
    let calls = 0;
    assert.equal(await collectStarted({ runId: 'own', mode: 'decide', api: async (path) => {
      if (++calls === failAt) throw Error('offline');
      return path.includes('/jobs?') ? { jobs: [job()] } : { workflow_runs: [run(1), run(2)] };
    } }), null);
  }
});

for (const event of ['schedule', 'workflow_dispatch']) {
  for (const attempt of [undefined, '1', '2']) {
    for (const mode of ['decide', 'recheck']) {
      test(`pull-due CLI: ${event} attempt ${attempt ?? 'unset'} in ${mode} mode`, () => {
        const preload = `import cp from 'node:child_process'; import fs from 'node:fs/promises';
          import { syncBuiltinESMExports } from 'node:module';
          cp.execFile = (...args) => { console.log('API attempted'); args.at(-1)(Error('offline')); };
          fs.readFile = async () => { console.log('status read attempted'); throw Error('status missing'); };
          fs.appendFile = async (path, value) => console.log('OUTPUT:' + value.trim().replaceAll('\\n', ','));
          syncBuiltinESMExports();`;
        const env = { ...process.env, GITHUB_EVENT_NAME: event, GITHUB_RUN_ID: '1',
          GITHUB_REPOSITORY: 'owner/repo', GITHUB_OUTPUT: 'fake' };
        delete env.GITHUB_RUN_ATTEMPT;
        if (attempt !== undefined) env.GITHUB_RUN_ATTEMPT = attempt;
        const child = spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(preload)}`,
          'scripts/pull-due.mjs', ...(mode === 'recheck' ? ['--recheck'] : [])], {
          encoding: 'utf8', timeout: 5000, env,
        });
        assert.equal(child.status, 0, child.stderr);
        const due = event === 'workflow_dispatch' || attempt === '2';
        assert.match(child.stdout, new RegExp(`OUTPUT:${mode === 'recheck' ? 'go' : 'due'}=${due},cold=false,full=${due}(?:\\n|$)`));
        if (due) assert.doesNotMatch(child.stdout, /API attempted|status read attempted/);
        else {
          assert.match(child.stdout, /API attempted/);
          assert.match(child.stdout, /status read attempted/);
        }
      });
    }
  }
}

test('pull-due CLI: recheck appends go, cold and full lines to GITHUB_OUTPUT', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pull-due-output-'));
  try {
    const output = join(dir, 'output');
    const child = spawnSync(process.execPath, ['scripts/pull-due.mjs', '--recheck'], {
      encoding: 'utf8', timeout: 5000,
      env: { ...process.env, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_OUTPUT: output },
    });
    assert.equal(child.status, 0, child.stderr);
    assert.equal(readFileSync(output, 'utf8'), 'go=true\ncold=false\nfull=true\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
