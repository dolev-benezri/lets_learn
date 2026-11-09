// The edit page (#edit, #edit/changes): a separate page from the build steps. Task 8 is the shell; the screens come in stage 3.
import { $ } from './ui-common.js';

export function renderEdit() {
  $('edit').innerHTML = `<button type="button" class="mode-label" data-act="menu" data-k="editMode">עורכים מערכת קיימת · החלפה</button>
    <div class="me-head"><h2 id="editTitle" tabindex="-1">עריכת מערכת קיימת</h2></div>`;
}
