// The auto search: debounce, worker, "חפש עוד" budget.
import { app, candidateMode, yearCourses, keepFocus } from '../../web/app.js';
import { gated, yearSearch, toast, focusWeek, $, ui } from '../../web/ui-common.js';
import { renderView } from '../../web/ui-view.js';

// ---------- search ----------
export const MAX_MS = 12000; // "חפש עוד" doubles the time limit up to this
export function scheduleRun(again = false) {
  if (!again) ui.moreMul = 1;
  clearTimeout(ui.timer);
  if (gated()) { ui.gen++; ui.running = false; ui.last = null; ui.worker?.terminate(); setBusy(); return; }
  ui.gen++;
  ui.running = true;
  setBusy();
  ui.timer = setTimeout(run, 300);
}
function run() {
  const { state, data, cls } = app;
  const courses = Object.keys(data.courses).map((id) => ({ id, mode: candidateMode(id) })).filter((x) => x.mode === 'must' || x.mode === 'optional');
  const my = ui.gen; // a newer scheduled search keeps the indicator on
  const byMore = ui.moreMul > 1, ms = Math.min((yearSearch() ? 3000 : 1500) * ui.moreMul, MAX_MS);
  const done = () => {
    ui.running = my !== ui.gen;
    if (byMore && !ui.running && ui.last) toast(ui.last.partial ? `החיפוש המורחב הסתיים (${+(ms / 1000).toFixed(1)} שניות)` : 'החיפוש הושלם: נבדקו כל האפשרויות');
    const hadMore = document.activeElement?.dataset?.k === 'searchMore';
    keepFocus(renderView);
    if (hadMore && !document.querySelector('[data-k="searchMore"]')) focusWeek(); // the search finished: the button is gone
  };
  ui.worker?.terminate();
  ui.runError = null;
  if (gated() || !courses.length) { ui.last = null; done(); return; }
  try {
    ui.worker = new Worker(new URL('../../web/solver-worker.js', import.meta.url), { type: 'module' });
  } catch (err) { ui.runError = err.message || 'לא ניתן להפעיל את החיפוש'; ui.last = null; done(); return; }
  ui.worker.onmessage = (e) => { if (my !== ui.gen) return; ui.last = { ...e.data, ms }; ui.cur = 0; done(); };
  ui.worker.onerror = (e) => { if (my !== ui.gen) return; ui.runError = e.message || 'שגיאה לא ידועה'; ui.last = null; done(); }; // the old plan no longer matches the settings
  const pins = state.pins.filter((p) => courses.some((c) => data.courses[c.id].groups.some((g) => g.id === p))); // stale pins stay in state
  if (yearSearch()) ui.worker.postMessage({ year: { dataA: app.sem['א'], dataB: app.sem['ב'], state, yearList: new Set(yearCourses()), pins: state.pins,
    constraints: state.constraints, weights: state.weights, friends: state.friends, timeLimitMs: ms } });
  else ui.worker.postMessage({ data, courses, statuses: cls.statuses, pins, constraints: state.constraints, weights: state.weights, friends: state.friends, timeLimitMs: ms });
}
export function setBusy() {
  $('board').classList.toggle('is-busy', ui.running);
  $('board').setAttribute('aria-busy', String(ui.running));
  $('busy').hidden = !ui.running;
}
