// Design A, first-run step 3 ("אילו קורסים בסמסטר?", spec "Phase 3, first run"): the courses the site suggests, each row only its name, its credits and
// חובה / אולי / לא; what the course tool adds per course (what it opens, "זמין בתנאי", "למה?", the semester) sits under the row's "עוד" (a native <details>
// that keeps its open state across a redraw). "המשך" without a touch keeps the site's suggestion: nothing is stored until a choice is made.
import { app, esc, candidateMode, planningCls, yearCourses } from './app.js';
import { modeFor } from './rules.js';
import { unlockCounts } from './solver-core.js';
import { splitReason } from './ui-text.js';
import { yearPickOf } from './ui-side.js';
import { CAND, SEM_PICK, colors, listIds, status, doneIds, planned, seg, courseRowA, ui } from './ui-common.js';

const MODES = [
  ['must', 'חובה'],
  ['optional', 'אולי'],
  ['no', 'לא']
];
const ORDER = { retake: 0 }; // a course to retake first, then the rest in the lists' order

// The rows: what the site suggests for this record (the year's list, a course to retake) and whatever is planned now. A course set to "לא" keeps its row,
// so the choice can be changed back.
export function stepThreeIds() {
  const pc = planningCls(),
    inYear = new Set(yearCourses());
  return listIds()
    .filter((id) => CAND.includes(status(id, pc)) && (planned(id) || modeFor(status(id, pc), undefined, inYear.has(id)) !== 'no'))
    .sort((a, b) => (ORDER[status(a, pc)] ?? 1) - (ORDER[status(b, pc)] ?? 1));
}

// the row's "עוד": the semester, what the course opens, the warnings and the reasons (the regulation's citation behind "למה?", ui-actions.js ACT.why)
function extrasOf(id, pc, unlocks) {
  const c = app.data.courses[id],
    s = pc.statuses[id];
  const sem = yearPickOf(c.semesters, s, candidateMode(id), false)
    ? `<label class="a-sem"><span>סמסטר</span><select data-chg="semOf" data-id="${esc(id)}" data-k="fr-sem-${esc(id)}"
        aria-label="באיזה סמסטר ללמוד את ${esc(c.name)}">${SEM_PICK.map(
          ([v, t]) => `<option value="${v}"${v === (app.state.semesterOf[id] ?? '') ? ' selected' : ''}>${t}</option>`
        ).join('')}</select></label>`
    : '';
  const info = [
    unlocks[id] ? `<span>${unlocks[id] === 1 ? 'פותח קורס אחד' : `פותח ${unlocks[id]} קורסים`}</span>` : '',
    s.status === 'retake' ? '<span class="tag warn">חזרה</span>' : '',
    s.status === 'conditional' ? '<span class="tag warn">זמין בתנאי</span>' : ''
  ].join('');
  const reasons = s.reasons
    .map((r, i) => {
      const { short, cite } = splitReason(r),
        key = `fr-${id}-${i}`,
        token = `cite-${key.replace(/[^\w-]/g, (ch) => `_${ch.codePointAt(0).toString(16)}`)}`, // a whitespace-free id for aria-controls
        open = ui.whyOpen.has(key);
      return `<p class="reason">${esc(short)}${
        cite
          ? ` <button type="button" class="a-which" data-act="why" data-why="${esc(key)}" data-k="why-${esc(key)}" aria-expanded="${open}"
              aria-controls="${token}" aria-label="למה? ${esc(`${c.name}: ${short}`)}">למה?</button><span id="${token}" class="a-cite"${open ? '' : ' hidden'}> (${esc(cite)})</span>`
          : ''
      }</p>`;
    })
    .join('');
  return `${sem}${info ? `<div class="a-status">${info}</div>` : ''}${reasons}`;
}

function row(id, pc, unlocks) {
  const c = app.data.courses[id],
    more = extrasOf(id, pc, unlocks);
  return `<li class="a-crs c${colors.get(id) ?? 7}">${courseRowA(`fr-more-${id}`, id, c, seg(
    `fr-mode-${id}`,
    `מה לעשות עם ${c.name}`,
    MODES,
    candidateMode(id),
    `data-chg="mode" data-id="${esc(id)}"`
  ), more, '', 'firstRun')}</li>`;
}

export function stepThreeHtml() {
  const pc = planningCls(),
    ids = stepThreeIds(),
    unlocks = unlockCounts(app.data, doneIds(pc)),
    n = ids.filter(planned).length;
  const body = ids.length
    ? `<ul class="plain a-crs-list">${ids.map((id) => row(id, pc, unlocks)).join('')}</ul>`
    : '<p class="hint">אין קורסים להצעה. אפשר להוסיף קורסים אחר כך, בכלי ״קורסים״.</p>';
  return `<p class="a-fr-line">חובה: בכל מערכת. אולי: רק אם משתלב טוב. לא: לא בתכנון.</p>
    <h3 class="a-fr-sub">בתכנון (${n})</h3>${body}`;
}
