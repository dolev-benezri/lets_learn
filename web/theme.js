// Light or dark: the stored choice, else the device setting. A classic script in <head>, so data-theme is set before the first paint
// (the CSP forbids inline scripts). A .theme-btn flips it (its two labels follow data-theme in CSS); choosing what the device already shows
// forgets the choice, so the page follows the device again.
(() => {
  const KEY = 'afeka-sched-v1-theme', root = document.documentElement, mq = matchMedia('(prefers-color-scheme: dark)');
  let choice = null;
  try { choice = localStorage.getItem(KEY); } catch { /* storage unavailable: follow the device */ }
  const apply = () => {
    const dark = (choice ?? (mq.matches ? 'dark' : 'light')) === 'dark';
    root.dataset.theme = dark ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0F1627' : '#FFFFFF');
  };
  apply();
  mq.addEventListener('change', apply);
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.theme-btn')) return;
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    choice = next === (mq.matches ? 'dark' : 'light') ? null : next;
    try { if (choice) localStorage.setItem(KEY, choice); else localStorage.removeItem(KEY); } catch { /* kept for this visit only */ }
    apply();
  });
})();
