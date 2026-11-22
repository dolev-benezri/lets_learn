// The design switch (docs/superpowers/plans/2026-11-21-design-a-adoption.md, section 4). A classic script in <head> after theme.js: it sets
// html[data-design="a"] before the first paint, so design-a.css (every rule scoped under it) applies to the very first frame.
//   ?design=a        stores 'a'        ?design=classic  stores 'classic'        ?design=default  clears the choice
// Anything else in the query is ignored. No stored choice means DEFAULT: classic until the flip (Task 11 changes this one line to 'a').
// Storage can throw (private mode): the parameter still works for the visit, and nothing is remembered.
(() => {
  const KEY = 'afeka-sched-v1-design',
    DEFAULT = 'classic',
    param = new URLSearchParams(location.search).get('design');
  let choice = null;
  try {
    choice = localStorage.getItem(KEY);
    if (param === 'a' || param === 'classic') localStorage.setItem(KEY, (choice = param));
    else if (param === 'default') {
      localStorage.removeItem(KEY);
      choice = null;
    }
  } catch {
    // storage blocked: the query alone decides for this visit
    if (param === 'a' || param === 'classic') choice = param;
    else if (param === 'default') choice = null;
  }
  if (choice !== 'a' && choice !== 'classic') choice = DEFAULT;
  if (choice === 'a') document.documentElement.dataset.design = 'a';
})();
