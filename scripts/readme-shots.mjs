// README screenshots from the current code: serves web/, drives headless Chrome over the DevTools protocol (no dependencies; Node 22+ has
// WebSocket) and writes docs/media/*.webp. The student is fictional (mechanical engineering, cohort 2026, year ב׳); the two friends are
// that student's own alternatives 1 and 2, so their lessons line up with the week shown.
// Everything is shot in design A ("הלוח"): every page is opened with the design stored as 'a' (web/design.js), so the run is the same before and
// after A became the default. It also renders the banner (scripts/readme-banner.html) and records the demo GIF of the real site; ffmpeg joins the frames.
//   node scripts/readme-shots.mjs            (CHROME=<path>, FFMPEG=<path> when they are not in the default place; OUT=<folder> to write
//                                             somewhere else than docs/media, e.g. to look at a run before it replaces the pictures)
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
  OUT = process.env.OUT ? path.resolve(process.env.OUT) : path.join(ROOT, 'docs', 'media');
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
process.on('exit', () => chrome.kill()); // a failed run must not leave its browser behind, even one that fails while it starts
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
// design A, whatever the site's default is: web/design.js reads this key before the first paint
const DESIGN = { 'afeka-sched-v1-design': 'a' };
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
  const items = { ...(state ? { 'afeka-sched-v1': JSON.stringify(state) } : {}), ...flags, ...DESIGN };
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
const visible = (sel) => `!!document.querySelector(${JSON.stringify(sel)})?.offsetParent`;
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'webp', quality: 86 });
  await writeFile(path.join(OUT, `${name}.webp`), Buffer.from(r.result.data, 'base64'));
  console.log('ok', name);
}

await mkdir(OUT, { recursive: true });
// the tours seen (they would dim the shots: intro, plans and "what's new") and the terms accepted (web/ui-common.js TERMS_VERSION: the gate holds
// every page back)
const TOURS = 'intro,plans,shell';
const DONE = {
  'afeka-sched-v1-onboarded': '1', 'afeka-sched-v1-entry': '1', 'afeka-sched-v1-tour': TOURS, 'afeka-sched-v1-terms': TERMS_VERSION
};

// The first-visit shots: past the terms gate and the tours, but not yet onboarded. Design A has no build-or-edit question: the two tabs at the
// top are the choice, so the identity questions come right after the terms.
const FIRST_VISIT = { 'afeka-sched-v1-tour': TOURS, 'afeka-sched-v1-terms': TERMS_VERSION };

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
// No course planned yet: "no" for every course, so the board has no plan and shows the "מאיפה מתחילים" card
const ids = await evaluate(`(async () => Object.keys((await import('./app.js')).app.data.courses))()`);
if (!ids?.length) throw new Error('no courses in the data');
const none = student({ choices: Object.fromEntries(ids.map((c) => [c, 'no'])) });

// The edit page: a fixed semester-א timetable of the fictional student (the groups alternative 1 had on 2026-11-22), loaded as the timetable
// the student already has. חוזק חומרים 1 sits in its Tuesday-morning group (273012702), which leaves gaps; the goal "fewer gaps" moves it to the
// same lecturer's other group. It is fixed on purpose: the search for the alternatives runs against the clock, so its first result differs
// from run to run. If a group leaves the data, the check below says so: take the groups of a new alternative and probe it.
const EDIT_BASE = ['272081602', '272081602/1', '273011204', '273011204/1', '273013102', '273013102/1', '273012702', '273012702/1',
  '279090409', '279090409/1', '279091709', '279091709/1', '279091809', '279091604', '279091604/1'];
const base = await evaluate(`(async () => { const e = await import('./edit-state.js'), a = await import('./app.js');
  return e.lessonsOf(${JSON.stringify(EDIT_BASE)}, a.app.data); })()`);
if (!EDIT_BASE.every((g) => base?.some((l) => l.group === g))) throw new Error('a group of the edit shot is missing from the data: pick another timetable');

