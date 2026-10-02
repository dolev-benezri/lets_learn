// Small in-page dialogs replacing window.confirm / window.prompt, plus a Tab trap for sheets that aren't modal dialogs.
// Leaf module, no DOM access at import (app.js and the tests import it). <dialog>.showModal() gives the focus trap, Escape and inert
// background natively; we only restore focus to the opener and settle the promise.
const supported = () => typeof document !== 'undefined' && typeof HTMLDialogElement !== 'undefined' && !!HTMLDialogElement.prototype.showModal;

function open(build) {
  const from = document.activeElement;
  const d = document.createElement('dialog');
  d.className = 'dlg';
  build(d);
  document.body.append(d);
  return new Promise((resolve) => {
    d.addEventListener('close', () => { d.remove(); if (from?.isConnected) from.focus({ preventScroll: true }); resolve(d.returnValue); });
    d.addEventListener('click', (e) => { if (e.target === d) d.close(''); }); // a click on the backdrop cancels
    d.showModal();
    d.querySelector('[data-first]')?.focus();
    d.querySelector('textarea')?.select();
  });
}
function node(tag, props, ...kids) {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids);
  return n;
}

// Resolves true on the confirm button, false on cancel / Escape / backdrop. The safe choice (cancel) has initial focus.
// Without <dialog> support it falls back to window.confirm, and to "yes" when even that is missing (as the old code did).
export async function askConfirm(text, { ok = 'אישור', cancel = 'ביטול' } = {}) {
  if (!supported()) return typeof confirm === 'function' ? confirm(text) : true;
  const v = await open((d) => {
    d.setAttribute('role', 'alertdialog');
    d.setAttribute('aria-labelledby', 'dlgText');
    d.append(node('form', { method: 'dialog' },
      node('p', { id: 'dlgText', textContent: text }),
      node('div', { className: 'dlg-actions' },
        node('button', { type: 'submit', className: 'btn', value: '', textContent: cancel }),
        node('button', { type: 'submit', className: 'btn primary', value: 'ok', textContent: ok }))));
    d.querySelector('button').dataset.first = '';
  });
  return v === 'ok';
}

// A table with a checkbox per row (all checked), apply / cancel. `rows` are arrays of plain strings (set via textContent, never HTML).
// Resolves the indexes of the checked rows on apply, null on cancel / Escape / backdrop. Without <dialog> support: null.
export async function askRows(title, note, head, rows, { ok = 'החל', cancel = 'ביטול' } = {}) {
  if (!supported()) return null;
  let form;
  const v = await open((d) => {
    d.classList.add('dlg-rows');
    d.setAttribute('aria-labelledby', 'dlgTitle');
    const boxes = rows.map((r, i) => node('input', { type: 'checkbox', checked: true, name: 'row', value: String(i) }));
    boxes.forEach((b, i) => b.setAttribute('aria-label', `${rows[i][0]}: ${rows[i].at(-1)}`));
    const apply = node('button', { type: 'submit', className: 'btn primary', value: 'ok', textContent: ok });
    const table = node('table', {},
      node('thead', {}, node('tr', {}, node('th', { scope: 'col', textContent: 'החל' }), ...head.map((h) => node('th', { scope: 'col', textContent: h })))),
      node('tbody', {}, ...rows.map((r, i) => node('tr', {}, node('td', {}, boxes[i]), ...r.map((c) => node('td', { textContent: c }))))));
    form = node('form', { method: 'dialog' },
      node('h2', { id: 'dlgTitle', textContent: title }),
      node('p', { className: 'hint', textContent: note }),
      node('div', { className: 'dlg-scroll', tabIndex: 0 }, table),
      node('div', { className: 'dlg-actions' }, node('button', { type: 'submit', className: 'btn', value: '', textContent: cancel }), apply));
    form.querySelector('.dlg-scroll').setAttribute('role', 'region');
    form.querySelector('.dlg-scroll').setAttribute('aria-label', title);
    form.addEventListener('change', () => { apply.disabled = !boxes.some((b) => b.checked); });
    apply.dataset.first = '';
    d.append(form);
  });
  return v === 'ok' ? [...form.querySelectorAll('input[name=row]:checked')].map((b) => Number(b.value)) : null;
}

// Shows `text` selected in a read-only box so it can be copied by hand (when the clipboard API is refused).
export async function showText(title, text) {
  if (!supported()) { if (typeof prompt === 'function') prompt(title, text); return; }
  await open((d) => {
    d.setAttribute('aria-labelledby', 'dlgTitle');
    d.append(node('form', { method: 'dialog' },
      node('h2', { id: 'dlgTitle', textContent: title }),
      node('textarea', { readOnly: true, rows: 4, dir: 'ltr', value: text }),
      node('div', { className: 'dlg-actions' }, node('button', { type: 'submit', className: 'btn primary', textContent: 'סגור' }))));
    d.querySelector('textarea').setAttribute('aria-label', title);
  });
}

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
// Keydown handler body: keeps Tab / Shift+Tab inside `root` (for the phone popover sheet, which is not a modal dialog).
export function trapTab(e, root) {
  if (e.key !== 'Tab') return;
  const f = [...root.querySelectorAll(FOCUSABLE)].filter((x) => (x.checkVisibility ? x.checkVisibility() : true));
  if (!f.length) return;
  const a = document.activeElement, outside = !root.contains(a);
  if (e.shiftKey && (outside || a === f[0])) { e.preventDefault(); f.at(-1).focus(); }
  else if (!e.shiftKey && (outside || a === f.at(-1))) { e.preventDefault(); f[0].focus(); }
}
