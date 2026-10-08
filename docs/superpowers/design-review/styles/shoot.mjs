// Screenshots of every style at fixed widths, through Chrome's DevTools protocol (no dependencies; Node 22+ has WebSocket).
//   python docs/superpowers/design-review/styles/serve.py 8150      (in another terminal)
//   node docs/superpowers/design-review/styles/shoot.mjs [--dark] [theme ...]  (default: every *.css next to this file, plus base;
//   --dark emulates a device in dark mode, files get a -dark suffix)
// Writes shots/<theme>-<view>-<width>.webp and a contrast report per run. Headless Chrome's own --window-size cannot go under ~500px; device emulation can.
import { spawn } from 'node:child_process';
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1'));
const CHROME = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://127.0.0.1:8150';
const args = process.argv.slice(2), DARK = args.includes('--dark'), names = args.filter((a) => a !== '--dark');
const themes = names.length ? names
  : ['base', ...readdirSync(HERE).filter((f) => f.endsWith('.css')).map((f) => f.slice(0, -4))];
const SIZES = [{ w: 375, h: 812, dpr: 2, touch: true }, { w: 1280, h: 800, dpr: 1, touch: false }];
// view: [hash, action run after the page settles]
const VIEWS = {
  plan: ['', null],
  me: ['#me', null],
  prefs: ['', `document.querySelector('[data-panel="prefs"]').click()`],
  lesson: ['', `document.querySelector('.blk')?.click()`],
  map: ['#me', `document.querySelector('[data-act="openMap"]')?.click()`],
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// WCAG contrast of every visible text node's element against its composited background (semi-transparent layers blended upward).
// A background image or gradient on the way up makes the pair unknown (skipped, counted). Large text (24px, or 18.66px bold) needs 3:1.
const CONTRAST = `(() => {
  const parse = (c) => { const m = c.match(/[\\d.]+/g)?.map(Number) ?? [0, 0, 0, 0]; const srgb = c.startsWith('color(');
    const [r, g, b] = srgb ? m.slice(0, 3).map((v) => v * 255) : m.slice(0, 3); return [r, g, b, m[3] ?? 1]; };
  const over = (top, bot) => { const a = top[3]; return [0, 1, 2].map((i) => top[i] * a + bot[i] * (1 - a)).concat(1); };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
  const bgOf = (el) => { const layers = []; for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e);
      if (s.backgroundImage !== 'none' && !e.matches('body')) return null; const c = parse(s.backgroundColor); if (c[3] > 0) layers.push(c); if (c[3] >= 1) break; }
    return layers.reverse().reduce((acc, c) => over(c, acc), [255, 255, 255, 1]); };
  const fails = [], seen = new Set(); let n = 0, unknown = 0;
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t; (t = walk.nextNode());) {
    const el = t.parentElement; if (!t.textContent.trim() || !el || seen.has(el)) continue; seen.add(el);
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight || s.visibility === 'hidden' || +s.opacity === 0 || el.closest('.sr,[hidden],[aria-hidden="true"]')) continue;
    if (s.webkitTextFillColor && s.webkitTextFillColor !== s.color && parse(s.webkitTextFillColor)[3] === 0) { unknown++; continue; } // gradient text
    const bg = bgOf(el); if (!bg) { unknown++; continue; } n++;
    const fg = over(parse(s.color), bg), L1 = lum(fg), L2 = lum(bg), ratio = (Math.max(L1, L2) + .05) / (Math.min(L1, L2) + .05);
    const size = parseFloat(s.fontSize), big = size >= 24 || (size >= 18.66 && +s.fontWeight >= 700);
    if (ratio < (big ? 3 : 4.5)) fails.push(ratio.toFixed(2) + ' ' + (el.className || el.tagName) + ' "' + t.textContent.trim().slice(0, 24) + '"');
  }
  return { n, unknown, fails };
})()`;

const port = 9333;
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', `--remote-debugging-port=${port}`,
  `--user-data-dir=${path.join(tmpdir(), 'style-shoot-profile')}`, 'about:blank'], { stdio: 'ignore' });
let list;
for (let i = 0; i < 50 && !list; i++) { await sleep(200); list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json()).catch(() => null); }
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const wait = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; wait.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
const until = async (expr, ms = 15000) => { for (let t = 0; t < ms; t += 250) { if (await evaluate(expr)) return true; await sleep(250); } return false; };

await send('Page.enable'); await send('Runtime.enable');
if (DARK) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
mkdirSync(path.join(HERE, 'shots'), { recursive: true });
const report = [];
for (const s of SIZES) {
  await send('Emulation.setDeviceMetricsOverride', { width: s.w, height: s.h, deviceScaleFactor: s.dpr, mobile: s.touch });
  await send('Emulation.setTouchEmulationEnabled', { enabled: s.touch, maxTouchPoints: s.touch ? 5 : 0 });
  for (const theme of themes) {
    for (const [view, [hash, act]] of Object.entries(VIEWS)) {
      await send('Page.navigate', { url: `${BASE}/t/${theme}/${hash}` });
      await sleep(400);
      const ready = await until(hash === '#me' ? `!!document.querySelector('#me .me-head')` : `!!document.querySelector('#week .blk')`);
      await sleep(700);
      if (act) { await evaluate(act); await sleep(1200); }
      const shot = await send('Page.captureScreenshot', { format: 'webp', quality: 86 });
      const file = path.join(HERE, 'shots', `${theme}-${view}-${s.w}${DARK ? '-dark' : ''}.webp`);
      writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
      const c = await evaluate(CONTRAST);
      report.push({ theme, view, width: s.w, ...c });
      console.log(ready ? 'ok  ' : 'SLOW', path.basename(file), `contrast: ${c.fails.length} fail / ${c.n} checked, ${c.unknown} unknown`);
    }
  }
}
writeFileSync(path.join(HERE, 'shots', `contrast-${themes.join('-')}${DARK ? '-dark' : ''}.json`), JSON.stringify(report, null, 1));
ws.close(); chrome.kill();
