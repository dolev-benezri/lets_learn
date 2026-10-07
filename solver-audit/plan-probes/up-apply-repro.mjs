// Sandbox-only: make caller-02 survive the F-02 fix (its line 88 dereferences ui.last, which is null once a stale reply is ignored).
import { edit } from './up-edit.mjs';
edit('solver-audit/repro/caller-02-search-lifecycle.mjs', "JSON.stringify(ui.last.results[0].groups) === JSON.stringify(stale.results[0].groups);", "JSON.stringify(ui.last?.results?.[0]?.groups) === JSON.stringify(stale.results[0].groups);");
console.log('ok');
