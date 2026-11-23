// Design A's build-tool filter: reuse the improve predicate, keep the field and row nodes while typing.
import { app, esc } from './app.js';
import { matches } from './course-search.js';
import { courseCount } from './ui-text.js';
import { $, ui, openDetails, designOn } from './ui-common.js';

export function renderCourseFilter() {
  if (!designOn()) return;
  if (!$('courseQuery')) $('courses').insertAdjacentHTML('afterbegin', `<div class="a-course-search">
    <label class="field" for="courseQuery">חיפוש קורס: קוד, שם או מרצה</label>
    <input id="courseQuery" type="search" data-k="courseQuery" aria-controls="side" value="${esc(ui.courseQuery)}">
    <p id="courseQueryStatus" class="hint" role="status" aria-live="polite" aria-atomic="true"></p></div>`);
  filterCourseRows();
}

export function filterCourseRows() {
  if (!designOn() || !$('courseQuery')) return;
  const side = $('side'), active = !!ui.courseQuery.trim();
  const groups = [...side.querySelectorAll('details[data-key]')];
  if (active && !ui.courseGroups) ui.courseGroups = new Map(groups.map((g) => [g.dataset.key, g.open]));
  let n = 0;
  for (const row of side.querySelectorAll('[data-course-id]')) {
    const id = row.dataset.courseId;
    const hit = !active || matches({ ...app.data.courses[id], code: id }, ui.courseQuery);
    // a course in the plan stays on screen, but the count says what the query found
    row.hidden = !hit && !row.closest('details[data-key="plan"]');
    if (hit) n++;
  }
  for (const group of groups) {
    const key = group.dataset.key;
    if (active && !ui.courseGroups.has(key)) ui.courseGroups.set(key, openDetails.has(key));
    group.hidden = active && key !== 'plan' && !group.querySelector('[data-course-id]:not([hidden])');
    if (active) group.open = !group.hidden;
    else if (ui.courseGroups?.has(key)) {
      group.open = ui.courseGroups.get(key);
      openDetails[group.open ? 'add' : 'delete'](key);
    }
  }
  // Unchosen specializations share an outer group; hide the headings of lists with no matching row.
  for (const heading of side.querySelectorAll('h4'))
    heading.hidden = active && !heading.nextElementSibling?.querySelector('[data-course-id]:not([hidden])');
  if (!active) ui.courseGroups = null;
  const message = n ? courseCount(n) : 'אין קורס כזה';
  if ($('courseQueryStatus').textContent !== message) $('courseQueryStatus').textContent = message;
}

export function onCourseQueryInput(e) {
  if (!designOn() || e.target.id !== 'courseQuery') return;
  ui.courseQuery = e.target.value;
  filterCourseRows();
}

export function onCourseQueryKey(e) {
  if (!designOn() || e.key !== 'Escape' || e.target.id !== 'courseQuery' || e.defaultPrevented) return;
  e.preventDefault();
  e.stopPropagation();
  e.target.value = ui.courseQuery = '';
  filterCourseRows();
}
