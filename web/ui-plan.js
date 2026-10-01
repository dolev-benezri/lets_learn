// Calendar-first UI (design-system/afeka-scheduler/pages/app.md v2): top bar, status panel, courses sidebar,
// preferences / friends / registration drawer, auto search in a worker. The week grid and popover live in ui-grid.js.
import { app, esc, save, refresh, candidateMode, yearCourses, setRenderers, keepFocus, DEFAULT } from './app.js';
import { progress, setStatus, studyYear, cleanProfile } from './rules.js';
import { unlockCounts } from './solver-core.js';
import { friendLink, backupLink, readHash } from './share.js';
import './ui-map.js';
import { DAYS, DAY_FULL, icon, initials, yedion, typeLabel, nearestStep, groupIndex, hourRange, summary, renderWeek, renderDaySelector, openPop, backups, paired, assignColors, repeatIds, progressRanks, isPair, semResult, resCourses, resGroups, placedIn, yearTotals } from './ui-grid.js';

const $ = (id) => document.getElementById(id);
const CAND = ['retake', 'available', 'afterA', 'conditional'];
const WEIGHTS = [['friends', 'להיות עם החברים'], ['progress', 'להתקדם בתואר'], ['freeDays', 'ימים פנויים'], ['compact', 'בלי חלונות'], ['timeWindow', 'שעות נוחות'], ['examSpread', 'פיזור בחינות']];
const SCALE = [[0, 'לא חשוב'], [1, 'קצת'], [3, 'חשוב'], [5, 'מאוד']];
const STATUS = [['none', 'לא לקחתי'], ['passed', 'עברתי'], ['failed', 'נכשלתי']];
const FAILS = [[1, 'פעם'], [2, 'פעמיים'], [3, '3 פעמים']];
const FSCALE = [[0, 'לא חשוב'], [1, 'קצת'], [2, 'חשוב'], [3, 'מאוד']];
const SEMS = [['א', 'סמסטר א׳'], ['ב', 'סמסטר ב׳']];
const SCOPE = [['year', 'שנה'], ['א', 'רק א׳'], ['ב', 'רק ב׳']];
const LOAD = [['א', 'יותר בא׳'], ['even', 'מאוזן'], ['ב', 'יותר בב׳']];
const SEM_PICK = [['', 'הכי טוב'], ['א', 'א׳'], ['ב', 'ב׳']];

let worker = null, timer = null, last = null, cur = 0, running = false, runError = null, gen = 0, moreMul = 1, sem = 'א'; // sem: the shown semester of a year result
let panel = null, opener = null, statusOpen = null, mobileDay = 1, friendMsg = '', friendUrl = '', liveText = '';
const openDetails = new Set(['plan']);
const colors = new Map(); // sticky: a course keeps its colour unless it clashes inside the shown alternative
let dashed = new Set(); // courses of the shown alternative that repeat a colour (more than 8 courses)
const ONBOARDED = 'afeka-sched-v1-onboarded';
const onboarded = () => { try { return localStorage.getItem(ONBOARDED) === '1'; } catch { return false; } };

const current = () => last?.results[cur] ?? null; // a search result, or a pair in year scope
const shown = () => semResult(current(), sem); // what the grid, pills and popover render
const shownData = () => (isPair(current()) ? app.sem[sem] : app.data);
const yearSearch = () => app.state.scope === 'year' && !!app.sem['ב'];
const listIds = () => [...new Set(app.data.lists.flatMap((l) => l.courses))];
const status = (id) => app.cls.statuses[id]?.status;
const doneIds = () => Object.keys(app.cls.statuses).filter((id) => status(id) === 'done');
const planned = (id) => ['must', 'optional'].includes(candidateMode(id));
const allGroupIds = () => groupIndex(app.data);
const pill = (ic, text, cls = '') => `<span class="pill ${cls}">${icon(ic)}<span>${text}</span></span>`;
const seg = (name, legend, opts, cur, attrs, visible = false) => `<fieldset class="seg"><legend${visible ? '' : ' class="sr"'}>${esc(legend)}</legend><div class="seg-opts">${
  opts.map(([v, t]) => `<label><input type="radio" name="${esc(name)}" value="${v}"${String(v) === String(cur) ? ' checked' : ''} data-k="${esc(name)}-${v}" ${attrs}><span>${t}</span></label>`).join('')}</div></fieldset>`;
const details = (key, summaryHtml, body, n) => n ? `<details data-key="${key}"${openDetails.has(key) ? ' open' : ''}><summary data-k="sum-${key}">${summaryHtml}</summary>${body}</details>` : '';

let toastTimer;
function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}
async function copy(text, ok) {
  try { await navigator.clipboard.writeText(text); toast(ok); } catch { window.prompt('ההעתקה האוטומטית נכשלה. העתיקו מכאן:', text); }
}

