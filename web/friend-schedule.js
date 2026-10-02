// Friend's timetable from a picture: Afeka's planner exports a table slide (course code, type, "יום X, HH:MM-HH:MM") and a weekly-grid slide
// (colored blocks "name (type) HH:MM - HH:MM"). Neither carries the 9-digit group id, so OCR text is matched to groups by course + meeting times.
import { toMin } from './solver-core.js';

const BIDI = /[‎‏‪-‮⁦-⁩]/g;
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי']; // index + 1 = meeting.day
const KINDS = ['הרצאה', 'תרגול', 'מעבדה'];
const DIGIT_LOOKALIKE = { m: '11', l: '1', I: '1', '|': '1', O: '0', o: '0', S: '5', B: '8', Z: '2' };

function lev(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}
const clean = (s) => String(s ?? '').replace(BIDI, '');
const letters = (s) => clean(s).replace(/[^א-תA-Za-z0-9]/g, '');
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// "30m2" -> the one known course code within one edit of "30112" (OCR reads "11" as "m"); null when unknown or ambiguous.
function codeOf(tok, known) {
  const t = tok.replace(/[mlI|OoSBZ]/g, (c) => DIGIT_LOOKALIKE[c]);
  if (!/^\d{4,6}$/.test(t)) return null;
  if (known.has(t)) return t;
  const near = [...known].filter((k) => Math.abs(k.length - t.length) <= 1 && lev(k, t) <= 1);
  return near.length === 1 ? near[0] : null;
}

// Every known course code within one edit of a damaged code ("9091" -> 90911, 90915, ...); the meeting times then pick between them.
function nearCodes(tok, known) {
  const t = tok.replace(/[mlI|OoSBZ]/g, (c) => DIGIT_LOOKALIKE[c]);
  return /^\d{3,6}$/.test(t) ? [...known].filter((k) => Math.abs(k.length - t.length) <= 1 && lev(k, t) <= 1) : [];
}

// Days whose name is closest to an OCR-damaged word ("שכישי" is equally close to שלישי and שישי, so several can come back).
function daysOf(word) {
  const d = DAY_NAMES.map((n) => lev(n, word));
  const best = Math.min(...d);
  return best <= 2 ? d.flatMap((x, i) => (x === best ? [i + 1] : [])) : null;
}

// A time range; either side may lose its colon in OCR ("10:00-1150", "15:00-15-50"). Reversed ("09:50 - 08:00" in RTL screenshots) is put in order.
const RANGE = /(\d{1,2})\s*[:.]\s*(\d{2})\s*[-–]\s*(\d{1,2})\s*[:.\-]?\s*(\d{2})/g;
function ranges(text) {
  const out = [];
  for (const m of text.matchAll(RANGE)) {
    const a = Number(m[1]) * 60 + Number(m[2]), b = Number(m[3]) * 60 + Number(m[4]);
    if (Math.max(m[2], m[4]) > 59 || Math.min(a, b) < 6 * 60 || Math.max(a, b) > 23 * 60 + 59) continue;
    const before = clean(text.slice(Math.max(0, m.index - 16), m.index)).match(/([א-ת]{2,7})[^א-ת]*$/);
    out.push({ days: before ? daysOf(before[1]) : null, start: hhmm(Math.min(a, b)), end: hhmm(Math.max(a, b)) });
  }
  return out;
}

// OCR text of a table slide -> one row per course code: { cid, code, kinds, meets: [{ days, start, end }] }. A row runs to the next code.
export function rowsFromTable(text, courses) {
  const t = clean(text), known = new Set(Object.keys(courses)), hits = [];
  for (const m of t.matchAll(/(?<![0-9A-Za-z])[0-9A-Za-z|]{4,6}(?![0-9A-Za-z])/g)) {
    const cid = codeOf(m[0], known);
    if (cid) hits.push({ cid, code: m[0], at: m.index, end: m.index + m[0].length });
    else if (/^\d{5}$/.test(m[0])) hits.push({ cid: null, code: m[0], at: m.index, end: m.index + 5 }); // a code we don't have
  }
  return hits.map((h, i) => {
    const body = t.slice(h.end, hits[i + 1]?.at ?? t.length);
    return { cid: h.cid, code: h.code, kinds: kindsOf(body), meets: ranges(body) };
  });
}

