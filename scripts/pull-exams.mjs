#!/usr/bin/env node
// By hand, not nightly: exam dates from the course pages into scripts/exams-{year}.json. The nightly build reads that file, so exams cost it no request.
// Afeka's exam table (S_EXAMS) was empty for 2027 when the course pages already had the dates. If the table is published, its rows go first (buildDataset).
// node scripts/pull-exams.mjs [--year 2027]   Stopped? Run it again and it continues. To refresh the dates, delete .yedion-exams-cache first.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { parseCourseExams, parseGroups } from './parse.mjs';
import { cachedRequester, makeRequester, patient, yearCache } from './scrape.mjs';

const SEMESTER = { '-N1': 'א', '-N2': 'ב', '-N3': 'קיץ' }; // the second argument of a details link

// ponytail: one group per course and semester, since no lecturer differed in a sample of 41 pairs (2026-11-02). Pull by lecturer if a course ever differs.
export function detailsToPull(groups) {
  const out = new Map();
  for (const g of groups) {
    const semester = g.primary && g.detailsArgs ? SEMESTER[g.detailsArgs.split(',')[1]] : null;
    if (semester && !out.has(semester)) out.set(semester, { semester, args: g.detailsArgs });
  }
  return [...out.values()];
}

// Rows in the shape buildDataset reads. lecturer null: the row is for every primary group of the course in that semester.
export async function pullExams({ ids, request, log = console.error }) {
  const rows = [];
  for (const [i, courseId] of ids.entries()) {
    const groups = parseGroups(await request(`prgname=S_LOOK_FOR_NOSE&arguments=-N${courseId}`));
    for (const { semester, args } of detailsToPull(groups))
      for (const { kind, moeds } of parseCourseExams(await request(`prgname=S_CourseDetails&arguments=${args}`)))
        rows.push({ semester, courseId, lecturer: null, kind, moeds });
    log(`[${i + 1}/${ids.length}] ${courseId}: ${rows.length} rows so far`);
  }
  return rows;
}

// Every course with groups in the published data of that year.
function courseIds(year) {
  const ids = new Set();
  for (const n of [1, 2, 3]) {
    const dir = `web/data/afeka/${year}-${n}`;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')))
      for (const [id, c] of Object.entries(JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')).courses)) if (c.groups.length) ids.add(id);
  }
  return [...ids].sort();
}

async function main() {
  const { year } = parseArgs({ options: { year: { type: 'string', default: '2027' } } }).values;
  const request = cachedRequester(patient(makeRequester(), { year }), await yearCache('.yedion-exams-cache', year));
  await request('prgname=Enter_Search');
  await request(null, { PRGNAME: 'Enter_Search', ARGUMENTS: '-A,,-A,ChangeYear', ChangeYear: year });
  const rows = await pullExams({ ids: courseIds(year), request });
  if (!rows.length) throw new Error('no exam on any course page: nothing written (did the page change?)');
  writeFileSync(new URL(`./exams-${year}.json`, import.meta.url), `[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`);
  console.log(`${rows.length} rows written to scripts/exams-${year}.json`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error('FAILED', e.message);
    process.exit(1);
  });
}
