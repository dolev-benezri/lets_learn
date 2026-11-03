// The advisor panel's file. It is built when the panel shows, not on the tap: navigator.share must run inside the tap, with no wait before it.
// It stays in memory, is never stored, and is dropped when the panel closes; it leaves only if the person shares or downloads it.
import { buildAdvisorPdf, loadPdfLibs } from './advisor-pdf.js';
import { esc } from './app.js';
import { toast } from './ui-common.js';
import { icon } from './ui-grid.js';

const NAME = 'advisor-summary.pdf'; // English: the Hebrew name came through a share as underscores
const BUTTON = '[data-act="advisorPdf"]';
let key = null,
  run = 0,
  file = null,
  dropped = [],
  failed = false;

export const advisorPdfFile = () => file;

// A system sheet only on a phone: on a desktop a download is what people expect, even where a sheet exists.
const canShareFile = () => matchMedia('(pointer:coarse)').matches && Boolean(navigator.canShare?.({ files: [file] }));

const buttonLabel = () => (!file ? 'מכין PDF…' : canShareFile() ? `${icon('share')} שתף PDF` : `${icon('file')} הורד PDF`);
const noteText = () =>
  failed
    ? 'לא הצלחנו להכין PDF. אפשר להעתיק את הסיכום או לנסות שוב כשהקליטה טובה.'
    : dropped.length
      ? `לא נכנסו לקובץ: ${dropped.join(' ')}`
      : '';

export const advisorPdfButton = () =>
  failed
    ? ''
    : `<button type="button" class="btn primary" data-act="advisorPdf" data-k="advisorPdf"${file ? '' : ' aria-disabled="true"'}>${buttonLabel()}</button>`;
export const advisorPdfNote = () => `<p class="hint advisor-pdf-note" role="status"${noteText() ? '' : ' hidden'}>${esc(noteText())}</p>`;

// Readiness changes this button and nothing else: re-rendering the drawer here would throw keyboard focus away.
function paint() {
  const note = document.querySelector('.advisor-pdf-note'),
    button = document.querySelector(BUTTON);
  if (note) {
    note.textContent = noteText();
    note.hidden = !noteText();
  }
  if (!button) return;
  if (failed) {
    const wasFocused = document.activeElement === button;
    button.remove();
    if (wasFocused) document.querySelector('[data-act="advisorCopy"]')?.focus();
    return;
  }
  button.innerHTML = buttonLabel();
  button.removeAttribute('aria-disabled');
}

// Called on every render of the panel: the same content keeps its file or its build in flight, other content starts over and an older build is ignored.
export function syncAdvisorPdf(blocks) {
  const next = JSON.stringify(blocks);
  if (next === key) return;
  key = next;
  file = null;
  dropped = [];
  failed = false;
  const mine = ++run;
  loadPdfLibs()
    .then((libs) => buildAdvisorPdf(blocks, libs))
    .then((r) => {
      if (mine !== run) return;
      file = new File([r.bytes], NAME, { type: 'application/pdf' });
      dropped = r.dropped;
      paint();
    })
    .catch(() => {
      if (mine !== run) return;
      failed = true;
      paint();
    });
}

export function dropAdvisorPdf() {
  run++;
  key = null;
  file = null;
  dropped = [];
  failed = false;
}

export function advisorPdfAct() {
  if (!file) return; // still being built
  if (canShareFile()) {
    // files only: some targets drop a file that comes with text. A closed sheet is not an error, and if no target was found the copy button is still there.
    navigator.share({ files: [file] }).catch((e) => {
      if (e?.name !== 'AbortError') toast('השיתוף לא הצליח. אפשר להעתיק את הסיכום כטקסט.');
    });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = NAME;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('הקובץ ירד.');
}
