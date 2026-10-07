const fs = require('fs');
let s = fs.readFileSync('scripts-fixed/parse.mjs', 'utf8');
const a = "c[0].startsWith('תנאי'))";
if (!s.includes(a)) { console.log('already patched or anchor missing'); process.exit(0); }
s = s.replace(a, "/^תנאי (קדם|מקביל)/.test(c[0]))");
fs.writeFileSync('scripts-fixed/parse.mjs', s);
console.log('patched');
