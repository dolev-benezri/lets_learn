// Small synthetic Dataset: A (physics) → B → C chain, P parallel-requires Q, X has an unknown prereq.
const grp = (id, day, start, end, extra = {}) => ({
  id, type: 'סופי-הרצאה+תרגול', primary: true, lecturer: 'L', full: false, semester: 'א',
  linked: [], meetings: [{ day, start, end, room: 'r' }], exams: [], ...extra,
});
const sub = (id, day, start, end) => ({ ...grp(id, day, start, end), type: 'תרגול', primary: false });

export function mini() {
  return {
    fetchedAt: '2026-10-01T00:00:00Z', year: 2027, startYear: 2026, program: 30, semester: 'א', examsPublished: true,
    lists: [
      { code: 30001, name: "קורסי חובה שנה א'", minCredits: 10, courses: ['A', 'Q0'] },
      { code: 30002, name: "קורסי חובה שנה ב'", minCredits: 20, courses: ['B', 'C', 'P', 'Q', 'X', 'N'] },
    ],
    courses: {
      A: { name: 'פיזיקה-מכניקה', credits: 5, offered: true, prereqs: [], groups: [
        grp('A1', 2, '08:00', '09:50', { linked: ['A1/1', 'A1/2'], exams: [{ kind: 'בחינה', moed: 1, date: '2027-02-04', time: '09:00' }] }),
        sub('A1/1', 3, '10:00', '11:50'), sub('A1/2', 4, '10:00', '11:50'),
        grp('A2', 1, '12:00', '13:50', { exams: [{ kind: 'בחינה', moed: 1, date: '2027-02-04', time: '09:00' }] }),
      ] },
      Q0: { name: 'חדו"א 1', credits: 5, offered: true, prereqs: [], groups: [grp('Q01', 5, '08:00', '09:50')] },
      B: { name: 'דינמיקה', credits: 4, offered: true, prereqs: [{ kind: 'קדם', anyOf: [{ id: 'A', name: 'פיזיקה-מכניקה' }] }], groups: [grp('B1', 2, '10:00', '11:50')] },
      C: { name: 'רטט', credits: 3, offered: true, prereqs: [{ kind: 'קדם', anyOf: [{ id: 'B', name: 'דינמיקה' }] }], groups: [grp('C1', 3, '08:00', '09:50')] },
      P: { name: 'תרמו 2', credits: 3, offered: true, prereqs: [{ kind: 'מקביל', anyOf: [{ id: 'Q', name: 'משוואות' }] }], groups: [grp('P1', 1, '08:00', '09:50')] },
      Q: { name: 'משוואות', credits: 4, offered: true, prereqs: [], groups: [
        grp('Q1', 1, '10:00', '11:50', { exams: [{ kind: 'בחינה', moed: 1, date: '2027-02-10', time: '09:00' }] }),
        grp('Q2', 2, '08:30', '10:20', { full: true }),
      ] },
      X: { name: 'קורס עם קדם חיצוני', credits: 2, offered: true, prereqs: [{ kind: 'קדם', anyOf: [{ id: null, name: 'קורס הכנה פיזיקה' }] }], groups: [grp('X1', 4, '14:00', '15:50')] },
      N: { name: 'לא נלמד', credits: 3, offered: false, prereqs: [], groups: [] },
    },
  };
}
