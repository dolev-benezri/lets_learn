// caller-02-search-lifecycle.mjs
// WHAT: the life cycle of the UI search in web/ui-search.js: debounce, generation counter, terminate, the "חפש עוד" time budget (1500/3000 ms x moreMul,
//       capped at MAX_MS), stale replies, and two lifecycle defects found by driving the REAL listeners of web/ui-plan.js (click/change dispatch).
// TARGETS: web/ui-search.js:8-16 (scheduleRun), :17-41 (run), :21 (budget), :22-28 (done), :29 (terminate), :35-36 (onmessage/onerror: no gen check),
//          web/ui-actions.js:64-70 (ACT.more), :157 (uiReset), :238 (myName -> 'quiet'), web/ui-plan.js:69-84 (change dispatch), web/ui-grid.js:144 (summary()).
// HOW: Worker shim in 'capture' mode (no thread) so the test controls exactly when a reply lands; replies are computed with the real search()/searchYear()
//      from the captured payload (structuredClone of it), so they are what a worker would have answered. The two defects are timing races in the browser;
//      this script makes them deterministic by choosing the moment of delivery inside the 300 ms debounce window (ui-search.js:15).
// RUN:  node solver-audit/repro/caller-02-search-lifecycle.mjs     (about 15 s)
// OUTPUT: CHECK = correct behaviour; BUG = defect reproduced (BUG ... REPRODUCED). Exit 0 iff every CHECK passes and every BUG reproduces.
import { scenario, settle, workers, setWorkerMode, reporter, $el, click, change, sleep, ROOT } from './caller-lib.mjs';

