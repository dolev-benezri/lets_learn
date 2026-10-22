#!/usr/bin/env node
// Scrape the public Afeka Yedion into web/data/afeka/{year}-{sem}/{program}-{start}.json (+ status.json).
// One polite pass fetches everything once; every semester is built from it. Writes nothing if any step or check fails (except summer: a failing summer is skipped with a warning).
// stdout carries only the one-line change summary (it becomes the commit message); progress goes to stderr.
import { writeFile, mkdir, readFile, readdir, stat, rename } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { parseProgram, parseGroups, parseDetails, parseExams } from './parse.mjs';
import { buildDataset, validate, compareToPrevious } from './build.mjs';
import { officialDrift, OFFICIAL } from './audit.mjs';
import PROGRAMS from './programs.json' with { type: 'json' };
import {
  pageKind,
  throttleUntil,
  nextDelay,
  retryAfterMs,
  stableJson,
  dataHash,
  changeSummary,
  msUntil,
  nextHour
} from './polite.mjs';

// scripts/programs.json: per program the list codes, department, specializations (hand-maintained, docs/research-degree-rules.md 5.2), degree credits and the anchor course validate() demands.
const BASE = 'https://yedionpub.afeka.ac.il/yedion/fireflyweb.aspx';
const USER_AGENT = 'afeka-scheduler/1.1 (+https://github.com/dolev-benezri/lets_learn)';
const SEMESTER_CODE = { 'א': 1, 'ב': 2, 'קיץ': 3 };
const MAX_RETRY_AFTER_MS = 5 * 60 * 1000;
// Answers fetched in one nightly run: the site allows ~400 an hour, and the 2 session requests and a few retries fit in the rest, so a night never waits
// for the clock hour (research H4). What is left waits for the next night.
const NIGHT_BUDGET = 380;
// Lists and course details may use only the first 160 of them, so an offered course's groups (~210 a night, the data that changes most) are never the ones
// left waiting. On the first night after a long gap the lists alone would take 290.
const SLOW_BUDGET = 160;

export class ThrottledError extends Error {
  constructor(until) {
    super(`site hourly rate limit hit${until ? `, retry after ${until}` : ''}; nothing written`);
    this.until = until;
  }
}

