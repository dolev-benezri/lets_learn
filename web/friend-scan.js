// Browser side of the picture import: render a PDF page or image to a canvas, OCR it (tesseract.js, Hebrew + English), and turn the text into groups.
// A table slide (course code + days and hours) is read from the text; a weekly-grid slide is cut into colored blocks (friend-blocks.js).
import { loadPdfjs, pdfStep } from './grade-import.js';
import { findBlocks, columnOf, gridHours } from './friend-blocks.js';
import { rowsFromTable, rowsFromWords, matchRows, matchGrid, mergeScans } from './friend-schedule.js';

// tesseract.js 7.0.0 from web/vendor/tesseract/ (SOURCES.txt there). The ESM build has a default export only. The worker, core and language data are
// absolute URLs so the blob worker can load them; the worker picks the core file for this browser (SIMD or not) inside corePath.
const VENDOR = new URL('vendor/tesseract/', import.meta.url).href;
const TESSERACT = `${VENDOR}tesseract.esm.min.js`;
const OCR_PATHS = { workerPath: `${VENDOR}worker.min.js`, corePath: `${VENDOR}core`, langPath: `${VENDOR}lang` };
const WIDTH = 2880; // small text (8px in a 1045px screenshot) reads well at about 3x

const canvasOf = (w, h) =>
  Object.assign(document.createElement('canvas'), { width: Math.round(w), height: Math.round(h) });

export async function imageCanvas(file) {
  const bmp = await createImageBitmap(file),
    s = Math.min(3, Math.max(1, WIDTH / bmp.width));
  const c = canvasOf(bmp.width * s, bmp.height * s),
    x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close();
  return c;
}

export async function pageCanvas(doc, n, width) {
  const page = await pdfStep(doc.getPage(n)),
    vp1 = page.getViewport({ scale: 1 }),
    vp = page.getViewport({ scale: width / vp1.width });
  const c = canvasOf(vp.width, vp.height);
  await pdfStep(page.render({ canvas: c, canvasContext: c.getContext('2d'), viewport: vp }).promise);
  return c;
}
// A scanned slide is one picture: draw that, upscaled and smoothed. Letting pdf.js resample the page instead blurs small digits (course codes lose a digit).
export async function bigPage(doc, n) {
  const page = await pdfStep(doc.getPage(n)),
    { OPS } = await loadPdfjs(),
    ops = await pdfStep(page.getOperatorList());
  const ids = ops.fnArray.flatMap((fn, i) => (fn === OPS.paintImageXObject ? [ops.argsArray[i][0]] : []));
  const img =
    ids.length === 1
      ? await Promise.race([new Promise((r) => page.objs.get(ids[0], r)), new Promise((r) => setTimeout(r, 3000))])
      : null;
  if (!img?.bitmap) return pageCanvas(doc, n, WIDTH);
  const s = Math.min(3, Math.max(1, WIDTH / img.width)),
    c = canvasOf(img.width * s, img.height * s),
    x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(img.bitmap, 0, 0, c.width, c.height);
  return c;
}

// Blocks of one grid slide with the text inside each (read from a plain crop: names come out well, small times do not, so times come from geometry).
async function gridBlocks(canvas, worker) {
  const { headers, blocks } = findBlocks(
    canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data,
    canvas.width,
    canvas.height
  );
  const geo = gridHours(blocks, headers);
  if (!geo) return [];
  const out = [];
  for (const [i, b] of blocks.entries()) {
    const col = columnOf(b, headers);
    if (col < 0) continue;
    const { data } = await worker.recognize(canvas, {
      rectangle: { left: Math.max(0, b.x - 4), top: Math.max(0, b.y - 4), width: b.w + 8, height: b.h + 8 }
    });
    out.push({ text: data.text, day: col + 1, off: geo.slots[i].off, hours: geo.slots[i].hours });
  }
  return out;
}

const wordsOf = (blocks) =>
  (blocks ?? []).flatMap((b) =>
    b.paragraphs.flatMap((p) =>
      p.lines.flatMap((l) =>
        l.words.map((w) => ({ t: w.text, x0: w.bbox.x0, x1: w.bbox.x1, y0: w.bbox.y0, y1: w.bbox.y1 }))
      )
    )
  );

// Canvases -> { text, result }: all OCR text (for 9-digit group ids) and the groups found from a table or grid. onProgress(i, n, fraction).
// A table is exact (course codes); a grid fills in what the tables missed, but only with matches whose name was readable.
export async function scanCanvases(canvases, courses, onProgress = () => {}) {
  const { createWorker } = (await import(TESSERACT)).default;
  let at = 0;
  const worker = await createWorker('heb+eng', 1, {
    ...OCR_PATHS,
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress(at, canvases.length, m.progress);
    }
  });
  const texts = [],
    tables = [],
    grids = [];
  try {
    for (const [i, c] of canvases.entries()) {
      at = i;
      onProgress(i, canvases.length, 0);
      const { data } = await worker.recognize(c, {}, { blocks: true }),
        rows = rowsFromWords(wordsOf(data.blocks), courses) ?? rowsFromTable(data.text, courses);
      texts.push(data.text);
      if (rows.some((r) => r.cid || r.cids)) tables.push(matchRows(rows, courses));
      else grids.push(matchGrid(await gridBlocks(c, worker), courses));
    }
  } finally {
    await worker.terminate();
  }
  return { text: texts.join('\n'), result: mergeScans(tables, grids, courses) };
}
