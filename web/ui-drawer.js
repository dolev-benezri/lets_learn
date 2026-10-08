// Drawer panels: preferences, friends, registration list.
import { app, esc, DEFAULT } from './app.js';
import { SEMESTER_DATES } from './ics.js';
import { DAYS, DAY_FULL, icon, initials, yedion, typeLabel, nearestStep, groupIndex, backups, isPair, semResult } from './ui-grid.js';
import { groupLabel, strictnessHint, defaultNotes, hebYear, groupCount } from './ui-text.js';
import { WEIGHTS, SCALE, FSCALE, SEMS, scopes, colors, LOAD, HARD, SHEET, current, allGroupIds, seg, $, ui } from './ui-common.js';

// ---------- drawer panels ----------
export const MAX_BLOCKS = 12;
const blockRow = (b, i) => {
  const when = `יום ${DAY_FULL[b.day]} ${b.start}–${b.end}`;
  return `<div class="brow">
    <label class="field">יום <select data-chg="blkDay" data-i="${i}" data-k="blk-${i}-day">${[1, 2, 3, 4, 5, 6].map((d) => `<option value="${d}"${d === b.day
      ? ' selected' : ''}>${DAYS[d]}׳</option>`).join('')}</select></label>
    <label class="field">מ-<input type="time" data-chg="blkStart" data-i="${i}" data-k="blk-${i}-start" value="${b.start}"></label>
    <label class="field">עד<input type="time" data-chg="blkEnd" data-i="${i}" data-k="blk-${i}-end" value="${b.end}"></label>
    <label class="field col grow">תיאור (לא חובה)<input type="text" maxlength="30" data-chg="blkLabel" data-i="${i}" data-k="blk-${i}-label" value="${esc(b.label)}"></label>
    <button type="button" class="btn" data-act="blkRemove" data-i="${i}" data-k="blk-rm-${i}" aria-label="הסר זמן תפוס: ${when}">הסר</button></div>`;
};

