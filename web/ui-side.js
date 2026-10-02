// The courses sidebar of the builder ("הקורסים שלי").
import { app, esc, candidateMode } from './app.js';
import { englishOptions, specLists } from './rules.js';
import { unlockCounts } from './solver-core.js';
import { icon, isPair, resCourses, placedIn } from './ui-grid.js';
import { notFitReason } from './ui-text.js';
import { CAND, SEM_PICK, colors, listIds, status, doneIds, planned, seg, details, heb, listTitle, $, ui } from './ui-common.js';

// ---------- sidebar ----------
// Why a planned course is missing from the shown alternative (issue 17א#5).
function outReason(id) {
  const c = app.data.courses[id], prim = c.groups.filter((g) => g.primary);
  if (!app.state.constraints.includeFull && prim.length && prim.every((g) => g.full)) return 'כל הקבוצות מלאות';
  const k = ui.last?.results.findIndex((r) => resCourses(r).includes(id)) ?? -1;
  return k >= 0 ? `נכנס בחלופה ${k + 1}` : '';
}

// Why a must course is missing from a shown plan (a search with no plan at all uses the solver's diagnosis instead).
function outWhy(id) {
  const prim = app.data.courses[id].groups.filter((g) => g.primary);
  if (!app.state.constraints.includeFull && prim.length && prim.every((g) => g.full)) return 'כל הקבוצות מלאות';
  const k = ui.last?.results.findIndex((r) => resCourses(r).includes(id)) ?? -1;
  return k >= 0 ? `הוא נכנס רק בחלופה ${k + 1}` : 'אין לו מקום ליד שאר הקורסים שבחרת';
}

function card(id, res, unlocks, musts) {
  const { data, cls } = app;
  const s = cls.statuses[id], c = data.courses[id], mode = candidateMode(id);
  const where = isPair(res) ? placedIn(res, id) : null;
  const inAlt = res && (isPair(res) ? !!where : res.courses.includes(id)), out = res && !inAlt && mode !== 'no';
  const why = out ? outReason(id) : '';
  const required = data.lists.some((l) => l.name.startsWith('קורסי חובה') && l.courses.includes(id)) || specLists(data, app.state.profile.specs).mandatory.has(id);
  const noRes = !!ui.last && !ui.last.results.some((r) => resCourses(r).length);
  const dropped = mode === 'must' && (out || noRes); // wanted for sure, but the found plan (or the search) left it out
  const dropWhy = dropped ? (noRes ? notFitReason(c.name, ui.last.diagnosis ?? [], musts) : outWhy(id)) : '';
  const offered = c.semesters; // only the year view lists them
  const yearPick = app.state.scope === 'year' && offered?.length === 2 && s.status !== 'afterA' && ['must', 'optional'].includes(mode); // afterA only fits ב׳; a course set to no has nothing to place
  const tags = [
    app.state.scope === 'year' && offered?.length === 1 ? `<span class="tag">רק בסמסטר ${esc(offered[0])}׳</span>` : '',
    s.status === 'retake' ? '<span class="tag warn">חזרה</span>' : '',
    s.status === 'conditional' ? '<span class="tag warn">זמין בתנאי</span>' : '',
    unlocks[id] ? `<span class="tag">${unlocks[id] === 1 ? 'פותח קורס אחד' : `פותח ${unlocks[id]} קורסים`}</span>` : '',
    inAlt ? `<span class="tag ok">${icon('check')} במערכת${where ? ` · סמסטר ${esc(where)}׳` : ''}</span>` : '',
    out && !dropped ? `<span class="tag">לא נכנס${why ? `: ${esc(why)}` : ''}</span>` : '',
  ].join('');
  return `<article class="course c${colors.get(id) ?? 7}${ui.dashed.has(id) ? ' rep' : ''}${inAlt ? ' in' : ''}${out ? ' out' : ''}">
    <div class="course-top"><span class="dot" aria-hidden="true"></span><h3>${esc(c.name)}</h3><span class="cr">${c.credits} נ״ז</span></div>
    ${seg(`mode-${id}`, `מה לעשות עם ${c.name}`, [['must', 'חובה'], ['optional', 'אולי'], ['no', 'לא']], mode, `data-chg="mode" data-id="${esc(id)}"`)}
    ${yearPick ? `<div class="sem-row"><span class="sem-lbl" aria-hidden="true">סמסטר:</span>${seg(`sem-${id}`, `באיזה סמסטר ללמוד את ${c.name}`, SEM_PICK,
      app.state.semesterOf[id] ?? '', `data-chg="semOf" data-id="${esc(id)}"`)}</div>` : ''}
    ${tags ? `<div class="tags">${tags}</div>` : ''}
    ${s.reasons.length ? `<p class="reason">${s.reasons.map(esc).join('<br>')}</p>` : ''}
    ${required && app.state.choices[id] === 'no' ? '<p class="reason warn-text">תצטרך/י ללמוד אותו בהמשך</p>' : ''}
    ${dropped ? `<p class="reason warn-text">לא נכנס למערכת${dropWhy ? ` כי ${esc(dropWhy)}` : ''}</p>` : ''}
  </article>`;
}

