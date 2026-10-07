// Sandbox only: F-08 search-level retry without 'prefer' (same pattern as the maxDays retry below it).
import { edit } from './up-edit.mjs';
edit('web/solver-core.js', `  dfs(0, new Array(DAYS).fill(0), 0, new Set(), 0);
`, `  dfs(0, new Array(DAYS).fill(0), 0, new Set(), 0);
  // 'Prefer' is "when possible" (the toast in ui-actions.js): if the preferred lecturers leave no plan, search again without them.
  const lec = constraints.lecturers ?? {};
  if (!top.length && !partial && Object.values(lec).includes('prefer')) return search({ data, courses, statuses, pins, weights, friends, topK, timeLimitMs, prune, bias,
    constraints: { ...constraints, lecturers: Object.fromEntries(Object.entries(lec).filter(([, mode]) => mode !== 'prefer')) } });
`);
console.log('ok');
