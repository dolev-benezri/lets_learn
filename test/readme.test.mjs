// The README and the guide are what people meet first: no broken link or image, and no GIF heavy enough to stall the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const GIF_MAX = 3 * 1024 * 1024;

for (const file of ['README.md', 'docs/GUIDE.md']) {
  test(`${file}: every local link and image exists`, () => {
    const targets = [...readFileSync(file, 'utf8').matchAll(/(?:\]\(|srcset="|src=")([^)"\s]+)/g)]
      .map((m) => m[1])
      .filter((t) => !/^(https?:|mailto:|#)/.test(t))
      .map((t) => path.join(path.dirname(file), t.replace(/[?#].*$/, '')));
    assert.ok(targets.length > 0, 'found links to check');
    assert.deepEqual(targets.filter((t) => !existsSync(t)), []);
  });
}

test('no GIF in docs/media is over the limit', () => {
  const heavy = readdirSync('docs/media').filter((f) => f.endsWith('.gif') && statSync(`docs/media/${f}`).size > GIF_MAX);
  assert.deepEqual(heavy, []);
});
