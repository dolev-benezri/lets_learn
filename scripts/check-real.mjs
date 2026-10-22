#!/usr/bin/env node
// Read-only checks over every program in web/data/afeka: structure rules that must hold (errors, exit 1) and findings the code cannot
// decide (warnings, printed). No request to any site.   npm run check:real [-- --all]   (--all prints every warning, not 5 of each kind)
// Run before merging a change to the solver or the rules, and after every data update (docs/superpowers/specs/2026-10-23-trust-checks-design.md).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const DIR = 'web/data/afeka';
const YEAR = /חובה שנה (\S)'/;
const yearOf = (data) => {
  const out = {};
  for (const l of data.lists ?? []) {
    const y = ' אבגדה'.indexOf(l.name.match(YEAR)?.[1] ?? ' ');
    if (y > 0) for (const id of l.courses) out[id] = Math.min(out[id] ?? 9, y);
  }
  return out;
};
const sig = (c) => JSON.stringify(c.prereqs.map((p) => `${p.kind}:${p.anyOf.map((a) => a.id ?? a.name).sort().join('|')}`).sort());

// One data file: { errors, warnings }, each line starting with the file.
export function dataRules(data, file) {
  const errors = [],
    warnings = [],
    courses = data.courses ?? {},
    year = yearOf(data);
  for (const [id, c] of Object.entries(courses)) {
    if (typeof c.credits !== 'number') errors.push(`${file}: course ${id}: credits not a number (${JSON.stringify(c.credits)})`);
    if (c.offered && !c.groups?.length) errors.push(`${file}: course ${id}: offered without groups`);
    for (const p of c.prereqs ?? []) {
      const ids = p.anyOf.map((a) => a.id).filter(Boolean);
      for (const x of ids) {
        if (x === id) errors.push(`${file}: course ${id} requires itself`);
        else if (!courses[x]) errors.push(`${file}: course ${id} requires ${x}, which this file does not have`);
      }
      if (new Set(ids).size < ids.length) warnings.push(`repeat: ${file}: course ${id}: the same course twice in one requirement (${ids.join(' / ')})`);
    }
  }
  for (const l of data.lists ?? [])
    for (const id of l.courses) if (!courses[id]) errors.push(`${file}: list ${l.code} (${l.name}): course ${id} is not in courses`);
  // Achievable courses as a least fixed point: admit a course once every hard requirement (AND) has an achievable alternative (OR), an
  // outside-program one included. An alternative listed only in a later year's mandatory list than the course does not count.
  const ok = new Set();
  const usable = (a, id) =>
    a.id === null || (a.id !== id && ok.has(a.id) && !(year[id] && year[a.id] && year[a.id] > year[id]));
  for (let grew = true; grew; ) {
    grew = false;
    for (const [id, c] of Object.entries(courses)) {
      if (ok.has(id)) continue;
      if ((c.prereqs ?? []).filter((p) => p.kind === 'קדם').every((p) => p.anyOf.some((a) => usable(a, id)))) {
        ok.add(id);
        grew = true;
      }
    }
  }
  for (const id of Object.keys(courses))
    if (!ok.has(id)) errors.push(`${file}: course ${id} (${courses[id].name}) can never be taken: every route of a prerequisite is impossible`);
  return { errors, warnings };
}

// Files of one semester: a course whose prerequisites differ between programs, one warning each (some are real, some may be scrape errors).
export function crossProgram(files) {
  const seen = {};
  for (const [file, d] of files)
    for (const [id, c] of Object.entries(d.courses ?? {})) ((seen[id] ??= { name: c.name, v: {} }).v[sig(c)] ??= []).push(file);
  return Object.entries(seen)
    .filter(([, s]) => Object.keys(s.v).length > 1)
    .map(([id, s]) => `programs differ: course ${id} (${s.name}): ${Object.values(s.v).map((fs) => `${fs.length} file(s) e.g. ${fs[0]}`).join(' / ')}`);
}

// Prerequisites that changed since the last commit of this file: one warning per course. [] when git or the old file is missing.
export function changedSinceHead(file, data) {
  const r = spawnSync('git', ['show', `HEAD:${DIR}/${file}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return [];
  const old = JSON.parse(r.stdout).courses ?? {};
  return Object.entries(data.courses ?? {})
    .filter(([id, c]) => old[id] && sig(old[id]) !== sig(c))
    .map(([id, c]) => `changed: ${file}: course ${id} (${c.name}): prerequisites ${sig(old[id])} -> ${sig(c)}`);
}

// Every data file as [relative path, data], by semester folder.
export function dataFiles(dir = DIR) {
  const out = {};
  for (const sem of readdirSync(dir).filter((s) => statSync(`${dir}/${s}`).isDirectory()))
    out[sem] = readdirSync(`${dir}/${sem}`)
      .filter((f) => f.endsWith('.json'))
      .map((f) => [`${sem}/${f}`, JSON.parse(readFileSync(`${dir}/${sem}/${f}`, 'utf8'))]);
  return out;
}

function main() {
  const t0 = Date.now(),
    all = process.argv.includes('--all'),
    bySem = dataFiles();
  const errors = [],
    warnings = [];
  for (const files of Object.values(bySem)) {
    for (const [file, d] of files) {
      const r = dataRules(d, file);
      errors.push(...r.errors);
      warnings.push(...r.warnings, ...changedSinceHead(file, d));
    }
    warnings.push(...crossProgram(files));
  }
  const n = Object.values(bySem).flat().length;
  console.log(`data rules: ${n} files, ${errors.length} error(s), ${warnings.length} warning(s), ${Date.now() - t0} ms`);
  for (const e of errors) console.log(`ERROR ${e}`);
  const kinds = Object.groupBy(warnings, (w) => w.split(':')[0]);
  for (const [k, ws] of Object.entries(kinds)) {
    console.log(`warning "${k}": ${ws.length}`);
    for (const w of all ? ws : ws.slice(0, 5)) console.log(`  ${w}`);
  }
  return errors.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main();
