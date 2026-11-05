// The auto search: debounce, worker, "חפש עוד" budget.
import { app, candidateMode, yearCourses, keepFocus, planningCls, summerPinned } from './app.js';
import { gated, yearSearch, toast, focusWeek, $, ui } from './ui-common.js';
import { renderView } from './ui-view.js';
import { showWeights } from './solver-core.js';

// ---------- search ----------
export const MAX_MS = 12000; // "חפש עוד" doubles the time limit up to this
export function scheduleRun(again = false) {
  if (!again) ui.moreMul = 1;
  clearTimeout(ui.timer);
  ui.probeWorker?.terminate();
  ui.capProbe = null; // an answer about the old settings: gone now, not when the new search ends
  document.querySelector('.cap-preview')?.remove();
  if (gated()) {
    ui.gen++;
    ui.running = false;
    ui.last = null;
    ui.worker?.terminate();
    setBusy();
    return;
  }
  ui.gen++;
  ui.running = true;
  setBusy();
  ui.timer = setTimeout(run, 300);
}
const candidates = () => {
  const inSummer = summerPinned();
  return Object.keys(app.data.courses)
    .map((id) => ({ id, mode: inSummer.has(id) ? 'no' : candidateMode(id) }))
    .filter((x) => x.mode === 'must' || x.mode === 'optional');
};
function run() {
  const courses = candidates();
  const my = ui.gen; // a newer scheduled search keeps the indicator on
  const year = yearSearch();
  const byMore = ui.moreMul > 1,
    ms = Math.min((year ? 3000 : 1500) * ui.moreMul, MAX_MS);
  const done = () => {
    ui.running = my !== ui.gen;
    // the year search keeps only the top א׳ alternatives (solver-core.js A_TOP), so ending in time is not exhaustive
    if (byMore && !ui.running && ui.last)
      toast(
        ui.last.partial
          ? `החיפוש המורחב הסתיים (${+(ms / 1000).toFixed(1)} שניות)`
          : year
            ? 'החיפוש השנתי הושלם: מוצגות החלופות הטובות ביותר שנמצאו'
            : 'החיפוש הושלם: נבדקו כל האפשרויות'
      );
    const hadMore = document.activeElement?.dataset?.k === 'searchMore';
    keepFocus(renderView);
    // the search finished: the button is gone
    if (hadMore && !document.querySelector('[data-k="searchMore"]')) focusWeek();
  };
  ui.worker?.terminate();
  ui.runError = null;
  if (gated() || !courses.length) {
    ui.last = null;
    done();
    return;
  }
  try {
    ui.worker = new Worker(new URL('./solver-worker.js', import.meta.url), { type: 'module' });
  } catch (err) {
    ui.runError = err.message || 'לא ניתן להפעיל את החיפוש';
    ui.last = null;
    done();
    return;
  }
  ui.worker.onmessage = (e) => {
    if (my !== ui.gen) return;
    ui.last = { ...e.data, ms };
    ui.cur = 0;
    done();
  };
  ui.worker.onerror = (e) => {
    if (my !== ui.gen) return;
    ui.runError = e.message || 'שגיאה לא ידועה';
    ui.last = null;
    done();
  }; // the old plan no longer matches the settings
  ui.worker.postMessage(searchMessage(courses, app.state.constraints, ms));
}
function searchMessage(courses, constraints, ms) {
  const { state, data } = app;
  // stale pins stay in state
  const pins = state.pins.filter((p) => courses.some((c) => data.courses[c.id].groups.some((g) => g.id === p)));
  // "הצג לפי": the chosen criterion leads, the usual score breaks ties
  const weights = showWeights(state.weights, state.sortBy, state.friends);
  if (yearSearch())
    return {
      year: {
        dataA: app.sem['א'],
        dataB: app.sem['ב'],
        state: { ...state, choices: { ...state.choices, ...Object.fromEntries([...summerPinned()].map((id) => [id, 'no'])) } },
        yearList: new Set(yearCourses()),
        pins: state.pins,
        constraints,
        weights,
        friends: state.friends,
        timeLimitMs: ms
      }
    };
  return { data, courses, statuses: planningCls().statuses, pins, constraints, weights, friends: state.friends, timeLimitMs: ms };
}
// One more search at the cap + 1 (a year: per semester), for capLine in ui-view. The saved cap and the plan on the screen stay.
// Any new search drops it (scheduleRun).
export function probeCap() {
  const { constraints } = app.state,
    cap = constraints.maxCredits + 1,
    ms = yearSearch() ? 3000 : 1500,
    probe = { cap, ms, res: null };
  ui.capProbe = probe;
  const end = (res) => {
    if (ui.capProbe !== probe) return;
    probe.res = res;
    if (!res) {
      ui.capProbe = null; // the button comes back, so it can be tried again
      toast('הבדיקה לא הצליחה. אפשר לנסות שוב.');
    }
    ui.probeWorker?.terminate();
    const hadFocus = document.activeElement?.dataset?.k === 'capProbe';
    keepFocus(renderView);
    if (hadFocus) document.querySelector('.cap-preview [tabindex]')?.focus({ preventScroll: true }); // the sentence first, then Tab to the button
  };
  try {
    ui.probeWorker = new Worker(new URL('./solver-worker.js', import.meta.url), { type: 'module' });
  } catch {
    end(null);
    return;
  }
  ui.probeWorker.onmessage = (e) => end(e.data);
  ui.probeWorker.onerror = () => end(null);
  ui.probeWorker.postMessage(searchMessage(candidates(), { ...constraints, maxCredits: cap }, ms));
}
// The new cap and the plan already found for it: no third search.
export function applyCapProbe() {
  const p = ui.capProbe;
  if (!p?.res?.results?.length) return false;
  app.state.constraints.maxCredits = p.cap;
  ui.last = { ...p.res, ms: p.ms };
  ui.cur = 0;
  ui.moreMul = 1;
  ui.capProbe = null;
  return true;
}
export function setBusy() {
  $('board').classList.toggle('is-busy', ui.running);
  $('board').setAttribute('aria-busy', String(ui.running));
  $('busy').hidden = $('coursesBusy').hidden = !ui.running; // step 2 has no board: its own indicator
}
