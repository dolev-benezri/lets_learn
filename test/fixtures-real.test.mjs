import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { FILES, REAL_DIR, real, freeze } from './fixtures/real.mjs';
import { checkFile } from '../scripts/check-export.mjs';

const SEMESTER = { 1: 'א', 2: 'ב', 3: 'קיץ' };
const tempDir = () => pathToFileURL(mkdtempSync(path.join(tmpdir(), 'freeze-')) + '/');
const listed = (dir) =>
  readdirSync(dir, { recursive: true })
    .map((f) => f.replaceAll('\\', '/'))
    .filter((f) => f.endsWith('.json') || f === 'SOURCE')
    .sort();

test('frozen data: FILES matches the files on disk', () => {
  const onDisk = readdirSync(REAL_DIR)
    .filter((d) => d.startsWith('2027-'))
    .flatMap((d) => readdirSync(new URL(`${d}/`, REAL_DIR)).map((f) => `${d}/${f}`))
    .sort();
  assert.deepEqual(onDisk, [...FILES].sort());
});

test('frozen data: SOURCE is 40d90aa', () => {
  assert.equal(readFileSync(new URL('SOURCE', REAL_DIR), 'utf8'), '40d90aacfb923a92efb888da1180ab014fbfa6ea\n');
});

test('frozen data: every file passes the export schema (refresh with node test/fixtures/real.mjs <ref> if this fails)', () => {
  for (const f of FILES) {
    const out = [];
    assert.equal(checkFile(real(f), f, out), true, f);
    assert.deepEqual(out, []);
  }
});

test('frozen data: each file is the program, cohort and semester its name says', () => {
  for (const f of FILES) {
    const [, n, p, y] = f.match(/^2027-(\d)\/(\d+)-(\d+)\.json$/);
    const d = real(f);
    assert.equal(d.year, 2027, f);
    assert.equal(d.program, Number(p), f);
    assert.equal(d.startYear, Number(y), f);
    assert.equal(d.semester, SEMESTER[n], f);
  }
});

test('frozen data: files are minified JSON with one trailing newline', () => {
  for (const f of FILES) {
    const raw = readFileSync(new URL(f, REAL_DIR), 'utf8');
    assert.equal(raw, JSON.stringify(JSON.parse(raw)) + '\n', f);
  }
});

test('freeze: a missing file writes nothing', () => {
  const dir = tempDir();
  const show = (s, p) => {
    if (p.endsWith('42-2027.json')) throw new Error('missing');
    return '{}';
  };
  assert.throws(() => freeze('x', { resolve: () => 'abc', show, dir }), /42-2027\.json.*missing/);
  assert.deepEqual(readdirSync(dir), []);
});

test('freeze: bad JSON writes nothing', () => {
  const dir = tempDir();
  const show = (s, p) => (p.endsWith('19-2026.json') ? '{' : '{}');
  assert.throws(() => freeze('x', { resolve: () => 'abc', show, dir }), /19-2026\.json/);
  assert.deepEqual(readdirSync(dir), []);
});

test('freeze: writes every file and SOURCE', () => {
  const dir = tempDir();
  const show = () => JSON.stringify({ a: 1 }, null, 2);
  assert.equal(freeze('x', { resolve: () => 'abc', show, dir }), 'abc');
  assert.equal(readFileSync(new URL('SOURCE', dir), 'utf8'), 'abc\n');
  for (const f of FILES) assert.equal(readFileSync(new URL(f, dir), 'utf8'), '{"a":1}\n', f);
  assert.deepEqual(listed(dir), [...FILES, 'SOURCE'].sort());
});

test('real.mjs imports with no script path (node -e) without running its CLI', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', "await import('./test/fixtures/real.mjs')"], {
    cwd: fileURLToPath(new URL('../', import.meta.url)),
    encoding: 'utf8'
  });
  assert.equal(r.status, 0, r.stderr);
});
