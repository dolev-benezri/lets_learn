// Temporary: tests on a real phone which routes can hand over a PDF inside an app's browser. Invented data only. Deleted before the feature ships.
import { PDFDocument, rgb } from './vendor/pdf/pdf-lib.esm.min.js';
import bidiFactory from './vendor/pdf/bidi.min.mjs';

const $ = (id) => document.getElementById(id);
const SAVE = 'lab-pdf-log';
const read = () => {
  try {
    return sessionStorage.getItem(SAVE) ?? '';
  } catch {
    return '';
  }
};
const log = (s) => {
  const text = `${read()}${new Date().toTimeString().slice(0, 8)} ${s}\n`;
  try {
    sessionStorage.setItem(SAVE, text);
    $('log').textContent = text;
  } catch {
    $('log').textContent += `${s}\n`;
  }
};
$('log').textContent = read();

const BLOCKS = [
  ['h2', 'סיכום לפגישה עם יועץ לימודים'],
  ['p', '3.11.2026 · שנת הלימודים תשפ״ז'],
  ['h3', 'המצב שלי'],
  ['li', 'שם: ישראל ישראלי'],
  ['li', 'שם בערבית: ليلى حداد'],
  ['li', 'שם ברוסית: Иван Петров'],
  ['li', 'נקודות זכות: 62.5 מתוך 160 (חסרות 97.5)'],
  ['li', 'קורסים שעברתי: אלגברה לינארית, פיזיקה 1, מבוא לתכנות C++, Python למהנדסים, תרמודינמיקה (1), חשבון דיפרנציאלי ואינטגרלי 2, מדעי החומרים, סטטיקה'],
  ['h3', 'החלופה שבחרתי'],
  ['h4', 'סמסטר א׳'],
  ['p', '5 קורסים, 19.5 נ״ז'],
  ['b', 'דינמיקה (3.5 נ״ז)'],
  ['s', 'הרצאה 21001: יום א׳ 08:30-10:00, ב-204; תרגול 21002: יום ג׳ 14:15-15:45'],
  ['h3', 'שימו לב'],
  ['li', 'שני מבחנים ביום אחד: דינמיקה ומכניקת זורמים 1 (15.02.2027)'],
  ['li', 'הכלי הוא עזר בלבד. יש לבדוק כל שיבוץ בידיעון לפני ההרשמה (ראו afeka.ac.il).']
];
const SIZE = { h2: 17, h3: 12.5, h4: 11, p: 10.5, li: 10.5, b: 10.5, s: 9.5 };
const W = 595.28, H = 841.89, M = 40;
const fontBytes = async (n) => (await fetch(`vendor/pdf/rubik-${n}-normal.woff`)).arrayBuffer();

async function build() {
  const doc = await PDFDocument.create();
  doc.registerFontkit(window.fontkit);
  doc.setTitle('סיכום לפגישה עם יועץ לימודים');
  doc.setLanguage('he');
  const embed = async (n) => doc.embedFont(await fontBytes(n), { subset: true });
  const [he, heB, la, laB, ar, cy] = await Promise.all(['hebrew-400', 'hebrew-700', 'latin-400', 'latin-700', 'arabic-400', 'cyrillic-400'].map(embed));
  const bidi = bidiFactory();
  const fontKey = (c) => {
    const p = c.codePointAt(0);
    if (p >= 0x590 && p <= 0x5ff) return 'he';
    if (p >= 0x600 && p <= 0x6ff) return 'ar';
    if (p >= 0x400 && p <= 0x4ff) return 'cy';
    return 'la';
  };
  const RTL = /[֐-ۿ]/; // fontkit reverses a run in these scripts itself
  const runs = (line) => {
    const lv = bidi.getEmbeddingLevels(line, 'rtl');
    const ch = line.split('');
    bidi.getMirroredCharactersMap(line, lv.levels).forEach((m, i) => {
      ch[i] = m;
    });
    const order = ch.map((_, i) => i);
    for (const [a, b] of bidi.getReorderSegments(line, lv)) {
      order.slice(a, b + 1).reverse().forEach((v, i) => {
        order[a + i] = v;
      });
    }
    const out = [];
    for (const i of order) {
      const prev = out.at(-1), level = lv.levels[i], font = ch[i] === ' ' && prev?.level === level ? prev.font : fontKey(ch[i]);
      if (prev?.font === font && prev.level === level) prev.s += ch[i];
      else out.push({ font, level, s: ch[i] });
    }
    return out.map((r) => ({ ...r, draw: RTL.test(r.s) ? [...r.s].reverse().join('') : r.s }));
  };
  const fontOf = (r, bold) => ({ he: bold ? heB : he, la: bold ? laB : la, ar, cy })[r.font];
  const width = (rs, sz, bold) => rs.reduce((a, r) => a + fontOf(r, bold).widthOfTextAtSize(r.draw, sz), 0);
  const page = doc.addPage([W, H]);
  let y = H - M;
  for (const [k, t] of BLOCKS) {
    const sz = SIZE[k], bold = ['h2', 'h3', 'h4', 'b'].includes(k), ind = ['li', 'b', 's'].includes(k) ? 14 : 0;
    if (k === 'h3') y -= 7;
    if (k === 'h4') y -= 4;
    const lines = [];
    let cur = '';
    for (const word of t.split(' ')) {
      const next = cur ? `${cur} ${word}` : word;
      if (cur && width(runs(next), sz, bold) > W - 2 * M - ind) {
        lines.push(cur);
        cur = word;
      } else cur = next;
    }
    lines.push(cur);
    for (const l of lines) {
      const rs = runs(l);
      let x = W - M - ind - width(rs, sz, bold);
      for (const r of rs) {
        page.drawText(r.draw, { x, y: y - sz, size: sz, font: fontOf(r, bold), color: rgb(0, 0, 0) });
        x += fontOf(r, bold).widthOfTextAtSize(r.draw, sz);
      }
      y -= sz * 1.4;
    }
    if (k === 'h3') {
      page.drawLine({ start: { x: M, y: y + 1 }, end: { x: W - M, y: y + 1 }, thickness: 0.6 });
      y -= 3;
    }
  }
  return doc.save();
}

