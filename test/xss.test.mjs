// Every HTML string the UI writes must escape data: real data files with a markup payload in every text field,
// a fake DOM that records each innerHTML write, and a parse of what was written (see docs/superpowers/plans/2026-10-02-innerhtml-guard.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'node-html-parser';

const P = '<xss-t></xss-t>" onxss=1 \'';
const read = (n) => JSON.parse(readFileSync(new URL(`../web/data/afeka/2027-${n}/30-2026.json`, import.meta.url), 'utf8'));
const TEXT_KEYS = new Set(['name', 'lecturer', 'room', 'label', 'title']);
const hostile = (v, key = '') => (Array.isArray(v) ? v.map((x) => hostile(x, key)) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, hostile(x, k)])) : typeof v === 'string' && TEXT_KEYS.has(key) ? v + P : v);

// ---- fake DOM: elements record what is written; everything else is a no-op ----
const writes = []; // { id, html }
let scope = '';
const els = {};
const fake = (id) => els[id] ??= {
  id, hidden: false, open: false, dataset: {}, style: {}, children: [], _h: '',
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  get innerHTML() { return this._h; },
  set innerHTML(html) { this._h = html; writes.push({ scope, id, html }); },
  insertAdjacentHTML(_, html) { writes.push({ scope, id, html }); },
  querySelector(sel) { return fake(sel.startsWith('#') ? sel.slice(1) : sel); },
  querySelectorAll: () => [], addEventListener() {}, removeEventListener() {}, setAttribute() {}, removeAttribute() {}, focus() {},
  showModal() { this.open = true; }, show() { this.open = true; }, close() { this.open = false; }, showPopover() {}, hidePopover() {},
  matches: () => false, closest: () => null, contains: () => false, getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }),
  appendChild: (c) => c, remove() {}, offsetHeight: 0, scrollIntoView() {},
};
const app_ = await import('../web/app.js'); // before the stubs: app.js starts init() when it sees a document
globalThis.document = { getElementById: fake, createElement: (t) => fake(`<${t}>`), querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, activeElement: null, body: { ...fake('body'), dataset: { view: 'plan' }, appendChild: (c) => c } };
Object.assign(globalThis, { matchMedia: () => ({ matches: false, addEventListener() {} }), CSS: { escape: (s) => s }, getComputedStyle: () => ({ top: '0' }), innerHeight: 800, innerWidth: 1200, scrollBy() {}, scrollTo() {}, addEventListener() {} });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.history = { replaceState() {} };
globalThis.location = { hash: '', origin: 'https://x', pathname: '/' };

const { app, normalize, refresh, yearCourses } = app_;
const { ui, current } = await import('../web/ui-common.js');
const { renderTop, renderBanner, renderView } = await import('../web/ui-view.js');
const { renderMe, identityPick } = await import('../web/ui-me.js');
const { renderSide } = await import('../web/ui-side.js');
const { renderDrawer } = await import('../web/ui-drawer.js');
const { openPop, groupIndex } = await import('../web/ui-grid.js');
const { openFriendEditor } = await import('../web/ui-friend-editor.js');
const { layoutMap, geometry } = await import('../web/map-layout.js');
const { mapSvg } = await import('../web/map-render.js');
await import('../web/ui-map.js'); // the dialog module loads without a browser too
const { searchYear } = await import('../web/solver-core.js');

// ---- hostile world ----
app.sem['א'] = hostile(read(1));
app.sem['ב'] = hostile(read(2));
app.sem['קיץ'] = hostile(read(3));
const gids = Object.values(app.sem['א'].courses).flatMap((c) => c.groups.map((g) => g.id));
app.catalog = { programs: [{ id: 30, name: `a${P}`, startYears: [2026, 2025] }, { id: 20, name: `b${P}`, startYears: [2026] }] }; // a hostile catalog: names reach the picker and the title
app.state = normalize({ v: 1 });
Object.assign(app.state, { name: P, passed: app.sem['א'].lists.find((l) => l.name.includes("שנה א'")).courses }); // year 1 passed, as on a first visit
app.state.profile = { ...app.state.profile, year: 2, summer: true, amirnet: 120 };
app.state.friends = [{ name: P, groups: gids.slice(0, 3), weight: 1, active: true, manual: true }, { name: `${P}2`, groups: [P], weight: 2, active: false }];
app.state.pins = [P, gids[0]]; // a stale pin with a hostile id, and a live one
app.state.constraints.lecturers = { [P]: 'avoid' }; // a hostile lecturer name reaches the drawer
app.friendLanding = { name: P, groups: [P, gids[1]] };
app.hashError = `${P} error`;
app.semNotice = `${P} notice`;
ui.friendMsg = `${P} friend`; ui.friendUrl = P; ui.gradeMsg = `${P} grades`;
refresh();
const searchNow = (ms) => searchYear({ dataA: app.sem['א'], dataB: app.sem['ב'], state: app.state, yearList: new Set(yearCourses()), pins: [], constraints: app.state.constraints, weights: app.state.weights, friends: app.state.friends.filter((f) => f.active), timeLimitMs: ms });
for (const id of Object.keys(app.data.courses).filter((id) => app_.candidateMode(id) === 'optional')) { // choose courses as long as a plan still exists
  app.state.choices[id] = 'must';
  if (!searchNow(150).results.length) delete app.state.choices[id];
}
refresh();
const mode = (id) => app_.candidateMode(id);
const courses = Object.keys(app.data.courses).filter((id) => ['must', 'optional'].includes(mode(id)));
const found = searchNow(1500);
ui.last = { ...found, ms: 3000 };
ui.cur = 0;

