// "תקרת נ״ז" in a full-year plan: per semester or per year? (the label says neither)
import fs from 'node:fs';
const { searchYear, showWeights } = await import('../../web/solver-core.js');
const root = 'web/data/afeka/';
const A = JSON.parse(fs.readFileSync(root + '2027-1/30-2026.json')), B = JSON.parse(fs.readFileSync(root + '2027-2/30-2026.json'));
const yearList = new Set(A.lists.find((l) => l.name.includes("שנה א'")).courses);
const state = { passed: [], failed: {}, choices: {}, semesterOf: {}, profile: { year: 1, amirnet: 120 }, outsideDone: [], load: 'even', sortBy: 'best' };
const base = { friends: 3, progress: 3, freeDays: 1, compact: 1, timeWindow: 1, examSpread: 1 };
const constraints = { dayOff: [6], notBefore: '', notAfter: '20:00', examsSameDay: 'forbid', blocks: [], lecturers: {}, maxCredits: 20 };
const r = searchYear({ dataA: A, dataB: B, state, yearList, constraints, weights: showWeights(base, 'best', []), friends: [], timeLimitMs: 3000 });
console.log('maxCredits 20 -> plans:', r.results.slice(0, 5).map((p) => `A ${p.credits.a} + B ${p.credits.b} = ${p.credits.a + p.credits.b}`));
