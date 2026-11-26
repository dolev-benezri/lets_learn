import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  leftOutText,
  leftOutShort,
  splitReason,
  outsideHoursShort,
  capPreviewText,
  closeExamLines,
  outsideHoursText,
  groupNumber,
  groupLabel,
  meetingText,
  friendToast,
  strictnessHint,
  defaultNotes,
  popStale,
  freshness,
  freshnessA,
  staleShortA,
  examLineShort,
  altLabelText,
  LEGAL_LINE,
  LEGAL_SHORT,
  RULES_SHORT,
  stalePins,
  creditsGoal,
  notFitReason,
  partialNote,
  examWhen,
  DISCLAIMER,
  disclaimerHtml,
  esc,
  helpHtml,
  courseMoreHtml,
  groupFresh,
  groupFreshParts,
  sharedFreshAt,
  turnWarning,
  freshAt,
  examsNoteHtml,
  conflictsFor,
  reportMailto,
  notFoundHint
} from '../web/ui-text.js';
import { askConfirm } from '../web/ui-dialog.js';
import { DEFAULT } from '../web/app.js';

test('courseMoreHtml: native fold, row name, escaped text, stable focus key and restored open state', () => {
  const html = courseMoreHtml('1"', 'שם <ארוך>', 'row"1', '<input name="grade">');
  assert.match(html, /<details class="a-course-more" data-course="1&quot;">/);
  assert.match(html, /<summary data-k="row&quot;1"\s+aria-label="עוד על שם &lt;ארוך&gt;">עוד<\/summary>/);
  assert.match(html, /<div class="a-course-body"><input name="grade"><\/div><\/details>/);
  assert.doesNotMatch(html, / open|role="button"|aria-expanded|tabindex|\son\w+=/);
  assert.match(courseMoreHtml('1', 'קורס', 'row1', '', true), /data-course="1" open>/);
});

test('helpHtml: labelled native button controls a hidden explanation; no keyboard shim is needed', () => {
  const html = helpHtml('profileHelp', 'פרופיל', 'הקיץ מתוכנן אחרי שנת הלימודים');
  assert.match(html, /<button type="button" class="a-help"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /aria-controls="profileHelp" aria-label="הסבר: פרופיל"/);
  assert.match(html, /<span aria-hidden="true">ⓘ<\/span><\/button>/);
  assert.match(html, /<p class="hint a-help-text" id="profileHelp" hidden>הקיץ מתוכנן אחרי שנת הלימודים<\/p>/);
  assert.doesNotMatch(html, /role="button"|tabindex|\son\w+=/);
  const open = helpHtml('profileHelp', 'פרופיל', 'טקסט', true);
  assert.match(open, /aria-expanded="true"/);
  assert.doesNotMatch(open, / hidden/);
});

