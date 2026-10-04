// The builder board: top bar, banners, the shown alternative (pills, notices, week grid) and the alternative switcher.
import { app, esc, save, refresh, candidateMode, keepFocus, summerOn, summerScope } from './app.js';
import { progress } from './rules.js';
import { unlockCounts } from './solver-core.js';
import { DAYS, icon, initials, groupIndex, hourRange, summary, renderWeek, renderDaySelector, assignColors, repeatIds, progressRanks, rankText, isPair,
  semResult, resCourses, resGroups, yearTotals } from './ui-grid.js';
import { freshness, stalePins, partialNote, hebYear, courseCount, count, compareAlts } from './ui-text.js';
import { SEMS, scopes, PHONE, heb, colors, current, shown, shownData, doneIds, planned, allGroupIds, pill, seg, $, ui } from './ui-common.js';
import { MAX_MS, setBusy } from './ui-search.js';
import { renderSide } from './ui-side.js';
import { renderDrawer } from './ui-drawer.js';

// ---------- top bar and banners ----------
export function renderTop() {
  const progs = app.catalog.programs, prog = progs.length > 1 ? progs.find((p) => p.id === app.data.program)?.name : null; // the program name only when there is a choice
  $('title').innerHTML = `המערכת שלי <small>· ${app.data.semester === 'שנה' ? 'שנה מלאה' : `סמסטר ${esc(app.data.semester)}׳`} ${hebYear(app.data.year)}${prog ? ` · ${esc(heb(prog))}` : ''}</small>`;
  // The exams-not-published note lives in the summary pills only; the header keeps the freshness line.
  const f = freshness(app.status, app.data.fetchedAt);
  $('meta').innerHTML = (f.stale ? `<span class="warn-text">${icon('alert')} ${esc(f.text)}</span>` : esc(f.text))
    + (app.data.verified === false ? ' · הנתונים של התוכנית הזו עוד לא נבדקו מול תוכנית הלימודים הרשמית.' : '');
  const fr = app.state.friends;
  $('friendsBtn').innerHTML = `<span class="stack" aria-hidden="true">${fr.slice(0, 3).map((f) => `<span
    class="av">${esc(initials(f.name))}</span>`).join('')}<span class="av plus">${icon('plus')}</span></span><span class="lbl">חברים${fr.length
    ? ` (${fr.length})` : ''}</span>`;
}

export function renderBanner() {
  const L = app.friendLanding;
  const known = allGroupIds();
  const missing = L ? L.groups.filter((g) => !known.has(g)).length : 0;
  const other = L && L.program !== undefined && L.program !== app.state.program // groups of another program rarely match
    ? app.catalog.programs.find((p) => p.id === L.program)?.name ?? 'לא מוכרת' : null;
  const gone = app.sem['ב'] ? stalePins(app.state.pins, [app.sem['א'], app.sem['ב']]) : []; // with one semester loaded, the other's pins would look gone
  $('banner').innerHTML = (app.hashError ? `<div class="banner err" role="alert">${icon('alert')}<span class="grow">${esc(app.hashError)}</span>
      <button type="button" class="btn icon-btn ghost" data-act="dismissError" aria-label="סגור הודעה">${icon('x')}</button></div>` : '')
    + gone.map((p) => `<div class="banner warn">${icon('alert')}<span class="grow">${esc(p.text)}. המערכת תבחר קבוצה אחרת אם תסירו את הנעיצה.</span>
      <button type="button" class="btn" data-act="dropPin" data-gid="${esc(p.gid)}">${icon('pin')} הסר נעיצה</button></div>`).join('')
    + (L ? `<div class="banner"><span class="av lg" aria-hidden="true">${esc(initials(L.name || 'חבר'))}</span>
      <div class="grow"><b>${esc(L.name || 'חבר')}</b> שיתף/ה איתך מערכת (${count(L.groups.length, 'שיעור אחד', 'שיעורים')})
      ${missing ? ` · <span class="warn-text">${missing} לא נמצאו בהיצע הנוכחי</span>` : ''}
      ${other ? ` · <span class="warn-text">מתוכנית אחרת (${esc(heb(other))})</span>` : ''}</div>
      <button type="button" class="btn primary" data-act="landingAdd" data-k="landingAdd">${icon('user-plus')} הוסף כחבר</button>
      <button type="button" class="btn" data-act="landingDrop">לא עכשיו</button></div>` : '');
}

// ---------- grid area ----------
function colorOrder() {
  const cand = Object.keys(app.data.courses).filter((id) => candidateMode(id));
  return [...cand.filter(planned).sort(), ...cand.filter((id) => !planned(id)).sort()];
}

