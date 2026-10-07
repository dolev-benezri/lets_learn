// caller-01-worker-protocol.mjs
// WHAT: proves the message protocol between the UI and the solver worker, scope by scope (semester a, semester b, year, summer),
//       with the REAL modules: web/ui-plan.js -> app.refresh() -> web/ui-search.js scheduleRun()/run() -> Worker -> web/solver-worker.js
//       -> solver-core search()/searchYear() -> reply -> ui.last -> real renderView(). The Worker is a real node:worker_threads thread
//       (caller-worker-host.mjs defines `self`, then imports the real web/solver-worker.js); every payload and reply crosses the
//       thread by structured clone, exactly what a browser Worker.postMessage does.
// TARGETS: web/solver-worker.js:1-3, web/ui-search.js:17-41 (payloads :37-40, pin filter :37, year pins :38, budget :21, error :34-36),
//          web/app.js:152-155 (pickData), :174-180 (yearCourses/candidateMode), web/ui-common.js:32,36 (gated/yearSearch).
// RUN:  node solver-audit/repro/caller-01-worker-protocol.mjs      (about 20 s; uses real threads and real data files)
// OUTPUT: CHECK lines = behaviour asserted correct; BUG lines = defects (none in this script). Exit 0 iff all CHECK pass.
import assert from 'node:assert/strict';
import { scenario, settle, workers, setWorkerMode, reporter, $el, readJson, ROOT } from './caller-lib.mjs';

const R = reporter();
const same = (a, b) => { try { assert.deepStrictEqual(a, b); return true; } catch { return false; } };
const hasFn = (v, seen = new Set()) => { if (typeof v === 'function') return true; if (v && typeof v === 'object' && !seen.has(v)) { seen.add(v); return Object.values(v).some((x) => hasFn(x, seen)); } return false; };
const lastWorker = () => workers[workers.length - 1];

// ---------- semester scopes: payload of ui-search.js:40 ----------
for (const [scope, semCode] of [['א', 1], ['ב', 2]]) {
  workers.length = 0;
  const m = await scenario({ program: 30, startYear: 2026, year: 2, scope, edit: (st) => { st.pins = ['PINSTALE0000']; } });
  const { app } = m.app, { ui } = m.common;
  await settle();
  const w = lastWorker(), p = w.posted[0];
  const file = readJson(`data/afeka/2027-${semCode}/30-2026.json`);
  R.check(`01-${scope}-one-worker`, workers.length === 1 && w.posted.length === 1, `workers=${workers.length} posts=${w.posted.length}`);
  R.check(`01-${scope}-payload-keys`, same(Object.keys(p), ['data', 'courses', 'statuses', 'pins', 'constraints', 'weights', 'friends', 'timeLimitMs']), Object.keys(p).join(','));
  R.check(`01-${scope}-time-limit-1500`, p.timeLimitMs === 1500, `timeLimitMs=${p.timeLimitMs}`);
  R.check(`01-${scope}-data-is-file`, same(p.data, file), `data == web/data/afeka/2027-${semCode}/30-2026.json after clone, semester=${p.data.semester}`);
  const wantCourses = Object.keys(app.data.courses).filter((id) => ['must', 'optional'].includes(m.app.candidateMode(id)));
  R.check(`01-${scope}-courses-are-candidates`, same(p.courses.map((c) => c.id), wantCourses) && p.courses.every((c) => ['must', 'optional'].includes(c.mode)),
    `${p.courses.length} courses, modes=${[...new Set(p.courses.map((c) => c.mode))].join('/')}`);
  R.check(`01-${scope}-statuses-equal-ui`, same(p.statuses, app.cls.statuses), `statuses of ${Object.keys(p.statuses).length} courses equal app.cls.statuses`);
  R.check(`01-${scope}-pin-filter-drops-stale`, p.pins.length === 0 && app.state.pins.length === 1, `state.pins=${JSON.stringify(app.state.pins)} payload.pins=${JSON.stringify(p.pins)}`);
  R.check(`01-${scope}-no-functions-clone-ok`, !hasFn(p) && same(structuredClone(p), p), 'payload has no functions; structuredClone(payload) deep-equals payload');
  R.check(`01-${scope}-reply-shape`, same(Object.keys(ui.last).sort(), ['diagnosis', 'ms', 'partial', 'results']) && Array.isArray(ui.last.results) && ui.last.ms === 1500, `ui.last keys=${Object.keys(ui.last).join(',')} results=${ui.last.results.length}`);
  const direct = (await import(new URL('web/solver-core.js', ROOT).href)).search(structuredClone(p));
  R.check(`01-${scope}-worker-equals-direct`, !ui.last.partial && !direct.partial && same(JSON.parse(JSON.stringify(ui.last.results)), JSON.parse(JSON.stringify(direct.results))),
    `worker top-score=${ui.last.results[0]?.score.toFixed(6)} direct top-score=${direct.results[0]?.score.toFixed(6)} partial=${ui.last.partial}`);
  R.check(`01-${scope}-rendered`, $el('altLabel').textContent.includes('מתוך') && $el('week').innerHTML.includes('class="blk '), `altLabel="${$el('altLabel').textContent}"`);
}

