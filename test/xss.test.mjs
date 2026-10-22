// Every HTML string the UI writes must escape data: real data files with a markup payload in every text field,
// a fake DOM that records each innerHTML write, and a parse of what was written (see docs/superpowers/plans/2026-10-02-innerhtml-guard.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'node-html-parser';

const P = '<xss-t></xss-t>" onxss=1 \'';
const read = (n) =>
  JSON.parse(readFileSync(new URL(`../web/data/afeka/2027-${n}/30-2026.json`, import.meta.url), 'utf8'));
const TEXT_KEYS = new Set(['name', 'lecturer', 'room', 'label', 'title']);
const hostile = (v, key = '') =>(
  Array.isArray(v)
    ? v.map((x) => hostile(x, key))
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, hostile(x, k)]))
      : typeof v === 'string' && TEXT_KEYS.has(key)
        ? v + P
        : v);

// ---- fake DOM: elements record what is written; everything else is a no-op ----
const writes = []; // { id, html }
let scope = '';
const els = {};
const fake = (id) =>
  els[id] ??= {
    id,
    hidden: false,
    open: false,
    dataset: {},
    style: {},
    children: [],
    _h: '',
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    get innerHTML() {
      return this._h;
    },
    set innerHTML(html) {
      this._h = html;
      writes.push({ scope, id, html });
    },
    insertAdjacentHTML(_, html) {
      writes.push({ scope, id, html });
    },
    querySelector(sel) {
      return fake(sel.startsWith('#') ? sel.slice(1) : sel);
    },
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    removeAttribute() {},
    focus() {},
    showModal() {
      this.open = true;
    },
    show() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
    showPopover() {},
    hidePopover() {},
    matches: () => false,
    closest: () => null,
    contains: () => false,
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 0, height: 0, bottom: 0, right: 0 }),
    appendChild: (c) => c,
    remove() {},
    offsetHeight: 0,
    scrollIntoView() {},
  };
const app_ = await import('../web/app.js'); // before the stubs: app.js starts init() when it sees a document
globalThis.document = {
  getElementById: fake,
  createElement: (t) => fake(`<${t}>`),
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {},
  activeElement: null,
  body: { ...fake('body'), dataset: { view: 'plan' }, appendChild: (c) => c }
};
Object.assign(globalThis, {
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  CSS: { escape: (s) => s },
  getComputedStyle: () => ({ top: '0' }),
  innerHeight: 800,
  innerWidth: 1200,
  scrollBy() {},
  scrollTo() {},
  addEventListener() {}
});
const ls = { 'afeka-sched-v1-entry': '1' }; // step 1's entry choice made: the renders below get the regular page
globalThis.localStorage = {
  getItem: (k) => ls[k] ?? null,
  setItem: (k, v) => {
    ls[k] = String(v);
  },
  removeItem: (k) => {
    delete ls[k];
  }
};
globalThis.history = { replaceState() {} };
globalThis.location = { hash: '', origin: 'https://x', pathname: '/' };

const { app, normalize, refresh, yearCourses } = app_;
const { ui, current, gated, TERMS_VERSION, termsOk, acceptTerms } = await import('../web/ui-common.js');
ls['afeka-sched-v1-terms'] = TERMS_VERSION; // the terms were accepted: the renders below get the track question and the pages
const { renderTop, renderBanner, renderView, showAlt } = await import('../web/ui-view.js');
const { renderMe, identityPick } = await import('../web/ui-me.js');
const { renderSide, coursesSummary } = await import('../web/ui-side.js');
const { renderDrawer, renderPrefs, registrationText } = await import('../web/ui-drawer.js');
const { openPop, groupIndex, resCourses } = await import('../web/ui-grid.js');
const { openFriendEditor } = await import('../web/ui-friend-editor.js');
const { layoutMap, geometry } = await import('../web/map-layout.js');
const { mapSvg, miniHtml } = await import('../web/map-render.js');
await import('../web/ui-map.js'); // the dialog module loads without a browser too
const { searchYear } = await import('../web/solver-core.js');

// ---- hostile world ----
app.sem['א'] = hostile(read(1));
app.sem['ב'] = hostile(read(2));
app.sem['קיץ'] = hostile(read(3));
const gids = Object.values(app.sem['א'].courses).flatMap((c) => c.groups.map((g) => g.id));
app.catalog = {
  programs: [
    { id: 30, name: `a${P}`, startYears: [2026, 2025] },
    { id: 20, name: `b${P}`, startYears: [2026] }
  ]
}; // a hostile catalog: names reach the picker and the title
app.state = normalize({ v: 1, programSet: true });
Object.assign(app.state, { name: P, passed: app.sem['א'].lists.find((l) => l.name.includes("שנה א'")).courses }); // year 1 passed, as on a first visit
app.state.profile = { ...app.state.profile, year: 2, summer: true, amirnet: 120 };
app.state.friends = [
  { name: P, groups: gids.slice(0, 3), weight: 1, active: true, manual: true },
  { name: `${P}2`, groups: [P], weight: 2, active: false }
];
app.state.pins = [P, gids[0]]; // a stale pin with a hostile id, and a live one
app.state.constraints.lecturers = { [P]: 'avoid' }; // a hostile lecturer name reaches the drawer
app.friendLanding = { name: P, groups: [P, gids[1]] };
app.hashError = `${P} error`;
app.semNotice = `${P} notice`;
ui.friendMsg = `${P} friend`;
ui.friendUrl = P;
ui.gradeMsg = `${P} grades`;
refresh();
const searchNow = (ms) =>
  searchYear({
    dataA: app.sem['א'],
    dataB: app.sem['ב'],
    state: app.state,
    yearList: new Set(yearCourses()),
    pins: [],
    constraints: app.state.constraints,
    weights: app.state.weights,
    friends: app.state.friends.filter((f) => f.active),
    timeLimitMs: ms
  });
