// Pure helpers for the polite scraper (no network, no fs).
import { createHash } from 'node:crypto';
import { isRejected, isThrottled } from './parse.mjs';

export const pageKind = (html) => (isThrottled(html) ? 'throttled' : isRejected(html) ? 'rejected' : 'ok');

// "ניתן לנסות שוב החל משעה 19:00" -> "19:00"
export const throttleUntil = (html) => html.match(/החל משעה (\d{1,2}):(\d{2})/)?.slice(1).map((x) => x.padStart(2, '0')).join(':') ?? null;

// base ± 500 ms of jitter, never negative.
export const nextDelay = (base, rnd) => Math.max(0, base - 500 + Math.floor(rnd() * 1000));

// Retry-After is delta-seconds or an HTTP date.
export function retryAfterMs(value, now = Date.now()) {
  if (value == null) return null;
  if (/^\d+$/.test(value.trim())) return Number(value) * 1000;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : Math.max(0, t - now);
}

// fetchedAt is the only field that changes on every run; leaving it out makes diffs and hashes show real changes only.
export const stableJson = ({ fetchedAt: _f, ...rest }) => JSON.stringify(rest, null, 1);

export const dataHash = (str) => createHash('sha256').update(str).digest('hex');

// One-line description of what changed between two datasets, for the commit message.
export function changeSummary(prev, next) {
  const groups = (d) => new Map(Object.values(d?.courses ?? {}).flatMap((c) => c.groups.map((g) => [g.id, g])));
  const a = groups(prev), b = groups(next);
  const delta = b.size - a.size;
  const full = [...b].filter(([id, g]) => g.full && !a.get(id)?.full).length;
  const parts = [delta && `${delta > 0 ? '+' : ''}${delta} groups`, full && `${full} became full`].filter(Boolean);
  return parts.join(', ') || 'updated';
}

// Milliseconds from `now` until the next HH:MM on the site's clock (Asia/Jerusalem), plus a minute of margin. The runner's own zone does not matter.
// The top of the next clock hour on Jerusalem time, as HH:00: the limit is per clock hour, so this is when it ends if the page does not say.
export const nextHour = (now = new Date()) => {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }).format(now)) % 24;
  return `${String((h + 1) % 24).padStart(2, '0')}:00`;
};

export function msUntil(hhmm, now = new Date()) {
  const [h, m] = hhmm.split(':').map(Number);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(now);
  const at = (t) => Number(parts.find((p) => p.type === t).value);
  const nowSec = (at('hour') % 24) * 3600 + at('minute') * 60 + at('second');
  let wait = h * 3600 + m * 60 - nowSec;
  if (wait <= 0) wait += 86400;
  return (wait + 60) * 1000;
}
