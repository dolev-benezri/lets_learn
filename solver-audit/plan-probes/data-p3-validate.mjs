// Run the PROPOSED validate() (scripts-fixed/build.mjs) over the offline rebuilt (fixed-parser) data with prev = committed data,
// and show the largest prerequisite-count change per file (guard is 20%). Also run the candidate regression tests against current vs fixed validate().
// Run: node solver-audit/plan-probes/data-p3-validate.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { validate as vFixed } from './scripts-fixed/build.mjs';
import { validate as vOrig } from '../../scripts/build.mjs';
const here = new URL('./', import.meta.url), committed = new URL('../../web/data/afeka/', import.meta.url);
const rd = (u) => JSON.parse(fs.readFileSync(u, 'utf8'));
const files = ['2027-1', '2027-2', '2027-3'].flatMap((s) => fs.readdirSync(new URL(`out-after/${s}/`, here)).map((f) => `${s}/${f}`));
const pc = (d, ids) => ids.reduce((a, id) => a + d.courses[id].prereqs.length, 0);
let errs = 0, worst = { f: '', pct: 0 }; const sample = [];
for (const f of files) {
  const a = rd(new URL(`out-after/${f}`, here)), c = rd(new URL(f, committed));
  const e = vFixed(a, c, null, 1).errors; errs += e.length; if (e.length && sample.length < 4) sample.push(`${f}: ${e[0]}`);
  const common = Object.keys(a.courses).filter((id) => c.courses[id]);
  const x = pc(c, common), y = pc(a, common), pct = x ? Math.abs((y - x) / x) * 100 : 0;
  if (pct > worst.pct) worst = { f, pct };
}
console.log(`INFO proposed validate() on 144 rebuilt files vs committed: errors ${errs} ${sample.join(' | ')}; largest prerequisite-count change ${worst.pct.toFixed(1)}% (${worst.f}); guard 20%`);
// candidate regression tests (same shape as test/build.test.mjs healthy())
const mk = (id) => ({ name: id, credits: 3, offered: true, prereqs: [{ kind: 'קדם', anyOf: [{ id: null, name: 'x' }] }],
  groups: [{ id: `${id}01`, primary: true, full: false, linked: [], meetings: [{ day: 2, start: '08:00', end: '09:50', room: 'r' }], exams: [{ kind: 'בחינה', moed: 1, date: '2027-02-04', time: '09:00' }] }] });
const healthy = () => { const courses = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [String(20000 + i), mk(String(20000 + i))]));
  courses['90903'] = mk('90903'); courses['90903'].groups = [1, 2, 3].map((n) => ({ ...courses['20000'].groups[0], id: `9090${n}` }));
  return { year: 2027, startYear: 2026, examsPublished: true, lists: [], courses }; };
const t1 = (validate) => {
  for (const [start, end] of [['22:00', '23:20'], ['23:00', '23:30'], ['08:15', '09:50'], ['08:50', '09:40']]) {
    const d = healthy(); Object.assign(d.courses['20001'].groups[0].meetings[0], { start, end });
    assert.ok(validate(d).errors.some((e) => e.includes('implausible hours')), `${start}-${end}`);
  }
  for (const [start, end] of [['08:00', '22:50'], ['08:30', '23:00'], ['22:00', '22:50']]) {
    const d = healthy(); Object.assign(d.courses['20001'].groups[0].meetings[0], { start, end });
    assert.deepEqual(validate(d).errors, [], `${start}-${end}`);
  }
};
const t2 = (validate) => {
  const d = healthy(); d.courses['20002'].prereqs = [{ kind: 'קדם', anyOf: [{ id: '20002', name: 'x' }] }];
  assert.ok(validate(d).errors.some((e) => e.includes('20002') && e.includes('itself')));
  const ok = healthy(); ok.courses['20002'].prereqs = [{ kind: 'קדם', anyOf: [{ id: '20003', name: 'x' }] }];
  assert.deepEqual(validate(ok).errors, []);
};
for (const [name, t] of [['hours/grid', t1], ['self-ref', t2]]) for (const [lab, v] of [['CURRENT', vOrig], ['FIXED', vFixed]]) {
  try { t(v); console.log(`TEST ${name} on ${lab}: PASS`); } catch (e) { console.log(`TEST ${name} on ${lab}: FAIL (${e.message.slice(0, 80)})`); }
}
