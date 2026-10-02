// Progress map, markup: the SVG graph and the list view as strings (all data escaped), from a context built by ui-map.js. No DOM, unit-tested.
import { esc } from './app.js';
import { icon, yedion } from './ui-grid.js';
import { YEAR_LETTERS, planPaths, G, truncate } from './map-layout.js';

// ---------- text helpers ----------
const LABEL = { done: 'עברתי', exempt: 'פטור', retake: 'חזרה', available: 'זמין', conditional: 'זמין בתנאי', afterA: 'בב׳ אחרי…', blocked: 'חסום', notOffered: 'לא נלמד' };
const uniq = (a) => [...new Set(a)];
const requires = (data, id) => data.courses[id].prereqs.map((p) => `${p.kind === 'מקביל' ? 'במקביל: ' : ''}${uniq(p.anyOf.map((a) => a.name)).join(' או ')}`);
const opensDirect = (data, id) => Object.entries(data.courses).filter(([, c]) => c.prereqs.some((p) => p.kind === 'קדם' && p.anyOf.some((a) => a.id === id))).map(([k]) => k);
const plural = (n, one, many) => (n === 1 ? one : `${n} ${many}`);

const statusOf = (c, id) => c.st[id]?.status ?? 'available';
const yearTag = (y) => (y ? `שנה ${YEAR_LETTERS[y - 1]}׳` : '');
const nodeLabel = (c, id, yr) => {
  const co = c.data.courses[id], s = statusOf(c, id), n = c.unlocks[id] ?? 0;
  const why = ['blocked', 'notOffered', 'afterA', 'conditional'].includes(s) ? c.st[id].reasons : [];
  return [co.name, LABEL[s], `${co.credits} נ״ז`, yearTag(yr), requires(c.data, id).length && `דורש: ${requires(c.data, id).join('; ')}`, n && `פותח: ${plural(n, 'קורס אחד', 'קורסים')}`, ...why].filter(Boolean).join(', ');
};


// ---------- rendering ----------
export const svg = (body) => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
export const ICONS = {
  minus: svg('<path d="M5 12h14"/>'),
  fit: svg('<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>'),
  list: svg('<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>'),
  map: svg('<circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M9 6h6a3 3 0 0 1 3 3v6"/>'),
};
export const MODES = [['all', 'הכל'], ['remaining', 'מה שנשאר לי'], ['year', 'רק השנה שלי']];
// Inner glyph per status (24-unit paths): the status never rests on colour alone. `available` needs none; notOffered has the dashed ring.
const GLYPH = {
  done: '<path d="M20 6 9 17l-5-5"/>',
  exempt: '<path d="M21.4 10.9a1 1 0 0 0 0-1.8L12.8 5.2a2 2 0 0 0-1.6 0L2.6 9.1a1 1 0 0 0 0 1.8l8.6 3.9a2 2 0 0 0 1.6 0z"/><path d="M22 10v6"/><path d="M6 12.5V16a6 3 0 0 0 12 0v-3.5"/>',
  retake: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  blocked: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  afterA: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  conditional: '<path d="M12 7v6"/><path d="M12 17h.01"/>',
};
const glyph = (s, x, y, r) => { const z = Math.min(18, r * 1.1); return GLYPH[s] ? `<g class="gl" transform="translate(${x - z / 2} ${y - z / 2}) scale(${z / 24})" aria-hidden="true">${GLYPH[s]}</g>` : ''; };
export const LEGEND = [['done', 'עברתי'], ['exempt', 'פטור'], ['available', 'זמין עכשיו'], ['conditional', 'זמין בתנאי'], ['retake', 'חזרה (נכשלתי)'], ['afterA', 'בב׳ אחרי…'], ['blocked', 'חסום, חסר קדם'], ['notOffered', 'לא נלמד בסמסטר']];
const num = (n) => Math.round(n * 10) / 10;

