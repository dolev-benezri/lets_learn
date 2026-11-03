// The advisor summary as a PDF, built in the browser and never sent anywhere: a browser inside a phone app can share a file but cannot print.
// visualRuns, fontPicker and buildAdvisorPdf are pure (node-tested); loadPdfLibs loads the libraries lazily (web/vendor/pdf, see SOURCES.txt there).
const LIB = new URL('./vendor/pdf/', import.meta.url).href;
const WIDTH = 595.28, // A4, in points
  HEIGHT = 841.89,
  MARGIN = 40,
  INDENT = 14,
  LINE = 1.4;
const SIZE = { h2: 17, h3: 12.5, h4: 11, p: 10.5, li: 10.5, course: 10.5, groups: 9.5 };
const BOLD = new Set(['h2', 'h3', 'h4', 'course']);
const UNDRAWN = /[­​-‏‪-‮⁠-⁩﻿]/; // direction marks and the like: bidi reads them, the page shows nothing
const HEBREW = /[֐-׿יִ-ﭏ]/,
  ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/,
  CYRILLIC = /[Ѐ-ԯ]/;

// Which font draws a character, by its script and not only by who holds it: the Hebrew font also holds Latin letters, and a run mixing them comes out in the wrong order.
export const fontPicker = (faces) => (c) => {
  const holds = (k) => (faces[k]?.hasGlyphForCodePoint(c.codePointAt(0)) ? k : null);
  if (HEBREW.test(c)) return holds('he');
  if (ARABIC.test(c)) return holds('ar');
  if (CYRILLIC.test(c)) return holds('cy');
  return holds('la') ?? holds('he') ?? holds('lx');
};

// One line in the order it stands on the page, left to right. Each run has one font and one bidi level; draw is the string for drawText.
// fontkit reverses a Hebrew or Arabic run itself, so such a run is handed over in logical order. line: no surrogate pairs (see clean).
export function visualRuns(line, bidi, keyOf) {
  const levels = bidi.getEmbeddingLevels(line, 'rtl');
  const ch = line.split('');
  bidi.getMirroredCharactersMap(line, levels.levels).forEach((m, i) => {
    ch[i] = m;
  });
  const order = ch.map((_, i) => i);
  for (const [a, b] of bidi.getReorderSegments(line, levels)) order.splice(a, b - a + 1, ...order.slice(a, b + 1).reverse());
  const out = [];
  for (const i of order) {
    if (UNDRAWN.test(ch[i])) continue;
    const prev = out.at(-1),
      level = levels.levels[i];
    const font = ch[i] === ' ' && prev?.level === level ? prev.font : (keyOf(ch[i]) ?? 'la');
    if (prev?.font === font && prev.level === level) prev.draw += ch[i];
    else out.push({ font, level, draw: ch[i] });
  }
  for (const r of out) if (r.level % 2 && (HEBREW.test(r.draw) || ARABIC.test(r.draw))) r.draw = [...r.draw].reverse().join('');
  return out;
}

// Characters no font holds (an emoji) are left out and reported. This also keeps surrogate pairs out of the bidi step, which counts UTF-16 units.
const clean = (t, keyOf, dropped) =>
  Array.from(String(t).replace(/\s+/g, ' ').trim())
    .filter((c) => {
      if (UNDRAWN.test(c) || keyOf(c)) return true;
      dropped.add(c);
      return false;
    })
    .join('')
    .trim();

const rowsOf = (blocks) =>
  blocks.flatMap((b) =>
    b.k === 'course'
      ? [{ k: 'course', t: `${b.name} (${b.credits} נ״ז)` }, ...(b.groups.length ? [{ k: 'groups', t: b.groups.join('; ') }] : [])]
      : [b]
  );

