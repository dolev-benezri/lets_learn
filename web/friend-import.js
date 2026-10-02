import { groupIndex } from './ui-grid.js';
import { toMin } from './solver-core.js';

// Afeka group ids are 9 digits, tutorials and labs add /N ("271001601/1", spaces around the slash allowed); the whole token is classified.
// A ":" after /N means a time, not an id. (?<!\d)…(?!\d) keeps 10-digit phone numbers out.
export function groupsFromText(text, data) {
  const known = groupIndex(data), found = [], unknown = [];
  for (const [tok] of String(text).matchAll(/(?<!\d)\d{9}(?:\s*\/\s*\d{1,2}(?![\d:]))?(?!\d)/g)) {
    const id = tok.replace(/\s+/g, ''); // pdf.js / OCR may split "271001601 / 1"
    const list = known.has(id) ? found : unknown;
    if (!list.includes(id)) list.push(id);
  }
  return { found, unknown };
}

// Place a group in a draft: add gid, remove any other group of the same course and type, toggle off if already present.
// An unknown gid, or a placement that would pass 40 groups, returns the draft unchanged (a copy).
export function placeGroup(draft, gid, data) {
  const byId = groupIndex(data);
  if (!byId.has(gid)) return draft.slice();
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

  return result.length > 40 ? draft.slice() : result;
}

// The cid a search box means: the datalist text "name (cid)", a bare cid, or a name substring that fits exactly one course.
export function findCourse(text, courses) {
  const t = String(text).trim();
  if (!t) return null;
  const ids = Object.keys(courses);
  const exact = ids.find((id) => id === t || courses[id].name === t || `${courses[id].name} (${id})` === t);
  if (exact) return exact;
  const part = ids.filter((id) => courses[id].name.includes(t));
  return part.length === 1 ? part[0] : null;
}

// Gids (present in data) with a meeting that overlaps a meeting of another gid in the list.
export function clashIds(gids, data) {
  const byId = groupIndex(data), ms = gids.filter((id, i) => byId.has(id) && gids.indexOf(id) === i).map((id) => [id, byId.get(id).g.meetings]);
  const hit = (a, b) => a.day === b.day && toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end);
  return new Set(ms.filter(([id, a]) => ms.some(([o, b]) => o !== id && a.some((x) => b.some((y) => hit(x, y))))).map(([id]) => id));
}
