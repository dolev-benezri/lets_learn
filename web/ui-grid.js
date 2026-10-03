// Week grid, block popover and the small pure helpers behind them (hour range, pills summary, scale steps).
import { esc } from './app.js';
import { toMin, meetingsMask, overlaps, buildOptions } from './solver-core.js';
import { groupLabel, groupNumber, heb } from './ui-text.js';
// A course name as HTML: escaped, with its Latin runs marked lang="en" so a Hebrew screen reader voice says "IOS", not letters. Entities (&lt;) are not words.
export const nameHtml = (t) => esc(heb(t)).replace(/(?<![&\w])[A-Za-z](?:[A-Za-z0-9 .,+-]*[A-Za-z0-9])?(?![\w;])/g, (m) => `<span lang="en">${m}</span>`);

export const DAYS = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו'];
export const DAY_FULL = ['', 'ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];
// Lucide icons (design-system/afeka-scheduler/pages/app.md). No emoji in the UI.
export const ICON = {
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  pin: '<path d="M12 17v5"/>' +
    '<path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 ' +
    '2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.59 13.51 6.83 3.98"/><path d="m15.41 6.51-6.82 3.98"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  sliders: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/>' +
    '<line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/>' +
    '<line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  'clipboard-list': '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>' +
    '<path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
  'user-plus': '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',
  'external-link': '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  calendar: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/>' +
    '<path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  cap: '<path d="M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0z"/><path d="M22 10v6"/>' +
    '<path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  pencil: '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z"/>',
};
export const icon = (name) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;
export const initials = (name) => name.trim().split(/\s+/).map((w) => Array.from(w)[0] ?? '').slice(0, 2).join('') || '?';
export const yedion = (id) => `https://yedionpub.afeka.ac.il/yedion/fireflyweb.aspx?prgname=S_LOOK_FOR_NOSE&arguments=-N${encodeURIComponent(id)}`;
export const typeLabel = (t) => t.replace('סופי-', '');

// Nearest step of a 4-step scale (ties go to the higher step, so an old saved weight 2 reads as "חשוב").
export const nearestStep = (v, steps) => steps.reduce((best, s) => (Math.abs(s - v) <= Math.abs(best - v) ? s : best), steps[0]);

// Sticky colours: ids already in the map keep theirs, unless it clashes with another course of `shown` (the displayed
// alternative, assigned first so no two of its courses share a colour while there are 8 or fewer). Beyond 8 the repeats keep a
// colour and get a pattern (see repeatIds). `rest` (other candidates) just get the next colour.
export function assignColors(map, shown, rest = []) {
  const used = new Set();
  for (const id of shown) {
    let c = map.get(id);
    if (c === undefined || used.has(c)) {
      const s = map.size % 8;
      c = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => (s + i) % 8).find((x) => !used.has(x)) ?? c ?? s;
    }
    used.add(c);
    map.set(id, c);
  }
  for (const id of rest) if (!map.has(id)) map.set(id, map.size % 8);
  return map;
}
// Ids that repeat an earlier id's colour (only possible beyond 8 courses): drawn with a dashed edge.
export const repeatIds = (map, ids) => new Set(ids.filter((id, i) => ids.slice(0, i).some((x) => map.get(x) === map.get(id))));

// Progress rank per result: 1 = most progress; equal values share a rank (1,1,3).
export const progressRanks = (results) => results.map((r) => 1 + results.filter((x) => x.breakdown.progress > r.breakdown.progress).length);

const index = new WeakMap();
export function groupIndex(data) {
  if (!index.has(data)) index.set(data, new Map(Object.entries(data.courses).flatMap(([cid, c]) => c.groups.map((g) => [g.id, { cid, c, g }]))));
  return index.get(data);
}

export const paired = (a, b) => a.linked.includes(b.id) || b.linked.includes(a.id);

