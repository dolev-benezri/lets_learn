// Probe: rollover + fallback catalog double-advance
const { normalize, FALLBACK_CATALOG } = await import('../../web/app.js');
const cat2028 = { year: 2028, programs: [{ id: 30, name: 'x', startYears: [2026, 2027, 2028] }] };
// visit 1 (2028 catalog ok): a 2027 save with year 2, friends, pins
let saved = { v: 1, year: 2027, program: 30, startYear: 2026, profile: { year: 2 }, friends: [{ name: 'a', groups: ['1'] }], pins: ['x'] };
let s1 = normalize(saved, cat2028);
console.log('visit1 (catalog 2028): year', s1.year, 'profile.year', s1.profile.year);
// visit 2: catalog fetch fails -> FALLBACK (no year) -> DEFAULT year 2027
let s2 = normalize(JSON.parse(JSON.stringify(s1)), FALLBACK_CATALOG);
console.log('visit2 (fallback): year', s2.year, 'profile.year', s2.profile.year, '(would be saved: program/startYear unchanged ->', s2.program===s1.program && s2.startYear===s1.startYear, ')');
s2.friends=[{name:'b',groups:['2']}];
let s3 = normalize(JSON.parse(JSON.stringify(s2)), cat2028);
console.log('visit3 (catalog 2028 back): profile.year', s3.profile.year, 'friends', s3.friends.length);