const run = (name, fn) => { scope = name; fn(); };
run('top', () => { renderTop(); });
run('banner', () => { renderBanner(); });
document.body.dataset.view = 'me';
run('me', () => { fake('me').hidden = false; renderMe(); });
document.body.dataset.view = 'plan';
run('picker', () => { writes.push({ scope: 'picker', id: 'pick', html: identityPick(2, true) }); });
run('view', () => { renderView(); });
run('side', () => { renderSide(current()); });
for (const p of ['prefs', 'friends', 'reg']) run(`drawer-${p}`, () => { ui.panel = p; renderDrawer(); });
run('pop', () => {
  const res = current();
  const gid = [...(res.a?.groups ?? res.groups ?? [])][0] ?? gids[0];
  openPop({ dataset: { gid }, getBoundingClientRect: () => ({ top: 0, left: 0, width: 10, height: 10, bottom: 10, right: 10 }) },
    { data: app.sem['א'], res: res.a ?? res, includeFull: false, pins: app.state.pins, friends: app.state.friends, colors: new Map(), lecturers: app.state.constraints.lecturers });
});
run('map', () => {
  const L = layoutMap(app.data), html = mapSvg({ data: app.data, st: app.cls.statuses, L, g: geometry(L, (id) => app.data.courses[id]?.credits), year: 2, unlocks: {}, mode: 'all', plan: new Set() });
  writes.push({ scope: 'map', id: 'svg', html });
});
run('friend-editor', () => { openFriendEditor({ friend: app.state.friends[0], onSave: () => null, returnFocusId: 'x' }); });

test('the search found plans, so the board and the registration list render real data', () => {
  assert.ok(courses.length > 0 && ui.last.results.length > 0 && current(), 'no plan: the plan-dependent renderers were not exercised');
});

test('every renderer got the payload and wrote it escaped (no element or on* attribute created from data)', () => {
  const scopes = ['top', 'banner', 'me', 'picker', 'view', 'side', 'drawer-prefs', 'drawer-friends', 'drawer-reg', 'pop', 'map', 'friend-editor'];
  for (const s of scopes) {
    const mine = writes.filter((w) => w.scope === s);
    assert.ok(mine.length, `${s}: nothing written`);
    assert.ok(mine.some((w) => w.html.includes(s === 'top' ? '&lt;' : '&lt;xss-t&gt;')), `${s}: the payload never reached this renderer (coverage hole)`);
    for (const { id, html } of mine) {
      const root = parse(html);
      assert.equal(root.querySelectorAll('xss-t').length, 0, `${s} #${id}: injected element`);
      const bad = root.querySelectorAll('*').filter((e) => Object.keys(e.attributes).some((a) => a === 'onxss' || /^on/i.test(a)));
      assert.equal(bad.length, 0, `${s} #${id}: injected attribute on <${bad[0]?.rawTagName}>`);
    }
  }
});

test('an unverified program says so in the header of both views (L3)', () => {
  app.data.verified = false;
  run('top-unverified', () => { renderTop(); });
  const meta = writes.filter((w) => w.scope === 'top-unverified' && w.id === 'meta');
  assert.ok(meta.length && meta.at(-1).html.includes('לא נבדקו מול תוכנית הלימודים הרשמית'));
  delete app.data.verified;
  run('top-verified', () => { renderTop(); });
  assert.ok(!writes.filter((w) => w.scope === 'top-verified' && w.id === 'meta').at(-1).html.includes('לא נבדקו'));
});

