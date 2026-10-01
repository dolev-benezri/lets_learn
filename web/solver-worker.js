import { search } from './solver-core.js';

self.onmessage = (e) => self.postMessage(search(e.data));
