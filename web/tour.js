// The first-visit tour (owner's request): Driver.js, hosted in vendor/driver/, two parts. `intro` walks the step bar once, after the gate (the terms, the track
// and the study year) is done; `plans` explains the board the first time step 4 shows an alternative. The replay button "סיור באתר" runs `intro` again.
// Seen parts are kept in localStorage; when it throws, the in-memory set still keeps a part from showing twice in one page load.
export const TOUR_KEY = 'afeka-sched-v1-tour';
const seen = new Set();
const stored = () => { try { return (localStorage.getItem(TOUR_KEY) ?? '').split(','); } catch { return []; } };
export const tourSeen = (part) => seen.has(part) || stored().includes(part);
export function markTour(part) {
  seen.add(part);
  try { localStorage.setItem(TOUR_KEY, [...new Set([...stored(), part])].filter(Boolean).join(',')); } catch { /* storage unavailable: kept for this page load only */ }
}

// The stops: a selector (the first visible match is used) and the text, which Driver.js writes with innerHTML, so plain text only (tour.test.mjs).
export const TOUR_INTRO = [
  { sel: 'nav.steps', text: 'ארבעה שלבים, מימין לשמאל. אפשר לחזור לכל שלב בכל רגע.' },
  { sel: '.steps a[data-view="me"]', text: 'המצב שלי: מסלול, שנה ומה כבר עברת. אפשר לייבא את גליון הציונים.' },
  { sel: '.steps a[data-view="courses"]', text: 'קורסים: מה ללמוד בסמסטר. מוצגים רק קורסים שפתוחים לך.' },
  { sel: '.steps a[data-view="prefs"]', text: 'מה חשוב לי: יום פנוי, בלי חלונות, עם חברים, שעות התחלה וסיום.' },
  { sel: '.steps a[data-view="plan"]', text: 'מערכות: עד 10 חלופות בלי התנגשויות. עוברים ביניהן בחיצים.' },
  { sel: '.actions', text: 'מכאן: רשימה להרשמה, סיכום לפגישה עם היועץ, ושיתוף עם חברים.' },
  { sel: '#tourBtn', text: 'אפשר לראות את הסיור שוב מכאן. זה כלי עזר לתכנון, ההרשמה עצמה באפקה-נט.' },
];
export const TOUR_PLANS = [
  { sel: '#switcher', text: 'כל חלופה היא מערכת שלמה בלי התנגשויות. החיצים עוברים ביניהן.' },
  { sel: '#week .blk', text: 'לחיצה על קבוצה מראה מרצה, מקומות פנויים ומתי זה נבדק.' },
  { sel: '#advisorBtn', text: 'דף מסודר להדפסה, להביא לפגישה עם היועץ.' },
  { sel: '[data-act="panel"][data-panel="reg"]', text: 'רשימת הקבוצות להרשמה, וייצוא ליומן.' },
];

const shown = (el) => (el.checkVisibility ? el.checkVisibility() : el.getClientRects().length > 0);
const find = (sel) => [...document.querySelectorAll(sel)].find(shown); // a phone shows one day of the week: the first block on screen, not the first in the page
let running = false;

// Runs a part (also the replay). A stop whose element is missing or hidden is skipped, so "1 מתוך N" counts the stops that are shown.
// Not over an open dialog, not on the print page, not while another tour runs. Returns whether a tour started.
// `home` (optional): where the focus goes at the end when the element focused at the start is gone (the gate's tile was redrawn).
export async function startTour(part, home) {
  if (running || document.querySelector('dialog[open]') || document.documentElement.classList.contains('print-summary')) return false;
  running = true;
  document.body.classList.add('touring'); // style.css: the plan buttons show on every step while a stop points at them
  const origin = document.activeElement;
  let keys;
  const end = () => { running = false; document.body.classList.remove('touring'); removeEventListener('keydown', keys, true); };
  try {
    const { driver } = await import('./vendor/driver/driver.js.mjs');
    const steps = (part === 'plans' ? TOUR_PLANS : TOUR_INTRO).map((s) => ({ element: find(s.sel), popover: { description: s.text, align: 'center' } }))
      .filter((s) => s.element);
    if (!steps.length) { end(); return false; }
    const calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tour = driver({
      steps, animate: !calm, showProgress: true, progressText: '{{current}} מתוך {{total}}', nextBtnText: 'הבא', prevBtnText: 'הקודם', doneBtnText: 'סיום',
      closeBtnLabel: 'דלג', popoverClass: 'tour-pop', stagePadding: 6, overlayOpacity: 0.6, disableActiveInteraction: true, allowKeyboardControl: false,
      onPopoverRender: (p) => { // a name for the dialog (no title is shown), and "דלג" as a visible word in the footer instead of the × in the corner
        p.wrapper.removeAttribute('aria-labelledby');
        p.wrapper.setAttribute('aria-label', 'סיור באתר');
        p.closeButton.textContent = 'דלג';
        p.footerButtons.prepend(p.closeButton);
      },
      onHighlighted: (el, _, { state }) => { // Enter walks on (Driver would focus "דלג"); and the stop is not announced as a button that opens a dialog
        state.popover?.nextButton.focus({ preventScroll: true });
        for (const a of ['aria-haspopup', 'aria-expanded', 'aria-controls']) el?.removeAttribute(a); // Driver restores what the element had when the stop ends
      },
      onDestroyed: () => { end(); (origin?.isConnected && origin !== document.body ? origin : home?.())?.focus({ preventScroll: true }); },
    });
    // Our own keys, before the page's (its arrows switch the alternative): Escape closes, and in RTL left is forward.
    keys = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !['Escape', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Escape') tour.destroy();
      else if (e.key === 'ArrowLeft' && tour.hasNextStep()) tour.moveNext();
      else if (e.key === 'ArrowRight' && tour.hasPreviousStep()) tour.movePrevious();
    };
    addEventListener('keydown', keys, true);
    tour.drive();
    markTour(part); // only once the tour is on screen: a failed start is asked again next time
    return true;
  } catch { end(); return false; } // the module did not load (offline, a stale cache): the tour is skipped and asked again next time
}
export const tourOnce = (part, home) => (tourSeen(part) ? false : startTour(part, home));

// The intro waits for the gate to be done (ACT.acceptTerms asks, ui-plan.js renderAll answers when the step bar is on screen).
let introDue = false;
export const dueIntro = () => { introDue = true; };
export async function tourCheck(ready, home) {
  if (!introDue || !ready) return;
  if (tourSeen('intro') || await startTour('intro', home)) introDue = false; // refused (a dialog is open): still due at the next render
}
