// WCAG contrast of the token pairs design A (web/design-a.css) uses, in both themes. The prototype's palette was not assumed clean:
// every text pair needs 4.5:1, every outline that marks a control 3:1, and the dark theme is checked like the light one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../web/design-a.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

// the declarations of the rule whose selector is exactly `selector`
function declarations(selector) {
  const at = css.indexOf(`${selector} {`);
  assert.ok(at >= 0, `design-a.css has a rule for ${selector}`);
  assert.equal(css.split(`${selector} {`).length, 2, `exactly one ${selector} block: a second one would change the palette unseen`);
  const body = css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
  return Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]));
}
// light and dark are disjoint (:not([data-theme="dark"]) against [data-theme="dark"]), so a colour the dark block forgot could never fall back
// to a light one; the live dark block (style.css) has the same specificity as a plain A rule, which is why the light block is not plain.
const LIGHT = declarations(':root[data-design="a"]:not([data-theme="dark"])');
const DARK = declarations(':root[data-design="a"][data-theme="dark"]');
const SHARED = declarations(':root[data-design="a"]');

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
// a token's colour, following var(--other) references
const colour = (tokens, name) => {
  let v = tokens[`--${name}`];
  for (let i = 0; i < 5 && v?.startsWith('var('); i++) v = tokens[v.match(/var\((--[\w-]+)\)/)[1]];
  assert.match(v ?? '', /^#[0-9a-fA-F]{6}$/, `--${name} is a six-digit hex colour`);
  return v;
};

const pairs = [];
for (const bg of ['bg', 'surface', 'surface-2'])
  for (const fg of ['text', 'text-2', 'text-3']) pairs.push([fg, bg, 4.5]);
pairs.push(
  ['primary', 'bg', 4.5], ['primary', 'surface', 4.5], ['on-primary', 'primary', 4.5], ['on-primary', 'primary-hover', 4.5],
  ['on-primary', 'primary-press', 4.5], ['primary', 'primary-soft', 4.5], ['text', 'primary-soft', 4.5], ['text', 'chrome', 4.5],
  ['text-2', 'chrome', 4.5], ['success', 'success-soft', 4.5], ['warning', 'warning-soft', 4.5], ['danger', 'danger-soft', 4.5],
  ['friend', 'friend-soft', 4.5], ['success', 'surface', 4.5], ['warning', 'surface', 4.5], ['danger', 'surface', 4.5],
  ['border-input', 'bg', 3], ['border-input', 'surface', 3],
  // where components put one token on another: warnings on the page, text-3 and text-2 on a hovered tile, a chosen segment, a hovered primary tint
  ['warning', 'bg', 4.5], ['warning', 'surface-2', 4.5], ['text-3', 'primary-soft', 4.5], ['text-2', 'primary-soft', 4.5],
  ['primary-hover', 'primary-soft', 4.5], ['text', 'seg-on', 4.5], ['text-3', 'chrome', 4.5]
);
for (let i = 0; i < 8; i++)
  pairs.push([`c${i}-fg`, `c${i}-bg`, 4.5], ['text', `c${i}-bg`, 4.5], ['text-2', `c${i}-bg`, 4.5], [`c${i}-fg`, 'surface', 4.5]);

for (const [theme, tokens] of [['light', LIGHT], ['dark', DARK]])
  test(`design A, ${theme}: every token pair meets its contrast`, () => {
    const low = pairs.map(([fg, bg, min]) => ({ fg, bg, min, r: ratio(colour(tokens, fg), colour(tokens, bg)) })).filter((p) => p.r < p.min);
    assert.deepEqual(low.map((p) => `${p.fg} on ${p.bg} = ${p.r.toFixed(2)} (needs ${p.min})`), []);
  });

test('the dark block defines every colour token the light block does, and nothing else', () => {
  assert.deepEqual(Object.keys(DARK).sort(), Object.keys(LIGHT).sort());
});

test('the shared block holds no colour and does not redefine the tap size (style.css owns --tap, with its pointer:fine value)', () => {
  assert.equal(SHARED['--tap'], undefined);
  const COLOUR = new RegExp(['#[0-9a-f]{3,8}', 'rgba?[(]'].join('|'), 'i');
  assert.deepEqual(Object.entries(SHARED).filter(([, v]) => COLOUR.test(v)), []);
});