// what the README and GUIDE alt texts describe; anything else is not saved
const EDIT_SHOWS = { label: 'הצעה 1 מתוך 1', summary: '6 שעות פחות חלונות · קורס אחד זז · אותו מרצה' };
// Like evaluate, but a page error stops the run.
const strict = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.error || r.result?.exceptionDetails) throw new Error(`page error in: ${expression.slice(0, 80)}`);
  return r.result?.result?.value;
};
// Improve mode on a phone: the proposal's tool is a sheet over the week. The week is set to Tuesday (the day the course left and the day it
// went to are both marked) with the sheet closed, then the sheet is opened again from the dock, with the proposal at its top.
async function editShot(dark) {
  const edit = {
    v: 1, dataset: { year: 2027, sem: 'א', program: 30, startYear: 2026 }, registered: false, owned: [], original: base, baseline: base,
    movable: [], swaps: {}, added: [], removed: [], goal: { dayOff: null, notAfter: null, fewerGaps: true }, draft: null
  };
  await open({
    state: full,
    flags: { ...DONE, 'afeka-sched-v1-edit': JSON.stringify(edit), 'afeka-sched-v1-mode': 'edit' },
    size: PHONE,
    dark,
    hash: '#edit/changes',
    ready: visible('[data-ed="search"]')
  });
  await strict(`document.querySelector('[data-ed="search"]').click(); true`);
  await until(`!!document.querySelector('[data-ed="saveProposal"], #editNotes')`, 90000);
  if (!await strict(`!!document.querySelector('[data-ed="saveProposal"]')`))
    throw new Error(`no edit proposal: ${await evaluate(`(document.getElementById('edit')?.innerText ?? '').replace(/\\s+/g, ' ').slice(0, 1200)`)}`);
  await strict(`document.querySelector('.edit-sheet-x').click(); true`); // the sheet away, so the week can be pressed
  await sleep(400);
  await strict(`document.querySelector('#editDays [data-day="3"]').click(); true`); // Tuesday: where the course was and where it went
  await sleep(600);
  await strict(`document.querySelector('.dock [data-tool="changes"]').click(); true`); // the sheet again, over that week
  if (!await until(`!!document.querySelector('.edit-tool')?.checkVisibility()`)) throw new Error('the improve sheet did not open again');
  await sleep(600);
  const seen = await strict(`({ tuesday: !!document.querySelector('#editDays [data-day="3"][aria-pressed="true"]'),
    label: document.querySelector('.prop-nav .alt-label')?.textContent.trim(), summary: document.querySelector('.prop-sum')?.textContent.trim() })`);
  if (!seen.tuesday || seen.label !== EDIT_SHOWS.label || seen.summary !== EDIT_SHOWS.summary)
    throw new Error(`the edit proposal changed (${JSON.stringify(seen)}): update EDIT_SHOWS and the alt texts`);
  // the proposal at the top of the sheet, with the week's day showing above it
  await strict(`(() => { const t = document.querySelector('.edit-tool'), n = document.querySelector('.prop-nav');
    t.scrollTop += n.getBoundingClientRect().top - t.getBoundingClientRect().top - 48; })(); true`);
  await sleep(800);
  await shot(`09-edit-phone${dark ? '-dark' : ''}`);
}

for (const dark of process.argv[2] === 'extras' ? [] : [false, true]) {
  const d = dark ? '-dark' : '';
  // the two tabs, and the card that says where to begin while no course is planned
  await open({ state: none, flags: DONE, size: PHONE, dark, ready: `!!document.querySelector('.a-first')?.offsetParent` });
  await shot(`00-start-tabs-phone${d}`);
  await editShot(dark);
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
    ready: `${visible('#coursesTitle')} && ${results}`
  });
  await shot(`08-courses-phone${d}`);
  await open({ state: full, flags: DONE, size: DESK, dark, ready: `!!document.querySelector('#week .blk') && ${results}` });
  await shot(`01-week-desktop${d}`);
  // the map: from "המצב שלי" (it is also in the ☰ menu)
  await open({ state: full, flags: DONE, size: DESK, dark, hash: '#me', ready: visible('#panel #me [data-act="openMap"]') });
  await strict(`document.querySelector('#panel #me [data-act="openMap"]').click(); true`);
  if (!await until(`!!document.querySelector('#pmap[open]')`)) throw new Error('the map did not open for the screenshot');
  await sleep(1500);
  await shot(`03-map-desktop${d}`);
  await open({ state: full, flags: DONE, size: PHONE, dark, ready: `!!document.querySelector('#week .blk')` });
  await evaluate(`document.querySelector('#daysel [data-day="3"]').click(); true`); // Tuesday: the busiest day of alternative 1
  await sleep(1200);
  await shot(`02-week-phone${d}`);
  // the friends are a tool of their own
  await open({
    state: full,
    flags: DONE,
    size: PHONE,
    dark,
    hash: '#friends',
    ready: `${visible('#friendsPageTitle')} && ${results}`
  });
  await sleep(500);
  await shot(`04-friends-phone${d}`);
}
// Like evaluate, but a page error stops the run: a broken banner or demo must not be saved as if it worked.
const act = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.error || r.result?.exceptionDetails) throw new Error(`page error in: ${expression.slice(0, 80)}`);
  return r.result?.result?.value;
};

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
  await act(`document.open(); document.write(${JSON.stringify(html)}); document.close(); document.fonts.ready.then(() => true)`);
  if (!await until(`document.querySelector('.name img')?.naturalWidth > 0 && getComputedStyle(document.documentElement).getPropertyValue('--design').trim() === 'a'`)) throw new Error('the banner did not load the site styles');
  await sleep(800);
  const r = await send('Page.captureScreenshot', { format: 'webp', quality: 90 });
  await writeFile(path.join(OUT, `banner${d}.webp`), Buffer.from(r.result.data, 'base64'));
  console.log('ok', `banner${d}`);
}