// A request function with run-level state: cookie jar, rejected streak, and a retry budget shared by every request (a full run is ~1800 requests).
// One request gives up after MAX_TRIES retries (~5 min of backoff): a site that is down fails the run instead of waiting out the whole budget.
const MAX_TRIES = 6;
export function makeRequester({
  fetchFn = fetch,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  delay = 2500,
  rnd = Math.random,
  log = console.error,
  budget = 30
} = {}) {
  const cookies = new Map();
  let rejectedStreak = 0;
  const spend = (why) => {
    if (budget-- <= 0) throw new Error(`retry budget exhausted (${why})`);
  };

  return async function request(query, form) {
    const what = query ?? form.PRGNAME;
    let wait = nextDelay(delay, rnd); // jittered pause before every request; retries replace it with their own wait
    for (let attempt = 0; ; attempt++) {
      if (attempt > MAX_TRIES) throw new Error(`gave up on ${what} after ${MAX_TRIES} retries; nothing written`);
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
        if (ra > MAX_RETRY_AFTER_MS)
          throw new Error(
            `HTTP ${res.status} with Retry-After ${ra / 1000}s, too long to wait; nothing written (${what})`
          );
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
        if (++rejectedStreak >= 3)
          throw new Error(`request rejected by the site ${rejectedStreak} times in a row; nothing written (${what})`);
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
  const seen = new Set(
    Object.values(raw)
      .flatMap((r) => r.groups)
      .flatMap((g) => g.meetings)
      .map((m) => m.semester)
  );
  return ['א', 'ב', 'קיץ'].filter((s) => seen.has(s));
}

const readJson = async (file) => {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {
    return null;
  }
};

const MAX_LISTED = 6; // the summary is a commit message: a first run over many programs must not make it a wall of text
// Write every changed data file, then status.json. `results`: [{ key, file, dataset, prev }].
// A file whose content (ignoring fetchedAt) is unchanged is left alone, so fetchedAt in a data file means "last changed".
export async function writeResults({ results, statusFile, now }) {
  const semesters = { ...(await readJson(statusFile))?.semesters };
  const changes = [];
  for (const { key, file, dataset, prev } of results) {
    const stable = stableJson(dataset),
      hash = dataHash(stable);
    if (!prev || stableJson(prev) !== stable) {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(dataset, null, 1));
      changes.push(`${key} ${changeSummary(prev, dataset)}`);
    }
    semesters[key] = { hash, changedAt: semesters[key]?.hash === hash ? semesters[key].changedAt : now };
  }
  await mkdir(dirname(statusFile), { recursive: true });
  await writeFile(statusFile, JSON.stringify({ checkedAt: now, ok: true, semesters }, null, 1));
  const shown =
    changes.length > MAX_LISTED
      ? [...changes.slice(0, MAX_LISTED), `and ${changes.length - MAX_LISTED} more of ${changes.length} files`]
      : changes;
  return `data(afeka): ${shown.join('; ') || 'no changes'}`;
}

// Program x cohort pairs to build. One pair (--program, --start), or with --all-programs every configured program and cohort (--programs 20,30 narrows it).
export function unitsOf(opt, programs) {
  const wanted = opt.programs ? opt.programs.split(',').map(Number) : null;
  const ids = opt['all-programs']
    ? Object.keys(programs)
        .map(Number)
        .filter((id) => !wanted || wanted.includes(id))
    : [Number(opt.program)];
  return ids.flatMap((program) => {
    const cfg = programs[program];
    if (!cfg) throw new Error(`no list codes configured for program ${program}`);
    const starts = opt['all-programs'] ? cfg.cohorts ?? [Number(opt.start)] : [Number(opt.start)];
    return starts.map((start) => {
      const codes = Array.isArray(cfg.lists) ? cfg.lists : cfg.lists[start];
      if (!codes) throw new Error(`no list codes configured for program ${program} cohort ${start}`);
      return { program, start, cfg, codes };
    });
  });
}

// Answers kept on disk, keyed by the request (so a run can resume or build offline). The session requests are swallowed and replayed before the first real one.
// ttl(key, html) = how long a cached answer stays good in ms (default: forever); an older one is fetched again.
// seen(key, html, old) hears every answer returned, with the cached answer it replaced (the same html on a cache hit, undefined when nothing was cached).
// budget(key) = how many answers may have been fetched (the session replay not counted) before this key's is; past it a stale cached answer is returned as is
// and its key goes to request.deferred.
// An answer that is not cached at all is fetched even past the budget.
export function cachedRequester(inner, dir, { offline = false, ttl = () => Infinity, seen = () => {}, budget = () => Infinity } = {}) {
  const session = [],
    deferred = [];
  let replayed = false,
    fetched = 0;
  const request = async (query, form) => {
    if (query === 'prgname=Enter_Search' || form?.PRGNAME === 'Enter_Search') {
      session.push([query, form]);
      return '';
    }
    const key = query ?? new URLSearchParams(form).toString();
    const file = `${dir}/${createHash('sha1').update(key).digest('hex')}.html`;
    let old,
      fresh = false;
    try {
      old = await readFile(file, 'utf8');
      fresh = offline || Date.now() - (await stat(file)).mtimeMs <= ttl(key, old);
    } catch {
      /* not cached */
    }
    if (fresh || (old !== undefined && fetched >= budget(key))) {
      if (!fresh) deferred.push(key);
      seen(key, old, old);
      return old;
    }
    if (offline) throw new Error(`offline and not in the cache: ${key}`);
    if (!replayed) {
      replayed = true;
      for (const [q, f] of session) await inner(q, f);
    }
    fetched++;
    const html = await inner(query, form);
    await mkdir(dir, { recursive: true });
    await writeFile(`${file}.tmp`, html);
    await rename(`${file}.tmp`, file); // a run killed mid-write (CI timeout) leaves no truncated answer behind
    seen(key, html, old);
    return html;
  };
  request.deferred = deferred;
  return request;
}

const DAY = 86400e3;
// The nightly policy: an offered course's groups every other night (below); a department's exam table every other night until it is published, then weekly;
// course details every 14-16 days (research A3: 15 of 415 changed in two weeks); lists, track pages and a course with no groups at all weekly.
// "Weekly" is 7-9 days by key, so the answers cached by one full pull expire over three nights instead of all on the same one.
const weekly = (key, base = 7) => (base + (createHash('sha1').update(key).digest()[0] % 3)) * DAY;
// An offered course's groups: half the courses (by key) one night, the other half the next. A night of ~400 group requests at 2.5 s is ~20 CI minutes, and
// GitLab Free gives 400 a month (cost factor 1, public projects too). Off its night an answer is good for 1.5 days, so after a missed run it is fetched anyway.
const otherNight = (key, now) => (Math.floor(now / DAY) + createHash('sha1').update(key).digest()[1]) % 2 === 1;
export function nightlyTtl(key, html, now = Date.now()) {
  if (key.includes('S_EXAMS')) return parseExams(html).length ? weekly(key) : 1.5 * DAY;
  if (key.includes('S_CourseDetails')) return weekly(key, 14);
  if (key.startsWith('prgname=S_LOOK_FOR_NOSE'))
    return !parseGroups(html).length ? weekly(key) : otherNight(key, now) ? 1.5 * DAY : 0;
  return weekly(key);
}

// H1 (research A1): the cohorts of one list code mostly answer alike, and when one changed, all of them did. So a cohort whose cached list equals an answer
// an earlier cohort gave tonight costs no request, and one that equals the answer an earlier cohort just replaced is fetched now. run() asks the cohorts in
// a fixed order, so the first of each alike group (its representative) keeps the weekly clock. One policy per run: it remembers tonight's answers.
export function nightlyPolicy(now = Date.now) {
  const current = new Map(),
    replaced = new Map();
  const code = (key) => key.match(/^prgname=S_SHOW_PROGS&arguments=-N\d+,-N(\d+)$/)?.[1];
  const sig = (html) => {
    const p = parseProgram(html);
    return JSON.stringify([p.minCredits, p.courses]); // not the name: it differs by cohort
  };
  const add = (map, c, s) => map.set(c, (map.get(c) ?? new Set()).add(s));
  return {
    ttl(key, html) {
      const c = code(key);
      if (c) {
        const s = sig(html);
        if (current.get(c)?.has(s)) return Infinity;
        if (replaced.get(c)?.has(s)) return 0;
      }
      return nightlyTtl(key, html, now());
    },
    budget: (key) => (key.startsWith('prgname=S_LOOK_FOR_NOSE') || key.includes('S_EXAMS') ? NIGHT_BUDGET : SLOW_BUDGET),
    seen(key, html, old) {
      const c = code(key);
      if (!c) return;
      add(current, c, sig(html));
      if (old !== undefined && sig(old) !== sig(html)) add(replaced, c, sig(old));
    }
  };
}

// Wait out the site's hourly limit instead of failing: sleep until the hour it names (Jerusalem time), start a new session, ask again. Gives up past maxWaitMs.
export function patient(
  request,
  {
    year,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    now = () => new Date(),
    log = console.error,
    maxWaitMs = 75 * 60e3,
    maxWaits = 6
  }
) {
  let waits = 0;
  return async (query, form) => {
    for (;;) {
      try {
        return await request(query, form);
      } catch (e) {
        if (!(e instanceof ThrottledError)) throw e;
        const until = e.until ?? nextHour(now()),
          ms = msUntil(until, now()); // a limit page that names no hour (seen on GitLab's runner): the limit ends with the clock hour
        if (ms > maxWaitMs || ++waits > maxWaits) throw e;
        log(`hourly limit: waiting ${Math.round(ms / 60000)} min until ${until}`);
        await sleep(ms);
        await request('prgname=Enter_Search');
        await request(null, { PRGNAME: 'Enter_Search', ARGUMENTS: '-A,,-A,ChangeYear', ChangeYear: year });
      }
    }
  };
}

// data/afeka/catalog.json: which program x cohort the site has files for. Programs not in this run keep their entry; programs not in the config lose it.
// The picker's order: a track and its evening twin side by side (day first), the pairs by their lowest program number.
export function catalogOrder(programs) {
  const base = (p) => p.name.replace(/ \(ערב\)$/, ''),
    first = new Map();
  for (const p of programs) first.set(base(p), Math.min(first.get(base(p)) ?? Infinity, p.id));
  return [...programs].sort((x, y) => first.get(base(x)) - first.get(base(y)) || x.id - y.id);
}

export async function writeCatalog(file, units, programs, year) {
  const was = await readJson(file),
    old = (was?.year ?? year) === year ? was?.programs ?? [] : []; // another year's programs point at that year's files
  const mine = new Map();
  for (const u of units)
    mine.set(u.program, {
      id: u.program,
      name: programs[u.program].name,
      startYears: [...(mine.get(u.program)?.startYears ?? []), u.start].sort()
    });
  const next = catalogOrder([...old.filter((p) => !mine.has(p.id) && programs[p.id]), ...mine.values()]);
  const out = { ...(Number.isInteger(year) ? { year } : {}), programs: next }; // the site takes the academic year from here
  if (JSON.stringify(was) !== JSON.stringify(out)) {
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify(out, null, 1));
  }
}

