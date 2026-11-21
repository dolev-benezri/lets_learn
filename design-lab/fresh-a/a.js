/* Concept A — "הלוח": the week is always on screen, like a map in a maps app.
   Every tool is a sheet over it (bottom sheet on a phone, docked panel on a computer). */
'use strict';
(() => {
  const L = window.LL, PN = window.PN, C = L.C, G = L.G;
  const { icon, btn, esc } = PN;
  const app = document.getElementById('app');
  const desk = matchMedia('(min-width: 1024px)');
  const ui = { sheet: null, back: null, layer: null, tour: -1, sem: 'א', infoOpen: false };

  L.load('ll-fresh-a');
  // deep links (also used for the screenshots): ?mode=improve&sheet=me&layer=map&alt=2&lesson=first
  const Q = new URLSearchParams(location.search);
  PN.demoSeed();
  if (Q.get('mode')) L.S.modeA = Q.get('mode');
  if (Q.get('sheet')) ui.sheet = Q.get('sheet');
  if (Q.get('layer')) ui.layer = Q.get('layer');
  if (Q.get('alt')) L.S.altIdx = +Q.get('alt') - 1;
  if (Q.get('lesson')) L.on(function once() {
    const p = PN.pair();
    if (!ui.lessonDone && p && p.A.sel.length && !L.computing) { ui.lessonDone = 1; PN.ui.lesson = p.A.sel[0].main.id; ui.sheet = 'lesson'; setTimeout(render); }
  });
  PN.applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', PN.applyTheme);
  desk.addEventListener('change', render);
  L.on(render);

  const S = () => L.S;
  const mode = () => S().modeA || 'new';
  const SHEETS = {
    new: [['me', 'המצב שלי', 'user'], ['courses', 'קורסים', 'list'], ['prefs', 'רצונות', 'sliders'], ['friends', 'חברים', 'users'], ['out', 'להוציא', 'out']],
    improve: [['me', 'המצב שלי', 'user'], ['mine', 'המערכת שלי', 'file'], ['props', 'הצעות', 'target'], ['prefs', 'רצונות', 'sliders'], ['out', 'להוציא', 'out']]
  };
  const TITLES = { me: 'המצב שלי', courses: 'קורסים לסמסטר', prefs: 'מה חשוב לי', friends: 'חברים', out: 'להוציא את המערכת', mine: 'המערכת שלי', props: 'הצעות לשיפור', lesson: 'פרטי שיעור', info: 'מידע ותנאים' };

  /* ---------- render ---------- */
  function render() {
    PN.keep(() => { app.innerHTML = S().terms ? shell() : termsGate(); });
    afterRender();
  }
  function termsGate() {
    return `<div class="gate"><div class="gate-board" aria-hidden="true">${ghostBoard()}</div>
      <main class="gate-card" aria-labelledby="gt"><p class="eyebrow">מתכנן מערכת · לא רשמי · אפקה</p><h1 id="gt">לפני שמתחילים</h1>${PN.termsBody()}
      <label class="cb"><input type="checkbox" id="terms-ok"> קראתי ואני מסכים/ה לתנאים</label>
      ${btn('terms-accept', 'מסכים/ה — לפתוח את הלוח', { cls: 'primary wide' })}</main></div>`;
  }
  function ghostBoard() {
    return `<div class="wk ghostwk"><div class="wk-body" style="--hours:10;--days:5"><div class="wk-times"></div>${[1, 2, 3, 4, 5].map(() => '<div class="wk-day"></div>').join('')}</div></div>`;
  }
  function shell() {
    const sheet = currentSheet();
    return `<a class="skip" href="#board" data-act="skip">דילוג ללוח</a>
      <header class="top">
        <div class="brand">${logo()}<div><b>הלוח</b><small>מתכנן מערכת · לא רשמי</small></div></div>
        <div class="modes" role="tablist" aria-label="מה עושים">
          ${['new', 'improve'].map(m => `<button type="button" role="tab" aria-selected="${mode() === m}" class="mode${mode() === m ? ' on' : ''}" data-act="mode" data-arg="${m}">${icon(m === 'new' ? 'grid' : 'wand')}<span>${m === 'new' ? 'מערכת חדשה' : 'שיפור מערכת קיימת'}</span></button>`).join('')}
        </div>
        <div class="top-act">
          <button type="button" class="icb" data-act="theme" aria-label="${PN.themeLabel()}" title="${PN.themeLabel()}">${PN.themeIcon()}</button>
          <button type="button" class="icb" data-act="menu" aria-label="תפריט">${icon('menu')}</button>
        </div>
      </header>
      <div class="status">
        <button type="button" class="fresh" data-act="sheet" data-arg="info"><span>${icon('clock')} עודכן ${L.fmtDate(L.D.DATA_UPDATED)} · לא רשמי · ההרשמה באפקה-נט</span><span class="notice-1">${icon('info')} <b>הודעה:</b> ${esc(L.D.NOTICE)}</span></button>
        ${PN.systemBanners()}
      </div>
      <div class="stage${sheet ? ' has-sheet' : ''}${mode() === 'improve' ? ' no-alts' : ''}">
        ${sheet ? `<button type="button" class="scrim" data-act="close-sheet" aria-label="סגירת החלונית"></button>` : ''}
        <section class="panel" id="panel" aria-labelledby="panel-t"${!sheet ? ' hidden' : ''}>${sheet ? panel(sheet) : ''}</section>
        <section class="board" id="board" tabindex="-1" aria-label="הלוח — המערכת השבועית">${ui.layer ? layer() : board()}</section>
        ${desk.matches && mode() === 'new' ? `<aside class="alts" aria-label="חלופות">${altsColumn()}</aside>` : ''}
        <nav class="dock" aria-label="כלים">${SHEETS[mode()].map(([k, t, ic]) => `<button type="button" class="dk${sheet === k ? ' on' : ''}" data-act="sheet" data-arg="${k}" aria-pressed="${sheet === k}">${icon(ic)}<span>${t}</span>${badge(k)}</button>`).join('')}</nav>
      </div>
      ${ui.tour >= 0 ? tourCard() : ''}`;
  }
  const logo = () => `<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><rect x="2" y="2" width="28" height="28" rx="8"/><path d="M9 10h5v6H9zM18 13h5v9h-5zM9 19h5v4H9z"/></svg>`;
  function badge(k) {
    if (k === 'friends' && S().friends.length) return `<i class="bdg">${S().friends.length}</i>`;
    if (k === 'mine' && S().improve && S().improve.stage === 'review') return `<i class="bdg warn">!</i>`;
    if (k === 'props' && S().improve && S().improve.proposals && S().improve.proposals.list.length) return `<i class="bdg">${S().improve.proposals.list.length}</i>`;
    return '';
  }
  function currentSheet() {
    if (ui.sheet) return ui.sheet;
    if (desk.matches) return mode() === 'new' ? (S().profile.program ? 'courses' : 'me') : 'mine';
    return null;
  }

  /* ---------- the panel / sheet ---------- */
  function panel(k) {
    const back = k === 'lesson' && ui.back ? btn('sheet', '', { arg: ui.back, ic: 'back', cls: 'icb', aria: 'חזרה' }) : '';
    return `<div class="sh-grip" aria-hidden="true"></div><div class="sh-h">${back}<h2 id="panel-t">${TITLES[k]}</h2>
      ${desk.matches && k !== 'lesson' ? '' : btn('close-sheet', '', { ic: 'close', cls: 'icb', aria: 'סגירה' })}</div>
      <div class="sh-b" data-keep="sh-${k}">${sheetBody(k)}</div>`;
  }
  function sheetBody(k) {
    const s = S();
    switch (k) {
      case 'me': {
        if (!s.profile.program || !s.profile.year) return `<p class="lead">נתחיל ממה שאת/ה לומד/ת. אפשר לשנות אחר כך.</p>${PN.profileForm()}`;
        const co = L.cohort();
        return `<div class="prof"><div><b>${co.p.name}</b><span>מסלול ${esc(s.profile.track)} · שנה ${L.YEARS[s.profile.year - 1]} · מחזור ${co.used}</span></div>${btn('layer', 'מפת התקדמות', { arg: 'map', ic: 'map', cls: 'sm' })}</div>
          ${PN.turnBlock()}${PN.progressBlock()}
          <details class="acc"><summary>מה עברתי</summary>${PN.passedEditor()}</details>
          <details class="acc"><summary>שינוי תוכנית או שנה</summary>${PN.profileForm()}</details>
          <details class="acc"><summary>התמחות</summary>${PN.specBlock()}</details>`;
      }
      case 'courses': return `${PN.planBlock()}${PN.capBlock()}<h4>הקורסים הפתוחים לך</h4><p class="small muted">לכל קורס: חובה, אולי או לא.</p>${PN.courseChooser()}<h4>נעיצות</h4>${PN.pinsBlock()}`;
      case 'prefs': return PN.prefsAll();
      case 'friends': return PN.friendsPanel();
      case 'out': {
        if (mode() === 'improve') {
          const ip = PN.imPair(), sem = (s.improve && s.improve.sem) || 'א';
          return `<p class="small muted">${icon('info')} מוציאים את המערכת המשופרת (אחרי שמירת הצעה).</p><h4>מבחנים</h4>${ip ? PN.examsBlock(ip.A.sel) : '<p class="muted">אין עדיין מערכת.</p>'}${PN.exportPanel(sem, ip)}`;
        }
        const sel = PN.semSel(ui.sem);
        return `<h4>מבחנים</h4>${PN.examsBlock(sel) || '<p class="muted">אין עדיין מערכת.</p>'}${PN.exportPanel(ui.sem)}`;
      }
      case 'mine': {
        const I = s.improve;
        if (!I) return PN.imLoad();
        if (I.stage === 'review') return PN.imReview();
        return PN.imEdit() + `<p class="row">${btn('im-new', 'טעינת מערכת אחרת', { cls: 'sm ghost', ic: 'upload' })}</p>`;
      }
      case 'props': {
        const I = s.improve;
        if (!I || I.stage !== 'edit') return `<div class="state">${icon('target')}<p>קודם טוענים את המערכת שלך ב"המערכת שלי".</p>${btn('sheet', 'המערכת שלי', { arg: 'mine', cls: 'primary' })}</div>`;
        return PN.imProposals() || `<div class="state">${icon('search')}<p>מסמנים מה יכול לזוז, בוחרים מטרה, ו"חיפוש הצעות".</p>${btn('sheet', 'למטרה ולשינויים', { arg: 'mine' })}</div>`;
      }
      case 'lesson': return PN.lessonDetail(PN.ui.lesson);
      case 'info': return `${PN.infoBlock()}<h4>תנאי השימוש בקצרה</h4>${PN.termsBody()}`;
    }
    return '';
  }

  /* ---------- the board ---------- */
  function board() {
    if (mode() === 'improve') return improveBoard();
    const block = PN.stateBlock();
    const r = L.results;
    const p = PN.pair();
    let top = '';
    if (r && r.alts.length && !L.computing) {
      const n = r.alts.length, i = S().altIdx;
      top = `<div class="altbar">
        <div class="alt-nav">${btn('alt', '', { arg: i - 1, ic: 'back', cls: 'icb', dis: i === 0, aria: 'החלופה הקודמת' })}
          <div class="alt-t" aria-live="polite"><b>חלופה ${i + 1}</b><small>מתוך ${n}${p.A.split ? ' · פיצול' : ''}</small></div>
          ${btn('alt', '', { arg: i + 1, ic: 'fwd', cls: 'icb', dis: i >= n - 1, aria: 'החלופה הבאה' })}
          ${desk.matches ? '' : `<label class="ord"><span class="vh">מיון</span>${PN.sel('order-sel', S().order, [['balanced', 'מאוזן'], ['credits', 'הכי הרבה נ"ז'], ['friends', 'הכי הרבה חברים'], ['unlocks', 'פותח הכי הרבה']], { label: 'מיון' })}</label>`}
        </div>
        ${S().plan.mode === 'year' || S().plan.summer ? semTabs() : ''}
        ${ui.sem === 'קיץ' ? summerStats() : PN.altStats(p, ui.sem)}
        <details class="alt-more"${desk.matches ? ' open' : ''}><summary>${moreLine(p, i)}</summary>
        ${PN.altDiff(i)}
        ${S().plan.mode === 'year' && p.missReq.length ? PN.note('חסרים בתוכנית השנתית: ' + p.missReq.map(id => C[id].name).join(', '), 'mid') : ''}
        ${PN.altLeftOut(p)}${PN.resultNotes()}</details></div>`;
    }
    const items = p ? PN.weekItems(PN.semSel(ui.sem)) : PN.weekItems([]);
    return `${top}<div class="wk-scroll" data-keep="board">${block ? (p && L.computing ? `<div class="computing-over">${block}</div>` + PN.weekGrid(items) : block) : PN.weekGrid(items, { label: 'מערכת שבועית, חלופה ' + (S().altIdx + 1) })}</div>${PN.planNote()}`;
  }
  function moreLine(p, i) {
    const r = L.results, parts = [];
    if (r.cut) parts.push(`${icon('warn', 'wi')}<b>לא הכול נבדק</b>`);
    const lo = L.leftOut(p.A, r.courses || []).length;
    if (lo) parts.push(`${lo} קורסים בחוץ`);
    if (i > 0) parts.push('מה שונה מחלופה 1');
    if (r.fallback || (r.notes || []).length) parts.push('הערות');
    return parts.length ? parts.join(' · ') : 'פרטי החלופה';
  }
  function semTabs() {
    const r = L.results, tabs = [['א', 'סמסטר א׳']];
    if (S().plan.mode === 'year') tabs.push(['ב', 'סמסטר ב׳']);
    if (S().plan.summer) tabs.push(['קיץ', 'קיץ']);
    return `<div class="semtabs" role="tablist" aria-label="סמסטר">${tabs.map(([k, t]) => `<button type="button" role="tab" aria-selected="${ui.sem === k}" class="st${ui.sem === k ? ' on' : ''}" data-act="sem" data-arg="${k}">${t}</button>`).join('')}</div>`;
  }
  function summerStats() {
    const su = L.results.summer;
    return su ? `<ul class="sum"><li><b>${su.m.credits}</b><span>נ"ז בקיץ</span></li><li><b>${su.m.days.length}</b><span>ימים</span></li></ul><p class="small muted">נבנה מעל התוכנית שנבחרה ונספר בהתקדמות.</p>` : PN.note('אין קורס קיץ שמתאים לתוכנית הזאת.', 'info');
  }
  function improveBoard() {
    const I = S().improve;
    if (!I || I.stage !== 'edit') return `<div class="board-empty">${icon('wand', 'big')}<h2>יש לך כבר מערכת?</h2><p>טוענים אותה, מסמנים מה נשאר ומה יכול לזוז, ובוחרים מטרה — יום פנוי, פחות חלונות, לסיים מוקדם.</p>
      ${btn('sheet', I ? 'להמשיך לבדיקת השורות' : 'טעינת המערכת שלי', { arg: 'mine', cls: 'primary', ic: 'upload' })}</div>`;
    const r = I.proposals, list = r && r.recVer === S().recVer ? r.list : [];
    const i = PN.ui.prop;
    const top = list.length ? `<div class="altbar"><div class="alt-nav">${btn('im-prop', '', { arg: Math.max(0, i - 1), ic: 'back', cls: 'icb', dis: i === 0, aria: 'ההצעה הקודמת' })}
        <div class="alt-t" aria-live="polite"><b>הצעה ${i + 1}</b><small>מתוך ${list.length}</small></div>${btn('im-prop', '', { arg: Math.min(list.length - 1, i + 1), ic: 'fwd', cls: 'icb', dis: i >= list.length - 1, aria: 'ההצעה הבאה' })}
        ${btn('sheet', 'פרטים', { arg: 'props', cls: 'sm' })}</div><p class="prop-gain">${L.improveExplain(list[i])}</p><p class="small muted">מסגרת מקווקוות = איפה השיעור היה.</p></div>`
      : `<div class="altbar"><p><b>המערכת הנוכחית</b> · ${I.items.filter(x => x.move).length} קורסים יכולים לזוז</p></div>`;
    return `${top}<div class="wk-scroll" data-keep="board">${PN.weekGrid(PN.imWeekItems(), { label: 'המערכת הנוכחית' })}</div>${PN.planNote()}`;
  }
  function altsColumn() {
    const r = L.results;
    if (!r || !r.alts) return `<h2 class="col-t">חלופות</h2><p class="muted small">${L.computing ? 'מחשבים…' : 'יופיעו כאן אחרי הבנייה.'}</p>`;
    return `<h2 class="col-t">חלופות</h2>${PN.orderSel()}<ol class="alt-list">${r.alts.map((p, i) => `<li><button type="button" class="alt-card${i === S().altIdx ? ' on' : ''}" data-act="alt" data-arg="${i}" aria-current="${i === S().altIdx}">
        <span class="rank">${i + 1}</span><span class="ac-b"><b>${p.A.m.credits} נ"ז · ${p.A.m.days.length} ימים</b><small>${p.A.m.gapH.toFixed(1).replace('.0', '')} ש׳ חלון · ${p.A.m.shared} עם חברים${p.A.split ? ' · פיצול' : ''}</small>${miniWeek(p.A)}</span></button></li>`).join('')}</ol>`;
  }
  function miniWeek(a) {
    return `<span class="mini" aria-hidden="true">${[1, 2, 3, 4, 5].map(d => { const ms = a.sel.flatMap(o => o.meet).filter(m => m.d === d); return `<i>${ms.map(m => `<em class="${PN.color(m.g.course)}" style="top:${(m.s - 480) / 8.4}%;height:${(m.e - m.s) / 8.4}%"></em>`).join('')}</i>`; }).join('')}</span>`;
  }

  /* ---------- layers over the board: progress map, states ---------- */
  function layer() {
    const t = ui.layer === 'map' ? 'מפת התקדמות' : 'מצבים נדירים';
    return `<div class="layer"><div class="layer-h"><h2>${t}</h2>${btn('layer-close', 'חזרה ללוח', { ic: 'close', cls: 'sm' })}</div><div class="layer-b" data-keep="layer">${ui.layer === 'map' ? PN.mapView() : PN.statesPage()}</div></div>`;
  }

  /* ---------- tour ---------- */
  const TOUR = [
    ['.board', 'זה הלוח: המערכת השבועית תמיד כאן. נוגעים בשיעור כדי לראות פרטים ולנעוץ.'],
    ['.alt-nav', 'מחליפים חלופה בחצים או בהחלקה על הלוח ימינה ושמאלה.'],
    ['.dock', 'כל הכלים כאן למטה: המצב שלי, קורסים, רצונות, חברים, ולהוציא את המערכת.'],
    ['.modes', 'יש לך כבר מערכת? עוברים ל"שיפור מערכת קיימת".']
  ];
  function tourCard() {
    const [, t] = TOUR[ui.tour];
    return `<div class="tour" role="dialog" aria-modal="false" aria-labelledby="tour-t"><p id="tour-t"><b>סיור ${ui.tour + 1}/${TOUR.length}</b> ${t}</p>
      <div class="row">${btn('tour-next', ui.tour < TOUR.length - 1 ? 'הבא' : 'סיום', { cls: 'primary sm' })}${btn('tour-end', 'דילוג', { cls: 'ghost sm' })}</div></div>`;
  }

  /* ---------- after render: focus, swipe, tour highlight ---------- */
  function afterRender() {
    document.querySelectorAll('.tour-hl').forEach(e => e.classList.remove('tour-hl'));
    if (ui.tour >= 0) { const el = document.querySelector(TOUR[ui.tour][0]); if (el) el.classList.add('tour-hl'); }
    const b = document.querySelector('.wk-scroll');
    if (b && !b._sw && mode() === 'new') {
      b._sw = 1; let x0 = null, y0 = 0;
      b.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') { x0 = e.clientX; y0 = e.clientY; } });
      b.addEventListener('pointerup', e => {
        if (x0 == null) return; const dx = e.clientX - x0, dy = e.clientY - y0; x0 = null;
        const n = (L.results && L.results.alts.length) || 0;
        if (Math.abs(dx) > 70 && Math.abs(dy) < 50 && n) { const i = S().altIdx + (dx < 0 ? 1 : -1); if (i >= 0 && i < n) go(i); }
      });
    }
    // a computer starts with the whole map; a phone starts readable, at year א, and can fit or zoom out
    if (ui.layer === 'map' && !ui.mapFit) { ui.mapFit = 1; if (desk.matches) setTimeout(() => PN.A['map-zoom'](null, 'fit')); else { Object.assign(PN.ui.mapZoom, { k: 0.75, x: 0, y: 0 }); setTimeout(render); } }
    if (ui.layer !== 'map') ui.mapFit = 0;
    if (ui.focusPanel) { ui.focusPanel = false; const h = document.getElementById('panel-t'); if (h) { h.tabIndex = -1; h.focus(); } }
  }
  const go = i => L.set(s => { s.altIdx = i; }, { rebuild: false });

  /* ---------- actions ---------- */
  PN.use({
    'terms-accept': () => {
      if (!document.getElementById('terms-ok').checked) return PN.toast('צריך לסמן שקראת את התנאים');
      L.set(s => { s.terms = true; }, { rebuild: false });
      if (!S().profile.program) { ui.sheet = 'me'; ui.focusPanel = true; }
      render(); PN.handleHash(() => { ui.sheet = 'friends'; });
      L.compute(0);
    },
    mode: (el, m) => { L.set(s => { s.modeA = m; }, { rebuild: false }); ui.sheet = desk.matches ? null : ui.sheet && SHEETS[m].some(x => x[0] === ui.sheet) ? ui.sheet : null; ui.layer = null; render(); },
    sheet: (el, k) => { ui.back = null; ui.sheet = !desk.matches && ui.sheet === k ? null : k; ui.layer = null; ui.focusPanel = true; render(); },
    'close-sheet': () => { ui.sheet = null; render(); const b = document.getElementById('board'); if (b) b.focus(); },
    lesson: (el, gid) => { PN.ui.lesson = gid; ui.back = currentSheet() !== 'lesson' ? currentSheet() : ui.back; ui.sheet = 'lesson'; ui.focusPanel = true; render(); },
    alt: (el, i) => go(+i),
    'im-where': (el, c) => { PN.A['im-where'](el, c); if (!desk.matches) { ui.sheet = null; render(); } },
    'order-sel': el => PN.A.order(el),
    sem: (el, k) => { ui.sem = k; render(); },
    layer: (el, k) => { ui.layer = k; if (!desk.matches) ui.sheet = null; render(); },
    'layer-close': () => { ui.layer = null; render(); },
    'map-week': () => { ui.layer = null; render(); },
    'im-new': async () => { if (await PN.confirm('טעינת מערכת אחרת', 'המערכת הנוכחית וההצעות יוחלפו.', 'טעינה')) { L.S.improve = null; L.save(); render(); } },
    menu: () => {
      PN.dialog(`<nav class="menu" aria-label="תפריט">
        ${btn('m-go', 'מידע, עדכון ותנאים', { arg: 'info', ic: 'info' })}${btn('m-go', 'מפת התקדמות', { arg: 'map', ic: 'map' })}
        ${btn('m-go', 'סיור קצר', { arg: 'tour', ic: 'route' })}${btn('m-go', 'מצבים נדירים (להדגמה)', { arg: 'states', ic: 'warn' })}
        ${btn('theme', 'ערכת צבעים: לפי המכשיר', { arg: 'auto', ic: 'auto' })}${btn('theme', 'בהירה', { arg: 'light', ic: 'sun' })}${btn('theme', 'כהה', { arg: 'dark', ic: 'moon' })}
        ${btn('m-go', 'מחיקת כל הנתונים', { arg: 'erase', ic: 'trash' })}
        <a class="btn" href="../fresh-b/">${icon('swap')}<span>לקונספט ב׳</span></a><a class="btn" href="../">${icon('home')}<span>חזרה לבחירת קונספט</span></a></nav>`, { title: 'תפריט' });
    },
    'm-go': (el, k) => {
      PN.closeDialog();
      if (k === 'info') { ui.sheet = 'info'; ui.focusPanel = true; render(); }
      if (k === 'map' || k === 'states') { ui.layer = k; if (!desk.matches) ui.sheet = null; render(); }
      if (k === 'tour') { ui.sheet = null; ui.tour = 0; render(); }
      if (k === 'erase') PN.A.erase();
    },
    'tour-next': () => { ui.tour = ui.tour < TOUR.length - 1 ? ui.tour + 1 : -1; if (ui.tour < 0) L.set(s => { s.tourSeen = true; }, { rebuild: false }); render(); },
    'tour-end': () => { ui.tour = -1; L.set(s => { s.tourSeen = true; }, { rebuild: false }); render(); }
  });
  // after the profile is first set, offer the tour once
  const origYear = PN.A.year;
  PN.A.year = el => { const first = !S().profile.year; origYear(el); if (first && !S().tourSeen) setTimeout(async () => { if (await PN.confirm('סיור קצר?', 'ארבעה צעדים, פחות מדקה. אפשר להפעיל שוב מהתפריט.', 'יאללה', { cancel: 'לא עכשיו' })) { ui.sheet = null; ui.tour = 0; render(); } else L.set(s => { s.tourSeen = true; }, { rebuild: false }); }, 400); };
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !document.querySelector('dialog[open]')) {
      if (ui.tour >= 0) { ui.tour = -1; render(); } else if (ui.layer) { ui.layer = null; render(); } else if (ui.sheet && !desk.matches) { ui.sheet = null; render(); }
    }
  });
  window.addEventListener('hashchange', () => PN.handleHash(() => { ui.sheet = 'friends'; }));

  render();
  if (S().terms) { PN.handleHash(() => { ui.sheet = 'friends'; }); L.compute(0); }
})();