test('helpHtml: escapes ids, topics and explanation text as text, never executable markup', () => {
  const html = helpHtml('a"<&\'', '<שם> & "נושא"', '<script>"&\'</script>');
  assert.match(html, /aria-controls="a&quot;&lt;&amp;&#39;"/);
  assert.match(html, /id="a&quot;&lt;&amp;&#39;" hidden/);
  assert.match(html, /aria-label="הסבר: &lt;שם&gt; &amp; &quot;נושא&quot;"/);
  assert.match(html, /&lt;script&gt;&quot;&amp;&#39;&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>|<שם>/);
});

test('toolName: classic numbers its steps, design A names the tool and the board', async () => {
  const { toolName } = await import('../web/ui-text.js');
  assert.deepEqual(['me', 'courses', 'wishes', 'plan'].map((k) => toolName(k, false)), ['שלב 1', 'שלב 2', 'שלב 3', 'שלב 4']);
  assert.equal(toolName('friends', false), 'שלב 3', 'classic keeps the friends on the preferences step');
  assert.deepEqual(
    ['me', 'courses', 'wishes', 'friends', 'out', 'plan'].map((k) => toolName(k, true)),
    ['״המצב שלי״', '״קורסים״', '״מה חשוב לי״', '״חברים״', '״להוציא״', 'לוח']
  );
  assert.equal(toolName('me'), 'שלב 1', 'no document: the classic wording');
});

test('leftOutText: names and credits, one or many, and a long list is cut with its count', () => {
  assert.equal(leftOutText([]), '');
  assert.equal(leftOutText([{ name: 'א', credits: 3.5 }]), 'לא נכנס לחלופה הזו: א (3.5 נ״ז).');
  assert.equal(
    leftOutText([{ name: 'א', credits: 3.5 }, { name: 'ב', credits: 1 }]),
    'לא נכנסו לחלופה הזו 2 קורסים, 4.5 נ״ז: א (3.5 נ״ז), ב (1 נ״ז).'
  );
  const many = Array.from({ length: 8 }, (_, i) => ({ name: `ק${i}`, credits: 1 }));
  const t = leftOutText(many);
  assert.ok(t.startsWith('לא נכנסו לחלופה הזו 8 קורסים, 8 נ״ז:'), t);
  assert.ok(t.includes('ק5') && !t.includes('ק6') && t.includes('ועוד 2'), t);
});

test('closeExamLines: same day with both hours and a caution, next day with both dates, names first', () => {
  const nm = (id) => ({ Y: 'תרמו', Z: 'הסתברות' })[id];
  const y = { course: 'Y', date: '2027-01-28', time: '09:00' };
  assert.deepEqual(closeExamLines([{ days: 0, a: y, b: { course: 'Z', date: '2027-01-28', time: '13:00' } }], nm), [
    'שתי בחינות באותו יום: תרמו ו-הסתברות, 28.01.2027 בשעות 09:00 ו-13:00. משך הבחינות לא ידוע, כדאי לבדוק שאין חפיפה.'
  ]);
  assert.deepEqual(closeExamLines([{ days: 1, a: y, b: { course: 'Z', date: '2027-01-29', time: '13:00' } }], nm), [
    'בחינות בימים צמודים: תרמו (28.01.2027 09:00) ו-הסתברות (29.01.2027 13:00).'
  ]);
  assert.deepEqual(closeExamLines([], nm), []);
  assert.deepEqual(closeExamLines([{ days: 0, a: { ...y, time: null }, b: { course: 'Z', date: '2027-01-28', time: null } }], nm), [
    'שתי בחינות באותו יום: תרמו ו-הסתברות, 28.01.2027. משך הבחינות לא ידוע, כדאי לבדוק שאין חפיפה.'
  ]);
});

test('leftOutShort / outsideHoursShort: design A says the count and the hours, the names and the link are elsewhere', () => {
  assert.equal(leftOutShort([{ name: 'א', credits: 3.5 }]), 'לא נכנס לחלופה הזו: א (3.5 נ״ז).', 'one course keeps its single line');
  assert.equal(leftOutShort([{ name: 'א', credits: 3.5 }, { name: 'ב', credits: 1 }, { name: 'ג', credits: 2.5 }]), '3 קורסים לא נכנסו (7 נ״ז).');
  assert.equal(leftOutShort([{ name: 'א', credits: 3.5 }, { name: 'ב', credits: 28 }]), '2 קורסים לא נכנסו (31.5 נ״ז).', 'fractions are kept');
  assert.equal(leftOutShort([]), '');
  assert.equal(outsideHoursShort(2.9), '');
  assert.equal(outsideHoursShort(3.83), 'כ-4 שעות מחוץ לשעות שביקשת.');
  assert.equal(outsideHoursShort(10), '10 שעות או יותר מחוץ לשעות שביקשת.');
});

test('outsideHoursText: silent up to 3 hours, and says when the metric is at its ceiling', () => {
  assert.equal(outsideHoursText(2.9), '');
  assert.equal(outsideHoursText(3.83), 'במערכת הזו כ-4 שעות שבועיות מחוץ לשעות הרצויות.');
  assert.equal(outsideHoursText(10), 'במערכת הזו 10 שעות שבועיות או יותר מחוץ לשעות הרצויות.');
});

test('groupNumber: the short number of a 9-digit group id, tutorial suffix kept', () => {
  assert.equal(groupNumber('270600301'), '01');
  assert.equal(groupNumber('271001601/1'), '01/1');
  assert.equal(groupNumber('L2'), 'L2');
});

test('groupLabel and meetingText: human handles, no raw id', () => {
  const g = { id: '270600302', type: 'סופי-הרצאה', meetings: [{ day: 3, start: '08:00', end: '11:50' }] };
  assert.equal(groupLabel(g), 'הרצאה · קבוצה 02');
  assert.equal(meetingText(g.meetings[0]), 'יום ג׳ 08:00–11:50');
});

test('friendToast says what happened and to whom', () => {
  assert.equal(friendToast('נועה', false), 'החבר נוסף: נועה');
  assert.equal(friendToast('נועה', true), 'החבר עודכן: נועה');
});

test('defaultNotes spells out the shipped defaults (Friday off, not after 20:00, both only a preference)', () => {
  const n = defaultNotes(DEFAULT.constraints);
  assert.equal(n.days, 'ברירת מחדל: יום ו׳ פנוי, רק העדפה.');
  assert.equal(n.hours, 'ברירת מחדל: לא אחרי 20:00, רק העדפה.');
  const m = defaultNotes({ dayOff: [1, 6], dayOffHard: true, notBefore: '09:00', notAfter: '', windowHard: true });
  assert.equal(m.days, 'ברירת מחדל: ימים א׳, ו׳ פנויים, חובה לגמרי.');
  assert.equal(m.hours, 'ברירת מחדל: לא לפני 09:00, חובה לגמרי.');
  assert.equal(
    defaultNotes({ dayOff: [], dayOffHard: false, notBefore: '', notAfter: '', windowHard: false }).hours,
    'ברירת מחדל: ללא הגבלת שעות, רק העדפה.'
  );
});

test('strictnessHint differs for hard and soft', () => {
  assert.notEqual(strictnessHint(true), strictnessHint(false));
});

test('popStale: small scrolls keep the popover, long ones or an off-screen block close it', () => {
  assert.equal(popStale(300, 260, 800), false);
  assert.equal(popStale(300, 100, 800), false); // 200px but under 25% of ... still within max(160, 200)
  assert.equal(popStale(300, 90, 800), true);
  assert.equal(popStale(300, 900, 800), true); // below the viewport
  assert.equal(popStale(300, -100, 800), true); // above it
  assert.equal(popStale(300, null, 800), true); // block gone
});

test('freshnessA: four states, each says why the data may be stale (design A)', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  const ok = { checkedAt: '2026-10-01T09:00:00Z', ok: true };
  assert.deepEqual(freshnessA(ok, '2026-09-28T09:00:00Z', now), { text: 'נבדק לפני 3 שעות', stale: false }, 'fresh: no date of the last change');
  assert.deepEqual(freshnessA({ ...ok, checkedAt: '2026-08-30T12:00:00Z' }, '2026-09-28T09:00:00Z', now), {
    text: 'הנתונים נבדקו לפני 32 ימים, ייתכן שהשתנו',
    stale: true
  });
  assert.deepEqual(freshnessA({ ...ok, ok: false }, '2026-09-28T09:00:00Z', now), {
    text: 'הבדיקה האחרונה של הנתונים נכשלה. הם השתנו לאחרונה ב-28.9',
    stale: true
  });
  assert.deepEqual(freshnessA(null, '2026-09-28T09:00:00Z', now), { text: 'לא ידוע מתי הנתונים נבדקו. הם השתנו לאחרונה ב-28.9', stale: true });
  assert.equal(freshnessA({ ...ok, checkedAt: '2026-09-29T23:00:00Z' }, ok.checkedAt, now).stale, true, 'over 36h old');
  assert.equal(freshnessA({ ...ok, checkedAt: '2026-09-30T00:00:00Z', ok: false }, ok.checkedAt, now).text.startsWith('הבדיקה האחרונה'), true, 'a failed check wins over an old one');
});