// One cache folder per academic year: the requests carry no year (the session picks it), so a flat cache would answer 2028 with 2027 pages.
// ponytail: the flat cache from before this change is all 2027 and moves into its year on the first run; drop the move after that run.
export async function yearCache(base, year) {
  const dir = join(base, String(year)),
    fresh = !(await stat(dir).catch(() => null));
  await mkdir(dir, { recursive: true });
  if (fresh)
    for (const f of (await readdir(base)).filter((f) => f.endsWith('.html'))) await rename(join(base, f), join(dir, f));
  return dir;
}

export async function run({
  opt,
  request,
  programs = PROGRAMS,
  dataDir = 'web/data/afeka',
  now = () => new Date().toISOString(),
  log = console.error,
  check = validate
}) {
  const units = unitsOf(opt, programs);

  await request('prgname=Enter_Search');
  await request(null, { PRGNAME: 'Enter_Search', ARGUMENTS: '-A,,-A,ChangeYear', ChangeYear: opt.year });

  // Lists and courses are fetched once however many programs share them.
  const listCache = new Map();
  for (const u of units) {
    u.lists = [];
    for (const code of u.codes) {
      const k = `${u.start}/${code}`;
      if (!listCache.has(k)) {
        const p = parseProgram(await request(`prgname=S_SHOW_PROGS&arguments=-N${u.start},-N${code}`));
        if (!p.courses.length) throw new Error(`list ${code} returned no courses`);
        listCache.set(k, p);
        log(`list ${code} (${u.start}) "${p.name}": ${p.courses.length} courses`);
      }
      u.lists.push({ code, ...listCache.get(k) });
    }
  }

  const ids = [...new Set(units.flatMap((u) => u.lists.flatMap((l) => l.courses.map((c) => c.id))))];
  // A course no list marks נלמד has no groups (it matched in every snapshot, research A2): no request for it.
  const offered = new Set(units.flatMap((u) => u.lists.flatMap((l) => l.courses.filter((c) => c.offered).map((c) => c.id))));
  const raw = {};
  for (const [i, id] of ids.entries()) {
    if (!offered.has(id)) {
      raw[id] = { groups: [], details: null };
      log(`[${i + 1}/${ids.length}] ${id}: not offered (list), skipped`);
      continue;
    }
    const groups = parseGroups(await request(`prgname=S_LOOK_FOR_NOSE&arguments=-N${id}`));
    const args = groups.find((g) => g.primary && g.detailsArgs)?.detailsArgs;
    const details = args ? parseDetails(await request(`prgname=S_CourseDetails&arguments=${args}`)) : null;
    raw[id] = { groups, details };
    log(
      `[${i + 1}/${ids.length}] ${id}: ${groups.length} groups, ${details ? `${details.credits} credits` : 'no details'}`
    );
  }

  const examsOf = new Map();
  for (const dept of new Set(units.map((u) => u.cfg.dept))) {
    examsOf.set(
      dept,
      parseExams(
        await request(null, {
          PRGNAME: 'S_EXAMS',
          ARGUMENTS: 'R1C28,R1C29,R1C30',
          R1C28: String(dept),
          R1C29: '0',
          R1C30: '0'
        })
      )
    );
    log(`exams (department ${dept}): ${examsOf.get(dept).length} rows`);
  }

  // Build and check every program, cohort and semester before writing any file.
  const fetchedAt = now();
  const results = [],
    failures = [];
  for (const u of units) {
    const mine = Object.fromEntries(u.lists.flatMap((l) => l.courses).map((c) => [c.id, raw[c.id]]));
    const semesters = opt['all-semesters'] ? semestersIn(mine) : [opt.semester];
    if (!semesters.length) throw new Error(`no semester has any meetings (${u.program}-${u.start})`);
    for (const semester of semesters) {
      const soft = semester === 'קיץ' && opt['all-semesters']; // a failing summer warns and keeps its old file; א and ב still abort the run
      const label = `${opt.year}-${SEMESTER_CODE[semester]}/${u.program}-${u.start}`;
      const bad = (e) => (soft ? log(`WARN summer not written: ${e}`) : failures.push(e));
      const file = `${dataDir}/${label}.json`;
      const prev = await readJson(file);
      const buildWarnings = [];
      const dataset = buildDataset({
        year: Number(opt.year),
        startYear: u.start,
        program: u.program,
        semester,
        department: u.cfg.deptName,
        lists: u.lists,
        raw,
        exams: examsOf.get(u.cfg.dept),
        fetchedAt,
        warnings: buildWarnings,
        specializations: u.cfg.specializations,
        degree: u.cfg.degree,
        specRule: u.cfg.specRule,
        verified: u.cfg.verified,
      });
      const { errors, warnings } = check(dataset, prev, u.cfg.anchor, u.cfg.minCourses);
      [...buildWarnings, ...warnings].forEach((w) => log(`WARN ${label}: ${w}`));
      const found = errors.map((e) => `${label}: ${e}`);
      const { errors: comparisonErrors } = compareToPrevious(prev, dataset);
      if (opt.force) comparisonErrors.forEach((e) => log(`SAFETY ${label}: ${e} (--force given, continuing)`));
      else found.push(...comparisonErrors.map((e) => `${label}: ${e} (use --force to override)`));
      found.forEach(bad);
      if (!soft || !found.length) results.push({ key: label, file, dataset, prev });
    }
  }
  if (failures.length) throw new Error(`checks failed, nothing written:\n${failures.join('\n')}`);

  const summary = await writeResults({ results, statusFile: `${dataDir}/status.json`, now: fetchedAt });
  if (opt['all-programs']) await writeCatalog(`${dataDir}/catalog.json`, units, programs, Number(opt.year));
  // Curriculum numbers that moved: a hint for a human, never a failed run (the deploy must not wait on it)
  const read = (p, y) => JSON.parse(readFileSync(`${dataDir}/${opt.year}-1/${p}-${y}.json`, 'utf8')); // written just above
  if (opt['all-programs'] && Number(opt.year) === OFFICIAL.year)
    officialDrift(read).forEach((w) => log(`WARN official ${w}`)); // the table is one year's curricula
  return summary;
}

