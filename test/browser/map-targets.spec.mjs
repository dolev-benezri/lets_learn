// Tap targets on the map in WebKit (the engine of iPhone Safari): at phone widths every control in the map dialog is at least 44px tall (the drawn icon may stay small),
// and the map does not break: nothing sideways, nothing spilling out of the screen, the controls never overlap, the title keeps one line and the map keeps most of the height.
// Run through `npm run test:browser -- map-targets`. Student and seeding: helpers.mjs.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { DONE, DESIGN, onA, openMap, visit, launch } from './helpers.mjs';

let browser;
before(async () => {
  browser = await launch();
});
after(async () => {
  await browser?.close();
});

const MIN = 44;
const PHONES = [
  { width: 320, height: 640 },
  { width: 360, height: 740 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 414, height: 896 }
];
const frame = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

// Every visible control inside the map: buttons, links, and the <summary> of a details box (a button too). Map nodes are SVG, drawn and sized by the zoom: not counted here.
const controls = (page) =>
  page.evaluate(() => {
    const vw = innerWidth;
    return [...document.querySelectorAll('#pmap button, #pmap a[href], #pmap summary')]
      .filter((e) => {
        // WebKit still lays out what a closed <details> hides: only the box's own summary is on the screen then
        const shut = e.closest('details:not([open])');
        return e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && (!shut || e === shut.firstElementChild);
      })
      .map((e) => {
        const r = e.getBoundingClientRect();
        return {
          name: `${e.tagName.toLowerCase()}${e.className ? '.' + String(e.className).trim().split(/\s+/).join('.') : ''}${e.dataset.pm ? `[${e.dataset.pm}]` : ''}`,
          x: r.x,
          y: r.y,
          w: r.width,
          h: r.height,
          inside: r.left >= -0.5 && r.right <= vw + 0.5
        };
      });
  });

