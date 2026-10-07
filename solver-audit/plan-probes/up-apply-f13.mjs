// Sandbox only: F-13 option A = Friday (day 6) is a day like the others in freeDays, bound, summary; metric / 6.
import { edit } from './up-edit.mjs';
edit('web/solver-core.js', "const freeDays = [1, 2, 3, 4, 5].filter((d) => mask[d] === 0);", "const freeDays = [1, 2, 3, 4, 5, 6].filter((d) => mask[d] === 0);");
edit('web/solver-core.js', "freeDays: freeDays.length / 5,", "freeDays: freeDays.length / 6,");
edit('web/solver-core.js', "if (d <= 5 && mask[d] === 0) free++;", "if (mask[d] === 0) free++;");
edit('web/solver-core.js', "W('freeDays') * (free / 5)", "W('freeDays') * (free / 6)");
edit('web/ui-grid.js', "freeDays: [1, 2, 3, 4, 5].filter((d) => !busy.has(d)),", "freeDays: [1, 2, 3, 4, 5, 6].filter((d) => !busy.has(d)),");
edit('test/ui-grid.test.mjs', "freeDays: [4, 5], gapH: 1.5", "freeDays: [4, 5, 6], gapH: 1.5");
console.log('ok');
