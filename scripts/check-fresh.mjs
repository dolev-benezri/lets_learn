// The daily watch on the published data (.github/workflows/freshness.yml): it fails, and GitHub mails the owner, when no nightly check has been
// published for too long. It reads the live site, so a held night, a used-up CI quota and a failed deploy all show the same way: checkedAt stops moving.
// A heartbeat, not proof that every file is fresh: checkedAt is one stamp, and groups refresh at their own pace.
//   node scripts/check-fresh.mjs [hours]   default 48; 0 fails on purpose, to test the mail
import { pathToFileURL } from 'node:url';

export const STATUS_URL = 'https://dolev-benezri.github.io/lets_learn/data/afeka/status.json';
const HOUR = 36e5,
  CLOCK_SLACK = HOUR; // the runner's clock and the scraper's may differ a little

// Why this status is no proof of life, or null when it is.
export function staleReason(status, now = Date.now(), hours = 48) {
  if (hours === 0) return 'hours=0: failing on purpose, to test the mail';
  const at = typeof status?.checkedAt === 'string' ? Date.parse(status.checkedAt) : NaN;
  if (Number.isNaN(at)) return 'status.json has no valid checkedAt';
  if (at > now + CLOCK_SLACK) return `checkedAt is in the future: ${status.checkedAt}`;
  const age = (now - at) / HOUR;
  return age > hours ? `last check too old: ${age.toFixed(1)} hours ago (${status.checkedAt}), the limit is ${hours}` : null;
}

// A passing CDN or network blip must not read as old data: three tries, and a failure says the status could not be read.
export async function fetchStatus(url, { fetch = globalThis.fetch, wait = 30000, timeout = 20000 } = {}) {
  let last;
  for (let i = 0; i < 3; i++) {
    if (i) await new Promise((r) => setTimeout(r, wait));
    try {
      const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(timeout) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      last = e;
    }
  }
  throw new Error(`status unavailable: ${last.message}`);
}

// Throws, which fails the run, when the published data is too old or cannot be read.
export async function check(hours, { now = Date.now(), ...how } = {}) {
  if (!Number.isFinite(hours) || hours < 0) throw new Error(`bad hours: ${hours}`);
  const reason = staleReason(await fetchStatus(STATUS_URL, how), now, hours);
  if (reason) throw new Error(reason);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await check(Number(process.argv[2] ?? 48));
  console.log('the published data was checked in time');
}
