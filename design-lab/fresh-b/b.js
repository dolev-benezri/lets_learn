/* Concept B — "המסלול": a hub with two routes of steps, one decision per screen,
   a live receipt of everything chosen so far, and the alternatives as a deck of cards. */
'use strict';
(() => {
  const L = window.LL, PN = window.PN, C = L.C;
  const { icon, btn, esc } = PN;
  const app = document.getElementById('app');
  const desk = matchMedia('(min-width: 1024px)');
  const ui = { view: null, sem: 'א', lastRoute: '' };

  L.load('ll-fresh-b');
  PN.demoSeed();
  PN.applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', PN.applyTheme);
  desk.addEventListener('change', render);
  L.on(render);
  const S = () => L.S;

  const BUILD = [
    ['me', 'אני', 'user', 'מה לומדים ובאיזו שנה. מזה נגזרים הקורסים והחוקים.'],
    ['passed', 'מה עברתי', 'check', 'ייבוא גיליון ציונים או סימון ידני. מה שעברת פותח קורסי המשך.'],
    ['courses', 'קורסים', 'list', 'לכל קורס פתוח: חובה, אולי או לא. וגם: סמסטר או שנה שלמה.'],
    ['wishes', 'מה חשוב לי', 'star', 'שישה רצונות, לכל אחד ארבע דרגות. הם קובעים את סדר החלופות.'],
    ['rules', 'זמנים וכללים', 'clock', 'ימי חופש, שעות, זמנים חסומים, מרצים, מבחנים וקבוצות.'],
    ['friends', 'חברים', 'users', 'מערכות של חברים — כדי ללמוד יחד.'],
    ['results', 'חלופות', 'grid', 'עד 10 מערכות מוכנות בלי התנגשויות. מחליקים בין הקלפים.'],
    ['out', 'יוצאים לדרך', 'out', 'רשימת הרשמה, יומן, סיכום ליועץ ושיתוף. ההרשמה עצמה באפקה-נט.']
  ];
  const IMPROVE = [
    ['load', 'טעינה', 'upload', 'המערכת שכבר יש לך: קובץ Excel, PDF, צילום מסך או בחירה ידנית.'],
    ['check', 'בדיקה', 'check', 'מה שהקורא לא היה בטוח בו — מאשרים או מתקנים.'],
    ['change', 'מה זז', 'move', 'מה נשאר, מה יכול לזוז, מה מוסיפים או מורידים — ומה המטרה.'],
    ['proposals', 'הצעות', 'target', 'הצעות לשיפור. המערכת הנוכחית היא נקודת הייחוס.']
  ];
  const TRACKS = { build: BUILD, improve: IMPROVE };
  const TRACK_NAME = { build: 'מערכת חדשה', improve: 'שיפור מערכת קיימת' };

  function route() {
    const h = location.hash;
    if (!h.startsWith('#/')) return { page: 'hub' };
    const [page, step, arg] = h.slice(2).split('/');
    return { page, step: step && decodeURIComponent(step), arg };
  }

  /* ---------- status of each step ---------- */
  const visited = k => (S().visitedB || []).includes(k);
  function done(track, k) {
    const s = S(), I = s.improve;
    if (track === 'build') return {
      me: !!(s.profile.program && s.profile.year), passed: visited('passed'), courses: visited('courses'), wishes: visited('wishes'),
      rules: visited('rules'), friends: s.friends.length > 0 || visited('friends'), results: visited('results') && !!(L.results && L.results.alts && L.results.alts.length), out: visited('out')
    }[k];
    return { load: !!I, check: !!I && I.stage === 'edit', change: !!(I && I.proposals), proposals: !!(I && I.proposals && I.proposals.list.length) }[k];
  }
  const nextStep = track => (TRACKS[track].find(([k]) => !done(track, k)) || TRACKS[track][TRACKS[track].length - 1])[0];

  /* ---------- render ---------- */
  function render() {
    PN.keep(() => { app.innerHTML = S().terms ? shell() : termsPage(); });
    after();
  }
  function termsPage() {
    return `<main class="terms-page" id="main"><div class="tp-in"><p class="eyebrow">מתכנן מערכת · אפקה · לא רשמי</p>
      <h1>לפני שיוצאים לדרך</h1><p class="why">חמש נקודות קצרות. אחריהן — המסלול.</p>${PN.termsBody()}
      <label class="cb big"><input type="checkbox" id="terms-ok"> קראתי ואני מסכים/ה לתנאים</label>
      ${btn('terms-accept', 'מסכים/ה — יוצאים לדרך', { cls: 'primary wide' })}</div></main>`;
  }
  function shell() {
    const r = route();
    const inStep = TRACKS[r.page];
    return `<a class="skip" href="#main" data-act="skip">דילוג לתוכן</a>
      <header class="top">${topBar(r)}</header>
      ${PN.systemBanners() ? `<div class="banners">${PN.systemBanners()}</div>` : ''}
      <div class="frame${inStep ? ' in-step' : ''}">
        ${desk.matches ? `<nav class="rail" aria-label="המסלול">${rail(r)}</nav>` : ''}
        <main id="main" class="main" tabindex="-1">${page(r)}${inStep && desk.matches ? stepNav(r) : ''}</main>
        ${desk.matches ? `<aside class="receipt" aria-labelledby="rc-t">${receipt()}</aside>` : ''}
      </div>
      ${inStep && !desk.matches ? stepNav(r) : ''}`;
  }
  function topBar(r) {
    const steps = TRACKS[r.page];
    const right = `<button type="button" class="icb rc-btn" data-act="receipt" aria-label="הקבלה — מה נבחר עד עכשיו">${icon('list')}</button>
      <button type="button" class="icb" data-act="theme" aria-label="${PN.themeLabel()}" title="${PN.themeLabel()}">${PN.themeIcon()}</button>
      <button type="button" class="icb" data-act="menu" aria-label="תפריט">${icon('menu')}</button>`;
    if (steps && !desk.matches) {
      const i = steps.findIndex(x => x[0] === r.step);
      return `<a class="icb" href="#/" aria-label="לבית">${icon('home')}</a>
        <button type="button" class="tb-step" data-act="steps" aria-label="כל השלבים">${TRACK_NAME[r.page]}<b>שלב ${i + 1}/${steps.length} · ${steps[i][1]}</b>${icon('down')}</button>${right.replace(/<button type="button" class="icb" data-act="theme"[^]*?<\/button>/, '')}
        <div class="prog" aria-hidden="true"><i style="width:${(i + 1) / steps.length * 100}%"></i></div>`;
    }
    return `<a class="brand" href="#/">${logo()}<span><b>המסלול</b><small>מתכנן מערכת · לא רשמי</small></span></a><span class="sp"></span>${right}`;
  }
  const logo = () => `<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14"/><path d="M10 22c0-5 12-4 12-10M10 22h.01M22 12h.01"/></svg>`;

  function page(r) {
    if (TRACKS[r.page] && TRACKS[r.page].some(x => x[0] === r.step)) return stepPage(r.page, r.step);
    switch (r.page) {
      case 'me': return mePage();
      case 'map': return `<div class="page-h"><a class="btn ghost sm" href="#/me">${icon('back')}<span>המצב שלי</span></a><h1>מפת התקדמות</h1></div>${PN.mapView()}`;
      case 'lesson': return `<div class="page-h"><button type="button" class="btn ghost sm" data-act="back">${icon('back')}<span>חזרה</span></button></div>${PN.lessonDetail(r.step)}`;
      case 'info': return `<div class="page-h"><h1>מידע ותנאים</h1></div>${PN.noticeBar()}${PN.infoBlock()}<h2 class="h2">תנאי השימוש בקצרה</h2>${PN.termsBody()}`;
      case 'states': return `<div class="page-h"><h1>מצבים נדירים</h1></div>${PN.statesPage()}`;
      default: return hub();
    }
  }

  /* ---------- hub ---------- */
  function hub() {
    const s = S(), pr = s.profile.year ? L.progress() : null;
    const bDone = BUILD.filter(([k]) => done('build', k)).length, iDone = IMPROVE.filter(([k]) => done('improve', k)).length;
    const job = (track, ic, title, text, n) => `<a class="job" href="#/${track}/${nextStep(track)}">
        <span class="job-ic">${icon(ic)}</span><h2>${title}</h2><p>${text}</p>
        <span class="job-prog"><span class="bar"><i style="width:${n / TRACKS[track].length * 100}%"></i></span><small>${n ? `${n} מתוך ${TRACKS[track].length} שלבים` : `${TRACKS[track].length} שלבים`}</small></span>
        <span class="job-go">${n ? 'להמשיך' : 'להתחיל'} ${icon('fwd')}</span></a>`;
    return `<section class="hero"><p class="eyebrow">מתכנן מערכת · אפקה · לא רשמי</p><h1>מה עושים היום?</h1>
        <p class="why">שני מסלולים. אפשר לעבור ביניהם בכל רגע — המצב שלך משותף לשניהם.</p></section>
      <div class="jobs">${job('build', 'grid', 'לבנות מערכת חדשה', 'לסמסטר או לשנה שלמה. עד 10 חלופות בלי התנגשויות, מסודרות לפי מה שחשוב לך.', bDone)}
        ${job('improve', 'wand', 'לשפר מערכת שיש לי', 'טוענים את המערכת הקיימת, מזיזים קורס או שניים, ומפנים יום או מקצרים חלונות.', iDone)}</div>
      <a class="me-card" href="#/me"><span class="mc-t">${icon('user')}<b>המצב שלי</b></span>
        ${pr ? `<span class="mc-s"><b>${pr.avg ? pr.avg.toFixed(1) : '—'}</b><small>ממוצע</small></span><span class="mc-s"><b>${Math.round(pr.pct * 100)}%</b><small>שנים קודמות</small></span><span class="mc-s"><b>${pr.warnings.length}</b><small>אזהרות</small></span>` : '<span class="muted">עוד לא נבחרה תוכנית</span>'}
        ${icon('fwd')}</a>
      <div class="tiles">
        <a class="tile" href="#/build/friends">${icon('users')}<span>חברים<small>${s.friends.length ? s.friends.map(f => esc(f.name)).join(', ') : 'עוד אין'}</small></span></a>
        <a class="tile" href="#/map">${icon('map')}<span>מפת התקדמות<small>מה עשיתי ומה נשאר</small></span></a>
        <button type="button" class="tile" data-act="tour">${icon('route')}<span>סיור קצר<small>שלוש שקופיות</small></span></button>
        <a class="tile" href="#/info">${icon('info')}<span>מידע ותנאים<small>עדכון, פרטיות, נגישות</small></span></a></div>
      <footer class="foot">${PN.noticeBar()}<p>${icon('clock')} עודכן ${L.fmtDate(L.D.DATA_UPDATED)} · לא רשמי, לא קשור למכללה · ההרשמה באפקה-נט היא הקובעת.</p></footer>`;
  }

  /* ---------- steps ---------- */
  function stepPage(track, k) {
    const list = TRACKS[track], i = list.findIndex(x => x[0] === k), [, t, , why] = list[i];
    return `<div class="step-head"><span class="step-n" aria-hidden="true">${i + 1}</span><div><p class="eyebrow">${TRACK_NAME[track]} · שלב ${i + 1} מתוך ${list.length}</p><h1 tabindex="-1" id="h1">${t}</h1><p class="why">${why}</p></div></div>
      <div class="step-body">${track === 'build' ? buildBody(k) : improveBody(k)}</div>`;
  }
  function buildBody(k) {
    const s = S();
    switch (k) {
      case 'me': return PN.profileForm() + (s.profile.year ? PN.specBlock() : '');
      case 'passed': {
        if (!s.profile.year) return needProfile();
        return `<div class="mini-sum">${PN.turnBlock()}<a class="btn sm ghost" href="#/me">${icon('user')}<span>המצב שלי המלא</span></a></div>${PN.passedEditor()}`;
      }
      case 'courses': return s.profile.year ? `${PN.planBlock()}<div class="card-in">${PN.capBlock()}</div><h2 class="h2">הקורסים הפתוחים לך</h2>${PN.courseChooser()}` : needProfile();
      case 'wishes': return `${PN.weightsNotice()}${PN.wishes()}<p class="small muted">${icon('check')} כל שינוי נשמר מיד — אין כפתור שמירה.</p>`;
      case 'rules': return `${PN.rulesBlock()}${PN.busyBlock()}${PN.lecturersBlock()}${PN.examsRuleBlock()}${PN.groupsBlock()}<div class="row">${btn('reset-prefs', 'איפוס ההעדפות', { ic: 'refresh', cls: 'ghost sm' })}</div>`;
      case 'friends': return PN.friendsPanel();
      case 'results': return resultsPage();
      case 'out': return `<h2 class="h2">מבחנים</h2>${PN.examsBlock(PN.semSel(ui.sem)) || '<p class="muted">אין עדיין מערכת.</p>'}${PN.exportPanel(ui.sem)}`;
    }
    return '';
  }
  const needProfile = () => `<div class="state">${icon('user')}<p>קודם בוחרים תוכנית ושנה.</p><a class="btn primary" href="#/build/me">לשלב "אני"</a></div>`;
  function improveBody(k) {
    const I = S().improve;
    const need = (t, to) => `<div class="state">${icon('upload')}<p>${t}</p><a class="btn primary" href="#/improve/${to}">לשם</a></div>`;
    switch (k) {
      case 'load': return I ? `${PN.note(`נטענה מערכת (${I.items.length || I.rows.length} שורות).`, 'info')}<div class="row wrap"><a class="btn primary" href="#/improve/${nextStep('improve')}">להמשיך</a>${btn('im-new', 'טעינת מערכת אחרת', { cls: 'ghost', ic: 'upload' })}</div>` : PN.imLoad();
      case 'check': return !I ? need('קודם טוענים מערכת.', 'load') : I.stage === 'review' ? PN.imReview() : PN.note('כל השורות אושרו. אפשר להמשיך.', 'info');
      case 'change': return !I || I.stage !== 'edit' ? need('קודם טוענים ומאשרים את השורות.', I ? 'check' : 'load') : PN.imEdit();
      case 'proposals': {
        if (!I || I.stage !== 'edit') return need('קודם טוענים ומאשרים את השורות.', I ? 'check' : 'load');
        const props = PN.imProposals();
        const v = view();
        return `${props || `<div class="state">${icon('search')}<p>מסמנים מה יכול לזוז ובוחרים מטרה בשלב הקודם.</p><a class="btn" href="#/improve/change">לשלב "מה זז"</a></div>`}
          <section class="week-sec"><div class="row between wrap"><h2 class="h2">${I.proposals && I.proposals.list.length ? 'השבוע עם ההצעה' : 'השבוע הנוכחי'}</h2>${viewSeg()}</div>
          <p class="small muted">מסגרת מקווקוות = איפה השיעור היה.</p>${v === 'grid' ? PN.weekGrid(PN.imWeekItems()) : PN.agenda(PN.imWeekItems())}${PN.planNote()}</section>
          <details class="card-in"><summary>להוציא את המערכת הנוכחית (רשימה, יומן, שיתוף)</summary><p class="small muted">מה שנשמר עד עכשיו — אחרי "לשמור את ההצעה" זו המערכת המשופרת.</p>${PN.exportPanel(I.sem || 'א', PN.imPair())}</details>`;
      }
    }
    return '';
  }
  function stepNav(r) {
    const list = TRACKS[r.page], i = list.findIndex(x => x[0] === r.step);
    const prev = list[i - 1], next = list[i + 1];
    return `<nav class="stepnav" aria-label="מעבר בין שלבים">
      ${prev ? `<a class="btn" href="#/${r.page}/${prev[0]}">${icon('back')}<span>${prev[1]}</span></a>` : `<a class="btn" href="#/">${icon('home')}<span>בית</span></a>`}
      ${next ? `<a class="btn primary" href="#/${r.page}/${next[0]}"><span>הבא: ${next[1]}</span>${icon('fwd')}</a>` : `<a class="btn primary" href="#/"><span>סיום — לבית</span>${icon('check')}</a>`}</nav>`;
  }

  /* ---------- the deck of alternatives ---------- */
  const view = () => ui.view || (desk.matches ? 'grid' : 'list');
  const viewSeg = () => PN.seg('view', view(), [['list', 'רשימה'], ['grid', 'טבלה']], { label: 'תצוגת השבוע', cls: 'sm' });
  function resultsPage() {
    const block = PN.stateBlock(), r = L.results;
    if (!r || !r.alts || !r.alts.length || block && !L.computing) return block || `<div class="state">${icon('grid')}<p>עוד אין חלופות.</p></div>`;
    const i = S().altIdx, p = PN.pair();
    const tabs = [['א', 'סמסטר א׳']].concat(S().plan.mode === 'year' ? [['ב', 'סמסטר ב׳']] : []).concat(S().plan.summer ? [['קיץ', 'קיץ']] : []);
    const items = PN.weekItems(PN.semSel(ui.sem));
    return `${L.computing ? block : ''}
      <div class="deck-tools"><span class="small muted">סדר:</span>${PN.orderSel()}</div>${PN.resultNotes()}
      <div class="deck" id="deck" data-keep="deck" role="list" aria-label="חלופות — מחליקים לצדדים">${r.alts.map((x, k) => card(x, k, i)).join('')}</div>
      <div class="deck-nav">${btn('alt', '', { arg: i - 1, ic: 'back', cls: 'icb', dis: i === 0, aria: 'החלופה הקודמת' })}
        <span class="dots" aria-live="polite">חלופה <b>${i + 1}</b> מתוך ${r.alts.length}</span>${btn('alt', '', { arg: i + 1, ic: 'fwd', cls: 'icb', dis: i >= r.alts.length - 1, aria: 'החלופה הבאה' })}</div>
      ${S().plan.mode === 'year' && p.missReq.length ? PN.note('חסרים בתוכנית השנתית: ' + p.missReq.map(id => C[id].name).join(', '), 'mid') : ''}
      <section class="week-sec" aria-labelledby="wk-t"><div class="row between wrap"><h2 class="h2" id="wk-t">השבוע של חלופה ${i + 1}</h2>${viewSeg()}</div>
        ${tabs.length > 1 ? `<div class="semtabs" role="tablist" aria-label="סמסטר">${tabs.map(([k, t]) => `<button type="button" role="tab" aria-selected="${ui.sem === k}" class="st${ui.sem === k ? ' on' : ''}" data-act="sem" data-arg="${k}">${t}</button>`).join('')}</div>` : ''}
        ${ui.sem === 'קיץ' && !(r.summer) ? PN.note('אין קורס קיץ שמתאים לתוכנית הזאת.', 'info') : view() === 'grid' ? PN.weekGrid(items) : PN.agenda(items)}${PN.planNote()}</section>
      <section class="sec"><h2 class="h2">נעיצות</h2>${PN.pinsBlock()}</section>`;
  }
  function card(p, k, i) {
    const a = p.A, m = a.m;
    return `<article class="card${k === i ? ' on' : ''}" role="listitem" aria-label="חלופה ${k + 1}${k === i ? ', נבחרה' : ''}">
      <button type="button" class="card-pick" data-act="alt" data-arg="${k}" aria-pressed="${k === i}"><span class="big">${k + 1}</span><span>${k === i ? 'נבחרה' : 'לבחור'}</span></button>
      <div class="card-b">${a.split ? '<span class="chip mid">פיצול</span>' : ''}
        <dl class="cstats"><div><dt>נ"ז</dt><dd>${m.credits}</dd></div><div><dt>ימים</dt><dd>${m.days.length}</dd></div><div><dt>ש׳ חלון</dt><dd>${m.gapH.toFixed(1).replace('.0', '')}</dd></div><div><dt>עם חברים</dt><dd>${m.shared}</dd></div><div><dt>מבחנים</dt><dd>${m.exams.length}</dd></div></dl>
        ${dayStrip(a)}${PN.altDiff(k)}${PN.altLeftOut(p)}
        ${p.B ? `<p class="small">${icon('cal')} סמסטר ב׳: ${p.B.m.credits} נ"ז · ${p.B.m.days.length} ימים</p>` : ''}</div></article>`;
  }
  function dayStrip(a) {
    return `<div class="strip" aria-hidden="true">${[1, 2, 3, 4, 5].map(d => { const ms = a.sel.flatMap(o => o.meet).filter(x => x.d === d); return `<div class="sd"><span>${L.DAYL[d]}</span><i>${ms.map(x => `<em class="${PN.color(x.g.course)}" style="inset-inline-start:${(x.s - 480) / 8.4}%;width:${(x.e - x.s) / 8.4}%"></em>`).join('')}</i></div>`; }).join('')}</div>`;
  }

  /* ---------- my record page ---------- */
  function mePage() {
    const s = S();
    if (!s.profile.year) return `<div class="page-h"><h1>המצב שלי</h1></div>${needProfile()}`;
    const co = L.cohort();
    return `<div class="page-h"><h1>המצב שלי</h1></div>
      <div class="prof"><div><b>${co.p.name}</b><span>מסלול ${esc(s.profile.track)} · שנה ${L.YEARS[s.profile.year - 1]} · מחזור ${co.used}${co.sub ? ' (במקום ' + co.start + ')' : ''}</span></div><a class="btn sm" href="#/build/me">${icon('edit')}<span>שינוי</span></a></div>
      ${PN.turnBlock()}${PN.progressBlock()}
      <div class="row wrap"><a class="btn" href="#/map">${icon('map')}<span>מפת התקדמות</span></a><a class="btn" href="#/build/passed">${icon('check')}<span>מה עברתי</span></a></div>
      ${PN.specBlock()}`;
  }

  /* ---------- the receipt ---------- */
  function receipt() {
    const s = S(), co = L.cohort(), pr = s.profile.year ? L.progress() : null, p = PN.pair();
    const open = L.openCourses('א').filter(x => ['ok', 'parallel'].includes(x.el.kind));
    const must = open.filter(x => L.choice(x.c.id).st === 'must').length, maybe = open.filter(x => L.choice(x.c.id).st === 'maybe').length;
    const top = L.WISHES.filter(([k]) => s.prefs.w[k] >= 2).map(([, t]) => t);
    const rows = [
      ['build/me', 'אני', co ? `${co.p.name} · שנה ${L.YEARS[s.profile.year - 1]}` : 'עוד לא נבחר'],
      ['build/passed', 'מה עברתי', pr ? `ממוצע ${pr.avg ? pr.avg.toFixed(1) : '—'} · ${Math.round(pr.pct * 100)}% משנים קודמות` : '—'],
      ['build/courses', 'קורסים', `${must} חובה · ${maybe} אולי · עד ${s.cap} נ"ז${s.plan.mode === 'year' ? ' · שנה שלמה' : ''}${s.plan.summer ? ' + קיץ' : ''}`],
      ['build/wishes', 'חשוב לי', top.length ? top.join(', ') : 'הכול באותה מידה'],
      ['build/rules', 'זמנים וכללים', [s.prefs.daysOff.days.length ? 'חופש: ' + s.prefs.daysOff.days.map(d => L.DAYL[d]).join(' ') : '', s.busy.length ? s.busy.length + ' זמנים חסומים' : '', s.prefs.lect.prefer.length + s.prefs.lect.avoid.length ? 'מרצים' : ''].filter(Boolean).join(' · ') || 'בלי כללים'],
      ['build/friends', 'חברים', s.friends.length ? s.friends.map(f => esc(f.name)).join(', ') : 'אין'],
      ['build/results', 'חלופה נבחרת', L.computing ? 'מחשבים…' : p ? `#${s.altIdx + 1} · ${p.A.m.credits} נ"ז · ${p.A.m.days.length} ימים · ${p.A.m.gapH.toFixed(1).replace('.0', '')} ש׳ חלון` : 'עוד אין']
    ];
    return `<h2 id="rc-t">הקבלה שלי</h2><p class="small muted">מה נבחר עד עכשיו. נוגעים בשורה כדי לשנות.</p>
      <ol class="rc">${rows.map(([h, t, v]) => `<li><a href="#/${h}"><span>${t}</span><b>${v}</b></a></li>`).join('')}</ol>
      ${p ? `<div class="rc-strip">${dayStrip(p.A)}</div>` : ''}
      ${s.pins.length ? `<p class="small">${icon('pin')} ${s.pins.length} נעיצות</p>` : ''}
      ${pr && pr.warnings.length ? PN.note(`${pr.warnings.length} אזהרות במצב שלך. <a href="#/me">לפרטים</a>`, 'mid') : ''}
      <p class="small muted rc-foot">${icon('clock')} נתונים מ-${L.fmtDate(L.D.DATA_UPDATED)} · תוכנית בלבד, ההרשמה באפקה-נט</p>`;
  }
  function rail(r) {
    const list = track => `<ol class="rl">${TRACKS[track].map(([k, t], i) => {
      const cur = r.page === track && r.step === k, d = done(track, k);
      return `<li><a href="#/${track}/${k}" class="rs${cur ? ' cur' : ''}${d ? ' done' : ''}"${cur ? ' aria-current="step"' : ''}><span class="n">${d && !cur ? icon('check') : i + 1}</span><span>${t}</span></a></li>`;
    }).join('')}</ol>`;
    return `<a class="rl-home${r.page === 'hub' ? ' cur' : ''}" href="#/">${icon('home')}<span>בית</span></a>
      <h2>${icon('grid')} ${TRACK_NAME.build}</h2>${list('build')}<h2>${icon('wand')} ${TRACK_NAME.improve}</h2>${list('improve')}
      <div class="rl-more"><a href="#/me">${icon('user')}המצב שלי</a><a href="#/map">${icon('map')}מפת התקדמות</a><a href="#/info">${icon('info')}מידע ותנאים</a></div>`;
  }

  /* ---------- tour: three slides ---------- */
  const TOUR = [
    ['route', 'מסלול של צעדים', 'כל מסך שואל דבר אחד. "הבא" למטה מוביל הלאה, ואפשר לקפוץ לכל שלב.'],
    ['list', 'הקבלה', 'הכפתור למעלה (במחשב: העמודה בצד) מסכם כל מה שבחרת. נוגעים בשורה כדי לחזור אליה.'],
    ['grid', 'חפיסת החלופות', 'החלופות הן קלפים. מחליקים ביניהם, והשבוע של הקלף שנבחר מופיע מתחת.']
  ];
  function tour(i = 0) {
    const [ic, t, d] = TOUR[i];
    PN.dialog(`<div class="tour-s">${icon(ic, 'big')}<p class="small muted">${i + 1} מתוך ${TOUR.length}</p><h3>${t}</h3><p>${d}</p></div>
      <div class="row end">${i < TOUR.length - 1 ? `<button class="btn" value="cancel">דילוג</button>${btn('tour-n', 'הבא', { arg: i + 1, cls: 'primary' })}` : `<button class="btn primary" value="ok">יאללה</button>`}</div>`, { title: 'סיור קצר' })
      .then(() => L.set(s => { s.tourSeen = true; }, { rebuild: false }));
  }

  /* ---------- after render ---------- */
  function after() {
    const r = route(), key = location.hash;
    if (TRACKS[r.page] && r.page === 'build' && !visited(r.step)) L.set(s => { s.visitedB = [...(s.visitedB || []), r.step]; }, { rebuild: false });
    if (key !== ui.lastRoute) {
      ui.lastRoute = key;
      window.scrollTo(0, 0);
      const h = document.querySelector('#main h1');
      if (h && document.activeElement === document.body) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
      const deck = document.getElementById('deck');
      if (deck) { const on = deck.querySelector('.card.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' }); }
    }
    const deck = document.getElementById('deck');
    if (deck && !deck._b) {
      deck._b = 1; let t;
      deck.addEventListener('scroll', () => {
        clearTimeout(t);
        t = setTimeout(() => {
          const mid = deck.getBoundingClientRect().left + deck.clientWidth / 2;
          let best = 0, bd = 1e9;
          deck.querySelectorAll('.card').forEach((c, k) => { const b = c.getBoundingClientRect(), d = Math.abs(b.left + b.width / 2 - mid); if (d < bd) { bd = d; best = k; } });
          if (best !== S().altIdx) L.set(s => { s.altIdx = best; }, { rebuild: false });
        }, 140);
      }, { passive: true });
    }
  }

  /* ---------- actions ---------- */
  PN.use({
    'terms-accept': () => {
      if (!document.getElementById('terms-ok').checked) return PN.toast('צריך לסמן שקראת את התנאים');
      L.set(s => { s.terms = true; }, { rebuild: false });
      if (!S().profile.program && !location.hash.startsWith('#f=') && !location.hash.startsWith('#b=')) location.hash = '#/build/me';
      render(); PN.handleHash(() => { location.hash = '#/build/friends'; });
      L.compute(0);
    },
    alt: (el, i) => { L.set(s => { s.altIdx = +i; }, { rebuild: false }); const on = document.querySelector('.card.on'); if (on) on.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest', inline: 'center' }); },
    view: el => { ui.view = el.value; render(); },
    sem: (el, k) => { ui.sem = k; render(); },
    lesson: (el, gid) => { location.hash = '#/lesson/' + encodeURIComponent(gid); },
    back: () => history.length > 1 ? history.back() : (location.hash = '#/'),
    receipt: () => PN.dialog(receipt(), { title: 'הקבלה' }).then(() => { }),
    steps: () => {
      const r = route();
      PN.dialog(`<ol class="rl">${TRACKS[r.page].map(([k, t], i) => `<li><a href="#/${r.page}/${k}" class="rs${r.step === k ? ' cur' : ''}${done(r.page, k) ? ' done' : ''}" data-act="close-dlg"><span class="n">${done(r.page, k) && r.step !== k ? icon('check') : i + 1}</span><span>${t}</span></a></li>`).join('')}</ol>
        <p class="row"><a class="btn ghost" href="#/${r.page === 'build' ? 'improve' : 'build'}/${nextStep(r.page === 'build' ? 'improve' : 'build')}" data-act="close-dlg">${icon('swap')}<span>למסלול ${r.page === 'build' ? 'שיפור מערכת' : 'מערכת חדשה'}</span></a></p>`, { title: TRACK_NAME[r.page] });
    },
    'close-dlg': () => setTimeout(PN.closeDialog),
    tour: () => tour(0),
    'tour-n': (el, i) => { PN.closeDialog(); setTimeout(() => tour(+i)); },
    'map-week': () => { location.hash = '#/build/results'; },
    'im-load': (el, src) => { PN.A['im-load'](el, src); location.hash = '#/improve/check'; },
    'im-continue': () => { L.improveStart(); location.hash = '#/improve/change'; },
    'im-search': () => { PN.A['im-search'](); location.hash = '#/improve/proposals'; },
    'im-new': async () => { if (await PN.confirm('טעינת מערכת אחרת', 'המערכת הנוכחית וההצעות יוחלפו.', 'טעינה')) { L.S.improve = null; L.save(); render(); } },
    'im-where': (el, c) => { PN.A['im-where'](el, c); setTimeout(() => { const h = document.querySelector('.hl'); if (h) h.scrollIntoView({ block: 'center' }); }); },
    menu: () => PN.dialog(`<nav class="menu" aria-label="תפריט">
        <a class="btn" href="#/" data-act="close-dlg">${icon('home')}<span>בית</span></a><a class="btn" href="#/me" data-act="close-dlg">${icon('user')}<span>המצב שלי</span></a>
        <a class="btn" href="#/map" data-act="close-dlg">${icon('map')}<span>מפת התקדמות</span></a><a class="btn" href="#/info" data-act="close-dlg">${icon('info')}<span>מידע ותנאים</span></a>
        ${btn('tour-n', 'סיור קצר', { arg: 0, ic: 'route' })}<a class="btn" href="#/states" data-act="close-dlg">${icon('warn')}<span>מצבים נדירים (להדגמה)</span></a>
        ${btn('theme', 'ערכת צבעים: לפי המכשיר', { arg: 'auto', ic: 'auto' })}${btn('theme', 'בהירה', { arg: 'light', ic: 'sun' })}${btn('theme', 'כהה', { arg: 'dark', ic: 'moon' })}
        ${btn('erase', 'מחיקת כל הנתונים', { ic: 'trash' })}
        <a class="btn" href="../fresh-a/">${icon('swap')}<span>לקונספט א׳</span></a><a class="btn" href="../">${icon('home')}<span>חזרה לבחירת קונספט</span></a></nav>`, { title: 'תפריט' })
  });
  const origYear = PN.A.year;
  PN.A.year = el => { const first = !S().profile.year; origYear(el); if (first && !S().tourSeen) setTimeout(async () => { if (await PN.confirm('סיור קצר?', 'שלוש שקופיות על איך זה עובד. אפשר לחזור אליו מהתפריט.', 'יאללה', { cancel: 'לא עכשיו' })) tour(0); else L.set(s => { s.tourSeen = true; }, { rebuild: false }); }, 400); };
  window.addEventListener('hashchange', () => { if (/^#(f|b)=/.test(location.hash)) PN.handleHash(() => { location.hash = '#/build/friends'; }); else render(); });

  render();
  if (S().terms) { PN.handleHash(() => { location.hash = '#/build/friends'; }); L.compute(0); }
})();
