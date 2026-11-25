// The week as an image to send (edit mode, design A): a pure layout (shareModel, measured with any text-width function so node tests run
// it), drawn on a canvas by drawShare. The image is always light, 1080px wide, in the page's font (Rubik).
import { typeLabel, laneMap, DAY_FULL } from './ui-grid.js';
import { groupNumber } from './ui-text.js';
import { semName } from './advisor.js';

const W = 1080, PAGE = 36, CARD = 36, HOUR = 104, HOURS_W = 76, COL_GAP = 8, LANE_GAP = 4, GAP = 4, PAD = 10, BAR = 8;
const LH = { name: 28, meta: 26, time: 26, ghost: 26 };
// All weight 400: WebKit (iPhone) draws a variable font on a canvas at its default weight whatever the font asks for, with the bold
// advances, so bold letters came out thin and spaced. Bold is a stroke of the text's own colour instead, its width in BOLD (px).
export const FONTS = {
  title: '400 52px Rubik', sub: '400 30px Rubik', legend: '400 24px Rubik', day: '400 30px Rubik', hour: '400 22px Rubik',
  name: '400 24px Rubik', meta: '400 21px Rubik', time: '400 21px Rubik', ghost: '400 21px Rubik', footer: '400 24px Rubik'
};
export const BOLD = { title: 2.4, day: 1.4, name: 1.2 }; // by role (text is measured and drawn by role): several roles share a font string
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
  const words = String(text).split(/[ \t\n]+/).filter(Boolean), lines = []; // not \s: a no-break space keeps its words together
  let cur = '', cut = false;
  for (const [i, w] of words.entries()) {
    const next = cur ? `${cur} ${w}` : w;
    if (measure(next) <= maxWidth) {
      cur = next;
      continue;
    }
    if (measure(w) > maxWidth) {
      // a word wider than any line: on a line of its own while one is left, cut there
      if (cur && lines.length + 1 < maxLines) lines.push(cur), (cur = w);
      else cur = next;
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

// A lesson's lines in its block: the name (up to 3 lines); "{type} · קב׳ {number}" on one line, or the type and "קב׳ {number}" on two;
// the hours. When the block is too short: the hours go, then the name keeps 1 line, then only "קב׳ {number}" stays of the type and
// group (the number is what a friend needs), then that goes; the name always stays. Hours wider than the block go too.
function lessonText(l, w, h, measure) {
  const inner = w - 2 * PAD - BAR, room = h - 2 * 8;
  const fit = (t, n, role) => fitLines(t, inner, n, (s) => measure(s, role));
  const type = typeLabel(l.type), group = l.group ? `קב׳\u00a0${groupNumber(l.group)}` : null; // a no-break space: the number stays with קב׳
  const both = group && `${type} · ${group}`;
  let name = fit(l.name || l.course, 3, 'name');
  let meta = !group ? fit(type, 1, 'meta') : measure(both, 'meta') <= inner ? [both] : [...fit(type, 1, 'meta'), ...fit(group, 1, 'meta')];
  let time = `${l.start}–${l.end}`;
  if (measure(time, 'time') > inner) time = null;
  const need = () => name.length * LH.name + meta.length * LH.meta + (time ? LH.time : 0);
  if (need() > room) time = null;
  if (need() > room) name = fit(l.name || l.course, 1, 'name');
  if (need() > room && meta.length > 1) meta = fit(group, 1, 'meta');
  if (need() > room) meta = [];
  return { name, meta, time };
}

// An old place (no colour bar): "היה כאן" and the course name; room for one line only: the name (the legend says what dashed means).
function ghostText(g, w, h, measure) {
  const lines = Math.floor((h - 2 * 8) / LH.ghost), fit = (n) => fitLines(g.name, w - 2 * PAD, n, (s) => measure(s, 'ghost'));
  return { name: lines >= 2 ? ['היה כאן', ...fit(Math.min(2, lines - 1))] : fit(1), meta: [], time: null };
}

// measure(text, role) -> width in px, role a key of FONTS.
// input: { name, semester, label, link, range: { from, to, days }, lessons: [{ course, name, type, group, day, start, end, color, changed }],
// ghosts: [{ course, name, day, start, end, color }] };
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
    title: fitLines(input.name ? `המערכת של ${input.name}` : 'המערכת שלי', right - left, 1, (s) => measure(s, 'title'))[0],
    sub: `${semName(input.semester)} · ${input.label}`,
    legend, pos, grid, cols, hours, items,
    footer: { right: 'נבנתה במתכנן המערכת · אפקה', left: input.link ? 'הקישור בהודעה' : '' }
  };
}

// ---------- drawing (always light: the design A light tokens, the course colours c0-c7 light values) ----------
const COURSE = [
  ['#E6EEFB', '#2962C2'], ['#F9E6EF', '#B8286F'], ['#E2F1EC', '#0A734F'], ['#F9EFE1', '#945A06'],
  ['#EFE9FA', '#7A45D6'], ['#E2F1F5', '#086D87'], ['#FAE7E6', '#B93427'], ['#EBF2E2', '#476F0B']
];
const INK = {
  page: '#E9EDF1', card: '#FFFFFF', border: '#CFD7DF', line: '#EEF1F4', text: '#121820', text2: '#4D5A68', text3: '#56616F',
  primary: '#0A6B66', green: '#1D7A3E', dash: '#737F8C'
};