test('the short exam line: one pair, several, adjacent, none', () => {
  const p = (days, date) => ({ days, a: { course: 'x', date, time: '13:00' }, b: { course: 'y', date, time: '17:00' } });
  assert.equal(examLineShort([p(0, '2027-01-28')]), '2 בחינות באותו יום, 28.01.2027');
  assert.equal(examLineShort([p(0, '2027-01-28'), p(0, '2027-02-03'), p(0, '2027-02-07')]), '3 זוגות בחינות באותו יום');
  assert.equal(examLineShort([p(0, '2027-01-28'), p(1, '2027-02-03')]), '2 בחינות באותו יום, 28.01.2027 · 2 בחינות בימים צמודים, 03.02.2027 13:00');
  assert.equal(examLineShort([p(1, '2027-02-03'), p(1, '2027-02-07')]), '2 זוגות בחינות בימים צמודים');
  assert.equal(examLineShort([]), '');
});

test('the short stale line of the strip: nothing when fresh, else the shortest true words', () => {
  const now = new Date('2026-11-22T12:00:00Z');
  assert.equal(staleShortA({ checkedAt: '2026-11-22T06:00:00Z', ok: true }, '2026-10-21', now), '');
  assert.match(staleShortA({ checkedAt: '2026-10-21T06:00:00Z', ok: true }, '2026-10-21', now), /^נבדק לפני \d+ ימים$/);
  assert.equal(staleShortA({ checkedAt: '2026-11-22T06:00:00Z', ok: false }, '2026-10-21', now), 'הבדיקה האחרונה נכשלה');
  assert.equal(staleShortA(null, '2026-10-21', now), 'לא ידוע מתי נבדק');
  assert.equal(LEGAL_SHORT, 'לא רשמי · אינו הרשמה ואינו המלצה');
});

test('the legal line of design A says what it must, in the owner-approved words (D2)', () => {
  assert.equal(LEGAL_LINE, 'לא רשמי · אינו הרשמה ואינו המלצה (ההרשמה באפקה-נט)');
  assert.equal(RULES_SHORT, 'הכללים לא אושרו במחלקה');
  assert.equal(`${LEGAL_LINE} · ${RULES_SHORT} · פרטים`, 'לא רשמי · אינו הרשמה ואינו המלצה (ההרשמה באפקה-נט) · הכללים לא אושרו במחלקה · פרטים');
});

test('askConfirm: without <dialog> and confirm() it proceeds, like the old guard did', async () => {
  assert.equal(await askConfirm('x'), true);
});

test('freshness: relative check time, last-change date, stale after 18h or a failed check', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  const ok = { checkedAt: '2026-10-01T09:00:00Z', ok: true };
  assert.deepEqual(freshness(ok, '2026-09-28T09:00:00Z', now), {
    text: 'נבדק לפני 3 שעות · השתנה לאחרונה 28.9',
    stale: false
  });
  assert.equal(
    freshness({ ...ok, checkedAt: '2026-10-01T11:00:00Z' }, ok.checkedAt, now).text.split(' · ')[0],
    'נבדק לפני שעה'
  );
  assert.equal(
    freshness({ ...ok, checkedAt: '2026-10-01T11:59:40Z' }, ok.checkedAt, now).text.split(' · ')[0],
    'נבדק עכשיו'
  );
  assert.equal(freshness({ ...ok, checkedAt: '2026-09-29T23:00:00Z' }, ok.checkedAt, now).stale, true, 'over 36h old');
  assert.equal(freshness({ ...ok, ok: false }, ok.checkedAt, now).stale, true, 'last check failed');
  assert.deepEqual(freshness(null, '2026-09-28T09:00:00Z', now), {
    text: 'השתנה לאחרונה 28.9 · לא ידוע מתי נבדק',
    stale: true
  });
});

for (const [name, line] of [['freshness', freshness], ['freshnessA', freshnessA]]) {
  test(`${name}: 17 hours is fresh and 19 hours is stale`, () => {
    const now = new Date('2026-11-26T12:00:00Z');
    for (const [hours, stale] of [[17, false], [19, true]]) {
      const status = { checkedAt: new Date(now - hours * 36e5).toISOString(), ok: true };
      assert.equal(line(status, '2026-11-01', now).stale, stale);
    }
  });
}

test('staleShortA: 17 hours is silent and 19 hours warns', () => {
  const now = new Date('2026-11-26T12:00:00Z');
  const status = (hours) => ({ checkedAt: new Date(now - hours * 36e5).toISOString(), ok: true });
  assert.equal(staleShortA(status(17), '2026-11-01', now), '');
  assert.notEqual(staleShortA(status(19), '2026-11-01', now), '');
});

test('stalePins: pins missing from every loaded semester, named by course when it still exists', () => {
  const A = { courses: { 6001: { name: 'אנגלית בסיסי', groups: [{ id: '270600101' }] } } };
  const B = { courses: { 30003: { name: 'סטטיקה', groups: [{ id: '273000301' }] } } };
  assert.deepEqual(stalePins(['270600101', '273000301'], [A, B]), [], 'a pin in either semester is fine');
  assert.deepEqual(stalePins(['270600102', '279999901', 'L2'], [A, null]), [
    { gid: '270600102', text: 'הקבוצה 02 בקורס אנגלית בסיסי כבר לא קיימת בנתונים' },
    { gid: '279999901', text: 'הקבוצה 01 בקורס 99999 כבר לא קיימת בנתונים' },
    { gid: 'L2', text: 'הקבוצה L2 כבר לא קיימת בנתונים' },
  ]);
});

