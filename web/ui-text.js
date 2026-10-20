// Pure copy and label helpers for the sidebar, drawers and popover (leaf module: no DOM, no imports, node-testable).
const D = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו'];
// The line under every alternative and in every calendar event; "יועץ לימודים" links to the counselling page when settings.json sets one (already https-validated).
export const DISCLAIMER = 'אינו הרשמה ואינו המלצה. לפני ההרשמה מומלץ להתייעץ עם יועץ לימודים.';
// Split lecture and tutorial (opt-in): the warning before it is switched on, and what a split alternative says about itself.
export const SPLIT_WARNING = 'הפרדה בין הרצאה לתרגול עלולה ליצור פער בין החומר שנלמד בהרצאה לחומר שבתרגול, כי הקצב שלהם מתואם. הפרדה כזו מותרת רק באישור ההכוון האקדמי.';
export const SPLIT_NOTE = 'חלופה עם הפרדת הרצאה ותרגול (דורש אישור ההכוון האקדמי)';
export const splitLine = (names) => `מופרדים: ${names.join(', ')} · דורש אישור ההכוון`; // names are raw: the caller escapes
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const disclaimerHtml = (url) => (url ? DISCLAIMER.replace('יועץ לימודים', () => `<a href="${esc(url)}" target="_blank" rel="noopener">יועץ לימודים</a>`) : DISCLAIMER);
const typeName = (t) => String(t).replace('סופי-', '');