function box(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h); // Safari before 16: square corners rather than a throw in the tap
}
function text(ctx, s, x, y, role, color, { align = 'right', dir = 'rtl', base = 'top' } = {}) {
  Object.assign(ctx, { font: FONTS[role], fillStyle: color, textAlign: align, direction: dir, textBaseline: base });
  ctx.fillText(s, x, y);
  if (BOLD[role]) {
    Object.assign(ctx, { strokeStyle: color, lineWidth: BOLD[role], lineJoin: 'round' });
    ctx.strokeText(s, x, y);
  }
}

function drawItem(ctx, it) {
  const [bg, fg] = COURSE[it.color] ?? COURSE[7];
  ctx.save();
  box(ctx, it.x, it.y, it.w, it.h, 14);
  if (it.kind === 'ghost') {
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.fill();
    Object.assign(ctx, { strokeStyle: fg, lineWidth: 3 });
    ctx.setLineDash([10, 8]);
    box(ctx, it.x + 1.5, it.y + 1.5, it.w - 3, it.h - 3, 13);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    ctx.fillStyle = bg;
    ctx.fill();
  }
  box(ctx, it.x, it.y, it.w, it.h, 14);
  ctx.clip(); // nothing is drawn outside its block, however short
  const tx = it.x + it.w - PAD - (it.kind === 'lesson' ? BAR : 0);
  let ty = it.y + 8;
  if (it.kind === 'lesson') {
    ctx.fillStyle = fg;
    ctx.fillRect(it.x + it.w - BAR, it.y, BAR, it.h);
    for (const l of it.name) text(ctx, l, tx, ty, 'name', fg), (ty += LH.name);
    for (const l of it.meta) text(ctx, l, tx, ty, 'meta', INK.text), (ty += LH.meta);
    if (it.time) text(ctx, it.time, tx, ty, 'time', INK.text, { dir: 'ltr' });
    if (it.changed) {
      Object.assign(ctx, { strokeStyle: INK.green, lineWidth: 4 });
      box(ctx, it.x + 2, it.y + 2, it.w - 4, it.h - 4, 12);
      ctx.stroke();
    }
  } else {
    it.name.forEach((l, i) => text(ctx, l, tx, ty + i * LH.ghost, 'ghost', i === 0 && it.name.length > 1 ? INK.text2 : fg));
  }
  ctx.restore();
}

export function drawShare(ctx, m) {
  const { pos } = m;
  ctx.fillStyle = INK.page;
  ctx.fillRect(0, 0, m.width, m.height);
  box(ctx, PAGE, PAGE, m.width - 2 * PAGE, m.height - 2 * PAGE, 28);
  Object.assign(ctx, { fillStyle: INK.card, strokeStyle: INK.border, lineWidth: 2 });
  ctx.fill();
  ctx.stroke();
  text(ctx, m.title, pos.right, pos.title, 'title', INK.text);
  text(ctx, m.sub, pos.right, pos.sub, 'sub', INK.text2);
  if (m.legend) {
    // right to left: a dashed box "היה כאן", then a green box "מקום חדש"
    let x = pos.right;
    for (const [label, draw] of [
      ['היה כאן', () => (ctx.setLineDash([6, 4]), Object.assign(ctx, { strokeStyle: INK.dash, lineWidth: 3 }), ctx.stroke(), ctx.setLineDash([]))],
      ['מקום חדש', () => (Object.assign(ctx, { fillStyle: COURSE[0][0], strokeStyle: INK.green, lineWidth: 4 }), ctx.fill(), ctx.stroke())]
    ]) {
      box(ctx, x - 34, pos.legend + 2, 34, 24, 6);
      draw();
      text(ctx, label, x - 44, pos.legend, 'legend', INK.text2);
      ctx.font = FONTS.legend;
      x -= 44 + ctx.measureText(label).width + 28;
    }
  }
  const gridLeft = Math.min(...m.cols.map((c) => c.x)), gridRight = Math.max(...m.cols.map((c) => c.x + c.w));
  for (const c of m.cols) {
    text(ctx, c.label, c.x + c.w / 2, pos.days, 'day', INK.text, { align: 'center' });
    ctx.fillStyle = INK.border;
    ctx.fillRect(c.x, pos.days + 46, c.w, 2);
  }
  for (const h of m.hours) {
    ctx.fillStyle = INK.line;
    ctx.fillRect(gridLeft, h.y, gridRight - gridLeft, 2);
    text(ctx, h.text, pos.right, h.y, 'hour', INK.text3, { base: 'middle', dir: 'ltr' });
  }
  for (const it of m.items) drawItem(ctx, it);
  ctx.fillStyle = INK.page;
  ctx.fillRect(pos.left, pos.footer, pos.right - pos.left, 2);
  text(ctx, m.footer.right, pos.right, pos.footer + 18, 'footer', INK.primary);
  if (m.footer.left) text(ctx, m.footer.left, pos.left, pos.footer + 18, 'footer', INK.text3, { align: 'left' });
}

const SAMPLE = 'אב 09:00';
export const fontsReady = (doc = document) => [FONTS.name, FONTS.meta].every((f) => doc.fonts.check(f, SAMPLE));

// The PNG to send, made synchronously (an iPhone opens the share sheet only from the tap itself: no await before navigator.share).
export function shareImageFile(input, doc = document) {
  const canvas = doc.createElement('canvas'), ctx = canvas.getContext('2d');
  const model = shareModel(input, (s, r) => ((ctx.font = FONTS[r]), ctx.measureText(s).width + (BOLD[r] ?? 0)));
  canvas.width = model.width;
  canvas.height = Math.ceil(model.height); // resizing resets the context: the drawing sets every font and colour it uses
  drawShare(ctx, model);
  const bytes = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), (c) => c.charCodeAt(0));
  return new File([bytes], 'afeka-schedule.png', { type: 'image/png' });
}