// The demo: the real site, driven the way a student would, recorded frame by frame. Only the tap and swipe markers are added.
// Design A has no steps and no "הבא": the dock opens a tool over the board; the sheet closes; the week is swiped between alternatives.
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
window.dot = (x, y) => {
  let d = document.getElementById('swipe-dot');
  if (!d) {
    d = document.createElement('div');
    d.id = 'swipe-dot';
    Object.assign(d.style, {
      position: 'fixed', width: '44px', height: '44px', borderRadius: '50%', background: 'rgb(36 87 230 / .45)', border: '2px solid #2457E6',
      zIndex: 2147483647, pointerEvents: 'none'
    });
    document.documentElement.append(d);
  }
  if (x == null) return d.remove();
  d.style.left = \`\${x - 22}px\`;
  d.style.top = \`\${y - 22}px\`;
};
window.shown = (sel) => [...document.querySelectorAll(sel)].find((e) => e.getClientRects().length);
true`;
// A swipe with one finger over the week, as a phone sends it (touch events: the site reads them as pointer events of a touch). Points are in CSS
// pixels; the browser takes touch points in device pixels under this emulation, so they go out multiplied by the screen's density.
async function swipe(from, to, steps = 6) {
  const at = (i) => ({ x: Math.round(from.x + ((to.x - from.x) * i) / steps), y: Math.round(from.y + ((to.y - from.y) * i) / steps) });
  const px = (p) => ({ x: p.x * PHONE.dpr, y: p.y * PHONE.dpr });
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [px(at(0))] });
  await act(`dot(${from.x}, ${from.y})`);
  for (let i = 1; i <= steps; i++) {
    await sleep(60);
    await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [px(at(i))] });
    await act(`dot(${at(i).x}, ${at(i).y})`);
  }
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(120);
  await act('dot()');
}
async function demo(dark) {
  const d = dark ? '-dark' : '';
  await open({ state: full, flags: DONE, size: PHONE, dark, hash: '#courses', ready: `${visible('#coursesTitle')} && ${results}` });
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
    await act(`tap(${expr})`);
    await sleep(hold);
  };
  await sleep(1300);
  // "קורסים": a course marked "חובה" (it is a row of the tool, the sheet over the board)
  await act(`import('./ui-common.js').then((c) => { window.__before = c.ui.last; return true; })`);
  await tap(`document.querySelector('[data-k="mode-20816-must"]')`, 1100);
  // the sheet closes, and the week is there
  await tap(`shown('#panel .a-ph [data-act="closeTool"]')`, 1200);
  // the new search is done (not the old plan on the screen), with alternatives to swipe through
  if (!await until(`import('./ui-common.js').then((c) => c.ui.last !== window.__before && !c.ui.running && c.ui.last?.results?.length >= 3)`, 60000))
    throw new Error('no new plan with three alternatives in the demo');
  await evaluate(TAP);
  await sleep(1500);
  // two swipes over the week: the next alternatives. The finger goes down on the part of the week that is on the screen (the board starts
  // below the notices, and the dock covers its bottom); each swipe must change the alternative, or the run stops
  const box = await act(`(() => { const r = document.getElementById('week').getBoundingClientRect(), y = Math.round(Math.min(r.top + 60, innerHeight - 160));
    return { x: Math.round(r.left + r.width / 2), y, over: !!document.elementFromPoint(r.left + r.width / 2, y)?.closest('#week') }; })()`);
  if (!box.over) throw new Error('the swipe would not start on the week');
  for (let i = 1; i <= 2; i++) {
    // a touch the page re-drew under (the results arriving) is cancelled by the browser: the finger goes down again, up to three times
    let moved = false;
    for (let tryNo = 0; tryNo < 3 && !moved; tryNo++) {
      await swipe({ x: box.x + 90, y: box.y }, { x: box.x - 90, y: box.y });
      moved = await until(`document.getElementById('altLabel').textContent.startsWith('חלופה ${i + 1} ')`, 2000);
    }
    if (!moved) throw new Error(`swipe ${i} did not move to the next alternative`);
    await sleep(1200);
  }
  // a day
  await tap(`document.querySelector('#daysel [data-day="3"]')`, 1300);
  // the map, from the ☰ menu
  await tap(`document.querySelector('.menu-btn')`, 900);
  await tap(`document.querySelector('#drawer [data-act="openMap"]')`, 300);
  if (!await until(`!!document.querySelector('#pmap[open]')`)) throw new Error('the map did not open in the demo');
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
  const made = path.join(dir, 'demo.gif'); // written beside the frames, so a failed run leaves the old GIF whole
  const run = spawnSync(FFMPEG, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), '-vf', vf, '-loop', '0', made], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`ffmpeg: ${run.error ?? run.stderr}`);
  await writeFile(out, await readFile(made));
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
