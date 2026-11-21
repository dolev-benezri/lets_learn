// Design A ships behind a switch (web/design.js), so classic must render exactly as before: every top-level rule of web/design-a.css has to be
// scoped under :root[data-design="a"]. This test reads the stylesheet and fails on any rule that is not (specificity cannot be seen here;
// test/browser/shell-a.spec.mjs asserts the visible result). It also refuses what could still reach classic from inside a scoped block:
// nested rules, a global @font-face, and an @keyframes name style.css already uses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SCOPE = ':root[data-design="a"]';
const noComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

const noStrings = (src) => src.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');

// The rules at depth 0 of a stylesheet: { prelude, body }. Braces inside a "string" or 'string' do not count.
function topRules(src) {
  const out = [];
  let depth = 0,
    start = 0,
    bodyStart = 0,
    prelude = '',
    quote = '';
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '{') {
      if (depth === 0) {
        prelude = src.slice(start, i).trim();
        bodyStart = i + 1;
      }
      depth++;
    } else if (c === '}') {
      depth--;
      assert.ok(depth >= 0, 'unbalanced braces');
      if (depth === 0) {
        out.push({ prelude, body: src.slice(bodyStart, i) });
        start = i + 1;
      }
    }
  }
  assert.equal(depth, 0, 'unbalanced braces');
  assert.equal(quote, '', 'unterminated string');
  return out;
}
// A selector list split at the commas that are not inside (), [] or a string.
function selectors(list) {
  const out = [];
  let depth = 0,
    quote = '',
    cur = '';
  for (const c of list) {
    if (quote) {
      if (c === quote) quote = '';
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    if (c === ',' && depth === 0 && !quote) {
      out.push(cur.trim());
      cur = '';
    } else cur += c;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
// everything wrong with a stylesheet's place in classic, as readable strings: selectors outside the scope (with @media / @supports looked into),
// nesting inside a rule, @font-face, other at-rules. @keyframes bodies are not selectors; their names are returned in `keyframes`.
export function problems(css) {
  const bad = [],
    keyframes = [];
  const walk = (src) => {
    for (const { prelude, body } of topRules(src)) {
      if (/^@(media|supports|layer)\b/.test(prelude)) walk(body);
      else if (/^@(-webkit-)?keyframes\b/.test(prelude)) keyframes.push(prelude.replace(/^@(-webkit-)?keyframes\s+/, ''));
      else if (prelude.startsWith('@')) bad.push(prelude);
      else {
        for (const s of selectors(prelude)) if (!s.startsWith(SCOPE)) bad.push(s);
        if (noStrings(body).includes('{')) bad.push(`nested rule inside ${prelude}`);
      }
    }
  };
  walk(noComments(css));
  return { bad, keyframes };
}

test('the checker flags a rule outside the scope, inside @media too, and passes scoped ones', () => {
  assert.deepEqual(problems(`${SCOPE} .a, ${SCOPE}[data-theme="dark"] .b { color: red }`).bad, []);
  assert.deepEqual(problems(`.a { color: red } ${SCOPE} .b { color: red }`).bad, ['.a']);
  assert.deepEqual(problems(`@media (max-width:599px) { ${SCOPE} .a { x: y } .b { x: y } }`).bad, ['.b']);
  assert.deepEqual(problems(`${SCOPE} .a, .c { x: y }`).bad, ['.c']);
  assert.deepEqual(problems(`@keyframes k { from { x: y } to { x: z } } ${SCOPE} :is(.a, .b) { x: y }`), { bad: [], keyframes: ['k'] });
});

test('the checker refuses nesting, a global @font-face, a brace inside a string that hides a rule', () => {
  assert.deepEqual(problems(`${SCOPE} { :is(&, body) { color: red } }`).bad, [`nested rule inside ${SCOPE}`]);
  assert.deepEqual(problems('@font-face { font-family: Rubik; src: url(x.woff2) }').bad, ['@font-face']);
  assert.deepEqual(problems(`${SCOPE} { --x: "{"; } body { color: red }`).bad, ['body']);
  assert.throws(() => problems(`${SCOPE} { color: red`), /unbalanced/);
});

test('every top-level selector in design-a.css is scoped under :root[data-design="a"], and nothing else can reach classic', () => {
  const css = readFileSync(new URL('../web/design-a.css', import.meta.url), 'utf8');
  assert.ok(topRules(noComments(css)).length > 0, 'the stylesheet has rules');
  const { bad, keyframes } = problems(css);
  assert.deepEqual(bad, []);
  const taken = [...readFileSync(new URL('../web/style.css', import.meta.url), 'utf8').matchAll(/@(?:-webkit-)?keyframes\s+([\w-]+)/g)].map((m) => m[1]);
  assert.deepEqual(keyframes.filter((k) => taken.includes(k)), [], 'an @keyframes name that style.css already defines would replace its animation');
});

test('design.js is read before the stylesheets in both pages, so the attribute is set before the first paint', () => {
  for (const page of ['index.html', 'legal.html']) {
    const html = readFileSync(new URL(`../web/${page}`, import.meta.url), 'utf8');
    const js = html.indexOf('<script src="design.js">'),
      css = html.indexOf('<link rel="stylesheet" href="style.css">');
    assert.ok(js > 0 && css > 0 && js < css, `${page}: design.js before style.css`);
    assert.ok(html.indexOf('<script src="theme.js">') < js, `${page}: theme.js first, as before`);
    assert.ok(html.indexOf('<link rel="stylesheet" href="design-a.css">') > css, `${page}: design-a.css after style.css`);
  }
});