import { gradeInput } from '../web/ui-text.js';
test('gradeInput: valid kept, empty clears, invalid keeps the previous grade', () => {
  assert.equal(gradeInput('85', 90), 85);
  assert.equal(gradeInput('0', 90), 0);
  assert.equal(gradeInput('', 90), undefined);
  for (const bad of ['900', '-1', '8.5', 'x']) assert.equal(gradeInput(bad, 90), 90);
  assert.equal(gradeInput('900', undefined), undefined);
});

import { rangeError } from '../web/ui-text.js';
test('rangeError: an out-of-range number field entry is named in text (WCAG 3.3.1), a valid or empty one is not', () => {
  for (const ok of ['', '0', '100']) assert.equal(rangeError(ok, 0, 100), null);
  for (const bad of ['150', '-1', '8.5', 'x']) assert.match(rangeError(bad, 0, 100), /בין 0 ל-100.*לא נשמר/);
  assert.match(rangeError('900', 50, 150), /בין 50 ל-150/);
});

test('creditsGoal: credits owed by the end of the previous year; year א׳ has no goal', () => {
  assert.equal(creditsGoal(41, 41, 2), '41 מתוך 41 נ״ז הנדרשים עד סוף שנה א׳');
  assert.equal(creditsGoal(30, 83, 3), '30 מתוך 83 נ״ז הנדרשים עד סוף שנה ב׳');
  assert.equal(creditsGoal(0, 0, 1), 'בשנה א׳ אין עדיין יעד נ״ז');
});

test('notFitReason: lines naming the course, else the general ones, else nothing', () => {
  const names = ['פיזיקה', 'לינארית'];
  assert.equal(notFitReason('פיזיקה', ['פיזיקה: אין קבוצה', 'לינארית: אין קבוצה'], names), 'פיזיקה: אין קבוצה');
  assert.equal(notFitReason('לינארית', ['אין מערכת שעומדת בכל האילוצים'], names), 'אין מערכת שעומדת בכל האילוצים');
  assert.equal(notFitReason('לינארית', ['פיזיקה: אין קבוצה'], names), '');
});

test('examWhen: day.month.year, with the hour when it is known', () => {
  assert.equal(examWhen({ date: '2027-02-15', time: '09:00' }), '15.02.2027 09:00');
  assert.equal(examWhen({ date: '2027-02-05', time: null }), '05.02.2027');
});
test('partialNote: offers "חפש עוד" below the cap, explains instead at the cap', () => {
  const a = partialNote(1500, 12000);
  assert.equal(a.more, true);
  assert.match(a.text, /1\.5 שניות/);
  const b = partialNote(12000, 12000);
  assert.equal(b.more, false);
  assert.match(b.text, /סמנו פחות קורסים/);
});

import { hebYear } from '../web/ui-text.js';
test('hebYear: the Hebrew academic year of a Gregorian end year, with the 15 and 16 exceptions', () => {
  assert.deepEqual([2027, 2026, 2025, 2024, 2023, 2015, 1955, 1956].map(hebYear), [
    'תשפ״ז',
    'תשפ״ו',
    'תשפ״ה',
    'תשפ״ד',
    'תשפ״ג',
    'תשע״ה',
    'תשט״ו',
    'תשט״ז'
  ]);
});

test('courseCount: one course is "קורס אחד", not "1 קורסים"', async () => {
  const { courseCount } = await import('../web/ui-text.js');
  assert.deepEqual([courseCount(1), courseCount(0), courseCount(4)], ['קורס אחד', '0 קורסים', '4 קורסים']);
});

test('count: Hebrew singular for one (groups, lessons, days), the number otherwise', async () => {
  const { count, groupCount } = await import('../web/ui-text.js');
  assert.deepEqual([groupCount(1), groupCount(3)], ['קבוצה אחת', '3 קבוצות']);
  assert.equal(count(1, 'יום אחד', 'ימים'), 'יום אחד');
  assert.equal(count(2, 'יום אחד', 'ימים'), '2 ימים');
});

test('nameHtml: Latin runs in a course name get lang="en", entities are left alone', async () => {
  const { nameHtml } = await import('../web/ui-common.js');
  assert.equal(nameHtml('פיתוח בסביבת IOS'), 'פיתוח בסביבת <span lang="en">IOS</span>');
  assert.equal(nameHtml('Engineers Go to Market'), '<span lang="en">Engineers Go to Market</span>');
  assert.equal(
    nameHtml('מבוא <b> & "x"'),
    'מבוא &lt;<span lang="en">b</span>&gt; &amp; &quot;<span lang="en">x</span>&quot;'
  );
  assert.equal(nameHtml('פיזיקה 1'), 'פיזיקה 1');
});

test('waUrl: the text and the link, encoded, for wa.me; shareText names the sender', async () => {
  const { waUrl, shareText } = await import('../web/ui-text.js');
  assert.equal(
    waUrl('שלום & "x"', 'https://a.test/#f=AB'),
    'https://wa.me/?text=' + encodeURIComponent('שלום & "x" https://a.test/#f=AB')
  );
  assert.equal(shareText(''), 'חבר שיתף/ה איתך מערכת שעות:');
  assert.equal(shareText('דנה'), 'דנה שיתף/ה איתך מערכת שעות:');
});

test('compareAlts names what changes: free day, friend, gaps, courses, unlocks', async () => {
  const { compareAlts } = await import('../web/ui-text.js');
  const data = { courses: { A: { name: 'פיזיקה' }, B: { name: 'כימיה' } } };
  const best = { courses: ['A'], unlocks: 1, freeDays: [], gapH: 1, withFriends: [{ name: 'נועה', n: 1 }] };
  const cur = { courses: ['A', 'B'], unlocks: 3, freeDays: [4], gapH: 0, withFriends: [] };
  assert.deepEqual(compareAlts(cur, best, data), [
    'יום ד׳ פנוי',
    'בלי נועה',
    'שעה פחות חלונות',
    '+ כימיה',
    'פותחת 2 קורסים יותר'
  ]);
  assert.deepEqual(compareAlts(best, cur, data), [
    'בלי יום ד׳ פנוי',
    'עם נועה',
    'שעה יותר חלונות',
    '− כימיה',
    'פותחת 2 קורסים פחות'
  ]);
  assert.deepEqual(compareAlts({ ...best, gapH: 3.5 }, best, data), ['2.5 שעות יותר חלונות']);
  assert.deepEqual(compareAlts({ ...best, gapH: 3 }, best, data), ['שעתיים יותר חלונות']);
  assert.deepEqual(compareAlts(best, best, data), ['אותם קורסים, שיבוץ אחר']);
});

