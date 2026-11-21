/* Shared engine for both prototypes: saved state, eligibility, a small real timetable search,
   record/progress math, exports and the fake importers. No UI here (see panels.js). */
'use strict';
window.LL = (() => {
  const D = window.LLDATA;
  const C = D.courses;
  const byName = {};
  for (const c of Object.values(C)) byName[c.name] = c;
  const G = {};
  for (const c of Object.values(C)) for (const g of c.groups) G[g.id] = g;

  const DAYS = ['', 'ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];
  const DAYL = ['', 'א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳'];
  const YEARS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳'];
  const LEVELS = ['לא חשוב', 'קצת', 'חשוב', 'חשוב מאוד'];
  const WISHES = [
    ['friends', 'ללמוד עם חברים'], ['progress', 'להתקדם בתואר'], ['freeDays', 'ימים חופשיים'],
    ['gaps', 'בלי חלונות'], ['hours', 'שעות נוחות'], ['exams', 'מבחנים מרווחים']
  ];
  const DEFAULT_W = { friends: 2, progress: 3, freeDays: 2, gaps: 2, hours: 1, exams: 1 };
  const OLD_W = { friends: 1, progress: 3, freeDays: 3, gaps: 1, hours: 1, exams: 0 };
  const PARALLEL = { '20816': '90904' }; // invented department rule: may be taken together
  const DEMO_MUST = ['30127', '30112', '90904', '30136'];

  const pad = n => String(n).padStart(2, '0');
  const hm = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
  // a time range inside Hebrew text: isolate it so it is not reversed (LRI ... PDI)
  const rng = (s, e) => '⁦' + hm(s) + '–' + hm(e) + '⁩';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const num = id => String(id).split('@')[0];
  const fmtDate = s => { if (!s) return '—'; const [d, t] = s.split(' '); const [y, m, dd] = d.split('-'); return `${+dd}.${+m}.${y}` + (t ? ' ' + t : ''); };
  const dateOf = s => new Date(s.slice(0, 10) + 'T00:00:00');
  const daysBetween = (a, b) => Math.round((dateOf(b) - dateOf(a)) / 864e5);

  /* ---------- state ---------- */
  let KEY = 'll-proto';
  let storageOk = true;
  const fresh = () => ({
    v: 1, terms: false, theme: 'auto', tourSeen: false,
    profile: { program: null, track: null, year: null },
    record: {}, english: { exam: 'אמירנט', score: null }, outside: {}, exceptions: {}, spec: null, recVer: 1,
    choices: {}, cap: 20, plan: { mode: 'sem', split: 'balanced', summer: false },
    prefs: {
      w: { ...DEFAULT_W }, wVer: 2, wNoticeSeen: false,
      daysOff: { days: [], strict: false }, hours: { from: 8, to: 20, strict: false }, maxDays: null,
      lect: { prefer: [], avoid: [] }, sameDayExams: false, includeFull: false, split: { on: false, ack: false }
    },
    busy: [], pins: [], friends: [], order: 'balanced', sem: 'א', altIdx: 0, budgetLevel: 0,
    improve: null, shareName: ''
  });
  let S = fresh();
  const listeners = [];

  function load(key) {
    KEY = key;
    try { const raw = localStorage.getItem(KEY); if (raw) S = Object.assign(fresh(), JSON.parse(raw)); }
    catch (e) { storageOk = false; }
    window.addEventListener('storage', e => { if (e.key === KEY) api.otherTab = true, emit(); });
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(S)); storageOk = true; }
    catch (e) { storageOk = false; }
  }
  function emit() { for (const f of listeners) f(); }
  // every change is saved at once; inputs that affect the timetables trigger a rebuild
  function set(fn, { rebuild = true } = {}) {
    fn(S); save();
    if (rebuild) { api.results = null; api.stale = true; scheduleCompute(); }
    emit();
  }

  /* ---------- record ---------- */
  const yearNum = () => S.profile.year || 1;
  function englishExempt(id) {
    const sc = +S.english.score || 0;
    if (id === '10110') return sc >= 120;
    if (id === '10111') return sc >= 134;
    return false;
  }
  function status(id) {
    const r = S.record[id];
    if (r && r.st && r.st !== 'none') return r.st;
    if (englishExempt(id)) return 'exempt';
    const c = C[id];
    if (r && r.st === 'none') return 'none';
    if (c.year && c.year < yearNum() && !c.english && !(r && r.st)) return 'pass-default';
    return 'none';
  }
  const isDone = id => ['pass', 'exempt', 'pass-default'].includes(status(id));
  const doneByName = (name, extra) => (byName[name] && isDone(byName[name].id)) || S.outside[name] || (extra && extra.has(name));

  function missingPrereqs(id, extra) {
    return C[id].prereqs.filter(alts => !alts.some(n => doneByName(n, extra)));
  }
  function eligibility(id, sem, extra) {
    const c = C[id];
    if (isDone(id)) return { kind: 'done' };
    if (!c.sems.includes(sem)) return { kind: 'notOffered', sems: c.sems };
    const miss = missingPrereqs(id, extra);
    if (!miss.length) return { kind: 'ok' };
    const par = PARALLEL[id];
    if (par && miss.every(alts => alts.includes(C[par].name))) return { kind: 'parallel', with: par };
    if (sem === 'א' && c.sems.includes('ב') && miss.every(alts => alts.some(n => byName[n] && byName[n].sems.includes('א') && !missingPrereqs(byName[n].id).length)))
      return { kind: 'afterA', miss };
    return { kind: 'blocked', miss };
  }
  function unlocks(id) {
    const name = C[id].name;
    return Object.values(C).filter(c => c.prereqs.some(alts => alts.includes(name))).length;
  }
  function openCourses(sem) {
    return Object.values(C).filter(c => c.groups.length && !isDone(c.id) && (c.year || 9) <= Math.max(2, yearNum()))
      .map(c => ({ c, el: eligibility(c.id, sem) }))
      .sort((a, b) => rankEl(a.el) - rankEl(b.el) || a.c.name.localeCompare(b.c.name, 'he'));
  }
  const rankEl = el => ({ ok: 0, parallel: 1, afterA: 2, blocked: 3, notOffered: 4 }[el.kind] ?? 5);
  function choice(id) {
    if (S.choices[id]) return S.choices[id];
    const failed = status(id) === 'fail';
    return { st: failed || DEMO_MUST.includes(id) ? 'must' : 'maybe', sem: 'auto', retake: failed };
  }

  function progress() {
    const y = yearNum();
    const prevIds = Object.values(C).filter(c => c.year && c.year < y);
    const prevReq = prevIds.reduce((a, c) => a + c.credits, 0);
    const prevDone = prevIds.filter(c => isDone(c.id)).reduce((a, c) => a + c.credits, 0);
    let wsum = 0, csum = 0, fails = [];
    for (const [id, r] of Object.entries(S.record)) {
      if (r.grade != null && r.grade !== '' && C[id] && C[id].credits) { wsum += +r.grade * C[id].credits; csum += C[id].credits; }
      if (r.st === 'fail' || r.earlierFail) fails.push({ id, n: r.fails || 1 });
    }
    const avg = csum ? wsum / csum : null;
    const pct = prevReq ? prevDone / prevReq : 1;
    const done = Object.values(C).filter(c => isDone(c.id)).reduce((a, c) => a + c.credits, 0);
    const groups = [];
    for (let yy = 1; yy <= 4; yy++) {
      const ids = Object.values(C).filter(c => c.year === yy);
      groups.push({ label: 'חובה שנה ' + YEARS[yy - 1], done: ids.filter(c => isDone(c.id)).reduce((a, c) => a + c.credits, 0), req: ids.reduce((a, c) => a + c.credits, 0) + (yy === 3 ? D.REQ.missingFromCatalog : 0) });
    }
    groups.push({ label: 'בחירה', done: 0, req: D.REQ.electives });
    groups.push({ label: 'התמחות' + (S.spec ? ' · ' + S.spec : ''), done: 0, req: D.REQ.spec });
    const warnings = [];
    if (avg != null && avg < 65) warnings.push({ lvl: 'high', t: `ממוצע ${avg.toFixed(1)} — מתחת ל-65, לפי התקנון עלול להוביל ללימודים על תנאי.` });
    for (const f of fails) if (f.n >= 2 && status(f.id) === 'fail') warnings.push({ lvl: 'high', t: `${C[f.id].name}: ${f.n} כישלונות. כישלון שלישי באותו קורס עלול להוביל להפסקת לימודים לפי התקנון.` });
    if (pct < 0.7) warnings.push({ lvl: 'high', t: `השלמת ${Math.round(pct * 100)}% מדרישות השנים הקודמות — פחות מ-70%.` });
    const prereqWarn = [];
    for (const id of Object.keys(C)) if (['pass', 'exempt'].includes(status(id)) && missingPrereqs(id).length)
      prereqWarn.push({ id, miss: missingPrereqs(id).map(a => a.join(' או ')), ok: !!S.exceptions[id] });
    return { prevReq, prevDone, pct, avg, done, total: D.REQ.total, groups, warnings, prereqWarn, missingCatalog: D.REQ.missingFromCatalog };
  }
  function cohort() {
    const p = D.PROGRAMS.find(x => x.id === S.profile.program);
    if (!p || !S.profile.year) return null;
    const start = 2026 - (S.profile.year - 1);
    const available = p.id === 'me';
    let sub = null;
    if (available && (start < 2024 || start > 2027)) sub = start < 2024 ? 2024 : 2027;
    return { p, start, available, sub, used: sub || start };
  }

  /* ---------- the search ---------- */
  function optionsFor(cid, sem, P, ctx = {}) {
    const gs = C[cid].groups.filter(g => g.sem === sem);
    const mains = gs.filter(g => !g.parent), subs = gs.filter(g => g.parent);
    const out = [];
    for (const m of mains) {
      const own = subs.filter(s => m.links.includes(s.id));
      out.push(mkOpt(cid, m, own, false));
      if (P.split.on && m.links.length) for (const s of subs) if (!m.links.includes(s.id)) out.push(mkOpt(cid, m, [s], true));
    }
    return out.filter(o => allowed(o, P, ctx));
  }
  function mkOpt(c, main, subs, split) {
    const parts = [main, ...subs];
    return { c, main, subs, split, key: parts.map(g => g.id).join('+'), parts, full: parts.some(g => g.full),
      meet: parts.flatMap(g => g.meetings.map(m => ({ ...m, g }))) };
  }
  function whyNot(o, P, ctx = {}) {
    const pin = (ctx.pins || []).find(p => G[p] && G[p].course === o.c);
    if (pin && !o.parts.some(g => g.id === pin)) return 'pin';
    if (o.full && !P.includeFull && !pin && !(ctx.keepFull && o.parts.every(g => !g.full || ctx.keepFull.has(g.id)))) return 'full';
    for (const m of o.meet) {
      for (const b of ctx.busy || []) if (b.d === m.d && m.s < b.e && b.s < m.e) return 'busy:' + (b.label || 'זמן חסום');
      if (P.daysOff.strict && P.daysOff.days.includes(m.d)) return 'dayoff';
      if (P.hours.strict && (m.s < P.hours.from * 60 || m.e > P.hours.to * 60)) return 'hours';
    }
    if (ctx.lect !== false) {
      const L = o.main.lecturer;
      if (P.lect.avoid.includes(L)) return 'avoid';
      const preferred = C[o.c].groups.some(g => !g.parent && P.lect.prefer.includes(g.lecturer));
      if (preferred && !P.lect.prefer.includes(L)) return 'prefer';
    }
    return null;
  }
  const allowed = (o, P, ctx) => !whyNot(o, P, ctx);
  const clash = (o, meets) => o.meet.some(m => meets.some(x => x.d === m.d && m.s < x.e && x.s < m.e));
  const examKey = (c, g) => g.exam ? g.exam + ' ' + (D.EXAM_HOUR[c] || '09:00') : null;

  function metrics(sel, P, friends) {
    const byDay = {};
    for (const o of sel) for (const m of o.meet) (byDay[m.d] = byDay[m.d] || []).push(m);
    for (const b of S.busy) (byDay[b.d] = byDay[b.d] || []);
    let gaps = 0, early = 0, wishDays = 0, wishHours = 0;
    const lessonDays = Object.keys(byDay).filter(d => byDay[d].length).map(Number);
    for (const d of lessonDays) {
      const ms = byDay[d].slice().sort((a, b) => a.s - b.s);
      for (let i = 1; i < ms.length; i++) gaps += Math.max(0, ms[i].s - ms[i - 1].e - 10);
      for (const m of ms) {
        early += Math.max(0, 9 * 60 - m.s) + Math.max(0, m.e - 18 * 60);
        if (!P.hours.strict) wishHours += Math.max(0, P.hours.from * 60 - m.s) + Math.max(0, m.e - P.hours.to * 60);
      }
      if (!P.daysOff.strict && P.daysOff.days.includes(d)) wishDays++;
    }
    let shared = 0, sharedW = 0;
    const sharedBy = {};
    for (const o of sel) for (const g of o.parts) {
      const fs = friends.filter(f => f.show && f.groups.some(x => num(x) === num(g.id)));
      if (fs.length) { shared++; sharedW += fs.reduce((a, f) => a + 1 + f.weight, 0); sharedBy[g.id] = fs.map(f => f.name); }
    }
    const credits = sel.reduce((a, o) => a + C[o.c].credits, 0);
    const unl = sel.reduce((a, o) => a + unlocks(o.c), 0);
    const progressCr = sel.filter(o => (C[o.c].year || 9) <= yearNum()).reduce((a, o) => a + C[o.c].credits, 0);
    const exams = sel.map(o => ({ c: o.c, date: o.main.exam, hour: D.EXAM_HOUR[o.c] || null })).filter(e => e.date).sort((a, b) => a.date.localeCompare(b.date));
    let minGap = 30, sameDay = 0, adjacent = 0;
    for (let i = 1; i < exams.length; i++) {
      const g = daysBetween(exams[i - 1].date, exams[i].date);
      minGap = Math.min(minGap, g); if (g === 0) sameDay++; if (g === 1) adjacent++;
    }
    const w = P.w;
    const score = w.friends * sharedW * 1.2 + w.progress * progressCr * 0.5 + w.freeDays * (6 - lessonDays.length) * 3
      - w.gaps * gaps / 60 * 1.6 - w.hours * early / 60 * 1.2 + w.exams * Math.min(minGap, 7) * 0.6 - wishDays * 6 - wishHours / 60 * 2;
    return { credits, days: lessonDays.sort(), gapH: gaps / 60, shared, sharedBy, unlocks: unl, exams, sameDay, adjacent, score, early };
  }

  /* Exhaustive depth-first search with a node budget; keeps the best 10 plans. */
  function search({ sem, courses, cap, P, pins, friends, budget, lect = true, keepFull = null, maxDays = P.maxDays, extraBusy = [], extra = null }) {
    const ctx = { pins, busy: S.busy.concat(extraBusy), lect, keepFull };
    const list = courses.map(x => ({ ...x, opts: optionsFor(x.id, sem, P, ctx), pinned: (pins || []).some(p => G[p] && G[p].course === x.id && G[p].sem === sem) }))
      .sort((a, b) => (a.st === 'must' ? 0 : 1) - (b.st === 'must' ? 0 : 1) || a.opts.length - b.opts.length);
    const top = [];
    let nodes = 0, cut = false;
    const sel = [], meets = [], exams = new Set(), examDates = new Set();
    function leaf() {
      for (const o of sel) { const p = PARALLEL[o.c]; if (p && !sel.some(x => x.c === p) && !isDone(p) && !(extra && extra.has(C[p].name))) return; }
      const miss = list.filter(x => x.st === 'must' && !sel.some(o => o.c === x.id));
      const m = metrics(sel, P, friends);
      const key = sel.map(o => o.key).sort().join('|');
      if (top.some(t => t.key === key)) return;
      top.push({ sel: sel.slice(), m, miss: miss.map(x => x.id), key, split: sel.some(o => o.split) });
      top.sort(cmp); if (top.length > 10) top.pop();
    }
    function dfs(i, credits) {
      if (++nodes > budget) { cut = true; return; }
      if (i === list.length) return leaf();
      const x = list[i], cr = C[x.id].credits;
      if (credits + cr <= cap) for (const o of x.opts) {
        if (clash(o, meets)) continue;
        const ek = examKey(o.c, o.main), ed = o.main.exam;
        if (ek && exams.has(ek)) continue;
        if (ed && P.sameDayExams && examDates.has(ed)) continue;
        if (maxDays) { const ds = new Set(meets.map(m => m.d).concat(o.meet.map(m => m.d))); if (ds.size > maxDays) continue; }
        sel.push(o); meets.push(...o.meet); if (ek) exams.add(ek); if (ed) examDates.add(ed);
        dfs(i + 1, credits + cr);
        sel.pop(); meets.length -= o.meet.length; if (ek) exams.delete(ek); if (ed && !sel.some(s => s.main.exam === ed)) examDates.delete(ed);
        if (cut) return;
      }
      if (!x.pinned) dfs(i + 1, credits);
    }
    const order = S.order;
    function cmp(a, b) {
      if (a.split !== b.split) return a.split ? 1 : -1;
      if (a.miss.length !== b.miss.length) return a.miss.length - b.miss.length;
      if (order === 'credits' && a.m.credits !== b.m.credits) return b.m.credits - a.m.credits;
      if (order === 'friends' && a.m.shared !== b.m.shared) return b.m.shared - a.m.shared;
      if (order === 'unlocks' && a.m.unlocks !== b.m.unlocks) return b.m.unlocks - a.m.unlocks;
      return b.m.score - a.m.score;
    }
    dfs(0, 0);
    return { alts: top, cut, nodes, list };
  }

  const BUDGETS = [3000, 15000, 80000];
  function inputs(sem, extra, skip) {
    return openCourses(sem).filter(({ c }) => !(skip && skip.has(c.id))).map(({ c }) => ({ id: c.id, el: eligibility(c.id, sem, extra), ch: choice(c.id) }))
      .filter(x => ['ok', 'parallel'].includes(x.el.kind) && x.ch.st !== 'no' && (x.ch.sem === 'auto' || x.ch.sem === sem))
      .map(x => ({ id: x.id, st: x.ch.st }));
  }
  function solveSem(sem, cap, extra, budget, skip) {
    const P = S.prefs;
    const courses = inputs(sem, extra, skip);
    const base = { sem, courses, cap, P, pins: S.pins, friends: S.friends, budget, extra };
    let r = search(base), fallback = false;
    if ((P.lect.prefer.length || P.lect.avoid.length) && (!r.alts.length || r.alts[0].miss.length)) {
      const r2 = search({ ...base, lect: false });
      if (r2.alts.length && (!r.alts.length || r2.alts[0].miss.length < r.alts[0].miss.length)) { r = r2; fallback = true; }
    }
    return { ...r, fallback, courses };
  }

  function compute() {
    const budget = BUDGETS[S.budgetLevel] || BUDGETS[0];
    const out = { mode: S.plan.mode, at: Date.now(), budgetLevel: S.budgetLevel, notes: [] };
    if (!S.profile.program) return { ...out, error: 'no-profile' };
    if (S.plan.mode === 'sem') {
      const r = solveSem('א', S.cap, null, budget);
      Object.assign(out, { alts: r.alts.map(a => ({ A: a })), cut: r.cut, fallback: r.fallback, courses: r.courses });
    } else {
      const lo = Math.max(6, S.cap - 3);
      const caps = { moreA: [S.cap, lo], balanced: [S.cap, S.cap], moreB: [lo, S.cap] }[S.plan.split];
      const ra = solveSem('א', caps[0], null, budget);
      const pairs = [];
      for (const a of ra.alts.slice(0, 6)) {
        const extra = new Set(a.sel.map(o => C[o.c].name));
        const taken = new Set(a.sel.map(o => o.c));
        const rb = solveSem('ב', caps[1], extra, Math.floor(budget / 4), taken);
        const b = rb.alts[0] || null;
        const missReq = Object.values(C).filter(c => c.year && c.year <= yearNum() && !isDone(c.id) && choice(c.id).st === 'must'
          && !taken.has(c.id) && !(b && b.sel.some(o => o.c === c.id))).map(c => c.id);
        pairs.push({ A: a, B: b, missReq, score: a.m.score + (b ? b.m.score : 0) });
      }
      pairs.sort((x, y) => x.missReq.length - y.missReq.length || y.score - x.score);
      const bPinsLost = S.pins.filter(p => G[p] && G[p].sem === 'ב' && pairs[0] && !(pairs[0].B && pairs[0].B.sel.some(o => o.parts.some(g => g.id === p))));
      if (bPinsLost.length) out.notes.push('נעיצה בסמסטר ב׳ לא נשמרה ושוחררה: ' + bPinsLost.map(p => C[G[p].course].name + ' ' + num(p)).join(', '));
      Object.assign(out, { alts: pairs, cut: ra.cut, fallback: ra.fallback, courses: ra.courses });
    }
    // a plan with no lessons in any semester is not an alternative ("no result" with a reason),
    // unless summer is planned on top of it
    const kept = out.alts.filter(p => p.A.sel.length || (p.B && p.B.sel.length));
    if (S.plan.summer) out.summer = solveSummer(kept[S.altIdx] || kept[0] || out.alts[0]);
    out.alts = kept.length || !out.summer ? kept : out.alts.slice(0, 1);
    if (!out.alts.length) out.reason = diagnose(out.courses || []);
    return out;
  }
  function solveSummer(pair) {
    const taken = new Set();
    if (pair) for (const k of ['A', 'B']) if (pair[k]) for (const o of pair[k].sel) taken.add(o.c);
    const courses = Object.values(C).filter(c => c.sems.includes('קיץ') && !isDone(c.id) && !taken.has(c.id))
      .filter(c => choice(c.id).st !== 'no').map(c => ({ id: c.id, st: choice(c.id).sem === 'קיץ' ? 'must' : choice(c.id).st }));
    const r = search({ sem: 'קיץ', courses, cap: 10, P: S.prefs, pins: S.pins, friends: S.friends, budget: 5000 });
    return r.alts.find(a => a.sel.length) || null;
  }
  function diagnose(courses) {
    const P = S.prefs;
    const pinA = S.pins.filter(p => Object.hasOwn(G, p) && G[p].sem === 'א');
    for (let i = 0; i < pinA.length; i++) for (let j = i + 1; j < pinA.length; j++)
      if (G[pinA[i]].meetings.some(m => G[pinA[j]].meetings.some(x => x.d === m.d && m.s < x.e && x.s < m.e)))
        return `הנעיצות של ${C[G[pinA[i]].course].name} ו${C[G[pinA[j]].course].name} חופפות בזמן. צריך לבטל אחת מהן.`;
    const pinC = [...new Set(pinA.map(p => G[p].course))];
    const pinCr = pinC.reduce((a, c) => a + C[c].credits, 0);
    if (pinCr > S.cap) return `הקורסים הנעוצים (${pinC.map(c => C[c].name).join(', ')}) שווים ${pinCr} נ"ז — יותר מתקרת ${S.cap}. אפשר להעלות את התקרה או לבטל נעיצה.`;
    for (const p of S.pins) if (G[p] && G[p].sem === 'א') {
      const o = optionsFor(G[p].course, 'א', { ...P, includeFull: true }, { lect: false }).find(x => x.parts.some(g => g.id === p));
      const why = o && whyNot(o, P, { busy: S.busy, pins: [] });
      if (why) return `הנעיצה של ${C[G[p].course].name} (קבוצה ${num(p)}) לא עומדת בכללים (${why === 'full' ? 'הקבוצה מלאה' : why.startsWith('busy') ? 'זמן חסום' : why === 'dayoff' ? 'יום חופש' : why === 'hours' ? 'חלון שעות' : 'מרצה'}). אפשר לבטל את הנעיצה.`;
    }
    for (const x of courses) if (x.st === 'must') {
      const all = optionsFor(x.id, 'א', { ...P, includeFull: true, split: { on: false } }, { lect: false });
      const reasons = all.map(o => whyNot(o, P, { pins: S.pins, busy: S.busy }));
      if (!reasons.length) return `${C[x.id].name} (חובה): כל הקבוצות נפסלות בכללים הקשיחים (ימי חופש או חלון שעות).`;
      if (reasons.every(Boolean)) {
        const r = reasons[0];
        const why = r === 'full' ? 'כל הקבוצות מלאות' : r.startsWith('busy') ? 'כל הקבוצות נופלות על זמן חסום (' + r.slice(5) + ')' : r === 'dayoff' ? 'כל הקבוצות ביום החופש שקבעת ככלל' : r === 'hours' ? 'כל הקבוצות מחוץ לחלון השעות הקשיח' : 'הנעיצה לא מתאימה';
        return `${C[x.id].name} (חובה): ${why}.`;
      }
    }
    if (P.maxDays) return `אין שילוב שנכנס ב-${P.maxDays} ימים בקמפוס.`;
    return 'אין שילוב בלי התנגשויות שעומד בכל הכללים הקשיחים.';
  }

  /* why a course was left out of one plan */
  function leftOut(alt, courses, sem = 'א', cap = S.cap) {
    const inPlan = new Set(alt.sel.map(o => o.c));
    const meets = alt.sel.flatMap(o => o.meet);
    const used = alt.sel.reduce((a, o) => a + C[o.c].credits, 0);
    return courses.filter(x => !inPlan.has(x.id)).map(x => {
      const c = C[x.id];
      const opts = optionsFor(x.id, sem, S.prefs, { pins: S.pins, busy: S.busy });
      let why = null;
      if (!opts.length) why = 'אין קבוצה שעומדת בכללים (מלאה / זמן חסום / חלון שעות)';
      else if (used + c.credits > cap) why = `חורג מתקרת ${cap} נ"ז`;
      else {
        const free = opts.find(o => !clash(o, meets));
        if (!free) {
          const hit = alt.sel.find(o => clash(opts[0], o.meet));
          why = hit ? 'מתנגש עם ' + C[hit.c].name : 'מתנגש עם קורס אחר';
        } else if (examKey(x.id, free.main) && alt.sel.some(o => examKey(o.c, o.main) === examKey(x.id, free.main))) why = 'מבחן מועד א׳ באותו תאריך ושעה';
        else why = null;
      }
      return { id: x.id, name: c.name, credits: c.credits, must: x.st === 'must', why };
    });
  }
  function diff(a, b) {
    const ma = Object.fromEntries(a.sel.map(o => [o.c, o])), mb = Object.fromEntries(b.sel.map(o => [o.c, o]));
    const out = [];
    for (const c in mb) if (!ma[c]) out.push({ t: 'add', c }); else if (ma[c].key !== mb[c].key) out.push({ t: 'move', c, from: ma[c], to: mb[c] });
    for (const c in ma) if (!mb[c]) out.push({ t: 'out', c });
    return out;
  }
  function probe() {
    const o = S.order; S.order = 'credits';
    const base = solveSem('א', S.cap, null, BUDGETS[1]).alts[0];
    const more = solveSem('א', S.cap + 1, null, BUDGETS[1]).alts[0];
    S.order = o;
    if (!more) return { add: [] };
    const have = new Set((base ? base.sel : []).map(o => o.c));
    return { add: more.sel.filter(o => !have.has(o.c)).map(o => o.c), credits: more.m.credits };
  }

  let timer = null;
  function scheduleCompute(delay = 450) {
    clearTimeout(timer);
    if (!S.terms || !S.profile.program) return;
    api.computing = true; emit();
    timer = setTimeout(() => {
      try {
        if (api.forceError) throw new Error('demo');
        api.results = compute(); api.error = null;
      } catch (e) { api.error = 'החישוב נכשל. הנתונים שלך שמורים — נסו שוב.'; api.results = null; }
      api.computing = false; api.stale = false;
      if (S.altIdx >= ((api.results && api.results.alts) || []).length) S.altIdx = 0;
      emit();
    }, delay + 650);
  }

  /* ---------- exports ---------- */
  const planOf = r => r && r.alts && r.alts[S.altIdx];
  function semSel(pair, sem) { if (!pair) return []; if (sem === 'ב') return pair.B ? pair.B.sel : []; if (sem === 'קיץ') return (api.results.summer || { sel: [] }).sel; return pair.A.sel; }
  function registrationText(pair, sem = 'א') {
    const sel = semSel(pair, sem);
    if (!sel.length) return '';
    const meets = sel.flatMap(o => o.meet);
    const lines = [`רשימת הרשמה · סמסטר ${sem} · תוכנית בלבד — ההרשמה עצמה באפקה-נט`, `זמינות מקומות נקראה: ${fmtDate(D.SEATS_READ)}`, ''];
    for (const o of sel) {
      const c = C[o.c];
      lines.push(`${c.name} (${c.id}) · ${c.credits} נ"ז`);
      for (const g of o.parts) lines.push(`  ${g.kind === 'lec' ? 'הרצאה' : g.kind === 'lab' ? 'מעבדה' : 'תרגול'}: ${num(g.id)}`);
      const others = meets.filter(m => !o.meet.includes(m));
      const eq = optionsFor(o.c, sem, { ...S.prefs, includeFull: true }, { lect: false }).filter(x => x.key !== o.key && x.meet.length === o.meet.length && x.meet.every((m, i) => m.d === o.meet[i].d && m.s === o.meet[i].s));
      if (eq.length) lines.push('  קבוצות שוות באותן שעות: ' + eq.map(x => num(x.main.id)).join(', '));
      const backups = optionsFor(o.c, sem, S.prefs, { lect: false }).filter(x => x.key !== o.key && !clash(x, others));
      lines.push('  גיבוי אם הקבוצה תתמלא: ' + (backups.length ? backups.map(x => x.parts.map(g => num(g.id)).join('+')).join(', ') : 'אין קבוצה אחרת שמתאימה'));
      if (o.split) lines.push('  ⚠ הרצאה ותרגול מקבוצות שונות — דורש אישור ייעוץ');
      lines.push(`  בקטלוג: קורס ${c.id}`);
    }
    lines.push('', 'מבחנים (מועד א׳):');
    for (const o of sel) if (o.main.exam) lines.push(`  ${fmtDate(o.main.exam)}${D.EXAM_HOUR[o.c] ? ' ' + D.EXAM_HOUR[o.c] : ''} · ${C[o.c].name}`);
    return lines.join('\n');
  }
  function ics(pair, sem = 'א') {
    if (!D.CALENDARS[sem]) return { error: `לוח השנה של סמסטר ${sem} עוד לא פורסם, אז אי אפשר לייצא ליומן.` };
    const sel = semSel(pair, sem);
    const start = sem === 'א' ? new Date('2026-11-01T00:00:00') : new Date('2027-03-14T00:00:00');
    const until = sem === 'א' ? '20270129T235900' : '20270625T235900';
    const stamp = '20261120T083000';
    const f = d => d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//lets-learn proto//HE', 'CALSCALE:GREGORIAN'];
    let n = 0;
    for (const o of sel) for (const m of o.meet) {
      const d = new Date(start); d.setDate(d.getDate() + m.d - 1);
      L.push('BEGIN:VEVENT', `UID:p${++n}@proto`, `DTSTAMP:${stamp}`, `DTSTART:${f(d)}T${hm(m.s).replace(':', '')}00`, `DTEND:${f(d)}T${hm(m.e).replace(':', '')}00`,
        `RRULE:FREQ=WEEKLY;UNTIL=${until}`, ...D.HOLIDAYS.map(h => `EXDATE:${h.replace(/-/g, '')}T${hm(m.s).replace(':', '')}00`),
        `SUMMARY:${C[o.c].name} · ${m.g.kind === 'lec' ? 'הרצאה' : m.g.kind === 'lab' ? 'מעבדה' : 'תרגול'}`, `LOCATION:${m.g.room}`, 'END:VEVENT');
    }
    for (const o of sel) if (o.main.exam) {
      const h = (D.EXAM_HOUR[o.c] || '09:00').replace(':', '');
      const end = pad(+h.slice(0, 2) + 3) + h.slice(2);
      L.push('BEGIN:VEVENT', `UID:e${++n}@proto`, `DTSTAMP:${stamp}`, `DTSTART:${o.main.exam.replace(/-/g, '')}T${h}00`, `DTEND:${o.main.exam.replace(/-/g, '')}T${end}00`,
        `SUMMARY:מבחן מועד א׳ · ${C[o.c].name}`, 'DESCRIPTION:שעת סיום משוערת — אורך המבחן לא פורסם', 'END:VEVENT');
    }
    L.push('END:VCALENDAR');
    return { text: L.join('\r\n'), events: n };
  }
  function advisorText(pair) {
    const pr = progress(), co = cohort();
    const L = ['סיכום ליועץ — מתכנן מערכת לא רשמי', ''];
    L.push(`תוכנית: ${co ? co.p.name : '—'} · מסלול ${S.profile.track || '—'} · שנה ${YEARS[(S.profile.year || 1) - 1]} · מחזור ${co ? co.used : '—'}`);
    L.push(`ממוצע משוקלל: ${pr.avg ? pr.avg.toFixed(1) : '—'} · השלמת שנים קודמות: ${Math.round(pr.pct * 100)}%`);
    L.push('', 'עברתי:'); for (const id in C) if (['pass', 'exempt'].includes(status(id))) L.push(`  ${C[id].name}${S.record[id] && S.record[id].grade ? ' · ' + S.record[id].grade : status(id) === 'exempt' ? ' · פטור' : ''}`);
    L.push('', 'נכשלתי:'); for (const id in C) if (status(id) === 'fail') L.push(`  ${C[id].name} · ${S.record[id].grade ?? ''} · ${S.record[id].fails || 1} כישלונות`);
    L.push('', 'חובה משנים קודמות שחסר:'); for (const c of Object.values(C)) if (c.year && c.year < yearNum() && !isDone(c.id)) L.push('  ' + c.name);
    if (pair) { L.push('', 'המערכת שבחרתי (סמסטר א׳):'); for (const o of pair.A.sel) L.push(`  ${C[o.c].name} · ${o.parts.map(g => num(g.id)).join('+')}`); }
    L.push('', 'אזהרות:'); for (const w of pr.warnings) L.push('  ' + w.t);
    return L.join('\n');
  }
  const b64 = s => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const unb64 = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), ch => ch.charCodeAt(0)));
  const base = () => location.href.split('#')[0].split('?')[0];
  function shareLink(pair, name) {
    if (!pair) return null;
    return base() + '#f=' + b64(JSON.stringify({ v: 1, n: name || 'חבר/ה', s: 'א', g: pair.A.sel.flatMap(o => o.parts.map(g => g.id)) }));
  }
  function backupLink() {
    const keep = { ...S, terms: undefined, tourSeen: undefined };
    let url = base() + '#b=' + b64(JSON.stringify({ v: 1, d: keep }));
    let leftImprove = false;
    if (url.length > 6000 && keep.improve) { keep.improve = null; leftImprove = true; url = base() + '#b=' + b64(JSON.stringify({ v: 1, d: keep })); }
    return { url, leftImprove };
  }
  function readHash() {
    const h = location.hash;
    const m = h.match(/^#(f|b)=(.+)$/);
    if (!m) return null;
    try {
      const obj = JSON.parse(unb64(m[2]));
      if (m[1] === 'f') {
        if (!Array.isArray(obj.g) || !obj.g.length || obj.g.length > 60 || !obj.g.every(id => typeof id === 'string' && Object.hasOwn(G, id))) return { type: 'friend', error: 'הקישור מכיל קבוצות שלא קיימות בנתונים הנוכחיים (אולי משנה אחרת).' };
        return { type: 'friend', name: String(obj.n || 'חבר/ה').slice(0, 20), groups: obj.g };
      }
      if (obj.v !== 1 || !obj.d) return { type: 'backup', error: 'קישור הגיבוי נוצר בגרסה ישנה ואינו נתמך. הנתונים הנוכחיים לא השתנו.' };
      return { type: 'backup', data: sanitize(obj.d) };
    } catch (e) { return { type: m[1] === 'f' ? 'friend' : 'backup', error: 'הקישור פגום או חתוך (אולי הועתק חלקית). הנתונים הנוכחיים לא השתנו.' }; }
  }
  // whitelist every field of a restored backup; anything malformed throws or is dropped
  function sanitize(d) {
    const ok = x => x && typeof x === 'object' && !Array.isArray(x);
    if (!ok(d)) throw new Error('bad backup');
    // own keys only: names like "toString" exist on every object
    const hasC = x => typeof x === 'string' && Object.hasOwn(C, x), hasG = x => typeof x === 'string' && Object.hasOwn(G, x);
    const o = fresh(), int = (v, a, b, def) => Number.isInteger(v) && v >= a && v <= b ? v : def;
    const str = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
    const pick = (v, list, def) => list.includes(v) ? v : def;
    const pr = ok(d.profile) ? d.profile : {}, prog = D.PROGRAMS.find(p => p.id === pr.program);
    if (!prog) throw new Error('no program');
    { const tr = pick(pr.track, prog.tracks, prog.tracks[0]); o.profile = { program: prog.id, track: tr, year: int(pr.year, 1, prog.years[tr], null) }; }
    for (const [id, r] of Object.entries(ok(d.record) ? d.record : {})) if (hasC(id) && ok(r) && ['none', 'pass', 'fail', 'exempt'].includes(r.st))
      o.record[id] = { st: r.st, grade: int(r.grade, 0, 100, null), earlierFail: r.earlierFail === true, ...(int(r.fails, 1, 3, 0) ? { fails: r.fails } : {}) };
    if (ok(d.english)) o.english = { exam: pick(d.english.exam, ['אמירנט', 'פסיכומטרי'], 'אמירנט'), score: int(d.english.score, 0, 150, null) };
    const names = new Set(Object.values(C).flatMap(c => c.prereqs.flat()));
    for (const [n, v] of Object.entries(ok(d.outside) ? d.outside : {})) if (names.has(n) && n !== '__proto__') o.outside[n] = v === true;
    for (const [id, v] of Object.entries(ok(d.exceptions) ? d.exceptions : {})) if (hasC(id)) o.exceptions[id] = v === true;
    o.spec = pick(d.spec, D.SPECS, null);
    for (const [id, c] of Object.entries(ok(d.choices) ? d.choices : {})) if (hasC(id) && ok(c)) o.choices[id] = { st: pick(c.st, ['must', 'maybe', 'no'], 'maybe'), sem: pick(c.sem, ['auto', 'א', 'ב', 'קיץ'], 'auto'), retake: c.retake === true };
    o.cap = typeof d.cap === 'number' && d.cap >= 6 && d.cap <= 30 ? Math.round(d.cap * 2) / 2 : o.cap;
    if (ok(d.plan)) o.plan = { mode: pick(d.plan.mode, ['sem', 'year'], 'sem'), split: pick(d.plan.split, ['moreA', 'balanced', 'moreB'], 'balanced'), summer: d.plan.summer === true };
    const p = ok(d.prefs) ? d.prefs : {}, w = ok(p.w) ? p.w : {};
    for (const k in o.prefs.w) o.prefs.w[k] = int(w[k], 0, 3, o.prefs.w[k]);
    o.prefs.wNoticeSeen = p.wNoticeSeen === true;
    if (ok(p.daysOff)) o.prefs.daysOff = { days: (Array.isArray(p.daysOff.days) ? p.daysOff.days : []).filter(x => int(x, 1, 6, 0)), strict: p.daysOff.strict === true };
    if (ok(p.hours)) o.prefs.hours = { from: int(p.hours.from, 7, 14, 8), to: int(p.hours.to, 14, 22, 20), strict: p.hours.strict === true };
    o.prefs.maxDays = int(p.maxDays, 2, 5, null);
    if (ok(p.lect)) for (const k of ['prefer', 'avoid']) o.prefs.lect[k] = (Array.isArray(p.lect[k]) ? p.lect[k] : []).filter(n => D.LECTURERS.includes(n));
    o.prefs.sameDayExams = p.sameDayExams === true; o.prefs.includeFull = p.includeFull === true;
    o.prefs.split = { on: false, ack: !!(ok(p.split) && p.split.ack === true) }; // a restore never turns the split option on
    o.busy = (Array.isArray(d.busy) ? d.busy : []).filter(ok).slice(0, 12).map((b, i) => ({ id: 'b' + i, d: int(b.d, 1, 6, 0), s: int(b.s, 0, 1440, -1), e: int(b.e, 0, 1440, -1), label: str(b.label, 24) })).filter(b => b.d && b.s >= 0 && b.e > b.s);
    o.pins = (Array.isArray(d.pins) ? d.pins : []).filter(x => typeof x === 'string' && /^[0-9/@\u05d0-\u05ea]{1,24}$/.test(x)).slice(0, 40);
    o.friends = (Array.isArray(d.friends) ? d.friends : []).filter(ok).slice(0, 20).map((x, i) => ({ id: 'f' + i, name: str(x.name, 20) || 'חבר/ה', weight: int(x.weight, 0, 3, 2), show: x.show !== false, source: pick(x.source, ['link', 'file', 'xlsx', 'manual'], 'file'), groups: (Array.isArray(x.groups) ? x.groups : []).filter(hasG).slice(0, 40) }));
    o.order = pick(d.order, ['balanced', 'credits', 'friends', 'unlocks'], 'balanced');
    o.shareName = str(d.shareName, 20);
    if (Array.isArray(d.visitedB)) o.visitedB = d.visitedB.filter(x => typeof x === 'string' && /^[a-z]{1,10}$/.test(x));
    o.modeA = pick(d.modeA, ['new', 'improve'], 'new');
    const I = ok(d.improve) ? d.improve : null;
    const goodItem = it => ok(it) && typeof it.key === 'string' && (it.fixed ? ok(it.fixed) && int(it.fixed.d, 1, 6, 0) && int(it.fixed.s, 0, 1440, -1) >= 0 && int(it.fixed.e, 0, 1440, -1) > it.fixed.s
      : !!(hasC(it.c) && hasG(it.main) && G[it.main].course === it.c && Array.isArray(it.subs) && it.subs.every(hasG)));
    const cleanItem = (it, keepFlags) => it.fixed ? { key: str(it.key, 20), fixed: { name: str(it.fixed.name, 40), d: it.fixed.d, s: it.fixed.s, e: it.fixed.e }, move: false }
      : { key: str(it.key, 20), c: it.c, main: it.main, subs: it.subs.slice(0, 3), move: keepFlags && it.move === true, removed: keepFlags && it.removed === true, added: keepFlags && it.added === true };
    if (I && I.stage === 'edit' && Array.isArray(I.items) && Array.isArray(I.original) && I.items.length && I.original.length && I.items.every(goodItem) && I.original.every(goodItem))
      o.improve = { stage: 'edit', source: pick(I.source, ['xlsx', 'pdf', 'manual'], 'xlsx'), sem: pick(I.sem, ['א', 'ב'], 'א'), registered: I.registered === true,
        dataKey: [o.profile.program, o.profile.track, o.profile.year].join('/'), rows: [], items: I.items.map(it => cleanItem(it, true)), original: I.original.map(it => cleanItem(it, false)),
        goals: { freeDay: null, gaps: false, finishBy: null }, proposals: null, recVer: o.recVer };
    return o;
  }
  function restore(data) {
    const keepTerms = S.terms, theme = S.theme;
    S = Object.assign(data, { terms: keepTerms, theme, tourSeen: true });
    save(); api.results = null; scheduleCompute(0); emit();
  }
  function clearHash() { history.replaceState(null, '', location.pathname + location.search); }
  async function copy(text) {
    try { if (api.forceCopyFail) throw 0; await navigator.clipboard.writeText(text); return true; }
    catch (e) { return false; }
  }
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function eraseAll() { try { localStorage.removeItem(KEY); } catch (e) { } S = fresh(); api.results = null; emit(); }

  /* ---------- improve an existing timetable ---------- */
  function improveLoad(source) {
    S.improve = {
      stage: 'review', source, sem: source === 'manual' ? null : 'א', registered: null, dataKey: dataKey(),
      rows: D.IMPORT_ROWS.map(r => ({ ...r, ok: r.sure, pick: r.choices ? null : r.main })),
      items: [], goals: { freeDay: null, gaps: false, finishBy: null }, recVer: S.recVer
    };
    save(); emit();
  }
  function improveStart() {
    const I = S.improve;
    I.items = I.rows.map(r => r.course ? { key: r.id, c: r.course, main: r.pick || r.main, subs: r.subs || [], move: false }
      : { key: r.id, fixed: r.fixed, move: false });
    I.original = JSON.parse(JSON.stringify(I.items));
    I.stage = 'edit'; I.proposals = null; save(); emit();
  }
  const dataKey = () => [S.profile.program, S.profile.track, S.profile.year].join('/');
  function itemMeet(it) {
    if (it.fixed) return [{ ...it.fixed, g: null }];
    return [it.main, ...it.subs].map(id => G[id]).filter(Boolean).flatMap(g => g.meetings.map(m => ({ ...m, g })));
  }
  function improveProblems() {
    const I = S.improve, out = [];
    const fixed = I.items.filter(it => !it.move && !it.removed);
    for (let i = 0; i < fixed.length; i++) for (let j = i + 1; j < fixed.length; j++) {
      const a = itemMeet(fixed[i]), b = itemMeet(fixed[j]);
      if (a.some(m => b.some(x => x.d === m.d && m.s < x.e && x.s < m.e)))
        out.push({ t: 'overlap', text: `${esc(itemName(fixed[i]))} ו${esc(itemName(fixed[j]))} חופפים — אחד מהם חייב להיות "יכול לזוז".`, keys: [fixed[i].key, fixed[j].key] });
    }
    // 3) two courses that stay put with the same first-sitting exam slot
    const fx = fixed.filter(it => it.c);
    for (let i = 0; i < fx.length; i++) for (let j = i + 1; j < fx.length; j++) {
      const a = examKey(fx[i].c, G[fx[i].main]);
      if (a && a === examKey(fx[j].c, G[fx[j].main])) out.push({ t: 'exam', text: `${C[fx[i].c].name} ו${C[fx[j].c].name}: מבחן מועד א׳ באותו תאריך ושעה. כדאי לסמן אחד מהם "יכול לזוז".` });
    }
    for (const it of I.items) if (it.c && !it.removed && missingPrereqs(it.c).length)
      out.push({ t: 'prereq', text: `${C[it.c].name}: חסר קדם — ${missingPrereqs(it.c).map(a => a.join(' או ')).join(', ')}.` });
    return out;
  }
  const itemName = it => it.fixed ? it.fixed.name : C[it.c].name;
  function improveSearch() {
    const I = S.improve, P = S.prefs;
    const active = I.items.filter(it => !it.removed);
    const fixed = active.filter(it => !it.move);
    const movable = active.filter(it => it.move);
    const baseMeets = fixed.flatMap(itemMeet);
    const keepFull = I.registered ? new Set(I.original.flatMap(it => it.c ? [it.main, ...it.subs] : [])) : null;
    const cur = active.map(it => it.c ? { c: it.c, key: [it.main, ...it.subs].join('+'), meet: itemMeet(it) } : null).filter(Boolean);
    const gapsOf = meets => { const by = {}; for (const m of meets) (by[m.d] = by[m.d] || []).push(m); let g = 0; for (const d in by) { const ms = by[d].sort((a, b) => a.s - b.s); for (let i = 1; i < ms.length; i++) g += Math.max(0, ms[i].s - ms[i - 1].e - 10); } return g; };
    const curMeets = active.flatMap(itemMeet), curGaps = gapsOf(curMeets);
    const goalOk = meets => (!I.goals.freeDay || !meets.some(m => m.d === I.goals.freeDay))
      && (!I.goals.finishBy || meets.every(m => m.e <= I.goals.finishBy * 60))
      && (!I.goals.gaps || gapsOf(meets) < curGaps);
    const pools = movable.map(it => {
      const opts = optionsFor(it.c, I.sem || 'א', { ...P, includeFull: !I.registered && P.includeFull }, { busy: S.busy, lect: false, keepFull });
      return { it, opts: opts.length ? opts : [] };
    });
    const out = [];
    let nodes = 0, cut = false;
    const pick = [];
    const exKeys = fixed.filter(it => it.c).map(it => examKey(it.c, G[it.main])).filter(Boolean);
    const exDates = fixed.filter(it => it.c && G[it.main].exam).map(it => G[it.main].exam);
    const examOk = o => {
      const k = examKey(o.c, o.main), dt = o.main.exam;
      if (k && (exKeys.includes(k) || pick.some(q => examKey(q.c, q.main) === k))) return false;
      if (dt && P.sameDayExams && (exDates.includes(dt) || pick.some(q => q.main.exam === dt))) return false;
      return true;
    };
    (function rec(i, meets) {
      if (++nodes > 40000) { cut = true; return; }
      if (P.maxDays && new Set(meets.map(m => m.d)).size > P.maxDays) return;
      if (i === pools.length) {
        if (!goalOk(meets)) return;
        const changed = pick.filter((o, k) => o.key !== [pools[k].it.main, ...pools[k].it.subs].join('+'));
        if (!changed.length && !I.items.some(it => it.removed || it.added)) return;
        const all = fixed.filter(it => it.c).map(it => ({ c: it.c, key: [it.main, ...it.subs].join('+'), meet: itemMeet(it), main: G[it.main], parts: [it.main, ...it.subs].map(id => G[id]).filter(Boolean), split: false })).concat(pick);
        const m = metrics(all, P, S.friends);
        out.push({ pick: pick.slice(), changed: changed.length + I.items.filter(it => it.removed || it.added).length, split: pick.some(o => o.split), m, meets: meets.slice(), gapsBefore: curGaps / 60, gapsAfter: gapsOf(meets) / 60 });
        return;
      }
      for (const o of pools[i].opts) {
        if (clash(o, meets) || !examOk(o)) continue;
        pick.push(o); rec(i + 1, meets.concat(o.meet)); pick.pop();
        if (cut) return;
      }
    })(0, baseMeets);
    out.sort((a, b) => (a.split - b.split) || (a.changed - b.changed) || (b.m.score - a.m.score));
    const res = { list: out.slice(0, 6), cut, recVer: S.recVer, dataKey: I.dataKey };
    if (!res.list.length && !quickDepth) {
      res.diag = [];
      if (I.goals.freeDay) res.diag.push(`יום ${DAYL[I.goals.freeDay]} תפוס על ידי קורסים שמסומנים "נשאר".`);
      for (const it of fixed.filter(x => x.c)) {
        const trial = I.items.map(x => x.key === it.key ? { ...x, move: true } : x);
        const save0 = I.items; I.items = trial;
        const r2 = improveSearchQuick();
        I.items = save0;
        if (r2) { res.hint = { key: it.key, name: C[it.c].name }; break; }
      }
    }
    return res;
  }
  let quickDepth = 0;
  function improveSearchQuick() {
    if (quickDepth) return false;
    quickDepth++;
    try { return improveSearch().list.length > 0; } finally { quickDepth--; }
  }
  function improveExplain(p) {
    const I = S.improve, gains = [], costs = [];
    if (I.goals.freeDay && !p.meets.some(m => m.d === I.goals.freeDay)) gains.push(`יום ${DAYL[I.goals.freeDay]} התפנה`);
    if (p.gapsAfter < p.gapsBefore) gains.push(`${(p.gapsBefore - p.gapsAfter).toFixed(1).replace('.0', '')} ש׳ חלון פחות`);
    if (I.goals.finishBy) gains.push(`מסיים עד ${I.goals.finishBy}:00`);
    costs.push(p.changed === 1 ? 'קורס אחד זז' : `${p.changed} קורסים זזים`);
    const lectSame = p.pick.every(o => { const it = I.items.find(x => x.c === o.c); return !it || G[it.main].lecturer === o.main.lecturer; });
    costs.push(lectSame ? 'אותו מרצה' : 'מרצה אחר');
    if (p.split) costs.push('פיצול הרצאה/תרגול');
    return gains.concat(costs).join(' · ');
  }

  const api = {
    D, C, G, DAYS, DAYL, YEARS, LEVELS, WISHES, DEFAULT_W, OLD_W, PARALLEL,
    get S() { return S; }, load, save, sanitize, set, on: f => listeners.push(f), emit,
    get storageOk() { return storageOk; },
    results: null, computing: false, stale: true, error: null, otherTab: false, forceError: false, forceCopyFail: false,
    hm, rng, esc, num, fmtDate, status, isDone, eligibility, missingPrereqs, unlocks, openCourses, choice, progress, cohort,
    optionsFor, mkOpt, metrics, leftOut, diff, probe, compute: scheduleCompute, computeNow: compute, BUDGETS, planOf, semSel, itemMeet, itemName,
    registrationText, ics, advisorText, shareLink, backupLink, readHash, restore, clearHash, copy, download, eraseAll,
    improveLoad, improveStart, improveProblems, improveSearch, improveExplain, dataKey, fresh
  };
  return api;
})();