for (const id of Object.keys(app.data.courses).filter((id) => app_.candidateMode(id) === 'optional')) {
  // choose courses as long as a plan still exists
  app.state.choices[id] = 'must';
  if (!searchNow(150).results.length) delete app.state.choices[id];
}
refresh();
const mode = (id) => app_.candidateMode(id);
const courses = Object.keys(app.data.courses).filter((id) => ['must', 'optional'].includes(mode(id)));
const found = searchNow(1500);
ui.last = { ...found, ms: 3000 };
ui.cur = 0;

const run = (name, fn) => {
  scope = name;
  fn();
};
run('top', () => {
  renderTop();
});
run('banner', () => {
  renderBanner();
});
document.body.dataset.view = 'me';
run('me', () => {
  fake('me').hidden = false;
  renderMe();
});
document.body.dataset.view = 'plan';
run('picker', () => {
  writes.push({ scope: 'picker', id: 'pick', html: identityPick(2, true) });
});
run('view', () => {
  renderView();
});
run('side', () => {
  renderSide(current());
});
run('prefs-page', () => {
  renderPrefs();
});
run('drawer-reg', () => {
  ui.panel = 'reg';
  renderDrawer();
});
run('courses-top', () => {
  // the friend takes the shown plan's groups, so a friend line (with the hostile name) is written
  const res = current(),
    saved = app.state.friends[0].groups;
  app.state.friends[0].groups = [...(res.a?.groups ?? res.groups ?? [])].slice(0, 3);
  writes.push({ scope: 'courses-top', id: 'coursesTop', html: coursesSummary(current()) });
  app.state.friends[0].groups = saved;
});
run('pop', () => {
  const res = current();
  const gid = [...(res.a?.groups ?? res.groups ?? [])][0] ?? gids[0];
  openPop(
    {
      dataset: { gid },
      getBoundingClientRect: () => ({ top: 0, left: 0, width: 10, height: 10, bottom: 10, right: 10 })
    },
    {
      data: app.sem['א'],
      res: res.a ?? res,
      includeFull: false,
      pins: app.state.pins,
      friends: app.state.friends,
      colors: new Map(),
      lecturers: app.state.constraints.lecturers
    }
  );
});
run('map', () => {
  const L = layoutMap(app.data),
    html = mapSvg({
      data: app.data,
      st: app.cls.statuses,
      L,
      g: geometry(L, (id) => app.data.courses[id]?.credits),
      year: 2,
      unlocks: {},
      mode: 'all',
      plan: new Set()
    });
  writes.push({ scope: 'map', id: 'svg', html });
});
run('map-mini', () => {
  writes.push({
    scope: 'map-mini',
    id: 'mini',
    html: miniHtml({ raw: current(), sem: app.sem, data: app.data, colors: new Map(), k: 0, open: true })
  });
  writes.push({
    scope: 'map-mini',
    id: 'mini-ab',
    html: miniHtml({ raw: current(), sem: app.sem, data: app.data, colors: new Map(), k: 0, open: true, abbr: true })
  });
});
const { ACT } = await import('../web/ui-actions.js');
let printed = 0,
  afterprint = null,
  printChange = null,
  listeners = 0;
const root = {
  classList: {
    _s: new Set(),
    add(c) {
      this._s.add(c);
    },
    remove(c) {
      this._s.delete(c);
    },
    contains(c) {
      return this._s.has(c);
    }
  }
};
document.documentElement = root;
Object.assign(globalThis, {
  print: () => {
    printed++;
  },
  addEventListener: (t, fn) => {
    if (t === 'afterprint') {
      afterprint = fn;
      listeners++;
    }
  },
  matchMedia: (q) => ({
    matches: false,
    addEventListener: (t, fn) => {
      if (q === 'print') {
        printChange = fn;
        listeners++;
      }
    }
  })
});
run('advisor', () => {
  ACT.advisor();
});
run('friend-editor', () => {
  openFriendEditor({ friend: app.state.friends[0], onSave: () => null, returnFocusId: 'x' });
});

test('the search found plans, so the board and the registration list render real data', () => {
  assert.ok(
    courses.length > 0 && ui.last.results.length > 0 && current(),
    'no plan: the plan-dependent renderers were not exercised'
  );
});

test('every renderer got the payload and wrote it escaped (no element or on* attribute created from data)', () => {
  const scopes = [
    'top',
    'banner',
    'me',
    'picker',
    'view',
    'side',
    'prefs-page',
    'drawer-reg',
    'courses-top',
    'pop',
    'map',
    'map-mini',
    'friend-editor',
    'advisor'
  ];
  for (const s of scopes) {
    const mine = writes.filter((w) => w.scope === s);
    assert.ok(mine.length, `${s}: nothing written`);
    assert.ok(
      mine.some((w) => w.html.includes(s === 'top' ? '&lt;' : '&lt;xss-t&gt;')),
      `${s}: the payload never reached this renderer (coverage hole)`
    );
    for (const { id, html } of mine) {
      const root = parse(html);
      assert.equal(root.querySelectorAll('xss-t').length, 0, `${s} #${id}: injected element`);
      const bad = root
        .querySelectorAll('*')
        .filter((e) => Object.keys(e.attributes).some((a) => a === 'onxss' || /^on/i.test(a)));
      assert.equal(bad.length, 0, `${s} #${id}: injected attribute on <${bad[0]?.rawTagName}>`);
    }
  }
});

test('an unverified program says so in the header of both views (L3)', () => {
  app.data.verified = false;
  run('top-unverified', () => {
    renderTop();
  });
  const meta = writes.filter((w) => w.scope === 'top-unverified' && w.id === 'meta');
  assert.ok(meta.length && meta.at(-1).html.includes('לא נבדקו מול תוכנית הלימודים הרשמית'));
  delete app.data.verified;
  run('top-verified', () => {
    renderTop();
  });
  assert.ok(
    !writes
      .filter((w) => w.scope === 'top-verified' && w.id === 'meta')
      .at(-1)
      .html.includes('לא נבדקו')
  );
});

