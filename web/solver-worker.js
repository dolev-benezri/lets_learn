import { search, searchYear } from './solver-core.js';

self.onmessage = (e) => self.postMessage(e.data.year ? searchYear(e.data.year) : search(e.data));
