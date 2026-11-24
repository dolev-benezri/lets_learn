// Phase 5's markup and storage contract. Browser specs cover focus, computed colours, targets and confirmation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'node-html-parser';
import { readFileSync } from 'node:fs';

await import('../web/app.js'); // import before the UI cycle, and before supplying a document stub
const { app } = await import('../web/app.js');
const { menuPanel } = await import('../web/ui-mode.js');
const { renderDrawer } = await import('../web/ui-drawer.js');
const { ui } = await import('../web/ui-common.js');
const { LEGAL_LINE } = await import('../web/ui-text.js');
const { legendA, getMapFocus, setMapFocus, MAP_FOCUS_KEY } = await import('../web/ui-map.js');
const { legendSw } = await import('../web/map-render.js');

function withDesign(t, design) {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const drawer = { innerHTML: '' };
  globalThis.document = { documentElement: { dataset: { design } }, getElementById: () => drawer };
  t.after(() => old ? Object.defineProperty(globalThis, 'document', old) : delete globalThis.document);
  return drawer;
}

test('A menu: a list of five ordered rows, four hidden chevrons, erase last and apart, no theme', (t) => {
  withDesign(t, 'a');
  const [title, html] = menuPanel(), root = parse(html);
  assert.equal(title, 'תפריט');
  assert.deepEqual(root.querySelectorAll('ul.a-menu > li button').map((b) => b.text.trim()),
    ['סיור באתר', 'שאלות נפוצות', 'מפת התקדמות', 'מידע ותנאים', 'מחק את כל הנתונים שלי']);
  assert.equal(root.querySelectorAll('.a-menu-chevron[aria-hidden="true"]').length, 4);
  assert.ok(root.querySelector('.a-menu-erase [data-act="eraseAll"].danger'));
  assert.equal(root.querySelector('.a-menu-erase .a-menu-chevron'), null);
  assert.equal(root.querySelector('.theme-btn'), null);
});

test('classic menu keeps its original markup', (t) => {
  withDesign(t, undefined);
  const old = globalThis.location;
  globalThis.location = { hash: '' };
  t.after(() => old ? globalThis.location = old : delete globalThis.location);
  assert.deepEqual(menuPanel(), ['תפריט', '<nav class="mode-menu" aria-label="מצבי עבודה">' +
    '<a class="mode-link" href="#" data-act="mode" data-mode="build" data-k="menu-build" aria-current="page">בניית מערכת</a>' +
    '<a class="mode-link" href="#edit" data-act="mode" data-mode="edit" data-k="menu-edit">עריכת מערכת קיימת</a></nav>']);
});

test('A info: header back arrow, one legal sentence, source sentence and accessible new-tab link rows', (t) => {
  const drawer = withDesign(t, 'a');
  const old = { panel: ui.panel, data: app.data, state: app.state, settings: app.settings };
  t.after(() => { ui.panel = old.panel; Object.assign(app, { data: old.data, state: old.state, settings: old.settings }); });
  ui.panel = 'info';
  Object.assign(app, { data: { fetchedAt: '2026-11-01T12:00:00Z' }, state: null, settings: { counselingUrl: 'https://example.org/counsel' } });
  renderDrawer();
  const root = parse(drawer.innerHTML);
  assert.equal(root.querySelector('.dr-head [aria-label="חזרה לתפריט"]').text, '→');
  assert.equal(root.querySelector('.dr-actions'), null);
  assert.equal(root.text.split(LEGAL_LINE).length - 1, 1);
  assert.equal(root.text.split('אינו הרשמה ואינו המלצה').length - 1, 1);
  assert.equal(root.querySelectorAll('.info-sec')[1].querySelectorAll('p.hint')[1].text,
    'לפני ההרשמה מומלץ להתייעץ עם יועץ לימודים.');
  assert.match(root.querySelector('.info-sec').text, /הנתונים נלקחים מהידיעון הציבורי/);
  const links = root.querySelectorAll('.info-links a');
  assert.equal(links.length, 5);
  for (const a of links) {
    assert.equal(a.getAttribute('target'), '_blank');
    assert.equal(a.getAttribute('rel'), 'noopener');
    assert.equal(a.querySelector('.sr').text, ' (נפתח בלשונית חדשה)');
    assert.ok(a.querySelector('svg[aria-hidden="true"]'));
  }
});

test('A legend: four main samples, closed native fold with remaining statuses and shapes, labelled switch', () => {
  const root = parse(legendA(true));
  assert.deepEqual(root.querySelectorAll('.pm-legend-main > .lg-i').map((e) => e.text),
    ['במערכת שלי', 'עברתי', 'זמין עכשיו', 'חסום, חסר קדם']);
  const more = root.querySelector('details.pm-legend-more');
  assert.equal(more.hasAttribute('open'), false);
  assert.equal(more.querySelector('summary').text, 'עוד במקרא');
  for (const s of ['פטור', 'זמין בתנאי', 'חזרה', 'בב׳ אחרי', 'לא נלמד בסמסטר', 'השנה שלך', 'קדם', 'מקביל', 'אחד מהם מספיק',
    'קורס שהמערכת פותחת', 'לא בתוכנית שלך', 'לפני התואר']) assert.ok(more.text.includes(s), s);
  const button = root.querySelector('[role="switch"]');
  assert.equal(button.text, 'הדגשת המערכת');
  assert.equal(button.getAttribute('aria-checked'), 'true');
  assert.equal(parse(legendA(false)).querySelector('[role="switch"]').getAttribute('aria-checked'), 'false');
  assert.ok(parse(legendSw('plan')).querySelector('.sw.plan .plan-ring[r="14"]'));
  assert.ok(parse(legendSw('plan')).querySelector('.sw.plan .ring[r="10"]'));
});

test('map focus defaults on, persists in its own key, and holds the choice when storage throws', (t) => {
  const old = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  t.after(() => old ? Object.defineProperty(globalThis, 'localStorage', old) : delete globalThis.localStorage);
  const items = new Map();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (k) => items.get(k) ?? null, setItem: (k, v) => items.set(k, v)
  } });
  assert.equal(MAP_FOCUS_KEY, 'afeka-sched-v1-mapfocus');
  assert.equal(getMapFocus(), true);
  setMapFocus(false);
  assert.equal(items.get(MAP_FOCUS_KEY), 'off');
  assert.equal(getMapFocus(), false);
  setMapFocus(true);
  assert.equal(getMapFocus(), true);
  items.clear();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => null, setItem() { throw new Error('write blocked'); }
  } });
  setMapFocus(false);
  assert.equal(getMapFocus(), false, 'readable storage with blocked writes still keeps the visit choice');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
  setMapFocus(false);
  assert.equal(getMapFocus(), false);
  setMapFocus(true);
  assert.equal(getMapFocus(), true);
});

test('all Phase 5 map overrides are scoped to A', () => {
  const css = readFileSync(new URL('../web/map.css', import.meta.url), 'utf8');
  const added = css.slice(css.indexOf('/* Design A: the shown plan'));
  assert.ok(added.length > 100);
  const selectors = added.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{/g);
  for (const [, selector] of selectors) {
    // A media query wraps rules; the rules inside it are checked on their own.
    if (selector.trim().startsWith('@media')) continue;
    // Commas inside :is() belong to one selector.
    for (const s of selector.replace(/:is\([^)]*\)/g, ':is(*)').split(','))
      assert.ok(s.trim().startsWith(':root[data-design="a"]'), s);
  }
});
