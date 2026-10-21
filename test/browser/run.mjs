// Real-browser checks in Playwright WebKit (the engine of iPhone Safari). Outside `npm test`: it needs the WebKit download (npx playwright install webkit).
// Serves web/ on a free local port, hands the address to every test/browser/*.spec.mjs as SITE_URL, and runs them with node:test.
//   npm run test:browser
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), WEB = path.join(HERE, '..', '..', 'web');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.mjs': 'text/javascript', '.wasm': 'application/wasm' };
const server = createServer(async (req, res) => {
  const p = path.join(WEB, decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/\/$/, '/index.html'));
  const body = p.startsWith(WEB) ? await readFile(p).catch(() => null) : null;
  if (!body) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] ?? 'application/octet-stream' }).end(body);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));

const specs = (await readdir(HERE)).filter((f) => f.endsWith('.spec.mjs')).sort().map((f) => path.join(HERE, f));
const child = spawn(process.execPath, ['--test', ...specs], { stdio: 'inherit', env: { ...process.env, SITE_URL: `http://127.0.0.1:${server.address().port}/` } });
child.on('exit', (code) => { server.close(); process.exit(code ?? 1); });
