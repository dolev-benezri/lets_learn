// "רק ב׳" (scope 'ב'): app.js pickData shows the ב׳ file alone; refresh() classifies it as the site does
// (withAfterA with the א׳ file, since the #42 fix). How many of the study year's ב׳ courses are blocked there but
// plannable in the year view? Before the fix: 297 blocked, 290 of them plannable. After it: 0 plannable.
import fs from 'node:fs';
const { classify, withAfterA } = await import('../../web/rules.js');
const { yearView } = await import('../../web/app.js');
const root = 'web/data/afeka/';
const out = [];
for (const f of fs.readdirSync(root + '2027-2')) {
  const A = JSON.parse(fs.readFileSync(root + '2027-1/' + f)), B = JSON.parse(fs.readFileSync(root + '2027-2/' + f));
  for (const year of [1, 2]) {
    const before = 'אבגדה'.slice(0, year - 1);
    const passed = [...new Set(B.lists.filter((l) => [...before].some((y) => l.name.includes(`שנה ${y}'`))).flatMap((l) => l.courses))];
    const yl = B.lists.find((l) => l.name.includes(`שנה ${' אבגדה'[year]}'`))?.courses ?? [];
    const st = { passed, failed: {}, profile: { year, amirnet: 150 }, outsideDone: [] };
    const onlyB = withAfterA(B, st, classify(B, st), A).statuses;
    const yv = { ...yearView(A, B), fetchedAt: A.fetchedAt };
    const yearSt = withAfterA(yv, st, classify(yv, st)).statuses;
    const inB = yl.filter((id) => B.courses[id]?.offered);
    const blockedB = inB.filter((id) => onlyB[id]?.status === 'blocked');
    const openInYear = blockedB.filter((id) => ['afterA', 'available', 'conditional'].includes(yearSt[id]?.status));
    out.push({ f, year, yearListInB: inB.length, blockedInScopeB: blockedB.length, plannableInYearView: openInYear.length,
      sample: openInYear.slice(0, 3).map((id) => B.courses[id].name) });
  }
}
const tot = (k) => out.reduce((s, r) => s + r[k], 0);
console.log({ instances: out.length, yearListCoursesInB: tot('yearListInB'), blockedInScopeB: tot('blockedInScopeB'), plannableInYearView: tot('plannableInYearView') });
console.log(out.find((r) => r.f === '30-2026.json' && r.year === 1));
