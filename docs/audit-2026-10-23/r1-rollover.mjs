// Probe: rollover + fallback catalog double-advance (audit #33), through load() as the site runs it: each visit loads,
// then saves (its first refresh). Before the fix visit 3 printed profile.year 4 and 0 friends; now 3 and 1.
const store = new Map();
globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
const { app, load, save, FALLBACK_CATALOG } = await import('../../web/app.js');
const cat2028 = { year: 2028, programs: [{ id: 30, name: 'x', startYears: [2026, 2027, 2028] }] };
const visit = (catalog) => {
  app.catalog = catalog;
  app.state = load();
  save();
  return app.state;
};
// a 2027 save with year 2, a friend and a pin
store.set('afeka-sched-v1', JSON.stringify({ v: 1, year: 2027, program: 30, startYear: 2026, profile: { year: 2 },
  friends: [{ name: 'a', groups: ['1'] }], pins: ['x'] }));
const s1 = visit(cat2028);
console.log('visit1 (catalog 2028): year', s1.year, 'profile.year', s1.profile.year);
// the student adds a friend after the rollover
s1.friends = [{ name: 'b', groups: ['2'] }];
save();
const s2 = visit(FALLBACK_CATALOG);
console.log('visit2 (fallback): year', s2.year, 'saved:', !app.noSave);
const s3 = visit(cat2028);
console.log('visit3 (catalog 2028 back): profile.year', s3.profile.year, 'friends', s3.friends.length);
