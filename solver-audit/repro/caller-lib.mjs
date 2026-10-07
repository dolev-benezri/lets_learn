// caller-lib.mjs - shared harness for the caller-*.mjs scripts (audit domain "caller"). Not a test; silent and harmless if run directly.
// It lets the REAL browser-side modules (web/app.js, ui-plan.js, ui-search.js, ui-view.js, ui-side.js, ui-drawer.js, ui-grid.js,
// ui-actions.js, ui-common.js) run in node:
//   * a tolerant DOM stub (elements keep innerHTML/textContent/hidden/...; document.addEventListener captures the real handlers
//     that web/ui-plan.js registers, so scripts can dispatch a fake 'change' event through the real CHG table);
//   * a `Worker` shim that spawns a real node:worker_threads thread hosting the REAL web/solver-worker.js
//     (caller-worker-host.mjs); payloads and replies cross the thread with structured clone;
//   * a `fetch` shim that serves web/ files from disk, so app.js's real switchTo()/fetchSemesters() load the real data files.
// Import order matters: web/app.js:353 calls init() as soon as `document` exists, so app.js is imported BEFORE the DOM stub is installed.
import fs from 'node:fs';
import { Worker as NodeWorker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

export const ROOT = new URL('../../', import.meta.url);
export const WEB = new URL('web/', ROOT);
export const read = (rel) => fs.readFileSync(new URL(rel, WEB), 'utf8');
export const readJson = (rel) => JSON.parse(read(rel));
const HOST = fileURLToPath(new URL('caller-worker-host.mjs', import.meta.url));

// ---------- tiny deterministic helpers ----------
export function mulberry32(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- result reporting (one line per claim; exit 0 iff every CHECK passes and every BUG reproduces) ----------
export function reporter() {
  const rows = [];
  const line = (kind, id, ok, detail) => { rows.push({ kind, ok }); console.log(`${kind} ${id} ${kind === 'CHECK' ? (ok ? 'PASS' : 'FAIL') : (ok ? 'REPRODUCED' : 'NOT-REPRODUCED')} ${detail ?? ''}`); };
  return {
    check: (id, ok, detail) => line('CHECK', id, !!ok, detail),
    bug: (id, reproduced, detail) => line('BUG', id, !!reproduced, detail),
    note: (text) => console.log(`NOTE ${text}`),
    done() { const bad = rows.filter((r) => !r.ok).length; console.log(`SUMMARY ${rows.length} claims, ${bad} not as expected`); process.exitCode = bad ? 1 : 0; },
  };
}

// ---------- DOM stub ----------
export const els = new Map();
function makeEl(id) {
  const el = {
    id, innerHTML: '', textContent: '', hidden: false, disabled: false, open: false, value: '', checked: false, dataset: {}, style: {}, className: '', isConnected: true,
    offsetHeight: 0, offsetWidth: 0, children: [],
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute(k, v) { el.attrs[k] = String(v); }, getAttribute: (k) => el.attrs[k] ?? null, removeAttribute(k) { delete el.attrs[k]; },
    addEventListener(t, f) { (el.listeners[t] ??= []).push(f); }, removeEventListener() {},
    querySelector: () => null, querySelectorAll: () => [], closest: () => null, matches: () => false, contains: () => false,
    focus() { document.activeElement = el; }, blur() {}, append() {}, remove() {}, insertAdjacentHTML() {}, click() {},
    showPopover() {}, hidePopover() {}, showModal() { el.open = true; }, show() { el.open = true; }, close() { el.open = false; },
    getBoundingClientRect: () => ({ top: 0, left: 0, right: 0, bottom: 0 }),
    attrs: {}, listeners: {},
  };
  return el;
}
export function installDom() {
  els.clear();
  globalThis.document = {
    activeElement: null, title: '', body: Object.assign(makeEl('body'), { dataset: { view: 'plan' } }),
    getElementById(id) { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); },
    createElement: (t) => makeEl(t), querySelector: () => null, querySelectorAll: () => [],
    listeners: {}, addEventListener(t, f) { (document.listeners[t] ??= []).push(f); },
  };
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
  globalThis.CSS = { escape: (s) => String(s) };
  globalThis.innerHeight = 800; globalThis.innerWidth = 1280;
  globalThis.addEventListener = () => {}; globalThis.scrollTo = () => {}; globalThis.scrollBy = () => {}; globalThis.dispatchEvent = () => {};
  globalThis.location = { hash: '', origin: 'http://localhost', pathname: '/' };
  globalThis.history = { replaceState() {} };
  const store = new Map();
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.fetch = async (url) => { // serves web/ files (data/afeka/...) from disk
    try { const text = read(String(url)); return { ok: true, status: 200, json: async () => JSON.parse(text) }; } catch { return { ok: false, status: 404 }; }
  };
}
export const $el = (id) => document.getElementById(id);

// ---------- Worker shim: a real worker thread hosting the real web/solver-worker.js ----------
export const workers = []; // every Worker the UI created, in order: { url, posted: [payload], terminated, replies: n }
class ShimWorker {
  constructor(url, opts) {
    this.url = String(url); this.opts = opts; this.onmessage = null; this.onerror = null; this.terminated = false;
    this.rec = { url: this.url, opts, posted: [], terminated: false, replies: 0, errors: [] };
    this.rec.worker = this; workers.push(this.rec);
    if (ShimWorker.mode === 'capture') return; // payload capture only, no thread
    this.w = new NodeWorker(HOST, { workerData: { target: this.url } });
    this.w.on('message', (data) => { if (this.terminated) return; this.rec.replies++; this.onmessage?.({ data }); });
    this.w.on('error', (err) => { if (this.terminated) return; this.rec.errors.push(err.message); this.onerror?.({ message: err.message }); });
  }
  postMessage(msg) { this.rec.posted.push(msg); this.w?.postMessage(msg); }
  terminate() { this.terminated = true; this.rec.terminated = true; this.w?.terminate(); }
}
ShimWorker.mode = 'real';
export const setWorkerMode = (m) => { ShimWorker.mode = m; };

// ---------- boot: import the real modules in the order that keeps init() from running ----------
let booted = null;
export async function boot() {
  if (booted) return booted;
  const W = (f) => import(new URL(f, WEB).href);
  const appMod = await W('app.js'); // before `document` exists: app.js:353 would call init()
  installDom();
  globalThis.Worker = ShimWorker;
  const mods = { app: appMod, rules: await W('rules.js'), core: await W('solver-core.js'), grid: await W('ui-grid.js'), common: await W('ui-common.js'),
    search: await W('ui-search.js'), view: await W('ui-view.js'), side: await W('ui-side.js'), drawer: await W('ui-drawer.js'), text: await W('ui-text.js') };
  mods.actions = await W('ui-actions.js'); // needs document at import (ui-friend-editor.js:17)
  mods.plan = await W('ui-plan.js'); // registers renderAll via setRenderers and the real click/change handlers on document
  mods.catalog = readJson('data/afeka/catalog.json');
  booted = mods;
  return mods;
}

// Real data file for (semester code 1|2|3, program, cohort) without going through app.js
export const dataFile = (sem, program, startYear) => readJson(`data/afeka/2027-${sem}/${program}-${startYear}.json`);

// A scenario: the real switchTo() loads program/cohort (so setSemesters() runs and the group->semester cache is reset), then the state is edited.
// `edit(state)` mutates app.state before the first refresh(). Returns the booted modules.
export async function scenario({ program = 30, startYear = 2026, year = 2, scope = 'year', summer = false, edit = () => {}, refresh = true } = {}) {
  const m = await boot();
  const app = m.app.app;
  app.catalog = m.catalog;
  const other = m.catalog.programs.find((p) => p.id === program).startYears.find((y) => y !== startYear);
  app.state = m.app.normalize({ v: 1, program, startYear: other }, m.catalog);
  app.state.profile.year = year;
  const ok = await m.app.switchTo(program, startYear);
  if (!ok) throw new Error('switchTo refused');
  const st = app.state;
  st.profile.year = year; st.profile.summer = summer; st.scope = scope;
  st.passed = null; m.app.ensurePassed();
  edit(st, m);
  m.common.ui.last = null; m.common.ui.cur = 0; m.common.ui.gen = 0; m.common.ui.moreMul = 1; m.common.ui.running = false;
  if (refresh) m.app.refresh();
  return m;
}

// Wait until the UI search settled (ui.running false and a worker answered or an error / empty state was set).
export async function settle(timeoutMs = 60000) {
  const { ui } = (await boot()).common;
  const t0 = Date.now();
  await sleep(350); // the 300 ms debounce in ui-search.js scheduleRun
  while (ui.running && Date.now() - t0 < timeoutMs) await sleep(25);
  return Date.now() - t0;
}

// ---------- dispatch through the REAL document listeners that web/ui-plan.js registered ----------
// click(act, dataset): the delegated click handler (ui-plan.js:65-68) -> ACT[act](el, e). change(chg, value, dataset, extra): ui-plan.js:69-84 -> CHG[chg](el), then save/refresh/scheduleRun by its return value.
export const click = (act, dataset = {}, extra = {}) => {
  const el = { dataset: { act, ...dataset }, disabled: false, textContent: '', setAttribute() {}, ...extra };
  for (const l of document.listeners.click) l({ target: { closest: (sel) => (sel === '[data-act]' ? el : null) }, preventDefault() {} }); // every listener: ui-plan.js's dispatcher is not necessarily the first
  return el;
};
export const change = (chg, value, dataset = {}, extra = {}) => {
  const el = { dataset: { chg, ...dataset }, value, checked: false, validity: {}, closest: () => null, ...extra };
  for (const l of document.listeners.change) l({ target: el });
  return el;
};
