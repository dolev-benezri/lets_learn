// Design A's route model (web/shell-routes.js): a hash is a mode (build or improve) and a tool; the stage is the board or the edit page; the
// overlay is the one tool panel that is open. Pure functions, so the whole table of docs/superpowers/plans/2026-11-21-design-a-adoption.md
// section 2.2 is tested here, and the browser spec only has to show that the page follows them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewOf, routeA, stageOf, panelOf, TOOLS, hashOfTool } from '../web/shell-routes.js';
import { routeOf } from '../web/app.js';

const FORMS = [
  ['', 'plan', { mode: 'build', tool: null }],
  ['#', 'plan', { mode: 'build', tool: null }],
  ['#me', 'me', { mode: 'build', tool: 'me' }],
  ['#courses', 'courses', { mode: 'build', tool: 'courses' }],
  ['#prefs', 'prefs', { mode: 'build', tool: 'wishes' }],
  ['#friends', 'friends', { mode: 'build', tool: 'friends' }],
  ['#out', 'out', { mode: 'build', tool: 'out' }],
  ['#edit', 'edit', { mode: 'improve', tool: 'edit' }],
  ['#edit/changes', 'edit', { mode: 'improve', tool: 'changes' }],
  ['#edit/zzz', 'edit', { mode: 'improve', tool: 'edit' }], // any #edit/... is the edit route, step 1
  ['#edit/me', 'edit', { mode: 'improve', tool: 'edit' }], // today's wildcard: nothing special, and never the record
  ['#f=abc', 'plan', { mode: 'build', tool: null }], // read at load and stripped: no tool of its own
  ['#b=abc', 'plan', { mode: 'build', tool: null }],
  ['#f=', 'plan', { mode: 'build', tool: null }], // an empty link is not read: plans
  ['#week', 'plan', { mode: 'build', tool: null }],
  ['#zzz', 'plan', { mode: 'build', tool: null }]
];
for (const [hash, view, route] of FORMS)
  test(`${JSON.stringify(hash)} is the ${view} view, ${route.mode} mode, tool ${route.tool}`, () => {
    assert.equal(viewOf(hash), view);
    assert.deepEqual(routeA(hash), route);
  });

test('a hash that is neither #friends nor #out is the live router\'s answer: classic never sees the two new ones as pages', () => {
  assert.equal(viewOf('#prefs'), 'prefs');
  assert.equal(routeOf('#friends'), 'plan', 'the classic router: the plans');
  assert.equal(routeOf('#out'), 'plan');
  assert.notEqual(viewOf('#friends'), routeOf('#friends'), 'which is why A compares its own views when it closes the overlays');
  assert.deepEqual(TOOLS.build, ['me', 'courses', 'wishes', 'friends', 'out']);
  assert.deepEqual(TOOLS.improve, [], 'stage 1: the improve mode has no dock');
});

test('the stage is the board in build mode and the edit page in improve mode', () => {
  assert.equal(stageOf(routeA('')), 'board');
  assert.equal(stageOf(routeA('#courses')), 'board');
  assert.equal(stageOf(routeA('#edit')), 'edit');
  assert.equal(stageOf(routeA('#edit/changes')), 'edit');
});

const ctx = (o = {}) => ({ wide: false, program: true, gated: false, termsOk: true, ...o });
test('panelOf: a phone shows a tool only when asked for it', () => {
  assert.equal(panelOf(routeA(''), ctx()), null);
  assert.equal(panelOf(routeA('#courses'), ctx()), 'courses');
  assert.equal(panelOf(routeA('#prefs'), ctx()), 'wishes');
  assert.equal(panelOf(routeA('#friends'), ctx()), 'friends');
  assert.equal(panelOf(routeA('#out'), ctx()), 'out');
});
test('panelOf: a wide screen always has a panel: courses, or the record before a program is chosen', () => {
  assert.equal(panelOf(routeA(''), ctx({ wide: true })), 'courses');
  assert.equal(panelOf(routeA(''), ctx({ wide: true, program: false })), 'me');
  assert.equal(panelOf(routeA('#me'), ctx({ wide: true })), 'me');
  assert.equal(panelOf(routeA('#friends'), ctx({ wide: true })), 'friends');
});
test('panelOf: in build mode the gate (terms, track, year) locks the panel to the record, whatever the address', () => {
  for (const hash of ['', '#courses', '#prefs', '#friends', '#out', '#me'])
    for (const wide of [false, true]) assert.equal(panelOf(routeA(hash), ctx({ wide, gated: true, termsOk: false })), 'me', `${hash} ${wide}`);
  assert.equal(panelOf(routeA('#courses'), ctx({ gated: true })), 'me', 'track or year missing');
});
test('panelOf: improve mode is gated by the terms only; the identity question lives in the edit loader', () => {
  assert.equal(panelOf(routeA('#edit'), ctx({ gated: true, termsOk: true })), null);
  assert.equal(panelOf(routeA('#edit'), ctx({ wide: true })), null, 'no wide default panel over the edit page');
  assert.equal(panelOf(routeA('#edit'), ctx({ gated: true, termsOk: false })), 'me', 'the terms first');
  assert.equal(panelOf(routeA('#edit/changes'), ctx()), null);
});
test('panelOf: an improve route never yields a build tool', () => {
  for (const hash of ['#edit', '#edit/changes', '#edit/me', '#edit/zzz'])
    assert.ok([null, 'me'].includes(panelOf(routeA(hash), ctx({ wide: true }))), hash);
});

test('hashOfTool is the inverse of routeA for the build tools', () => {
  for (const tool of TOOLS.build) assert.equal(routeA(hashOfTool(tool)).tool, tool);
  assert.equal(hashOfTool('wishes'), '#prefs');
});