const HE = 'סיכום ליועץ.pdf', EN = 'advisor-summary.pdf';
let bytes, blob;
const fileOf = (name) => new File([bytes], name, { type: 'application/pdf' });
const active = () => navigator.userActivation?.isActive;
const fail = (t, e) => log(`${t} ERROR ${e?.name}: ${e?.message}`);
const download = (t, href) => {
  const a = document.createElement('a');
  a.href = href;
  a.download = EN;
  document.body.append(a);
  a.click();
  a.remove();
  log(`${t} a.click() returned; did a file really arrive?`);
};
const share = (t, data) => {
  log(`${t} share called, activation=${active()}`);
  return navigator.share(data).then(() => log(`${t} share RESOLVED`));
};
const dataUrl = () =>
  new Promise((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => no(r.error);
    r.readAsDataURL(blob);
  });
let data;

const TESTS = {
  1: () => share('1 share he', { files: [fileOf(HE)] }).catch((e) => fail('1', e)),
  2: () => share('2 share en', { files: [fileOf(EN)] }).catch((e) => fail('2', e)),
  3: () => share('3 share+title', { files: [fileOf(EN)], title: 'סיכום ליועץ' }).catch((e) => fail('3', e)),
  4: () => download('4 blob', URL.createObjectURL(blob)),
  5: () => download('5 data', data),
  6: () => log(`6 window.open returned ${window.open(URL.createObjectURL(blob), '_blank') ? 'a window' : 'null'}`),
  7: () => {
    log('9 same tab: leaving the page');
    location.href = URL.createObjectURL(blob);
  },
  9: () =>
    share('7 share', { files: [fileOf(EN)] }).catch((e) => {
      fail('7', e);
      $('again').hidden = false;
    })
};

document.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-t]');
  if (!b) return;
  if (!bytes) return log('the file is not ready');
  try {
    TESTS[b.dataset.t]();
  } catch (err) {
    fail(b.dataset.t, err);
  }
});
$('safari').href = `x-safari-${location.href.split('lab-pdf')[0]}`;
$('safari').addEventListener('click', () => log('8 safari link pressed'));

log(`UA ${navigator.userAgent}`);
log(`share=${typeof navigator.share} canShare=${typeof navigator.canShare} pointer=${matchMedia('(pointer:coarse)').matches ? 'coarse' : 'fine'}`);
const t0 = performance.now();
try {
  bytes = await build();
  blob = new Blob([bytes], { type: 'application/pdf' });
  data = await dataUrl();
  log(`built ${bytes.length} B in ${Math.round(performance.now() - t0)} ms`);
  for (const n of [HE, EN]) log(`canShare(${n === HE ? 'he' : 'en'} name)=${navigator.canShare?.({ files: [fileOf(n)] })}`);
} catch (e) {
  fail('build', e);
}
