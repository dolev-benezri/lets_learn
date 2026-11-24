// Design A in real iPhone Safari. Apple's iOS Simulator runs only on macOS, so this runs on GitHub's macOS machine (.github/workflows/iphone.yml), driven by
// Appium with its XCUITest driver (an Appium server on APPIUM_URL, default http://127.0.0.1:4723).
// It serves web/ with the frozen data as the browser tests do, opens the site in Safari on the smallest and the largest iPhone the machine has (system language
// Hebrew), and walks the design A rows of docs/IPHONE-CHECKLIST.md with real taps, the on-screen keyboard and the phone turned sideways. Every step saves a
// screenshot of the whole screen (Safari's bars, the keyboard and the home indicator included) to test/ios/out/<iPhone>/, and out/report.json holds what
// each step measured. A step that cannot run, or a measure out of its range, fails the run; the screenshots are for a person to look at either way.
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startSite } from '../browser/site.mjs';
import { DONE, TOUR_SEEN, MODE_BUILD, DESIGN_KEY } from '../browser/helpers.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)),
  OUT = path.join(HERE, 'out'),
  APPIUM = process.env.APPIUM_URL || 'http://127.0.0.1:4723',
  EL = 'element-6066-11e4-a52e-4f735466cecf'; // the W3C key of an element reference
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The newest iOS the machine has; on it the smallest iPhone (SE, mini or an "e") and the largest (Pro Max, else Plus or Air).
function iphones() {
  const { devices } = JSON.parse(execFileSync('xcrun', ['simctl', 'list', 'devices', 'available', '-j'], { encoding: 'utf8' }));
  const ver = (k) => k.match(/iOS-(\d+)-(\d+)/)?.slice(1).map(Number) ?? [0, 0];
  const runtime = Object.keys(devices)
    .filter((k) => /SimRuntime\.iOS-/.test(k) && devices[k].some((d) => d.name.startsWith('iPhone')))
    .sort((a, b) => ver(a)[0] - ver(b)[0] || ver(a)[1] - ver(b)[1])
    .at(-1);
  if (!runtime) throw new Error('no iPhone simulator on this machine');
  const list = devices[runtime].filter((d) => d.name.startsWith('iPhone')),
    pick = (re) => list.find((d) => re.test(d.name));
  const chosen = [pick(/SE|mini|\d+e\b/) ?? list[0], pick(/Pro Max/) ?? pick(/Plus|Air/) ?? list.at(-1)];
  return chosen.filter((d, i) => chosen.findIndex((x) => x.udid === d.udid) === i).map((d) => ({ name: d.name, udid: d.udid, version: ver(runtime).join('.') }));
}

