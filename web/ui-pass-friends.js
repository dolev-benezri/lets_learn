// Design A, first-run step 5 ("רוצה ללמוד עם חברים?", spec "Phase 3, first run"): add a friend (a pasted link, or the editor), the friends so far, and
// "הקישור שלי" (my name in the link, copy, share) under "עוד" (a native <details> that keeps its open state across a redraw). A friend's link that arrived on the first
// visit waits at the top as "<name> שיתף/ה מערכת · הוספה" (app.friendLanding, kept with the mark: ui-common.js keepLanding). There is no "אין לי חברים":
// the step's button, "לבנות מערכת", ends the pass with or without a friend. Its ids and keys carry "fr": the hidden friends page keeps its own.
import { app, esc } from './app.js';
import { icon, initials } from './ui-grid.js';
import { groupCount } from './ui-text.js';
import { ui, details, allGroupIds } from './ui-common.js';

function landingHtml() {
  const L = app.friendLanding;
  if (!L) return '';
  return `<div class="a-fr-landing"><span class="av lg" aria-hidden="true">${esc(initials(L.name || 'חבר'))}</span>
    <span class="grow"><b>${esc(L.name || 'חבר')}</b> שיתף/ה מערכת · ${groupCount(L.groups.length)}</span>
    <button type="button" class="btn primary" data-act="landingAdd" data-k="frLanding">הוספה</button></div>`;
}

function friendRow(f, i) {
  const known = allGroupIds(),
    miss = f.groups.filter((g) => !known.has(g)).length;
  const edit = f.manual
    ? `<button type="button" class="btn icon-btn ghost" id="frEdit-${i}" data-act="editFriend" data-i="${i}" data-k="frEdit-${i}"
        aria-label="ערוך את ${esc(f.name)}">${icon('pencil')}</button>`
    : '';
  return `<li class="a-fr-friend"><span class="av lg" aria-hidden="true">${esc(initials(f.name))}</span>
    <span class="grow"><b>${esc(f.name)}</b><span class="hint"> · ${groupCount(f.groups.length - miss)}${miss ? ` · <span class="warn-text">${miss} לא נמצאו</span>` : ''}</span></span>
    ${edit}<button type="button" class="btn icon-btn ghost" data-act="removeFriend" data-i="${i}" data-k="frRm-${i}"
      aria-label="הסר את ${esc(f.name)}">${icon('x')}</button></li>`;
}

export function stepFiveHtml() {
  const { state } = app;
  const err = ui.friendMsg ? `<p class="err-text" id="frFriendErr" role="alert">${icon('alert')} ${esc(ui.friendMsg)}</p>` : '';
  const mine = `<label class="field col">השם שלי בקישור <input type="text" maxlength="60" data-chg="myName" data-k="frMyName" value="${esc(state.name)}"></label>
    <button type="button" class="btn a-fr-wide" data-act="share" data-k="frCopyMine">${icon('copy')} העתק את הקישור שלי</button>
    <button type="button" class="btn a-fr-wide" data-act="shareOut" data-k="frShareOut">${icon('share')} שתף (וואטסאפ ועוד)</button>
    <p class="hint">הקישור כולל רק את השם ואת הקבוצות של החלופה המוצגת, בלי ציונים.</p>`;
  return `<p class="a-fr-line">מוסיפים חבר, והאתר ינסה לשבץ אתכם יחד.</p>${landingHtml()}
    <section class="a-fr-sec"><h3>הוספת חבר</h3>
      <p class="hint" id="frFriendHow">בקשו מחבר ללחוץ על ״שתף״ ולשלוח לכם את הקישור, והדביקו אותו כאן.</p>
      <form id="frFriendForm" class="a-fr-add"><label for="frFriendUrl" class="sr">קישור שחבר שלח</label>
        <input id="frFriendUrl" type="text" inputmode="url" autocomplete="off" dir="ltr" data-k="frFriendUrl" placeholder="הדביקו קישור" value="${esc(ui.friendUrl)}"
          aria-describedby="frFriendHow${ui.friendMsg ? ' frFriendErr' : ''}"${ui.friendMsg ? ' aria-invalid="true"' : ''}>
        <button type="submit" class="btn" data-k="frAddFriend">${icon('user-plus')} הוסף</button></form>${err}
      <button type="button" class="btn a-fr-wide" id="frOpenEditor" data-act="openFriendEditor" data-k="frOpenEditor">הזנת מערכת של חבר</button></section>
    <section class="a-fr-sec"><h3 id="frFriendsH" tabindex="-1">החברים שלי</h3>${
      state.friends.length
        ? `<ul class="plain a-fr-friends">${state.friends.map(friendRow).join('')}</ul>`
        : '<div class="fr-empty"><p><b>עוד אין חברים</b></p><p class="hint">הדביקו למעלה קישור שחבר שלח, או הזינו את המערכת שלו ידנית.</p></div>'
    }</section>${details('fr-more-friends', 'הקישור שלי', mine, 1)}`;
}
