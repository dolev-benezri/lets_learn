// F-07: what the user sees for cap 0. Run: node solver-audit/plan-probes/cap0-diagnosis.mjs  (WEB=./sandbox/web/ to run on the patched copy)
const { search } = await import(process.env.WEB ? `${process.env.WEB}solver-core.js` : '../../web/solver-core.js');
const grp = (id, day, h) => ({ id, type: 'הרצאה', primary: true, lecturer: 'L' + id, full: false, semester: 'א', linked: [], meetings: [{ day, start: `${h}:00`, end: `${h}:50`, room: 'r' }], exams: [] });
const data = { semester: 'א', year: 2027, startYear: 2026, examsPublished: false, courses: { A: { name: 'A', credits: 3, offered: true, prereqs: [], groups: [grp('gA', 1, '09')] } } };
for (const cap of [null, 0, 2, 3]) { const r = search({ data, courses: [{ id: 'A', mode: 'must' }], constraints: { maxCredits: cap }, weights: { progress: 1 }, topK: 3 }); console.log(`cap=${cap} results=${r.results.length} diagnosis=${r.diagnosis[0] ?? ''}`); }
