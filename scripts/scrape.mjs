#!/usr/bin/env node
// Scrape the public Afeka Yedion into web/data/afeka/{year}-{sem}/{program}-{start}.json.
// Writes nothing if any step or validation fails.
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { parseProgram, parseGroups, parseDetails, parseExams, isRejected, isThrottled } from './parse.mjs';
import { buildDataset, validate, compareToPrevious } from './build.mjs';

const BASE = 'https://yedionpub.afeka.ac.il/yedion/fireflyweb.aspx';
const LISTS = { 30: [30001, 30002, 30003, 30004, 30007, 30010, 30031, 30901, 60004] };
const DEPARTMENT = { 30: 'מכנית' };
const SEMESTER_CODE = { 'א': 1, 'ב': 2, 'קיץ': 3 };

const { values: opt } = parseArgs({ options: {
  year: { type: 'string', default: '2027' },
  start: { type: 'string', default: '2026' },
  program: { type: 'string', default: '30' },
  semester: { type: 'string', default: 'א' },
  delay: { type: 'string', default: '1000' },
  force: { type: 'boolean', default: false },
} });

const cookies = new Map();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(query, form) {
  for (let attempt = 0; ; attempt++) {
    await sleep(Number(opt.delay) * (attempt ? 5 * 2 ** (attempt - 1) : 1)); // retry after 5s, 10s, 20s, ...
    try {
      const res = await fetch(form ? BASE : `${BASE}?${query}`, {
        method: form ? 'POST' : 'GET',
        headers: {
          'User-Agent': 'afeka-scheduler/1.0 (student timetable tool)',
          ...(cookies.size && { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') }), // the WAF rejects an empty Cookie header
          ...(form && { 'Content-Type': 'application/x-www-form-urlencoded' }),
        },
        body: form ? new URLSearchParams(form) : undefined,
      });
      for (const c of res.headers.getSetCookie()) {
        const kv = c.split(';')[0];
        const i = kv.indexOf('=');
        cookies.set(kv.slice(0, i), kv.slice(i + 1));
      }
      // Retry on 429 and 5xx (network errors are caught in catch below)
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= 3) throw new Error(`HTTP ${res.status} for ${query ?? form.PRGNAME}`);
        console.warn(`HTTP ${res.status}, retrying (${attempt + 1}): ${query ?? form.PRGNAME}`);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${query ?? form.PRGNAME}`);
      const html = await res.text();
      if (isThrottled(html)) {
        const msg = html.replace(/<br>/g, ' ');
        if (!msg.includes('בדקה') || attempt >= 4) throw new Error(`site rate limit hit, nothing written: ${msg}`);
        console.warn(`per-minute limit, waiting 65s (${attempt + 1}): ${query ?? form.PRGNAME}`);
        await sleep(65000); // "try again in a minute"
        continue;
      }
      if (!isRejected(html)) return html;
      if (attempt >= 4) throw new Error(`request rejected by the site 5 times: ${query ?? form.PRGNAME}`);
      console.warn(`rejected, retrying (${attempt + 1}): ${query ?? form.PRGNAME}`);
    } catch (err) {
      // Retry on network errors
      if (err instanceof TypeError && attempt < 3) {
        console.warn(`network error, retrying (${attempt + 1}): ${err.message}`);
        continue;
      }
      throw err;
    }
  }
}

async function main() {
  const program = Number(opt.program);
  if (!LISTS[program]) throw new Error(`no list codes configured for program ${program}`);

  await request('prgname=Enter_Search');
  await request(null, { PRGNAME: 'Enter_Search', ARGUMENTS: '-A,,-A,ChangeYear', ChangeYear: opt.year });

  const lists = [];
  for (const code of LISTS[program]) {
    const p = parseProgram(await request(`prgname=S_SHOW_PROGS&arguments=-N${opt.start},-N${code}`));
    if (!p.courses.length) throw new Error(`list ${code} returned no courses`);
    lists.push({ code, ...p });
    console.log(`list ${code} "${p.name}": ${p.courses.length} courses`);
  }

  const ids = [...new Set(lists.flatMap((l) => l.courses.map((c) => c.id)))];
  const raw = {};
  for (const [i, id] of ids.entries()) {
    const groups = parseGroups(await request(`prgname=S_LOOK_FOR_NOSE&arguments=-N${id}`));
    const args = groups.find((g) => g.primary && g.detailsArgs)?.detailsArgs;
    const details = args ? parseDetails(await request(`prgname=S_CourseDetails&arguments=${args}`)) : null;
    raw[id] = { groups, details };
    console.log(`[${i + 1}/${ids.length}] ${id}: ${groups.length} groups, ${details ? `${details.credits} credits` : 'no details'}`);
  }

  const exams = parseExams(await request(null, {
    PRGNAME: 'S_EXAMS', ARGUMENTS: 'R1C28,R1C29,R1C30', R1C28: String(program), R1C29: '0', R1C30: '0',
  }));
  console.log(`exams: ${exams.length} rows`);

  const buildWarnings = [];
  const dataset = buildDataset({
    year: Number(opt.year), startYear: Number(opt.start), program, semester: opt.semester,
    department: DEPARTMENT[program], lists, raw, exams, fetchedAt: new Date().toISOString(), warnings: buildWarnings,
  });
  const { errors, warnings } = validate(dataset);
  [...buildWarnings, ...warnings].forEach((w) => console.warn('WARN', w));
  if (errors.length) {
    errors.forEach((e) => console.error('ERROR', e));
    process.exit(1);
  }
  const dir = `web/data/afeka/${opt.year}-${SEMESTER_CODE[opt.semester]}`;
  await mkdir(dir, { recursive: true });
  const file = `${dir}/${program}-${opt.start}.json`;

  // Check for sharp drops against previous data
  let prev = null;
  try {
    const prevText = await readFile(file, 'utf-8');
    prev = JSON.parse(prevText);
  } catch {
    // No previous file, that's fine
  }

  const { errors: comparisonErrors } = compareToPrevious(prev, dataset);
  if (comparisonErrors.length) {
    comparisonErrors.forEach((e) => console.error('SAFETY', e));
    if (!opt.force) {
      console.error('safety checks failed; use --force to override');
      process.exit(1);
    }
    console.warn('safety checks failed, but --force was given, continuing');
  }

  await writeFile(file, JSON.stringify(dataset, null, 1));
  console.log(`wrote ${file}: ${Object.keys(dataset.courses).length} courses, examsPublished=${dataset.examsPublished}`);
}

main().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