test('the header names no program until one is picked (a first visit assumes none)', () => {
  const title = (s) => writes.filter((w) => w.scope === s && w.id === 'title').at(-1).html;
  app.state.programSet = false;
  run('top-unset', () => {
    renderTop();
  });
  assert.ok(!title('top-unset').includes(' · a'), title('top-unset'));
  app.state.programSet = true;
  run('top-set', () => {
    renderTop();
  });
  assert.ok(title('top-set').includes(' · a'), title('top-set'));
});

test('a two-year program offers study years א׳ and ב׳ only (L6)', () => {
  const lists = app.data.lists;
  app.data.lists = lists.filter((l) => !/שנה [גד]'/.test(l.name));
  const html = identityPick(2, true);
  app.data.lists = lists;
  assert.ok(html.includes('ב׳') && !html.includes('ג׳') && !html.includes('ד׳'));
});

test('a program without specializations shows no specialization picker and no call to choose one (L7)', async () => {
  const { progressHtml } = await import('../web/map-render.js');
  const areas = app.data.specializations;
  app.data.specializations = [];
  document.body.dataset.view = 'me';
  run('me-noareas', () => {
    renderMe();
  });
  app.data.specializations = areas;
  const html = writes
    .filter((w) => w.scope === 'me-noareas')
    .map((w) => w.html)
    .join('');
  assert.ok(html.length && !html.includes('p-spec') && !html.includes('בוחרים התמחות'));
  const prog = { total: 100, done: 1, planned: 0, adds: 0, specLeft: null };
  assert.ok(!progressHtml({ prog, opened: 0, year: 3, specs: [], areas: 0 }).includes('בחרו התמחות'));
  assert.ok(progressHtml({ prog, opened: 0, year: 3, specs: [], areas: 2 }).includes('בחרו התמחות'));
});

test('a passed course has "נכשלתי בעבר": ticking counts one failure, unticking deletes it, failed then passed keeps the count', async () => {
  const { CHG } = await import('../web/ui-actions.js');
  const { setStatus } = await import('../web/rules.js');
  const id = app.state.passed.find((x) => !app.state.exempt?.includes(x) && !app.state.failed[x]);
  const card = (name) => {
    document.body.dataset.view = 'me';
    run(name, () => renderMe());
    const html = writes.filter((w) => w.scope === name).map((w) => w.html).join('');
    return parse(html).querySelector(`.crs:has(input[data-chg="failedBefore"][data-id="${id}"])`);
  };
  const box = (c) => c.querySelector('input[data-chg="failedBefore"]');
  let c = card('fb-none');
  assert.ok(c && !box(c).hasAttribute('checked') && !c.querySelector('[data-chg="failCount"]'), 'unticked, no count row');
  CHG.failedBefore({ checked: true, dataset: { id } });
  assert.equal(app.state.failed[id], 1);
  c = card('fb-on');
  assert.ok(box(c).hasAttribute('checked') && c.querySelectorAll('legend').at(-1).text === 'כמה פעמים?', 'ticked, titled count row');
  CHG.failedBefore({ checked: false, dataset: { id } });
  assert.ok(!(id in app.state.failed));
  setStatus(app.state, id, 'failed');
  app.state.failed[id] = 2;
  setStatus(app.state, id, 'passed');
  assert.equal(app.state.failed[id], 2, 'the count survives the switch to passed');
  delete app.state.failed[id];
  document.body.dataset.view = 'plan';
});

test('a friend name in the summary pills is escaped once, not twice (U1)', () => {
  const res = current(),
    saved = app.state.friends[0].groups;
  app.state.friends[0].groups = [...(res.a?.groups ?? res.groups ?? [])].slice(0, 3); // the friend takes the shown plan's groups
  run('view-u1', () => {
    renderView();
  });
  app.state.friends[0].groups = saved;
  const pills = writes
    .filter((w) => w.scope === 'view-u1' && w.id === 'pills')
    .map((w) => w.html)
    .join('');
  assert.ok(
    pills.includes('class="pill friend"'),
    'no friend pill: the plan shares no course with the friend (coverage hole)'
  );
  assert.ok(!/&amp;(lt|gt|quot|#39|amp);/.test(pills), 'double-escaped entity in the pills');
});

test('a friend link from another program says which one, escaped', () => {
  app.friendLanding = { name: 'דנה', program: 20, groups: [] };
  run('banner-other', () => {
    renderBanner();
  });
  const html = writes.filter((w) => w.scope === 'banner-other').at(-1).html;
  assert.match(html, /מתוכנית אחרת \(b&lt;xss-t/);
  app.friendLanding = { name: 'דנה', program: 30, groups: [] };
  run('banner-same', () => {
    renderBanner();
  });
  assert.ok(
    !writes
      .filter((w) => w.scope === 'banner-same')
      .at(-1)
      .html.includes('מתוכנית אחרת')
  );
  app.friendLanding = null;
});

test('one h1 per page: the views use h2 under the app title (a11y)', () => {
  for (const s of ['me', 'view', 'side', 'picker', 'prefs-page'])
    for (const w of writes.filter((x) => x.scope === s)) assert.ok(!w.html.includes('<h1'), `${s} #${w.id}`);
});

test('the preferences page offers a share button next to copy (WhatsApp)', () => {
  assert.ok(writes.filter((w) => w.scope === 'prefs-page').some((w) => w.html.includes('data-act="shareOut"')));
});

test('the status page has the degree checklist, one row per requirement', () => {
  const me = writes
    .filter((w) => w.scope === 'me')
    .map((w) => w.html)
    .join('');
  assert.ok(me.includes('data-key="checklist"') && /מתוך \d/.test(me));
});

test('the preferences page offers a campus-day cap', () => {
  assert.ok(writes.filter((w) => w.scope === 'prefs-page').some((w) => w.html.includes('data-chg="maxDays"')));
});

test('lecturer buttons in the popover and the preferences list (hostile names escaped above)', () => {
  assert.ok(writes.filter((w) => w.scope === 'pop').some((w) => w.html.includes('data-act="lecturer"')));
  assert.ok(writes.filter((w) => w.scope === 'prefs-page').some((w) => w.html.includes('data-act="lecturerDrop"')));
});

test('a later alternative says what changes against the first, escaped', () => {
  assert.ok(ui.last.results.length >= 2, 'the hostile world finds at least two alternatives');
  ui.cur = 1;
  run('view-2', () => {
    renderView();
  });
  ui.cur = 0;
  const html = writes
    .filter((w) => w.scope === 'view-2')
    .map((w) => w.html)
    .join('');
  assert.ok(html.includes('לעומת חלופה 1:'));
  assert.equal(parse(html).querySelectorAll('xss-t').length, 0);
});

test('the registration drawer offers the calendar export (the 2027 semesters have dates)', () => {
  const reg = writes
    .filter((w) => w.scope === 'drawer-reg')
    .map((w) => w.html)
    .join('');
  assert.ok(reg.includes('data-act="ics"') && !/data-act="ics"[^>]*disabled/.test(reg));
});

test('lecturer buttons only on a primary group: a tutorial’s lecturer is not filtered, so no promise there', () => {
  const sub = Object.values(app.sem['א'].courses)
    .flatMap((c) => c.groups)
    .find((g) => !g.primary && g.lecturer);
  assert.ok(sub, 'the data has a tutorial with a lecturer');
  run('pop-sub', () =>
    openPop(
      {
        dataset: { gid: sub.id },
        getBoundingClientRect: () => ({ top: 0, left: 0, width: 10, height: 10, bottom: 10, right: 10 })
      },
      { data: app.sem['א'], res: null, includeFull: false, pins: [], friends: [], colors: new Map(), lecturers: {} }
    )
  );
  assert.ok(!writes.filter((w) => w.scope === 'pop-sub').some((w) => w.html.includes('data-act="lecturer"')));
});

test('the plans step offers show-by with the four criteria', () => {
  const html = writes
    .filter((w) => w.scope === 'view')
    .map((w) => w.html)
    .join('');
  for (const v of ['best', 'credits', 'friends', 'unlocks']) assert.ok(html.includes(`value="${v}"`), v);
  assert.ok(html.includes('data-chg="sortBy"'));
});

test('show-by friends without an active friend points to step 3', () => {
  const { sortBy, friends } = app.state;
  const text = (s) =>
    writes
      .filter((w) => w.scope === s)
      .map((w) => w.html)
      .join('');
  app.state.sortBy = 'friends';
  app.state.friends = [];
  run('view-nofriends', () => {
    renderView();
  });
  app.state.friends = friends.map((f) => ({ ...f, active: false })); // friends exist, all hidden
  run('view-hidden', () => {
    renderView();
  });
  app.state.friends = friends; // an active friend: no line
  run('view-friends', () => {
    renderView();
  });
  app.state.sortBy = sortBy;
  assert.ok(text('view-nofriends').includes('אין עדיין חברים. אפשר להוסיף <a href="#prefs">בשלב 3</a>.'));
  assert.ok(text('view-hidden').includes('החברים מוסתרים. אפשר להציג אותם <a href="#prefs">בשלב 3</a>.'));
  assert.ok(!text('view-hidden').includes('אין עדיין חברים'));
  assert.ok(!text('view-friends').includes('אין עדיין חברים') && !text('view-friends').includes('החברים מוסתרים'));
});

test('step 2 says when the search found no plan, and links to step 4', () => {
  const last = ui.last,
    text = (s) =>
      writes
        .filter((w) => w.scope === s && w.id === 'coursesTop')
        .map((w) => w.html)
        .join('');
  ui.last = { results: [], partial: false, diagnosis: ['x'], ms: 3000 };
  run('side-noplan', () => {
    renderSide(null);
  });
  ui.last = { results: [], partial: true, diagnosis: [], ms: 3000 };
  run('side-partial', () => {
    renderSide(null);
  });
  ui.last = last;
  assert.equal(text('side-noplan'), 'לא נמצאה מערכת. הפרטים <a href="#">בשלב 4</a>.');
  assert.ok(text('side-partial').startsWith('החיפוש לא הספיק.'));
  assert.ok(!text('side').includes('לא נמצאה מערכת'), 'a plan: the summary line');
});

test('showAlt picks an alternative for the board and the map: planIds follow it and the map hook runs once', () => {
  assert.ok(ui.last.results.length > 1, 'the search found two alternatives');
  let calls = 0;
  ui.onShown = () => {
    calls++;
  };
  showAlt(1);
  assert.equal(ui.cur, 1);
  assert.deepEqual([...app.planIds].sort(), [...new Set(resCourses(ui.last.results[1]))].sort());
  assert.equal(calls, 1);
  ui.onShown = null;
  showAlt(0);
});

test('the opening screen asks one question at a time', () => {
  const me = (s, fn) => {
    fn();
    run(s, () => {
      renderMe();
    });
    return writes.filter((w) => w.scope === s && w.id === 'me').at(-1).html;
  };
  const year = app.state.profile.year,
    programs = app.catalog.programs,
    set = app.state.programSet;
  fake('me').hidden = false;
  document.body.dataset.view = 'me';
  const track = me('gate-track', () => {
    app.state.programSet = false;
  });
  assert.ok(track.includes('שאלה 1 מתוך 2') && track.includes('מה המסלול שלך?') && !track.includes('p-year'));
  assert.equal(parse(track).querySelectorAll('button[data-act="pickTrack"]').length, programs.length);
  assert.ok(!track.includes('<xss-t>'));
  const yr = me('gate-year', () => {
    app.state.programSet = true;
    app.state.profile.year = null;
  });
  assert.ok(
    yr.includes('שאלה 2 מתוך 2') &&
      yr.includes('באיזו שנה את/ה?') &&
      yr.includes('pickYear') &&
      yr.includes('data-act="gateTrack"') &&
      !yr.includes('pickTrack')
  );
  assert.ok(!yr.includes('<xss-t>'));
  const back = me('gate-back', () => {
    ui.gateTrack = true;
  });
  assert.equal(parse(back).querySelectorAll('button[data-act="pickTrack"]').length, programs.length); // buttons: re-picking the loaded track works
  const one = me('gate-one', () => {
    ui.gateTrack = false;
    app.catalog.programs = programs.slice(0, 1);
  });
  assert.ok(one.includes('pickYear') && !one.includes('מתוך 2') && !one.includes('gateTrack'));
  app.catalog.programs = programs;
  app.state.profile.year = year;
  app.state.programSet = set;
  document.body.dataset.view = 'plan';
});

test('step 1 asks for the grade sheet before the course list', () => {
  const me = (s, fn) => {
    fn();
    run(s, () => {
      renderMe();
    });
    return writes.filter((w) => w.scope === s && w.id === 'me').at(-1).html;
  };
  fake('me').hidden = false;
  document.body.dataset.view = 'me';
  const entry = me('entry', () => {
    delete ls['afeka-sched-v1-entry'];
  });
  for (const s of [
    'data-act="manualEntry"',
    'data-act="gradeImport"',
    'איך מסמנים מה עברתם?',
    'על מנת להתייחס לפטורים'
  ])
    assert.ok(entry.includes(s), s);
  assert.ok(!entry.includes('data-chg="status"') && !entry.includes('statusDone'));
  assert.equal(parse(entry).querySelectorAll('#gradeMsg').length, 1);
  assert.ok(!entry.includes('<xss-t>'));
  const regular = (html) =>
    html.includes('statusDone') && html.includes('data-chg="status"') && !html.includes('manualEntry');
  assert.ok(
    regular(
      me('entry-returning', () => {
        ls['afeka-sched-v1-onboarded'] = '1';
      })
    )
  ); // users from before this screen
  assert.ok(
    regular(
      me('entry-chosen', () => {
        delete ls['afeka-sched-v1-onboarded'];
        ls['afeka-sched-v1-entry'] = '1';
      })
    )
  );
  const ex = app.state.passed.find((id) => app.cls.statuses[id]?.status !== 'exempt'); // not an Amirnet exemption (that row is fixed already). an exemption from the grade sheet: the row says פטור instead of a grade field
  const tagged = parse(
    me('exempt-tag', () => {
      app.state.exempt = [ex];
    })
  )
    .querySelectorAll('.crs')
    .find((r) => r.innerHTML.includes(`data-id="${ex}"`));
  assert.ok(tagged.innerHTML.includes('פטור') && !tagged.querySelector('.grade'));
  app.state.exempt = [];
  document.body.dataset.view = 'plan';
});

test('the terms come before the first question', async () => {
  const me = (s, fn) => {
    fn();
    run(s, () => {
      renderMe();
    });
    return writes.filter((w) => w.scope === s && w.id === 'me').at(-1).html;
  };
  const programSet = app.state.programSet;
  fake('me').hidden = false;
  document.body.dataset.view = 'me';
  const terms = (html) => {
    const root = parse(html);
    assert.ok(html.includes('לפני שמתחילים') && !html.includes('מה המסלול שלך?') && !html.includes('<xss-t>'));
    for (const s of [
      'זה כלי עזר לתכנון בלבד. הוא לא רושם אתכם לקורסים: ההרשמה נעשית רק באפקה-נט.',
      'החלופות שהכלי מציג הן אפשרויות, לא המלצה.',
      'לפני ההרשמה מומלץ להתייעץ עם יועץ לימודים, במיוחד בכל חריגה מהמערכת המומלצת של המחלקה.',
      'קראתי והבנתי'
    ])
      assert.ok(html.includes(s), s);
    assert.equal(root.querySelectorAll('input[type="checkbox"][data-chg="termsTick"]').length, 1);
    assert.ok(root.querySelector('button[data-act="acceptTerms"]').hasAttribute('disabled'));
    assert.equal(root.querySelector('button[data-act="acceptTerms"]').text.trim(), 'המשך');
    assert.ok(root.querySelector('a[href="legal.html#terms"]') && root.querySelector('a[href="legal.html#scope"]'));
  };
  terms(
    me('terms-none', () => {
      delete ls['afeka-sched-v1-terms'];
      app.state.programSet = false;
    })
  );
  const landing = { name: 'x', groups: [] };
  app.friendLanding = landing;
  me('terms-landing', () => {});
  assert.ok(gated() && app.friendLanding === landing, 'a friend link waits in app.friendLanding while the gate shows');
  app.friendLanding = null;
  terms(
    me('terms-old', () => {
      ls['afeka-sched-v1-terms'] = '1';
    })
  );
  terms(
    me('terms-year', () => {
      ls['afeka-sched-v1-terms'] = '0';
      app.state.programSet = true;
    })
  ); // the year question waits too
  assert.ok(
    me('terms-ok', () => {
      ls['afeka-sched-v1-terms'] = TERMS_VERSION;
      app.state.programSet = false;
    }).includes('מה המסלול שלך?')
  );
  app.state.programSet = programSet;
  document.body.dataset.view = 'plan';

  const { CHG } = await import('../web/ui-actions.js'); // the tick enables the button without a re-render
  const btn = { disabled: true },
    box = { checked: true, closest: () => ({ querySelector: () => btn }) };
  assert.equal(CHG.termsTick(box), 'none');
  assert.equal(btn.disabled, false);
  box.checked = false;
  CHG.termsTick(box);
  assert.equal(btn.disabled, true);
});

test('storage that throws still lets the visitor through for this visit', () => {
  const real = globalThis.localStorage,
    saved = { ...ls };
  delete ls['afeka-sched-v1-terms'];
  const boom = () => {
    throw new Error('blocked');
  };
  globalThis.localStorage = { getItem: boom, setItem: boom, removeItem: boom };
  try {
    assert.equal(termsOk(), false);
    acceptTerms();
    assert.equal(termsOk(), true);
  } finally {
    globalThis.localStorage = real;
    Object.assign(ls, saved);
  }
});

test('"המשך" stores the acceptance and redraws', async () => {
  const { ACT } = await import('../web/ui-actions.js');
  delete ls['afeka-sched-v1-terms'];
  ACT.acceptTerms();
  assert.equal(ls['afeka-sched-v1-terms'], TERMS_VERSION);
});

test('the disclaimer under the pills links to the counselling page, escaped; without a URL it is plain text', () => {
  const html = (url) => {
    app.settings = { ...app.settings, counselingUrl: url };
    const n = writes.length;
    run('view-disclaimer', () => {
      renderView();
    });
    return writes
      .slice(n)
      .filter((w) => w.id === 'disclaimer')
      .map((w) => w.html)
      .join('');
  };
  assert.ok(html('').startsWith('אינו הרשמה') && !html('').includes('<a'));
  const a = parse(html('https://x.test/y?a=1&b="><xss-t>')).querySelectorAll('a');
  assert.equal(a.length, 1);
  assert.equal(a[0].getAttribute('href'), 'https://x.test/y?a=1&b="><xss-t>');
  assert.equal(a[0].getAttribute('rel'), 'noopener');
  assert.equal(parse(html('https://x.test/"><xss-t>')).querySelectorAll('xss-t').length, 0);
  app.settings = { ...app.settings, counselingUrl: '' };
});

test('registration turns: the label is escaped in the picker; the banner shows only for a listed turn whose time has passed since the fetch', () => {
  const keep = [app.settings, app.state.profile],
    turns = [{ id: 't1', label: '<xss-t>' + P, opensAt: '2020-01-01T08:00:00+02:00' }];
  const meHtml = (t) => {
    app.settings = { ...keep[0], turns: t };
    const n = writes.length;
    run('me-turn', () => {
      renderMe();
    });
    return writes
      .slice(n)
      .filter((w) => w.id === 'me')
      .map((w) => w.html)
      .join('');
  };
  const picker = parse(meHtml(turns)).querySelector('select[data-chg="turn"]');
  assert.equal(picker.querySelectorAll('option').length, 2);
  assert.equal(picker.querySelectorAll('xss-t').length, 0);
  assert.ok(picker.innerHTML.includes('&lt;xss-t&gt;'));
  assert.ok(!meHtml([]).includes('data-chg="turn"'), 'no turns, no picker');
  app.settings = { ...keep[0], turns };
  const banner = (turn) => {
    app.state.profile = { ...keep[1], turn };
    const n = writes.length;
    run('banner-turn', () => {
      renderBanner();
    });
    return writes
      .slice(n)
      .filter((w) => w.id === 'banner')
      .map((w) => w.html)
      .join('');
  };
  const saved = [app.status, ...['א', 'ב'].map((k) => app.sem[k]?.fetchedAt)];
  app.status = null;
  for (const k of ['א', 'ב']) if (app.sem[k]) app.sem[k].fetchedAt = '2019-12-31T00:00:00Z'; // the year view reads both files
  assert.ok(banner('t1').includes('הנתונים נמשכו לפני פתיחת התור שלך'));
  assert.ok(!banner('gone').includes('פתיחת התור'), 'a turn that is no longer listed warns about nothing');
  assert.ok(!banner(undefined).includes('פתיחת התור'));
  app.status = {
    checkedAt: '2020-06-01T00:00:00Z',
    ok: true,
    semesters: {
      [`${app.sem['א'].year}-1/${app.sem['א'].program}-${app.sem['א'].startYear}`]: {},
      [`${app.sem['ב'].year}-2/${app.sem['ב'].program}-${app.sem['ב'].startYear}`]: {}
    }
  };
  assert.ok(!banner('t1').includes('פתיחת התור'), 'a later check that covers both semesters: the data is current');
  app.status = saved[0];
  ['א', 'ב'].forEach((k, i) => {
    if (app.sem[k]) app.sem[k].fetchedAt = saved[i + 1];
  });
  [app.settings, app.state.profile] = keep;
});

test('a split alternative says so: the note on top of the week, the course names in the info line (escaped), the label', () => {
  const r = ui.last.results[0],
    id = resCourses(r)[0],
    name = (app.sem['א'].courses[id] ?? app.sem['ב'].courses[id]).name;
  const real = ui.last.results;
  ui.last = { ...ui.last, results: [{ ...r, split: [id] }, ...real.slice(1)] };
  const n = writes.length;
  run('view-split', () => {
    renderView();
  });
  const html = writes
    .slice(n)
    .map((w) => w.html)
    .join('');
  const week = parse(
    writes
      .slice(n)
      .filter((w) => w.id === 'week')
      .map((w) => w.html)
      .join('')
  );
  assert.ok(week.querySelector('.notice').text.includes('חלופה עם הפרדת הרצאה ותרגול (דורש אישור ההכוון האקדמי)'));
  const line = week
    .querySelectorAll('.split-line')
    .map((p) => p.text)
    .join('|');
  assert.ok(line.includes('מופרדים: ') && line.includes('· דורש אישור ההכוון') && line.includes(name), line);
  assert.ok(html.includes('&lt;xss-t&gt;') && parse(html).querySelectorAll('xss-t').length === 0);
  assert.match(els.altLabel.textContent, / · מופרדת$/);
  ui.last = { ...ui.last, results: real };
  renderView();
  assert.ok(!els.altLabel.textContent.includes('מופרדת') && !els.week.innerHTML.includes('הפרדת הרצאה ותרגול'));
});

test('a split course is marked in the registration list and in the copied text: "מופרד · דורש אישור ההכוון" (a pair marks the semester it is in)', () => {
  const real = ui.last.results,
    r = real[0],
    id = resCourses(r)[0];
  const mark = (x) =>(
    x.a
      ? {
          ...x,
          a: { ...x.a, split: x.a.courses.includes(id) ? [id] : [] },
          b: x.b && { ...x.b, split: x.b.courses.includes(id) ? [id] : [] },
          split: [id]
        }
      : { ...x, split: [id] });
  ui.last = { ...ui.last, results: [mark(r), ...real.slice(1)] };
  const n = writes.length;
  run('reg-split', () => {
    ui.panel = 'reg';
    renderDrawer();
  });
  const root = parse(
    writes
      .slice(n)
      .filter((w) => w.scope === 'reg-split')
      .map((w) => w.html)
      .join('')
  );
  const tags = root.querySelectorAll('.reglist .tag.warn');
  assert.equal(tags.length, 1, 'one row carries the mark');
  assert.equal(tags[0].text, 'מופרד · דורש אישור ההכוון');
  assert.equal(root.querySelectorAll('xss-t').length, 0);
  const lines = registrationText(current())
    .split('\n')
    .filter((l) => l.startsWith(`${id} `));
  assert.ok(lines.length && lines.every((l) => l.includes(' (מופרד · דורש אישור ההכוון): ')), lines.join('|'));
  assert.equal(
    registrationText(current()).split('דורש אישור ההכוון').length - 1,
    lines.length,
    'no other course is marked'
  );
  ui.last = { ...ui.last, results: real };
  const m = writes.length;
  run('reg-plain', () => {
    renderDrawer();
  });
  assert.ok(
    !writes.slice(m).some((w) => w.html.includes('דורש אישור ההכוון')) &&
      !registrationText(current()).includes('דורש אישור ההכוון')
  );
});

test('progress rank: a split alternative gets no rank pill and does not shift the regular ones (ranked among themselves)', () => {
  const real = ui.last.results,
    pill = (res, cur) => {
      ui.last = { ...ui.last, results: res };
      ui.cur = cur;
      const n = writes.length;
      run('rank', () => {
        renderView();
      });
      return writes
        .slice(n)
        .filter((w) => w.id === 'pills')
        .map((w) => w.html)
        .join('');
    };
  const withP = (x, p) =>(
    x.a
      ? {
          ...x,
          a: { ...x.a, breakdown: { ...x.a.breakdown, progress: p } },
          b: x.b && { ...x.b, breakdown: { ...x.b.breakdown, progress: p } }
        }
      : { ...x, breakdown: { ...x.breakdown, progress: p } });
  assert.ok(real.length >= 2, 'the data has two plans');
  const id = resCourses(real[0])[0];
  const [r0, r1] = [withP(real[0], 0.5), withP(real[1], 0.4)];
  const split = {
    ...withP(real[0], 0.99),
    split: [id],
    ...(real[0].a ? { a: { ...withP(real[0], 0.99).a, split: [id] } } : {})
  };
  const list = [r0, r1, split];
  assert.match(
    pill(list, 0),
    /מקדמת הכי הרבה בתואר/,
    'the best regular plan stays first even though the split one scores higher'
  );
  assert.match(pill(list, 1), /מקום 2 מתוך 2 בהתקדמות/, 'ranked among the 2 regular plans only');
  const last = pill(list, 2);
  assert.ok(!/בהתקדמות|מקדמת הכי/.test(last) && last.includes('class="pill'), 'the split alternative shows no rank');
  ui.last = { ...ui.last, results: real };
  ui.cur = 0;
  renderView();
});

test('the advisor summary fills #print, prints it alone and puts the page back when printing ends (afterprint or the print query turning off)', () => {
  const cls = root.classList;
  assert.equal(printed, 1);
  assert.ok(
    fake('print').hidden === false &&
      cls.contains('print-summary') &&
      fake('print').innerHTML.includes('סיכום לפגישה עם יועץ לימודים')
  );
  afterprint();
  assert.ok(fake('print').hidden === true && !cls.contains('print-summary'));
  ACT.advisor(); // a second click: listeners are not stacked, and the second signal clears too
  assert.equal(printed, 2);
  assert.equal(listeners, 2);
  assert.ok(cls.contains('print-summary'));
  printChange({ matches: true });
  assert.ok(cls.contains('print-summary'), 'entering print media changes nothing');
  printChange({ matches: false });
  assert.ok(fake('print').hidden === true && !cls.contains('print-summary'));
});

test('a stale summary state is cleared at the start of the next ACT.advisor, also when there is nothing to print', () => {
  const cls = root.classList;
  ACT.advisor();
  assert.ok(cls.contains('print-summary'));
  const last = ui.last;
  ui.last = null; // no alternative: nothing prints, but the leftovers are gone
  const n = printed;
  ACT.advisor();
  ui.last = last;
  assert.equal(printed, n);
  assert.ok(fake('print').hidden === true && !cls.contains('print-summary'));
});

test('the footer links to the counselling page only when settings give one (escaped by the DOM, https-validated upstream)', () => {
  const link = (url) => {
    app.settings = { ...app.settings, counselingUrl: url };
    renderTop();
    return [fake('counsel').hidden, fake('counselLink').href];
  };
  assert.deepEqual(link(''), [true, fake('counselLink').href]);
  assert.deepEqual(link('https://x.test/y'), [false, 'https://x.test/y']);
  app.settings = { ...app.settings, counselingUrl: '' };
});

test('remote notice: above every step, a red alert without a close button, escaped; absent when empty', () => {
  const keep = app.settings,
    banner = () => {
      const n = writes.length;
      run('banner-notice', () => {
        renderBanner();
      });
      return writes
        .slice(n)
        .filter((w) => w.id === 'notice')
        .map((w) => w.html)
        .join('');
    };
  app.settings = { ...keep, notice: '<xss-n>' + P };
  const html = banner(),
    first = parse(html).querySelector('.banner');
  assert.ok(
    first.classList.contains('err') && first.getAttribute('role') === 'alert' && first.text.includes('<xss-n>'),
    'the notice is the first banner'
  );
  assert.equal(first.querySelectorAll('button').length, 0, 'no close button');
  assert.ok(html.includes('&lt;xss-n&gt;') && parse(html).querySelectorAll('xss-n').length === 0);
  const page = readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
  assert.ok(
    page.indexOf('id="notice"') > 0 && page.indexOf('id="notice"') < page.indexOf('id="layout"'),
    'the notice sits above every step, outside the plans step'
  );
  const wrote = () => {
    const n = writes.length;
    run('banner-notice', () => {
      renderBanner();
    });
    return writes.slice(n).filter((w) => w.id === 'notice').length;
  };
  assert.equal(wrote(), 0, 'the same notice again: nothing rewritten, so a screen reader does not announce it twice');
  app.settings = { ...keep, notice: 'שונה' };
  assert.equal(wrote(), 1, 'a changed notice is written once');
  assert.equal(wrote(), 0);
  app.settings = { ...keep, notice: '' };
  assert.ok(!banner().includes('xss-n'));
  app.settings = keep;
});

test('conflict line on step 1: under the profile, escaped, only for this program and cohort', () => {
  const keep = app.settings,
    me = () => {
      const n = writes.length;
      run('me-conflict', () => {
        renderMe();
      });
      return writes
        .slice(n)
        .filter((w) => w.id === 'me')
        .map((w) => w.html)
        .join('');
    };
  const { program, startYear } = app.state;
  app.settings = {
    ...keep,
    programs: {
      [program]: {
        conflicts: [
          { cohorts: [startYear], text: '<xss-c>' + P },
          { cohorts: [startYear + 100], text: 'xss-other' }
        ]
      }
    }
  };
  const html = me(),
    line = parse(html).querySelector('.warn-text.hint');
  assert.ok(html.includes('&lt;xss-c&gt;') && parse(html).querySelectorAll('xss-c').length === 0);
  assert.ok(
    line.text.startsWith('יש סתירה בין המקורות הרשמיים לגבי ') && line.text.endsWith('. בדקו מול המחלקה.'),
    line.text
  );
  assert.ok(!html.includes('xss-other'));
  app.settings = keep;
  assert.ok(!me().includes('יש סתירה'));
});

test('approved line on step 1: "אושר על ידי המחלקה" with the day, in place of the unverified warning, only for this program and cohort', () => {
  const keep = app.settings,
    me = () => {
      const n = writes.length;
      run('me-approved', () => {
        renderMe();
      });
      return writes
        .slice(n)
        .filter((w) => w.id === 'me')
        .map((w) => w.html)
        .join('');
    };
  const { program, startYear } = app.data;
  app.settings = { ...keep, programs: { [program]: { approved: { [startYear]: '2026-03-05' } } } };
  const html = me();
  assert.ok(html.includes('אושר על ידי המחלקה, 5.3.2026'), 'the approved line shows the day as D.M.YYYY');
  assert.ok(!html.includes('עוד לא נבדקו מול תוכנית הלימודים'), 'no unverified warning once approved');
  app.settings = { ...keep, programs: { [program]: { approved: { [startYear + 1]: '2026-03-05' } } } };
  assert.ok(!me().includes('אושר על ידי המחלקה'), 'another cohort\'s approval does not show');
  app.settings = keep;
});

test('report a mistake: a real mailto link in the footer and the popover, only when supportEmail is set; the href is escaped', () => {
  const keep = app.settings,
    gid = gids[0],
    btn = {
      dataset: { gid },
      getBoundingClientRect: () => ({ top: 0, left: 0, width: 10, height: 10, bottom: 10, right: 10 })
    };
  const pop = () => {
    const n = writes.length;
    run('pop-report', () =>
      openPop(btn, {
        data: app.sem['א'],
        res: null,
        includeFull: false,
        pins: [],
        friends: [],
        colors: new Map(),
        lecturers: {}
      })
    );
    return writes
      .slice(n)
      .map((w) => w.html)
      .join('');
  };
  app.settings = { ...keep, supportEmail: '' };
  renderTop();
  assert.equal(fake('report').hidden, true);
  assert.ok(!pop().includes('mailto:'));
  app.settings = { ...keep, supportEmail: 'a"b@c.d?x=1&y=<2>' };
  renderTop();
  assert.equal(fake('report').hidden, false);
  assert.ok(fake('reportLink').href.startsWith('mailto:'));
  const html = pop(),
    a = parse(html).querySelector('a[href^="mailto:"]');
  assert.ok(a && a.text.includes('דיווח על טעות'), 'the popover link');
  assert.ok(
    !/mailto:[^"]*[<>]/.test(html) && a.getAttribute("href").startsWith("mailto:a%22b@c.d%3F"),
    "nothing breaks out of the attribute"
  );
  assert.ok(
    new URLSearchParams(a.getAttribute('href').split('?')[1]).get('body').includes('קבוצה'),
    'the group is filled in'
  );
  app.settings = keep;
});