export function renderSide(res) {
  const ids = listIds(), unlocks = unlockCounts(app.data, doneIds());
  const order = { retake: 0, available: 1, afterA: 1, conditional: 1 };
  const cand = ids.filter((id) => CAND.includes(status(id))).sort((a, b) => order[status(a)] - order[status(b)]);
  const plan = cand.filter(planned), rest = cand.filter((id) => !planned(id));
  const musts = plan.filter((id) => candidateMode(id) === 'must').map((id) => app.data.courses[id].name);
  const eng = englishOptions(app.data, app.state.profile.amirnet);
  const engBody = `<p class="hint">אנגלית נלמדת לפי רמה. ציון אמירנט פוטר מהרמה ומהרמות שמתחתיה (פטור לא נותן נ״ז).</p>
    <ul class="plain">${eng.map((e) => `<li><b>${esc(heb(e.name))}</b> · פטור בציון ${e.min}+${e.exempt ? ' <span class="tag ok">פטור</span>' : ''}</li>`).join('')}</ul>
    ${app.state.profile.amirnet === null ? '<p class="hint">אם יש לך ציון אמירנט, <a href="#me">הזינו אותו בפרופיל</a>.</p>' : ''}`;
  const taken = new Set(), sp = specLists(app.data, app.state.profile.specs); // a course sits in the first list that has it; the unchosen specialization lists come last, folded into one group
  const take = (l) => l.courses.filter((id) => rest.includes(id) && !taken.has(id) && taken.add(id));
  const lists = app.data.lists.map((l, i) => ({ l, i })), cards = (ids) => `<div class="cards">${ids.map((id) => card(id, res, unlocks, musts)).join('')}</div>`;
  const listsHtml = lists.filter(({ l }) => !sp.all.has(l.code) || sp.chosen.has(l.code)).map(({ l, i }) => { const ids = take(l); return details(`more-${i}`,
    `${esc(listTitle(l))} (${ids.length})`, cards(ids), ids.length); }).join('');
  const spec = lists.filter(({ l }) => sp.all.has(l.code) && !sp.chosen.has(l.code)).map(({ l }) => ({ l, ids: take(l) })).filter((x) => x.ids.length);
  const specN = spec.reduce((n, x) => n + x.ids.length, 0);
  const locked = (st) => ids.filter((id) => status(id) === st);
  const rows = (list) => `<ul
    class="locked">${list.map((id) => `<li>${icon('lock')}<div><b>${esc(app.data.courses[id].name)}</b><p>${app.cls.statuses[id].reasons.map(esc).join('<br>')}</p></div></li>`).join('')}</ul>`;
  $('side').innerHTML = `<div class="side-head"><h2>הקורסים שלי</h2><button type="button" class="link-btn" data-act="openStatus" data-k="openStatus">עדכן מצב</button></div>
    <p class="hint">חובה: בכל מערכת. אולי: רק אם משתלב טוב. לא: לא בתכנון.</p>
    ${details('plan', `בתכנון (${plan.length})`, `<div class="cards">${plan.map((id) => card(id, res, unlocks, musts)).join('')
      || '<p class="hint">עוד לא נבחרו קורסים. פתחו אחת מהקבוצות למטה.</p>'}</div>`, 1)}
    ${listsHtml}
    ${details('specOthers', `התמחויות אחרות (${specN})`, spec.map(({ l, ids }) => `<h4>${esc(listTitle(l))} (${ids.length})</h4>${cards(ids)}`).join(''), specN)}
    ${details('blocked', `${icon('lock')} חסומים (${locked('blocked').length})`, rows(locked('blocked')), locked('blocked').length)}
    ${details('notOffered', `לא נלמד בסמסטר (${locked('notOffered').length})`, rows(locked('notOffered')), locked('notOffered').length)}
    ${details('exempt', `פטור (ציון אמירנט) (${locked('exempt').length})`, rows(locked('exempt')), locked('exempt').length)}
    ${details('english', 'אנגלית: רמות ופטור', engBody, eng.length)}`;
}
