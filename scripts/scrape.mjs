#!/usr/bin/env node
// Scrape the public Afeka Yedion into web/data/afeka/{year}-{sem}/{program}-{start}.json (+ status.json).
// One polite pass fetches everything once; every semester is built from it. Writes nothing if any step or check fails (except summer: a failing summer is skipped with a warning).
// stdout carries only the one-line change summary (it becomes the commit message); progress goes to stderr.
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { parseProgram, parseGroups, parseDetails, parseExams } from './parse.mjs';
import { buildDataset, validate, compareToPrevious } from './build.mjs';
import { pageKind, throttleUntil, nextDelay, retryAfterMs, stableJson, dataHash, changeSummary } from './polite.mjs';

const BASE = 'https://yedionpub.afeka.ac.il/yedion/fireflyweb.aspx';
const USER_AGENT = 'afeka-scheduler/1.1 (+https://github.com/dolhack/lets_learn)';
const LISTS = { 30: [30001, 30002, 30003, 30004, 30007, 30010, 30031, 30901, 60004, 30115, 30116, 30117, 30118, 30119, 30120, 30121, 30122, 30123, 30124, 30125, 30126, 30127] };
// Hand-maintained from the third-year specialization lists (docs/research-degree-rules.md 5.2). `aloneExtra`: the list a student who takes vehicles alone adds.
const SPECS = [
  { id: 'solid', name: 'מכניקת מוצק', mandatory: 30115, elective: 30116 },
  { id: 'flow', name: 'זרימה ואנרגיה', mandatory: 30117, elective: 30118 },
  { id: 'mech', name: 'מכטרוניקה ורובוטיקה', mandatory: 30119, elective: 30120 },
  { id: 'vehicle', name: 'מערכות רכב', mandatory: 30121, elective: 30122, aloneExtra: 30127 },
  { id: 'materials', name: 'חומרים', mandatory: 30123, elective: 30124 },
  { id: 'aero', name: 'אווירונאוטיקה וחלל', mandatory: 30125, elective: 30126 },
];
const DEGREE = { total: 160, specCredits: 27 };
const DEPARTMENT = { 30: 'מכנית' };
const SEMESTER_CODE = { 'א': 1, 'ב': 2, 'קיץ': 3 };
const MAX_RETRY_AFTER_MS = 5 * 60 * 1000;

export class ThrottledError extends Error {
  constructor(until) {
    super(`site hourly rate limit hit${until ? `, retry after ${until}` : ''}; nothing written`);
    this.until = until;
  }
}