// Every group of the same course and type as `gid`, with whether it clashes with the rest of the alternative
// (`groupIds`): other courses' groups plus the candidate's linked partners (a lecture's own tutorial, a tutorial's lecture).
// `ok` is false when pinning it can't produce a schedule (its partner is full, or no lecture links to it).
// ponytail: several partners of one type all count, so a candidate with two possible tutorials can read as clashing.
export function altGroups(data, groupIds, gid, includeFull = false) {
  const byId = groupIndex(data), { cid, c, g: cur } = byId.get(gid);
  const rest = meetingsMask(groupIds.filter((id) => byId.get(id)?.cid !== cid).flatMap((id) => byId.get(id).g.meetings));
  return c.groups.filter((x) => x.type === cur.type).map((x) => {
    const mine = [x, ...c.groups.filter((y) => y.type !== x.type && paired(x, y))];
    return { g: x, clash: overlaps(meetingsMask(mine.flatMap((y) => y.meetings)), rest), ok: buildOptions(c, { pins: [x.id], includeFull }).length > 0 };
  });
}

// Up to 3 other groups of the same course and type that fit the rest of the alternative, aren't full and (for a lecture) have a free
// tutorial of their own: listed as "L2 + L2/1". A tutorial backup must belong to the course's chosen lecture. Identical-time `alts` are skipped.
export function backups(data, res, gid) {
  const byId = groupIndex(data), { cid, c, g: cur } = byId.get(gid);
  const mates = res.groups.filter((id) => id !== gid && byId.get(id)?.cid === cid).map((id) => byId.get(id).g);
  const out = [];
  for (const { g, clash } of altGroups(data, res.groups, gid)) {
    if (g.id === gid || clash || g.full || res.alts?.[gid]?.includes(g.id)) continue;
    if (cur.primary) {
      const partners = [], types = new Set(g.linked.map((id) => byId.get(id)?.g.type));
      for (const t of types) {
        const free = g.linked.map((id) => byId.get(id)?.g).find((y) => y && y.type === t && !y.full);
        if (free) partners.push(free.id);
      }
      if (partners.length < types.size) continue;
      out.push([g.id, ...partners].join(' + '));
    } else if (mates.every((m) => m.type === g.type || paired(m, g))) out.push(g.id);
  }
  return out.slice(0, 3);
}

// Year results are pairs { a, b, credits: { a, b }, missing, warnings }; a one-semester result is the search result itself.
// semResult gives the shown semester's result in the search-result shape (an empty one when that semester takes nothing).
export const isPair = (r) => !!r && 'a' in r;
const EMPTY = { courses: [], groups: [], exams: [], alts: {}, unlocks: 0, explanation: '', breakdown: { compact: 1, progress: 0 } };
export const semResult = (r, sem) => {
  if (!isPair(r)) return r;
  const x = r[sem === 'א' ? 'a' : 'b'];
  return x ? { ...EMPTY, ...x, breakdown: { ...EMPTY.breakdown, ...x.breakdown } } : EMPTY;
};
export const resCourses = (r) => (isPair(r) ? [...r.a.courses, ...(r.b?.courses ?? [])] : r.courses);
export const resGroups = (r) => (isPair(r) ? [...r.a.groups, ...(r.b?.groups ?? [])] : r.groups);
export const placedIn = (r, id) => (r.a.courses.includes(id) ? 'א' : r.b?.courses.includes(id) ? 'ב' : null);
export const yearTotals = (r) => ({ courses: resCourses(r).length, credits: r.credits.a + r.credits.b });

// Visible hours: earliest..latest meeting, padded by an hour, padding clamped to 08-21. A block is never cut off.
export function hourRange(meetings) {
  const real = meetings.filter((m) => m.day >= 1 && m.day <= 6);
  if (!real.length) return { from: 8, to: 18, days: 5 };
  const a = Math.floor(Math.min(...real.map((m) => toMin(m.start))) / 60);
  const b = Math.ceil(Math.max(...real.map((m) => toMin(m.end))) / 60);
  return { from: Math.min(a, Math.max(8, a - 1)), to: Math.max(b, Math.min(21, b + 1)), days: real.some((m) => m.day === 6) ? 6 : 5 };
}

