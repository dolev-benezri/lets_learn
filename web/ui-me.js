// The status page (#me): profile, specialization form, course lists with their states, grade-sheet import.
import { app, esc, refresh } from './app.js';
import { progress, setStatus, studyYear, yearsOf, gradeAverage, specLists, specRule, specConflict, validSpecs } from './rules.js';
import { icon } from './ui-grid.js';
import { askRows } from './ui-dialog.js';
import { readGradeSheet, parseGradeSheet } from './grade-import.js';
import { creditsGoal } from './ui-text.js';
import { STATUS, FAILS, YEARS, onboarded, gated, status, seg, details, toast, heb, listTitle, $, ui } from './ui-common.js';

// ---------- status page (#me) ----------
// One row per course: all states visible as radios. The failure count stays once set, also after "passed" (regulations 11.4.1, 11.5.x).
function chip(id, li) {
  const s = app.state, n = s.failed[id] ?? 0, k = `${li}-${id}`, nm = heb(app.data.courses[id].name);
  if (status(id) === 'exempt') return `<div class="crs" data-st="exempt" aria-disabled="true"><b>${esc(nm)}</b> <span class="tag ok">פטור</span></div>`;
  const st = s.passed.includes(id) ? 'passed' : n ? 'failed' : 'none';
  return `<div class="crs" data-st="${st}">${seg(`st-${k}`, nm, STATUS, st, `data-chg="status" data-id="${esc(id)}"`, true)
    }${st === 'passed' ? `<label class="field grade-f">ציון <input class="grade" type="number" min="0" max="100" inputmode="numeric"
      aria-label="${esc(`ציון ב${nm}`)}" data-chg="grade" data-cid="${esc(id)}" data-k="grade-${esc(k)}" value="${esc(s.grades[id] ?? '')}"></label>` : ''}${n
      ? seg(`fc-${k}`, `כמה פעמים נכשלתי ב${nm}`, FAILS, n, `data-chg="failCount" data-id="${esc(id)}"`) : ''}</div>`;
}



// The weighted-average line; its container is always rendered so a grade change can refresh just this line.
export const avgLine = () => { const { avg, credits } = gradeAverage(app.data, app.state); return avg === null ? '' : `ממוצע: <b>${esc(Math.round(avg * 10) / 10)}</b> (על ${esc(credits)} נ״ז)`; };

// The status page (#me): profile and progress beside the course lists on wide screens, one column on phones.
// Rendered only while shown; every change saves at once, so leaving the page loses nothing.
// The specialization form: only a valid choice is saved in profile.specs. A half-made one (two areas, one ticked) lives here and in
// state.specDraft, and only while it still matches the saved state (a reset or an import drops it).

