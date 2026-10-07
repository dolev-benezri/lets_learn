const fs = require('fs');
let s = fs.readFileSync('solver-core.js', 'utf8');
const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n');
const old = `  for (const it of items) if (it.mode === 'must' && !it.options.length) out.push(\`\${name(it.id)}: אין קבוצה שמתאימה לאילוצים (\${freedByBlocks(it.id)
    ? 'זמן תפוס, ' : ''}\${avoids ? 'בחירת מרצה, ' : ''}חסימות אישיות, קבוצות מלאות או נעיצה)\`);
`;
if (!s.includes(old)) throw new Error('anchor');
const neu = `  for (const it of items) if (it.mode === 'must' && !it.options.length) {
    out.push(\`\${name(it.id)}: אין קבוצה שמתאימה לאילוצים (\${freedByBlocks(it.id)
      ? 'זמן תפוס, ' : ''}\${avoids ? 'בחירת מרצה, ' : ''}חסימות אישיות, קבוצות מלאות או נעיצה)\`);
    // Course 10013: every tutorial links the one lab that is full, and the free lab is linked from nothing (the source page is the same).
    const c = data.courses[it.id], linked = new Set(c.groups.flatMap((g) => g.linked));
    const lone = c.groups.filter((g) => !g.primary && !g.full && !linked.has(g.id) && c.groups.some((f) => f.full && f.type === g.type));
    if (lone.length && !freedByBlocks(it.id) && buildOptions(c, { includeFull: true }).length) {
      out.push(\`\${name(it.id)}: כל הצירופים כוללים קבוצה מלאה, והקבוצה הפנויה \${lone.map((g) => \`\${g.id} (\${g.type})\`).join(', ')} לא מקושרת באתר אפקה\`
        + ' לאף הרצאה או תרגול, ולכן אי אפשר לשבץ אותה. אפשר לסמן "לכלול קבוצות מלאות" או לפנות למזכירות.');
    }
  }
`;
s = s.replace(old, neu);
fs.writeFileSync('solver-core.js', crlf ? s.replace(/\n/g, '\r\n') : s);
const max = Math.max(...s.split('\n').map((l) => [...l].length));
console.log('patched, crlf=' + crlf + ', longest line ' + max);
