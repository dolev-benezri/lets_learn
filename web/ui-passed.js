// Design A: "מה עברת עד עכשיו?" (spec "Phase 3, first run", step 2 and "Changing the year later"). The earlier years' mandatory courses by year, none ticked
// for a new student (unticked means not passed): step 2 of the first-run pass ticks them in the record at once, and a later year change asks the same question
// in a modal card for the years it makes earlier (askEarlier), applying nothing until "המשך". The sheet import (ui-me.js importGrades) fills the ticks.
import { app, esc } from './app.js';
import { ui, heb } from './ui-common.js';
import { earlierYearLists } from './first-run.js';

const nameOf = (id) => esc(heb(app.data.courses[id]?.name ?? id));

// the lists, one fieldset per year; chg: the data-chg of the checkboxes ('' for the modal, which reads them when it closes)
export function passedListHtml(groups, passed, chg) {
  const row = (id) =>
    `<li><label class="check a-pass-row"><input type="checkbox"${chg ? ` data-chg="${chg}"` : ''} data-id="${esc(id)}" data-k="pass-${esc(id)}"${
      passed.has(id) ? ' checked' : ''
    }><span>${nameOf(id)}</span></label></li>`;
  return groups
    .map((g) => `<fieldset class="a-pass-year"><legend>שנה ${g.name}׳</legend><ul class="plain a-pass-list">${g.ids.map(row).join('')}</ul></fieldset>`)
    .join('');
}

// the courses of step 2, for the student's year
export const stepTwoGroups = () => earlierYearLists(app.data, 1, app.state.profile.year ?? 1);
export const stepTwoIds = () => stepTwoGroups().flatMap((g) => g.ids);

export function stepTwoHtml() {
  const passed = new Set(app.state.passed ?? []);
  return `<p class="a-fr-line">גליון הציונים מאפקה-נט ממלא את זה לבד.</p>
    <button type="button" class="btn primary a-fr-wide" data-act="gradeImport" data-k="gradeImport">מעלים גליון ציונים (PDF)</button>
    <input type="file" id="gradeFile" hidden accept="application/pdf" data-chg="gradeFile">
    <p class="hint a-fr-msg" id="gradeMsg" role="status">${esc(ui.gradeMsg)}</p>
    <div class="a-pass-all"><span>אין גליון? מסמנים את מה שעברת:</span>
      <button type="button" class="btn" data-act="frPassAll" data-k="frPassAll">עברתי את כולם</button></div>
    ${passedListHtml(stepTwoGroups(), passed, 'frPassed')}`;
}

// The modal card of a year change: the courses of the years it makes earlier (groups), ticked as the record has them. Resolves the ids ticked on
// "המשך", or null on "ביטול" and Escape; nothing is changed here. Focus is inside while it is open; `back` runs after it closes (focus goes back to the year control).
export function askEarlier(groups, yearName, passed, back) {
  return new Promise((done) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'a-fr-dlg';
    dlg.setAttribute('aria-labelledby', 'yrTitle');
    dlg.innerHTML = `<section class="a-fr-card"><h2 id="yrTitle" tabindex="-1">מה עברת עד עכשיו?</h2>
      <p class="a-fr-line">עברתם לשנה ${esc(yearName)}׳. סמנו מה שעברתם בשנים שלפניה.</p>
      <div class="a-pass-all"><span>אין גליון? מסמנים את מה שעברת:</span><button type="button" class="btn" data-yr="all">עברתי את כולם</button></div>
      ${passedListHtml(groups, passed, '')}
      <div class="a-fr-foot"><div class="a-fr-btns"><button type="button" class="btn primary" data-yr="ok">המשך</button>
        <button type="button" class="btn ghost" data-yr="cancel">ביטול</button></div></div></section>`;
    document.body.append(dlg);
    const finish = (v) => {
      dlg.close();
      dlg.remove();
      back?.();
      done(v);
    };
    dlg.addEventListener('click', (e) => {
      const b = e.target.closest?.('[data-yr]');
      if (!b) return;
      if (b.dataset.yr === 'all') dlg.querySelectorAll('input[type="checkbox"]').forEach((i) => (i.checked = true));
      else finish(b.dataset.yr === 'ok' ? [...dlg.querySelectorAll('input[type="checkbox"]:checked')].map((i) => i.dataset.id) : null);
    });
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault(); // Escape is "ביטול"
      finish(null);
    });
    dlg.showModal();
    dlg.querySelector('#yrTitle').focus();
  });
}
