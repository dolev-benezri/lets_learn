// README screenshots from the current code: serves web/, drives headless Chrome over the DevTools protocol (no dependencies; Node 22+ has
// WebSocket) and writes docs/media/*.webp. The student is fictional (mechanical engineering, cohort 2026, year ב׳); the two friends are
// that student's own alternatives 1 and 2, so their lessons line up with the week shown.
//   node scripts/readme-shots.mjs            (CHROME=<path> when Chrome is not in the default place)
// After a run, bump ?v= on the README's image links so a cached old copy is not shown.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const WEB = path.join(ROOT, 'web'),
  OUT = path.join(ROOT, 'docs', 'media');
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm'
};
const server = createServer(async (req, res) => {
  const p = path.join(WEB, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  if (!p.startsWith(WEB)) {
    res.writeHead(403).end();
    return;
  }
  const body = await readFile(p).catch(() => null);
  if (!body) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] ?? 'application/octet-stream' }).end(body);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const PASSED = ['10016', '30003', '30130', '30133', '30135', '30137', '90901', '90902', '90903', '90905', '90914'];
const student = (over = {}) => ({
  v: 1,
  year: 2027,
  semester: 'א',
  program: 30,
  startYear: 2026,
  programSet: true,
  passed: PASSED,
  profile: { year: 2, amirnet: 134, specs: [], summer: false },
  ...over
});
const PHONE = { w: 375, h: 812, dpr: 2, mobile: true },
  DESK = { w: 1280, h: 800, dpr: 1, mobile: false };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9334;
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${path.join(tmpdir(), 'readme-shots-profile')}`,
    'about:blank'
  ],
  { stdio: 'ignore' }
);
let list;
for (let i = 0; i < 50 && !list; i++) {
  await sleep(200);
  list = await fetch(`http://127.0.0.1:${port}/json/list`)
    .then((r) => r.json())
    .catch(() => null);
}
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const wait = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && wait.has(m.id)) {
    wait.get(m.id)(m);
    wait.delete(m.id);
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id;
    wait.set(i, r);
    ws.send(JSON.stringify({ id: i, method, params }));
  });
const evaluate = async (expression) =>
  (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
const until = async (expr, ms = 30000) => {
  for (let t = 0; t < ms; t += 250) {
    if (await evaluate(expr)) return true;
    await sleep(250);
  }
  return false;
};
await send('Page.enable');
await send('Runtime.enable');

let seedId = null;
// Opens the app with exactly this saved state (and flags), at this size and colour scheme, and waits until `ready` holds.
async function open({ state, flags = {}, size, dark = false, hash = '', ready }) {
  await send('Emulation.setDeviceMetricsOverride', {
    width: size.w,
    height: size.h,
    deviceScaleFactor: size.dpr,
    mobile: size.mobile
  });
  await send('Emulation.setTouchEmulationEnabled', { enabled: size.mobile, maxTouchPoints: size.mobile ? 5 : 0 });
  await send('Emulation.setEmulatedMedia', {
    features: [
      { name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' },
      { name: 'prefers-reduced-motion', value: 'reduce' }
    ]
  });
  if (seedId) await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: seedId });
  const items = { ...(state ? { 'afeka-sched-v1': JSON.stringify(state) } : {}), ...flags };
  seedId = (
    await send('Page.addScriptToEvaluateOnNewDocument', {
      source: `try { localStorage.clear();
    for (const [k, v] of Object.entries(${JSON.stringify(items)})) localStorage.setItem(k, v); } catch {}`
    })
  ).result.identifier;
  await send('Page.navigate', { url: BASE + 'about-blank-reset' }); // a new document, so the seed runs before the app below
  await send('Page.navigate', { url: BASE + hash });
  await sleep(500);
  if (!await until(ready)) throw new Error(`not ready: ${ready}`);
  await evaluate('document.fonts.ready.then(() => true)');
  await sleep(800);
}
const results = `(async () => { const m = await import('./ui-common.js'); return !!m.ui.last && !m.ui.running; })()`;
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'webp', quality: 86 });
  await writeFile(path.join(OUT, `${name}.webp`), Buffer.from(r.result.data, 'base64'));
  console.log('ok', name);
}

await mkdir(OUT, { recursive: true });
const DONE = { 'afeka-sched-v1-onboarded': '1', 'afeka-sched-v1-entry': '1', 'afeka-sched-v1-tour': 'intro,plans' }; // the tour seen: it would dim the shots

// The friends: alternatives 1 and 2 of the student without friends.
await open({ state: student(), flags: DONE, size: DESK, ready: results });
const alts = await evaluate(`(async () => { const c = await import('./ui-common.js'), g = await import('./ui-grid.js');
  return c.ui.last.results.slice(0, 2).map(g.resGroups); })()`);
if (alts?.length !== 2) throw new Error('fewer than two alternatives for the friends');
const full = student({
  friends: [
    ['נועה', alts[0]],
    ['רון', alts[1]]
  ].map(([name, groups]) => ({ name, groups, weight: 1, active: true }))
});

for (const dark of [false, true]) {
  const d = dark ? '-dark' : '';
  await open({ size: PHONE, dark, ready: `!!document.querySelector('[data-act="pickTrack"]')` });
  await shot(`05-start-track-phone${d}`);
  await open({
    state: student({ passed: [], profile: { year: null, amirnet: null, specs: [], summer: false } }),
    size: PHONE,
    dark,
    hash: '#me',
    ready: `!!document.querySelector('[data-act="pickYear"]')`
  });
  await shot(`06-start-year-phone${d}`);
  await open({
    state: student({ passed: [] }),
    size: DESK,
    dark,
    hash: '#me',
    ready: `!!document.getElementById('meChoice')`
  });
  await shot(`07-start-entry-desktop${d}`);
  await open({
    state: full,
    flags: DONE,
    size: PHONE,
    dark,
    hash: '#courses',
    ready: `!!document.getElementById('coursesTitle')?.offsetParent`
  });
  await shot(`08-courses-phone${d}`);
  await open({ state: full, flags: DONE, size: DESK, dark, ready: `!!document.querySelector('#week .blk')` });
  await shot(`01-week-desktop${d}`);
  await evaluate(`document.querySelector('[data-act="openMap"]').click()`);
  await until(`!!document.querySelector('dialog[open]')`);
  await sleep(1500);
  await shot(`03-map-desktop${d}`);
  await open({ state: full, flags: DONE, size: PHONE, dark, ready: `!!document.querySelector('#week .blk')` });
  await evaluate(`document.querySelector('#daysel [data-day="3"]').click(); true`); // Tuesday: the busiest day of alternative 1
  await sleep(1200);
  await shot(`02-week-phone${d}`);
  await open({
    state: full,
    flags: DONE,
    size: PHONE,
    dark,
    hash: '#prefs',
    ready: `!!document.getElementById('friendsTitle')`
  });
  await evaluate(
    `document.getElementById('friendsTitle').closest('section').scrollIntoView(); scrollBy(0, document.getElementById('friendsTitle').closest('section').getBoundingClientRect().top - 64); true`
  );
  await sleep(500);
  await shot(`04-friends-phone${d}`);
}
ws.close();
chrome.kill();
server.close();