// ---------- year scope: payload of ui-search.js:38-39 ----------
{
  workers.length = 0;
  const m = await scenario({ program: 30, startYear: 2026, year: 2, scope: 'year', edit: (st) => { st.pins = ['PINSTALE0000']; } });
  const { app } = m.app, { ui } = m.common;
  await settle();
  const w = lastWorker(), p = w.posted[0];
  R.check('01-year-one-key', same(Object.keys(p), ['year']), Object.keys(p).join(','));
  const y = p.year;
  R.check('01-year-payload-keys', same(Object.keys(y), ['dataA', 'dataB', 'state', 'yearList', 'pins', 'constraints', 'weights', 'friends', 'timeLimitMs']), Object.keys(y).join(','));
  R.check('01-year-time-limit-3000', y.timeLimitMs === 3000, `timeLimitMs=${y.timeLimitMs}`);
  R.check('01-year-data-are-files', same(y.dataA, readJson('data/afeka/2027-1/30-2026.json')) && same(y.dataB, readJson('data/afeka/2027-2/30-2026.json')), 'dataA/dataB == the two semester files');
  R.check('01-year-set-survives-clone', y.yearList instanceof Set && y.yearList.size > 0, `yearList is a Set of ${y.yearList.size} after the clone`);
  R.check('01-year-yearList-is-yearCourses', same([...y.yearList], m.app.yearCourses()), 'yearList == yearCourses() (app.js:174)');
  R.check('01-year-state-whole', same(y.state, app.state), 'the whole app.state is posted (incl. grades, friends, name): equal after the clone');
  R.check('01-year-pins-unfiltered', same(y.pins, app.state.pins) && y.pins.length === 1, `payload.pins=${JSON.stringify(y.pins)} (semester scopes filter them, see 01-*-pin-filter-drops-stale)`);
  R.check('01-year-no-statuses-posted', !('statuses' in y) && !('data' in y), 'no cls.statuses / app.data in the year payload: searchYear recomputes both (solver-core.js:392,404,446)');
  R.check('01-year-clone-ok', !hasFn(p) && same(structuredClone(p), p), 'structuredClone(payload) deep-equals payload (Set included)');
  const direct = (await import(new URL('web/solver-core.js', ROOT).href)).searchYear(structuredClone(y));
  R.check('01-year-worker-equals-direct', !ui.last.partial && !direct.partial && same(JSON.parse(JSON.stringify(ui.last.results)), JSON.parse(JSON.stringify(direct.results))),
    `worker top-score=${ui.last.results[0]?.score.toFixed(6)} direct top-score=${direct.results[0]?.score.toFixed(6)} pairs=${ui.last.results.length}`);
  R.check('01-year-reply-pairs', ui.last.results.every((r) => 'a' in r && ('b' in r) && r.credits && Array.isArray(r.missing) && Array.isArray(r.warnings)), 'every result is {score,a,b,credits,missing,warnings}');
  R.check('01-year-rendered', $el('altLabel').textContent.includes('מתוך') && $el('semtabs').innerHTML.includes('סמסטר'), `altLabel="${$el('altLabel').textContent}"`);
}