export function renderView() {
  const { state } = app;
  const results = ui.last?.results ?? [];
  const none = results.length > 0 && results.every((r) => !resCourses(r).length); // every alternative is empty: same as no result
  const noRes = !!ui.last && (!results.length || none);
  const nAlt = none ? 0 : results.length;
  const raw = current(), pair = isPair(raw) && !none;
  const res = none ? null : shown(), data = shownData(); // one semester's result and its data file; app.data only when the result is a single semester
  const ids = raw && !none ? resCourses(raw) : []; // the shown alternative's courses (both semesters of a year pair)
  if (summerScope()) app.summerIds = ids; else if (!ui.running) { state.yearIds = ids; save(); } // summer is planned on top of the last shown year plan (kept over a refresh)
  app.planIds = new Set([...state.yearIds, ...(summerOn() ? app.summerIds : [])]); // the progress map marks them
  const friends = state.friends.filter((f) => f.active);
  assignColors(colors, res?.courses ?? [], colorOrder());
  ui.dashed = repeatIds(colors, res?.courses ?? []);
  const range = hourRange([...results.flatMap((r) => resGroups(r).flatMap((g) => groupIndex(app.data).get(g)?.g.meetings ?? [])),
    ...state.constraints.blocks]); // both semesters, so the hours don't jump between tabs; busy blocks always show
  if (ui.mobileDay > range.days) ui.mobileDay = 1;
  // Board header: scope and semester controls first, then the notices that hold for the whole plan (shown once, whichever tab is open).
  const note = (ic, t) => `<p class="notice">${icon(ic)}<span>${esc(t)}</span></p>`;
  const ctl = (app.sem['ב'] ? `<div class="ctl"><span class="ctl-l" aria-hidden="true">לתכנן</span>${seg('bscope', 'לתכנן', scopes(), state.scope, 'data-chg="scope"')}</div>` : '')
    + (pair ? `<div class="ctl">${seg('sem', 'סמסטר מוצג', SEMS, ui.sem, 'data-chg="sem"')}</div>` : '');
  const missing = pair ? raw.missing.map((id) => app.data.courses[id]?.name ?? id) : [];
  $('semtabs').innerHTML = ctl ? `<div class="board-ctl">${ctl}</div>` : ''; // sticky on phones (index.html)
  const summerNote = summerScope() ? (state.yearIds.length ? `הקיץ מניח שעוברים את ${state.yearIds.length} הקורסים שבמערכת השנה המוצגת.` : 'עוד אין מערכת לשנה: הקיץ מתוכנן לפי מה שכבר עברת.') : '';
  $('semnote').innerHTML = (app.semNotice ? note('info', app.semNotice) : '') + (summerNote ? note('info', summerNote) : '')
    + (pair ? raw.warnings.map((w) => note('info', w)).join('') : '')
    + (missing.length ? note('alert', `לא נכנס לאף סמסטר: ${missing.join(', ')}`) : '');

  $('altLabel').textContent = nAlt ? `חלופה ${ui.cur + 1} מתוך ${nAlt}` : 'אין חלופות';
  const stranded = [$('prev'), $('next')].includes(document.activeElement) && nAlt < 2;
  $('prev').disabled = $('next').disabled = nAlt < 2;
  if (stranded) $('switcher').focus();

  const pn = ui.last?.partial ? partialNote(ui.last.ms, MAX_MS) : null;
  const more = pn?.more ? '<button type="button" class="btn" data-act="more" data-k="searchMore">חפש עוד</button>' : '';
  let msg = pn && !noRes ? `<p class="notice partial" aria-live="polite">${icon('info')}<span>${pn.text}</span>${more}</p>` : '', live = '';
  if (ui.runError) msg = `<div class="msg bad" role="alert">${icon('alert')}<div><b>שגיאה בחיפוש</b><p>${esc(ui.runError)}</p></div></div>`;
  else if (!Object.keys(app.data.courses).some(planned)) {
    msg = `<div class="msg">${icon('calendar')}<div><b>עוד לא נבחרו קורסים</b><p>סמנו "חובה" או "אולי" ליד קורסים ב"הקורסים שלי", והמערכת תיבנה לבד.</p></div></div>`;
    live = 'לא נבחרו קורסים';
  } else if (noRes) { // partial and empty: only this message, with the "search more" button (no second notice)
    const why = ui.last.diagnosis?.length ? ui.last.diagnosis : ['ההעדפות, האילוצים והנעיצות הנוכחיים לא משאירים אף קורס אפשרי.'];
    const blocked = Object.values(app.cls.statuses).filter((s) => s.status === 'blocked').length; // usually: earlier years not marked as passed
    const prereqs = blocked >= 5 ? `<p>${blocked} קורסים מחכים לדרישות קדם שלא סומנו כ״עברתי״. עדכנו ב<a href="#me">״המצב שלי״</a>.</p>` : '';
    msg += `<div class="msg bad">${icon('alert')}<div><b>${ui.last.partial ? 'החיפוש לא הספיק' : 'לא נמצאה מערכת'}</b><ul>${why.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>${prereqs}
      <p class="msg-actions">${more}<button type="button" class="btn" data-act="panel" data-panel="prefs">${icon('sliders')} פתח העדפות</button>
      ${state.pins.length ? `<button type="button" class="btn" data-act="clearPins">${icon('pin')} נקה נעיצות</button>` : ''}</p></div></div>`;
    live = ui.last.partial ? 'החיפוש לא הספיק' : 'לא נמצאה מערכת';
  }

  if (res) {
    const s = summary(res, data, state.friends);
    const fd = !s.freeDays.length ? 'אין יום פנוי' : s.freeDays.length === 1 ? `יום ${DAYS[s.freeDays[0]]}׳ פנוי` : `ימים ${s.freeDays.map((d) => `${DAYS[d]}׳`).join(', ')} פנויים`;
    const gap = s.gapH >= 10 ? 'יותר מ-10 שעות חלונות' : s.gapH ? `${count(s.gapH, 'שעת חלון אחת', 'שעות חלונות')}` : 'בלי חלונות';
    const exams = !data.examsPublished ? 'לוח הבחינות טרם פורסם' : s.examGap ? `לפחות ${esc(count(s.examGap, 'יום אחד', 'ימים'))} בין בחינות` : 'פער בין בחינות: לא ידוע';
    const fr = s.withFriends.map((f) => (f.n === 1 ? `קורס אחד עם ${f.name}` : `${f.n} קורסים עם ${f.name}`)); // raw: escaped once in the pill, the live region is text
    const yt = pair ? yearTotals(raw) : null;
    if (pair && !res.courses.length) msg += note('info', `אין קורסים בסמסטר ${ui.sem}׳ בחלופה הזו`);

    const ranks = progressRanks(results.map((r) => semResult(r, ui.sem)));
    const myRank = ranks[ui.cur];
    const counts = unlockCounts(data, doneIds());
    const blocking = res.courses.filter((cid) => counts[cid] > 0);
    const blockingNames = blocking.slice(0, 3).map((cid) => esc(data.courses[cid].name));
    const blockingText = blockingNames.length ? blockingNames.join(', ') + (blocking.length > 3 ? ` ועוד ${blocking.length - 3}` : '') : '';
    const unlocksText = res.unlocks ? (res.unlocks === 1 ? 'פותחת לך קורס חדש אחד' : `פותחת לך ${res.unlocks} קורסים חדשים`) : '';
    const infoLine = [blockingText && `קורסי קדם לקורסים אחרים: ${blockingText}`, unlocksText].filter(Boolean).join(' · ');
    const best = ui.cur > 0 ? semResult(results[0], ui.sem) : null; // what this alternative changes against the first one (§14ז)
    const vs = best ? compareAlts({ ...res, ...s }, { ...best, ...summary(best, data, state.friends) }, data).map(esc).join(' · ') : '';

    $('pills').innerHTML = [pill('calendar', courseCount(res.courses.length)), pill('cap', `${s.credits} נ״ז`), ...(pair ? [pill('calendar',
      `בכל השנה: ${courseCount(yt.courses)}, ${yt.credits} נ״ז`)] : []), pill('sun', fd), pill('clock', gap), ...(nAlt > 1 ? [pill('check', rankText(myRank, nAlt))]
      : []), ...fr.map((t) => pill('users', esc(t), 'friend')), pill('file', exams)].join('')
      + (infoLine ? `<p class="pill-info">${infoLine}</p>` : '') + (vs ? `<p class="pill-info vs">לעומת חלופה 1: ${vs}</p>` : '');
    live = [`חלופה ${ui.cur + 1} מתוך ${nAlt}`, pair && `סמסטר ${ui.sem}׳`, courseCount(res.courses.length), `${s.credits} נ״ז`, pair
      && `בכל השנה: ${courseCount(yt.courses)}, ${yt.credits} נ״ז`, fd, gap, ...fr, pn?.text].filter(Boolean).join(', ');
  } else $('pills').innerHTML = '';

  $('week').innerHTML = msg + renderWeek({ data, res, range, colors, dashed: ui.dashed, pins: state.pins, friends, day: ui.mobileDay, blocks: state.constraints.blocks });
  $('daysel').innerHTML = renderDaySelector(range, res, data, ui.mobileDay);
  if (live && live !== ui.liveText) $('live').textContent = ui.liveText = live;
  renderSide(raw);
  if (ui.panel === 'reg') renderDrawer();
  setBusy();
  scrollToDay();
}

// Phone: the day column starts at the earliest hour of any day, so a later-starting day opens on empty hours.
// On the first view of a result and after each day switch, scroll to the day's first lesson (not on every refresh).

export function scrollToDay() {
  if (!ui.dayScroll || !current() || $('layout').hidden || !matchMedia(PHONE).matches) return; // kept armed until a result is on screen
  ui.dayScroll = false;
  const blocks = [...document.querySelectorAll('.day.on .blk')];
  if (!blocks.length) return;
  const b = blocks.reduce((a, c) => (Number(c.style.getPropertyValue('--s')) < Number(a.style.getPropertyValue('--s')) ? c : a));
  const head = parseFloat(getComputedStyle($('daysel')).top) + $('daysel').offsetHeight + 8; // under the sticky day selector
  const top = b.getBoundingClientRect().top;
  if (top < head || top > innerHeight - 100) scrollBy(0, top - head);
}

export function go(d) {
  const n = ui.last?.results.length ?? 0;
  if (n < 2) return;
  ui.cur = (ui.cur + d + n) % n;
  keepFocus(renderView);
}
