#!/usr/bin/env node
// Read-only helper: walks the yedion's track pages and prints a DRAFT of scripts/programs.json (nothing is written to the repo).
// The draft is reviewed by hand: deptName (the prerequisite "population" word), anchor course and the verified flags are not on the site.
//   node scripts/discover.mjs [--cache DIR] [--offline] [--years 2024,2025,2026,2027] [--depts 20,30] > draft.json
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { parseTracks, parseTrackLists } from './parse.mjs';
import { makeRequester, cachedRequester } from './scrape.mjs';

export const DEPTS = [10, 11, 19, 20, 30, 40, 50, 61, 65];

// What the site does not say, from the department explainers (docs/superpowers/plans/2026-10-02-program-expansion.md section 8; dated 2020, so verified: false).
const RULES = {
  10: { deptName: 'תוכנה', specRule: { pick: 1, verified: false }, degree: { total: 160, specCredits: 0 } },
  11: { deptName: 'מדעי המחשב', degree: { total: 120, specCredits: 0 } },
  19: { deptName: 'מדעי הנתונים', degree: { total: null, specCredits: 0 } },
  20: { deptName: 'חשמל', specRule: { pick: 2, alone: ['power'], verified: false }, degree: { total: 160, specCredits: 20 } },
  30: { deptName: 'מכנית', specRule: { pick: 2, alone: ['vehicle'] }, degree: { total: 160, specCredits: 27 } },
  40: { deptName: 'תעשייה וניהול', degree: { total: 160, specCredits: 0 } },
  50: { deptName: 'רפואית', specRule: { pick: 1, verified: false }, degree: { total: 160, specCredits: 0 } },
  61: { deptName: 'מערכות', degree: { total: null, specCredits: 0 } },
  65: { deptName: 'מערכות תבוניות', degree: { total: null, specCredits: 0 } },
};
// Specialization track code -> the id stored in users' saved state (never change one that has shipped).
export const SPEC_IDS = { 37: 'solid', 31: 'flow', 39: 'mech', 302: 'vehicle', 303: 'materials', 304: 'aero', 21: 'comm', 24: 'signals', 208: 'computers', 23: 'power', 209: 'powerel',
  13: 'tech', 16: 'mobile', 17: 'cyber', 18: 'ml', 53: 'medinfo', 54: 'physio' };

// { dept: { year: [{ code, name, lists: [{ code, name }] }] } } for the tracks the site shows.
export async function discover({ request, depts = DEPTS, years, log = () => {} }) {
  await request('prgname=Enter_Search');
  await request(null, { PRGNAME: 'Enter_Search', ARGUMENTS: '-A,,-A,ChangeYear', ChangeYear: String(Math.max(...years) + 1) });
  const found = {};
  for (const dept of depts) {
    found[dept] = {};
    for (const year of years) {
      const tracks = parseTracks(await request(null, { PRGNAME: 'JSON', Action: '700', Faculty: String(dept), Year: String(year) }));
      found[dept][year] = [];
      for (const t of tracks) {
        const lists = parseTrackLists(await request(null, { PRGNAME: 'S_PROG', ARGUMENTS: 'HUG,R1C1,R1C2', HUG: String(dept), R1C1: String(year), R1C2: String(t.code) }));
        found[dept][year].push({ ...t, lists });
      }
      log(`department ${dept} ${year}: ${tracks.length} tracks`);
    }
  }
  return found;
}

const isSpec = (t) => t.name.startsWith('התמחות');
// A specialization list is an elective list (בחירה), the extra mandatory list of the standalone area (לבד), or else mandatory (חובה, core, seminar, or the area's plain list).
const listKind = (name) => (/לבד/.test(name) ? 'alone' : /בחירה/.test(name) ? 'elective' : 'mandatory');

// One program per main track (day, evening, or the department's only track); specialization tracks of the department are shared by all of them.
export function draftPrograms(found) {
  const out = {};
  for (const [deptKey, byYear] of Object.entries(found)) {
    const dept = Number(deptKey), years = Object.keys(byYear).map(Number).sort();
    const mains = new Map();
    for (const y of years) for (const t of byYear[y]) if (!isSpec(t) && t.lists.length) mains.set(t.code, t.name);
    for (const [code, name] of mains) {
      const lists = {}, cohorts = [];
      for (const y of years) {
        const main = byYear[y].find((t) => t.code === code);
        if (!main?.lists.length) continue;
        cohorts.push(y);
        lists[y] = [...main.lists, ...byYear[y].filter(isSpec).flatMap((t) => t.lists)].map((l) => l.code);
      }
      const newest = years.findLast((y) => cohorts.includes(y));
      const specializations = byYear[newest].filter(isSpec).map((t) => {
        const of = (kind) => t.lists.filter((l) => listKind(l.name) === kind).map((l) => l.code), one = (c) => (c.length > 1 ? c : c[0]);
        const [mandatory, elective, alone] = ['mandatory', 'elective', 'alone'].map(of);
        return { id: SPEC_IDS[t.code] ?? `s${t.code}`, name: t.name.replace(/^התמחות\s*/, '').replace(/,(?=\S)/g, ', '), ...(mandatory.length && { mandatory: one(mandatory) }),
          ...(elective.length && { elective: one(elective) }), ...(alone.length && { aloneExtra: alone[0] }) };
      });
      out[code] = { name, dept, ...RULES[dept], lists, cohorts, ...(specializations.length && { specializations }), anchor: null };
    }
  }
  return out;
}

async function main() {
  const { values: o } = parseArgs({ options: { cache: { type: 'string' }, offline: { type: 'boolean', default: false }, years: { type: 'string', default: '2024,2025,2026,2027' },
    depts: { type: 'string' }, delay: { type: 'string', default: '2500' } } });
  const live = makeRequester({ delay: Number(o.delay) });
  const request = o.cache ? cachedRequester(live, o.cache, { offline: o.offline }) : live;
  const found = await discover({ request, depts: o.depts ? o.depts.split(',').map(Number) : DEPTS, years: o.years.split(',').map(Number), log: console.error });
  console.log(JSON.stringify(draftPrograms(found), null, 1));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
}
