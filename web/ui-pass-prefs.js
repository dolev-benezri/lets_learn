// Design A, first-run step 4 ("מה חשוב לך?", spec "Phase 3, first run"): three questions visible, the rest of the preferences page under "עוד הגדרות"
// (one native <details> that keeps its open state across a redraw). The first two are "לתכנן" and "איפה להעמיס" where the page shows them (ui-drawer.js prefsPanel: the
// first only when semester ב exists, the second only for a year plan), then "ימים פנויים"; a question that does not apply is replaced by "בלי חלונות" (and
// then "להתקדם בתואר"), so three are always visible. "המשך" keeps today's defaults. Its radio names carry "fr-": the hidden page keeps its own.
import { app, DEFAULT } from './app.js';
import { nearestStep } from './ui-grid.js';
import { defaultNotes } from './ui-text.js';
import { daysSec, hoursSec, busySec, moreSec } from './ui-drawer.js';
import { WEIGHTS, SCALE, SCOPE, LOAD, scopeOf, seg, details } from './ui-common.js';

const P = 'fr-';
const TEXT = Object.fromEntries(WEIGHTS);
const weight = (k) => seg(`${P}w-${k}`, TEXT[k], SCALE, nearestStep(app.state.weights[k], [0, 1, 3, 5]), `data-chg="w" data-w="${k}"`, true);

// the three visible questions, in order
export function visibleThree() {
  const list = [];
  if (app.sem['ב']) {
    list.push('scope');
    if (scopeOf(app.state.scope) === 'year') list.push('load');
  }
  return [...list, 'freeDays', 'compact', 'progress'].slice(0, 3);
}

export function stepFourHtml() {
  const { state, data } = app,
    c = state.constraints,
    shown = visibleThree();
  const ask = (k) =>
    k === 'scope'
      ? seg(`${P}scope`, 'לתכנן', SCOPE, scopeOf(state.scope), 'data-chg="scope"', true)
      : k === 'load'
        ? seg(`${P}load`, 'איפה להעמיס', LOAD, state.load, 'data-chg="load"', true)
        : weight(k);
  const rest = WEIGHTS.map(([k]) => k).filter((k) => !shown.includes(k) && (k !== 'examSpread' || data.examsPublished));
  const notes = defaultNotes(DEFAULT.constraints);
  const more = `${rest.map(weight).join('')}${daysSec(c, notes, P)}${hoursSec(c, notes, P)}${busySec(c, P)}${moreSec(c)}`;
  return `<p class="a-fr-line">אפשר להשאיר כמו שזה ולהמשיך.</p>
    <div class="a-fr-asks">${shown.map(ask).join('')}</div>${details('fr-more-prefs', 'עוד הגדרות', more, 1)}`;
}
