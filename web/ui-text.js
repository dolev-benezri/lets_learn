// Pure copy and label helpers for the sidebar, drawers and popover (leaf module: no DOM, no imports, node-testable).
const D = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו'];
// The line under every alternative and in every calendar event; "יועץ לימודים" links to the counselling page when
// settings.json sets one (already https-validated).
export const DISCLAIMER = 'אינו הרשמה ואינו המלצה. לפני ההרשמה מומלץ להתייעץ עם יועץ לימודים.';
// Split lecture and tutorial (opt-in): the warning before it is switched on, and what a split alternative says about itself.
export const SPLIT_WARNING =
  'הפרדה בין הרצאה לתרגול עלולה ליצור פער בין החומר שנלמד בהרצאה לחומר שבתרגול, כי הקצב שלהם מתואם. הפרדה כזו מותרת רק באישור ההכוון האקדמי.';
export const SPLIT_TAG = 'מופרד · דורש אישור ההכוון'; // beside each split course in the registration list
// What a screen is called inside a sentence. Classic numbers its steps; design A names the tool (and the board). One place knows both, so a sentence
// like "פרטים ב…" is written once. `A` defaults to the page's design; the tests pass it.
const TOOL_NAME = {
  me: ['שלב 1', '״המצב שלי״'],
  courses: ['שלב 2', '״קורסים״'],
  wishes: ['שלב 3', '״מה חשוב לי״'],
  friends: ['שלב 3', '״חברים״'],
  plan: ['שלב 4', 'לוח'],
  out: ['שלב 4', '״להוציא״']
};
export const toolName = (key, A = globalThis.document?.documentElement?.dataset?.design === 'a') => TOOL_NAME[key][A ? 1 : 0];
export const RULES_UNAPPROVED = 'הכללים לא אושרו על ידי המחלקה.';
export const conflictLine = (t) => `יש סתירה בין המקורות הרשמיים לגבי ${t}.`;
// The yedion's login page (it opens in a new tab: the site cannot fetch the student's file itself, the yedion's sign-in is its own).
export const YEDION_URL = 'https://yedionp.afeka.ac.il/yedion/fireflyweb.aspx';
export const YEDION_HINT =
  `<a href="${YEDION_URL}" target="_blank" rel="noopener noreferrer">באפקה-נט<span class="sr"> (נפתח בלשונית חדשה)</span></a>` +
  ' אפשר להוריד את מערכת השעות כקובץ אקסל, ואז לטעון אותו כאן.' +
  // the path as the portal prints it (seen 2026-11-10): the menu, the page, its run button, then the export button
  ' שם: בתפריט "בחינות / ציונים / מערכת שעות" בוחרים "לוח מערכת שעות", לוחצים "ביצוע" ואז "להפקת דו"ח אקסל".';
// Under "לא נמצאו: 30112, …": which of those course codes the chosen track's data does not hold at all (a student who picked the wrong
// track sees their own courses "not found"). A course the data has, with no group at the hours read, is another matter and is not
// named; so are group ids (9 digits, pasted text). HTML: the codes are digits only.
export function notFoundHint(unknown, courses, edit) {
  const gone = unknown.filter((u) => /^\d{5}$/.test(u) && !courses[u]);
  if (!gone.length) return '';
  const one = gone.length === 1,
    codes = gone.slice(0, 8).map((c) => `<bdi dir="ltr">${esc(c)}</bdi>`).join(', ') + (gone.length > 8 ? ` ועוד ${gone.length - 8}` : '');
  return `${one ? 'הקורס' : 'הקורסים'} ${codes} לא ${one ? 'קיים' : 'קיימים'} בנתוני ${
    edit ? 'המסלול שבחרתם. בדקו שהמסלול ושנת הלימודים נכונים.' : `המסלול שלכם. ייתכן שהחבר לומד ${one ? 'אותו' : 'אותם'} במסלול אחר.`
  }`;
}
export const SPLIT_NOTE = 'חלופה עם הפרדת הרצאה ותרגול (דורש אישור ההכוון האקדמי)';
// names are raw: the caller escapes
export const splitLine = (names) => `מופרדים: ${names.join(', ')} · דורש אישור ההכוון`;
export const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Section help: all three inputs are plain text, including the id (attribute context).
export function helpHtml(id, topic, text, open = false) {
  return `<button type="button" class="a-help" data-act="help" data-k="help-${esc(id)}" aria-expanded="${open}"
    aria-controls="${esc(id)}" aria-label="הסבר: ${esc(topic)}"><span aria-hidden="true">ⓘ</span></button><p class="hint a-help-text" id="${esc(id)}"${open ? '' : ' hidden'}>${esc(text)}</p>`;
}
// Native row disclosure: name/id/key are text; body is trusted renderer markup.
export function courseMoreHtml(id, name, key, body, open = false) {
  return `<details class="a-course-more" data-course="${esc(id)}"${open ? ' open' : ''}><summary data-k="${esc(key)}"
    aria-label="עוד על ${esc(name)}">עוד</summary><div class="a-course-body">${body}</div></details>`;
}
export const disclaimerHtml = (url) =>
  (url
    ? DISCLAIMER.replace('יועץ לימודים', () => `<a href="${esc(url)}" target="_blank" rel="noopener">יועץ לימודים</a>`)
    : DISCLAIMER);
