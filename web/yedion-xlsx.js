// The yedion's own timetable export (.xlsx): a week grid, one cell per hour. A lesson's first cell reads
// "CODE-NAME TYPE<tab>LECTURER ROOM BUILDING HH:MM-HH:MM", the cells under it "המשך<tab>NAME". Nothing is OCR'd: every lesson is
// read as printed, so a known code is exact. The file's properties (docProps) carry the student's ID number: they are never read.
import { unzipSync, strFromU8 } from './vendor/fflate/fflate.js';

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי']; // index + 1 = meeting.day
const KIND = '(?:הרצאה|תרגול|מעבדה)';
const TYPE = new RegExp(`^(?:סופי-)?${KIND}(?:\\+${KIND})*$`);
const TIME = /(?<!\d)([01]?\d|2[0-3]):([0-5]\d)\s*-\s*([01]?\d|2[0-3]):([0-5]\d)(?!\d)/g;
const PARTS = /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/;
const MAX_FILE = 2 << 20, MAX_PART = 8 << 20; // the export is a few KB; a zip claiming more is not one, and unzip would allocate it

const tooBig = () => Object.assign(new Error('הקובץ גדול מדי לקובץ מערכת'), { user: true });
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unxml = (s) =>
  s.replace(/&(?:(amp|lt|gt|quot|apos)|#(\d+)|#x([0-9a-f]+));/gi, (_, n, d, h) => (n ? ENT[n] : String.fromCodePoint(d ? +d : parseInt(h, 16))));
// every <t> run of a string item (rich text has several), phonetic hints left out
const texts = (xml) =>
  unxml([...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map((m) => m[1]).join(''));
const attr = (tag, name) => tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
const tags = (xml, name) => [...(xml ?? '').matchAll(new RegExp(`<${name}\\b[^>]*>`, 'g'))].map((m) => m[0]);
const hhmm = (h, m) => `${String(h).padStart(2, '0')}:${m}`;

// The timetable's sheet: the one named FileFromYedion, else the first, through the workbook's relationships (not the zip's order).
function sheetPath(files) {
  const sheets = tags(files['xl/workbook.xml'], 'sheet');
  const s = sheets.find((t) => unxml(attr(t, 'name') ?? '') === 'FileFromYedion') ?? sheets[0];
  const rel = s && tags(files['xl/_rels/workbook.xml.rels'], 'Relationship').find((t) => attr(t, 'Id') === attr(s, 'r:id'));
  const target = rel && attr(rel, 'Target');
  return target && (target.startsWith('/') ? target.slice(1) : `xl/${target}`);
}

// bytes (Uint8Array of an .xlsx) -> rows for matchRows ({ cid, code, kinds, meets: [{ days, start, end }], via: 'xlsx', text }), one per
// course and lesson type; null when the file is not a yedion timetable. Throws { user: true } for a file too big to be one.
export function rowsFromXlsx(bytes, courses) {
  if (bytes.length > MAX_FILE) throw tooBig();
  let files, total = 0;
  try {
    const raw = unzipSync(bytes, {
      filter: (e) => {
        if (!PARTS.test(e.name)) return false;
        total += e.originalSize;
        if (e.originalSize > MAX_PART || total > 2 * MAX_PART) throw tooBig();
        return true;
      }
    });
    files = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, strFromU8(v)]));
  } catch (e) {
    if (e.user) throw e;
    return null; // not a zip
  }
  const sheet = files[sheetPath(files)];
  if (!sheet) return null;
  const strings = [...(files['xl/sharedStrings.xml'] ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
  const cells = [...sheet.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map(([, a, body = '']) => {
    const t = attr(a, 't'), v = body.match(/<v>([^<]*)<\/v>/)?.[1];
    const text = t === 's' ? strings[Number(v)] : t === 'inlineStr' ? texts(body) : t === 'str' ? unxml(v ?? '') : '';
    return { col: (attr(a, 'r') ?? '').replace(/\d+$/, ''), text: text ?? '' };
  });
  const dayOf = {};
  for (const c of cells) {
    const d = DAY_NAMES.indexOf(c.text.trim().match(/^יום\s+(\S+)$/)?.[1]);
    if (d >= 0 && !dayOf[c.col]) dayOf[c.col] = d + 1;
  }
  if (Object.keys(dayOf).length < 2) return null;
  const rows = new Map();
  for (const c of cells) {
    const day = dayOf[c.col], code = c.text.match(/^\s*(\d{5})-/)?.[1], time = code && [...c.text.matchAll(TIME)].at(-1);
    if (!day || !time) continue; // a header, an "המשך" cell or an empty one
    // the type is the word right after the course name; a name the data doesn't know is skipped word by word
    const after = c.text.slice(c.text.indexOf('-') + 1).trimStart(), name = courses[code]?.name;
    const rest = name && after.startsWith(name) ? after.slice(name.length) : after.split(/\s+/).slice(1).join(' ');
    const type = rest.split(/\s+/).find((w) => TYPE.test(w)) ?? '';
    const start = hhmm(time[1], time[2]), end = hhmm(time[3], time[4]), key = `${code}|${type}`;
    const r = rows.get(key) ?? {
      cid: courses[code] ? code : null,
      code,
      kinds: type ? type.replace(/^סופי-/, '').split('+') : [],
      meets: [],
      via: 'xlsx',
      text: ''
    };
    if (!r.meets.some((m) => m.days[0] === day && m.start === start)) r.meets.push({ days: [day], start, end });
    const flat = c.text.replace(/\s+/g, ' ').trim();
    if (!r.text.includes(flat)) r.text = r.text ? `${r.text} | ${flat}` : flat;
    rows.set(key, r);
  }
  return [...rows.values()];
}
