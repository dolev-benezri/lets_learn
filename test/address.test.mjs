// The site and the repo moved to lets-learn-il (2026-11): no tracked file may still point at the address or the repo path before the move,
// since GitHub Pages does not redirect a moved site. The account name stays only as an identity (LICENSE, the nightly commit author).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const OLD = ['dolev-benezri' + '.github.io', 'dolev-benezri' + '/lets_learn']; // split, so this file does not match itself

test('no tracked file points at the address or the repo before the move', () => {
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter((f) => f && !f.startsWith('web/data/') && !f.startsWith('web/vendor/'));
  const found = [];
  for (const f of files) {
    let text;
    try {
      text = readFileSync(f, 'utf8');
    } catch {
      continue; // listed but not on disk (a deletion not yet committed)
    }
    for (const old of OLD) if (text.includes(old)) found.push(`${f}: ${old}`);
  }
  assert.deepEqual(found, []);
});
