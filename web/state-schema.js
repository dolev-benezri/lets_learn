// The saved state's fields and their shapes: the one list a backup link rebuilds from (share.js readHash), checked against app.js
// DEFAULT by test/share.test.mjs so a new field cannot be forgotten. Each value's own validation stays in app.js normalize.
// Identity and version (v, year, semester, program, startYear) travel in the link's header, not here.
export const PERSISTED = {
  name: 'str',
  passed: 'arr',
  failed: 'obj',
  grades: 'obj',
  exempt: 'arr',
  outsideDone: 'arr',
  choices: 'obj',
  friends: 'arr',
  pins: 'arr',
  profile: 'obj',
  scope: 'str',
  load: 'str',
  sortBy: 'str',
  semesterOf: 'obj',
  programSet: 'bool',
  specDraft: 'arr',
  yearIds: 'arr',
  retakeSeen: 'arr',
  weights: 'obj',
  constraints: 'obj'
};
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);
export const SHAPE = { str: (x) => typeof x === 'string', arr: Array.isArray, obj: isObj, bool: (x) => typeof x === 'boolean' };
