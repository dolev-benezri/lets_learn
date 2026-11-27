#!/usr/bin/env node
// GitLab spends its CI minutes only when GitHub is idle and the published data needs a refresh.
import { pathToFileURL } from 'node:url';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const HOUR = 36e5;

// Replacing the whole cache must advance every local year, not discard another year's progress.
export function cacheSeedDecision({ seedMarkers, localMarkers }) {
  const years = [...new Set([...Object.keys(seedMarkers), ...Object.keys(localMarkers)])].sort();
  if (!years.length) return { replace: false, why: 'seed marker missing' };
  for (const year of years) {
    const seed = seedMarkers[year], local = localMarkers[year];
    if (seed === undefined) return { replace: false, why: `${year}: seed marker missing` };
    const seedTime = Date.parse(seed.trim());
    if (!Number.isFinite(seedTime)) return { replace: false, why: `${year}: seed marker invalid` };
    if (local === undefined) continue;
    const localTime = Date.parse(local.trim());
    if (!Number.isFinite(localTime)) return { replace: false, why: `${year}: local marker invalid` };
    if (seedTime <= localTime) return { replace: false, why: `${year}: seed marker ${seedTime === localTime ? 'equal to' : 'older than'} local marker` };
  }
  return { replace: true, why: Object.keys(localMarkers).length ? 'seed markers strictly newer than local markers' : 'valid seed; no local marker' };
}

// yearCache passes <base>/<year> to cacheBehind; root markers and answer mtimes are not publication markers.
async function cacheMarkers(base) {
  const entries = await readdir(base, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const markers = {};
  for (const entry of entries.filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))) {
    const marker = await readFile(join(base, entry.name, 'published-at'), 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (marker !== undefined) markers[entry.name] = marker;
  }
  return markers;
}

async function compareSeedCli(seed, local) {
  try {
    if (!seed || !local) throw Error('expected seed and local cache directories');
    const decision = cacheSeedDecision({ seedMarkers: await cacheMarkers(seed), localMarkers: await cacheMarkers(local) });
    console.log(`${decision.replace ? 'replace' : 'keep'}: ${decision.why}`);
    // Called in a shell if: 0 replaces, 1 keeps, 2 keeps on a comparison error (safe under errexit).
    process.exitCode = decision.replace ? 0 : 1;
  } catch {
    console.log('keep: cache seed comparison failed; keeping GitLab cache');
    process.exitCode = 2;
  }
}

export function standbyDecision({ checkedAt, now = Date.now(), hours = 12, githubBusy = false }) {
  const age = typeof checkedAt === 'string' ? (now - Date.parse(checkedAt)) / HOUR : NaN;
  const ageText = `age ${Number.isFinite(age) ? age.toFixed(1) : 'unknown'} h`;
  if (githubBusy) return { run: false, why: `GitHub busy; ${ageText}` };
  if (!Number.isFinite(age)) return { run: true, why: `missing or invalid checkedAt; ${ageText}` };
  if (age < hours) return { run: false, why: `published data is under ${hours} h old; ${ageText}` };
  return { run: true, why: `published data is at least ${hours} h old; ${ageText}` };
}

// Each source can fail independently: an unavailable status needs a pull, while an unavailable runs page cannot prove GitHub busy.
export async function checkStandby({ fetchFn = fetch, now = Date.now(), hours = 12, token = process.env.GH_PUSH_TOKEN } = {}) {
  const read = async (url, headers = {}) => {
    try {
      const res = await fetchFn(url, { headers, signal: AbortSignal.timeout(20_000) });
      return { body: res.ok ? await res.json() : null, status: res.status };
    } catch {
      return { body: null, status: 'network' };
    }
  };
  const [status, runs] = await Promise.all([
    read(`https://lets-learn-il.github.io/data/afeka/status.json?t=${now}`),
    read('https://api.github.com/repos/lets-learn-il/lets-learn-il.github.io/actions/workflows/nightly.yml/runs?per_page=100&branch=main',
      token ? { Authorization: `Bearer ${token}` } : {}),
  ]);
  const githubBusy = Array.isArray(runs.body?.workflow_runs) && runs.body.workflow_runs.some((run) => {
    const age = now - Date.parse(run?.created_at);
    return run?.head_branch === 'main' && ['schedule', 'workflow_dispatch'].includes(run.event) &&
      typeof run.status === 'string' && run.status !== '' && run.status !== 'completed' && age >= 0 && age <= 6 * HOUR;
  });
  const decision = standbyDecision({ checkedAt: status.body?.checkedAt, now, hours, githubBusy });
  if (runs.body === null)
    decision.why += `; GitHub runs unreadable (${runs.status === 'network' ? 'network' : `HTTP ${runs.status}`})`;
  return decision;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === '--compare-seed') {
    await compareSeedCli(process.argv[3], process.argv[4]);
  } else {
    const value = process.env.STANDBY_HOURS;
    const hours = value?.trim() && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : 12;
    checkStandby({ hours }).then(({ run, why }) => {
      console.log(`${run ? 'run' : 'standby'}: ${why}`);
    }).catch(() => {
      // The shell gate must fail open even on an unexpected error, so standby never hides a missed publication.
      console.log('run: standby check failed; age unknown h');
    });
  }
}
