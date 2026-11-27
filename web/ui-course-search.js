// The improve page's course search view (phase 2, Task F): the HTML of the tool column while a search is open. Pure, no DOM; the state and the events are
// ui-edit.js's. `s` = { text, day, hour, sem, program }, `programs` = [{ id, name }] (the catalog's, the student's own first), `r` = searchCourses()'s answer.
import { esc } from './app.js';
import { NO_HOURS_TEXT } from './rules.js';

const DAY_NAMES = ['', 'א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳'];
const HOURS = Array.from({ length: 13 }, (_, i) => `${String(i + 8).padStart(2, '0')}:00`);
const SEMS = [['א', 'סמסטר א׳'], ['ב', 'סמסטר ב׳'], ['קיץ', 'קיץ']];
const opt = (v, label, on) => `<option value="${esc(v)}"${on ? ' selected' : ''}>${esc(label)}</option>`;
// a chip that is a select (the goal chips' pattern): its first option is the chip's own label, the "no choice"
const chip = (key, value, sr, shown, options) =>
  `<label class="chip${value ? ' on' : ''}"><span class="sr">${esc(sr)}</span><select data-ed-s="${key}" data-k="cs-${key}">${opt('', shown, !value)}` +
  `${options.map(([v, label]) => opt(v, label, String(v) === String(value))).join('')}</select></label>`;

export const NO_QUERY = 'מקלידים קוד, שם או מרצה, או בוחרים יום ושעה.';
export function countLine(r, asked, failed) {
  if (failed === 'loading') return 'טוענים את התוכנית…';
  if (failed) return 'לא הצלחנו לטעון את הקורסים של התוכנית. אפשר לבחור שוב.';
  if (!asked) return NO_QUERY;
  if (!r.list.length) return 'אין קורס כזה';
  if (r.more) return 'יש עוד, מצמצמים?';
  return r.list.length === 1 ? 'קורס אחד' : `${r.list.length} קורסים`;
}

const TAG = { fits: ['נכנס', 'ok'], full: ['מלא', 'bad'] };
function optionHtml(row, o) {
  const with_ = row.withIds?.length ? ` data-with="${esc(row.withIds.join(','))}"` : '';
  const tag = o.fit === 'clash' ? ['מתנגש עם ' + o.clash.join(', '), 'warn'] : TAG[o.fit];
  // a full group (the tag says it) cannot be taken: no button, whatever the course's state
  const act = row.readOnly || o.fit === 'full'
    ? ''
    : row.inSchedule
      ? `<button type="button" class="btn" data-ed="csSwap" data-k="cs-${esc(row.id)}-${esc(o.ids.join('+'))}" data-course="${esc(row.id)}" data-ids="${esc(o.ids.join(','))}">מעבר לקבוצה</button>`
      : row.open
        ? `<button type="button" class="btn" data-ed="csAdd" data-k="cs-${esc(row.id)}-${esc(o.ids.join('+'))}" data-course="${esc(row.id)}" data-ids="${esc(o.ids.join(','))}"${with_}>הוספה</button>`
        : '';
  return `<li class="cs-opt"><span class="cs-when">${esc(o.line)}</span>${o.lecturer ? ` <span class="cs-who">${esc(o.lecturer)}</span>` : ''}
    <span class="tag ${tag[1]}">${esc(tag[0])}</span>${act}</li>`;
}
export function courseHtml(row) {
  const reason = row.readOnly ? row.readOnlyWhy : row.why;
  const why = [reason, row.noHours && reason !== NO_HOURS_TEXT ? NO_HOURS_TEXT : ''].filter(Boolean).join(' · ');
  const body = !row.options.length
    ? row.noHours ? '' : '<p class="hint">אין קבוצה פתוחה</p>'
    : `<ul class="plain cs-opts">${row.options.map((o) => optionHtml(row, o)).join('')}</ul>`;
  return `<li class="cs-course"><h3>${esc(row.name)}</h3>
    <p class="hint cs-meta"><bdi dir="ltr">${esc(row.code)}</bdi> · ${esc(row.credits)} נ״ז${row.inSchedule ? ' · במערכת שלך' : ''}${why ? ` · ${esc(why)}` : ''}</p>
    ${row.needs ? `<p class="hint">${esc(row.needs)}</p>` : ''}${body}</li>`;
}

// The list alone (typing redraws only this and the count's text, so the field keeps its caret and focus and the live region is the same element)
export const resultsHtml = (r, asked) => (asked && r.list.length ? `<ul class="plain cs-list">${r.list.map(courseHtml).join('')}</ul>` : '');

export function searchViewHtml(s, programs, r, asked, failed) {
  return `<div class="me-head cs-head"><button type="button" class="btn ghost a-back" data-ed="closeSearch" data-k="csBack">
      <svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg><span>חזרה</span></button>
    <h2 id="editTitle" tabindex="-1">חיפוש קורס</h2></div>
  <div class="cs-field"><label for="csText" class="sr">חיפוש קורס</label>
    <input id="csText" type="search" data-ed-s="text" data-k="cs-text" placeholder="קוד, שם או מרצה" autocomplete="off" value="${esc(s.text)}"></div>
  <div class="goals cs-chips" role="group" aria-label="סינון">
    ${chip('day', s.day, 'יום', 'יום ▾', DAY_NAMES.slice(1).map((n, i) => [i + 1, `יום ${n}`]))}
    ${chip('hour', s.hour, 'שעה', 'שעה ▾', HOURS.map((h) => [h, h]))}
    ${chip('sem', s.sem, 'סמסטר', 'סמסטר ▾', SEMS)}
    ${programs.length > 1 ? chip('program', s.program === 'mine' ? '' : s.program, 'תוכנית', 'תוכנית ▾', programs.map((p) => [p.id, p.name])) : ''}
  </div>
  <p class="hint cs-count" id="csCount" role="status" aria-live="polite">${esc(countLine(r, asked, failed))}</p>
  <div id="csResults">${resultsHtml(r, asked)}</div>`;
}
