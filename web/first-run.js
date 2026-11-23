// Design A's first-run pass (spec "Phase 3, first run"): its steps, pure, no DOM. The mark kept in storage (ui-common.js firstRun) names the step reached
// by its number here (1..5); a first-year student has no "מה עברתי" step (nothing earlier to pass), so the number is not the position shown.
export const STEPS = ['start', 'passed', 'courses', 'prefs', 'friends'];
export const STEP_NAME = { start: 'תנאים', passed: 'מה עברתי', courses: 'קורסים', prefs: 'מה חשוב לי', friends: 'חברים' };

// The steps this student goes through. The year is not known before step 1 is done: all five until then.
export const passSteps = (year) => (year === 1 ? STEPS.filter((s) => s !== 'passed') : [...STEPS]);

// The step a mark stands for, among the steps this student has (a mark on a step the year no longer has stands for the next one).
export function stepOf(mark, year) {
  const steps = passSteps(year);
  const at = Math.min(Math.max(Number.isInteger(mark) ? mark : 1, 1), STEPS.length);
  return STEPS.slice(at - 1).find((s) => steps.includes(s)) ?? steps[steps.length - 1];
}
export const markOf = (step) => STEPS.indexOf(step) + 1;

// The step after `step`, or 'done'; the one before it, or null on the first.
export function nextStep(step, year) {
  const steps = passSteps(year);
  return steps[steps.indexOf(step) + 1] ?? 'done';
}
export function prevStep(step, year) {
  const steps = passSteps(year);
  return steps[steps.indexOf(step) - 1] ?? null;
}

// "שלב N מתוך M" and the line of step names, the current one marked: for the card's top.
export function stepLine(step, year) {
  const steps = passSteps(year);
  const n = steps.indexOf(step) + 1;
  return { n, of: steps.length, steps: steps.map((s, i) => ({ step: s, name: STEP_NAME[s], state: i + 1 < n ? 'done' : i + 1 === n ? 'now' : 'next' })) };
}

// ---- step 1: the choices a first visit makes on one card (a draft until "המשך") ----
// The years a track offers while its own data is not loaded: the loaded track knows (`loaded`, yearsOf), another one is told by its name: an evening
// track runs five years, the others four. A year a loaded track turns out not to have is cut when it loads (app.js refresh).
export const yearsFor = (programName, loaded = null) => loaded ?? (/\(ערב\)$/.test(programName ?? '') ? 5 : 4);

// What "המשך" needs: the terms read, and, in the pass, a track (when there is more than one) and a study year. The terms alone (improve's first visit, or the
// terms asked again) need only the box.
export const startReady = (draft, ask) => !!draft.t && (!ask.track || draft.p != null) && (!ask.year || draft.y != null);