// OCR words with boxes ({ t, x0, x1, y0, y1 }) -> text in reading order for a right-to-left page: lines top to bottom, words right to left.
function textOfWords(ws) {
  const lines = [];
  for (const w of ws.slice().sort((a, b) => a.y0 - b.y0)) {
    const cy = (w.y0 + w.y1) / 2, l = lines.find((x) => Math.abs(x.cy - cy) < (w.y1 - w.y0) * 0.6);
    if (l) l.ws.push(w); else lines.push({ cy, ws: [w] });
  }
  return lines.map((l) => l.ws.sort((a, b) => b.x0 - a.x0).map((w) => w.t).join(' ')).join('\n');
}

// The course whose name best fits some stretch of the row's text (a damaged or missing code is no reason to lose the row); null under 0.8.
function cidInText(text, courses) {
  const t = letters(text);
  let best = null, bestSim = 0.8;
  for (const [cid, c] of Object.entries(courses)) {
    const n = letters(c.name);
    if (n.length < 4) continue;
    for (let i = 0; i + n.length - 2 <= t.length; i += 2) {
      const sim = 1 - lev(t.slice(i, i + n.length), n) / n.length;
      if (sim > bestSim) { best = cid; bestSim = sim; }
    }
  }
  return best;
}

// Table slide as OCR words with boxes -> rows like rowsFromTable. Each row starts with the semester digit in the rightmost column; the course
// code is read from the code column only, so a stray number elsewhere never starts a row. null when no such column is found.
export function rowsFromWords(words, courses) {
  const digits = words.filter((w) => /^[1-3]$/.test(clean(w.t).trim()));
  if (digits.length < 2) return null;
  const edge = Math.max(...digits.map((w) => w.x1)), anchors = [];
  for (const d of digits.filter((w) => w.x1 >= edge - 30).sort((a, b) => a.y0 - b.y0)) if (!anchors.length || d.y0 - anchors.at(-1).y0 > (d.y1 - d.y0) * 1.5) anchors.push(d);
  if (anchors.length < 2) return null;
  const known = new Set(Object.keys(courses)), pageW = Math.max(...words.map((w) => w.x1));
  return anchors.map((a, i) => {
    const pad = (a.y1 - a.y0) * 0.6, lo = a.y0 - pad, hi = anchors[i + 1] ? anchors[i + 1].y0 - pad : Infinity;
    const ws = words.filter((w) => (w.y0 + w.y1) / 2 >= lo && (w.y0 + w.y1) / 2 < hi), text = textOfWords(ws);
    const inCode = ws.filter((w) => w !== a && w.x0 >= a.x0 - pageW * 0.12).sort((p, q) => q.x0 - p.x0);
    let cid = null, cids = null, code = '';
    for (const w of inCode) if ((cid = codeOf(clean(w.t), known))) { code = clean(w.t); break; }
    if (!cid) {
      cid = cidInText(text, courses);
      code = cid ?? (inCode.map((w) => clean(w.t)).join('') || '?');
      if (!cid) { const near = inCode.flatMap((w) => nearCodes(clean(w.t), known)); if (near.length) cids = near; }
    }
    return { cid, cids, code, kinds: kindsOf(text), meets: ranges(text) };
  });
}

// "(סופי-הרצאה+תרגול)" -> the kinds it names, tolerant to one OCR slip per word.
function kindsOf(text) {
  const words = clean(text).split(/[^א-ת]+/).filter((w) => w.length > 3);
  return KINDS.filter((k) => words.some((w) => lev(w, k) <= 1));
}