// node:http, not fetch: fetch gives up after 300s without an answer, and the first session (WebDriverAgent's build, the simulator's boot) can take longer
function call(method, url, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(APPIUM + url, { method, headers: { 'content-type': 'application/json' } }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('error', reject); // Appium dropping the line mid-answer is a failed call, not a crash of the run
      res.on('data', (c) => (text += c));
      res.on('end', () => {
        let value;
        try {
          ({ value } = JSON.parse(text));
        } catch {
          return reject(new Error(`${method} ${url}: ${res.statusCode} ${text.slice(0, 300)}`));
        }
        if (res.statusCode >= 400) reject(new Error(`${method} ${url}: ${value?.error} ${String(value?.message).split('\n')[0].slice(0, 300)}`));
        else resolve(value);
      });
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

// wdaPort: each phone its own WebDriverAgent port, or the second would drive the first one's simulator (the driver reuses an agent that answers)
async function openSafari(phone, site, wdaPort) {
  const { sessionId } = await call('POST', '/session', {
    capabilities: {
      alwaysMatch: {
        platformName: 'iOS',
        browserName: 'Safari',
        'appium:automationName': 'XCUITest',
        'appium:udid': phone.udid,
        'appium:platformVersion': phone.version,
        'appium:language': 'he',
        'appium:locale': 'he_IL',
        'appium:connectHardwareKeyboard': false, // the on-screen keyboard opens, as on a phone
        'appium:nativeWebTap': true, // a click is a real tap at the element's place on the screen, not a script event
        'appium:reduceMotion': true,
        'appium:safariInitialUrl': `${site}legal.html`,
        'appium:newCommandTimeout': 600,
        'appium:simulatorStartupTimeout': 600000,
        'appium:wdaLaunchTimeout': 1800000, // the first session builds WebDriverAgent: 14 minutes on the first run
        'appium:wdaConnectionTimeout': 1800000,
        'appium:wdaLocalPort': wdaPort,
        'appium:webviewConnectTimeout': 60000 // Safari's first start on a fresh simulator is slow to show its page
      }
    }
  });
  const s = (m, p, b) => call(m, `/session/${sessionId}${p}`, b);
  // fn runs in the native layer (XCUITest's own view of the screen), then the page is the context again
  const native = async (fn) => {
    const web = await s('GET', '/context');
    await s('POST', '/context', { name: 'NATIVE_APP' });
    try {
      return await fn();
    } finally {
      await s('POST', '/context', { name: web });
    }
  };
  const d = {
    end: () => call('DELETE', `/session/${sessionId}`),
    go: (url) => s('POST', '/url', { url }),
    js: (fn, ...args) => s('POST', '/execute/sync', { script: `return (${fn})(...arguments)`, args }),
    mobile: (cmd, arg = {}) => s('POST', '/execute/sync', { script: `mobile: ${cmd}`, args: [arg] }),
    shot: async (file) => writeFile(file, Buffer.from(await s('GET', '/screenshot'), 'base64')),
    // iOS 26's simulator answered LANDSCAPE with "Unable To Rotate Device" and stayed upright (PORTRAIT answered 200). Then the Simulator app's own
    // rotate keys (⌘← and ⌘→, through System Events); the page's own width tells whether the phone turned, and the first error stands if it did not.
    async rotate(orientation) {
      const wide = orientation === 'LANDSCAPE';
      try {
        await s('POST', '/orientation', { orientation });
      } catch (e) {
        let why = 'the Simulator keys sent';
        try {
          const keys = `tell application "System Events" to key code ${wide ? 123 : 124} using command down`;
          execFileSync('osascript', ['-e', 'tell application "Simulator" to activate', '-e', keys], { timeout: 15000 }); // a permission prompt waits ~2 min
        } catch (k) {
          why = `the Simulator keys failed: ${(String(k.stderr ?? '').trim() || k.message).split('\n')[0]}`; // a timeout leaves stderr empty
        }
        await d.until((wide) => (innerWidth > innerHeight) === wide, wide ? 'the landscape layout' : 'the portrait layout', 10000, wide).catch(() => {
          throw new Error(`${e.message}; ${why}, and the page did not turn`);
        });
      }
    },
    // Safari's first start shows a tip bubble ("TipView") over the bottom of the page that takes the next tap; a tap on the status bar does not close it.
    // Its own close button (xmark.circle.fill, "סגירה"), else the popover's dismiss region.
    // The native screen's tree is kept for a look at what Safari showed.
    // sheet: also a first-start sheet's buttons (only when stuck: the page's own "המשך" is a button of the same name in this tree)
    async dismissTip(file, sheet = false) {
      await native(async () => {
        await s('GET', '/source')
          .then((x) => writeFile(file, x))
          .catch(() => {});
        const close = ['name == "xmark.circle.fill"', 'name == "PopoverDismissRegion"'];
        if (sheet) close.push('type == "XCUIElementTypeButton" AND label IN {"המשך", "Continue", "לא עכשיו", "Not Now"}');
        for (const value of close) {
          const el = await s('POST', '/element', { using: '-ios predicate string', value }).catch(() => null);
          if (el) await s('POST', `/element/${el[EL]}/click`, {}).catch(() => {});
        }
      });
      await sleep(800);
    },
    async snapshot(name) {
      await d.shot(`${name}.png`).catch(() => {});
      await native(async () => writeFile(name + '.xml', await s('GET', '/source'))).catch(() => {});
    },
    async until(fn, what, ms = 15000, ...args) {
      for (const end = Date.now() + ms; ; await sleep(300)) {
        const v = await d.js(fn, ...args).catch(() => null);
        if (v) return v;
        if (Date.now() > end) throw new Error(`waited ${ms / 1000}s for ${what}`);
      }
    },
    // A real tap on the first visible element that matches (and holds `text`, when given): scrolled to the middle of its scroller first.
    async tap(sel, text = null) {
      const found = await d.js(
        (sel, text) => {
          const e = [...document.querySelectorAll(sel)].find((x) => x.getClientRects().length && (!text || x.textContent.includes(text)));
          document.querySelectorAll('[data-ios-tap]').forEach((x) => x.removeAttribute('data-ios-tap'));
          if (!e) return false;
          e.setAttribute('data-ios-tap', '');
          e.scrollIntoView({ block: 'center', behavior: 'instant' });
          return true;
        },
        sel,
        text
      );
      if (!found) throw new Error(`nothing visible: ${sel}${text ? ` "${text}"` : ''}`);
      await sleep(300);
      const { [EL]: id } = await s('POST', '/element', { using: 'css selector', value: '[data-ios-tap]' });
      await s('POST', `/element/${id}/click`, {});
      await sleep(600);
    },
    // Typing into the field the last tap focused, found in the native tree by its label: XCTest's typeText, the on-screen keyboard (the page's own
    // typing would skip it). Run 4 found no element by hasKeyboardFocus. If the label is not found either, hardware key events to the focused
    // field ("mobile: keys"); the result says which one typed.
    async type(text, label) {
      const how = await native(async () => {
        const field = await s('POST', '/element', {
          using: '-ios predicate string',
          value: `type IN {"XCUIElementTypeSearchField", "XCUIElementTypeTextField"} AND label BEGINSWITH "${label}"`
        }).catch(() => null);
        if (!field) return null;
        await s('POST', `/element/${field[EL]}/value`, { text });
        return 'on-screen keyboard';
      });
      if (!how) await d.mobile('keys', { keys: [...text] });
      await sleep(600);
      return how ?? 'key events';
    },
    async clearTyped() {
      const { [EL]: id } = await s('POST', '/element', { using: 'css selector', value: '[data-ios-tap]' });
      await s('POST', `/element/${id}/clear`, {});
      await sleep(400);
    },
    async closeKeyboard() {
      await d.js(() => document.activeElement?.blur());
      await sleep(600);
    },
    // A one-finger drag on the screen, from the middle of `sel` by (dx, dy) points (the page's CSS pixels at zoom 1): the native layer, Safari's own gesture.
    // It returns the start point on the screen. It takes the web view's top as the page's top, which Safari's bars can shift: the step keeps it in the report.
    async drag(sel, dx, dy) {
      const r = await d.js((sel) => {
        const b = document.querySelector(sel).getBoundingClientRect(),
          v = visualViewport,
          top = Math.max(b.top, v.offsetTop),
          bottom = Math.min(b.bottom, v.offsetTop + v.height); // the part of it on the screen
        return { x: (b.left + b.width / 2 - v.offsetLeft) * v.scale, y: ((top + bottom) / 2 - v.offsetTop) * v.scale };
      }, sel);
      const at = await native(async () => {
        const { [EL]: wv } = await s('POST', '/element', { using: '-ios class chain', value: '**/XCUIElementTypeWebView' });
        const o = await s('GET', `/element/${wv}/rect`),
          x = Math.round(o.x + r.x),
          y = Math.round(o.y + r.y);
        const finger = [
          { type: 'pointerMove', duration: 0, x, y },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration: 120 },
          { type: 'pointerMove', duration: 350, x: x + dx, y: y + dy },
          { type: 'pointerUp', button: 0 }
        ];
        await s('POST', '/actions', { actions: [{ type: 'pointer', id: 'finger', parameters: { pointerType: 'touch' }, actions: finger }] });
        return { x, y, webView: o };
      });
      await sleep(900);
      return at;
    }
  };
  return d;
}

// A schedule loaded in improve mode, as test/browser/edit-a.spec.mjs seeds it
const L = (course, name, type, group, day, start, end) => ({ course, name, type, group, day, start, end });
const BASE = [
  L('30003', 'מבוא לכימיה', 'סופי-הרצאה+תרגול', '273000302', 4, '14:00', '15:50'), L('30003', 'מבוא לכימיה', 'תרגול', '273000302/1', 4, '16:00', '16:50'),
  L('30112', 'תרמודינמיקה 1', 'סופי-הרצאה+תרגול', '273011204', 3, '15:00', '16:50'), L('30112', 'תרמודינמיקה 1', 'תרגול', '273011204/1', 3, '17:00', '17:50')
];
const EDIT = { v: 1, dataset: { year: 2027, sem: 'א', program: 30, startYear: 2026 }, registered: false, owned: [], original: BASE, baseline: BASE, movable: ['30003'], goal: { dayOff: 4 } };

// What a step measures, in the page (CSS pixels; the visual viewport is what is left above the keyboard and between Safari's bars).
const MEASURE = () => {
  const v = visualViewport,
    // which frame the boxes come in: a fixed box at 0,0 sits at the layout viewport's corner, so it measures 0,0 in the layout frame and
    // -offsetLeft,-offsetTop in the visual one. With the keyboard up, iOS 26 gave the visual one (run 5: the English score showed above the keyboard
    // while a layout test said under it; run 6: the sticky switcher, at the layout top, measured -vvTop). Not the root's box: on iOS 26 scrollY
    // moves with the visual viewport too, so root.top + scrollY stayed 0 in both frames (run 7: frameShift 0,0 while tabsTop was -vvTop)
    probe = Object.assign(document.createElement('div'), { style: 'position:fixed;left:0;top:0;width:1px;height:1px;pointer-events:none' }),
    corner = (document.body.append(probe), probe.getBoundingClientRect()),
    shiftY = (probe.remove(), -corner.top),
    shiftX = -corner.left,
    seen = (e) => e && e.getClientRects().length > 0,
    inside = (e) => {
      const r = e.getBoundingClientRect(), y = v.offsetTop - shiftY, x = v.offsetLeft - shiftX;
      return r.top >= y - 1 && r.bottom <= y + v.height + 1 && r.left >= x - 1 && r.right <= x + v.width + 1;
    };
  const dock = [...document.querySelectorAll('.dock [data-tool]')].filter(seen),
    panel = document.getElementById('panel'),
    sheet = seen(panel) ? panel : seen(document.querySelector('.edit-tool')) ? document.querySelector('.edit-tool') : null,
    focus = document.activeElement?.matches?.('input, select, textarea') ? document.activeElement : null;
  return {
    view: `${innerWidth}x${innerHeight}`,
    visible: `${Math.round(v.width)}x${Math.round(v.height)}`,
    keyboard: v.height < innerHeight - 120,
    wide: document.documentElement.scrollWidth > innerWidth + 1,
    dock: dock.length,
    dockInside: dock.every(inside),
    sheetTop: sheet ? Math.round((sheet.getBoundingClientRect().top / innerHeight) * 100) : null, // % of the window's height
    focused: focus ? focus.dataset.k || focus.id || focus.tagName : null,
    // the focused field in the visible area: the frame its box came in, null when it is not (under the keyboard, above the top)
    focusFrame: !focus || !inside(focus) ? null : Math.abs(shiftY) > 1 || Math.abs(shiftX) > 1 ? 'visual' : 'layout',
    frameShift: `${Math.round(shiftX)},${Math.round(shiftY)}`,
    alt: document.getElementById('altLabel')?.textContent.trim() ?? null,
    vvTop: Math.round(v.offsetTop), // with the semester switcher's top: run 4 once showed it under the clock right after the keyboard closed
    tabsTop: seen(document.getElementById('semtabs')) ? Math.round(document.getElementById('semtabs').getBoundingClientRect().top) : null,
    scrollY: Math.round(scrollY)
  };
};

// report: the phone's list of steps, filled as they run (a throw between steps keeps the ones before it)
async function walk(d, site, dir, report) {
  let n = 0;
  // fn returns problems (strings) found in the measure; a thrown error is a step that could not run
  async function step(name, fn = async () => []) {
    const rec = { name };
    try {
      await fn(rec);
    } catch (e) {
      rec.error = e.message;
    }
    rec.measure = await d.js(MEASURE).catch((e) => ({ error: e.message }));
    rec.problems = rec.measure.error ? [`no measure: ${rec.measure.error}`] : rec.expect ? rec.expect(rec.measure).filter(Boolean) : [];
    delete rec.expect;
    await d.shot(path.join(dir, `${String(++n).padStart(2, '0')}-${name}.png`)).catch((e) => rec.problems.push(`no screenshot: ${e.message}`));
    report.push(rec);
    console.log(`  ${rec.error || rec.problems.length ? 'FAIL' : rec.skipped ? 'skip' : 'ok  '} ${name}${rec.note ? ` (${rec.note})` : ''}${rec.error ? `: ${rec.error}` : ''}${rec.problems.map((p) => `\n       ${p}`).join('')}`);
  }
  const fresh = async (items, query = '?design=a') => {
    await d.go(`${site}legal.html`);
    await d.js((items) => {
      localStorage.clear();
      sessionStorage.clear();
      for (const [k, v] of Object.entries(items)) localStorage.setItem(k, v);
    }, items);
    await d.go(site + query);
  };
  const student = { ...TOUR_SEEN, ...MODE_BUILD, [DESIGN_KEY]: 'a', ...DONE };
  const board = () => d.until(() => document.querySelector('#week .blk')?.getClientRects().length, 'the week', 60000);
  const dockOk = (want) => (m) => [m.dock !== want && `${m.dock} dock buttons, not ${want}`, !m.dockInside && 'a dock button is outside the visible screen', m.wide && 'the page scrolls sideways'];
  const fieldOk = (m) => [!m.keyboard && 'the keyboard did not open', m.focused && !m.focusFrame && `the field ${m.focused} is under the keyboard or outside the screen`];

  await fresh(student);
  await step('a1-board', async (r) => {
    await board();
    await d.dismissTip(path.join(dir, 'safari-start.xml'));
    r.expect = dockOk(5);
  });
  let first;
  await step('a2-courses-sheet', async (r) => {
    await d.tap('.dock [data-tool="courses"]');
    await d.until(() => document.querySelector('#panel #courses')?.getClientRects().length, 'the courses tool');
    r.expect = (m) => [!(m.sheetTop >= 25 && m.sheetTop <= 55) && `the sheet starts at ${m.sheetTop}% of the height, not about 40%`];
    first = (await d.js(MEASURE)).sheetTop;
  });
  await step('a2-expanded', async (r) => {
    await d.tap('#panel .a-sheet-expand');
    r.expect = (m) => [(m.sheetTop == null || m.sheetTop >= 20) && `expanded, the sheet starts at ${m.sheetTop}%`];
  });
  await step('a2-shrunk', async (r) => {
    await d.tap('#panel .a-sheet-expand');
    r.expect = (m) => [(m.sheetTop == null || first == null || Math.abs(m.sheetTop - first) > 3) && `shrunk back to ${m.sheetTop}%, it opened at ${first}%`];
  });
  await step('a18-help-and-more', async () => {
    await d.tap('#courses .a-help');
    await d.tap('#courses .a-course-more > summary');
  });
  await step('a19-course-rows', async () => d.js(() => document.querySelector('#courses .a-crs')?.scrollIntoView({ block: 'center', behavior: 'instant' })));
  await step('a20-search-typing', async (r) => {
    const all = await d.js(() => document.getElementById('courseQueryStatus')?.textContent.trim()); // the whole count, shown before any typing
    await d.tap('#courseQuery');
    r.typed = await d.type('30112', 'חיפוש קורס'); // a course code: digits are on every layout, also for key events (the simulator's is Hebrew)
    await d.until((all) => document.getElementById('courseQueryStatus')?.textContent.trim() !== all, 'the search count', 15000, all);
    r.expect = fieldOk;
  });
  await step('a20-search-cleared', async (r) => {
    await d.clearTyped();
    await d.closeKeyboard();
    r.expect = (m) => [m.keyboard && 'the keyboard is still open'];
  });
  await step('a2-closed', async (r) => {
    await d.tap('#panel [data-act="closeTool"]');
    r.expect = (m) => [m.sheetTop !== null && 'the sheet is still open', ...dockOk(5)(m)];
  });
  await step('a3-english-typing', async (r) => {
    await d.tap('.dock [data-tool="me"]');
    // the student's 134 out first (no event), or the keys would add to it; typed back the same, so the later steps keep the seeded student
    await d.js(() => (document.querySelector('#panel [data-k="amirnet"]').value = ''));
    await d.tap('#panel [data-k="amirnet"]');
    r.typed = await d.type('134', 'ציון אנגלית');
    r.expect = fieldOk;
  });
  await step('a21-wishes-more', async () => {
    await d.closeKeyboard();
    await d.tap('#panel [data-act="closeTool"]');
    await d.tap('.dock [data-tool="wishes"]');
    await d.tap('#prefs summary', 'עוד הגדרות');
  });
  await step('a21-not-before-picker', async () => d.tap('#prefs [data-k="notBefore"]'));
  await step('a4-scrolled-down', async (r) => {
    await d.closeKeyboard();
    await d.tap('#panel [data-act="closeTool"]');
    r.drag = await d.drag('#week', 0, -260);
    r.expect = dockOk(5);
  });
  let alt;
  await step('a5-swiped', async (r) => {
    await d.js(() => scrollTo(0, 0));
    alt = (await d.js(MEASURE)).alt;
    r.drag = await d.drag('#week', -160, 0);
    r.expect = (m) => [m.alt === alt && `the swipe did not change the option (${alt})`];
  });
  await step('a16-details-sort', async () => {
    await d.tap('#pills .a-details > summary');
    await d.tap('.a-sort-d select');
  });
  await step('a17-unofficial-details', async () => {
    await d.closeKeyboard();
    await d.tap('.a-unofficial button, .a-unofficial a', 'פרטים');
  });
  await step('a12-menu', async () => {
    await fresh(student);
    await board();
    await d.tap('.menu-btn');
  });
  let upright = false; // the phone did not turn: the "landscape" steps below run upright, and say so
  await step('a10-landscape', async (r) => {
    await fresh({ ...student, 'afeka-sched-v1-edit': JSON.stringify(EDIT) }); // a schedule in improve mode, for its sheets below
    await board();
    r.expect = dockOk(5); // turned or not, the board keeps its five tools
    try {
      await d.rotate('LANDSCAPE');
    } catch (e) {
      // runs 2-5: iOS 26's simulator never turned (WebDriverAgent, the Simulator's keys, Xcode 16.4 and 26.3); the landscape layout is in the WebKit
      // specs (widths-a: 844x390, 667x375), so this row is told as not checkable here, not failed. The next steps run upright.
      if (!/Unable To Rotate Device/.test(e.message)) throw e;
      r.skipped = 'the iOS simulator does not turn sideways';
      upright = true;
      return;
    }
    await d.until(() => innerWidth > innerHeight, 'the landscape layout');
  });
  await step('a10-landscape-tool', async (r) => {
    if (upright) r.note = 'upright';
    await d.tap('.dock [data-tool="courses"]');
  });
  await step('a11e-landscape-improve', async (r) => {
    if (upright) r.note = 'upright';
    // sideways the open tool and its scrim cover the header
    if (await d.js(() => !!document.querySelector('#panel [data-act="closeTool"]')?.getClientRects().length)) await d.tap('#panel [data-act="closeTool"]');
    await d.tap('.a-top .modes a[data-mode="edit"]');
    await d.until(() => document.getElementById('edit')?.getClientRects().length, 'the improve page');
    r.expect = dockOk(3);
  });
  await step('a11-improve', async (r) => {
    await d.rotate('PORTRAIT');
    await d.until(() => innerWidth < innerHeight, 'the portrait layout');
    r.expect = dockOk(3);
  });
  await step('a11a-changes-sheet', async () => d.tap('.dock [data-tool="changes"]'));
  await step('a11a-changes-closed', async () => d.tap('.edit-sheet-x'));
  // a first visit: the card, step by step, with one "חזרה" on the way
  await fresh({ ...TOUR_SEEN, ...MODE_BUILD, [DESIGN_KEY]: 'a' });
  await step('a13-first-card', async () => d.until(() => document.querySelector('[data-k="frTerms"]')?.getClientRects().length, 'the first card', 60000));
  await step('a13-step-2', async () => {
    await d.tap('[data-k="frTerms"]');
    await d.js(() => {
      const t = document.querySelector('[data-k="frTrack"]');
      if (t) (t.value = '30'), t.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await d.tap('[data-k="fr-year-2"]');
    await d.tap('[data-k="frStart"]');
  });
  await step('a13-step-3', async () => {
    await d.until(() => document.querySelector('[data-k="frNext"]')?.getClientRects().length, 'step 2 of the card', 30000); // frStart loads the program first
    await d.tap('[data-k="frNext"]');
  });
  await step('a13-back', async () => d.tap('[data-k="frBack"]'));
  const carding = () => d.js(() => document.getElementById('firstRun')?.hidden === false);
  for (let i = 0; i < 6 && (await carding()); i++) await step(`a13-next-${i + 1}`, async () => d.tap('[data-k="frNext"]'));
  await step('a13-board', async (r) => {
    // the new student (year 2, nothing marked passed) may get "לא נמצאה מערכת": the week's grid, not its blocks
    await d.until(() => document.getElementById('week')?.getClientRects().length, 'the week', 60000);
    r.expect = dockOk(5);
  });
}

const site = await startSite({ web: path.join(HERE, '..', '..', 'web'), frozen: path.join(HERE, '..', 'fixtures', 'real') });
const SITE = `http://127.0.0.1:${site.port}/`;
const report = [];
for (const [i, phone] of iphones().entries()) {
  const dir = path.join(OUT, phone.name.replace(/[^\w.-]+/g, '-'));
  await mkdir(dir, { recursive: true });
  console.log(`${phone.name} (iOS ${phone.version})`);
  const rec = { phone, steps: [] };
  report.push(rec);
  let d;
  try {
    d = await openSafari(phone, SITE, 8100 + i);
    try {
      await walk(d, SITE, dir, rec.steps);
    } catch (e) {
      if (rec.steps.length) throw e;
      // stuck before the first step (run 3: Safari's page took no script for 120s on a fresh Pro Max): what the screen showed, then once more
      console.log(`  stuck at the start (${e.message.slice(0, 120)}), once more`);
      await d.snapshot(path.join(dir, 'stuck'));
      await d.dismissTip(path.join(dir, 'stuck-tree.xml'), true);
      await d.snapshot(path.join(dir, 'stuck-after')); // what the clicks left
      await walk(d, SITE, dir, rec.steps);
    }
  } catch (e) {
    rec.error = e.message;
    console.log(`  FAIL ${e.message}`);
  } finally {
    await d?.end().catch(() => {});
    try {
      execFileSync('xcrun', ['simctl', 'shutdown', phone.udid]); // its WebDriverAgent and its memory go before the next phone builds its own
    } catch {}
  }
}
await site.close();
await writeFile(path.join(OUT, 'report.json'), JSON.stringify({ report, missing: [...site.missing] }, null, 2));
const failed = report.some((r) => r.error || r.steps.some((s) => s.error || s.problems.length)) || site.missing.size > 0;
if (site.missing.size) console.log(`not in the frozen copy: ${[...site.missing].join(', ')}`);
const skipped = report.flatMap((r) => r.steps.filter((s) => s.skipped).map((s) => `${r.phone.name} ${s.name}: ${s.skipped}`));
if (skipped.length) console.log(`not checked on the simulator (${skipped.length}):`, ...skipped.map((x) => `
  ${x}`));
process.exitCode = failed ? 1 : 0; // not process.exit: on macOS a piped stdout may still hold the last lines