function prefsPanel() {
  const { state, data } = app, c = state.constraints, notes = defaultNotes(DEFAULT.constraints);
  const pinName = (p) => { const x = groupIndex(data).get(p); return x ? `${esc(x.c.name)} · ${esc(groupLabel(x.g))}` : esc(p); };
  return ['העדפות', `
    ${app.sem['ב'] ? `<section class="dr-sec"><h3>תכנון</h3>
      ${seg('scope', 'לתכנן', scopes(), state.scope, 'data-chg="scope"', true)}
      ${state.scope === 'year' ? seg('load', 'איפה להעמיס', LOAD, state.load, 'data-chg="load"', true) : ''}</section>` : ''}
    <section class="dr-sec"><h3>מה חשוב לך?</h3>
      ${WEIGHTS.filter(([k]) => k !== 'examSpread' || data.examsPublished).map(([k, t]) => seg(`w-${k}`, t, SCALE, nearestStep(state.weights[k], [0, 1, 3, 5]),
        `data-chg="w" data-w="${k}"`, true)).join('')}</section>
    <section class="dr-sec"><h3>ימים שאני רוצה פנויים</h3>
      <div class="daypills" role="group" aria-label="ימים פנויים">${[1, 2, 3, 4, 5, 6].map((d) => `<button type="button" class="daypill" data-act="dayOff"
        data-day="${d}" data-k="doff-${d}" aria-pressed="${c.dayOff.includes(d)}">${DAYS[d]}׳<span class="sr"> ${DAY_FULL[d]}</span></button>`).join('')}</div>
      <p class="hint">${esc(notes.days)}</p>
      ${seg('dayHard', 'עד כמה זה מחייב?', HARD, c.dayOffHard ? 'hard' : 'soft', 'data-chg="dayHard"', true)}
      <p class="hint">${strictnessHint(c.dayOffHard)}</p></section>
    <section class="dr-sec"><h3>שעות</h3>
      <div class="times"><label class="field">לא לפני <input type="time" data-chg="notBefore" data-k="notBefore" value="${esc(c.notBefore)}"></label>
      <label class="field">לא אחרי <input type="time" data-chg="notAfter" data-k="notAfter" value="${esc(c.notAfter)}"></label></div>
      <p class="hint">${esc(notes.hours)}</p>
      ${seg('winHard', 'עד כמה זה מחייב?', HARD, c.windowHard ? 'hard' : 'soft', 'data-chg="winHard"', true)}
      <p class="hint">${strictnessHint(c.windowHard)}</p></section>
    <section class="dr-sec"><h3 id="busyH">זמן תפוס</h3>
      <p class="hint">עבודה, אימון: החיפוש לא ישבץ שיעורים בזמנים האלה.</p>
      <div role="group" aria-labelledby="busyH">${c.blocks.map(blockRow).join('')}</div>
      ${c.blocks.length < MAX_BLOCKS ? `<button type="button" class="btn" data-act="blkAdd" data-k="blkAdd">+ הוסף זמן תפוס</button>` : ''}</section>
    ${lecturerSec(c.lecturers)}
    <section class="dr-sec"><h3>עוד אפשרויות</h3>
      <label class="field">תקרת נ״ז <input type="number" inputmode="decimal" min="0" step="0.5" placeholder="ללא" data-chg="maxCredits" data-k="maxCredits" value="${c.maxCredits ?? ''}"></label>
      <label class="field">לכל היותר ימים בקמפוס <select data-chg="maxDays" data-k="maxDays">${['', 1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}"${(c.maxDays ?? '')
        === n ? ' selected' : ''}>${n || 'ללא'}</option>`).join('')}</select></label>
      <label class="check"><input type="checkbox" data-chg="examsAllow" data-k="examsAllow"${c.examsSameDay === 'allow' ? ' checked' : ''}> לאפשר 2 בחינות באותו יום</label>
      <label class="check"><input type="checkbox" data-chg="includeFull" data-k="includeFull"${c.includeFull ? ' checked' : ''}> לכלול קבוצות מלאות</label></section>
    ${state.pins.length ? `<section class="dr-sec"><h3>נעיצות</h3><p class="hint">${state.pins.length === 1 ? 'קבוצה אחת נעוצה' : `${state.pins.length} קבוצות נעוצות`}:</p><ul
      class="plain">${state.pins.map((p) => `<li>${pinName(p)}</li>`).join('')}</ul>
      <button type="button" class="btn" data-act="clearPins" data-k="clearPins">${icon('pin')} נקה נעיצות</button></section>` : ''}
    <section class="dr-sec"><button type="button" class="btn" data-act="resetPrefs" data-k="resetPrefs">איפוס העדפות</button>
      <p
        class="hint">מחזיר את התכנון לשנה והעמסה מאוזנת, את המשקלים, הימים והשעות,
        תקרת הנ״ז, בחינות באותו יום וקבוצות מלאות לברירת המחדל. המצב האישי, הקורסים, הנעיצות, הזמן התפוס והחברים לא משתנים.</p></section>
    <footer class="dr-foot"><button type="button" class="btn ghost" data-act="backup" data-k="backup">${icon('copy')} העתק קישור גיבוי מלא</button>
      <p class="hint">פרטי: כולל את כל המצב שלך. לשימוש רק במכשירים שלך.</p></footer>`];
}

function friendsPanel() {
  const { state } = app, known = allGroupIds();
  const row = (f, i) => {
    const miss = f.groups.filter((g) => !known.has(g)).length;
    return `<div class="frow"><span class="av lg" aria-hidden="true">${esc(initials(f.name))}</span>
      <div class="grow"><b>${esc(f.name)}</b><p class="hint">${groupCount(f.groups.length - miss)}${miss ? ` · <span class="warn-text">${miss} לא נמצאו</span>` : ''}</p></div>
      <div class="frow-acts">${f.manual ? `<button type="button" class="btn icon-btn ghost" id="editFriend-${i}" data-act="editFriend" data-i="${i}"
        aria-label="ערוך את ${esc(f.name)}">${icon('pencil')}</button>` : ''}
      <button type="button" class="btn icon-btn ghost" data-act="removeFriend" data-i="${i}" aria-label="הסר את ${esc(f.name)}">${icon('x')}</button></div>
      <div class="frow-full">${seg(`fw-${i}`, `כמה חשוב להיות עם ${f.name}?`, FSCALE, nearestStep(f.weight, [0, 1, 2, 3]), `data-chg="fw" data-i="${i}"`, true)}
      <label class="check"><input type="checkbox" data-chg="factive" data-i="${i}" data-k="fa-${i}"${f.active ? ' checked' : ''}> להציג במערכת</label></div></div>`;
  };
  return ['חברים', `
    <section class="dr-sec fr-sec"><h3>הוספת חבר</h3>
      <p class="hint" id="friendHow">בקשו מחבר ללחוץ על ״שתף״ ולשלוח לכם את הקישור, והדביקו אותו כאן.</p>
      <form id="addFriendForm" class="row"><label for="friendUrl" class="sr">קישור שחבר שלח</label>
        <input id="friendUrl" type="text" inputmode="url" autocomplete="off" dir="ltr" data-k="friendUrl" placeholder="הדביקו קישור" value="${esc(ui.friendUrl)}"
          aria-describedby="friendHow${ui.friendMsg ? ' friendErr' : ''}"${ui.friendMsg ? ' aria-invalid="true"' : ''}>
        <button type="submit" class="btn primary" data-k="addFriend">${icon('user-plus')} הוסף</button></form>
      ${ui.friendMsg ? `<p class="err-text" id="friendErr" role="alert">${icon('alert')} ${esc(ui.friendMsg)}</p>` : ''}
      <button type="button" class="btn fr-wide" id="openFriendEditor" data-act="openFriendEditor" data-k="openFriendEditor">הזנת מערכת של חבר</button></section>
    <section class="dr-sec fr-sec"><h3>החברים שלי</h3>${state.friends.map(row).join('') || `<div
      class="fr-empty">${icon('user-plus')}<p><b>עוד אין חברים</b></p><p
      class="hint">הדביקו למעלה קישור שחבר שלח, או הזינו את המערכת שלו ידנית.</p></div>`}</section>
    <section class="dr-sec fr-sec"><h3>הקישור שלי</h3>
      <label class="field col">השם שלי בקישור <input type="text" maxlength="60" data-chg="myName" data-k="myName" value="${esc(state.name)}"></label>
      <button type="button" class="btn fr-wide" data-act="share" data-k="copyMine">${icon('copy')} העתק את הקישור שלי</button>
      <button type="button" class="btn fr-wide" data-act="shareOut" data-k="shareOut">${icon('share')} שתף (וואטסאפ ועוד)</button>
      <p class="hint">הקישור כולל רק את השם ואת הקבוצות של החלופה המוצגת, בלי ציונים.</p></section>`];
}

// A pair lists each semester under its own heading, each against its own data file; a single result has one untitled part.
const regParts = (r) => (isPair(r) ? SEMS.map(([s, title]) => ({ title, res: semResult(r, s), data: app.sem[s] })) : [{ title: null, res: r, data: app.data }]);

// Lecturers chosen from a lesson's popover: one row each, with a remove button. Shown only once there is one.
const lecturerSec = (L) => (Object.keys(L).length ? `<section class="dr-sec"><h3>מרצים</h3><ul class="plain">${Object.entries(L).map(([name, mode]) => `<li>${
  mode === 'avoid' ? 'להימנע מקבוצות של ' : 'להעדיף את '}<b>${esc(name)}</b> <button type="button" class="btn sm" data-act="lecturerDrop" data-name="${esc(name)}"
  aria-label="${esc(`הסר את ${name}`)}">הסר</button></li>`).join('')}</ul><p class="hint">בוחרים מתוך חלון השיעור בלוח.</p></section>` : '');

export function registrationText(r) {
  const one = (res, data) => {
    const alt = (g) => (res.alts?.[g] ? ` (או ${res.alts[g].join(', ')})` : '') + (backups(data, res, g).length ? ` [גיבוי: ${backups(data, res, g).join(', ')}]` : '');
    return res.courses.map((cid) => `${cid} ${data.courses[cid].name}: ${res.groups.filter((g) => data.courses[cid].groups.some((x) => x.id === g)).map((g) => g + alt(g)).join(', ')}`).join('\n');
  };
  return regParts(r).map((p) => (p.title ? `${p.title}\n${one(p.res, p.data) || '—'}` : one(p.res, p.data))).join('\n\n');
}

function regPanel() {
  const raw = current(), data = app.data;
  if (!raw) return ['רשימה להרשמה', '<p class="hint">עוד אין מערכת. בחרו קורסים, והרשימה תופיע כאן.</p>'];
  const rowsOf = (res, data) => res.courses.map((cid) => {
    const c = data.courses[cid], gs = c.groups.filter((g) => res.groups.includes(g.id));
    return `<li class="c${colors.get(cid) ?? 7}"><span class="dot" aria-hidden="true"></span><div class="grow"><b>${esc(c.name)}</b>
      <span class="hint">${esc(cid)} · <span class="nw">${c.credits} נ״ז</span></span>
      <p>${gs.map((g) => `${g.primary ? 'קבוצה' : esc(typeLabel(g.type))} <bdi dir="ltr">${esc(g.id)}</bdi>${res.alts?.[g.id] ? ` <span class="hint">(או <bdi
        dir="ltr">${res.alts[g.id].map(esc).join(', ')}</bdi>, באותן שעות)</span>` : ''}${backups(data, res, g.id).length ? ` <span class="hint">(גיבוי: <bdi
        dir="ltr">${backups(data, res, g.id).map(esc).join(', ')}</bdi>)</span>` : ''}`).join(' · ')}</p></div>
      <a class="btn icon-btn ghost" href="${yedion(cid)}" target="_blank" rel="noopener" aria-label="${esc(c.name)} בידיעון (חלון חדש)">${icon('external-link')}</a></li>`;
  }).join('');
  const parts = regParts(raw);
  const exams = parts.flatMap((p) => p.res.exams).filter((e) => e.kind === 'בחינה').sort((a, b) => a.date.localeCompare(b.date));
  return ['רשימה להרשמה', `<p class="hint">חלופה ${ui.cur + 1} מתוך ${ui.last.results.length}. ההרשמה עצמה נעשית באפקה-נט.</p>
    ${parts.map((p) => `${p.title ? `<h3 class="reg-sem">${p.title}</h3>` : ''}${p.res.courses.length ? `<ul class="reglist">${rowsOf(p.res, p.data)}</ul>`
      : '<p class="hint">אין קורסים בסמסטר הזה.</p>'}`).join('')}
    <section class="dr-sec"><h3>בחינות</h3>${data.examsPublished
      ? `<ul class="plain">${exams.map((e) => `<li>${esc(data.courses[e.course].name)} · מועד ${esc(e.moed)} · <bdi dir="ltr">${esc(e.date)} ${esc(e.time ?? '')}</bdi></li>`).join('')}</ul>`
      : `<p class="hint">לוח הבחינות של ${hebYear(data.year)} טרם פורסם.</p>`}</section>`,
  `<button type="button" class="btn primary" data-act="copyReg" data-k="copyReg">${icon('copy')} העתק הכל</button>
  <button type="button" class="btn" data-act="ics" data-k="ics"${icsParts(raw) ? '' : ` disabled aria-describedby="icsNo"`}>${icon('calendar')} הוסף ללוח שנה</button>
  ${icsParts(raw) ? '' : `<p class="hint" id="icsNo">לוח השנה של ${hebYear(data.year)} עוד לא הוזן באתר.</p>`}`];
}
// The calendar file's parts: each semester of the plan with its dates, or null when a semester's dates are not in SEMESTER_DATES (no wrong file).
export function icsParts(r) {
  const parts = regParts(r).map((p) => ({ ...p, dates: SEMESTER_DATES[p.data.year]?.[p.data.semester] }));
  return parts.every((p) => p.dates) ? parts : null;
}

const PANELS = { prefs: prefsPanel, friends: friendsPanel, reg: regPanel };
export function renderDrawer() {
  if (!ui.panel) return;
  const [title, body, actions = ''] = PANELS[ui.panel](); // actions: a row that stays under the header while the body scrolls
  $('drawer').innerHTML = `<div class="dr-top"><div class="dr-head"><h2 id="drawerTitle">${title}</h2>
    <button type="button" class="btn icon-btn ghost" data-act="closeDrawer" data-k="closeDrawer" aria-label="סגור">${icon('x')}</button></div>${actions ? `<div
      class="dr-actions">${actions}</div>` : ''}</div><div class="dr-body">${body}</div>`;
}
// ponytail: the modal/docked mode is picked when the drawer opens; resizing across the boundary while it is open keeps the old mode.
export function openPanel(name, from) {
  ui.panel = name;
  ui.opener = from;
  ui.friendMsg = '';
  renderDrawer();
  const d = $('drawer');
  if (!d.open) {
    const modal = matchMedia(SHEET).matches; // modal: native focus trap, inert page, Escape, scrim (::backdrop)
    d.classList.toggle('modal', modal);
    modal ? d.showModal() : d.show();
  }
  document.body.classList.add('drawer-open');
}