// mode: 'none', 'alone' (one standalone area, e.g. vehicle) or 'pick' (rule.pick areas). Only the data's own areas and pick count are ever saved.
export const specSave = (data, mode, picks) => (mode === 'alone' ? [specRule(data).alone[0]] : mode === 'pick' ? validSpecs(data, picks) : []);
export function specView(data, saved) {
  const rule = specRule(data), kept = ui.specPick ?? (app.state.specDraft && { mode: 'pick', picks: app.state.specDraft }); // after a refresh only the draft is left
  if (kept && specSave(data, kept.mode, kept.picks).join() === saved.join()) return kept;
  return saved.length === 1 && rule.pick > 1 && rule.alone.includes(saved[0]) ? { mode: 'alone', picks: [] } : saved.length ? { mode: 'pick', picks: saved } : { mode: 'none', picks: [] };
}
const PICK_WORD = { 1: 'תחום אחד', 2: 'שני תחומים', 3: 'שלושה תחומים' };
const PICK_GROUPS = 'ראשית ומשנית (תחומים שונים)';
const specForm = (saved) => {
  const { specializations: areas = [] } = app.data, rule = specRule(app.data), { mode, picks } = specView(app.data, saved), full = picks.length >= rule.pick;
  const aloneName = areas.find((s) => s.id === rule.alone[0])?.name, word = rule.groups ? PICK_GROUPS : PICK_WORD[rule.pick] ?? `${rule.pick} תחומים`;
  const modes = [['none', 'עוד לא בחרתי'], ...(rule.pick > 1 && aloneName ? [['alone', `${aloneName} בלבד`]] : []), ['pick', word]].map(([v, t]) => [v, esc(t)]);
  return `${seg('p-spec', 'התמחות', modes, mode, 'data-chg="specMode"', true)}
    ${mode === 'pick' ? `<fieldset class="specs"><legend class="sr">${esc(word)}</legend>${areas.map((p) => `<label class="check"><input type="checkbox"
      data-chg="specPick" data-id="${esc(p.id)}" data-k="spec-${esc(p.id)}"${picks.includes(p.id) ? ' checked' : ''}${!picks.includes(p.id)
      && (full || picks.some((q) => specConflict(rule, q, p.id))) ? ' disabled' : ''}> ${esc(p.name)}</label>`).join('')}</fieldset>
      ${saved.length ? '' : `<p class="hint" role="status">בחרו ${esc(word)}</p>`}` : ''}
    <p class="hint">בוחרים התמחות בשנה ג׳. אפשר להשאיר ריק.</p>${rule.verified === false ? '<p class="hint">כלל הבחירה לפי הסבר התמחויות של המחלקה מ-2020. לא אומת.</p>' : ''}`;
};

// The two questions that fix who the schedule is for: the track (only when the catalog has more than one) and the study year, which also picks the cohort.
export function identityPick(year, visible) {
  const { programs } = app.catalog, cur = programs.find((p) => p.id === app.state.program) ?? programs[0];
  const opt = (p) => `<option value="${esc(p.id)}"${p.id === cur.id ? ' selected' : ''}>${esc(heb(p.name))}</option>`;
  const track = programs.length < 2 ? '' : `<label class="field pick">מסלול <select data-chg="program" data-k="program">${programs.map(opt).join('')}</select></label>`;
  const own = !year || cur.startYears.includes(app.data.year - year + 1); // no data for that cohort: the plan runs on the nearest one, and the page says so
  const note = own ? '' : `<p class="hint" role="status">אין עדיין נתונים למחזור של שנה ${esc(YEARS.find(([n]) => n === year)[1])}. התכנון לפי מחזור ${app.state.startYear}.</p>`;
  return track + seg('p-year', 'שנת לימודים', YEARS.slice(0, yearsOf(app.data)), year, 'data-chg="pyear"', visible) + note;
}

