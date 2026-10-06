import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { decode } from '../web/share.js';

// redirect/index.html runs at the old address: run its script with a fake location and storage, and see where it sends the browser.
const script = readFileSync('redirect/index.html', 'utf8').match(/<script>([\s\S]*?)<\/script>/)[1];
const visit = (href, store = {}) => new Promise((resolve) => {
  const u = new URL(href);
  const location = { pathname: u.pathname, search: u.search, hash: u.hash, replace: (to) => resolve({ to, store }) };
  const localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
  const document = { getElementById: () => ({}) };
  vm.runInNewContext(script, { location, localStorage, document, Response, Blob, TextEncoder, CompressionStream, Uint8Array, String, btoa, JSON });
});

const NEW = 'https://dolev-benezri.github.io/lets_learn/';
test('redirect: path and hash carry over to the new address', async () => {
  assert.equal((await visit('https://dolhack.github.io/lets_learn/')).to, NEW);
  assert.equal((await visit('https://dolhack.github.io/lets_learn/legal.html#terms')).to, `${NEW}legal.html#terms`);
  assert.equal((await visit('https://dolhack.github.io/lets_learn/#f=abc')).to, `${NEW}#f=abc`);
  assert.equal((await visit('https://dolhack.github.io/lets_learn')).to, NEW, 'no trailing slash');
  assert.equal((await visit('https://dolhack.github.io/')).to, NEW, 'the org site root (the root 404.html) too');
});

test('redirect: a saved state moves once, as a backup link the site can read', async () => {
  const state = { v: 1, program: 30, startYear: 2026, name: 'דנה', passed: ['10010'] };
  const first = await visit('https://dolhack.github.io/lets_learn/', { 'afeka-sched-v1': JSON.stringify(state) });
  const m = first.to.match(/^https:\/\/dolev-benezri\.github\.io\/lets_learn\/#b=(.+)$/);
  assert.ok(m, first.to);
  assert.deepEqual(await decode(m[1]), state);
  assert.equal((await visit('https://dolhack.github.io/lets_learn/#f=x', first.store)).to, `${NEW}#f=x`, 'moved once: later visits are plain redirects');
});
