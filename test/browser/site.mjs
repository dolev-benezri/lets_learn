// The local server behind `npm run test:browser`: it serves web/, except that web/data/afeka comes only from the frozen copy (test/fixtures/real).
// A data file the frozen copy lacks is a 404 and goes into `missing`; it is never read from the live data, so a night's pull cannot change
// what a test sees, and a file nobody froze cannot slip in unnoticed.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm'
};

const NAME = /^[A-Za-z0-9_-]([A-Za-z0-9_.-]*[A-Za-z0-9_-])?$/; // a file or folder name of web/ (checked: all of them match)

// A missing data file fails the run whatever the specs said; a child killed by a signal has no code and fails it too.
export const finalCode = (code, missing) => (missing.size ? 1 : (code ?? 1));

// `read` is the file reader (a test swaps it for a slow one).
export async function startSite({ web, frozen, read = readFile }) {
  const root = web + path.sep,
    data = path.join(web, 'data', 'afeka') + path.sep;
  const missing = new Set(),
    pending = new Set();
  async function handle(req, res) {
    let p;
    try {
      const asked = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      // Only names the files of web/ really have: Windows would also open the data folder as `afeka::$INDEX_ALLOCATION`, `DATA~1` or `data.`
      if (asked.split('/').some((s) => s && !NAME.test(s))) return void res.writeHead(404).end();
      p = path.join(web, asked.replace(/\/$/, '/index.html'));
    } catch {
      return void res.writeHead(404).end(); // a malformed %-escape
    }
    // Windows reads files without regard to letter case, so the folder is told apart the same way: /DATA/afeka is the data folder too
    const inData = p.toLowerCase().startsWith(data.toLowerCase());
    const body = p.startsWith(root) ? await read(inData ? path.join(frozen, p.slice(data.length)) : p).catch(() => null) : null;
    if (!body) {
      if (inData) missing.add(p.slice(data.length).replaceAll(path.sep, '/'));
      return void res.writeHead(404).end();
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] ?? 'application/octet-stream' }).end(body);
  }
  const server = createServer((req, res) => {
    const job = handle(req, res).catch(() => res.destroy());
    pending.add(job);
    job.finally(() => pending.delete(job));
  }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  return {
    port: server.address().port,
    missing,
    // Stops taking new connections, then waits until every request already being read is answered, so a miss still being recorded is not lost.
    close: async () => {
      server.close();
      server.closeIdleConnections();
      while (pending.size) await Promise.allSettled([...pending]);
      server.closeAllConnections();
    }
  };
}