test('hoursText: half hours the way a student says them', async () => {
  const { hoursText } = await import('../web/ui-text.js');
  assert.deepEqual([0.5, 1, 1.5, 2, 2.5, 6].map(hoursText), ['חצי שעה', 'שעה', 'שעה וחצי', 'שעתיים', '2.5 שעות', '6 שעות']);
});

test('compareAlts: the same groups (a year plan whose semester did not change) say so', async () => {
  const { compareAlts } = await import('../web/ui-text.js');
  const x = { courses: ['A'], groups: ['g1', 'g2'], unlocks: 1, freeDays: [], gapH: 1, withFriends: [] };
  assert.deepEqual(compareAlts({ ...x, groups: ['g2', 'g1'] }, x, { courses: { A: { name: 'a' } } }), [
    'זהה לחלופה 1 בסמסטר הזה'
  ]);
  assert.deepEqual(compareAlts({ ...x, courses: [], groups: [] }, { ...x, courses: [], groups: [] }, { courses: {} }), [
    'זהה לחלופה 1 בסמסטר הזה'
  ]);
});

test('DISCLAIMER is the owner-approved line; disclaimerHtml links "יועץ לימודים" only when a URL is set, escaped', () => {
  assert.equal(DISCLAIMER, 'אינו הרשמה ואינו המלצה. לפני ההרשמה מומלץ להתייעץ עם יועץ לימודים.');
  assert.equal(disclaimerHtml(''), DISCLAIMER);
  assert.doesNotMatch(disclaimerHtml(''), /<a/);
  const h = disclaimerHtml('https://x/y');
  assert.equal(h.match(/<a /g).length, 1);
  assert.ok(h.includes('<a href="https://x/y" target="_blank" rel="noopener">יועץ לימודים</a>'));
  assert.equal(h.replace(/<[^>]+>/g, ''), DISCLAIMER, 'the visible text is the same line');
  assert.doesNotMatch(disclaimerHtml('https://x/"><b>'), /"><b>/);
  for (const u of ['https://x/?q=$&', 'https://x/a$`b', "https://x/a$'b", 'https://x/$$'])
    assert.ok(disclaimerHtml(u).includes(`<a href="${esc(u)}" target`), `$-patterns in ${u} stay literal`);
});

test('groupFresh: full / free / seats left, then the time in Israel (a group own fetchedAt wins)', () => {
  const at = '2026-10-16T05:08:00Z',
    now = new Date('2026-10-16T12:00:00Z');
  assert.equal(groupFresh({ full: true }, at, now), 'מלא · נכון ל-08:08');
  assert.equal(groupFresh({ full: false, seatsLeft: 3 }, at, now), 'נשארו 3 מקומות · נכון ל-08:08');
  assert.equal(groupFresh({ full: false, seatsLeft: 1 }, at, now), 'נשאר מקום אחד · נכון ל-08:08');
  assert.equal(groupFresh({ full: false }, at, now), 'פנוי · נכון ל-08:08');
  assert.equal(groupFresh({ full: false, fetchedAt: '2026-10-16T10:30:00Z' }, at, now), 'פנוי · נכון ל-13:30');
  assert.equal(groupFresh({ full: true, seatsLeft: 5 }, at, now), 'מלא · נכון ל-08:08'); // full wins over a stale count
  assert.equal(groupFresh({ full: false, seatsLeft: '<x>' }, at, now), 'פנוי · נכון ל-08:08'); // only a whole number is a count
  assert.equal(groupFresh({ full: false }, undefined, now), 'פנוי'); // no time anywhere: say nothing about when
  assert.equal(groupFresh({ full: false }, 'not a date', now), 'פנוי');
  assert.equal(groupFresh({ full: false }, '2026-01-16T05:08:00Z', now), 'פנוי · נכון ל-16.01, 07:08'); // winter: +02:00, another day
  assert.equal(groupFresh({ full: false }, '2026-10-15T18:08:00Z', now), 'פנוי · נכון ל-15.10, 21:08'); // yesterday
  assert.equal(groupFresh({ full: false }, '2026-10-16T21:30:00Z', now), 'פנוי · נכון ל-17.10, 00:30'); // 00:30 Israel is already tomorrow
  assert.equal(
    groupFresh({ full: false }, '2026-10-16T21:30:00Z', new Date('2026-10-16T22:00:00Z')),
    'פנוי · נכון ל-00:30'
  ); // same Israel day, not same UTC day
});

test('turnWarning: only when the data predates my turn and the turn has opened (instants, not strings)', () => {
  const turns = [
    { id: 'a', label: 'תור א', opensAt: '2026-11-01T08:00:00+02:00' },
    { id: 'b', label: 'תור ב', opensAt: '2026-11-02T06:00:00Z' }
  ];
  const MSG = 'שימו לב: הנתונים נמשכו לפני פתיחת התור שלך. ייתכנו שינויים במקומות הפנויים.';
  const after = new Date('2026-11-01T07:00:00Z'),
    before = new Date('2026-11-01T05:00:00Z');
  assert.equal(turnWarning([], 'a', '2026-10-30T00:00:00Z', after), null);
  assert.equal(turnWarning(turns, 'zzz', '2026-10-30T00:00:00Z', after), null);
  assert.equal(turnWarning(turns, undefined, '2026-10-30T00:00:00Z', after), null);
  assert.equal(turnWarning(turns, 'a', '2026-10-30T00:00:00Z', after), MSG);
  assert.equal(turnWarning(turns, 'a', '2026-11-01T06:30:00Z', after), null); // fetched after it opened
  assert.equal(turnWarning(turns, 'a', '2026-10-30T00:00:00Z', before), null); // not open yet
  assert.equal(turnWarning(turns, 'a', '2026-11-01T05:59:00Z', after), MSG); // 08:00+02:00 is 06:00Z: 05:59Z is before it
  assert.equal(turnWarning(turns, 'a', '2026-11-01T06:01:00Z', after), null);
  assert.equal(turnWarning(turns, 'b', '2026-11-02T05:59:00Z', new Date('2026-11-02T06:00:00Z')), MSG);
  assert.equal(turnWarning(turns, 'a', '2026-11-01T08:30:00+03:00', after), MSG); // +03:00 is 05:30Z
  assert.equal(turnWarning(turns, 'a', undefined, after), null); // no fetch time: nothing to compare
});

test('groupFresh: no seats left means full', () => {
  assert.equal(
    groupFresh({ full: false, seatsLeft: 0 }, '2026-10-16T05:08:00Z', new Date('2026-10-16T12:00:00Z')),
    'מלא · נכון ל-08:08'
  );
});

test('examsNoteHtml: the note of settings.json beside the exam dates, escaped, or nothing', () => {
  assert.equal(examsNoteHtml(''), '');
  assert.equal(examsNoteHtml('a<b'), '<p class="hint">a&lt;b</p>');
});

test('freshAt: the later of the data change and the last good check that covers this semester', () => {
  const data = { year: 2027, semester: 'א', program: 30, startYear: 2026, fetchedAt: '2026-10-16T18:08:48.356Z' };
  const status = (o = {}) => ({
    checkedAt: '2026-10-20T04:00:00Z',
    ok: true,
    semesters: { '2027-1/30-2026': { hash: 'h', changedAt: 'x' } },
    ...o
  });
  assert.equal(freshAt(data, status()), '2026-10-20T04:00:00Z'); // a check after the change
  assert.equal(freshAt(data, status({ checkedAt: '2026-10-10T04:00:00Z' })), data.fetchedAt); // a check before the change
  assert.equal(freshAt(data, status({ ok: false })), data.fetchedAt);
  // the file's own check, not the time of a run that did not build it
  assert.equal(freshAt(data, status({ semesters: { '2027-1/30-2026': { checkedAt: '2026-10-17T04:00:00Z' } } })), '2026-10-17T04:00:00Z');
  assert.equal(freshAt(data, status({ semesters: { '2027-1/30-2026': { checkedAt: '2026-10-10T04:00:00Z' } } })), data.fetchedAt);
  // a status from before the field: the last run stands for every file, until the first run that writes it
  assert.equal(freshAt(data, status({ semesters: { '2027-1/30-2026': {}, '2027-2/30-2026': {} } })), '2026-10-20T04:00:00Z');
  // after that run, a file it did not build is not covered by it
  assert.equal(freshAt(data, status({ semesters: { '2027-1/30-2026': {}, '2027-2/30-2026': { checkedAt: '2026-10-20T04:00:00Z' } } })), data.fetchedAt);
  assert.equal(freshAt(data, null), data.fetchedAt);
  assert.equal(freshAt(data, {}), data.fetchedAt);
  assert.equal(freshAt(data, status({ semesters: { '2027-2/30-2026': {} } })), data.fetchedAt); // another semester only
  assert.equal(freshAt(data, status({ semesters: { '2027-1/20-2026': {} } })), data.fetchedAt); // another program only
  assert.equal(
    freshAt({ ...data, semester: 'ב' }, status({ semesters: { '2027-2/30-2026': {} } })),
    '2026-10-20T04:00:00Z'
  );
  assert.equal(freshAt(data, status({ checkedAt: '2026-10-20T07:00:00+03:00' })), '2026-10-20T07:00:00+03:00'); // instants, not strings
  assert.equal(freshAt(data, status({ checkedAt: 'soon' })), data.fetchedAt);
  assert.equal(freshAt({ ...data, fetchedAt: undefined }, status()), '2026-10-20T04:00:00Z');
  assert.equal(freshAt({ ...data, fetchedAt: undefined }, null), undefined);
});

test('conflictsFor: only the texts whose cohorts include the start year; [] for an unknown program or no settings', () => {
  const st = {
    programs: {
      22: {
        conflicts: [
          { cohorts: [2026, 2027], text: 'א' },
          { cohorts: [2024], text: 'ב' }
        ]
      },
      20: { approved: { 2024: '2026-07-01' } }
    }
  };
  assert.deepEqual(conflictsFor(st, 22, 2026), ['א']);
  assert.deepEqual(conflictsFor(st, 22, 2024), ['ב']);
  assert.deepEqual(conflictsFor(st, 22, 2025), []);
  assert.deepEqual(conflictsFor(st, 20, 2024), [], 'a program with no conflicts');
  assert.deepEqual(conflictsFor(st, 99, 2024), [], 'an unknown program');
  assert.deepEqual(conflictsFor(undefined, 22, 2026), []);
  assert.deepEqual(conflictsFor({}, 22, 2026), []);
  assert.deepEqual(conflictsFor(st, 'constructor', 2026), []);
});

test('reportMailto: subject, a body with every field, under 1800 characters even with long fields', () => {
  const ctx = {
    program: 'הנדסה מכנית (30)',
    startYear: 2026,
    semester: 'א',
    group: 'הרצאה · קבוצה 01 · קורס 10013',
    page: 'מערכות'
  };
  const url = reportMailto('a@b', ctx);
  assert.ok(url.startsWith('mailto:a@b?subject='), url);
  const q = new URLSearchParams(url.slice(url.indexOf('?') + 1));
  assert.equal(q.get('subject'), 'דיווח על טעות במערכת השעות');
  for (const v of Object.values(ctx)) assert.ok(q.get('body').includes(String(v)), `${v} in the body`);
  assert.ok(url.length < 1800);
  assert.ok(
    url.includes('%0D%0A') && !q.get('body').replaceAll('\r\n', '').includes('\n'),
    'line breaks are CRLF (%0D%0A)'
  );
  const { group, ...noGroup } = ctx;
  assert.ok(
    !new URLSearchParams(reportMailto('a@b', noGroup).split('?')[1]).get('body').includes('קבוצה'),
    'no group line without a group'
  );
  const long = 'ש'.repeat(500),
    big = reportMailto('a@b', { program: long, startYear: 2026, semester: 'א', group: long, page: long });
  assert.ok(big.length < 1800, `a long field is clipped (${big.length})`);
});

test('reportMailto: the address cannot add a header, a second recipient or a fragment', () => {
  const url = reportMailto('a@b.c?cc=x@y&bcc=z@w,q@r#h', { program: 'p', startYear: 1, semester: 'א', page: 'x' });
  const i = url.indexOf('?subject=');
  assert.ok(i > 0 && !/[?&,#]/.test(url.slice('mailto:'.length, i)), url);
  assert.equal([...new URLSearchParams(url.slice(i + 1)).keys()].join(), 'subject,body');
});

test('capPreviewText: what one more credit adds, what it drops, and when it changes nothing', () => {
  const nameOf = (id) => ({ a: 'אלגברה', b: 'ביולוגיה', c: 'כימיה' })[id];
  const now = { groups: ['1', '2'], courses: ['a', 'b'], credits: 20, unlocks: 3 };
  const same = capPreviewText({ cap: 21, now, wider: { ...now, groups: ['2', '1'] }, nameOf });
  assert.equal(same.changed, false);
  assert.match(same.text, /גם עם תקרה של 21 נ״ז/);
  assert.equal(capPreviewText({ cap: 21, now, wider: null, nameOf }).changed, false);
  const more = capPreviewText({ cap: 21, now, wider: { groups: ['1', '2', '3'], courses: ['a', 'b', 'c'], credits: 21, unlocks: 5 }, nameOf });
  assert.equal(more.changed, true);
  assert.equal(more.text, '21 נ״ז: נכנס גם כימיה, נפתחים עוד 2 קורסים.');
  const one = capPreviewText({ cap: 21, now, wider: { groups: ['1', '3'], courses: ['a', 'c'], credits: 21, unlocks: 4 }, nameOf });
  assert.equal(one.text, '21 נ״ז: נכנס גם כימיה, בלי ביולוגיה, נפתח עוד קורס אחד.');
  const swap = capPreviewText({ cap: 21, now, wider: { ...now, groups: ['1', '9'] }, nameOf });
  assert.equal(swap.text, '20 נ״ז: אותם קורסים, שיבוץ אחר.');
  const year = capPreviewText({ cap: 21, now, wider: { ...now, groups: ['1', '9'], credits: 41, unlocks: 2 }, nameOf, year: true });
  assert.equal(year.text, 'בכל השנה 41 נ״ז: נפתח קורס אחד פחות.');
  const cut = (wider) => capPreviewText({ cap: 21, now, wider, nameOf, partial: true });
  assert.match(cut(null).text, /נעצר בגלל מגבלת הזמן/, 'a search cut short does not claim there is no other plan');
  assert.doesNotMatch(cut(null).text, /לא נמצאה מערכת אחרת\.$/);
  assert.match(cut({ ...now, groups: ['1', '9'] }).text, /^20 נ״ז: אותם קורסים, שיבוץ אחר\. .*נעצר בגלל מגבלת הזמן/);
});

test('notFoundHint: names the course codes missing from the track data; a course it has, group ids and name keys get no hint', () => {
  const courses = { 90916: { name: 'x', groups: [] } };
  const b = (c) => `<bdi dir="ltr">${c}</bdi>`;
  assert.equal(notFoundHint([], courses, true), '');
  assert.equal(notFoundHint(['271033601', '271033602/1'], courses, true), ''); // group ids from pasted text: not a track matter
  assert.equal(notFoundHint(['אנליזההרמונית'], courses, true), ''); // a name the grid reader could not place is not a code
  // the course is in the data and no group fits the hours read (friend-schedule.test: 30112 at 07:00): the track is not the reason
  assert.equal(notFoundHint(['90916'], courses, true), '');
  assert.equal(notFoundHint(['30112', '90916'], courses, true), `הקורס ${b('30112')} לא קיים בנתוני המסלול שבחרתם. בדקו שהמסלול ושנת הלימודים נכונים.`);
  assert.equal(
    notFoundHint(['30112', '30131', '271033601'], courses, true),
    `הקורסים ${b('30112')}, ${b('30131')} לא קיימים בנתוני המסלול שבחרתם. בדקו שהמסלול ושנת הלימודים נכונים.`
  );
  assert.equal(notFoundHint(['30112'], courses, false), `הקורס ${b('30112')} לא קיים בנתוני המסלול שלכם. ייתכן שהחבר לומד אותו במסלול אחר.`);
  assert.equal(
    notFoundHint(['30112', '30131'], courses, false),
    `הקורסים ${b('30112')}, ${b('30131')} לא קיימים בנתוני המסלול שלכם. ייתכן שהחבר לומד אותם במסלול אחר.`
  );
  const many = Array.from({ length: 10 }, (_, k) => String(40000 + k));
  assert.match(notFoundHint(many, courses, true), /40007<\/bdi> ועוד 2 לא קיימים/);
});

// ---------- lecturer names ----------
import { lecturerNames, lecturerText, lecturerToast } from '../web/ui-text.js';

test('lecturerText: the yedion puts ",," (or ", " or a leading ",") between co-lecturers; people read one comma and a space', () => {
  assert.equal(lecturerText('מר אלקיים רמי,, מר שפירא יובל'), 'מר אלקיים רמי, מר שפירא יובל');
  assert.equal(lecturerText('מר ארנפלד יוסף, גב\' ארן ירדן'), 'מר ארנפלד יוסף, גב\' ארן ירדן');
  assert.equal(lecturerText(', מר אולבינסקי אלכסנדר'), 'מר אולבינסקי אלכסנדר');
  assert.equal(lecturerText('ד"ר כץ אייל,,, מר הרשקוביץ שני , '), 'ד"ר כץ אייל, מר הרשקוביץ שני');
  assert.equal(lecturerText('ד"ר יבור ינון'), 'ד"ר יבור ינון', 'one lecturer: untouched');
  assert.equal(lecturerText(''), '');
  assert.equal(lecturerText(undefined), '');
  assert.deepEqual(lecturerNames('א,, ב,, א'), ['א', 'ב'], 'a name once');
});

test('lecturerToast: the toast after a prefer / avoid / cancel names the lecturers the way the popover does', () => {
  const name = 'מר X,, מר Y';
  assert.equal(lecturerToast(name, 'avoid', false), 'החיפוש לא ישבץ קבוצות של מר X, מר Y');
  assert.equal(lecturerToast(name, 'prefer', false), 'כשאפשר, החיפוש יבחר קבוצות של מר X, מר Y');
  assert.equal(lecturerToast(name, 'avoid', true), 'בוטל: מר X, מר Y');
});

test('splitReason: a trailing citation of a regulation is split off, any other text is left whole', () => {
  assert.deepEqual(splitReason('רק יחד עם פיזיקה חשמל ומגנטיות (קורס מקביל, תקנון 6.2.3)'), { short: 'רק יחד עם פיזיקה חשמל ומגנטיות', cite: 'קורס מקביל, תקנון 6.2.3' });
  assert.deepEqual(splitReason('רק יחד עם א או ב, ג (קורס מקביל, תקנון 6.2.3)'), { short: 'רק יחד עם א או ב, ג', cite: 'קורס מקביל, תקנון 6.2.3' });
  assert.deepEqual(splitReason('אפשר בסמסטר ב׳ אחרי חוזק חומרים 1'), { short: 'אפשר בסמסטר ב׳ אחרי חוזק חומרים 1', cite: '' });
  assert.deepEqual(splitReason('מבוא (חלק א) דורש משהו'), { short: 'מבוא (חלק א) דורש משהו', cite: '' }, 'a parenthetical in the middle, or one that names no regulation, stays');
  assert.deepEqual(splitReason('דורש א (חלק ב)'), { short: 'דורש א (חלק ב)', cite: '' });
  assert.deepEqual(splitReason(''), { short: '', cite: '' });
});

test('groupFreshParts / sharedFreshAt: the state and the time apart, and a time said once only when every group shares it', () => {
  const now = new Date('2026-10-16T12:00:00Z'),
    at = '2026-10-16T05:08:00Z';
  const sa = (x, f) => ((p) => ({ state: p.state, at: p.at }))(groupFreshParts(x, f, now));
  assert.deepEqual(sa({ full: true }, at), { state: 'מלא', at: '08:08' });
  assert.deepEqual(sa({ full: false, seatsLeft: 3, fetchedAt: '2026-10-15T18:13:00Z' }, at), { state: 'נשארו 3 מקומות', at: '15.10, 21:13' });
  assert.deepEqual(sa({ full: false }, undefined), { state: 'פנוי', at: '' });
  assert.equal(groupFreshParts({ full: false }, undefined, now).minute, null);
  const g = [{ full: false }, { full: true, seatsLeft: 2 }, { full: false }];
  for (const x of g) assert.equal(groupFresh(x, at, now), `${groupFreshParts(x, at, now).state} · נכון ל-08:08`, 'groupFresh is the two halves joined');
  const same = g.map((x) => groupFreshParts(x, at, now));
  assert.equal(sharedFreshAt(same), '08:08');
  assert.equal(sharedFreshAt([...same, groupFreshParts({ full: false, fetchedAt: '2026-10-15T18:13:00Z' }, at, now)]), '', 'a group with a time of its own');
  assert.equal(sharedFreshAt([...same, groupFreshParts({ full: false }, undefined, now)]), '', 'a group with no time');
  assert.equal(sharedFreshAt([]), '', 'nothing listed');
  assert.equal(sharedFreshAt([groupFreshParts({ full: false }, at, now)]), '08:08', 'one group shares with itself');
});

test('sharedFreshAt compares the instants, not their labels: the hour the clocks go back and the same date a year on read alike but are not shared', () => {
  const now = new Date('2026-10-24T12:00:00Z');
  const p = (iso) => groupFreshParts({ full: false, fetchedAt: iso }, undefined, now);
  const [x, y] = [p('2026-10-24T22:30:00Z'), p('2026-10-24T23:30:00Z')];
  assert.equal(x.at, y.at, 'the labels are the same (the 02:30 / 01:30 repeat)');
  assert.equal(sharedFreshAt([x, y]), '');
  const [last, prev] = [p('2026-10-25T05:08:00Z'), p('2025-10-25T05:08:00Z')];
  assert.equal(sharedFreshAt([last, prev]), '', 'a year apart');
  assert.equal(sharedFreshAt([p('2026-10-25T05:08:00Z'), p('2026-10-25T05:08:30Z')]), '25.10, 07:08', 'the same minute is one time');
});

test('the switcher label: computing, an alternative, or none', () => {
  assert.equal(altLabelText({ nAlt: 0, cur: 0, split: false, running: true }), 'מחשב חלופות…');
  assert.equal(altLabelText({ nAlt: 10, cur: 2, split: false, running: true }), 'חלופה 3 מתוך 10');
  assert.equal(altLabelText({ nAlt: 10, cur: 0, split: true, running: false }), 'חלופה 1 מתוך 10 · מופרדת');
  assert.equal(altLabelText({ nAlt: 0, cur: 0, split: false, running: false }), 'אין חלופות');
});
