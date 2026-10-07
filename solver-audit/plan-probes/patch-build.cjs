const fs = require('fs');
let s = fs.readFileSync('scripts-fixed/build.mjs', 'utf8');
const a = "m.start >= '07:00' && m.end <= '23:30')).length;";
const b = "    if (c.offered && c.credits === 0) warnings.push(";
if (!s.includes(a) || !s.includes(b)) { console.log('anchor missing / already patched'); process.exit(0); }
s = s.replace(a, "m.start >= '07:00' && m.end <= '23:00' && /:[03]0$/.test(m.start))).length; // the solver's 30-minute grid: 07:00-23:00, a lesson starts on :00 or :30");
s = s.replace(b, "    if (c.prereqs.some((p) => p.anyOf.some((a) => a.id === id))) errors.push(`${id}: a prerequisite names the course itself (check parseDetails)`);\n" + b);
fs.writeFileSync('scripts-fixed/build.mjs', s);
console.log('patched');
