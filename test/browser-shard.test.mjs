// The browser specs split into shards (test/browser/shard.mjs): on GitHub each shard runs in its own job, one spec file at a time, so no
// runner is loaded with three browsers at once (the cause of the random failures, 11-2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pickShard, nodeTestArgs } from './browser/shard.mjs';

const files = Array.from({ length: 23 }, (_, i) => `s${String(i).padStart(2, '0')}.spec.mjs`);

test('every spec file is in exactly one of the n shards, and the shards differ in size by at most one', () => {
  for (const n of [1, 2, 3, 4, 7]) {
    const shards = Array.from({ length: n }, (_, k) => pickShard(files, `${k + 1}/${n}`));
    assert.deepEqual(shards.flat().sort(), [...files].sort(), `n=${n}`);
    const sizes = shards.map((s) => s.length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `n=${n}: ${sizes}`);
  }
});

test('no shard, or 1/1, is every file; a wrong shard is refused', () => {
  assert.deepEqual(pickShard(files, undefined), files);
  assert.deepEqual(pickShard(files, ''), files);
  assert.deepEqual(pickShard(files, '1/1'), files);
  for (const bad of ['0/4', '5/4', '2', 'a/b', '1/0']) assert.throws(() => pickShard(files, bad), /SHARD/, bad);
});

test('on GitHub (CI set) one spec file runs at a time; locally node decides as before', () => {
  assert.deepEqual(nodeTestArgs({ CI: 'true' }, ['a.spec.mjs']), ['--test', '--test-timeout=1800000', '--test-concurrency=1', 'a.spec.mjs']);
  assert.deepEqual(nodeTestArgs({}, ['a.spec.mjs', 'b.spec.mjs']), ['--test', '--test-timeout=1800000', 'a.spec.mjs', 'b.spec.mjs']);
});

test('no spec file left (a name or a shard that matches none) is refused: node --test with no file would run every test file it finds', () => {
  assert.throws(() => nodeTestArgs({}, []), /no spec file/);
  assert.throws(() => nodeTestArgs({ CI: 'true' }, pickShard(['a.spec.mjs'], '2/2')), /no spec file/);
});

test('the browser workflow runs each engine in 4 shards and hands the shard to the runner', () => {
  const y = readFileSync(new URL('../.github/workflows/browser.yml', import.meta.url), 'utf8');
  assert.match(y, /shard: \[1, 2, 3, 4\]/);
  assert.match(y, /SHARD: \$\{\{ matrix\.shard \}\}\/4/);
});
