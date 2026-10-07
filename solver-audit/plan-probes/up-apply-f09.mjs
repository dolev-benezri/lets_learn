// Sandbox only: replace the 1-token F-09 variant (pins.includes(o.groups[0])) by "pins first, then lecturer choices, a pin beats avoid/prefer".
import { edit } from './up-edit.mjs';
edit('web/solver-core.js', `// Lecturer choices (constraints.lecturers), applied to the options that are left after full groups, busy time and pins:
// an avoided lecturer's options go (unless pinned), and of what remains a preferred lecturer's options win when there are any.`,
`// Lecturer choices (constraints.lecturers), applied to the options that are left after full groups, busy time and pins:
// an avoided lecturer's options go, and of what remains a preferred lecturer's options win when there are any.`);
edit('web/solver-core.js', `function byLecturer(options, lecturers, byId, pins) {
  const who = (o) => lecturers[byId.get(o.groups[0])?.lecturer], pinned = (o) => pins.includes(o.groups[0]);
  const ok = options.filter((o) => who(o) !== 'avoid' || pinned(o)), pref = ok.filter((o) => who(o) === 'prefer' || pinned(o));
  return ok.some((o) => who(o) === 'prefer') ? pref : ok;
}`, `function byLecturer(options, lecturers, byId) {
  const who = (o) => lecturers[byId.get(o.groups[0])?.lecturer], ok = options.filter((o) => who(o) !== 'avoid');
  return ok.some((o) => who(o) === 'prefer') ? ok.filter((o) => who(o) === 'prefer') : ok;
}`);
edit('web/solver-core.js', `  const coursePins = pins.filter((id) => byId.has(id)), left = byLecturer(options, lecturers, byId, pins);
  return coursePins.length ? left.filter((o) => coursePins.every((id) => o.groups.includes(id))) : left;`,
`  const coursePins = pins.filter((id) => byId.has(id)), left = coursePins.length ? options.filter((o) => coursePins.every((id) => o.groups.includes(id))) : options;
  const chosen = byLecturer(left, lecturers, byId);
  return chosen.length || !coursePins.length ? chosen : left; // a pin beats avoid and prefer`);
console.log('ok');
