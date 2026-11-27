#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { appendFile, readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';

const HOUR = 36e5;
const israel = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short',
});
const local = (date) => Object.fromEntries(israel.formatToParts(date).map(({ type, value }) => [type, value]));
const wallTime = (parts) => Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);

// Pick the first occurrence of a window opening when autumn repeats a local hour.
function windowOpening(now, parts, minute) {
  const target = Date.UTC(+parts.year, +parts.month - 1, +parts.day, Math.floor(minute / 60), minute % 60);
  const offsets = [-12, 0, 12].map((hours) => {
    const instant = new Date(now.getTime() + hours * HOUR);
    return wallTime(local(instant)) - Math.floor(instant.getTime() / 1000) * 1000;
  });
  return Math.min(...offsets.map((offset) => target - offset).filter((instant) => wallTime(local(new Date(instant))) === target));
}

export function pullDue({ now, event, started, checkedAt }) {
  if (event === 'workflow_dispatch') return { due: true, cold: false, full: true, reason: 'manual dispatch bypasses the checks' };
  if (started === null) return { due: false, cold: false, full: false, reason: 'recent runs unreadable; waiting for another check' };
  const time = now.getTime();
  const starts = started.map(Date.parse).filter((value) => Number.isFinite(value) && value <= time);
  if (starts.some((value) => time - value < 3 * HOUR))
    return { due: false, cold: false, full: false, reason: 'a publishing pull started less than three hours ago' };
  const parts = local(now);
  const minutes = +parts.hour * 60 + +parts.minute;
  const opening = minutes >= 90 && minutes < 270 ? 90 : minutes >= 870 && minutes < 1050 ? 870 : null;
  const unusedWindow = opening !== null && !starts.some((value) => value >= windowOpening(now, parts, opening));
  const published = typeof checkedAt === 'string' ? Date.parse(checkedAt) : NaN;
  const stale = !Number.isFinite(published) || time - published > 20 * HOUR;
  const due = unusedWindow || stale;
  return {
    due, cold: due && opening === 90 && parts.weekday === 'Sat',
    full: due && (opening !== 870 || stale),
    reason: unusedWindow ? 'no publishing pull since this Israel window opened'
      : stale ? 'published data is missing, invalid, or older than twenty hours'
        : 'published data is fresh; this window is used or no window is open',
  };
}

export async function collectStarted({ api, runId, mode }) {
  try {
    const list = async (path, key) => {
      const all = [];
      for (let page = 1; ; page++) {
        const result = await api(`${path}${path.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
        if (!Array.isArray(result[key])) throw Error(`missing ${key}`);
        all.push(...result[key]);
        if (result[key].length < 100) return all;
      }
    };
    const since = new Date(Date.now() - 24 * HOUR).toISOString();
    const runs = await list(`/actions/workflows/nightly.yml/runs?branch=main&created=${encodeURIComponent(`>=${since}`)}`, 'workflow_runs');
    const started = [];
    for (const run of runs.filter((run) => run.display_title === 'nightly' && String(run.id) !== String(runId))) {
      const jobs = await list(`/actions/runs/${run.id}/jobs`, 'jobs');
      for (const job of jobs) {
        if (job.name !== 'scrape') continue;
        const step = job.steps?.find((step) => step.name === 'scrape');
        const scraped = step?.started_at && !['queued', 'pending', 'waiting'].includes(step.status)
          && step.conclusion !== 'skipped';
        // Only decide reserves a place for unfinished jobs that have not scraped yet.
        const timestamp = scraped ? step.started_at
          : mode === 'decide' && job.status !== 'completed' ? job.created_at : null;
        if (timestamp) started.push(timestamp);
      }
    }
    return started;
  } catch {
    return null;
  }
}

async function main() {
  const mode = process.argv.includes('--recheck') ? 'recheck' : 'decide';
  const event = Number(process.env.GITHUB_RUN_ATTEMPT) > 1 ? 'workflow_dispatch' : process.env.GITHUB_EVENT_NAME;
  let started = [], checkedAt = null;
  if (event !== 'workflow_dispatch') {
    const execute = promisify(execFile);
    started = await collectStarted({ runId: process.env.GITHUB_RUN_ID, mode, api: async (path) => {
      const { stdout } = await execute('gh', ['api', `repos/${process.env.GITHUB_REPOSITORY}${path}`], {
        encoding: 'utf8', timeout: 20_000, maxBuffer: 10 * 1024 * 1024,
      });
      return JSON.parse(stdout);
    } });
    try { checkedAt = JSON.parse(await readFile('web/data/afeka/status.json', 'utf8')).checkedAt ?? null; }
    catch { /* Missing or unreadable published data needs catch-up, if runs can be read. */ }
  }
  const { due, cold, full, reason } = pullDue({ now: new Date(), event, started, checkedAt });
  if (process.env.GITHUB_OUTPUT)
    await appendFile(process.env.GITHUB_OUTPUT, `${mode === 'recheck' ? 'go' : 'due'}=${due}\ncold=${cold}\nfull=${full}\n`);
  console.log(reason);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
