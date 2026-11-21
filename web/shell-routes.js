// Design A's route model (docs/superpowers/plans/2026-11-21-design-a-adoption.md, section 2.2). Pure functions, no DOM: a hash is a mode (build or
// improve) and a tool; the stage is the board (build) or the edit page (improve); the overlay is the one tool panel that is open.
// Classic keeps using routeOf from app.js; only the A shell (ui-shell.js) and the test/shell-panels.test.mjs table call these.
import { routeOf } from './app.js';

// the tools of the dock, in order. The improve mode has none in stage 1: the edit page is its own stage and asks for the terms only.
export const TOOLS = { build: ['me', 'courses', 'wishes', 'friends', 'out'], improve: [] };
const TOOL_HASH = { me: '#me', courses: '#courses', wishes: '#prefs', friends: '#friends', out: '#out' };
const VIEW_TOOL = { me: 'me', courses: 'courses', prefs: 'wishes', friends: 'friends', out: 'out' };
export const hashOfTool = (tool) => TOOL_HASH[tool];

// routeOf's view names plus the two addresses only A knows: a classic page falls through to the plans on #friends and #out
export const viewOf = (hash) => (hash === '#friends' ? 'friends' : hash === '#out' ? 'out' : routeOf(hash));

// { mode: 'build' | 'improve', tool }. Any #edit or #edit/... is improve mode; only exactly #edit/changes is its second step.
export function routeA(hash) {
  const view = viewOf(hash);
  if (view === 'edit') return { mode: 'improve', tool: hash === '#edit/changes' ? 'changes' : 'edit' };
  return { mode: 'build', tool: VIEW_TOOL[view] ?? null };
}

export const stageOf = (route) => (route.mode === 'improve' ? 'edit' : 'board');

// The overlay: the tool panel to show, or null. ctx: { wide, program, gated, termsOk }. Improve mode is gated by the terms only (the edit page asks
// for the track and year inside its own loader). In build mode the gate (terms, track, year) locks the panel to the record. A wide screen always
// has a panel: the courses, or the record while there is no program yet.
export function panelOf(route, ctx) {
  if (route.mode === 'improve') return ctx.termsOk ? null : 'me';
  if (ctx.gated) return 'me';
  if (route.tool) return route.tool;
  return ctx.wide ? (ctx.program ? 'courses' : 'me') : null;
}