// blocks: advisorBlocks. libs: loadPdfLibs (a test passes the same files read from disk). Returns the file and any characters it left out.
export async function buildAdvisorPdf(blocks, { PDFDocument, rgb, fontkit, bidi, fontBytes }) {
  const rows = rowsOf(blocks),
    all = rows.map((r) => r.t).join(' ');
  const load = async (name) => {
    const bytes = await fontBytes(name);
    return { bytes, face: fontkit.create(new Uint8Array(bytes)) };
  };
  const files = { he: await load('hebrew-400'), la: await load('latin-400') };
  // Only what the text needs: these exist for a name in another script, and most summaries never fetch them.
  if (ARABIC.test(all)) files.ar = await load('arabic-400');
  if (CYRILLIC.test(all)) files.cy = await load('cyrillic-400');
  const plain = fontPicker({ he: files.he.face, la: files.la.face, ar: { hasGlyphForCodePoint: () => true }, cy: { hasGlyphForCodePoint: () => true } });
  if (Array.from(all).some((c) => !UNDRAWN.test(c) && !plain(c))) files.lx = await load('latin-ext-400');
  const keyOf = fontPicker(Object.fromEntries(Object.entries(files).map(([k, f]) => [k, f.face])));

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle('סיכום לפגישה עם יועץ לימודים');
  doc.setLanguage('he');
  const embed = (bytes) => doc.embedFont(bytes, { subset: true });
  const regular = {},
    bold = {};
  for (const [k, f] of Object.entries(files)) regular[k] = bold[k] = await embed(f.bytes);
  bold.he = await embed(await fontBytes('hebrew-700'));
  bold.la = await embed(await fontBytes('latin-700'));

  const widthOf = (runs, fonts, size) => runs.reduce((a, r) => a + fonts[r.font].widthOfTextAtSize(r.draw, size), 0);
  const fits = (t, fonts, size, max) => widthOf(visualRuns(t, bidi, keyOf), fonts, size) <= max;
  const wrap = (t, fonts, size, max) => {
    const lines = [];
    let cur = '';
    for (let word of t.split(' ')) {
      const next = cur ? `${cur} ${word}` : word;
      if (fits(next, fonts, size, max)) {
        cur = next;
        continue;
      }
      if (cur) lines.push(cur);
      cur = '';
      // a word wider than the line is cut: nothing may run off the page
      while (!fits(word, fonts, size, max)) {
        let n = word.length - 1;
        while (n > 1 && !fits(word.slice(0, n), fonts, size, max)) n--;
        lines.push(word.slice(0, n));
        word = word.slice(n);
      }
      cur = word;
    }
    if (cur) lines.push(cur);
    return lines;
  };

  const dropped = new Set();
  let page = doc.addPage([WIDTH, HEIGHT]),
    y = HEIGHT - MARGIN;
  const room = (h) => {
    if (y - h >= MARGIN) return;
    page = doc.addPage([WIDTH, HEIGHT]);
    y = HEIGHT - MARGIN;
  };
  const color = rgb(0, 0, 0);
  for (const row of rows) {
    const t = clean(row.t, keyOf, dropped);
    if (!t || /:$/.test(t)) continue; // a name of nothing but emoji leaves no value to show
    const size = SIZE[row.k],
      fonts = BOLD.has(row.k) ? bold : regular,
      item = row.k === 'li' || row.k === 'course',
      indent = item || row.k === 'groups' ? INDENT : 0;
    if (row.k === 'h3') y -= 7;
    if (row.k === 'h4') y -= 4;
    if (row.k === 'h2' || row.k === 'h3' || row.k === 'h4') room(size * LINE + 2 * SIZE.li * LINE); // a heading stays with what follows it
    wrap(t, fonts, size, WIDTH - 2 * MARGIN - indent).forEach((line, n) => {
      room(size * LINE);
      const runs = visualRuns(line, bidi, keyOf);
      let x = WIDTH - MARGIN - indent - widthOf(runs, fonts, size);
      for (const r of runs) {
        page.drawText(r.draw, { x, y: y - size, size, font: fonts[r.font], color });
        x += fonts[r.font].widthOfTextAtSize(r.draw, size);
      }
      if (item && n === 0) page.drawText('•', { x: WIDTH - MARGIN - 7, y: y - size, size, font: regular.la, color });
      y -= size * LINE;
    });
    if (row.k === 'h3') {
      page.drawLine({ start: { x: MARGIN, y: y + 1 }, end: { x: WIDTH - MARGIN, y: y + 1 }, thickness: 0.6, color });
      y -= 3;
    }
  }
  return { bytes: await doc.save(), dropped: [...dropped] };
}

const loadScript = (src) =>
  new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = ok;
    s.onerror = () => no(new Error(`could not load ${src}`));
    document.head.append(s);
  });

let loading = null;
export function loadPdfLibs() {
  loading ??= (async () => {
    const [{ PDFDocument, rgb }, { default: bidiFactory }] = await Promise.all([
      import(`${LIB}pdf-lib.esm.min.js`),
      import(`${LIB}bidi.min.mjs`),
      loadScript(`${LIB}fontkit.umd.min.js`) // a UMD file: its ES build imports a bare module name a browser cannot resolve
    ]);
    const fontBytes = async (name) => {
      const r = await fetch(`${LIB}rubik-${name}-normal.woff`);
      if (!r.ok) throw new Error(`font ${name}: ${r.status}`);
      return r.arrayBuffer();
    };
    return { PDFDocument, rgb, fontkit: window.fontkit, bidi: bidiFactory(), fontBytes };
  })().catch((e) => {
    loading = null; // a poor signal now must not rule out the next try
    throw e;
  });
  return loading;
}