// ---------- summer scope ----------
{
  workers.length = 0;
  const yearIds = ['30136', '30110'];
  const m = await scenario({ program: 30, startYear: 2026, year: 2, scope: 'קיץ', summer: true, edit: (st) => { st.yearIds = yearIds; } });
  const { app } = m.app;
  await settle();
  const w = lastWorker();
  if (!w) R.check('01-summer-worker', false, 'no worker was started in summer scope');
  else {
    const p = w.posted[0];
    R.check('01-summer-scope-data', app.data === app.sem['קיץ'] && p.data.semester === 'קיץ', `app.data is the summer file; payload.data.semester=${p.data.semester}`);
    R.check('01-summer-time-limit-1500', p.timeLimitMs === 1500 && !('year' in p), `timeLimitMs=${p.timeLimitMs}; plain search payload (yearSearch() is false)`);
    R.check('01-summer-yearIds-count-as-passed', yearIds.every((id) => app.cls.statuses[id].status === 'done') && yearIds.every((id) => p.statuses[id].status === 'done'),
      `yearIds statuses in the posted statuses: ${yearIds.map((id) => p.statuses[id].status).join(',')} (app.js:216)`);
    R.check('01-summer-state-passed-untouched', !yearIds.some((id) => app.state.passed.includes(id)), 'state.passed itself is not changed by the summer assumption (copy in refresh())');
  }
}

// ---------- empty candidate list, gate, error path ----------
{
  workers.length = 0;
  const m = await scenario({ program: 30, startYear: 2026, year: 2, scope: 'א', edit: (st, mm) => { for (const id of Object.keys(mm.app.app.data.courses)) st.choices[id] = 'no'; } });
  const { ui } = m.common;
  await settle();
  R.check('01-empty-courses-no-worker', workers.length === 0 && ui.last === null && ui.runError === null && !ui.running, `workers=${workers.length} last=${ui.last} running=${ui.running}`);
  R.check('01-empty-courses-message', $el('week').innerHTML.includes('עוד לא נבחרו קורסים'), 'renderView shows the "no courses chosen" message');
}
{
  workers.length = 0;
  const m = await scenario({ program: 30, startYear: 2026, year: 2, scope: 'א', edit: (st) => { st.profile.year = null; } });
  const { ui } = m.common;
  await settle();
  R.check('01-gated-no-worker', workers.length === 0 && ui.last === null && !ui.running && $el('busy').hidden === true, `gated(): workers=${workers.length} running=${ui.running} busy.hidden=${$el('busy').hidden}`);
}
{
  workers.length = 0;
  const m = await scenario({ program: 30, startYear: 2026, year: 2, scope: 'א' });
  const { app } = m.app, { ui } = m.common;
  await settle();
  const victim = Object.keys(app.data.courses).find((id) => m.app.candidateMode(id) === 'optional');
  app.data.courses[victim].groups = null; // in-memory corruption of the posted dataset: makes search() throw inside the worker
  m.search.scheduleRun();
  await settle();
  R.check('01-error-path-onerror', ui.runError && ui.last === null && !ui.running && lastWorker().errors.length === 1, `runError="${ui.runError}" last=${ui.last} running=${ui.running}`);
  R.check('01-error-path-rendered', $el('week').innerHTML.includes('שגיאה בחיפוש'), 'renderView shows the search-error message');
  app.data.courses[victim].groups = []; // repair; the next search clears the error (ui-search.js:30)
  m.search.scheduleRun();
  await settle();
  R.check('01-error-cleared-on-next-run', ui.runError === null, `runError after next run: ${ui.runError}`);
}
R.done();
process.exit(process.exitCode ?? 0);
