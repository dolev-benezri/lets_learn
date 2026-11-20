// The local server behind `npm run test:browser`: the student's files come only from the frozen copy, never from the live web/data.
// Synthetic folders only; no browser is started here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { startSite, finalCode } from './browser/site.mjs';

function folders() {
  const root = mkdtempSync(path.join(tmpdir(), 'site-')),
    web = path.join(root, 'web'),
    frozen = path.join(root, 'frozen');
  const put = (file, text) => {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  };
  put(path.join(web, 'index.html'), 'home');
  put(path.join(web, 'app.js'), 'code');
  put(path.join(web, 'data', 'afeka', 'catalog.json'), '{"live":true}');
  put(path.join(web, 'data', 'afeka', '2027-1', '20-2025.json'), '{"live":true}');
  put(path.join(frozen, 'catalog.json'), '{"frozen":true}');
  return { web, frozen, put };
}
const open = async (opts) => {
  const site = await startSite(opts);
  const get = async (p) => {
    const r = await fetch(`http://127.0.0.1:${site.port}${p}`);
    return [r.status, await r.text()];
  };
  return { site, get };
};

test('site: a data file the frozen copy holds is served from it, not from web/data', async () => {
  const f = folders();
  const { site, get } = await open(f);
  try {
    assert.deepEqual(await get('/data/afeka/catalog.json'), [200, '{"frozen":true}']);
    assert.deepEqual([...site.missing], []);
  } finally {
    site.close();
  }
});

test('site: a data file missing from the frozen copy is not read from web/data; it is a 404 and is remembered', async () => {
  const f = folders();
  const { site, get } = await open(f);
  try {
    assert.deepEqual(await get('/data/afeka/2027-1/20-2025.json'), [404, '']);
    assert.deepEqual([...site.missing], ['2027-1/20-2025.json']);
  } finally {
    site.close();
  }
});

test('site: files outside web/data/afeka come from web/, a folder address gets its index.html', async () => {
  const f = folders();
  const { site, get } = await open(f);
  try {
    assert.deepEqual(await get('/app.js'), [200, 'code']);
    assert.deepEqual(await get('/'), [200, 'home']);
    assert.deepEqual(await get('/nothing.js'), [404, '']);
    assert.deepEqual([...site.missing], [], 'a missing page is not a missing data file');
  } finally {
    site.close();
  }
});

test('site: another letter case of the data folder does not slip past to web/data', async () => {
  const f = folders();
  const { site, get } = await open(f);
  try {
    assert.deepEqual(await get('/DATA/afeka/catalog.json'), [200, '{"frozen":true}']);
    assert.deepEqual(await get('/data/AFEKA/2027-1/20-2025.json'), [404, '']);
    assert.deepEqual([...site.missing], ['2027-1/20-2025.json']);
  } finally {
    site.close();
  }
});

test('site: close() waits for a request still reading, so its missing file is not lost', async () => {
  const f = folders();
  let started;
  const reading = new Promise((r) => (started = r));
  const slow = async () => {
    started();
    await new Promise((r) => setTimeout(r, 80));
    throw Object.assign(new Error('gone'), { code: 'ENOENT' });
  };
  const site = await startSite({ ...f, read: slow });
  fetch(`http://127.0.0.1:${site.port}/data/afeka/2027-1/20-2025.json`).catch(() => {});
  await reading;
  await site.close();
  assert.deepEqual([...site.missing], ['2027-1/20-2025.json']);
});

test('finalCode: a missing file fails the run even when every spec passed; otherwise the specs decide', () => {
  assert.equal(finalCode(0, new Set(['x'])), 1);
  assert.equal(finalCode(0, new Set()), 0);
  assert.equal(finalCode(1, new Set()), 1);
  assert.equal(finalCode(null, new Set()), 1, 'a child killed by a signal has no code');
});

test('site: a request that arrives while close() waits is refused, and the one already being read is still counted', async () => {
  const f = folders();
  let started, open;
  const reading = new Promise((r) => (started = r)),
    gate = new Promise((r) => (open = r));
  let reads = 0;
  const gated = async () => {
    reads++;
    started();
    await gate;
    throw Object.assign(new Error('gone'), { code: 'ENOENT' });
  };
  const site = await startSite({ ...f, read: gated });
  const url = (n) => `http://127.0.0.1:${site.port}/data/afeka/2027-1/${n}.json`;
  fetch(url('20-2025')).catch(() => {});
  await reading;
  const closing = site.close();
  await assert.rejects(
    fetch(url('30-2025'), { signal: AbortSignal.timeout(3000) }),
    (e) => e.cause?.code === 'ECONNREFUSED', // not a timeout: a new connection is refused once close() has begun
  );
  open();
  await closing;
  assert.equal(reads, 1);
  assert.deepEqual([...site.missing], ['2027-1/20-2025.json']);
});

test('site: a path with a name no real file has (Windows stream or short-name aliases, a trailing dot) is not served at all', async () => {
  const f = folders();
  const { site, get } = await open(f);
  try {
    for (const p of [
      '/data/afeka::$INDEX_ALLOCATION/catalog.json',
      '/data::$INDEX_ALLOCATION/afeka/catalog.json',
      '/data./afeka/catalog.json',
      '/data/afeka/catalog.json.',
      '/DATA~1/afeka/catalog.json',
      '/app.js::$DATA'
    ])
      assert.deepEqual(await get(p), [404, ''], p);
  } finally {
    site.close();
  }
});
