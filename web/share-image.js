// The week as an image to send (edit mode, design A): a pure layout (shareModel, measured with any text-width function so node tests run
// it), drawn on a canvas by drawShare. The image is always light, 1080px wide, in the page's font (Rubik).
import { typeLabel, laneMap, DAY_FULL } from './ui-grid.js';
import { groupNumber } from './ui-text.js';
import { semName } from './advisor.js';

const W = 1080, PAGE = 36, CARD = 36, HOUR = 104, HOURS_W = 76, COL_GAP = 8, LANE_GAP = 4, GAP = 4, PAD = 10, BAR = 8;
const LH = { name: 28, meta: 26, time: 26, ghost: 26 };
export const FONTS = {
  title: '800 52px Rubik', sub: '400 30px Rubik', legend: '400 24px Rubik', day: '700 30px Rubik', hour: '400 22px Rubik',
  name: '700 24px Rubik', meta: '400 21px Rubik', time: '400 21px Rubik', ghost: '400 21px Rubik', footer: '400 24px Rubik'
};
const toMin = (t) => {
  const [h, m] = t.split(':');
  return Number(h) * 60 + Number(m);
};

export function headerLabel({ index, count, pending }) {
  if (index > 0) return `הצעה ${index} מתוך ${count}`;
  return pending ? 'שינויים שעוד לא נשמרו' : 'המערכת הנוכחית';
}

// Word wrap into at most maxLines lines of maxWidth; a cut text, or a word wider than a line, ends there with "…" and still fits.
export function fitLines(text, maxWidth, maxLines, measure) {
  const words = String(text).split(/\s+/).filter(Boolean), lines = [];
  let cur = '', cut = false;
  for (const [i, w] of words.entries()) {
    const next = cur ? `${cur} ${w}` : w;
    if (measure(next) <= maxWidth) {
      cur = next;
      continue;
    }
    if (!cur || measure(w) > maxWidth) {
      // a word wider than the line: the line ends with it, cut
      cur = next;
      cut = true;
      break;
    }
    lines.push(cur);
    cur = w;
    if (lines.length === maxLines) {
      cut = true;
      cur = '';
      break;
    }
    if (i === words.length - 1) break;
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) (lines.length = maxLines), (cut = true);
  if (!cut || !lines.length) return lines;
  let last = lines.at(-1);
  while (last && measure(`${last}…`) > maxWidth) last = last.slice(0, -1).trimEnd();
  lines[lines.length - 1] = `${last}…`;
  return lines;
}

// A lesson's lines in its block: the name (up to 3 lines), "{type} · קב׳ {number}", the hours. When the block is too short: the hours go,
// then the name keeps 1 line, then the group line keeps 1, then it goes; the name always stays. Hours wider than the block go too.
function lessonText(l, w, h, measure) {
  const inner = w - 2 * PAD - BAR, room = h - 2 * 8;
  const type = typeLabel(l.type), metaText = l.group ? `${type} · קב׳ ${groupNumber(l.group)}` : type;
  const fit = (t, n, font) => fitLines(t, inner, n, (s) => measure(s, font));
  let name = fit(l.name || l.course, 3, FONTS.name), meta = fit(metaText, 2, FONTS.meta);
  let time = `${l.start}–${l.end}`;
  if (measure(time, FONTS.time) > inner) time = null;
  const need = () => name.length * LH.name + meta.length * LH.meta + (time ? LH.time : 0);
  if (need() > room) time = null;
  if (need() > room) name = fit(l.name || l.course, 1, FONTS.name);
  if (need() > room) meta = fit(metaText, 1, FONTS.meta);
  if (need() > room) meta = [];
  return { name, meta, time };
}

// An old place (no colour bar): "היה כאן" and the course name; room for one line only: the name (the legend says what dashed means).
function ghostText(g, w, h, measure) {
  const lines = Math.floor((h - 2 * 8) / LH.ghost), fit = (n) => fitLines(g.name, w - 2 * PAD, n, (s) => measure(s, FONTS.ghost));
  return { name: lines >= 2 ? ['היה כאן', ...fit(Math.min(2, lines - 1))] : fit(1), meta: [], time: null };
}

// input: { name, semester, label, link, range: { from, to, days }, lessons: [{ course, name, type, group, day, start, end, color, changed }],
// ghosts: [{ course, name, day, start, end, color }] }; measure(text, font) -> width in px.
export function shareModel(input, measure) {
  const { range, lessons, ghosts } = input;
  const legend = lessons.some((l) => l.changed) || ghosts.length > 0;
  const left = PAGE + CARD, right = W - PAGE - CARD;
  const pos = { left, right, title: PAGE + CARD, sub: PAGE + CARD + 66 };
  pos.legend = legend ? pos.sub + 48 : null;
  pos.days = (legend ? pos.legend : pos.sub) + 52;
  const grid = { top: pos.days + 60, hour: HOUR };
  const span = (range.to - range.from) * HOUR, colsRight = right - HOURS_W - COL_GAP;
  const colW = (colsRight - left - (range.days - 1) * COL_GAP) / range.days;
  const cols = Array.from({ length: range.days }, (_, i) => ({ day: i + 1, label: DAY_FULL[i + 1], x: colsRight - (i + 1) * colW - i * COL_GAP, w: colW }));
  const hours = Array.from({ length: range.to - range.from }, (_, i) => ({ text: `${String(range.from + i).padStart(2, '0')}:00`, y: grid.top + i * HOUR }));
  // lessons and old places that share time in a day: lanes side by side, the first lane on the right
  const all = [...lessons.map((l, i) => ({ kind: 'lesson', key: `l${i}`, src: l })), ...ghosts.map((g, i) => ({ kind: 'ghost', key: `g${i}`, src: g }))]
    .filter((x) => x.src.day >= 1 && x.src.day <= range.days);
  const lanes = new Map();
  for (const col of cols)
    for (const [k, v] of laneMap(all.filter((x) => x.src.day === col.day).map((x) => ({ key: x.key, start: toMin(x.src.start), end: toMin(x.src.end) }))))
      lanes.set(k, v);
  const items = all.map(({ kind, key, src }) => {
    const col = cols[src.day - 1], lane = lanes.get(key) ?? { l: 0, n: 1 };
    const w = (col.w - (lane.n - 1) * LANE_GAP) / lane.n, x = col.x + col.w - (lane.l + 1) * w - lane.l * LANE_GAP;
    const y = grid.top + ((toMin(src.start) - range.from * 60) / 60) * HOUR, h = ((toMin(src.end) - toMin(src.start)) / 60) * HOUR - GAP;
    const text = kind === 'lesson' ? lessonText(src, w, h, measure) : ghostText(src, w, h, measure);
    return { kind, x, y, w, h, color: src.color, changed: kind === 'lesson' && !!src.changed, ...text };
  });
  pos.footer = grid.top + span + 30;
  return {
    width: W,
    height: pos.footer + 56 + CARD + PAGE,
    title: fitLines(input.name ? `המערכת של ${input.name}` : 'המערכת שלי', right - left, 1, (s) => measure(s, FONTS.title))[0],
    sub: `${semName(input.semester)} · ${input.label}`,
    legend, pos, grid, cols, hours, items,
    footer: { right: 'נבנתה במתכנן המערכת · אפקה', left: input.link ? 'הקישור בהודעה' : '' }
  };
}