function nodeSvg(c, n) {
  const x = num(n.x), y = num(n.y);
  if (n.type === 'ext') {
    const tag = n.pre ? 'לפני התואר' : 'לא בתוכנית שלך', t = `${n.pre ? 'קורס הכנה לפני התואר (רק למי שנדרש/ה)' : 'לא בתוכנית שלך'}: ${n.name}`;
    return `<g class="ext${n.pre ? ' pre' : ''}" data-key="${esc(n.key)}" aria-hidden="true"><title>${esc(t)}</title><rect x="${x - n.hw}" y="${y - n.r}" width="${2 * n.hw}" height="${2 * n.r}" rx="${n.r}"/><text class="tg" x="${x}" y="${y - 6}" text-anchor="middle" dominant-baseline="central">${tag}</text><text x="${x}" y="${y + 7}" text-anchor="middle" dominant-baseline="central">${esc(truncate(n.name, 20))}</text></g>`;
  }
  const yr = n.year, mine = c.year && yr === c.year; // the student's study year: dotted halo, also named in the label and the card
  const co = c.data.courses[n.id], s = statusOf(c, n.id), o = c.unlocks[n.id] ?? 0, bw = o > 9 ? 52 : 46, planned = inPlan(c, n.id), lbl = nodeLabel(c, n.id, yr) + (planned ? ', בתכנון' : '');
  return `<g class="nd st-${s}${mine ? ' mine' : ''}${planned ? ' plan' : ''}" role="button" tabindex="0" data-key="${esc(n.key)}" data-k="mn-${esc(n.id)}" aria-pressed="false" aria-label="${esc(lbl)}"><title>${esc(lbl)}</title>
    ${mine ? `<circle class="mine-halo" cx="${x}" cy="${y}" r="${n.r + 8}"/>` : ''}${planned ? `<circle class="plan-ring" cx="${x}" cy="${y}" r="${n.r + 4}"/>` : ''}<circle class="halo" cx="${x}" cy="${y}" r="${n.r + 5}"/><circle class="hit" cx="${x}" cy="${y}" r="${Math.max(n.r, 22)}"/><circle class="ring" cx="${x}" cy="${y}" r="${n.r}"/>${glyph(s, x, y, n.r)}
    <text class="nm" x="${x}" y="${num(y + n.r + 16)}" text-anchor="middle">${esc(truncate(co.name))}</text>${o ? `<g class="opens" aria-hidden="true"><rect x="${num(x - n.r * 0.8 - bw / 2)}" y="${num(y - n.r * 0.85 - 8)}" width="${bw}" height="16" rx="8"/><text x="${num(x - n.r * 0.8)}" y="${num(y - n.r * 0.85)}" text-anchor="middle" dominant-baseline="central">פותח ${o}</text></g>` : ''}</g>`;
}
// A planned course not yet passed (a passed one has nothing left to plan).
const inPlan = (c, id) => !!c.plan?.has(id) && !['done', 'exempt'].includes(statusOf(c, id));

// A caption under a band title, broken in two at the middle word so it fits one column.
export const noteLines = (t) => { if (!t) return []; const w = t.split(' '), k = Math.ceil(w.length / 2); return [w.slice(0, k).join(' '), w.slice(k).join(' ')].filter(Boolean); };

export function mapSvg(c) {
  const g = c.g;
  const bands = g.bands.map((b) => `<g class="band${c.year && b.year === c.year ? ' mine' : ''}${b.kind === 'pre' ? ' pre' : ''}" aria-hidden="true"><rect x="${num(b.x)}" y="8" width="${b.w}" height="${num(g.H - 16)}" rx="12"/><text class="bt" x="${num(b.x + b.w / 2)}" y="${b.note ? 20 : 30}" text-anchor="middle">${esc(b.name)}</text>${noteLines(b.note).map((t, i) => `<text class="bs" x="${num(b.x + b.w / 2)}" y="${34 + i * 13}" text-anchor="middle">${esc(t)}</text>`).join('')}</g>`).join('');
  const plan = planPaths(c.L.paths, c.plan ?? new Set());
  const edges = g.edges.map((p) => `<path class="e ${p.kind === 'מקביל' ? 'p' : 'k'}${plan.has(p.id) ? ' plan' : ''}" data-p="${p.id}" d="${p.d}"/>`).join('');
  const ors = g.ors.map((o) => `<g class="or" data-key="${esc(o.key)}" aria-hidden="true"><circle cx="${num(o.x)}" cy="${num(o.y)}" r="${o.r}"/><text x="${num(o.x)}" y="${num(o.y)}" text-anchor="middle" dominant-baseline="central">או</text></g>`).join('');
  return `<svg class="pm-svg" width="100%" height="100%" role="group" aria-label="מפת הקורסים"><defs>
    <marker id="pmArr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 1 10 5 0 9z" class="ar"/></marker>
    <marker id="pmArrP" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 1 10 5 0 9z" class="ar plan"/></marker>
    <marker id="pmArrL" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="11" markerHeight="11" markerUnits="userSpaceOnUse" orient="auto"><path d="M0 1 10 5 0 9z" class="ar lit"/></marker></defs>
    <g class="pz"><g class="bands">${bands}</g><g class="edges" aria-hidden="true">${edges}</g><g class="ors">${ors}</g><g class="nodes">${g.nodes.map((n) => nodeSvg(c, n)).join('')}</g></g></svg>`;
}

export const legendSw = (s) => `<svg class="lg-sw" width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><g class="sw st-${s}"><circle class="ring" cx="13" cy="13" r="10"/>${glyph(s, 13, 13, 10)}</g></svg>`;
export const legendEdge = (cls) => `<svg width="34" height="10" aria-hidden="true"><path class="lg-e ${cls}" d="M2 5H32"/></svg>`;

