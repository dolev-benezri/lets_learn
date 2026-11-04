// What the site serves as its own: every library file is the one listed, and every library says where it came from and under what license.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { MANIFEST, vendorHashes } from '../scripts/vendor-manifest.mjs';

test('every file in web/vendor is the one the list names (a library updated on purpose: node scripts/vendor-manifest.mjs)', () => {
  assert.deepEqual(vendorHashes(), JSON.parse(readFileSync(MANIFEST, 'utf8')));
});

test('every library in web/vendor says where it came from and under what license', () => {
  for (const lib of readdirSync('web/vendor')) {
    const files = readdirSync(`web/vendor/${lib}`);
    assert.ok(existsSync(`web/vendor/${lib}/SOURCES.txt`), `${lib}: SOURCES.txt`);
    assert.ok(files.some((f) => /^(LICENSE|OFL)/.test(f)), `${lib}: a license`);
  }
});

test('every action in a workflow is pinned to a full commit, with its version beside it', () => {
  const uses = readdirSync('.github/workflows').flatMap((f) =>
    [...readFileSync(`.github/workflows/${f}`, 'utf8').matchAll(/uses:\s*(.+)/g)].map((m) => [f, m[1].trim()])
  );
  assert.ok(uses.length);
  for (const [f, u] of uses) assert.match(u, /^[\w./-]+@[0-9a-f]{40} # v\d/, `${f}: ${u}`);
});