// Summary pills for one alternative: credits and free days from its groups, gaps from breakdown, exam gap from explanation.
export function summary(res, data, friends) {
  const byId = groupIndex(data);
  const busy = new Set(res.groups.flatMap((g) => byId.get(g)?.g.meetings.map((m) => m.day) ?? []));
  return {
    credits: res.courses.reduce((a, c) => a + data.courses[c].credits, 0),
    freeDays: [1, 2, 3, 4, 5].filter((d) => !busy.has(d)),
    gapH: Math.round((1 - res.breakdown.compact) * 100) / 10,
    withFriends: friends.filter((f) => f.active).map((f) => ({
      name: f.name,
      n: res.courses.filter((cid) => data.courses[cid].groups.some((g) => res.groups.includes(g.id) && f.groups.includes(g.id))).length,
    })).filter((x) => x.n),
    examGap: res.explanation.match(/לפחות (\S+) ימים בין בחינות/)?.[1] ?? null,
  };
}

// Friend tags on a block: first name (tooltip = full name), at most two, then "+N". Tags, not circles, so they never overlap.
export const firstName = (name) => {
  const w = Array.from(name.trim().split(/\s+/)[0]);
  return (w.length > 7 ? `${w.slice(0, 6).join('')}…` : w.join('')) || '?';
};
const friendAvs = (fr) => fr.slice(0, 2).map((f) => `<span class="fr" title="${esc(f.name)}" aria-hidden="true">${esc(firstName(f.name))}</span>`).join('')
  + (fr.length > 2 ? `<span class="fr" title="${esc(fr.slice(2).map((f) => f.name).join(', '))}" aria-hidden="true">+${fr.length - 2}</span>` : '');

// Plain-Hebrew progress pill: rank 1 = the alternative that moves furthest in the degree (ties share it).
export const rankText = (rank, n) => (rank === 1 ? 'מקדמת הכי הרבה בתואר' : `מקום ${rank} מתוך ${n} בהתקדמות בתואר`);

function block({ cid, c, g }, m, from, cls, pinned, fr) {
  const d = toMin(m.end) - toMin(m.start);
  const k = `b-${g.id}-${m.day}-${m.start}`;
  return `<button type="button" class="blk ${cls}${pinned ? ' pinned' : ''}${d < 80 ? ' short' : ''}" data-act="block" data-gid="${esc(g.id)}" data-k="${esc(k)}"
    aria-haspopup="dialog" style="--s:${toMin(m.start) - from * 60};--d:${d}">
    <span class="sr">יום ${DAYS[m.day]}׳, </span><span class="blk-name">${nameHtml(c.name)}</span>
    <span class="blk-meta"><bdi dir="ltr">${esc(m.start)}<span class="blk-end">–${esc(m.end)}</span></bdi></span>
    <span class="blk-room">${esc(typeLabel(g.type))}${m.room ? ` · ${esc(m.room)}` : ''}</span>
    ${pinned ? `<span class="blk-pin">${icon('pin')}<span class="sr">, נעוץ</span></span>` : ''}
    ${fr.length ? `<span class="blk-fr">${friendAvs(fr)}<span class="sr">, עם ${fr.map((f) => esc(f.name)).join(', ')}</span></span>` : ''}
    <span class="sr"> (${esc(cid)})</span></button>`;
}

// Personal busy time: a plain div (not a button), drawn first so lessons paint over it. The visible label is hidden from screen readers, which get the full phrase.
function busyBlock(b, from) {
  const label = b.label || 'זמן תפוס';
  return `<div class="off" style="--s:${toMin(b.start) - from * 60};--d:${toMin(b.end) - toMin(b.start)}"><span class="off-l" aria-hidden="true">${esc(label)}</span>
    <span class="sr">זמן תפוס: ${b.label ? `${esc(b.label)} ` : ''}${esc(b.start)}–${esc(b.end)}</span></div>`;
}

