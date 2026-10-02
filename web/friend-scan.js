// Browser side of the picture import: render a PDF page or image to a canvas, OCR it (tesseract.js, Hebrew + English), and turn the text into groups.
// A table slide (course code + days and hours) is read from the text; a weekly-grid slide is cut into colored blocks (friend-blocks.js).
import { loadPdfjs } from './grade-import.js';
import { findBlocks, columnOf, gridHours } from './friend-blocks.js';
import { rowsFromTable, matchRows, matchGrid } from './friend-schedule.js';

const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.esm.min.js'; // ESM build: default export only
const WIDTH = 2880; // small text (8px in a 1045px screenshot) reads well at about 3x

const canvasOf = (w, h) => Object.assign(document.createElement('canvas'), { width: Math.round(w), height: Math.round(h) });

export async function imageCanvas(file) {
  const bmp = await createImageBitmap(file), s = Math.min(3, Math.max(1, WIDTH / bmp.width));
  const c = canvasOf(bmp.width * s, bmp.height * s), x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

// pdf.js 6: destroy lives on the loading task, not the document. `fn(doc)` runs while the document is open.
export async function withPdf(file, fn) {
  const task = (await loadPdfjs()).getDocument({ data: await file.arrayBuffer(), isEvalSupported: false });
  try { return await fn(await task.promise); } finally { task.destroy(); }
}

export async function pageCanvas(doc, n, width) {
  const page = await doc.getPage(n), vp1 = page.getViewport({ scale: 1 }), vp = page.getViewport({ scale: width / vp1.width });
  const c = canvasOf(vp.width, vp.height);
  await page.render({ canvas: c, canvasContext: c.getContext('2d'), viewport: vp }).promise;
  return c;
}
export const bigPage = (doc, n) => pageCanvas(doc, n, WIDTH);

// Blocks of one grid slide with the text inside each (read from a plain crop: names come out well, small times do not, so times come from geometry).
async function gridBlocks(canvas, worker) {
  const { headers, blocks } = findBlocks(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
  const geo = gridHours(blocks, headers);
  if (!geo) return [];
  const out = [];
  for (const [i, b] of blocks.entries()) {
    const col = columnOf(b, headers);
    if (col < 0) continue;
    const { data } = await worker.recognize(canvas, { rectangle: { left: Math.max(0, b.x - 4), top: Math.max(0, b.y - 4), width: b.w + 8, height: b.h + 8 } });
    out.push({ text: data.text, day: col + 1, off: geo.slots[i].off, hours: geo.slots[i].hours });
  }
  return out;
}

// Canvases -> { text, result }: all OCR text (for 9-digit group ids) and the groups found from a table or grid. onProgress(i, n, fraction).
// Tables carry course codes and are exact; grids are only read for slides when no selected slide was a table.
export async function scanCanvases(canvases, courses, onProgress = () => {}) {
  const { createWorker } = (await import(TESSERACT)).default;
  let at = 0;
  const worker = await createWorker('heb+eng', 1, { logger: (m) => { if (m.status === 'recognizing text') onProgress(at, canvases.length, m.progress); } });
  const texts = [], tables = [], loose = [];
  try {
    for (const [i, c] of canvases.entries()) {
      at = i;
      onProgress(i, canvases.length, 0);
      const text = (await worker.recognize(c)).data.text, rows = rowsFromTable(text, courses);
      texts.push(text);
      if (rows.some((r) => r.cid)) tables.push(matchRows(rows, courses)); else loose.push(c);
    }
    if (!tables.length) for (const c of loose) tables.push(matchGrid(await gridBlocks(c, worker), courses));
  } finally { await worker.terminate(); }
  const result = { found: [], unknown: [], ambiguous: 0, weak: 0 };
  for (const r of tables) {
    for (const g of r.found) if (!result.found.includes(g)) result.found.push(g);
    for (const u of r.unknown) if (!result.unknown.includes(u)) result.unknown.push(u);
    result.ambiguous += r.ambiguous;
    result.weak += r.weak;
  }
  return { text: texts.join('\n'), result };
}
