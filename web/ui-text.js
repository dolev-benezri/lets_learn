// Pure copy and label helpers for the sidebar, drawers and popover (leaf module: no DOM, no imports, node-testable).
const D = ['', 'א', 'ב', 'ג', 'ד', 'ה', 'ו'];
const typeName = (t) => String(t).replace('סופי-', '');

// "271001601/1" -> "01/1", "270600301" -> "01": the part of a 9-digit Afeka group id a student actually recognises.
export function groupNumber(id) {
  const m = /^\d*?(\d{2})(\/\d+)?$/.exec(id);
  return m ? m[1] + (m[2] ?? '') : String(id);
}
export const meetingText = (m) => `יום ${D[m.day] ?? '?'}׳ ${m.start}–${m.end}`;
// "הרצאה · קבוצה 01": the full 9-digit id stays visible elsewhere (registration), this is the human handle.
export const groupLabel = (g) => `${typeName(g.type)} · קבוצה ${groupNumber(g.id)}`;

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