// ctx: { data, res (or null), range, colors: Map cid->index, dashed: Set of repeat-colour cids, pins, friends (active), day (mobile), blocks (busy time, optional) }
export function renderWeek(ctx) {
  const { data, res, range, colors, dashed, pins, friends, day, blocks = [] } = ctx;
  const byId = groupIndex(data);
  const cols = Array.from({ length: range.days + 1 }, () => []);
  for (const b of blocks) if (b.day >= 1 && b.day <= range.days) cols[b.day].push(busyBlock(b, range.from));
  for (const gid of res?.groups ?? []) {
    const x = byId.get(gid);
    if (!x) continue;
    const fr = friends.filter((f) => f.groups.includes(gid));
    for (const m of x.g.meetings) if (m.day >= 1 && m.day <= range.days) cols[m.day].push(block(x, m, range.from, `c${colors.get(x.cid)
      ?? 7}${dashed?.has(x.cid) ? ' rep' : ''}`, pins.includes(gid), fr));
  }
  const days = cols.map((_, d) => d).slice(1);
  let hours = '';
  for (let h = range.from; h < range.to; h++) hours += `<span style="--s:${(h - range.from) * 60}">${String(h).padStart(2, '0')}:00</span>`;
  return `<div class="wk" style="--cols:${range.days};--span:${(range.to - range.from) * 60}">
    <div class="wk-head" aria-hidden="true"><div></div>${days.map((d) => `<div class="dh"><b>${DAYS[d]}׳</b><span>${DAY_FULL[d]}</span></div>`).join('')}</div>
    <div class="hours" aria-hidden="true">${hours}</div>
    ${days.map((d) => `<div class="day${d === day ? ' on' : ''}" role="group" aria-label="יום ${DAY_FULL[d]}">${cols[d].join('')}</div>`).join('')}
  </div>`;
}

export function renderDaySelector(range, res, data, day) {
  const busy = new Set((res?.groups ?? []).flatMap((g) => groupIndex(data).get(g)?.g.meetings.map((m) => m.day) ?? []));
  return Array.from({ length: range.days }, (_, i) => i + 1).map((d) => `<button type="button" data-act="day" data-day="${d}" data-k="day-${d}"
    aria-pressed="${d === day}">${DAYS[d]}׳${busy.has(d) ? '' : '<span class="sr"> (פנוי)</span><span class="free" aria-hidden="true">פנוי</span>'}</button>`).join('');
}

// Popover: details of one group, friends in it, pin toggle and a Yedion link. Compact: header and actions stay, the rest scrolls inside.
// The group is named for people (type + short number); the 9-digit registration id stays visible but secondary.
// Prefer / avoid this lecturer in every search (constraints.lecturers); pressed again, the choice is cleared.
const lecturerBtns = (name, mine) => [['prefer', 'להעדיף', `להעדיף את ${name}`], ['avoid', 'להימנע', `להימנע מקבוצות של ${name}`]].map(([mode, label, aria]) => ` <button
  type="button" class="btn sm" data-act="lecturer" data-name="${esc(name)}" data-mode="${mode}" aria-pressed="${mine === mode}" aria-label="${esc(aria)}">${label}</button>`).join('');
