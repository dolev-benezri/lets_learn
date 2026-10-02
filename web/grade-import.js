// Reads the Afeka portal grade sheet (PDF) into per-course results. The file never leaves the device: pdf.js runs in the page.
// rowsFromItems / parseGradeSheet are pure (node-tested); readGradeSheet is the only part that touches the network (pdf.js CDN, lazily).
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.3.289/';
const BIDI = /[‎‏‪-‮⁦-⁩]/g; // direction marks the portal wraps around tokens
const MAX_BYTES = 5 * 1024 * 1024, MAX_PAGES = 10, ROW_TOL = 5; // rows sit ~15pt apart; the failure `*` is drawn ~3.5pt below its row

export async function loadPdfjs() {
  const pdfjs = await import(`${PDFJS}pdf.min.mjs`);
  pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS}pdf.worker.min.mjs`;
  return pdfjs;
}

// pdf.js-like items [{str, x, y, page}] -> rows of strings in reading order (right to left: x descending). A row = items within ROW_TOL of the same y.
export function rowsFromItems(items) {
  const its = items.map((i) => ({ ...i, str: String(i.str ?? '').replace(BIDI, '').trim() })).filter((i) => i.str)
    .sort((a, b) => a.page - b.page || b.y - a.y);
  const rows = [];
  let cur = null;
  for (const it of its) {
    if (cur && cur.page === it.page && Math.abs(cur.y - it.y) <= ROW_TOL) cur.items.push(it);
    else rows.push(cur = { page: it.page, y: it.y, items: [it] });
  }
  return rows.map((r) => r.items.sort((a, b) => b.x - a.x).map((i) => i.str));
}

const RANK = { passed: 3, exempt: 2, failed: 1, pending: 0 };
const DEC = /^\d+\.\d+$/, INT = /^\d{1,3}$/;
// One row -> {id, grade, result} or null. Real sheet, read right to left: year/sem, code, name, lecturer, ש"ס, נ"ז, grade, with the failure `*`
// rightmost. The grade is the token just after the decimal run (falling back to just before it), so digits inside a course name are never a grade.
const CODE = (data) => (x) => /^\d{4,5}$/.test(x) && !!data.courses[x];
function parseRow(row, data) {
  let t = row.join(' ').split(/\s+/);
  let c = t.findIndex(CODE(data)), d = t.findIndex((x) => DEC.test(x));
  if (c < 0 || d < 0) return null;
  if (c > d) { t = t.reverse(); c = t.findIndex(CODE(data)); d = t.findIndex((x) => DEC.test(x)); } // sheet read left to right
  if (t.includes('טרם')) return null;
  let e = d;
  while (DEC.test(t[e + 1] ?? '')) e++;
  const slot = [t[e + 1], d - 1 > c ? t[d - 1] : undefined].find((x) => x && (INT.test(x) && +x <= 100 || /^(פ\.?פנימ|פטור|חייב)$/.test(x))) ?? '';
  const id = t[c], grade = INT.test(slot) ? +slot : null;
  if (t.includes('*')) return { id, grade, result: 'failed' };
  if (grade !== null) return { id, grade, result: 'passed' };
  if (slot !== 'חייב' && slot) return { id, grade: null, result: 'exempt' };
  if (slot === 'חייב') return { id, grade: null, result: 'pending' };
  return null;
}

// rows (from rowsFromItems) -> one result per known course: passed > exempt > failed > pending; the highest passing grade wins.
export function parseGradeSheet(rows, data) {
  const out = new Map();
  for (const row of rows) {
    const r = parseRow(row, data);
    const p = r && out.get(r.id);
    if (r && (!p || RANK[r.result] > RANK[p.result] || (r.result === 'passed' && p.result === 'passed' && r.grade > p.grade))) out.set(r.id, r);
  }
  return [...out.values()];
}

const fail = (msg) => Object.assign(new Error(msg), { user: true });
// File -> rows. Throws an Error with a user-facing Hebrew message (`user: true`) for limits; pdf.js failures read as "not a readable sheet".
export async function readGradeSheet(file) {
  if (file.size > MAX_BYTES) throw fail('הקובץ גדול מדי (עד 5MB).');
  let task;
  try {
    task = (await loadPdfjs()).getDocument({ data: await file.arrayBuffer(), isEvalSupported: false });
    const doc = await task.promise;
    if (doc.numPages > MAX_PAGES) throw fail('הקובץ ארוך מדי (עד 10 עמודים).');
    const items = [];
    for (let p = 1; p <= doc.numPages; p++) for (const i of (await (await doc.getPage(p)).getTextContent()).items) if (i.str) items.push({ str: i.str, x: i.transform[4], y: i.transform[5], page: p });
    return rowsFromItems(items);
  } catch (e) {
    throw e.user ? e : fail('לא הצלחנו לקרוא את הקובץ. האם זה PDF של גליון הציונים?');
  } finally { task?.destroy(); }
}