const R = reporter();
const core = await import(new URL('web/solver-core.js', ROOT).href);
const compute = (payload) => (payload.year ? core.searchYear(structuredClone(payload.year)) : core.search(structuredClone(payload)));
const dayBlocks = (html) => { // number of lesson blocks per day column of the rendered week grid (Sunday..Friday)
  const cols = html.split('<div class="day').slice(1);
  return cols.map((c) => (c.match(/class="blk /g) ?? []).length);
};

// ---------- debounce, terminate, generation ----------
setWorkerMode('capture');
{
  workers.length = 0;
  const m = await scenario({ program: 30, startYear: 2026, year: 2, scope: 'א', refresh: false });
  m.app.refresh(); // renderAll -> scheduleRun
  for (let i = 0; i < 5; i++) { m.search.scheduleRun(); await sleep(20); }
  await sleep(450);
  R.check('02-debounce-one-run', workers.length === 1 && workers[0].posted.length === 1, `6 scheduleRun() within 100 ms -> workers=${workers.length} (ui-search.js:14-15 clearTimeout + setTimeout 300)`);
  const g = m.common.ui.gen;
  m.search.scheduleRun(); await sleep(450);
  R.check('02-new-run-terminates-old-worker', workers.length === 2 && workers[0].terminated && !workers[1].terminated, `worker1.terminated=${workers[0].terminated} worker2.terminated=${workers[1].terminated} (ui-search.js:29)`);
  R.check('02-gen-increments-per-schedule', m.common.ui.gen === g + 1, `gen ${g} -> ${m.common.ui.gen}`);
  R.check('02-running-until-reply', m.common.ui.running === true && $el('busy').hidden === false, `running=${m.common.ui.running} busy.hidden=${$el('busy').hidden}`);
  const rep = compute(workers[1].posted[0]);
  workers[1].worker.onmessage({ data: rep });
  R.check('02-reply-clears-running', m.common.ui.running === false && m.common.ui.cur === 0 && m.common.ui.last.results.length === rep.results.length && $el('busy').hidden === true, `running=${m.common.ui.running} results=${m.common.ui.last.results.length}`);
}

// ---------- time budget: "חפש עוד" doubles the limit up to MAX_MS (12000) ----------
for (const [scope, base] of [['א', 1500], ['year', 3000]]) {
  workers.length = 0;
  const m = await scenario({ program: 30, startYear: 2026, year: 2, scope });
  const { ui } = m.common;
  const seq = [], more = [];
  for (let i = 0; i < 6; i++) {
    await sleep(380);
    const w = workers[workers.length - 1];
    const payload = w.posted[0] ?? w.posted[w.posted.length - 1];
    seq.push((payload.year ?? payload).timeLimitMs);
    w.worker.onmessage({ data: { results: [], partial: true, diagnosis: [] } }); // a search that ran out of time
    more.push($el('week').innerHTML.includes('data-act="more"'));
    if (i < 5) click('more');
  }
  const want = [1, 2, 4, 8, 16, 32].map((k) => Math.min(base * k, m.search.MAX_MS));
  R.check(`02-budget-${scope}`, JSON.stringify(seq) === JSON.stringify(want), `timeLimitMs sequence ${JSON.stringify(seq)} expected ${JSON.stringify(want)}`);
  R.check(`02-more-button-hidden-at-cap-${scope}`, more.every((v, i) => v === (want[i] < m.search.MAX_MS)), `"חפש עוד" shown per step: ${JSON.stringify(more)}`);
  m.search.scheduleRun(); await sleep(380);
  R.check(`02-budget-reset-on-new-search-${scope}`, (workers[workers.length - 1].posted[0].year ?? workers[workers.length - 1].posted[0]).timeLimitMs === base, `after a fresh scheduleRun(): ${(workers[workers.length - 1].posted[0].year ?? workers[workers.length - 1].posted[0]).timeLimitMs} ms`);
}

// ---------- worker constructor failure ----------
{
  const m = await scenario({ program: 30, startYear: 2026, year: 2, scope: 'א' });
  const Real = globalThis.Worker;
  globalThis.Worker = class { constructor() { throw new Error('module workers unsupported'); } };
  m.search.scheduleRun(); await sleep(380);
  R.check('02-worker-ctor-throws', m.common.ui.runError === 'module workers unsupported' && m.common.ui.last === null && !m.common.ui.running && $el('week').innerHTML.includes('שגיאה בחיפוש'), `runError="${m.common.ui.runError}" (ui-search.js:32-34)`);
  globalThis.Worker = Real;
}

// ---------- DEFECT: a superseded search's reply is accepted (ui-search.js:35 never compares `my` with ui.gen) ----------
{
  workers.length = 0;
  const m = await scenario({ program: 30, startYear: 2026, year: 2, scope: 'א' });
  const { ui } = m.common;
  await sleep(380);
  const w1 = workers[0], stale = compute(w1.posted[0]);
  const usedDays = [...new Set(stale.results[0].groups.flatMap((g) => m.app.app.data.courses[g.slice(2, 7).replace(/^0+/, '')]?.groups.find((x) => x.id === g)?.meetings.map((x) => x.day) ?? []))].filter((d) => d <= 5);
  // find the day with most lessons in the stale top plan and make it a HARD day off through the real handlers
  const cnt = {}; for (const gid of stale.results[0].groups) for (const c of Object.values(m.app.app.data.courses)) for (const g of c.groups) if (g.id === gid) for (const x of g.meetings) cnt[x.day] = (cnt[x.day] ?? 0) + 1;
  const day = Number(Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0]);
  click('dayOff', { day: String(day) }); // dayOff list: [6] -> [6, day]   (ui-actions.js:113)
  change('dayHard', 'hard');               // dayOffHard = true             (ui-actions.js:226)
  const gAfter = ui.gen;
  workers[0].worker.onmessage({ data: stale }); // the superseded worker answers before run() has terminated it (300 ms window)
  const shownBlocks = dayBlocks($el('week').innerHTML)[day - 1];
  const accepted = ui.last?.results === stale.results || JSON.stringify(ui.last?.results[0].groups) === JSON.stringify(stale.results[0].groups);
  R.bug('02-stale-reply-accepted', accepted && ui.running === true && !w1.terminated && shownBlocks > 0,
    `after setting day ${day} as a HARD day off, the OLD plan (computed without it) is accepted into ui.last and drawn: ${shownBlocks} lesson blocks on day ${day}; ui.running=${ui.running} (gen ${gAfter}), old worker terminated=${w1.terminated}`);
  await sleep(380);
  R.check('02-stale-replaced-by-new-search', workers.length === 2 && w1.terminated, `run() then terminated the old worker (workers=${workers.length})`);
  workers[1].worker.onmessage({ data: compute(workers[1].posted[0]) });
  const after = dayBlocks($el('week').innerHTML)[day - 1];
  R.check('02-fresh-reply-respects-hard-day-off', after === 0, `blocks on day ${day} after the fresh reply: ${after}`);
}

// ---------- DEFECT: a stale reply after a program switch crashes renderView (ui-grid.js:144) ----------
{
  workers.length = 0;
  const m = await scenario({ program: 30, startYear: 2026, year: 2, scope: 'א' });
  const { ui } = m.common, { app } = m.app;
  await sleep(380);
  const w1 = workers[0], stale = compute(w1.posted[0]); // a search of program 30 is in flight
  const g0 = ui.gen;
  change('program', '10'); // real CHG.program -> changeIdentity -> switchTo (async fetch) -> uiReset -> refresh -> scheduleRun
  for (let i = 0; i < 400 && !(app.state.program === 10 && ui.gen > g0); i++) await sleep(5);
  let err = null;
  try { w1.worker.onmessage({ data: stale }); } catch (e) { err = e; }
  R.check('02-program-switched', app.state.program === 10 && ui.last !== null, `state.program=${app.state.program}, ui.last holds the old program's ${stale.results.length} results (uiReset set it to null, the late reply restored it)`);
  R.bug('02-stale-reply-after-switch-throws', err instanceof TypeError, `renderView threw: ${err?.constructor?.name}: ${err?.message}`);
  let again = null;
  try { m.view.renderView(); } catch (e) { again = e; }
  R.bug('02-board-stays-broken-until-next-reply', again instanceof TypeError, `a second renderView() (any later UI action) throws too: ${again?.message}; ui.last still the old program's results until the new worker answers`);
  await sleep(380);
  workers[workers.length - 1].worker.onmessage({ data: compute(workers[workers.length - 1].posted[0]) });
  let ok = true; try { m.view.renderView(); } catch { ok = false; }
  R.check('02-recovers-after-fresh-reply', ok && w1.terminated, `after the new worker's reply renderView works again; old worker terminated=${w1.terminated}`);
}

// ---------- DEFECT: editing the name re-runs the whole search and resets the shown alternative (ui-actions.js:238 returns 'quiet') ----------
setWorkerMode('real');
{
  workers.length = 0;
  const m = await scenario({ program: 30, startYear: 2026, year: 2, scope: 'א' });
  const { ui } = m.common;
  await settle();
  click('next'); click('next'); click('next');
  const before = { cur: ui.cur, workers: workers.length };
  change('myName', 'Dana');
  await settle();
  R.check('02-go-wraps', before.cur === 3, `three clicks on "next" -> ui.cur=${before.cur} of ${ui.last.results.length}`);
  R.bug('02-name-edit-researches-and-resets-cur', workers.length === before.workers + 1 && ui.cur === 0,
    `after editing only the display name: workers ${before.workers} -> ${workers.length} (a new search ran), ui.cur ${before.cur} -> ${ui.cur}; state.name is not read by search()/searchYear()`);
}
R.done();
process.exit(process.exitCode ?? 0);