export function openPop(btn, ctx) {
  const pop = document.getElementById('pop');
  const { cid, c, g } = groupIndex(ctx.data).get(btn.dataset.gid);
  const pinned = ctx.pins.includes(g.id);
  const fr = ctx.friends.filter((f) => f.groups.includes(g.id));
  const alts = altGroups(ctx.data, ctx.res?.groups ?? [], g.id, ctx.includeFull);
  const exams = c.groups.filter((x) => ctx.res?.groups.includes(x.id)).flatMap((x) => x.exams).filter((e) => e.kind === 'בחינה');
  pop.className = `pop c${ctx.colors.get(cid) ?? 7}`;
  pop.innerHTML = `
    <div class="pop-head"><span class="dot" aria-hidden="true"></span>
      <div><h3 id="popTitle">${nameHtml(c.name)}</h3><p>${esc(groupLabel(g))} · קורס ${esc(cid)}</p></div>
      <button type="button" class="btn icon-btn ghost" data-act="popClose" aria-label="סגור">${icon('x')}</button></div>
    <div class="pop-actions">
      <button type="button" class="btn ${pinned ? '' : 'primary'}" data-act="pin" data-gid="${esc(g.id)}" aria-pressed="${pinned}"
        aria-describedby="popHint">${icon('pin')} ${pinned ? 'בטל נעיצה' : 'נעץ קבוצה'}</button>
      <a class="btn" href="${yedion(cid)}" target="_blank" rel="noopener">ראה בידיעון ${icon('external-link')}<span class="sr"> (נפתח בחלון חדש)</span></a>
    </div>
    <div class="pop-body">
    ${g.full ? `<p class="tag bad">${icon('alert')} הקבוצה מלאה</p>` : ''}
    <dl>
      <dt>מרצה</dt><dd>${esc(g.lecturer || '—')}${g.lecturer ? lecturerBtns(g.lecturer, ctx.lecturers?.[g.lecturer]) : ''}</dd>
      <dt>מפגשים</dt><dd>${g.meetings.map((m) => `יום ${DAYS[m.day] ?? '?'}׳ <bdi dir="ltr">${esc(m.start)}–${esc(m.end)}</bdi>${m.room ? ` · ${esc(m.room)}` : ''}`).join('<br>')}</dd>
      <dt>בחינות</dt><dd>${!ctx.data.examsPublished ? 'לוח הבחינות טרם פורסם'
        : exams.length ? exams.map((e) => `מועד ${esc(e.moed)}: <bdi dir="ltr">${esc(e.date)}</bdi>`).join('<br>') : '—'}</dd>
      ${fr.length ? `<dt>חברים בקבוצה</dt><dd>${fr.map((f) => `<span class="av" aria-hidden="true">${esc(initials(f.name))}</span> ${esc(f.name)}`).join('<br>')}</dd>` : ''}
      <dt class="gid">מספר להרשמה</dt><dd class="gid"><bdi dir="ltr">${esc(g.id)}</bdi></dd>
    </dl>
    <p class="pop-hint" id="popHint">נעיצה שומרת את הקבוצה הזו בכל החלופות.</p>
    ${alts.length > 1 ? `<h4 class="pop-alt-h">קבוצות ${esc(typeLabel(g.type))} אחרות בקורס</h4><ul class="pop-alts">${alts.map(({ g: x, clash, ok }) => {
      const body = `<b>קבוצה ${esc(groupNumber(x.id))}</b> · ${x.meetings.map((m) => `${DAYS[m.day] ?? '?'}׳ <bdi
        dir="ltr">${esc(m.start)}–${esc(m.end)}</bdi>`).join(', ')} · ${esc(x.lecturer || '—')}`
        + `${x.full ? ' <span class="tag bad">מלאה</span>' : ''}${clash ? ' <span class="tag bad">מתנגשת</span>' : ''} <bdi dir="ltr" class="gid">${esc(x.id)}</bdi>`;
      return x.id === g.id ? `<li class="cur" aria-current="true">${body} <span class="tag ok">נוכחית</span></li>`
        : !ok ? `<li class="na">${body} <span class="tag bad">לא זמינה</span></li>`
        : `<li><button type="button" class="btn" data-act="pin" data-gid="${esc(x.id)}" data-k="alt-${esc(x.id)}">${body}</button></li>`;
    }).join('')}</ul>` : ''}
    </div>`;
  pop.setAttribute('aria-labelledby', 'popTitle');
  pop.dataset.src = btn.dataset.k;
  pop.dataset.gid = g.id;
  pop.showPopover();
  if (!matchMedia('(max-width: 599px)').matches) {
    const r = btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight, gap = 8;
    const left = r.left - w - gap >= gap ? r.left - w - gap : r.right + w + gap <= innerWidth ? r.right + gap : Math.max(gap, (innerWidth - w) / 2);
    pop.style.left = `${left}px`;
    pop.style.top = `${Math.max(gap, Math.min(r.top, innerHeight - h - gap))}px`;
    pop.dataset.top = r.top; // where the block was: a long scroll away from it closes the popover (ui-plan.js)
  } else pop.style.left = pop.style.top = '';
  pop.querySelector('.pop-actions [data-act="pin"]').focus({ preventScroll: true });
}