// ---------- search ----------
const MAX_MS = 12000; // "חפש עוד" doubles the time limit up to this
function scheduleRun(again = false) {
  if (!again) moreMul = 1;
  clearTimeout(timer);
  gen++;
  running = true;
  setBusy();
  timer = setTimeout(run, 300);
}
function run() {
  const { state, data, cls } = app;
  const courses = Object.keys(data.courses).map((id) => ({ id, mode: candidateMode(id) })).filter((x) => x.mode === 'must' || x.mode === 'optional');
  const my = gen; // a newer scheduled search keeps the indicator on
  const done = () => {
    running = my !== gen;
    const hadMore = document.activeElement?.dataset?.k === 'searchMore';
    keepFocus(renderView);
    if (hadMore && !document.querySelector('[data-k="searchMore"]')) focusWeek(); // the search finished: the button is gone
  };
  worker?.terminate();
  runError = null;
  if (!courses.length) { last = null; done(); return; }
  try {
    worker = new Worker(new URL('./solver-worker.js', import.meta.url), { type: 'module' });
  } catch (err) { runError = err.message || 'לא ניתן להפעיל את החיפוש'; done(); return; }
  worker.onmessage = (e) => { last = e.data; cur = 0; done(); };
  worker.onerror = (e) => { runError = e.message || 'שגיאה לא ידועה'; done(); };
  const pins = state.pins.filter((p) => courses.some((c) => data.courses[c.id].groups.some((g) => g.id === p))); // stale pins stay in state
  if (yearSearch()) worker.postMessage({ year: { dataA: app.sem['א'], dataB: app.sem['ב'], state, yearList: new Set(yearCourses()), pins: state.pins, constraints: state.constraints, weights: state.weights, friends: state.friends, timeLimitMs: Math.min(3000 * moreMul, MAX_MS) } });
  else worker.postMessage({ data, courses, statuses: cls.statuses, pins, constraints: state.constraints, weights: state.weights, friends: state.friends, timeLimitMs: Math.min(1500 * moreMul, MAX_MS) });
}
function setBusy() {
  $('board').classList.toggle('is-busy', running);
  $('board').setAttribute('aria-busy', String(running));
  $('busy').hidden = !running;
}

// ---------- top bar and banners ----------
function renderTop() {
  const d = new Date(app.data.fetchedAt);
  $('title').innerHTML = `המערכת שלי <small>· ${app.data.semester === 'שנה' ? 'שנה מלאה' : `סמסטר ${esc(app.data.semester)}׳`} תשפ״ז</small>`;
  $('meta').innerHTML = `נתונים מ-${esc(d.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' }))}`
    + ((Date.now() - d) / 864e5 > 3 ? ` · <span class="warn-text">${icon('alert')} הנתונים בני יותר מ-3 ימים</span>` : '')
    + (app.data.examsPublished ? '' : ' · לוח הבחינות של תשפ״ז טרם פורסם');
  const fr = app.state.friends;
  $('friendsBtn').innerHTML = `<span class="stack" aria-hidden="true">${fr.slice(0, 3).map((f) => `<span class="av">${esc(initials(f.name))}</span>`).join('')}<span class="av plus">${icon('plus')}</span></span><span class="lbl">חברים${fr.length ? ` (${fr.length})` : ''}</span>`;
}

function renderBanner() {
  const L = app.friendLanding;
  const known = allGroupIds();
  const missing = L ? L.groups.filter((g) => !known.has(g)).length : 0;
  $('banner').innerHTML = (app.hashError ? `<div class="banner err" role="alert">${icon('alert')}<span class="grow">${esc(app.hashError)}</span>
      <button type="button" class="btn icon-btn ghost" data-act="dismissError" aria-label="סגור הודעה">${icon('x')}</button></div>` : '')
    + (L ? `<div class="banner"><span class="av lg" aria-hidden="true">${esc(initials(L.name || 'חבר'))}</span>
      <div class="grow"><b>${esc(L.name || 'חבר')}</b> שיתף/ה איתך מערכת (${L.groups.length} שיעורים)${missing ? ` · <span class="warn-text">${missing} לא נמצאו בהיצע הנוכחי</span>` : ''}</div>
      <button type="button" class="btn primary" data-act="landingAdd" data-k="landingAdd">${icon('user-plus')} הוסף כחבר</button>
      <button type="button" class="btn" data-act="landingDrop">לא עכשיו</button></div>` : '');
}

// ---------- status panel ----------
// One row per course: all states visible as radios. The failure count stays once set, also after "passed" (regulations 11.4.1, 11.5.x).
function chip(id, li) {
  const s = app.state, n = s.failed[id] ?? 0, k = `${li}-${id}`;
  if (status(id) === 'exempt') return `<div class="crs" data-st="exempt" aria-disabled="true"><b>${esc(app.data.courses[id].name)}</b> <span class="tag ok">פטור</span></div>`;
  const st = s.passed.includes(id) ? 'passed' : n ? 'failed' : 'none';
  return `<div class="crs" data-st="${st}">${seg(`st-${k}`, app.data.courses[id].name, STATUS, st, `data-chg="status" data-id="${esc(id)}"`, true)
    }${n ? seg(`fc-${k}`, `כמה פעמים נכשלתי ב${app.data.courses[id].name}`, FAILS, n, `data-chg="failCount" data-id="${esc(id)}"`) : ''}</div>`;
}