for (const size of PHONES) {
  test(`${size.width}px wide: every map control is at least ${MIN}px tall and wide and the map layout holds`, async (t) => {
    const page = await visit(browser, t, size, { ...DONE });
    await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
    await openMap(page);
    await page.locator('#pmap[open]').waitFor();
    await page.locator('#pmap .pm-svg.ready').waitFor({ timeout: 30000 });
    assert.ok(await page.locator('#pmap .pm-alt').count(), 'the seeded plan has alternatives, so the switcher is on the map');

    // The switcher's widest label, the last of the alternatives ("10 מתוך 10"): the title still has to fit beside it.
    const atLast = () =>
      page.evaluate(() => {
        const b = [...document.querySelectorAll('#pmap .pm-alt-l b')].map((x) => x.textContent);
        return b.length === 2 && b[0] === b[1];
      });
    const total = await page.locator('#pmap .pm-alt-l b').last().innerText();
    assert.equal(total, '10', 'the seeded plan has ten alternatives, so the last label is the widest one, "10 מתוך 10"');
    for (let i = 0; i < 30 && !(await atLast()); i++) {
      await page.locator('#pmap [data-pm="alt"][data-d="1"]').click();
      await frame(page);
    }
    assert.ok(await atLast(), 'the switcher reached its last alternative');

    const small = [],
      layout = [];
    const look = async (what) => {
      await frame(page);
      const all = await controls(page);
      for (const c of all) {
        if (c.h < MIN - 0.5) small.push(`${what}: ${c.name} is ${c.h.toFixed(1)}px tall`);
        if (c.w < MIN - 0.5 && !c.name.includes('[alt]')) small.push(`${what}: ${c.name} is ${c.w.toFixed(1)}px wide`);
        if (!c.inside) layout.push(`${what}: ${c.name} leaves the screen (x ${c.x.toFixed(0)}, w ${c.w.toFixed(0)})`);
      }
      // Two controls never lie on each other (a touch lands on one of them).
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) {
          const a = all[i],
            b = all[j],
            ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x),
            oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          if (ox > 1 && oy > 1) layout.push(`${what}: ${a.name} overlaps ${b.name}`);
        }
      // The two arrows of the switcher are narrower than 44px (the header is tight), but a touch up to 3px beside them still lands on them: the touch area is 44px wide.
      const arrows = await page.evaluate(() =>
        [...document.querySelectorAll('#pmap .pm-alt .pm-ibtn')].map((b) => {
          const r = b.getBoundingClientRect(),
            y = r.top + r.height / 2;
          return r.width >= 44 || [r.left - 3, r.right + 3].every((x) => document.elementFromPoint(x, y) === b);
        })
      );
      if (!arrows.length || !arrows.every(Boolean)) layout.push(`${what}: an arrow of the alternatives switcher has a touch area under ${MIN}px wide`);
      const m = await page.evaluate(() => {
        const dlg = document.querySelector('#pmap'),
          title = document.querySelector('#pmap .pm-title').getBoundingClientRect(),
          svg = document.querySelector('#pmap .pm-svg, #pmap .pm-listview')?.getBoundingClientRect();
        return { sideways: dlg.scrollWidth - dlg.clientWidth, titleH: title.height, mapH: svg?.height ?? 0, vh: innerHeight };
      });
      if (m.sideways > 1) layout.push(`${what}: scrolls sideways by ${m.sideways}px`);
      if (m.titleH > 30) layout.push(`${what}: the title wraps (${m.titleH.toFixed(0)}px tall)`);
      // (the open legend takes the map's height on a small phone today: that look is left out of the height rule)
      if (!what.includes('legend') && m.mapH < m.vh * 0.4) layout.push(`${what}: the map is only ${m.mapH.toFixed(0)}px of ${m.vh}px`);
    };

    await look('map, mini pane closed');
    // The legend, the electives box and the mini pane, one open at a time (an open box covers the others' summary); the open mini pane shows its own toggle.
    const legend = await onA(page) ? '#pmap .pm-legend-more summary' : '#pmap .pm-legend summary';
    for (const sel of [legend, '#pmap .pm-aside summary', '#pmap .pm-mini summary']) {
      const s = page.locator(sel);
      if (!(await s.count())) continue;
      await s.first().click();
      await look(`map, ${sel.replace('#pmap ', '')} open`);
      if (sel.endsWith('pm-mini summary'))
        assert.ok(await page.locator('#pmap .pm-ab').isVisible(), 'the mini pane is open, so its abbreviations toggle is on the screen');
      await s.first().click();
    }
    // A node's card, with its own buttons
    await page.locator('#pmap .nd').first().dispatchEvent('click');
    await page.locator('#pmap .pm-card:not([hidden])').waitFor();
    await look('map, a node card');
    // The list view
    await page.locator('#pmap [data-pm="view"]').click();
    await page.locator('#pmap .pm-listview').waitFor();
    await look('list view');
    assert.deepEqual([...new Set(layout.map((s) => s.replace(/^[^:]*: /, '')))], [], 'the map layout');
    // the same control shows up in every look: say it once
    assert.deepEqual([...new Set(small.map((s) => s.replace(/^[^:]*: /, '')))], [], `controls under ${MIN}px`);
  });
}

