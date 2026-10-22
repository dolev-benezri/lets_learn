// scripts/readme-shots.mjs drives Chrome and writes files, so it is read as text, never imported (J19).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TERMS_VERSION } from '../web/ui-common.js';

test('the README screenshots pass the terms gate: DONE seeds the current terms version', () => {
  const src = readFileSync(new URL('../scripts/readme-shots.mjs', import.meta.url), 'utf8');
  const done = src.match(/const DONE = \{([^}]*)\}/)?.[1] ?? '';
  const terms = done.match(/'afeka-sched-v1-terms':\s*([^,}]+)/)?.[1]?.trim();
  assert.ok(terms === 'TERMS_VERSION' || terms === `'${TERMS_VERSION}'`, `DONE: {${done}}`);
});