// A request function with run-level state: cookie jar, rejected streak, and a retry budget shared by every request.
export function makeRequester({ fetchFn = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), delay = 2500, rnd = Math.random, log = console.error, budget = 10 } = {}) {
  const cookies = new Map();
  let rejectedStreak = 0;
  const spend = (why) => { if (budget-- <= 0) throw new Error(`retry budget exhausted (${why})`); };

  return async function request(query, form) {
    const what = query ?? form.PRGNAME;
    let wait = nextDelay(delay, rnd); // jittered pause before every request; retries replace it with their own wait
    for (let attempt = 0; ; attempt++) {
      await sleep(wait);
      const backoff = 5000 * 2 ** attempt; // 5s, 10s, 20s, ...
      let res;
      try {
        res = await fetchFn(form ? BASE : `${BASE}?${query}`, {
          method: form ? 'POST' : 'GET',
          signal: AbortSignal.timeout(25000),
          headers: {
            'User-Agent': USER_AGENT,
            ...(cookies.size && { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; ') }), // the WAF rejects an empty Cookie header
            ...(form && { 'Content-Type': 'application/x-www-form-urlencoded' }),
          },
          body: form ? new URLSearchParams(form) : undefined,
        });
      } catch (err) {
        if (!(err instanceof TypeError || err.name === 'TimeoutError' || err.name === 'AbortError')) throw err;
        spend(err.message);
        log(`network error, retrying: ${err.message} (${what})`);
        wait = backoff;
        continue;
      }
      for (const c of res.headers.getSetCookie()) {
        const kv = c.split(';')[0];
        const i = kv.indexOf('=');
        cookies.set(kv.slice(0, i), kv.slice(i + 1));
      }
      if (res.status === 429 || res.status >= 500) {
        spend(`HTTP ${res.status}`);
        const ra = res.status === 429 || res.status === 503 ? retryAfterMs(res.headers.get('retry-after')) : null;
        if (ra > MAX_RETRY_AFTER_MS) throw new Error(`HTTP ${res.status} with Retry-After ${ra / 1000}s, too long to wait; nothing written (${what})`);
        log(`HTTP ${res.status}, retrying in ${(ra ?? backoff) / 1000}s: ${what}`);
        wait = ra ?? backoff;
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${what}`);
      const html = await res.text();
      const kind = pageKind(html);
      if (kind === 'throttled') {
        if (!html.includes('בדקה')) throw new ThrottledError(throttleUntil(html)); // hourly limit: stop the whole run
        spend('per-minute limit');
        log(`per-minute limit, waiting 65s: ${what}`);
        wait = 65000;
        continue;
      }
      if (kind === 'rejected') {
        if (++rejectedStreak >= 3) throw new Error(`request rejected by the site ${rejectedStreak} times in a row; nothing written (${what})`);
        spend('rejected');
        log(`rejected, retrying in ${backoff / 1000}s: ${what}`);
        wait = backoff;
        continue;
      }
      rejectedStreak = 0;
      return html;
    }
  };
}

// Semesters that have at least one meeting in the scraped groups, in site order.
export function semestersIn(raw) {
  const seen = new Set(Object.values(raw).flatMap((r) => r.groups).flatMap((g) => g.meetings).map((m) => m.semester));
  return ['א', 'ב', 'קיץ'].filter((s) => seen.has(s));
}

const readJson = async (file) => { try { return JSON.parse(await readFile(file, 'utf8')); } catch { return null; } };

// Write every changed data file, then status.json. `results`: [{ key, file, dataset, prev }].
// A file whose content (ignoring fetchedAt) is unchanged is left alone, so fetchedAt in a data file means "last changed".
export async function writeResults({ results, statusFile, now }) {
  const semesters = { ...(await readJson(statusFile))?.semesters };
  const changes = [];
  for (const { key, file, dataset, prev } of results) {
    const stable = stableJson(dataset), hash = dataHash(stable);
    if (!prev || stableJson(prev) !== stable) {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(dataset, null, 1));
      changes.push(`${key} ${changeSummary(prev, dataset)}`);
    }
    semesters[key] = { hash, changedAt: semesters[key]?.hash === hash ? semesters[key].changedAt : now };
  }
  await mkdir(dirname(statusFile), { recursive: true });
  await writeFile(statusFile, JSON.stringify({ checkedAt: now, ok: true, semesters }, null, 1));
  return `data(afeka): ${changes.join('; ') || 'no changes'}`;
}

export async function run({ opt, request, dataDir = 'web/data/afeka', now = () => new Date().toISOString(), log = console.error, check = validate }) {
  const program = Number(opt.program);
  if (!LISTS[program]) throw new Error(`no list codes configured for program ${program}`);

  await request('prgname=Enter_Search');
  await request(null, { PRGNAME: 'Enter_Search', ARGUMENTS: '-A,,-A,ChangeYear', ChangeYear: opt.year });

  const lists = [];
  for (const code of LISTS[program]) {
    const p = parseProgram(await request(`prgname=S_SHOW_PROGS&arguments=-N${opt.start},-N${code}`));
    if (!p.courses.length) throw new Error(`list ${code} returned no courses`);
    lists.push({ code, ...p });
    log(`list ${code} "${p.name}": ${p.courses.length} courses`);
  }

  const ids = [...new Set(lists.flatMap((l) => l.courses.map((c) => c.id)))];
  const raw = {};
  for (const [i, id] of ids.entries()) {
    const groups = parseGroups(await request(`prgname=S_LOOK_FOR_NOSE&arguments=-N${id}`));
    const args = groups.find((g) => g.primary && g.detailsArgs)?.detailsArgs;
    const details = args ? parseDetails(await request(`prgname=S_CourseDetails&arguments=${args}`)) : null;
    raw[id] = { groups, details };
    log(`[${i + 1}/${ids.length}] ${id}: ${groups.length} groups, ${details ? `${details.credits} credits` : 'no details'}`);
  }

  const exams = parseExams(await request(null, {
    PRGNAME: 'S_EXAMS', ARGUMENTS: 'R1C28,R1C29,R1C30', R1C28: String(program), R1C29: '0', R1C30: '0',
  }));
  log(`exams: ${exams.length} rows`);

  // Build and check every semester before writing any file.
  const semesters = opt['all-semesters'] ? semestersIn(raw) : [opt.semester];
  if (!semesters.length) throw new Error('no semester has any meetings');
  const fetchedAt = now();
  const results = [], failures = [];
  for (const semester of semesters) {
    const soft = semester === 'קיץ' && opt['all-semesters']; // a failing summer warns and keeps its old file; א and ב still abort the run
    const bad = (e) => (soft ? log(`WARN summer not written: ${e}`) : failures.push(e));
    const key = `${opt.year}-${SEMESTER_CODE[semester]}`;
    const file = `${dataDir}/${key}/${program}-${opt.start}.json`;
    const prev = await readJson(file);
    const buildWarnings = [];
    const dataset = buildDataset({
      year: Number(opt.year), startYear: Number(opt.start), program, semester,
      department: DEPARTMENT[program], lists, raw, exams, fetchedAt, warnings: buildWarnings, specializations: SPECS, degree: DEGREE,
    });
    const { errors, warnings } = check(dataset, prev);
    [...buildWarnings, ...warnings].forEach((w) => log(`WARN ${key}: ${w}`));
    const found = errors.map((e) => `${key}: ${e}`);
    const { errors: comparisonErrors } = compareToPrevious(prev, dataset);
    if (opt.force) comparisonErrors.forEach((e) => log(`SAFETY ${key}: ${e} (--force given, continuing)`));
    else found.push(...comparisonErrors.map((e) => `${key}: ${e} (use --force to override)`));
    found.forEach(bad);
    if (!soft || !found.length) results.push({ key, file, dataset, prev });
  }
  if (failures.length) throw new Error(`checks failed, nothing written:\n${failures.join('\n')}`);

  return writeResults({ results, statusFile: `${dataDir}/status.json`, now: fetchedAt });
}

async function main() {
  const { values: opt } = parseArgs({ options: {
    year: { type: 'string', default: '2027' },
    start: { type: 'string', default: '2026' },
    program: { type: 'string', default: '30' },
    semester: { type: 'string', default: 'א' },
    'all-semesters': { type: 'boolean', default: false },
    delay: { type: 'string', default: '2500' },
    force: { type: 'boolean', default: false },
  } });
  const request = makeRequester({ delay: Number(opt.delay) });
  console.log(await run({ opt, request }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
}
