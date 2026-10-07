// caller-worker-host.mjs - bootstrap that runs the REAL web/solver-worker.js inside a node:worker_threads Worker.
// Why: web/solver-worker.js (3 lines) assigns to the browser global `self`; node has no `self` in a worker thread.
// This file defines `self = { postMessage, onmessage }`, THEN dynamic-imports the real worker file (a static import would hoist
// above the `self` definition), and forwards every parent message to `self.onmessage({data})` like a browser Worker does.
// Messages cross the thread boundary with the HTML structured-clone algorithm (same as a browser Worker.postMessage).
// Used by caller-lib.mjs. Run directly (no workerData) it does nothing and exits 0.
import { parentPort, workerData } from 'node:worker_threads';

if (parentPort && workerData?.target) {
  globalThis.self = { postMessage: (m) => parentPort.postMessage(m), onmessage: null };
  await import(workerData.target);
  parentPort.on('message', (data) => globalThis.self.onmessage({ data }));
}