import { examWhen } from './solver-core.js';
export { examWhen };
const LEFT_OUT_SHOWN = 6;
// The candidates a plan left out, which otherwise leave without a word: most year-list courses are optional in the search.
export function leftOutText(list) {
  if (!list.length) return '';
  const line = (c) => `${c.name} (${c.credits} נ״ז)`;
  if (list.length === 1) return `לא נכנס לחלופה הזו: ${line(list[0])}.`;
  const total = list.reduce((a, c) => a + c.credits, 0),
    rest = list.length - LEFT_OUT_SHOWN;
  return `לא נכנסו לחלופה הזו ${list.length} קורסים, ${total} נ״ז: ${list.slice(0, LEFT_OUT_SHOWN).map(line).join(', ')}${rest > 0 ? ` ועוד ${rest}` : ''}.`;
}
// A plan's close first sittings (solver-core.js closeExams), one line each. Exam lengths are not in the data.
export const closeExamLines = (pairs, nameOf) =>
  pairs.map(({ days, a, b }) => {
    const names = `${nameOf(a.course)} ו-${nameOf(b.course)}`;
    if (days === 1) return `בחינות בימים צמודים: ${nameOf(a.course)} (${examWhen(a)}) ו-${nameOf(b.course)} (${examWhen(b)}).`;
    const hours = a.time && b.time ? ` בשעות ${a.time} ו-${b.time}` : '';
    return `שתי בחינות באותו יום: ${names}, ${examWhen({ date: a.date })}${hours}. משך הבחינות לא ידוע, כדאי לבדוק שאין חפיפה.`;
  });
// Design A's shorter form (declutter step 5): the count and the credits, the names behind "אילו?" (leftOutText says them in full, in "פרטים").
export const leftOutShort = (list) =>
  (list.length > 1 ? `${list.length} קורסים לא נכנסו (${list.reduce((a, c) => a + c.credits, 0)} נ״ז).` : leftOutText(list));
// Hours outside the wished hours, from the metric, which stops counting at 10 (solver-core.js metrics).
export function outsideHoursText(hours) {
  if (hours < 3) return '';
  return hours >= 10
    ? 'במערכת הזו 10 שעות שבועיות או יותר מחוץ לשעות הרצויות.'
    : `במערכת הזו כ-${Math.round(hours)} שעות שבועיות מחוץ לשעות הרצויות.`;
}
// Design A's form: the hours alone (a link "להפוך לחובה" follows the sentence).
export function outsideHoursShort(hours) {
  if (hours < 3) return '';
  return hours >= 10 ? '10 שעות או יותר מחוץ לשעות שביקשת.' : `כ-${Math.round(hours)} שעות מחוץ לשעות שביקשת.`;
}
// A reason that ends in the regulation behind it, "…(קורס מקביל, תקנון 6.2.3)": the reason and, apart, its citation ("למה?" opens it). Only a trailing
// parenthetical that names a regulation is split; any other text is the reason as it was. Render-time only: the statuses keep their strings.
export function splitReason(text) {
  const m = /^(.*?)\s*\(([^()]*תקנון[^()]*)\)\s*$/s.exec(text);
  return m ? { short: m[1], cite: m[2] } : { short: text, cite: '' };
}
const typeName = (t) => String(t).replace('סופי-', '');

