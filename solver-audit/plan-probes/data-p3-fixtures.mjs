// Do the saved parser fixtures contain lessons the proposed validate rule (start on :00/:30, end <= 23:00) would refuse?
// Run: node solver-audit/plan-probes/data-p3-fixtures.mjs
import fs from 'node:fs';
import { parseGroups } from '../../scripts/parse.mjs';
const dir = new URL('../../scripts/fixtures/', import.meta.url);
for (const f of fs.readdirSync(dir).filter((f) => f.startsWith('groups-'))) {
  const ms = parseGroups(fs.readFileSync(new URL(f, dir), 'utf8')).flatMap((g) => g.meetings);
  const bad = ms.filter((m) => !(m.start < m.end && m.start >= '07:00' && m.end <= '23:00' && /:[03]0$/.test(m.start)));
  console.log(`INFO ${f}: ${ms.length} meetings, refused by new rule: ${bad.length}`);
}
