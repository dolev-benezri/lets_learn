// Pure pieces shared by design A's build and improve phone sheets.
export function sheetExpandHtml(kind, expanded = false) {
  const label = expanded ? 'הקטנה' : 'הגדלה';
  return `<button type="button" class="a-sheet-expand" data-act="expandSheet" data-sheet="${kind === 'edit' ? 'edit' : 'panel'}"
    data-k="expand-${kind === 'edit' ? 'edit' : 'panel'}" aria-expanded="${expanded}" aria-label="${label}">
    <span class="a-sheet-handle" aria-hidden="true"></span><span>${label}</span></button>`;
}

// Keep the first 44px of the first lesson visible. Already visible rows do not move.
export function sheetScrollY(y, rowTop, visibleTop, sheetTop) {
  const top = Math.max(0, visibleTop) + 8;
  if (rowTop >= top && rowTop + 44 <= sheetTop - 8) return y;
  return Math.max(0, y + rowTop - top);
}
