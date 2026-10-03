import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// Long lines hide diffs and merge conflicts (the files were wrapped on 2026-10-02, whitespace only). Break at a space between attributes or after a comma.
test('no line in web/ is longer than 200 characters', () => {
  const long = [];
  for (const f of readdirSync('web').filter((f) => /\.(js|css|html)$/.test(f))) {
    readFileSync(`web/${f}`, 'utf8').split(/\r?\n/).forEach((l, i) => { if ([...l].length > 200) long.push(`${f}:${i + 1}`); });
  }
  assert.deepEqual(long, []);
});
