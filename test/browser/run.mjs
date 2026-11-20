// Real-browser checks in Playwright, in WebKit (the engine of iPhone Safari) unless BROWSER says chromium or firefox. Outside `npm test`: it needs the browser's download
// (npx playwright install webkit).
// Serves web/ on a free local port (site.mjs), hands the address to every test/browser/*.spec.mjs as SITE_URL, and runs them with node:test.
// The student's files, the catalog and the status come only from the frozen copy: a file missing there is a 404 and fails the run.
//   npm run test:browser              (all)
//   npm run test:browser -- a11y      (only the specs whose name contains a11y)
import { spawn } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startSite, finalCode } from './site.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)),
  WEB = path.join(HERE, '..', '..', 'web'),
  FROZEN = path.join(HERE, '..', 'fixtures', 'real');
const site = await startSite({ web: WEB, frozen: FROZEN });

const specs = (await readdir(HERE))
  .filter((f) => f.endsWith('.spec.mjs') && f.includes(process.argv[2] ?? ''))
  .sort()
  .map((f) => path.join(HERE, f));
const child = spawn(process.execPath, ['--test', ...specs], {
  stdio: 'inherit',
  env: { ...process.env, SITE_URL: `http://127.0.0.1:${site.port}/` }
});
child.on('exit', async (code) => {
  await site.close(); // answers the requests still being read first, so a missing file is counted
  if (site.missing.size) {
    console.error(
      `\nnot in the frozen copy (test/fixtures/real), so served as 404 and not from web/data:\n  ${[...site.missing].join('\n  ')}\n` +
        'Add the file to FILES (a cycle) or META in test/fixtures/real.mjs, then run: node test/fixtures/real.mjs <the commit in test/fixtures/real/SOURCE>'
    );
  }
  process.exit(finalCode(code, site.missing));
});
