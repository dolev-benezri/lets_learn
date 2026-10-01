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