// "271001601/1" -> "01/1", "270600301" -> "01": the part of a 9-digit Afeka group id a student actually recognises.
export function groupNumber(id) {
  const m = /^\d*?(\d{2})(\/\d+)?$/.exec(id);
  return m ? m[1] + (m[2] ?? '') : String(id);
}
// Hebrew geresh and gershayim in place of the ASCII marks the yedion types.
export const heb = (t) => String(t).replace(/(?<=[א-ת])'/g, '׳').replace(/(?<=[א-ת])"(?=[א-ת])/g, '״');
// Sharing my link: the message before it, and the WhatsApp fallback where the native share sheet is missing (desktop).
export const shareText = (name) => `${name || 'חבר'} שיתף/ה איתך מערכת שעות:`;
export const waUrl = (text, url) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
// What one alternative changes against another (the best one), as short raw phrases (escaped where rendered).
// a / b: { courses, unlocks, freeDays, gapH, withFriends: [{ name, n }] } — a result plus its summary() (ui-grid.js).
export function compareAlts(a, b, data) {
  if (a.groups && b.groups && a.groups.length === b.groups.length && a.groups.every((g) => b.groups.includes(g))) return ['זהה לחלופה 1 בסמסטר הזה'];
  const out = [], has = (x, name) => x.withFriends.some((f) => f.name === name);
  for (const d of a.freeDays.filter((x) => !b.freeDays.includes(x))) out.push(`יום ${D[d]}׳ פנוי`);
  for (const d of b.freeDays.filter((x) => !a.freeDays.includes(x))) out.push(`בלי יום ${D[d]}׳ פנוי`);
  for (const f of b.withFriends.filter((f) => !has(a, f.name))) out.push(`בלי ${f.name}`);
  for (const f of a.withFriends.filter((f) => !has(b, f.name))) out.push(`עם ${f.name}`);
  const gap = Math.round((a.gapH - b.gapH) * 2) / 2, h = Math.abs(gap);
  if (gap) out.push(`${h === 1 ? 'שעה' : h === 0.5 ? 'חצי שעה' : `${h} שעות`} ${gap > 0 ? 'יותר' : 'פחות'} חלונות`);
  for (const c of a.courses.filter((x) => !b.courses.includes(x))) out.push(`+ ${data.courses[c].name}`);
  for (const c of b.courses.filter((x) => !a.courses.includes(x))) out.push(`− ${data.courses[c].name}`);
  const u = (a.unlocks ?? 0) - (b.unlocks ?? 0);
  if (u) out.push(`פותחת ${count(Math.abs(u), 'קורס אחד', 'קורסים')} ${u > 0 ? 'יותר' : 'פחות'}`);
  return out.length ? out : ['אותם קורסים, שיבוץ אחר'];
}
export const count = (n, one, many) => (n === 1 ? one : `${n} ${many}`); // Hebrew has no "1 קבוצות"
export const courseCount = (n) => count(n, 'קורס אחד', 'קורסים');
export const groupCount = (n) => count(n, 'קבוצה אחת', 'קבוצות');
export const meetingText = (m) => `יום ${D[m.day] ?? '?'}׳ ${m.start}–${m.end}`;
// "הרצאה · קבוצה 01": the full 9-digit id stays visible elsewhere (registration), this is the human handle.
export const groupLabel = (g) => `${typeName(g.type)} · קבוצה ${groupNumber(g.id)}`;

// A grade field edit: '' clears (undefined), a whole number 0-100 is kept, anything else keeps the previous grade.
export function gradeInput(raw, prev) {
  if (raw === '') return undefined;
  const v = Number(raw);
  return Number.isInteger(v) && v >= 0 && v <= 100 ? v : prev;
}

// A number field entry out of range: said in text (the toast is a live region) instead of a silent revert; null when it is fine or empty.
export const rangeError = (raw, min, max) => (raw === '' || (Number.isInteger(Number(raw)) && Number(raw) >= min && Number(raw) <= max) ? null
  : `צריך מספר שלם בין ${min} ל-${max}. הערך לא נשמר.`);

// "X מתוך Y נ״ז הנדרשים עד סוף שנה Z׳": the credits owed from the years before the study year (rules.js progress).
export const creditsGoal = (earned, required, year) => (year > 1 ? `${earned} מתוך ${required} נ״ז הנדרשים עד סוף שנה ${D[year - 1]}׳` : 'בשנה א׳ אין עדיין יעד נ״ז');

// Why a wanted course is missing from a found plan: the diagnosis lines that name it, else the general ones (naming no course at all).
export function notFitReason(name, diagnosis, names) {
  const own = diagnosis.filter((l) => l.includes(name));
  return (own.length ? own : diagnosis.filter((l) => !names.some((n) => l.includes(n)))).join('; ');
}

export const friendToast = (name, updated) => `${updated ? 'החבר עודכן' : 'החבר נוסף'}: ${name}`;

export const strictnessHint = (hard) => (hard ? 'מערכת שמפרה את זה לא תוצג.' : 'המערכת תעדיף את זה, אבל לא תפסול בגללו.');

// The defaults a student starts with, spelled out (a constraints object in the shape of DEFAULT.constraints).
export function defaultNotes(c) {
  const how = (hard) => (hard ? 'חובה לגמרי' : 'רק העדפה');
  const days = c.dayOff.length === 0 ? 'ללא ימים פנויים' : c.dayOff.length === 1 ? `יום ${D[c.dayOff[0]]}׳ פנוי` : `ימים ${c.dayOff.map((d) => `${D[d]}׳`).join(', ')} פנויים`;
  const hours = [c.notBefore && `לא לפני ${c.notBefore}`, c.notAfter && `לא אחרי ${c.notAfter}`].filter(Boolean).join(', ') || 'ללא הגבלת שעות';
  return { days: `ברירת מחדל: ${days}, ${how(c.dayOffHard)}.`, hours: `ברירת מחדל: ${hours}, ${how(c.windowHard)}.` };
}

// The block a popover hangs from has scrolled away from where it opened: keep it for small scrolls, close it for a long one.
export const popStale = (openTop, nowTop, vh) => nowTop === null || nowTop + 40 < 0 || nowTop > vh || Math.abs(nowTop - openTop) > Math.max(160, vh * 0.25);

// Header freshness line. checkedAt = last scraper run (status.json); changedAt = the data file's fetchedAt (last real change).
const REL = new Intl.RelativeTimeFormat('he', { numeric: 'always' });
const ago = (ms) => {
  const m = Math.round(ms / 6e4), h = Math.round(ms / 36e5), d = Math.round(ms / 864e5);
  const s = m < 1 ? 'עכשיו' : m < 60 ? REL.format(-m, 'minute') : h < 24 ? REL.format(-h, 'hour') : REL.format(-d, 'day');
  return s.replace(/ \(\d+\)$/, ''); // ICU writes "לפני שעה (1)"
};
const dayMonth = (iso) => new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', timeZone: 'Asia/Jerusalem' });
export function freshness(status, changedAt, now = new Date()) {
  const changed = `השתנה לאחרונה ${dayMonth(changedAt)}`;
  if (!status?.checkedAt) return { text: `${changed} · לא ידוע מתי נבדק`, stale: true };
  const age = now - new Date(status.checkedAt);
  return { text: `נבדק ${ago(age)} · ${changed}`, stale: !status.ok || age > 36 * 36e5 };
}

// Pinned groups that no loaded semester has any more. Reported, never auto-removed. Group id = "27" + 5-digit course id + group.
export function stalePins(pins, datasets) {
  const sets = datasets.filter(Boolean);
  const has = (gid) => sets.some((d) => Object.values(d.courses).some((c) => c.groups.some((g) => g.id === gid)));
  return pins.filter((gid) => !has(gid)).map((gid) => {
    const cid = /^27(\d{5})/.exec(gid)?.[1];
    const course = cid && (sets.map((d) => d.courses[Number(cid)]).find(Boolean)?.name ?? String(Number(cid)));
    return { gid, text: `הקבוצה ${groupNumber(gid)}${course ? ` בקורס ${course}` : ''} כבר לא קיימת בנתונים` };
  });
}

// The "search ran out of time" notice. ms = the time limit of the search that just ran; at the cap, "חפש עוד" would only repeat it.
export function partialNote(ms, max) {
  const sec = +(ms / 1000).toFixed(1);
  return ms >= max
    ? { text: `גם אחרי ${sec} שניות החיפוש לא הספיק לבדוק את כל האפשרויות, כי סומנו הרבה קורסים. התוצאות טובות. לתוצאה מדויקת יותר, סמנו פחות קורסים "אולי".`, more: false }
    : { text: `החיפוש לא הספיק לבדוק את כל האפשרויות (נבדקו ${sec} שניות). התוצאות טובות, אבל ייתכן שיש טובות יותר.`, more: true };
}

// The Hebrew academic year of a Gregorian end year: 2027 -> תשפ״ז.
const GEMATRIA = [[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק'], [90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י'], [9, 'ט'],
  [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א']];
export function hebYear(gregorian) {
  let n = (gregorian + 3760) % 1000, out = '';
  for (const [v, l] of GEMATRIA) while (n >= v) { out += l; n -= v; }
  out = out.replace('יה', 'טו').replace('יו', 'טז');
  return out.length > 1 ? `${out.slice(0, -1)}״${out.slice(-1)}` : `${out}׳`;
}

// How fresh one group's seat count is: "מלא · נכון ל-08:08". A group may carry its own fetchedAt and seatsLeft (an official feed); the data file's time is the fallback.
// Times are instants shown in Israel time, 24h, whatever offset the ISO string was written with.
const HHMM = new Intl.DateTimeFormat('he-IL', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const instant = (iso) => { const t = typeof iso === 'string' ? new Date(iso) : null; return t && !Number.isNaN(t.getTime()) ? t : null; };
// The instant a data file is known to be current: its last change (fetchedAt), or a later successful check by the scraper (status.json: checkedAt, ok, semesters)
// that covers this file. A failed, missing or unrelated check says nothing, so fetchedAt stays. Returns the original ISO string, or undefined.
const SEM_CODE = { 'א': 1, 'ב': 2, 'קיץ': 3 };
export function freshAt(data, status) {
  const covered = status?.ok === true && !!status.semesters?.[`${data.year}-${SEM_CODE[data.semester]}/${data.program}-${data.startYear}`];
  const change = instant(data.fetchedAt), check = covered ? instant(status.checkedAt) : null;
  return check && (!change || check > change) ? status.checkedAt : change ? data.fetchedAt : undefined;
}
export function groupFresh(g, fileFetchedAt) {
  const left = Number.isInteger(g.seatsLeft) && g.seatsLeft >= 0 ? g.seatsLeft : null;
  const state = g.full || left === 0 ? 'מלא' : left === null ? 'פנוי' : left === 1 ? 'נשאר מקום אחד' : `נשארו ${left} מקומות`;
  const t = instant(g.fetchedAt) ?? instant(fileFetchedAt);
  return t ? `${state} · נכון ל-${HHMM.format(t)}` : state;
}

// The warning before my registration turn: my turn has opened, but the data was fetched before it did (seats may have gone since).
export const TURN_WARNING = 'שימו לב: הנתונים נמשכו לפני פתיחת התור שלך. ייתכנו שינויים במקומות הפנויים.';
export function turnWarning(turns, turnId, fetchedAt, now = new Date()) {
  const opens = instant(turns?.find((t) => t.id === turnId)?.opensAt), fetched = instant(fetchedAt);
  return opens && fetched && fetched < opens && now >= opens ? TURN_WARNING : null;
}

// Open conflicts between official sources (settings.json programs[id].conflicts) for one program and cohort: the texts to show on step 1.
export function conflictsFor(settings, program, startYear) {
  const list = Object.hasOwn(settings?.programs ?? {}, program) ? settings.programs[program].conflicts : null;
  return (list ?? []).filter((c) => c.cohorts.includes(startYear)).map((c) => c.text);
}

// "דיווח על טעות": a mailto with the subject and a body the tool fills (ctx: program, startYear, semester, group?, page).
// The address goes through encodeURIComponent (so "?", "&", "," and "#" in it cannot add a header or a recipient), keeping only "@".
// Each field is clipped to 40 characters: a Hebrew letter is 6 characters once encoded, and mail apps drop links over ~2000.
export const PAGE_NAME = { me: 'המצב שלי', courses: 'קורסים', prefs: 'מה חשוב לי', plan: 'מערכות' };
const clip = (v) => [...String(v)].slice(0, 40).join('');
export function reportMailto(email, ctx) {
  const lines = [['תוכנית', ctx.program], ['מחזור', ctx.startYear], ['סמסטר', ctx.semester], ['קבוצה', ctx.group], ['עמוד', ctx.page]]
    .filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${k}: ${clip(v)}`);
  const body = `מה הטעות?\n\n\n${lines.join('\n')}`.replace(/\n/g, '\r\n'); // mail links use CRLF line breaks (%0D%0A)
  return `mailto:${encodeURIComponent(email).replace('%40', '@')}?subject=${encodeURIComponent('דיווח על טעות במערכת השעות')}&body=${encodeURIComponent(body)}`;
}