test('a two-year program offers study years א׳ and ב׳ only (L6)', () => {
  const lists = app.data.lists;
  app.data.lists = lists.filter((l) => !/שנה [גד]'/.test(l.name));
  const html = identityPick(2, true);
  app.data.lists = lists;
  assert.ok(html.includes('ב׳') && !html.includes('ג׳') && !html.includes('ד׳'));
});

test('a program without specializations shows no specialization picker and no call to choose one (L7)', async () => {
  const { progressHtml } = await import('../web/map-render.js');
  const areas = app.data.specializations;
  app.data.specializations = [];
  document.body.dataset.view = 'me';
  run('me-noareas', () => { renderMe(); });
  app.data.specializations = areas;
  const html = writes.filter((w) => w.scope === 'me-noareas').map((w) => w.html).join('');
  assert.ok(html.length && !html.includes('p-spec') && !html.includes('בוחרים התמחות'));
  const prog = { total: 100, done: 1, planned: 0, adds: 0, specLeft: null };
  assert.ok(!progressHtml({ prog, opened: 0, year: 3, specs: [], areas: 0 }).includes('בחרו התמחות'));
  assert.ok(progressHtml({ prog, opened: 0, year: 3, specs: [], areas: 2 }).includes('בחרו התמחות'));
});

test('a friend name in the summary pills is escaped once, not twice (U1)', () => {
  const res = current(), saved = app.state.friends[0].groups;
  app.state.friends[0].groups = [...(res.a?.groups ?? res.groups ?? [])].slice(0, 3); // the friend takes the shown plan's groups
  run('view-u1', () => { renderView(); });
  app.state.friends[0].groups = saved;
  const pills = writes.filter((w) => w.scope === 'view-u1' && w.id === 'pills').map((w) => w.html).join('');
  assert.ok(pills.includes('class="pill friend"'), 'no friend pill: the plan shares no course with the friend (coverage hole)');
  assert.ok(!/&amp;(lt|gt|quot|#39|amp);/.test(pills), 'double-escaped entity in the pills');
});

test('a friend link from another program says which one, escaped', () => {
  app.friendLanding = { name: 'דנה', program: 20, groups: [] };
  run('banner-other', () => { renderBanner(); });
  const html = writes.filter((w) => w.scope === 'banner-other').at(-1).html;
  assert.match(html, /מתוכנית אחרת \(b&lt;xss-t/);
  app.friendLanding = { name: 'דנה', program: 30, groups: [] };
  run('banner-same', () => { renderBanner(); });
  assert.ok(!writes.filter((w) => w.scope === 'banner-same').at(-1).html.includes('מתוכנית אחרת'));
  app.friendLanding = null;
});

test('one h1 per page: the views use h2 under the app title (a11y)', () => {
  for (const s of ['me', 'view', 'side', 'picker']) for (const w of writes.filter((x) => x.scope === s)) assert.ok(!w.html.includes('<h1'), `${s} #${w.id}`);
});

test('the friends drawer offers a share button next to copy (WhatsApp)', () => {
  assert.ok(writes.filter((w) => w.scope === 'drawer-friends').some((w) => w.html.includes('data-act="shareOut"')));
});

test('the status page has the degree checklist, one row per requirement', () => {
  const me = writes.filter((w) => w.scope === 'me').map((w) => w.html).join('');
  assert.ok(me.includes('data-key="checklist"') && /מתוך \d/.test(me));
});

test('the preferences drawer offers a campus-day cap', () => {
  assert.ok(writes.filter((w) => w.scope === 'drawer-prefs').some((w) => w.html.includes('data-chg="maxDays"')));
});

test('lecturer buttons in the popover and the drawer list (hostile names escaped above)', () => {
  assert.ok(writes.filter((w) => w.scope === 'pop').some((w) => w.html.includes('data-act="lecturer"')));
  assert.ok(writes.filter((w) => w.scope === 'drawer-prefs').some((w) => w.html.includes('data-act="lecturerDrop"')));
});

test('a later alternative says what changes against the first, escaped', () => {
  assert.ok(ui.last.results.length >= 2, 'the hostile world finds at least two alternatives');
  ui.cur = 1;
  run('view-2', () => { renderView(); });
  ui.cur = 0;
  const html = writes.filter((w) => w.scope === 'view-2').map((w) => w.html).join('');
  assert.ok(html.includes('לעומת חלופה 1:'));
  assert.equal(parse(html).querySelectorAll('xss-t').length, 0);
});

test('the registration drawer offers the calendar export (the 2027 semesters have dates)', () => {
  const reg = writes.filter((w) => w.scope === 'drawer-reg').map((w) => w.html).join('');
  assert.ok(reg.includes('data-act="ics"') && !/data-act="ics"[^>]*disabled/.test(reg));
});
