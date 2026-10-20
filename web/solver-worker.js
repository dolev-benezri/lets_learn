import { searchAll } from './solver-core.js';

self.onmessage = (e) => self.postMessage(searchAll(e.data));
