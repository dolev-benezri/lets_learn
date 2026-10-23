// Data shapes buildOptions relies on: does every option a primary builds cover every sub-group type the course has?
import fs from 'node:fs';
const { buildOptions } = await import('../../web/solver-core.js');
const root = 'web/data/afeka/';
let files = 0, courses = 0;
const missingType = [], noPrimary = [];
for (const sem of ['2027-1', '2027-2', '2027-3']) for (const f of fs.readdirSync(root + sem)) {
  files++;
  const d = JSON.parse(fs.readFileSync(root + sem + '/' + f));
  for (const [id, c] of Object.entries(d.courses)) {
    if (!c.offered || !c.groups.length) continue;
    courses++;
    const subTypes = new Set(c.groups.filter((g) => !g.primary).map((g) => g.type));
    if (!c.groups.some((g) => g.primary)) { noPrimary.push(`${sem}/${f} ${id}`); continue; }
    const opts = buildOptions(c, { includeFull: true });
    const byId = new Map(c.groups.map((g) => [g.id, g]));
    const bad = opts.filter((o) => {
      const t = new Set(o.groups.map((x) => byId.get(x).type));
      return [...subTypes].some((s) => !t.has(s));
    });
    if (bad.length) missingType.push({ file: `${sem}/${f}`, id, name: c.name, subTypes: [...subTypes],
      opt: bad[0].groups.map((x) => byId.get(x).type), lecture: bad[0].groups[0], nBad: bad.length, nAll: opts.length,
      prim: c.groups.filter((g) => g.primary).map((g) => `${g.id}:${g.type}:linked=${g.linked.length}`) });
  }
}
console.log({ files, offeredCourses: courses, coursesWithNoPrimary: noPrimary.length, filesCoursesWhereAnOptionLacksASubType: missingType.length });
const uniq = new Map();
for (const m of missingType) uniq.set(m.id, m);
console.log('distinct course ids:', uniq.size);
for (const m of [...uniq.values()].slice(0, 15))
  console.log(m.id, m.name, '| sub types:', m.subTypes.join('/'), '| option:', m.opt.join('+'), `(${m.lecture})`, `| ${m.nBad}/${m.nAll} options |`, m.prim.join(' '), '|', m.file);
console.log('noPrimary sample', noPrimary.slice(0, 5));
