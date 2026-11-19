// Build or edit: the choice on first entry (a card for each, in the #me container before the identity questions) and the side menu (☰) that holds both.
import { app } from './app.js';
import { termsOk, $ } from './ui-common.js';

export const MODE_KEY = 'afeka-sched-v1-mode'; // 'build' | 'edit'
let chosen = null; // blocked storage: the choice still holds for this visit
export const getMode = () => {
  try {
    return localStorage.getItem(MODE_KEY) ?? chosen;
  } catch {
    return chosen;
  }
};
export const setMode = (mode) => {
  chosen = mode;
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    /* storage unavailable: kept for this visit only */
  }
};
// An explicit link (#edit, #me, a step, a friend or backup link) always wins over a missing choice.
const EXPLICIT = /^#(edit(\/|$)|me$|courses$|prefs$|[fb]=)/;
// still to be asked (the terms come first; ui-plan.js keeps the first-visit #me redirect back until then)
export const modeOpen = () => !getMode() && !app.state?.programSet;
// a friend or backup link is stripped from the address once read (app.js applyHash): it waits in app.friendLanding or app.pendingBackup
export const needsModeChoice = (hash = globalThis.location?.hash ?? '') =>
  termsOk() && modeOpen() && !EXPLICIT.test(hash) && !app.friendLanding && !app.pendingBackup;

// takes the status page's container, like the gate questions (ui-plan.js renderRoute)
export const renderModeChoice = () => {
  $('me').innerHTML = `<div class="gate"><div class="me-head"><h2 id="meTitle" tabindex="-1">מה רוצים לעשות?</h2></div>
  <div class="tiles modes" role="group" aria-labelledby="meTitle">
    <button type="button" class="tile" data-act="pickMode" data-mode="build" data-k="mode-build"><b>לבנות מערכת חדשה</b><span>ארבעה צעדים עד למערכת מוכנה</span></button>
    <button type="button" class="tile" data-act="pickMode" data-mode="edit" data-k="mode-edit"><b>לשפר מערכת שכבר יש לי</b><span>טוענים קובץ ומזיזים קורס</span></button>
  </div></div>`;
};

// The side menu's panel (ui-drawer.js PANELS): [title, body]
export function menuPanel() {
  const editing = location.hash === '#edit' || location.hash.startsWith('#edit/');
  const link = (mode, href, text) =>
    `<a class="mode-link" href="${href}" data-act="mode" data-mode="${mode}" data-k="menu-${mode}"${editing === (mode === 'edit') ? ' aria-current="page"' : ''}>${text}</a>`;
  return ['תפריט', `<nav class="mode-menu" aria-label="מצבי עבודה">${link('build', '#', 'בניית מערכת')}${link('edit', '#edit', 'עריכת מערכת קיימת')}</nav>`];
}
