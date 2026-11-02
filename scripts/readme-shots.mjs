// README screenshots from the current code: serves web/, drives headless Chrome over the DevTools protocol (no dependencies; Node 22+ has
// WebSocket) and writes docs/media/*.webp. The student is fictional (mechanical engineering, cohort 2026, year ב׳); the two friends are
// that student's own alternatives 1 and 2, so their lessons line up with the week shown.
// It also renders the banner (scripts/readme-banner.html) and records the demo GIF of the real site; ffmpeg joins the frames.
//   node scripts/readme-shots.mjs            (CHROME=<path>, FFMPEG=<path> when they are not in the default place)
//   node scripts/readme-shots.mjs extras     only the banner and the GIF
// After a run, bump ?v= on the image links in README.md and docs/GUIDE.md so a cached old copy is not shown.
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TERMS_VERSION } from '../web/ui-common.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const WEB = path.join(ROOT, 'web'),
  OUT = path.join(ROOT, 'docs', 'media');
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';
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
// the tour seen (it would dim the shots) and the terms accepted (web/ui-common.js TERMS_VERSION: the gate holds every page back)
const DONE = {
  'afeka-sched-v1-onboarded': '1', 'afeka-sched-v1-entry': '1', 'afeka-sched-v1-tour': 'intro,plans', 'afeka-sched-v1-terms': TERMS_VERSION
};

// The first-visit shots: past the terms gate and the tour, but not yet onboarded.
const FIRST_VISIT = { 'afeka-sched-v1-tour': DONE['afeka-sched-v1-tour'], 'afeka-sched-v1-terms': TERMS_VERSION };

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

for (const dark of process.argv[2] === 'extras' ? [] : [false, true]) {
  const d = dark ? '-dark' : '';
  await open({ flags: FIRST_VISIT, size: PHONE, dark, ready: `!!document.querySelector('[data-act="pickTrack"]')` });
  await shot(`05-start-track-phone${d}`);
  await open({
    state: student({ passed: [], profile: { year: null, amirnet: null, specs: [], summer: false } }),
    flags: FIRST_VISIT,
    size: PHONE,
    dark,
    hash: '#me',
    ready: `!!document.querySelector('[data-act="pickYear"]')`
  });
  await shot(`06-start-year-phone${d}`);
  await open({
    state: student({ passed: [] }),
    flags: FIRST_VISIT,
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
// The banner, with the screenshots above inside it.
async function banner(dark) {
  const d = dark ? '-dark' : '';
  const shotData = async (name) => `data:image/webp;base64,${(await readFile(path.join(OUT, `${name}${d}.webp`))).toString('base64')}`;
  const html = (await readFile(path.join(ROOT, 'scripts', 'readme-banner.html'), 'utf8'))
    .replace('{{theme}}', dark ? 'dark' : 'light')
    .replace('{{desk}}', await shotData('01-week-desktop'))
    .replace('{{phone}}', await shotData('02-week-phone'));
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 360, deviceScaleFactor: 2, mobile: false });
  await send('Page.navigate', { url: BASE + 'settings.json' }); // a real page of this origin without the site's CSP, so style.css and the icon resolve
  await sleep(300);
  await evaluate(`document.open(); document.write(${JSON.stringify(html)}); document.close(); document.fonts.ready.then(() => true)`);
  await sleep(800);
  const r = await send('Page.captureScreenshot', { format: 'webp', quality: 90 });
  await writeFile(path.join(OUT, `banner${d}.webp`), Buffer.from(r.result.data, 'base64'));
  console.log('ok', `banner${d}`);
}

// The demo: the real site, driven the way a student would, recorded frame by frame. Only the tap marker is added.
const TAP = `window.tap = (el) => {
  const target = el.closest('label') ?? el, box = target.getBoundingClientRect(), dot = document.createElement('div');
  Object.assign(dot.style, {
    position: 'fixed', left: \`\${box.left + box.width / 2 - 22}px\`, top: \`\${box.top + box.height / 2 - 22}px\`, width: '44px', height: '44px',
    borderRadius: '50%', background: 'rgb(36 87 230 / .45)', border: '2px solid #2457E6', zIndex: 2147483647, pointerEvents: 'none'
  });
  document.documentElement.append(dot);
  setTimeout(() => dot.remove(), 450);
  setTimeout(() => target.click(), 180);
  return true;
};
window.nextBtn = () => [...document.querySelectorAll('a.btn, button.btn')].find((e) => e.getClientRects().length && e.textContent.trim().startsWith('הבא'));
true`;
async function demo(dark) {
  const d = dark ? '-dark' : '';
  await open({ state: full, flags: DONE, size: PHONE, dark, hash: '#courses', ready: `!!document.getElementById('coursesTitle')?.offsetParent` });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }, { name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await evaluate(TAP);
  const frames = [];
  let recording = true;
  const recorder = (async () => {
    while (recording) {
      const at = Date.now(), r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
      frames.push({ at, data: r.result.data });
    }
  })();
  const tap = async (expr, hold) => {
    await evaluate(`tap(${expr})`);
    await sleep(hold);
  };
  await sleep(1300);
  await tap(`document.querySelector('[data-k="mode-20816-must"]')`, 1100);
  await tap('nextBtn()', 1500);
  await evaluate(TAP);
  await tap('nextBtn()', 300);
  if (!await until(`!!document.querySelector('#week .blk')`)) throw new Error('no plan in the demo');
  await evaluate(TAP);
  await sleep(1500);
  await tap(`document.getElementById('next')`, 1200);
  await tap(`document.getElementById('next')`, 1200);
  await tap(`document.querySelector('#daysel [data-day="3"]')`, 1300);
  await tap(`document.querySelector('[data-act="openMap"]')`, 300);
  await until(`!!document.querySelector('dialog[open]')`);
  await sleep(1500);
  recording = false;
  await recorder;

  const dir = await mkdtemp(path.join(tmpdir(), 'readme-demo-'));
  const list = [];
  for (const [i, frame] of frames.entries()) {
    const name = `${String(i).padStart(4, '0')}.jpg`;
    await writeFile(path.join(dir, name), Buffer.from(frame.data, 'base64'));
    list.push(`file '${name}'`, `duration ${(((frames[i + 1]?.at ?? frame.at + 1000) - frame.at) / 1000).toFixed(3)}`);
  }
  list.push(list.at(-2)); // the concat format ignores the last duration unless the last file repeats
  await writeFile(path.join(dir, 'list.txt'), list.join('\n'));
  const out = path.join(OUT, `demo${d}.gif`);
  const vf = 'fps=10,scale=420:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle';
  const run = spawnSync(FFMPEG, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), '-vf', vf, '-loop', '0', out], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`ffmpeg: ${run.error ?? run.stderr}`);
  await rm(dir, { recursive: true, force: true });
  console.log('ok', `demo${d}`, frames.length, 'frames', Math.round((await stat(out)).size / 1024), 'KB');
}

for (const dark of [false, true]) {
  await banner(dark);
  await demo(dark);
}
ws.close();
chrome.kill();
server.close();
