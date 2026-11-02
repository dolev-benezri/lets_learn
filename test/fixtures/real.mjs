// A frozen copy of real timetable data for the tests that name specific courses, groups or counts.
// The live web/data/afeka changes every night; tests that check what every data file must hold read that instead.
// Refresh on purpose: node test/fixtures/real.mjs <git-ref>, then fix the tests the new data breaks in the same commit.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const FILES = [
  '2027-1/10-2024.json',
  '2027-1/11-2027.json',
  '2027-1/12-2027.json',
  '2027-1/19-2026.json',
  '2027-1/22-2027.json',
  '2027-1/30-2026.json',
  '2027-1/30-2027.json',
  '2027-1/32-2024.json',
  '2027-1/32-2027.json',
  '2027-1/42-2027.json',
  '2027-2/19-2026.json',
  '2027-2/30-2026.json',
  '2027-3/30-2026.json'
];
export const REAL_DIR = new URL('./real/', import.meta.url);

export const real = (path) => JSON.parse(readFileSync(new URL(path, REAL_DIR), 'utf8'));

const git = (args) =>
  execFileSync('git', args, { cwd: fileURLToPath(new URL('../../', import.meta.url)), encoding: 'utf8', maxBuffer: 64e6 });
const gitRevParse = (ref) => git(['rev-parse', '--verify', `${ref}^{commit}`]).trim();
const gitShow = (sha, path) => git(['show', `${sha}:${path}`]);

// Reads and parses every file before it writes any, so a bad ref or file leaves the copy as it was.
export function freeze(ref, { resolve = gitRevParse, show = gitShow, dir = REAL_DIR } = {}) {
  const sha = resolve(ref);
  const data = FILES.map((path) => {
    try {
      return JSON.parse(show(sha, 'web/data/afeka/' + path));
    } catch (e) {
      throw new Error(`${path}: ${e.message}`);
    }
  });
  FILES.forEach((path, i) => {
    const file = new URL(path, dir);
    mkdirSync(new URL('./', file), { recursive: true });
    writeFileSync(file, JSON.stringify(data[i]) + '\n');
  });
  writeFileSync(new URL('SOURCE', dir), sha + '\n');
  return sha;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ref = process.argv[2];
  if (!ref) {
    console.error('usage: node test/fixtures/real.mjs <git-ref>');
    process.exit(1);
  }
  console.log(freeze(ref));
}