// A grid block's OCR text ("name (type) 08:00 - 09:50") and the day of its column -> a row. `slot` ({ start, end }) replaces the OCR'd times
// (the grid's geometry is more reliable than small white-on-color digits). The course is found by name in matchRows.
export function rowFromBlock(text, day, courses, slot = null) {
  const t = clean(text), nameKey = letters(t.split('(')[0]);
  return { cid: null, code: nameKey, nameKey, kinds: kindsOf(t.slice(Math.max(0, t.indexOf('(')))), meets: (slot ? [slot] : ranges(t)).map((r) => ({ ...r, days: [day] })) };
}

// Courses ranked by how well their name fits an OCR'd one, [cid, 0..1], best first, hopeless fits dropped.
function byName(nameKey, courses) {
  return Object.entries(courses)
    .map(([cid, c]) => { const n = letters(c.name); return [cid, 1 - lev(nameKey, n) / Math.max(nameKey.length, n.length, 1)]; })
    .filter(([, sim]) => sim >= 0.25).sort((a, b) => b[1] - a[1]);
}

function score(g, row) {
  const free = g.meetings.slice();
  let s = 0;
  for (const m of row.meets) {
    const i = free.findIndex((x) => x.start === m.start && x.end === m.end), j = i < 0 ? free.findIndex((x) => x.start === m.start) : i;
    if (j < 0) continue;
    s += i >= 0 ? 10 : 3;
    if (m.days?.includes(free[j].day)) s += 5;
    free.splice(j, 1);
  }
  const gk = KINDS.filter((k) => g.type.includes(k));
  return s - Math.abs(g.meetings.length - row.meets.length) + (row.kinds.length ? row.kinds.filter((k) => gk.includes(k)).length - row.kinds.filter((k) => !gk.includes(k)).length : 0) * 0.5;
}

// Rows -> { found: group ids, unknown: codes with no matching group, ambiguous: rows where two groups fit equally, quality: sum of the fits, weak: matches made on a shaky name (day and times only) }.
// A row with a course code looks only there; a grid block (name only) looks through every course with a similar name, and the meetings decide.
export function matchRows(rows, courses) {
  const found = [], unknown = [];
  const weakIds = [];
  let ambiguous = 0, quality = 0, weak = 0;
  for (const row of rows) {
    const cands = row.cid ? [[row.cid, 1]] : row.cids ? row.cids.map((c) => [c, 0.9]) : row.nameKey ? byName(row.nameKey, courses) : [];
    // a shaky name (<0.45) is trusted only when day and both times fit exactly
    const ranked = cands.flatMap(([cid, sim]) => courses[cid].groups.map((g) => [g, score(g, row), sim])).filter(([, s, sim]) => s >= (sim >= 0.45 ? 3 : 15))
      .map(([g, s, sim]) => [g, s + sim * 8, sim]).sort((a, b) => b[1] - a[1]);
    if (!ranked.length) { if (!unknown.includes(row.code)) unknown.push(row.code); continue; }
    if (ranked[1]?.[1] === ranked[0][1]) ambiguous++;
    quality += ranked[0][1];
    if (ranked[0][2] < 0.45) { weak++; weakIds.push(ranked[0][0].id); }
    if (!found.includes(ranked[0][0].id)) found.push(ranked[0][0].id);
  }
  return { found, unknown, ambiguous, quality, weak, weakIds };
}

// Grid blocks [{ text, day, off, hours }] (offset in hours from the grid's first row, length in hours) -> matchRows' result.
// The first row's hour isn't printed: try each plausible one and keep whichever places the most groups.
export function matchGrid(blocks, courses) {
  let best = null;
  for (const t0 of [8, 7, 9, 10, 11, 12, 6]) {
    const rows = blocks.map((b) => rowFromBlock(b.text, b.day, courses, { start: hhmm((t0 + b.off) * 60), end: hhmm((t0 + b.off + b.hours) * 60 - 10) }));
    const m = matchRows(rows, courses);
    if (!best || m.quality > best.quality) best = m; // exact fits outweigh many loose ones
  }
  return best ?? { found: [], unknown: [], ambiguous: 0, quality: 0, weak: 0, weakIds: [] };
}
