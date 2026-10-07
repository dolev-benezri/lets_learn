// F-02, F-17, F-07, F-09, F-10 on the sandbox copy. Run once on a fresh sandbox.
import { edit } from './up-edit.mjs';
// F-02
edit('web/ui-search.js', "ui.worker.onmessage = (e) => { ui.last", "ui.worker.onmessage = (e) => { if (my !== ui.gen) return; ui.last");
edit('web/ui-search.js', "ui.worker.onerror = (e) => { ui.runError", "ui.worker.onerror = (e) => { if (my !== ui.gen) return; ui.runError");
// F-17
edit('web/ui-actions.js', "app.state.name = el.value.trim().slice(0, 60); return 'quiet';", "app.state.name = el.value.trim().slice(0, 60); return 'save';");
// F-07
edit('web/solver-core.js', "if (constraints.maxCredits && credits", "if (constraints.maxCredits != null && credits");
// F-09
edit('web/solver-core.js', "pinned = (o) => o.groups.some((id) => pins.includes(id));", "pinned = (o) => pins.includes(o.groups[0]);");
// F-10
edit('web/solver-core.js', "g.meetings.map((m) => [m.day, m.start, m.end, m.room]),\n    friendGroups", "g.meetings.map((m) => [m.day, m.start, m.end, m.room]), g.exams,\n    friendGroups");
console.log('applied');