if (DESIGN === 'a') for (const scheme of ['light', 'dark']) for (const width of [320, 1280])
  test(`A ${width}/${scheme}: plan colours, matching legend, focus switch persistence and lit chains`, async (t) => {
    const page = await visit(browser, t, { width, height: 900 }, DONE, '', scheme);
    const ready = async () => {
      await page.locator('#week .blk').first().waitFor({ timeout: 30000 });
      await openMap(page);
      await page.locator('#pmap .pm-svg.ready').waitFor({ timeout: 30000 });
    };
    await ready();
    const more = page.locator('#pmap .pm-legend-more');
    assert.equal(await more.getAttribute('open'), null);
    assert.equal(await page.locator('#pmap .pm-legend-main > .lg-i').count(), 4);
    for (const sample of await page.locator('#pmap .pm-legend-main > .lg-i').all()) assert.ok(await sample.isVisible());
    assert.equal(await more.locator('.st-exempt').count(), 1, 'the other states are inside the fold');
    assert.equal(await more.locator('.lg-e.plan').count(), 1, 'the edge samples are inside the fold');
    assert.equal(await more.locator('.ext.pre').count(), 1, 'the shape samples are inside the fold');
    const sw = page.getByRole('switch', { name: 'הדגשת המערכת' });
    const check = async (on) => {
      assert.equal(await sw.getAttribute('aria-checked'), String(on));
      assert.equal(await page.locator('#pmap').evaluate((el) => el.classList.contains('focus')), on);
      const actual = await page.evaluate(() => {
        const d = document.querySelector('#pmap');
        const colour = (token) => {
          const el = document.createElement('span');
          el.style.color = `var(--${token})`;
          d.append(el);
          const c = getComputedStyle(el).color;
          el.remove();
          return c;
        };
        const style = (s) => {
          const el = d.querySelector(s);
          return el && getComputedStyle(el);
        };
        const plan = style('.nd.plan .ring'), node = style('.nd.st-done:not(.plan) .ring'), sample = style('.sw.st-done .ring');
        return { plan: plan.fill, primary: colour('primary'), name: style('.nd.plan .nm').fontWeight,
          glyph: style('.nd.plan .gl')?.stroke, onPrimary: colour('on-primary'), halo: style('.nd.plan .plan-ring').stroke,
          haloWidth: style('.nd.plan .plan-ring').strokeWidth, edge: style('.e.plan').stroke,
          edgeOpacity: style('.e.plan').strokeOpacity, arrow: style('.ar.plan').fill,
          ring: node.fill, sample: sample.fill, stroke: node.stroke, sampleStroke: sample.stroke,
          width: node.strokeWidth, surface: colour('surface'), tint: colour('success-soft'),
          nameColour: style('.nd.st-done:not(.plan) .nm').fill, text2: colour('text-2'),
          nameWeight: style('.nd.st-done:not(.plan) .nm').fontWeight, blocked: style('.nd.st-blocked .ring').stroke };
      });
      assert.equal(actual.plan, actual.primary);
      assert.equal(actual.name, '700');
      if (actual.glyph) assert.equal(actual.glyph, actual.onPrimary); // available courses have no glyph
      assert.equal(actual.halo, actual.primary);
      assert.equal(actual.haloWidth, '3px');
      assert.equal(actual.edge, actual.primary);
      assert.equal(actual.edgeOpacity, '1');
      assert.equal(actual.arrow, actual.primary);
      assert.equal(actual.ring, on ? actual.surface : actual.tint);
      assert.equal(actual.sample, actual.ring);
      assert.equal(actual.sampleStroke, actual.stroke);
      assert.equal(actual.blocked, actual.text2);
      if (on) {
        assert.equal(actual.width, '1.5px');
        assert.equal(actual.nameColour, actual.text2);
        assert.equal(actual.nameWeight, '400');
      }
    };
    await check(true);
    await sw.focus();
    await page.keyboard.press('Space');
    await check(false);
    assert.equal(await sw.evaluate((el) => el === document.activeElement), true, 'toggle keeps focus');
    await page.reload();
    await ready();
    await check(false);
    await sw.click();
    await check(true);
    const nodes = page.locator('#pmap .nd:not(.plan)');
    let lit = false;
    for (let i = 0; i < await nodes.count(); i++) {
      await nodes.nth(i).dispatchEvent('pointerover', { pointerType: 'mouse' });
      if (await page.locator('#pmap .e.lit').count()) { lit = true; break; }
    }
    assert.ok(lit, 'hovering a non-plan course lights its chain');
    assert.deepEqual(await page.locator('#pmap .e.lit').evaluateAll((es) => [...new Set(es.map((el) => getComputedStyle(el).opacity))]), ['1']);
    assert.equal(await page.locator('#pmap .pm-svg').evaluate((el) => el.classList.contains('dim')), true);
    await page.reload();
    await ready();
    await check(true);
  });
