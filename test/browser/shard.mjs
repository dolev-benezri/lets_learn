// Which spec files a run takes, and how node runs them. Pure, for test/browser/run.mjs and test/browser-shard.test.mjs.
// SHARD=k/n: the k-th of n shares of the sorted files (round robin, so the shares differ by at most one file); none or 1/1: all.
export function pickShard(files, shard) {
  if (!shard) return files;
  const m = /^(\d+)\/(\d+)$/.exec(shard), k = m && Number(m[1]), n = m && Number(m[2]);
  if (!m || n < 1 || k < 1 || k > n) throw new Error(`SHARD must be k/n with 1 <= k <= n, not "${shard}"`);
  return files.filter((_, i) => i % n === k - 1);
}

// On GitHub (CI) one spec file at a time: its 4-core runner ran three browsers at once and timed tests failed at random under the load.
// Locally node keeps its default (a file per core). No spec file is refused: node --test with no file runs every test file it finds.
export function nodeTestArgs(env, specs) {
  if (!specs.length) throw new Error('no spec file matches the name and SHARD given');
  return ['--test', '--test-timeout=1800000', ...(env.CI ? ['--test-concurrency=1'] : []), ...specs];
}
