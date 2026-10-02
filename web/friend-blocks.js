// Weekly-grid screenshot -> rectangles: the day header cells and the course blocks, found by color (pure: RGBA in, boxes out).
// A region is a flood fill of similar, saturated pixels; text inside a block only punches holes in it, the bounding box stays whole.
const TOL = 40, MIN_W = 36, MIN_H = 14;

const sat = (d, i) => Math.max(d[i], d[i + 1], d[i + 2]) - Math.min(d[i], d[i + 1], d[i + 2]);
const near = (d, i, c, tol) => Math.abs(d[i] - c[0]) <= tol && Math.abs(d[i + 1] - c[1]) <= tol && Math.abs(d[i + 2] - c[2]) <= tol;

// All colored regions worth a look: [{ x, y, w, h, color }], bigger than a glyph, filled enough not to be a line. `box` limits the search to part of the image.
export function regions(rgba, w, h, box = { x: 0, y: 0, w, h }, tol = TOL) {
  const seen = new Uint8Array(w * h), out = [], bx2 = box.x + box.w, by2 = box.y + box.h;
  for (let y0 = box.y; y0 < by2; y0++) for (let x0 = box.x; x0 < bx2; x0++) {
    const p0 = y0 * w + x0;
    if (seen[p0] || sat(rgba, p0 * 4) < 28) continue;
    const color = [rgba[p0 * 4], rgba[p0 * 4 + 1], rgba[p0 * 4 + 2]], stack = [p0];
    let x1 = x0, x2 = x0, y2 = y0, area = 0;
    seen[p0] = 1;
    while (stack.length) {
      const p = stack.pop(), x = p % w, y = (p - x) / w;
      area++;
      if (x < x1) x1 = x; if (x > x2) x2 = x; if (y > y2) y2 = y;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        const qx = q % w, qy = (q - qx) / w;
        if (q < 0 || q >= w * h || seen[q] || qx < box.x || qx >= bx2 || qy < box.y || qy >= by2 || Math.abs(qx - x) > 1) continue;
        if (near(rgba, q * 4, color, tol)) { seen[q] = 1; stack.push(q); }
      }
    }
    const bw = x2 - x1 + 1, bh = y2 - y0 + 1;
    if (bw >= MIN_W && bh >= MIN_H && area >= 0.35 * bw * bh) out.push({ x: x1, y: y0, w: bw, h: bh, color });
  }
  return out;
}

// The largest set (at least 3) of regions on one row with the same height and nearly the same color: the day header cells. Touching cells need a strict `tol` to come apart.
function headerCells(rgba, w, h, tol) {
  // the title band spans the page; a header cell is a good fraction of it wide and tall (not a glyph)
  const all = regions(rgba, w, h, undefined, tol).filter((r) => r.w < 0.6 * w && r.w >= 0.06 * w && r.h >= 0.04 * h);
  const alike = (a, b) => Math.abs(a.y - b.y) <= 6 && Math.abs(a.h - b.h) <= 6 && a.color.every((c, i) => Math.abs(c - b.color[i]) <= 30);
  return all.map((r) => all.filter((o) => alike(r, o))).filter((g) => g.length >= 3).sort((a, b) => b.length - a.length || a[0].y - b[0].y)[0] ?? [];
}

// The day header cells and the course blocks below them.
export function findBlocks(rgba, w, h) {
  const headers = headerCells(rgba, w, h, TOL).length ? headerCells(rgba, w, h, TOL) : headerCells(rgba, w, h, 12);
  if (!headers.length) return { headers: [], blocks: [] };
  const bottom = Math.max(...headers.map((r) => r.y + r.h)), hh = Math.min(...headers.map((r) => r.h));
  const cols = headers.slice().sort((a, b) => b.x - a.x); // right to left: ראשון first
  // One search per day column, so two same-colored blocks side by side never fuse; a block is at least a third of a header tall.
  const blocks = cols.flatMap((c) => regions(rgba, w, h, { x: c.x + 2, y: bottom + 2, w: c.w - 4, h: h - bottom - 2 }).filter((r) => r.h >= hh / 3 && r.w >= c.w / 2));
  return { headers: cols, blocks: blocks.sort((a, b) => a.y - b.y || b.x - a.x) };
}

// Index (0 = rightmost header) of the header whose column holds the box's center, -1 when none.
export function columnOf(box, headers) {
  const cx = box.x + box.w / 2;
  return headers.findIndex((hd) => cx >= hd.x && cx <= hd.x + hd.w);
}

// Every meeting starts on the hour and lasts 60n-10 minutes, so a block's top sits on an hour line and its height is n*H - H/6.
// Fits the hour height H (px) that makes all blocks fit that lattice; null without blocks. ponytail: assumes the grid's first row starts at the header's bottom.
export function gridHours(blocks, headers) {
  if (!blocks.length || !headers.length) return null;
  const top = Math.max(...headers.map((r) => r.y + r.h)), hh = Math.min(...headers.map((r) => r.h));
  let best = null;
  for (let H = hh * 0.4; H <= hh * 1.3; H += 0.5) {
    let cost = 0;
    for (const b of blocks) {
      const a = (b.y - top) / H, n = (b.h + H / 6) / H;
      cost += (a - Math.round(a)) ** 2 + (n - Math.round(n)) ** 2;
    }
    if (!best || cost < best.cost - 1e-9) best = { H, cost };
  }
  return { H: best.H, top, slots: blocks.map((b) => ({ off: Math.round((b.y - top) / best.H), hours: Math.max(1, Math.round((b.h + best.H / 6) / best.H)) })) };
}
