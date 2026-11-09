import { runEdit } from './edit-search.js';

self.onmessage = (e) => self.postMessage(runEdit(e.data));