export function renderMe() {
  const el = $('me');
  if (el.hidden) { el.innerHTML = ''; return; }
  const { data, state, cls } = app;
  if (gated() && document.body.dataset.view !== 'me') { // the builder waits for the study year: one question, nothing else
    el.innerHTML = `<div class="me-head"><h1 id="meTitle" tabindex="-1">${app.catalog.programs.length > 1 ? 'באיזה מסלול ובאיזו שנה את/ה?' : 'באיזו שנה את/ה?'}</h1></div>
      <section class="me-card gate">${identityPick(null, true)}
        <p class="hint">שנת הלימודים קובעת את יעד הנ״ז ואת דרישות האנגלית, ורק אחריה נבנית המערכת.</p></section>`;
    return;
  }
  const unverified = data.verified === false ? '<p class="hint">הנתונים של התוכנית הזו עוד לא נבדקו מול סטודנט מהמחלקה.</p>' : '';
  const pr = progress(data, state);
  const pct = Math.min(100, Math.round(pr.ratio * 100));
  // Years already studied are open; later years and the other lists sit in a collapsed section.
  // A chosen year opens its own list too (and the earlier ones); without a choice only the earlier years are open.
  const open = state.profile.year ?? studyYear(data, state) - 1;
  const lists = data.lists.map((l, i) => ({ ...l, i, year: l.name.match(/חובה שנה (\S)'/)?.[1] }));
  const past = (l) => l.year && ' אבגד'.indexOf(l.year) <= open;
  const group = (l) => `<div class="year"><div class="year-head"><h3>${l.year ? `שנה ${esc(l.year)}׳` : esc(heb(listTitle(l)))} <span>${l.minCredits
    ? `(לפחות ${l.minCredits} נ״ז)` : ''}</span></h3>${l.year ? `<button type="button" class="btn" data-act="yearPassed" data-li="${l.i}"
    data-k="year-${l.i}">סמן את כל שנה ${esc(l.year)}׳ כ״עברתי״</button>` : ''}</div><div class="chips">${l.courses.map((id) => chip(id,
    l.i)).join('')}</div></div>`;
  const sp = specLists(data, state.profile.specs), isSpec = (l) => sp.all.has(l.code);
  const others = lists.filter((l) => !past(l) && !isSpec(l)), specOthers = lists.filter((l) => isSpec(l) && !sp.chosen.has(l.code));
  const step = onboarded()
    ? 'עדכנו מה עברתם או נכשלתם בו. מערכת השעות מתעדכנת לבד.'
    : `<b>צעד ראשון:</b> סמנו מה כבר עברתם${studyYear(data, state) > 1 ? ' (שנה א׳ מסומנת מראש)' : ''}, ואז לחצו ״סיימתי״.`;
  el.innerHTML = `<div class="me-head"><h1 id="meTitle" tabindex="-1">המצב שלי</h1><p class="me-step">${step}</p></div>
    <div class="me-grid">
      <div class="me-side">
        <section class="me-card profile" aria-labelledby="meProfile"><h2 id="meProfile">פרופיל</h2>
          ${identityPick(state.profile.year, true)}${unverified}${state.profile.year ? '' : '<p class="hint">בחרו שנה כדי לבנות מערכת.</p>'}
          <label class="field">ציון אמירנט <input type="number" inputmode="numeric" min="50" max="150" step="1" data-chg="amirnet" data-k="amirnet"
            value="${esc(state.profile.amirnet ?? '')}"><span class="hint">ריק אם לא ידוע</span></label>
          <div class="spec-sec">${specForm(state.profile.specs)}</div>
          <label class="check"><input type="checkbox" data-chg="summer" data-k="summer"${state.profile.summer ? ' checked' : ''}> אני מתכנן/ת סמסטר קיץ השנה</label>
          <p class="hint">הקיץ מתוכנן אחרי שנת הלימודים</p></section>
        <section class="me-card" aria-labelledby="meProg"><h2 id="meProg">התקדמות</h2>
          <div class="progress"><div class="progress-top"><span><b>${esc(creditsGoal(pr.earned, pr.required, studyYear(data, state)))}</b> · ${pct}%</span><span
            class="hint">יעד 70% (תקנון 11.4.4)</span></div>
          <div class="bar" role="progressbar" aria-label="התקדמות בתוכנית" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i
            style="width:${pct}%"></i><span class="target" aria-hidden="true"></span></div></div>
          <p class="hint" id="gradeAvg" aria-live="polite">${avgLine()}</p>
          <button type="button" class="btn" data-act="openMap" data-k="openMap">${icon('share')} הראה התקדמות</button>
          <button type="button" class="btn" data-act="gradeImport" data-k="gradeImport">${icon('file')} ייבוא מגליון ציונים (PDF)</button>
          <input type="file" id="gradeFile" hidden accept="application/pdf" data-chg="gradeFile">
          <p class="hint" id="gradeMsg" role="status">${esc(ui.gradeMsg)}</p></section>
        <section class="me-card" aria-labelledby="meData"><h2 id="meData">הנתונים שלי</h2>
          <p class="hint">הכול נשמר רק בדפדפן הזה. <a href="legal.html#privacy" target="_blank" rel="noopener">פרטיות<span class="sr"> (נפתח בחלון חדש)</span></a></p>
          <button type="button" class="btn" data-act="eraseAll" data-k="eraseAll">${icon('trash')} מחק את כל הנתונים שלי</button></section>
      </div>
      <section class="me-main" aria-labelledby="meCourses"><h2 id="meCourses">קורסים לפי שנה</h2>
        ${cls.warnings.map((w) => `<p class="warnbox">${icon('alert')}<span>${esc(w)}</span></p>`).join('')}
        <p class="hint">כישלון נשמר גם אחרי שעברתם, כי הוא נספר בתקנון.</p>
        ${lists.filter(past).map(group).join('')}
        ${lists.filter((l) => sp.chosen.has(l.code)).map(group).join('')}
        ${details('others', 'שנים מתקדמות וקורסים נוספים', others.map(group).join(''), others.length)}
        ${details('specOthers', 'התמחויות אחרות', specOthers.map(group).join(''), specOthers.length)}
      </section>
    </div>
    <div class="me-foot"><span class="hint">כל שינוי נשמר מיד.</span><a class="btn primary" href="#" data-act="statusDone" data-k="statusDone">${icon('check')} סיימתי, לבניית המערכת</a></div>`;
}

// ---------- grade-sheet import (PDF read on this device only, never stored) ----------
const GRADE_NONE = 'לא זוהו קורסים. האם זה גליון הציונים מהפורטל?';
const setGradeMsg = (m) => { ui.gradeMsg = m; const el = $('gradeMsg'); if (el) el.textContent = m; };
export async function importGrades(file) {
  const { data, state } = app;
  setGradeMsg('קוראים את הגליון…');
  let found;
  try { found = parseGradeSheet(await readGradeSheet(file), data); } catch (e) { return setGradeMsg(e.user ? e.message : 'לא הצלחנו לקרוא את הקובץ.'); }
  const rows = found.filter((r) => r.result !== 'pending');
  if (!rows.length) return setGradeMsg(GRADE_NONE);
  const now = (id) => (state.passed.includes(id) ? 'passed' : state.failed[id] ? 'failed' : 'none');
  const WORD = { passed: 'עברתי', failed: 'נכשלתי', none: 'לא נלקח' };
  const todo = rows.filter((r) => (r.result === 'failed' ? now(r.id) !== 'failed' : now(r.id) !== 'passed' || (r.grade !== null && r.result === 'passed' && state.grades[r.id] !== r.grade)));
  if (!todo.length) return setGradeMsg(`זוהו ${rows.length} קורסים והכול כבר מעודכן.`);
  const label = (r) => { const to = r.result === 'failed' ? 'failed' : 'passed', was = now(r.id); return `${r.result === 'exempt' ? 'פטור, נחשב עברתי'
    : WORD[to]}${was === to ? '' : ` (היה: ${WORD[was]})`}`; };
  const pick = await askRows('ייבוא מגליון ציונים', 'הקובץ נקרא רק במכשיר שלך ולא נשמר. בדקו מה ישתנה וסמנו מה להחיל.', ['קורס', 'ציון', 'שינוי'],
    todo.map((r) => [data.courses[r.id].name, r.result === 'passed' ? String(r.grade) : '—', label(r)]));
  if (!pick) return setGradeMsg('');
  for (const i of pick) {
    const r = todo[i];
    setStatus(state, r.id, r.result === 'failed' ? 'failed' : 'passed');
    if (r.result === 'failed') delete state.grades[r.id]; // gradeAverage counts passed courses only
    else if (r.result === 'passed') state.grades[r.id] = r.grade;
  }
  setGradeMsg('');
  refresh();
  toast(pick.length === 1 ? 'עודכן קורס אחד' : `עודכנו ${pick.length} קורסים`);
}
