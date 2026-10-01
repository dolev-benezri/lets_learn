import { groupIndex } from './ui-grid.js';

// Afeka group ids are 9 digits; (?<!\d)…(?!\d) keeps 10-digit phone numbers out.
export function groupsFromText(text, data) {
  const known = groupIndex(data), found = [], unknown = [];
  for (const [id] of String(text).matchAll(/(?<!\d)\d{9}(?!\d)/g)) {
    const list = known.has(id) ? found : unknown;
    if (!list.includes(id)) list.push(id);
  }
  return { found, unknown };
}

// Place a group in a draft: add gid, remove any other group of the same course and type, toggle off if already present.
// Result is capped at 40.
export function placeGroup(draft, gid, data) {
  const byId = groupIndex(data);
  const { cid, g } = byId.get(gid);

  let result = draft.slice();
  const gidIndex = result.indexOf(gid);

  // If already in draft, toggle it off
  if (gidIndex >= 0) {
    result.splice(gidIndex, 1);
    return result;
  }

  // Add the group and remove other groups of the same course and type
  result = result.filter((id) => {
    const other = byId.get(id);
    if (!other) return true;
    // Remove if same course and same type
    return other.cid !== cid || other.g.type !== g.type;
  });

  result.push(gid);

  // Cap at 40
  return result.slice(0, 40);
}