function renderWelcome() {
  const el = $('welcome');
  el.hidden = !statusOpen;
  if (!statusOpen) { el.innerHTML = ''; return; }
  const { data, state, cls } = app;
  const pr = progress(data, state);
  const pct = Math.min(100, Math.round(pr.ratio * 100));
  // Years already studied are open; later years and the other lists sit in a collapsed section.
  // A chosen year opens its own list too (and the earlier ones); without a choice only the earlier years are open.
  const open = state.profile.year ?? studyYear(data, state) - 1;
  const lists = data.lists.map((l, i) => ({ ...l, i, year: l.name.match(/חובה שנה (\S)'/)?.[1] }));
  const past = (l) => l.year && ' אבגד'.indexOf(l.year) <= open;
  const YEARS = [[1, 'א׳'], [2, 'ב׳'], [3, 'ג׳'], [4, 'ד׳']];
  const group = (l) => `<div class="year"><h3>${l.year ? `שנה ${esc(l.year)}׳` : esc(l.name)} <span>${l.minCredits ? `(לפחות ${l.minCredits} נ״ז)` : ''}</span></h3>${l.year ? `<button type="button" class="btn" data-act="yearPassed" data-li="${l.i}" data-k="year-${l.i}">סמן את כל שנה ${esc(l.year)}׳ כ"עברתי"</button>` : ''}<div class="chips">${l.courses.map((id) => chip(id, l.i)).join('')}</div></div>`;
  const others = lists.filter((l) => !past(l));
  el.innerHTML = `<h2 id="welTitle" tabindex="-1">מה המצב שלך?</h2>
    <section class="profile"><h3>פרופיל</h3>
      ${seg('p-year', 'שנת לימודים', YEARS, state.profile.year, 'data-chg="pyear"', true)}
      <label class="field">ציון אמירנט <input type="number" inputmode="numeric" min="50" max="150" step="1" data-chg="amirnet" data-k="amirnet" value="${state.profile.amirnet ?? ''}"><span class="hint">ריק אם לא ידוע</span></label>
      <button type="button" class="btn" data-act="openMap" data-k="openMap">${icon('share')} הראה התקדמות</button></section>
    <p class="hint">בחרו לכל קורס: לא לקחתי, עברתי או נכשלתי (ואז כמה פעמים). כישלון נשמר גם אחרי שעברתם, כי הוא נספר בתקנון. המערכת מתעדכנת לבד.</p>
    ${onboarded() ? '' : `<p class="notice">${icon('alert')}<span>סימנו מראש את כל שנה א׳ כ"עברתי". נכשלת במשהו? בחרו בו "נכשלתי".</span></p>`}
    <div class="progress"><div class="progress-top"><span>התקדמות: <b><bdi dir="ltr">${pr.earned}/${pr.required}</bdi> נ״ז</b></span><span class="hint">יעד 70% (תקנון 11.4.4)</span></div>
      <div class="bar" role="progressbar" aria-label="התקדמות בתוכנית" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}"><i style="width:${pct}%"></i><span class="target" aria-hidden="true"></span></div></div>
    ${cls.warnings.map((w) => `<p class="warnbox">${icon('alert')}<span>${esc(w)}</span></p>`).join('')}
    ${lists.filter(past).map(group).join('')}
    ${details('others', 'שנים מתקדמות וקורסים נוספים', others.map(group).join(''), others.length)}
    <div class="wel-foot"><button type="button" class="btn primary" data-act="statusDone" data-k="statusDone">${icon('check')} סיימתי</button></div>`;
}

// ---------- sidebar ----------
// Why a planned course is missing from the shown alternative (issue 17א#5).
function outReason(id) {
  const c = app.data.courses[id], prim = c.groups.filter((g) => g.primary);
  if (!app.state.constraints.includeFull && prim.length && prim.every((g) => g.full)) return 'כל הקבוצות מלאות';
  const k = last?.results.findIndex((r) => resCourses(r).includes(id)) ?? -1;
  return k >= 0 ? `נכנס בחלופה ${k + 1}` : '';
}

function card(id, res, unlocks) {
  const { data, cls } = app;
  const s = cls.statuses[id], c = data.courses[id], mode = candidateMode(id);
  const where = isPair(res) ? placedIn(res, id) : null;
  const inAlt = res && (isPair(res) ? !!where : res.courses.includes(id)), out = res && !inAlt && mode !== 'no';
  const why = out ? outReason(id) : '';
  const offered = c.semesters; // only the year view lists them
  const yearPick = app.state.scope === 'year' && offered?.length === 2 && s.status !== 'afterA' && ['must', 'optional'].includes(mode); // afterA only fits ב׳; a course set to no has nothing to place
  const tags = [
    app.state.scope === 'year' && offered?.length === 1 ? `<span class="tag">רק בסמסטר ${esc(offered[0])}׳</span>` : '',
    s.status === 'retake' ? '<span class="tag warn">חזרה</span>' : '',
    s.status === 'conditional' ? '<span class="tag warn">זמין בתנאי</span>' : '',
    unlocks[id] ? `<span class="tag">${unlocks[id] === 1 ? 'פותח קורס אחד' : `פותח ${unlocks[id]} קורסים`}</span>` : '',
    inAlt ? `<span class="tag ok">${icon('check')} במערכת${where ? ` · סמסטר ${esc(where)}׳` : ''}</span>` : '',
    out ? `<span class="tag">לא נכנס${why ? `: ${esc(why)}` : ''}</span>` : '',
  ].join('');
  return `<article class="course c${colors.get(id) ?? 7}${dashed.has(id) ? ' rep' : ''}${inAlt ? ' in' : ''}${out ? ' out' : ''}">
    <div class="course-top"><span class="dot" aria-hidden="true"></span><h3>${esc(c.name)}</h3><span class="cr">${c.credits} נ״ז</span>${seg(`mode-${id}`, `מה לעשות עם ${c.name}`, [['must', 'חובה'], ['optional', 'אולי'], ['no', 'לא']], mode, `data-chg="mode" data-id="${esc(id)}"`)}</div>
    ${yearPick ? seg(`sem-${id}`, `באיזה סמסטר ללמוד את ${c.name}`, SEM_PICK, app.state.semesterOf[id] ?? '', `data-chg="semOf" data-id="${esc(id)}"`) : ''}
    ${tags ? `<div class="tags">${tags}</div>` : ''}
    ${s.reasons.length ? `<p class="reason">${s.reasons.map(esc).join('<br>')}</p>` : ''}
  </article>`;
}

function renderSide(res) {
  const ids = listIds(), unlocks = unlockCounts(app.data, doneIds());
  const order = { retake: 0, available: 1, afterA: 1, conditional: 1 };
  const cand = ids.filter((id) => CAND.includes(status(id))).sort((a, b) => order[status(a)] - order[status(b)]);
  const plan = cand.filter(planned), rest = cand.filter((id) => !planned(id));
  const taken = new Set(); // a course sits in the first list that has it
  const locked = (st) => ids.filter((id) => status(id) === st);
  const rows = (list) => `<ul class="locked">${list.map((id) => `<li>${icon('lock')}<div><b>${esc(app.data.courses[id].name)}</b><p>${app.cls.statuses[id].reasons.map(esc).join('<br>')}</p></div></li>`).join('')}</ul>`;
  $('side').innerHTML = `<div class="side-head"><h2>הקורסים שלי</h2><button type="button" class="link-btn" data-act="openStatus" data-k="openStatus">עדכן מצב</button></div>
    <p class="hint">חובה: בכל מערכת. אולי: רק אם משתלב טוב.</p>
    ${details('plan', `בתכנון (${plan.length})`, `<div class="cards">${plan.map((id) => card(id, res, unlocks)).join('') || '<p class="hint">עוד לא נבחרו קורסים. פתחו אחת מהקבוצות למטה.</p>'}</div>`, 1)}
    ${app.data.lists.map((l, i) => {
    const ids = l.courses.filter((id) => rest.includes(id) && !taken.has(id) && taken.add(id));
    return details(`more-${i}`, `${esc(l.name)} (${ids.length})`, `<div class="cards">${ids.map((id) => card(id, res, unlocks)).join('')}</div>`, ids.length);
  }).join('')}
    ${details('blocked', `${icon('lock')} חסומים (${locked('blocked').length})`, rows(locked('blocked')), locked('blocked').length)}
    ${details('notOffered', `לא נלמד בסמסטר (${locked('notOffered').length})`, rows(locked('notOffered')), locked('notOffered').length)}
    ${details('exempt', `פטור (ציון אמירנט) (${locked('exempt').length})`, rows(locked('exempt')), locked('exempt').length)}`;
}

// ---------- grid area ----------
function colorOrder() {
  const cand = Object.keys(app.data.courses).filter((id) => candidateMode(id));
  return [...cand.filter(planned).sort(), ...cand.filter((id) => !planned(id)).sort()];
}

const PARTIAL_TEXT = 'החיפוש לא הספיק לבדוק את כל האפשרויות. התוצאות טובות, אבל ייתכן שיש טובות יותר.';
function renderView() {
  const { state } = app;
  const results = last?.results ?? [];
  const raw = current(), pair = isPair(raw);
  const res = shown(), data = shownData(); // one semester's result and its data file; app.data only when the result is a single semester
  const friends = state.friends.filter((f) => f.active);
  assignColors(colors, res?.courses ?? [], colorOrder());
  dashed = repeatIds(colors, res?.courses ?? []);
  const range = hourRange(results.flatMap((r) => resGroups(r).flatMap((g) => groupIndex(app.data).get(g)?.g.meetings ?? []))); // both semesters, so the hours don't jump between tabs
  if (mobileDay > range.days) mobileDay = 1;
  $('semnote').innerHTML = app.semNotice ? `<p class="notice">${icon('alert')}<span>${esc(app.semNotice)}</span></p>` : '';
  $('semtabs').innerHTML = pair ? seg('sem', 'סמסטר מוצג', SEMS, sem, 'data-chg="sem"') : '';

  $('altLabel').textContent = results.length ? `חלופה ${cur + 1} מתוך ${results.length}` : 'אין חלופות';
  const stranded = [$('prev'), $('next')].includes(document.activeElement) && results.length < 2;
  $('prev').disabled = $('next').disabled = results.length < 2;
  if (stranded) $('switcher').focus();

  let msg = last?.partial ? `<p class="notice partial" aria-live="polite">${icon('alert')}<span>${PARTIAL_TEXT}</span><button type="button" class="btn" data-act="more" data-k="searchMore">חפש עוד</button></p>` : '', live = '';
  if (runError) msg = `<div class="msg bad" role="alert">${icon('alert')}<div><b>שגיאה בחיפוש</b><p>${esc(runError)}</p></div></div>`;
  else if (!Object.keys(app.data.courses).some(planned)) {
    msg = `<div class="msg">${icon('calendar')}<div><b>עוד לא נבחרו קורסים</b><p>סמנו "חובה" או "אולי" ליד קורסים ב"הקורסים שלי", והמערכת תיבנה לבד.</p></div></div>`;
    live = 'לא נבחרו קורסים';
  } else if (last && !results.length) {
    msg += `<div class="msg bad">${icon('alert')}<div><b>${last.partial ? 'החיפוש לא הספיק' : 'לא נמצאה מערכת'}</b><ul>${last.diagnosis.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>
      <p class="msg-actions"><button type="button" class="btn" data-act="panel" data-panel="prefs">${icon('sliders')} פתח העדפות</button>
      ${state.pins.length ? `<button type="button" class="btn" data-act="clearPins">${icon('pin')} נקה נעיצות</button>` : ''}</p></div></div>`;
    live = last.partial ? 'החיפוש לא הספיק' : 'לא נמצאה מערכת';
  }

  if (res) {
    const s = summary(res, data, state.friends);
    const fd = !s.freeDays.length ? 'אין יום פנוי' : s.freeDays.length === 1 ? `יום ${DAYS[s.freeDays[0]]}׳ פנוי` : `ימים ${s.freeDays.map((d) => `${DAYS[d]}׳`).join(', ')} פנויים`;
    const gap = s.gapH >= 10 ? '10+ ש׳ חלונות' : s.gapH ? `${s.gapH} ש׳ חלונות` : 'בלי חלונות';
    const exams = !data.examsPublished ? 'בחינות: טרם פורסם' : s.examGap ? `לפחות ${esc(s.examGap)} ימים בין בחינות` : 'בחינות: אין פער לחישוב';
    const fr = s.withFriends.map((f) => `${f.n} קורסים עם ${f.name}`);
    const yt = pair ? yearTotals(raw) : null;
    if (pair) {
      const names = raw.missing.map((id) => esc(app.data.courses[id]?.name ?? id));
      msg += raw.warnings.map((w) => `<p class="notice">${icon('alert')}<span>${esc(w)}</span></p>`).join('')
        + (names.length ? `<p class="notice">${icon('alert')}<span>לא נכנס לאף סמסטר: ${names.join(', ')}</span></p>` : '');
    }

    const ranks = progressRanks(results.map((r) => semResult(r, sem)));
    const myRank = ranks[cur];
    const counts = unlockCounts(data, doneIds());
    const blocking = res.courses.filter((cid) => counts[cid] > 0);
    const blockingNames = blocking.slice(0, 3).map((cid) => esc(data.courses[cid].name));
    const blockingText = blockingNames.length ? blockingNames.join(', ') + (blocking.length > 3 ? ` ועוד ${blocking.length - 3}` : '') : '';
    const unlocksText = res.unlocks ? (res.unlocks === 1 ? 'פותחת קורס אחד' : `פותחת ${res.unlocks} קורסים`) : '';
    const infoLine = [blockingText && `סוגרת חוסמים: ${blockingText}`, unlocksText].filter(Boolean).join(' · ');

    $('pills').innerHTML = [pill('calendar', `${res.courses.length} קורסים`), pill('cap', `${s.credits} נ״ז`), ...(pair ? [pill('calendar', `שנה: ${yt.courses} קורסים, ${yt.credits} נ״ז`)] : []), pill('sun', fd), pill('clock', gap), pill('check', `התקדמות: דירוג ${myRank} מתוך ${results.length}`), ...fr.map((t) => pill('users', esc(t), 'friend')), pill('file', exams)].join('')
      + (infoLine ? `<p class="pill-info">${infoLine}</p>` : '');
    live = [`חלופה ${cur + 1} מתוך ${results.length}`, pair && `סמסטר ${sem}׳`, `${res.courses.length} קורסים`, `${s.credits} נ״ז`, pair && `שנה: ${yt.courses} קורסים, ${yt.credits} נ״ז`, fd, gap, ...fr, last.partial && PARTIAL_TEXT].filter(Boolean).join(', ');
  } else $('pills').innerHTML = '';

  $('week').innerHTML = msg + renderWeek({ data, res, range, colors, dashed, pins: state.pins, friends, day: mobileDay });
  $('daysel').innerHTML = renderDaySelector(range, res, data, mobileDay);
  if (live && live !== liveText) $('live').textContent = liveText = live;
  renderSide(raw);
  if (panel === 'reg') renderDrawer();
  setBusy();
}

function go(d) {
  const n = last?.results.length ?? 0;
  if (n < 2) return;
  cur = (cur + d + n) % n;
  keepFocus(renderView);
}

// ---------- drawer panels ----------
function prefsPanel() {
  const { state, data } = app, c = state.constraints;
  return ['העדפות', `
    ${app.sem['ב'] ? `<section class="dr-sec"><h3>תכנון</h3>
      ${seg('scope', 'לתכנן', SCOPE, state.scope, 'data-chg="scope"', true)}
      ${state.scope === 'year' ? seg('load', 'איפה להעמיס', LOAD, state.load, 'data-chg="load"', true) : ''}</section>` : ''}
    <section class="dr-sec"><h3>מה חשוב לך?</h3>
      ${WEIGHTS.filter(([k]) => k !== 'examSpread' || data.examsPublished).map(([k, t]) => seg(`w-${k}`, t, SCALE, nearestStep(state.weights[k], [0, 1, 3, 5]), `data-chg="w" data-w="${k}"`, true)).join('')}</section>
    <section class="dr-sec"><h3>ימים שאני רוצה פנויים</h3>
      <div class="daypills" role="group" aria-label="ימים פנויים">${[1, 2, 3, 4, 5, 6].map((d) => `<button type="button" class="daypill" data-act="dayOff" data-day="${d}" data-k="doff-${d}" aria-pressed="${c.dayOff.includes(d)}">${DAYS[d]}׳<span class="sr"> ${DAY_FULL[d]}</span></button>`).join('')}</div>
      ${seg('dayHard', 'כמה זה מחייב?', [['hard', 'חובה'], ['soft', 'רק העדפה']], c.dayOffHard ? 'hard' : 'soft', 'data-chg="dayHard"', true)}</section>
    <section class="dr-sec"><h3>שעות</h3>
      <div class="times"><label class="field">לא לפני <input type="time" data-chg="notBefore" data-k="notBefore" value="${esc(c.notBefore)}"></label>
      <label class="field">לא אחרי <input type="time" data-chg="notAfter" data-k="notAfter" value="${esc(c.notAfter)}"></label></div>
      ${seg('winHard', 'כמה זה מחייב?', [['hard', 'חובה'], ['soft', 'רק העדפה']], c.windowHard ? 'hard' : 'soft', 'data-chg="winHard"', true)}</section>
    <section class="dr-sec"><h3>עוד אפשרויות</h3>
      <label class="field">תקרת נ״ז <input type="number" inputmode="decimal" min="0" step="0.5" placeholder="ללא" data-chg="maxCredits" data-k="maxCredits" value="${c.maxCredits ?? ''}"></label>
      <label class="check"><input type="checkbox" data-chg="examsAllow" data-k="examsAllow"${c.examsSameDay === 'allow' ? ' checked' : ''}> לאפשר 2 בחינות באותו יום</label>
      <label class="check"><input type="checkbox" data-chg="includeFull" data-k="includeFull"${c.includeFull ? ' checked' : ''}> לכלול קבוצות מלאות</label></section>
    ${state.pins.length ? `<section class="dr-sec"><h3>נעיצות</h3><p class="hint">${state.pins.length} קבוצות נעוצות: <bdi dir="ltr">${state.pins.map(esc).join(', ')}</bdi></p>
      <button type="button" class="btn" data-act="clearPins" data-k="clearPins">${icon('pin')} נקה נעיצות</button></section>` : ''}
    <section class="dr-sec"><button type="button" class="btn" data-act="resetPrefs" data-k="resetPrefs">איפוס העדפות</button>
      <p class="hint">מחזיר את התכנון לשנה והעמסה מאוזנת, את המשקלים, הימים והשעות, תקרת הנ"ז, בחינות באותו יום וקבוצות מלאות לברירת המחדל. המצב האישי, הקורסים, הנעיצות והחברים לא משתנים.</p></section>
    <footer class="dr-foot"><button type="button" class="btn ghost" data-act="backup" data-k="backup">${icon('copy')} העתק קישור גיבוי מלא</button>
      <p class="hint">פרטי: כולל את כל המצב שלך. לשימוש רק במכשירים שלך.</p></footer>`];
}

function friendsPanel() {
  const { state } = app, known = allGroupIds();
  const row = (f, i) => {
    const miss = f.groups.filter((g) => !known.has(g)).length;
    return `<div class="frow"><span class="av lg" aria-hidden="true">${esc(initials(f.name))}</span>
      <div class="grow"><b>${esc(f.name)}</b><p class="hint">${f.groups.length - miss} קבוצות${miss ? ` · <span class="warn-text">${miss} לא נמצאו</span>` : ''}</p></div>
      <button type="button" class="btn icon-btn ghost" data-act="removeFriend" data-i="${i}" aria-label="הסר את ${esc(f.name)}">${icon('x')}</button>
      <div class="frow-full">${seg(`fw-${i}`, `כמה חשוב להיות עם ${f.name}?`, FSCALE, nearestStep(f.weight, [0, 1, 2, 3]), `data-chg="fw" data-i="${i}"`, true)}
      <label class="check"><input type="checkbox" data-chg="factive" data-i="${i}" data-k="fa-${i}"${f.active ? ' checked' : ''}> להציג במערכת</label></div></div>`;
  };
  return ['חברים', `
    <section class="dr-sec"><h3>הוספת חבר</h3>
      <form id="addFriendForm" class="row"><label for="friendUrl" class="sr">קישור שחבר שלח</label>
        <input id="friendUrl" type="text" inputmode="url" autocomplete="off" dir="ltr" data-k="friendUrl" placeholder="הדביקו כאן קישור שחבר שלח" value="${esc(friendUrl)}">
        <button type="submit" class="btn primary" data-k="addFriend">${icon('user-plus')} הוסף</button></form>
      <p class="err-text" role="status">${friendMsg ? `${icon('alert')} ${esc(friendMsg)}` : ''}</p></section>
    <section class="dr-sec"><h3>החברים שלי</h3>${state.friends.map(row).join('') || '<p class="hint">עוד אין חברים. בקשו מחבר ללחוץ "שתף" ולשלוח לכם את הקישור.</p>'}</section>
    <section class="dr-sec"><h3>הקישור שלי</h3>
      <label class="field col">השם שלי בקישור <input type="text" maxlength="60" data-chg="myName" data-k="myName" value="${esc(state.name)}"></label>
      <button type="button" class="btn" data-act="share" data-k="copyMine">${icon('copy')} העתק את הקישור שלי</button>
      <p class="hint">הקישור כולל רק את השם ואת הקבוצות של החלופה המוצגת, בלי ציונים.</p></section>`];
}

// A pair lists each semester under its own heading, each against its own data file; a single result has one untitled part.
const regParts = (r) => (isPair(r) ? SEMS.map(([s, title]) => ({ title, res: semResult(r, s), data: app.sem[s] })) : [{ title: null, res: r, data: app.data }]);

function registrationText(r) {
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
    return `<li class="c${colors.get(cid) ?? 7}"><span class="dot" aria-hidden="true"></span><div class="grow"><b>${esc(c.name)}</b> <span class="hint">${esc(cid)} · ${c.credits} נ״ז</span>
      <p>${gs.map((g) => `${g.primary ? 'קבוצה' : esc(typeLabel(g.type))} <bdi dir="ltr">${esc(g.id)}</bdi>${res.alts?.[g.id] ? ` <span class="hint">(או <bdi dir="ltr">${res.alts[g.id].map(esc).join(', ')}</bdi>, באותן שעות)</span>` : ''}${backups(data, res, g.id).length ? ` <span class="hint">(גיבוי: <bdi dir="ltr">${backups(data, res, g.id).map(esc).join(', ')}</bdi>)</span>` : ''}`).join(' · ')}</p></div>
      <a class="btn icon-btn ghost" href="${yedion(cid)}" target="_blank" rel="noopener" aria-label="${esc(c.name)} בידיעון (חלון חדש)">${icon('external-link')}</a></li>`;
  }).join('');
  const parts = regParts(raw);
  const exams = parts.flatMap((p) => p.res.exams).filter((e) => e.kind === 'בחינה').sort((a, b) => a.date.localeCompare(b.date));
  return ['רשימה להרשמה', `<p class="hint">חלופה ${cur + 1} מתוך ${last.results.length}. ההרשמה עצמה נעשית באפקה-נט.</p>
    ${parts.map((p) => `${p.title ? `<h3 class="reg-sem">${p.title}</h3>` : ''}${p.res.courses.length ? `<ul class="reglist">${rowsOf(p.res, p.data)}</ul>` : '<p class="hint">אין קורסים בסמסטר הזה.</p>'}`).join('')}
    <button type="button" class="btn primary" data-act="copyReg" data-k="copyReg">${icon('copy')} העתק הכל</button>
    <section class="dr-sec"><h3>בחינות</h3>${data.examsPublished
      ? `<ul class="plain">${exams.map((e) => `<li>${esc(data.courses[e.course].name)} · מועד ${esc(e.moed)} · <bdi dir="ltr">${esc(e.date)} ${esc(e.time ?? '')}</bdi></li>`).join('')}</ul>`
      : '<p class="hint">לוח הבחינות של תשפ״ז טרם פורסם.</p>'}</section>`];
}

const PANELS = { prefs: prefsPanel, friends: friendsPanel, reg: regPanel };
function renderDrawer() {
  if (!panel) return;
  const [title, body] = PANELS[panel]();
  $('drawer').innerHTML = `<div class="dr-head"><h2 id="drawerTitle">${title}</h2>
    <button type="button" class="btn icon-btn ghost" data-act="closeDrawer" data-k="closeDrawer" aria-label="סגור">${icon('x')}</button></div><div class="dr-body">${body}</div>`;
}
function openPanel(name, from) {
  panel = name;
  opener = from;
  friendMsg = '';
  renderDrawer();
  if (!$('drawer').open) $('drawer').show();
  document.body.classList.add('drawer-open');
}

// ---------- actions ----------
function addFriend(p) {
  const name = p.name || `חבר ${app.state.friends.length + 1}`;
  const old = app.state.friends.find((f) => f.name === name);
  if (old) old.groups = p.groups;
  else if (app.state.friends.length >= 20) { friendMsg = 'אפשר עד 20 חברים. הסירו חבר כדי להוסיף.'; toast(friendMsg); keepFocus(renderDrawer); return; }
  else app.state.friends.push({ name, groups: p.groups, weight: 1, active: true });
  app.friendLanding = null;
  refresh();
  toast(old ? 'עודכן' : 'נוסף');
}
async function share() {
  const res = current();
  if (!res) return toast('אין עדיין מערכת לשתף');
  copy(await friendLink(location.origin + location.pathname, app.state, resGroups(res)), 'הקישור הועתק. אפשר לשלוח לחברים.');
}
const focusWeek = () => $('week').focus({ preventScroll: false });

const ACT = {
  yearPassed(el) { app.data.lists[el.dataset.li].courses.forEach((id) => setStatus(app.state, id, 'passed')); refresh(); },
  statusDone() { statusOpen = false; try { localStorage.setItem(ONBOARDED, '1'); } catch { /* storage unavailable */ } renderWelcome(); focusWeek(); },
  openStatus() { statusOpen = true; renderWelcome(); $('welTitle').focus(); $('welcome').scrollIntoView({ block: 'start' }); },
  panel: (el) => openPanel(el.dataset.panel, el),
  closeDrawer: () => $('drawer').close(),
  prev: () => go(-1),
  next: () => go(1),
  day(el) { mobileDay = Number(el.dataset.day); keepFocus(renderView); },
  block: (el) => openPop(el, { data: shownData(), res: shown(), includeFull: app.state.constraints.includeFull, pins: app.state.pins, friends: app.state.friends.filter((f) => f.active), colors }),
  more() { if (running) return; moreMul *= 2; scheduleRun(true); },
  popClose: () => $('pop').hidePopover(),
  pin(el) {
    const gid = el.dataset.gid, was = app.state.pins.includes(gid);
    const { cid, g } = groupIndex(app.data).get(gid);
    const sameSlot = (p) => { const x = groupIndex(app.data).get(p); return x?.cid === cid && !paired(x.g, g); }; // a new pin replaces the course's pins it can't pair with
    app.state.pins = was ? app.state.pins.filter((x) => x !== gid) : [...app.state.pins.filter((p) => !sameSlot(p)), gid];
    if (!was) app.state.choices[cid] = 'must'; // the solver forces a pinned course in; show it
    const fromGid = $('pop').dataset.gid;
    $('pop').hidePopover();
    refresh();
    if (gid !== fromGid) focusWeek(); // the clicked block is about to be replaced; keep focus out of <body>
    toast(was ? 'הנעיצה בוטלה' : 'הקבוצה ננעצה ותופיע בכל החלופות');
  },
  share,
  copyReg: () => current() && copy(registrationText(current()), 'הרשימה הועתקה'),
  backup: async () => copy(await backupLink(location.origin + location.pathname, app.state), 'קישור הגיבוי הועתק'),
  landingAdd: () => addFriend(app.friendLanding),
  landingDrop() { app.friendLanding = null; renderBanner(); focusWeek(); },
  dismissError() { app.hashError = null; renderBanner(); focusWeek(); },
  removeFriend(el) { app.state.friends.splice(Number(el.dataset.i), 1); refresh(); $('drawer').querySelector('[data-k="closeDrawer"]')?.focus(); },
  dayOff(el) {
    const c = app.state.constraints, d = Number(el.dataset.day);
    c.dayOff = c.dayOff.includes(d) ? c.dayOff.filter((x) => x !== d) : [...c.dayOff, d];
    refresh();
  },
  clearPins() { app.state.pins = []; refresh(); },
  resetPrefs() {
    if (typeof confirm === 'function' && !confirm('לאפס את ההעדפות לברירת המחדל?')) return;
    app.state.weights = structuredClone(DEFAULT.weights);
    app.state.constraints = structuredClone(DEFAULT.constraints);
    app.state.scope = DEFAULT.scope;
    app.state.load = DEFAULT.load;
    refresh();
    toast('ההעדפות אופסו');
  },
};

// Text-like inputs only save + re-run (re-rendering them mid-typing would reset the caret).
const time = (v) => (/^\d{2}:\d{2}$/.test(v) ? v : '');
const CHG = {
  mode: (el) => {
    const id = el.dataset.id;
    app.state.choices[id] = el.value;
    if (el.value !== 'must') { // a pin would force it back in
      const kept = app.state.pins.filter((p) => groupIndex(app.data).get(p)?.cid !== id);
      if (kept.length < app.state.pins.length) { app.state.pins = kept; toast('הנעיצות של הקורס בוטלו'); }
    }
  },
  sem: (el) => { sem = el.value === 'ב' ? 'ב' : 'א'; return 'view'; }, // a view switch: no new search
  scope: (el) => { app.state.scope = el.value; },
  load: (el) => { app.state.load = el.value; },
  semOf: (el) => { if (el.value) app.state.semesterOf[el.dataset.id] = el.value; else delete app.state.semesterOf[el.dataset.id]; }, // a pin still wins in the solver
  pyear: (el) => { app.state.profile.year = cleanProfile({ year: Number(el.value) }).year; },
  amirnet: (el) => { app.state.profile.amirnet = cleanProfile({ amirnet: el.value === '' ? null : Number(el.value) }).amirnet; },
  status: (el) => setStatus(app.state, el.dataset.id, el.value),
  failCount: (el) => { app.state.failed[el.dataset.id] = Number(el.value); },
  w: (el) => { app.state.weights[el.dataset.w] = Number(el.value); },
  fw: (el) => { app.state.friends[el.dataset.i].weight = Number(el.value); },
  factive: (el) => { app.state.friends[el.dataset.i].active = el.checked; },
  dayHard: (el) => { app.state.constraints.dayOffHard = el.value === 'hard'; },
  winHard: (el) => { app.state.constraints.windowHard = el.value === 'hard'; },
  examsAllow: (el) => { app.state.constraints.examsSameDay = el.checked ? 'allow' : 'forbid'; },
  includeFull: (el) => { app.state.constraints.includeFull = el.checked; },
  notBefore: (el) => { app.state.constraints.notBefore = time(el.value); return 'quiet'; },
  notAfter: (el) => { app.state.constraints.notAfter = time(el.value); return 'quiet'; },
  maxCredits: (el) => { const n = parseFloat(el.value); app.state.constraints.maxCredits = Number.isFinite(n) && n >= 0 ? n : null; return 'quiet'; },
  myName: (el) => { app.state.name = el.value.trim().slice(0, 60); return 'quiet'; },
};

function renderAll() {
  if (statusOpen === null) statusOpen = !onboarded();
  renderTop();
  renderBanner();
  renderWelcome();
  renderView();
  if (panel !== 'reg') renderDrawer();
  scheduleRun();
}

// ---------- wiring (static shell from index.html) ----------
document.querySelectorAll('[data-icon]').forEach((el) => el.insertAdjacentHTML('afterbegin', icon(el.dataset.icon)));
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (el && !el.disabled && ACT[el.dataset.act]) ACT[el.dataset.act](el, e);
});
document.addEventListener('change', (e) => {
  const f = CHG[e.target.dataset.chg];
  if (!f) return;
  const shown = (el) => (el.checkVisibility ? el.checkVisibility() : !!el.offsetParent); // closed <details> use content-visibility
  const visibleCards = () => [...$('side').querySelectorAll('.course')].filter(shown);
  const idx = visibleCards().indexOf(e.target.closest('.course'));
  const how = f(e.target);
  if (how === 'view') keepFocus(renderView);
  else if (how === 'quiet') { save(); scheduleRun(); } else refresh();
  // A card that moved into a collapsed section takes focus with it; land on the card now in its place instead.
  if (idx >= 0 && (document.activeElement === document.body || !shown(document.activeElement))) {
    const cards = visibleCards();
    (cards[Math.min(idx, cards.length - 1)]?.querySelector('input:checked') ?? $('side').querySelector('summary'))?.focus();
  }
});
document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'addFriendForm') return;
  e.preventDefault();
  friendUrl = $('friendUrl').value.trim();
  const r = await readHash(friendUrl.includes('#') ? friendUrl.slice(friendUrl.indexOf('#')) : '', app.state);
  if (!r || r.error || r.type !== 'friend') { friendMsg = r?.error ?? 'זה לא קישור חבר'; keepFocus(renderDrawer); return; }
  friendMsg = friendUrl = '';
  addFriend(r.payload);
});
document.addEventListener('toggle', (e) => {
  const k = e.target.dataset?.key;
  if (k) e.target.open ? openDetails.add(k) : openDetails.delete(k);
}, true);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('drawer').open && !$('pop').matches(':popover-open')) { $('drawer').close(); return; }
  if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable]') || $('drawer').contains(e.target) || $('pop').matches(':popover-open')) return;
  e.preventDefault();
  go(e.key === 'ArrowLeft' ? 1 : -1); // RTL: left = next
});
$('drawer').addEventListener('close', () => { panel = null; document.body.classList.remove('drawer-open'); (opener?.isConnected ? opener : $('week')).focus({ preventScroll: true }); });
$('pop').addEventListener('toggle', (e) => {
  if (e.newState !== 'closed') return;
  const a = document.activeElement;
  if (!a || a === document.body || $('pop').contains(a)) document.querySelector(`[data-k="${CSS.escape($('pop').dataset.src ?? '')}"]`)?.focus({ preventScroll: true });
});
addEventListener('scroll', () => {
  if ($('pop').matches(':popover-open') && !matchMedia('(max-width: 599px)').matches) $('pop').hidePopover();
}, { passive: true });

setRenderers(renderAll);
if (app.data) refresh();
