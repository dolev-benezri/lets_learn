import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

// Long lines hide diffs and merge conflicts. The files were wrapped on 2026-10-02 (200 chars) and laid out one statement
// per line on 2026-10-22 (code and comments within 160). Break at a space between attributes or after a comma.
// A template literal or an HTML/SVG string may run to 200: wrapping inside it would change the text it renders.
const LIMIT = 160, LITERAL_LIMIT = 200;
const literal = (l) => l.includes('`') || /<\/?[a-z]/i.test(l);

test(`no line in web/ is longer than ${LIMIT} characters (${LITERAL_LIMIT} for a template or HTML string)`, () => {
  const long = [];
  for (const f of readdirSync('web').filter((f) => /\.(js|css|html)$/.test(f))) {
    readFileSync(`web/${f}`, 'utf8').split(/\r?\n/).forEach((l, i) => {
      const n = [...l].length;
      if (n > LITERAL_LIMIT || (n > LIMIT && !literal(l))) long.push(`${f}:${i + 1} (${n})`);
    });
  }
  assert.deepEqual(long, []);
});