export function listHtml(c) {
  const byBand = c.L.bands.map((b) => c.L.nodes.filter((n) => n.type === 'course' && n.col >= b.first && n.col < b.first + b.n).map((n) => n.id));
  return `<div class="pm-list">${c.L.bands.map((b, i) => !byBand[i].length ? '' : `<section><h3>${esc(b.name)}</h3><ul>${byBand[i].map((id) => {
    const co = c.data.courses[id], s = statusOf(c, id), req = requires(c.data, id), o = c.unlocks[id] ?? 0;
    return `<li class="st-${s}"><div class="li-top"><b>${esc(co.name)}</b><span class="li-st">${LABEL[s]}</span>${inPlan(c, id) ? '<span class="li-st li-plan">בתכנון</span>' : ''}<span class="li-cr"><bdi>${esc(co.credits)}</bdi> נ״ז</span>
      <a class="li-link" href="${yedion(id)}" target="_blank" rel="noopener" aria-label="${esc(co.name)} בידיעון (חלון חדש)">${icon('external-link')}</a></div>
      ${req.length ? `<p>דורש: ${req.map(esc).join('; ')}</p>` : ''}${o ? `<p>פותח: ${plural(o, 'קורס אחד', 'קורסים')}</p>` : ''}${c.st[id]?.reasons.length ? `<p class="li-why">${c.st[id].reasons.map(esc).join('<br>')}</p>` : ''}</li>`;
  }).join('')}</ul></section>`).join('') || '<p>אין קורסים להצגה.</p>'}${asideHtml(c)}</div>`;
}

// Electives the student did not choose: listed, not drawn.
export const asideHtml = (c) => (c.aside.length ? `<details class="pm-aside"><summary>לא רלוונטי (<bdi>${c.aside.length}</bdi>)</summary><p>קורסי בחירה שלא סימנתם ״חובה״ או ״אולי״.</p><ul>${c.aside.map((id) => `<li>${esc(c.data.courses[id].name)} <bdi>${esc(id)}</bdi></li>`).join('')}</ul></details>` : '');

export function cardHtml(c, id) {
  const co = c.data.courses[id], s = statusOf(c, id), req = requires(c.data, id), opens = opensDirect(c.data, id), r = c.st[id]?.reasons ?? [];
  const yr = c.L.nodes.find((n) => n.key === id)?.year;
  return `<div class="card-top"><span class="chip st-${s}">${LABEL[s]}</span><button type="button" class="pm-ibtn" data-pm="clear" data-k="pm-clear" aria-label="סגור את כרטיס הקורס">${icon('x')}</button></div>
    <h3>${esc(co.name)}</h3><p class="card-meta"><bdi>${esc(id)}</bdi> · <bdi>${esc(co.credits)}</bdi> נ״ז${yr ? ` · ${yearTag(yr)}` : ''}</p>
    ${r.length ? `<p class="card-why">${r.map(esc).join('<br>')}</p>` : ''}
    ${req.length ? `<h4>דורש</h4><ul>${req.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '<p class="card-meta">אין קדם.</p>'}
    ${opens.length ? `<h4>פותח${c.unlocks[id] > opens.length ? ` (בסך הכל ${c.unlocks[id]})` : ''}</h4><ul>${opens.slice(0, 8).map((k) => `<li>${esc(c.data.courses[k].name)}</li>`).join('')}${opens.length > 8 ? `<li>ועוד ${opens.length - 8}</li>` : ''}</ul>` : ''}
    <p class="card-note">הדגשנו על המפה את כל מה שדרוש כדי להגיע אליו ואת כל מה שהוא פותח.</p>
    <a class="pm-btn" href="${yedion(id)}" target="_blank" rel="noopener">${icon('external-link')} ראה בידיעון (חלון חדש)</a>`;
}

// Progress bar: credits done (green) and the plan's share (purple) out of the required total. Text carries the same numbers for screen readers.
export function progressHtml(c) {
  const { total, done, planned, adds, specLeft } = c.prog;
  if (!total) return '';
  const pct = (v) => Math.round((100 * v) / total), txt = `${done} מתוך ${total} נ״ז`, ext = adds ? `המערכת שנבחרה מוסיפה ${adds} נ״ז${c.opened ? ` ופותחת ${plural(c.opened, 'קורס אחד', 'קורסים')}` : ''}` : '';
  const title = 'הסכום המשוער של הרשימות בתוכנית (נ״ז מינימום לכל רשימה); לא כולל כללים נוספים שבתקנון. קורס נספר פעם אחת, ורשימה לא נספרת מעבר למינימום שלה.';
  return `<div class="pm-prog" title="${esc(title)}"><p class="pm-prog-t">הושלמו <b><bdi>${done}</bdi></b> מתוך <b><bdi>${total}</bdi></b> נ״ז${ext ? ` · <span class="pm-prog-plan">${esc(ext)}</span>` : ''}</p>
    <div class="pm-meter" role="progressbar" aria-label="התקדמות בתואר בנקודות זכות" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done + planned}" aria-valuetext="${esc(ext ? `${txt}, ${ext}` : txt)}"><i class="d" style="width:${pct(done)}%"></i><i class="p" style="width:${pct(planned)}%"></i></div>${specLeft != null ? `<p class="pm-prog-spec">נותרו <b><bdi>${+specLeft.toFixed(1)}</bdi></b> נ״ז מקורסי ההתמחות</p>` : c.year >= 2 && !c.specs?.length ? '<p class="pm-prog-spec"><a href="#me" data-pm="spec" data-k="pm-spec">בחרו התמחות ב״המצב שלי״ כדי לראות את קורסי החובה שלה</a></p>' : ''}</div>`;
}