// "271001601/1" -> "01/1", "270600301" -> "01": the part of a 9-digit Afeka group id a student actually recognises.
export function groupNumber(id) {
  const m = /^\d*?(\d{2})(\/\d+)?$/.exec(id);
  return m ? m[1] + (m[2] ?? '') : String(id);
}
// Hebrew geresh and gershayim in place of the ASCII marks the yedion types.
export const heb = (t) =>
  String(t)
    .replace(/(?<=[א-ת])'/g, '׳')
    .replace(/(?<=[א-ת])"(?=[א-ת])/g, '״');
// Sharing my link: the message before it, and the WhatsApp fallback where the native share sheet is missing (desktop).
export const shareText = (name) => `${name || 'חבר'} שיתף/ה איתך מערכת שעות:`;
export const waUrl = (text, url) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
// What one alternative changes against another (the best one), as short raw phrases (escaped where rendered).
// a / b: { courses, unlocks, freeDays, gapH, withFriends: [{ name, n }] } — a result plus its summary() (ui-grid.js).
export function compareAlts(a, b, data) {
  if (a.groups && b.groups && a.groups.length === b.groups.length && a.groups.every((g) => b.groups.includes(g)))
    return ['זהה לחלופה 1 בסמסטר הזה'];
  const out = [],
    has = (x, name) => x.withFriends.some((f) => f.name === name);
  for (const d of a.freeDays.filter((x) => !b.freeDays.includes(x))) out.push(`יום ${D[d]}׳ פנוי`);
  for (const d of b.freeDays.filter((x) => !a.freeDays.includes(x))) out.push(`בלי יום ${D[d]}׳ פנוי`);
  for (const f of b.withFriends.filter((f) => !has(a, f.name))) out.push(`בלי ${f.name}`);
  for (const f of a.withFriends.filter((f) => !has(b, f.name))) out.push(`עם ${f.name}`);
  const gap = Math.round((a.gapH - b.gapH) * 2) / 2,
    h = Math.abs(gap);
  if (gap) out.push(`${hoursText(h)} ${gap > 0 ? 'יותר' : 'פחות'} חלונות`);
  for (const c of a.courses.filter((x) => !b.courses.includes(x))) out.push(`+ ${data.courses[c].name}`);
  for (const c of b.courses.filter((x) => !a.courses.includes(x))) out.push(`− ${data.courses[c].name}`);
  const u = (a.unlocks ?? 0) - (b.unlocks ?? 0);
  if (u) out.push(`פותחת ${count(Math.abs(u), 'קורס אחד', 'קורסים')} ${u > 0 ? 'יותר' : 'פחות'}`);
  return out.length ? out : ['אותם קורסים, שיבוץ אחר'];
}
// What one more credit would change: the best plan at the higher cap against the best now. now / wider: planFacts() in ui-grid.js.
export function capPreviewText({ cap, now, wider, nameOf, year = false, partial = false }) {
  const cut = partial ? ' החיפוש נעצר בגלל מגבלת הזמן, אז התשובה חלקית.' : '';
  if (!wider || (wider.groups.length === now.groups.length && wider.groups.every((g) => now.groups.includes(g))))
    return { changed: false, text: `גם עם תקרה של ${cap} נ״ז לא נמצאה מערכת אחרת.${cut}` };
  const added = wider.courses.filter((c) => !now.courses.includes(c)),
    gone = now.courses.filter((c) => !wider.courses.includes(c)),
    more = wider.unlocks - now.unlocks;
  const parts = [
    added.length && `נכנס גם ${added.map(nameOf).join(', ')}`,
    gone.length && `בלי ${gone.map(nameOf).join(', ')}`,
    more > 0 && (more === 1 ? 'נפתח עוד קורס אחד' : `נפתחים עוד ${more} קורסים`),
    more < 0 && (more === -1 ? 'נפתח קורס אחד פחות' : `נפתחים ${-more} קורסים פחות`)
  ].filter(Boolean);
  return {
    changed: true,
    text: `${year ? 'בכל השנה ' : ''}${wider.credits} נ״ז: ${parts.length ? parts.join(', ') : 'אותם קורסים, שיבוץ אחר'}.${cut}`
  };
}
export const count = (n, one, many) => (n === 1 ? one : `${n} ${many}`); // Hebrew has no "1 קבוצות"
// A length of time in half hours, the way a student says it: "חצי שעה", "שעה וחצי", "שעתיים", "6 שעות"
export const hoursText = (h) =>
  ({ 0.5: 'חצי שעה', 1: 'שעה', 1.5: 'שעה וחצי', 2: 'שעתיים' })[h] ?? `${h} שעות`;
// The yedion joins a group's lecturers with ",," (some with ", ", one with a leading ","): shown, it is one comma and a space.
// The stored string stays as it is: a lecturer choice (constraints.lecturers) is keyed by it.
export const lecturerNames = (s) => [...new Set(String(s ?? '').split(',').map((n) => n.trim()).filter(Boolean))];
export const lecturerText = (s) => lecturerNames(s).join(', ');
// The toast after a prefer / avoid press in a group's popover; "was": the same press again, which clears the choice.
export const lecturerToast = (name, mode, was) =>
  was ? `בוטל: ${lecturerText(name)}`
    : mode === 'avoid' ? `החיפוש לא ישבץ קבוצות של ${lecturerText(name)}`
    : `כשאפשר, החיפוש יבחר קבוצות של ${lecturerText(name)}`;
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
export const rangeError = (raw, min, max) =>
  (raw === '' || (Number.isInteger(Number(raw)) && Number(raw) >= min && Number(raw) <= max)
    ? null
    : `צריך מספר שלם בין ${min} ל-${max}. הערך לא נשמר.`);

// "X מתוך Y נ״ז הנדרשים עד סוף שנה Z׳": the credits owed from the years before the study year (rules.js progress).
export const creditsGoal = (earned, required, year) =>
  (year > 1 ? `${earned} מתוך ${required} נ״ז הנדרשים עד סוף שנה ${D[year - 1]}׳` : 'בשנה א׳ אין עדיין יעד נ״ז');

// Why a wanted course is missing from a found plan: the diagnosis lines that name it, else the general ones (naming no course at all).
export function notFitReason(name, diagnosis, names) {
  const own = diagnosis.filter((l) => l.includes(name));
  return (own.length ? own : diagnosis.filter((l) => !names.some((n) => l.includes(n)))).join('; ');
}

export const friendToast = (name, updated) => `${updated ? 'החבר עודכן' : 'החבר נוסף'}: ${name}`;

export const strictnessHint = (hard) =>
  (hard ? 'מערכת שמפרה את זה לא תוצג.' : 'המערכת תעדיף את זה, אבל לא תפסול בגללו.');

// The defaults a student starts with, spelled out (a constraints object in the shape of DEFAULT.constraints).
export function defaultNotes(c) {
  const how = (hard) => (hard ? 'חובה לגמרי' : 'רק העדפה');
  const days =
    c.dayOff.length === 0
      ? 'ללא ימים פנויים'
      : c.dayOff.length === 1
        ? `יום ${D[c.dayOff[0]]}׳ פנוי`
        : `ימים ${c.dayOff.map((d) => `${D[d]}׳`).join(', ')} פנויים`;
  const hours =
    [c.notBefore && `לא לפני ${c.notBefore}`, c.notAfter && `לא אחרי ${c.notAfter}`].filter(Boolean).join(', ') ||
    'ללא הגבלת שעות';
  return { days: `ברירת מחדל: ${days}, ${how(c.dayOffHard)}.`, hours: `ברירת מחדל: ${hours}, ${how(c.windowHard)}.` };
}

// The block a popover hangs from has scrolled away from where it opened: keep it for small scrolls, close it for a long one.
export const popStale = (openTop, nowTop, vh) =>
  nowTop === null || nowTop + 40 < 0 || nowTop > vh || Math.abs(nowTop - openTop) > Math.max(160, vh * 0.25);

// Header freshness line. checkedAt = last scraper run (status.json); changedAt = the data file's fetchedAt (last real change).
const REL = new Intl.RelativeTimeFormat('he', { numeric: 'always' });
// Two runs a day, so 18 hours means a run was missed.
const STALE_MS = 18 * 36e5;
export const ago = (ms) => {
  const m = Math.round(ms / 6e4),
    h = Math.round(ms / 36e5),
    d = Math.round(ms / 864e5);
  const s =
    m < 1 ? 'עכשיו' : m < 60 ? REL.format(-m, 'minute') : h < 24 ? REL.format(-h, 'hour') : REL.format(-d, 'day');
  return s.replace(/ \(\d+\)$/, ''); // ICU writes "לפני שעה (1)"
};
const dayMonth = (iso) =>
  new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', timeZone: 'Asia/Jerusalem' });
export function freshness(status, changedAt, now = new Date()) {
  const changed = `השתנה לאחרונה ${dayMonth(changedAt)}`;
  if (!status?.checkedAt) return { text: `${changed} · לא ידוע מתי נבדק`, stale: true };
  const age = now - new Date(status.checkedAt);
  return { text: `נבדק ${ago(age)} · ${changed}`, stale: !status.ok || age > STALE_MS };
}

// Design A's freshness line: four states, each saying why the data may be stale (stale = a warning: icon + words + colour).
//   fresh "נבדק לפני 10 שעות"; old "הנתונים נבדקו לפני 32 ימים, ייתכן שהשתנו"; the last check failed; never checked.
export function freshnessA(status, changedAt, now = new Date()) {
  const changed = `הם השתנו לאחרונה ב-${dayMonth(changedAt).replace('/', '.')}`;
  if (!status?.checkedAt) return { text: `לא ידוע מתי הנתונים נבדקו. ${changed}`, stale: true };
  if (!status.ok) return { text: `הבדיקה האחרונה של הנתונים נכשלה. ${changed}`, stale: true };
  const age = now - new Date(status.checkedAt);
  return age > STALE_MS ? { text: `הנתונים נבדקו ${ago(age)}, ייתכן שהשתנו`, stale: true } : { text: `נבדק ${ago(age)}`, stale: false };
}
// Design A's switcher label (docs/superpowers/plans/2026-11-22-design-a-system.md, Task 4): the alternative shown, or "computing" while the first search has no
// alternative yet, or none. Classic keeps its own two-way label (ui-view.js).
export function altLabelText({ nAlt, cur, split, running }) {
  if (nAlt) return `חלופה ${cur + 1} מתוך ${nAlt}${split ? ' · מופרדת' : ''}`;
  return running ? 'מחשב חלופות…' : 'אין חלופות';
}
// Design A's legal line: in full ("פרטים", מידע), and the strip's shorter words (the board shows the legal minimum, the rest is behind "פרטים").
export const LEGAL_LINE = 'לא רשמי · אינו הרשמה ואינו המלצה (ההרשמה באפקה-נט)';
export const LEGAL_SHORT = 'לא רשמי · אינו הרשמה ואינו המלצה';
export const RULES_SHORT = 'הכללים לא אושרו במחלקה';
// The strip's and the phone line's warning about old data: nothing when fresh (freshnessA's 18-hour rule), else the shortest true words.
export function staleShortA(status, changedAt, now = new Date()) {
  if (!freshnessA(status, changedAt, now).stale) return '';
  if (!status?.checkedAt) return 'לא ידוע מתי נבדק';
  return status.ok ? `נבדק ${ago(now - new Date(status.checkedAt))}` : 'הבדיקה האחרונה נכשלה';
}
// Design A's one line for a plan's close first sittings (closeExamLines says each pair in full, behind "פרטים"): how many, and when if it is one pair.
export function examLineShort(pairs) {
  const part = (list, what, when) =>
    list.length > 1 ? `${list.length} זוגות בחינות ${what}` : list.length ? `2 בחינות ${what}, ${examWhen(when(list[0]))}` : '';
  const same = pairs.filter((p) => p.days !== 1),
    next = pairs.filter((p) => p.days === 1);
  return [part(same, 'באותו יום', (p) => ({ date: p.a.date })), part(next, 'בימים צמודים', (p) => p.a)].filter(Boolean).join(' · ');
}

// Pinned groups that no loaded semester has any more. Reported, never auto-removed. Group id = "27" + 5-digit course id + group.
export function stalePins(pins, datasets) {
  const sets = datasets.filter(Boolean);
  const has = (gid) => sets.some((d) => Object.values(d.courses).some((c) => c.groups.some((g) => g.id === gid)));
  return pins
    .filter((gid) => !has(gid))
    .map((gid) => {
      const cid = /^27(\d{5})/.exec(gid)?.[1];
      const course = cid && (sets.map((d) => d.courses[Number(cid)]).find(Boolean)?.name ?? String(Number(cid)));
      return { gid, text: `הקבוצה ${groupNumber(gid)}${course ? ` בקורס ${course}` : ''} כבר לא קיימת בנתונים` };
    });
}

// The "search ran out of time" notice. ms = the time limit of the search that just ran; at the cap, "חפש עוד" would only repeat it.
export function partialNote(ms, max) {
  const sec = +(ms / 1000).toFixed(1);
  return ms >= max
    ? {
        text: `גם אחרי ${sec} שניות החיפוש לא הספיק לבדוק את כל האפשרויות, כי סומנו הרבה קורסים. התוצאות טובות. לתוצאה מדויקת יותר, סמנו פחות קורסים "אולי".`,
        more: false
      }
    : {
        text: `החיפוש לא הספיק לבדוק את כל האפשרויות (נבדקו ${sec} שניות). התוצאות טובות, אבל ייתכן שיש טובות יותר.`,
        more: true
      };
}

// The Hebrew academic year of a Gregorian end year: 2027 -> תשפ״ז.
const GEMATRIA = [
  [400, 'ת'],
  [300, 'ש'],
  [200, 'ר'],
  [100, 'ק'],
  [90, 'צ'],
  [80, 'פ'],
  [70, 'ע'],
  [60, 'ס'],
  [50, 'נ'],
  [40, 'מ'],
  [30, 'ל'],
  [20, 'כ'],
  [10, 'י'],
  [9, 'ט'],
  [8, 'ח'],
  [7, 'ז'],
  [6, 'ו'],
  [5, 'ה'],
  [4, 'ד'],
  [3, 'ג'],
  [2, 'ב'],
  [1, 'א']
];
export function hebYear(gregorian) {
  let n = (gregorian + 3760) % 1000,
    out = '';
  for (const [v, l] of GEMATRIA)
    while (n >= v) {
      out += l;
      n -= v;
    }
  out = out.replace('יה', 'טו').replace('יו', 'טז');
  return out.length > 1 ? `${out.slice(0, -1)}״${out.slice(-1)}` : `${out}׳`;
}

// How fresh one group's seat count is: "מלא · נכון ל-08:08". A group may carry its own fetchedAt and seatsLeft (an
// official feed); the time the caller passes (app.js seatsAt) is the fallback.
// Times are instants shown in Israel time, 24h, whatever offset the ISO string was written with.
const HHMM = new Intl.DateTimeFormat('he-IL', {
  timeZone: 'Asia/Jerusalem',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});
const instant = (iso) => {
  const t = typeof iso === 'string' ? new Date(iso) : null;
  return t && !Number.isNaN(t.getTime()) ? t : null;
};
// The instant a data file is known to be current: its last change (fetchedAt), or a later successful check by the
// scraper (status.json: checkedAt, ok, semesters)
// that covers this file. A failed, missing or unrelated check says nothing, so fetchedAt stays. Returns the original ISO string, or undefined.
const SEM_CODE = { 'א': 1, 'ב': 2, 'קיץ': 3 };
export function freshAt(data, status) {
  const entry = status?.ok === true && status.semesters?.[`${data.year}-${SEM_CODE[data.semester]}/${data.program}-${data.startYear}`];
  // the run that built this file, not the last run. A status from before that field names only the last run,
  // and it stands in until the first run that writes the field.
  const legacy = entry && !Object.values(status.semesters).some((e) => e.checkedAt);
  const checkedAt = entry && (entry.checkedAt ?? (legacy ? status.checkedAt : null));
  const change = instant(data.fetchedAt),
    check = checkedAt ? instant(checkedAt) : null;
  return check && (!change || check > change) ? checkedAt : change ? data.fetchedAt : undefined;
}
// Beside the exam dates: where they came from (settings.json), since they are a by-hand copy and the solver plans by them.
export const examsNoteHtml = (note) => (note ? `<p class="hint">${esc(note)}</p>` : '');
// Not today in Israel time: the date comes first ("נכון ל-16.10, 21:08"), so an old count never reads as today's.
const DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', day: '2-digit', month: '2-digit' });
// The two halves of groupFresh: the state ("מלא", "פנוי", "נשארו 3 מקומות") and when it was read ("21.10, 21:13", "" when nobody knows), so a list can say a
// time that every group shares once (design A's registration list).
export function groupFreshParts(g, fileFetchedAt, now = new Date()) {
  const left = Number.isInteger(g.seatsLeft) && g.seatsLeft >= 0 ? g.seatsLeft : null;
  const state =
    g.full || left === 0 ? 'מלא' : left === null ? 'פנוי' : left === 1 ? 'נשאר מקום אחד' : `נשארו ${left} מקומות`;
  const t = instant(g.fetchedAt) ?? instant(fileFetchedAt);
  const day = t && DAY.format(t) !== DAY.format(now) ? `${DAY.format(t).replace('/', '.')}, ` : '';
  // minute: the instant itself (the label alone repeats: the hour the clocks go back, or a date a year on)
  return { state, at: t ? `${day}${HHMM.format(t)}` : '', minute: t ? Math.floor(t.getTime() / 6e4) : null };
}
export function groupFresh(g, fileFetchedAt, now = new Date()) {
  const { state, at } = groupFreshParts(g, fileFetchedAt, now);
  return at ? `${state} · נכון ל-${at}` : state;
}
// The time every listed group shares, or '' (some group has its own time, or none): then each keeps its own text. The instants are compared, not their labels.
export const sharedFreshAt = (parts) => (parts.length && parts.every((p) => p.minute !== null && p.minute === parts[0].minute) ? parts[0].at : '');

// The warning before my registration turn: my turn has opened, but the data was fetched before it did (seats may have gone since).
export const TURN_WARNING = 'שימו לב: הנתונים נמשכו לפני פתיחת התור שלך. ייתכנו שינויים במקומות הפנויים.';
export function turnWarning(turns, turnId, fetchedAt, now = new Date()) {
  const opens = instant(turns?.find((t) => t.id === turnId)?.opensAt),
    fetched = instant(fetchedAt);
  return opens && fetched && fetched < opens && now >= opens ? TURN_WARNING : null;
}

// Open conflicts between official sources (settings.json programs[id].conflicts) for one program and cohort: the texts to show on step 1.
export function conflictsFor(settings, program, startYear) {
  const list = Object.hasOwn(settings?.programs ?? {}, program) ? settings.programs[program].conflicts : null;
  return (list ?? []).filter((c) => c.cohorts.includes(startYear)).map((c) => c.text);
}

// "אושר על ידי המחלקה, 5.10.2026": the department's sign-off (settings.json programs[id].approved) with the day as D.M.YYYY, like the legal page.
export const approvedText = (day) => `אושר על ידי המחלקה, ${day.split('-').reverse().map(Number).join('.')}`;

// "דיווח על טעות": a mailto with the subject and a body the tool fills (ctx: program, startYear, semester, group?, page).
// The address goes through encodeURIComponent (so "?", "&", "," and "#" in it cannot add a header or a recipient), keeping only "@".
// Each field is clipped to 40 characters: a Hebrew letter is 6 characters once encoded, and mail apps drop links over ~2000.
export const PAGE_NAME = {
  me: 'המצב שלי',
  courses: 'קורסים',
  prefs: 'מה חשוב לי',
  plan: 'מערכות',
  edit: 'עריכת מערכת קיימת',
  friends: 'חברים', // the two below are design A's tools (ui-shell.js)
  out: 'להוציא את המערכת'
};
const clip = (v) => [...String(v)].slice(0, 40).join('');
export function reportMailto(email, ctx) {
  const lines = [
    ['תוכנית', ctx.program],
    ['מחזור', ctx.startYear],
    ['סמסטר', ctx.semester],
    ['קבוצה', ctx.group],
    ['עמוד', ctx.page]
  ]
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${clip(v)}`);
  const body = `מה הטעות?\n\n\n${lines.join('\n')}`.replace(/\n/g, '\r\n'); // mail links use CRLF line breaks (%0D%0A)
  return `mailto:${encodeURIComponent(email).replace(/%40/g, '@')}?subject=${encodeURIComponent('דיווח על טעות במערכת השעות')}&body=${encodeURIComponent(body)}`;
}