async function main() {
  const { values: opt } = parseArgs({
    options: {
      year: { type: 'string', default: '2027' },
      start: { type: 'string', default: '2026' },
      program: { type: 'string', default: '30' },
      semester: { type: 'string', default: 'א' },
      'all-semesters': { type: 'boolean', default: false },
      delay: { type: 'string', default: '2500' },
      force: { type: 'boolean', default: false },
      'all-programs': { type: 'boolean', default: false },
      programs: { type: 'string' },
      cache: { type: 'string' },
      offline: { type: 'boolean', default: false },
      nightly: { type: 'boolean', default: false },
      'wait-throttle': { type: 'boolean', default: false },
    }
  });
  const made = makeRequester({ delay: Number(opt.delay) });
  const live = opt['wait-throttle'] ? patient(made, { year: opt.year }) : made;
  const policy = opt.nightly ? nightlyPolicy() : {};
  const request = opt.cache
    ? cachedRequester(live, await yearCache(opt.cache, opt.year), {
        offline: opt.offline,
        ttl: policy.ttl,
        seen: policy.seen,
        budget: policy.budget
      })
    : live;
  const summary = await run({ opt, request });
  if (request.deferred?.length) console.error(`deferred ${request.deferred.length} stale answers to the next night`);
  console.log(summary);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error('FAILED', e.message);
    process.exit(1);
  });
}
