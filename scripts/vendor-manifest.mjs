// The sha256 of every file in web/vendor: test/vendor.test.mjs fails when a file there differs from the list. After updating a library on purpose: node scripts/vendor-manifest.mjs
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const MANIFEST = 'test/fixtures/vendor-sha256.json';

export function vendorHashes(dir = 'web/vendor') {
  const files = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => path.join(e.parentPath, e.name).replaceAll(path.sep, '/'))
    .sort();
  return Object.fromEntries(files.map((f) => [f, createHash('sha256').update(readFileSync(f)).digest('hex')]));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  writeFileSync(MANIFEST, `${JSON.stringify(vendorHashes(), null, 1)}\n`);
  console.log(`wrote ${MANIFEST}`);
}
