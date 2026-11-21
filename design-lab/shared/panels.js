/* Shared content blocks (HTML strings) and actions. Each concept places them in its own
   navigation and styles them with its own tokens; the blocks themselves carry no layout. */
'use strict';
window.PN = (() => {
  const L = window.LL, D = L.D, C = L.C, G = L.G;
  const esc = L.esc, num = L.num, hm = L.hm;
  const ui = {
    gi: { stage: 'idle', picks: {} }, fr: null, probe: null, lesson: null, mapZoom: { k: 1, x: 0, y: 0 },
    map: { filter: 'all', initials: false, list: false }, busyEdit: null, prop: 0, profileErr: null, profileBusy: false,
    showWhere: null, imAdd: '', regOpen: false, share: null, advPdf: 'idle'
  };
  const A = {}; // actions

  /* ---------- icons (inline SVG, drawn here) ---------- */
  const P = {
    close: 'M6 6l12 12M18 6L6 18', back: 'M9 6l6 6-6 6', fwd: 'M15 6l-6 6 6 6', down: 'M6 9l6 6 6-6', up: 'M6 15l6-6 6 6',
    check: 'M5 12l5 5 9-10', plus: 'M12 5v14M5 12h14', minus: 'M5 12h14', lock: 'M7 11V8a5 5 0 0110 0v3M5 11h14v9H5z',
    move: 'M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4', pin: 'M9 4h6l-1 6 4 3H6l4-3zM12 13v8', user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
    users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20a7 7 0 0114 0M16 4.5a3.5 3.5 0 010 6.5M18 13.5a6.5 6.5 0 014 6.5',
    sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4', list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
    out: 'M12 3v12M7 8l5-5 5 5M5 14v6h14v-6', cal: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5', copy: 'M8 8h11v12H8zM5 16V4h11',
    share: 'M18 8a3 3 0 100-6 3 3 0 000 6zM6 15a3 3 0 100-6 3 3 0 000 6zM18 22a3 3 0 100-6 3 3 0 000 6zM8.6 13.5l6.8 4M15.4 6.5l-6.8 4',
    link: 'M10 14a4 4 0 006 0l3-3a4 4 0 00-6-6l-1 1M14 10a4 4 0 00-6 0l-3 3a4 4 0 006 6l1-1', upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
    camera: 'M4 8h4l2-3h4l2 3h4v11H4zM12 17a3.5 3.5 0 100-7 3.5 3.5 0 000 7z', file: 'M6 3h8l4 4v14H6zM14 3v4h4', search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5',
    info: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 11v6M12 7h.01', warn: 'M12 3l10 18H2zM12 10v5M12 18h.01', sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
    moon: 'M21 13A9 9 0 1111 3a7 7 0 0010 10z', auto: 'M12 3a9 9 0 100 18zM12 3a9 9 0 010 18', map: 'M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4', eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
    eyeoff: 'M3 3l18 18M10.6 6.1A10 10 0 0112 6c6 0 10 6 10 6a17 17 0 01-3 3.6M6.6 6.6C3.8 8.4 2 12 2 12s4 7 10 7a9 9 0 004.4-1.1', undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
    clock: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2', star: 'M12 3l2.8 5.8 6.2.9-4.5 4.4 1 6.3L12 17.5 6.5 20.4l1-6.3L3 9.7l6.2-.9z', refresh: 'M20 11a8 8 0 10-2.3 5.7M20 4v7h-7',
    menu: 'M4 6h16M4 12h16M4 18h16', dl: 'M12 4v12M7 11l5 5 5-5M4 20h16', print: 'M6 9V3h12v6M6 17H4v-7h16v7h-2M7 14h10v7H7z', grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
    route: 'M6 19a2 2 0 100-4 2 2 0 000 4zM18 9a2 2 0 100-4 2 2 0 000 4zM6 15V9a4 4 0 014-4h6M18 9v6a4 4 0 01-4 4H8', wand: 'M4 20L16 8M14 4v3M19 9h3M18 4l-2 2M20 14l-2-2', home: 'M3 11l9-8 9 8M5 9v12h14V9',
    swap: 'M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7', target: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 17a5 5 0 100-10 5 5 0 000 10zM12 13a1 1 0 100-2 1 1 0 000 2z'
  };
  const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${P[n] || P.info}"/></svg>`;

  /* ---------- small builders ---------- */
  const ids = Object.keys(C).filter(id => C[id].groups.length).sort();
  const color = cid => 'c' + (ids.indexOf(cid) % 10 + 10) % 10;
  const kindName = k => k === 'lec' ? 'הרצאה' : k === 'lab' ? 'מעבדה' : 'תרגול';
  const meetText = m => `${L.DAYL[m.d]} ${L.rng(m.s, m.e)}`;
  const btn = (act, label, { arg = '', cls = '', ic = '', dis = false, aria = '', title = '' } = {}) =>
    `<button type="button" class="btn ${cls}" data-act="${act}"${arg !== '' ? ` data-arg="${esc(arg)}"` : ''}${dis ? ' disabled' : ''}${aria ? ` aria-label="${esc(aria)}"` : ''}${title ? ` title="${esc(title)}"` : ''}>${ic ? icon(ic) : ''}${label ? `<span>${label}</span>` : ''}</button>`;
  let segN = 0;
  // segmented radio group: native radios, so arrow keys and screen readers work
  function seg(act, value, opts, { arg = '', label = '', cls = '', dis = false } = {}) {
    const n = 'sg' + (++segN);
    return `<div class="seg ${cls}" role="radiogroup"${label ? ` aria-label="${esc(label)}"` : ''}>` + opts.map(([v, t]) =>
      `<label class="seg-o"><input type="radio" name="${n}" value="${esc(v)}" data-act-change="${act}" data-arg="${esc(arg)}"${String(v) === String(value) ? ' checked' : ''}${dis ? ' disabled' : ''}><span>${t}</span></label>`).join('') + '</div>';
  }
  const sw = (act, on, label, { arg = '', hint = '' } = {}) =>
    `<label class="sw"><input type="checkbox" role="switch" data-act-change="${act}" data-arg="${esc(arg)}"${on ? ' checked' : ''}><span class="sw-t"></span><span class="sw-l">${label}${hint ? `<small>${hint}</small>` : ''}</span></label>`;
  const note = (t, lvl = 'info') => `<div class="note note-${lvl}" role="${lvl === 'high' ? 'alert' : 'note'}">${icon(lvl === 'info' ? 'info' : 'warn')}<div>${t}</div></div>`;
  const chip = (t, cls = '') => `<span class="chip ${cls}">${t}</span>`;
  const sel = (act, value, opts, { arg = '', label = '', id = '' } = {}) =>
    `<select class="inp" data-act-change="${act}" data-arg="${esc(arg)}"${label ? ` aria-label="${esc(label)}"` : ''}${id ? ` id="${id}"` : ''}>` +
    opts.map(([v, t]) => `<option value="${esc(v)}"${String(v) === String(value) ? ' selected' : ''}>${t}</option>`).join('') + '</select>';
  const hours = (from = 7, to = 22) => Array.from({ length: to - from + 1 }, (_, i) => [from + i, pad2(from + i) + ':00']);
  const pad2 = n => String(n).padStart(2, '0');
  const S = () => L.S;
  const set = (fn, o) => L.set(fn, o);

  /* ---------- dialog, toast, copy fallback ---------- */
  let dlgResolve = null;
  function dialog(html, { title = '', wide = false, cls = '' } = {}) {
    let d = document.getElementById('dlg');
    if (!d) { d = document.createElement('dialog'); d.id = 'dlg'; document.body.appendChild(d); d.addEventListener('close', () => { if (dlgResolve) { dlgResolve(d.returnValue === 'ok'); dlgResolve = null; } }); }
    d.className = 'dlg ' + (wide ? 'dlg-wide ' : '') + cls;
    d.setAttribute('aria-labelledby', 'dlg-t');
    d.innerHTML = `<form method="dialog" class="dlg-in"><div class="dlg-h"><h2 id="dlg-t">${title}</h2><button class="icb" value="cancel" aria-label="סגירה">${icon('close')}</button></div><div class="dlg-b">${html}</div></form>`;
    if (!d.open) d.showModal();
    return new Promise(r => { dlgResolve = r; });
  }
  const closeDialog = () => { const d = document.getElementById('dlg'); if (d && d.open) d.close('cancel'); };
  const confirm = (title, body, ok = 'אישור', { danger = false, cancel = 'ביטול' } = {}) =>
    dialog(`<div class="dlg-text">${body}</div><div class="row end"><button class="btn" value="cancel">${cancel}</button><button class="btn ${danger ? 'danger' : 'primary'}" value="ok">${ok}</button></div>`, { title });
  function toast(t) {
    let el = document.getElementById('toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); document.body.appendChild(el); }
    el.textContent = t; el.classList.add('on'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('on'), 3200);
  }
  async function copyOrShow(text, what = 'הטקסט') {
    if (await L.copy(text)) return toast(what + ' הועתק');
    dialog(`<p>ההעתקה לא הצליחה בדפדפן הזה. אפשר לסמן ולהעתיק ידנית:</p><textarea class="inp manual" rows="8" readonly>${esc(text)}</textarea>`, { title: 'העתקה ידנית' });
    setTimeout(() => { const t = document.querySelector('#dlg textarea'); if (t) { t.focus(); t.select(); } }, 50);
  }

  /* ---------- trust and info ---------- */
  function termsBody(short = false) {
    return `<ul class="terms">
      <li><b>החלופות הן אפשרויות, לא המלצה.</b> הכלי מציע שילובים; ההחלטה שלך.</li>
      <li><b>לפני ההרשמה — שיחה עם יועץ/ת אקדמי/ת.</b></li>
      <li><b>מה נבדק:</b> התנגשויות שעות, דרישות קדם לפי הנתונים, תאריכי מבחנים ידועים, תקרת נ"ז. <b>מה לא נבדק:</b> אישורים מיוחדים, מקום פנוי ברגע ההרשמה, שינויים של הרגע האחרון.</li>
      <li><b>מערכת של מישהו אחר</b> — מעלים או משתפים רק בהסכמתו/ה.</li>
      <li><b>כל מי שמחזיק קישור שיתוף יכול לקרוא אותו.</b></li>
      <li>הכלי לא רשמי ולא קשור למכללה. ההרשמה עצמה נעשית באפקה-נט.</li></ul>
      ${short ? '' : `<p><button type="button" class="lnk" data-act="terms-full">התנאים המלאים</button></p>`}`;
  }
  function fullTerms() {
    dialog(`<div class="prose"><h3>תנאי שימוש (נוסח מלא — דמו)</h3><p>הכלי חינמי ולא רשמי. הנתונים נלקחים מהקטלוג הציבורי של המכללה ועלולים להיות שגויים או ישנים. אין לראות בחלופות המלצה אקדמית.</p><h3>פרטיות</h3><p>הכול נשמר רק בדפדפן שלך. גיליון ציונים נקרא בדפדפן בלבד ולא נשמר ולא נשלח. אין חשבון ואין שרת.</p><h3>נגישות</h3><p>האתר בנוי לעבודה במקלדת ובקורא מסך, בניגודיות AA. נתקלת בבעיה? כתבו לנו.</p><h3>בקשת הסרה</h3><p>אם המערכת שלך שותפה בלי הסכמתך, אפשר לבקש הסרה דרך הדיווח.</p></div>`, { title: 'תנאים ומדיניות', wide: true });
  }
  function infoBlock() {
    const co = L.cohort();
    const approved = co && co.p.id === 'me' ? `מאושר על ידי המחלקה · ${L.fmtDate(D.APPROVAL.me)}` : 'הנתונים לא אומתו · החוקים לא אושרו על ידי המחלקה';
    return `<div class="info-list">
      <p>${icon('clock')} <b>עודכן</b> ${L.fmtDate(D.DATA_UPDATED)}</p>
      <p>${icon('info')} <b>לא רשמי.</b> לא קשור למכללה. נתונים מהקטלוג הציבורי — ייתכנו טעויות. ההרשמה באפקה-נט היא הקובעת.</p>
      <p>${icon('check')} ${approved}</p>
      ${note('<b>מחלוקת בין מקורות:</b> ' + D.DISAGREEMENT, 'mid')}
      <nav class="links" aria-label="מידע וקישורים">
        <button type="button" class="lnk" data-act="terms-full">תנאי שימוש</button>
        <button type="button" class="lnk" data-act="terms-full">פרטיות</button>
        <button type="button" class="lnk" data-act="terms-full">הצהרת נגישות</button>
        <button type="button" class="lnk" data-act="terms-full">בקשת הסרה</button>
        <a class="lnk" href="mailto:report@example.invalid?subject=%D7%98%D7%A2%D7%95%D7%AA">דיווח על טעות (מייל)</a>
        <button type="button" class="lnk" data-act="catalog" data-arg="advising">ייעוץ אקדמי</button>
      </nav></div>`;
  }
  const noticeBar = () => `<div class="notice" role="status">${icon('info')}<span><b>הודעה:</b> ${D.NOTICE}</span></div>`;
  function systemBanners() {
    let out = '';
    if (!L.storageOk) out += note('<b>השינויים לא נשמרים</b> בדפדפן הזה (אחסון חסום או מלא). כדי לא לאבד אותם — <button type="button" class="lnk" data-act="backup-copy">העתיקו קישור גיבוי</button>.', 'high');
    if (L.otherTab) out += note('<b>הנתונים השתנו בלשונית אחרת.</b> <button type="button" class="lnk" data-act="reload">טעינה מחדש</button>', 'mid');
    return out;
  }

  /* ---------- profile ---------- */
  function profileForm() {
    const p = S().profile, prog = D.PROGRAMS.find(x => x.id === p.program);
    const co = L.cohort();
    let h = `<fieldset class="fs"><legend>תוכנית לימודים</legend><div class="pick-grid">` +
      D.PROGRAMS.map(x => `<label class="pick"><input type="radio" name="prog" value="${x.id}" data-act-change="program"${p.program === x.id ? ' checked' : ''}><span>${x.name}${x.tracks.length > 1 ? '<small>יום · ערב</small>' : ''}</span></label>`).join('') + '</div></fieldset>';
    if (ui.profileBusy) h += `<div class="loading" role="status"><span class="spin"></span>טוענים את נתוני התוכנית…</div>`;
    if (ui.profileErr) h += note(`<b>טעינת "${ui.profileErr}" נכשלה.</b> ${prog ? `נשארת הבחירה הקודמת: ${prog.name}.` : ''} <button type="button" class="lnk" data-act="program-retry">נסו שוב</button><br><small>באב־הטיפוס יש נתונים רק להנדסה מכנית.</small>`, 'high');
    if (prog && prog.tracks.length > 1) h += `<fieldset class="fs"><legend>מסלול</legend>${seg('track', p.track, prog.tracks.map(t => [t, t]), { label: 'מסלול' })}</fieldset>`;
    if (prog) {
      const yrs = prog.years[p.track || prog.tracks[0]];
      h += `<fieldset class="fs"><legend>שנת לימודים</legend>${seg('year', p.year, L.YEARS.slice(0, yrs).map((y, i) => [i + 1, y]), { label: 'שנה' })}</fieldset>`;
    }
    if (co) h += `<p class="muted">מחזור (שנת התחלה): <b>${co.start}</b>${co.sub ? ` — אין נתונים למחזור הזה, משתמשים במחזור <b>${co.sub}</b> במקומו.` : ''}</p>`;
    return h;
  }
  A.program = async (el) => {
    const id = el.value, prev = S().profile.program;
    ui.profileErr = null; ui.profileBusy = true; L.emit();
    await new Promise(r => setTimeout(r, 700));
    ui.profileBusy = false;
    if (id !== 'me') { ui.profileErr = D.PROGRAMS.find(x => x.id === id).name; ui.lastTry = id; if (prev !== id) { set(s => { s.profile.program = prev; }, { rebuild: false }); } return L.emit(); }
    set(s => { s.profile.program = id; s.profile.track = s.profile.track || 'יום'; s.recVer++; });
  };
  A['program-retry'] = () => A.program({ value: ui.lastTry || 'ee' });
  A.track = el => set(s => { s.profile.track = el.value; const y = D.PROGRAMS.find(x => x.id === s.profile.program).years[el.value]; if (s.profile.year > y) s.profile.year = null; s.recVer++; });
  A.year = el => set(s => { s.profile.year = +el.value; s.recVer++; });

  /* ---------- my record ---------- */
  function turnBlock() {
    if (ui.turnUnknown) return `<p class="muted">${icon('clock')} תור ההרשמה שלך: <b>לא ידוע</b> עדיין.</p>`;
    const opened = D.TURN < D.NOW, older = D.SEATS_READ < D.TURN;
    return `<p>${icon('clock')} תור ההרשמה שלך: <b>${L.fmtDate(D.TURN)}</b>${opened ? ' · כבר נפתח' : ''}</p>` +
      (opened && older ? note(`התור שלך נפתח, אבל נתוני המקומות נקראו לפני כן (${L.fmtDate(D.SEATS_READ)}). ייתכן שקבוצות התמלאו מאז.`, 'mid') : '');
  }
  function bar(done, req, mark) {
    const pct = req ? Math.min(100, done / req * 100) : 0;
    return `<div class="bar" role="img" aria-label="${done} מתוך ${req}"><i style="width:${pct}%"></i>${mark ? `<b class="mark" style="inset-inline-start:${mark * 100}%" title="סף 70%"></b>` : ''}</div>`;
  }
  function progressBlock() {
    const pr = L.progress();
    return `<div class="stats">
        <div class="stat"><b>${pr.avg ? pr.avg.toFixed(1) : '—'}</b><span>ממוצע משוקלל</span></div>
        <div class="stat"><b>${pr.done}</b><span>נ"ז הושלמו מתוך ${pr.total}</span></div>
        <div class="stat"><b>${Math.round(pr.pct * 100)}%</b><span>מדרישות השנים הקודמות</span></div></div>
      <div class="prog-row"><span>שנים קודמות: ${pr.prevDone} / ${pr.prevReq} נ"ז (סף 70%)</span>${bar(pr.prevDone, pr.prevReq, 0.7)}</div>
      <h4>דרישות שנותרו</h4>
      ${pr.groups.map(g => `<div class="prog-row"><span>${esc(g.label)}: ${g.done} / ${g.req}</span>${bar(g.done, g.req)}</div>`).join('')}
      <p class="muted small">${pr.missingCatalog} נ"ז חובה של שנה ג׳ עוד לא מופיעים בקטלוג.</p>
      ${pr.warnings.map(w => note(w.t, w.lvl)).join('')}`;
  }
  function specBlock() {
    const y = S().profile.year || 1;
    return `<fieldset class="fs"><legend>התמחות</legend><p class="small muted">${D.SPEC_RULE}${y < 3 ? ' אפשר לסמן כבר עכשיו כתכנון; הבחירה הרשמית בשנה ג׳.' : ''}</p>
      ${sel('spec', S().spec || '', [['', 'עוד לא בחרתי'], ...D.SPECS.map(x => [x, x])], { label: 'התמחות' })}</fieldset>`;
  }
  A.spec = el => set(s => { s.spec = el.value || null; }, { rebuild: false });
  function englishBlock() {
    const e = S().english;
    const sc = +e.score || 0;
    const res = !e.score ? 'הזינו ציון כדי לבדוק פטור' : sc >= 134 ? 'פטור מאנגלית מתקדמים א׳ וב׳' : sc >= 120 ? 'פטור מאנגלית מתקדמים א׳' : 'אין פטור — יש ללמוד את קורסי האנגלית';
    return `<fieldset class="fs"><legend>רמת אנגלית</legend><div class="row wrap">
      ${sel('english-exam', e.exam, [['אמירנט', 'אמירנט'], ['פסיכומטרי', 'פסיכומטרי (אנגלית)']], { label: 'סוג מבחן' })}
      <label class="fld"><span>ציון</span><input class="inp num" type="number" inputmode="numeric" min="50" max="150" value="${esc(e.score ?? '')}" data-act-change="english-score"></label></div>
      <p class="small">${res}</p></fieldset>`;
  }
  A['english-exam'] = el => set(s => { s.english.exam = el.value; });
  A['english-score'] = el => set(s => { s.english.score = el.value === '' ? null : Math.max(0, Math.min(150, +el.value)); s.recVer++; });

  const ST = [['none', 'לא נלקח'], ['pass', 'עבר'], ['fail', 'נכשל'], ['exempt', 'פטור']];
  function courseRow(id) {
    const c = C[id], st = L.status(id), r = S().record[id] || {};
    const shown = st === 'pass-default' ? 'pass' : st;
    return `<li class="rec-row" data-st="${shown}">
      <div class="rec-name"><b>${c.name}</b><small>${c.credits} נ"ז${st === 'pass-default' ? ' · עבר (הנחה — אפשר לתקן)' : ''}${st === 'fail' ? ' · בהצעה הבאה: חובה לחזור' : ''}</small></div>
      <div class="rec-ctl">${sel('rec-st', shown, ST, { arg: id, label: 'מצב ' + c.name })}
      ${shown === 'pass' || shown === 'fail' ? `<input class="inp num" type="number" inputmode="numeric" min="0" max="100" placeholder="ציון" aria-label="ציון ${esc(c.name)}" value="${esc(r.grade ?? '')}" data-act-change="rec-grade" data-arg="${id}">` : ''}</div>
      ${shown === 'pass' || shown === 'fail' ? `<details class="rec-more"><summary>כישלון קודם</summary><div class="row wrap">
        ${shown === 'pass' ? `<label class="cb"><input type="checkbox" data-act-change="rec-earlier" data-arg="${id}"${r.earlierFail ? ' checked' : ''}> נכשלתי בעבר לפני שעברתי</label>` : ''}
        <label class="fld"><span>מספר כישלונות</span>${sel('rec-fails', r.fails || 1, [[1, '1'], [2, '2'], [3, '3']], { arg: id })}</label></div></details>` : ''}
    </li>`;
  }
  function passedEditor() {
    const y = S().profile.year || 1;
    const years = [];
    for (let yy = 1; yy <= Math.max(2, y); yy++) years.push(yy);
    const pr = L.progress();
    const outside = [...new Set(Object.values(C).flatMap(c => c.prereqs.flat()).filter(n => !Object.values(C).some(c => c.name === n)))];
    return `${gradeImport()}
      <h4>או לסמן ידנית, לפי שנה</h4>
      ${years.map(yy => {
        const list = Object.values(C).filter(c => c.year === yy && (c.groups.length || yy < y)).map(c => c.id);
        return `<details class="yr"${yy === 1 ? ' open' : ''}><summary>שנה ${L.YEARS[yy - 1]} <small>${list.length} קורסים</small></summary>
          <div class="row"><button type="button" class="btn sm" data-act="year-all" data-arg="${yy}">${icon('check')}<span>עברתי את כל השנה</span></button></div>
          <ul class="rec-list">${list.map(courseRow).join('')}</ul></details>`;
      }).join('')}
      ${pr.prereqWarn.length ? `<h4>בדיקת קדמים</h4>` + pr.prereqWarn.map(w => note(`<b>${C[w.id].name}</b> מסומן כעבר, אבל חסר לו קדם רשום: ${w.miss.join(', ')}. ${sw('exception', w.ok, 'יש לי אישור חריג', { arg: w.id })}`, w.ok ? 'info' : 'mid')).join('') : ''}
      <details class="yr"><summary>קדם שנעשה מחוץ לתוכנית</summary><p class="small muted">למשל קורס מקביל ממחלקה אחרת. סימון כאן פותח את הקורסים שתלויים בו.</p>
        ${outside.map(n => `<label class="cb"><input type="checkbox" data-act-change="outside" data-arg="${esc(n)}"${S().outside[n] ? ' checked' : ''}> ${esc(n)}</label>`).join('')}</details>
      ${englishBlock()}`;
  }
  A['rec-st'] = (el, id) => set(s => { s.record[id] = { ...(s.record[id] || {}), st: el.value }; if (el.value !== 'fail') delete s.record[id].fails; s.recVer++; });
  A['rec-grade'] = (el, id) => set(s => { const g = el.value === '' ? null : Math.max(0, Math.min(100, Math.round(+el.value))); s.record[id] = { ...(s.record[id] || { st: 'pass' }), grade: g }; s.recVer++; });
  A['rec-earlier'] = (el, id) => set(s => { s.record[id] = { ...(s.record[id] || { st: 'pass' }), earlierFail: el.checked }; s.recVer++; });
  A['rec-fails'] = (el, id) => set(s => { s.record[id] = { ...(s.record[id] || { st: 'fail' }), fails: +el.value }; s.recVer++; });
  A['year-all'] = (el, yy) => set(s => { for (const c of Object.values(C)) if (c.year === +yy && (c.groups.length || +yy < (s.profile.year || 1))) s.record[c.id] = { ...(s.record[c.id] || {}), st: 'pass' }; s.recVer++; });
  A.exception = (el, id) => set(s => { s.exceptions[id] = el.checked; }, { rebuild: false });
  A.outside = (el, n) => set(s => { s.outside[n] = el.checked; s.recVer++; });

  /* grade-sheet import (fake reader, real states) */
  const GI_STATES = {
    unreadable: ['הקובץ לא נקרא', 'הקובץ לא נקרא או שהקריאה לקחה יותר מדי זמן. נסו שוב או סמנו ידנית.', 'high'],
    none: ['לא זוהו קורסים', 'הקובץ נקרא, אבל לא נמצאו בו קורסים מוכרים. האם זה גיליון הציונים מפורטל הסטודנט?', 'mid'],
    uptodate: ['הכול מעודכן', 'כל הקורסים בגיליון כבר מסומנים כמו אצלך. אין מה לשנות.', 'info'],
    toobig: ['הקובץ גדול מדי', 'אפשר עד 5MB ועד 10 עמודים.', 'high'],
    profile: ['הפרופיל השתנה באמצע', 'שינית תוכנית או שנה בזמן הקריאה. הקריאה בוטלה — נסו שוב.', 'mid']
  };
  function gradeImport() {
    const g = ui.gi;
    let body = '';
    if (g.stage === 'idle') body = `<p class="small">PDF מפורטל הסטודנט · עד 5MB ו-10 עמודים · נקרא רק בדפדפן, לא נשמר ולא נשלח.</p>
      <label class="btn primary file">${icon('upload')}<span>ייבוא גיליון ציונים</span><input type="file" accept="application/pdf,.pdf" data-act-change="gi-file" class="vh"></label>`;
    else if (g.stage === 'reading') body = `<div class="loading" role="status"><span class="spin"></span>קוראים את הגיליון… (בדפדפן בלבד)</div>`;
    else if (g.stage === 'diff') body = `<p>אלה השינויים שהגיליון יעשה. בחרו מה לקבל:</p>
      <ul class="diff">${D.GRADESHEET_ROWS.map((r, i) => `<li${r.same ? ' class="same"' : ''}><label class="cb"><input type="checkbox" data-act-change="gi-pick" data-arg="${i}"${g.picks[i] !== false && !r.same ? ' checked' : ''}${r.same ? ' disabled' : ''}> <b>${C[r.id].name}</b> — ${r.note}</label></li>`).join('')}</ul>
      <p class="small muted">${icon('info')} שורה אחת דולגה: "סדנת בטיחות" — לא קורס אקדמי.</p>
      <div class="row">${btn('gi-accept', 'קבלת השינויים שנבחרו', { cls: 'primary' })}${btn('gi-cancel', 'ביטול')}</div>`;
    else { const [t, d, lvl] = GI_STATES[g.stage]; body = note(`<b>${t}.</b> ${d}`, lvl) + `<div class="row">${btn('gi-cancel', 'חזרה')}</div>`; }
    return `<section class="gi" aria-labelledby="gi-t"><h4 id="gi-t">ייבוא גיליון ציונים</h4>${body}
      <details class="demo"><summary>הדגמת מצבים</summary><div class="row wrap">${Object.entries(GI_STATES).map(([k, v]) => btn('gi-demo', v[0], { arg: k, cls: 'sm' })).join('')}</div></details></section>`;
  }
  A['gi-file'] = el => {
    const f = el.files && el.files[0];
    if (f && f.size > 5 * 1024 * 1024) { ui.gi.stage = 'toobig'; return L.emit(); }
    ui.gi.stage = 'reading'; L.emit(); setTimeout(() => { ui.gi.stage = 'diff'; ui.gi.picks = {}; L.emit(); }, 1400);
  };
  A['gi-pick'] = (el, i) => { ui.gi.picks[i] = el.checked; };
  A['gi-accept'] = () => { set(s => { D.GRADESHEET_ROWS.forEach((r, i) => { if (!r.same && ui.gi.picks[i] !== false) s.record[r.id] = { ...(s.record[r.id] || {}), ...r.to }; }); s.recVer++; }); ui.gi.stage = 'idle'; toast('הגיליון יובא'); };
  A['gi-cancel'] = () => { ui.gi.stage = 'idle'; L.emit(); };
  A['gi-demo'] = (el, k) => { ui.gi.stage = k; L.emit(); };

  /* ---------- choosing courses ---------- */
  function elText(el) {
    switch (el.kind) {
      case 'ok': return '';
      case 'parallel': return `אפשרי רק יחד עם ${C[el.with].name} (במקביל)`;
      case 'afterA': return `אפשרי בסמסטר ב׳ אחרי ${el.miss.map(a => a.join(' או ')).join(', ')} בסמסטר א׳`;
      case 'blocked': return `חסום — חסר קדם: ${el.miss.map(a => a.join(' או ')).join(', ')}`;
      case 'notOffered': return `לא נפתח בסמסטר הזה${el.sems.length ? ' (נפתח ב: ' + el.sems.join(', ') + ')' : ''}`;
      default: return '';
    }
  }
  function courseChooser({ compact = false } = {}) {
    const list = L.openCourses('א');
    const s = S();
    const semOpts = c => [['auto', 'אוטומטי'], ...['א', 'ב', 'קיץ'].filter(x => c.sems.includes(x) && (x !== 'קיץ' || s.plan.summer) && (x !== 'ב' || s.plan.mode === 'year')).map(x => [x, 'סמסטר ' + x])];
    return `<ul class="courses">${list.map(({ c, el }) => {
      const ch = L.choice(c.id), able = ['ok', 'parallel'].includes(el.kind) || (s.plan.mode === 'year' && el.kind === 'afterA') || (el.kind === 'notOffered' && (c.sems.includes('ב') && s.plan.mode === 'year' || c.sems.includes('קיץ') && s.plan.summer));
      return `<li class="crs ${able ? '' : 'off'} ${color(c.id)}" data-st="${ch.st}">
        <div class="crs-h"><i class="dot" aria-hidden="true"></i><b>${c.name}</b><span class="muted small">${c.id}</span></div>
        <div class="crs-m small">${c.credits} נ"ז · פותח ${L.unlocks(c.id)} קורסי המשך${ch.retake ? ' · <b class="warn-t">נכשלת — חובה לחזור (אפשר לשנות)</b>' : ''}</div>
        ${elText(el) ? `<div class="crs-why small">${icon(el.kind === 'blocked' || el.kind === 'notOffered' ? 'lock' : 'info')}<span>${elText(el)}</span></div>` : ''}
        ${able ? `<div class="crs-ctl">${seg('choice', ch.st, [['must', 'חובה'], ['maybe', 'אולי'], ['no', 'לא']], { arg: c.id, label: 'סטטוס ' + c.name })}
          ${semOpts(c).length > 1 ? sel('choice-sem', ch.sem, semOpts(c), { arg: c.id, label: 'סמסטר ' + c.name }) : ''}</div>` : ''}
      </li>`;
    }).join('')}</ul>`;
  }
  A.choice = (el, id) => set(s => { s.choices[id] = { ...L.choice(id), st: el.value }; });
  A['choice-sem'] = (el, id) => set(s => { s.choices[id] = { ...L.choice(id), sem: el.value }; });
  function capBlock() {
    const s = S();
    return `<div class="cap"><span id="cap-l">תקרת נ"ז לסמסטר</span>
      <div class="stepper" role="group" aria-labelledby="cap-l">${btn('cap', '', { arg: -0.5, ic: 'minus', aria: 'הורדת התקרה', cls: 'icb' })}<output aria-live="polite">${s.cap}</output>${btn('cap', '', { arg: 0.5, ic: 'plus', aria: 'העלאת התקרה', cls: 'icb' })}</div>
      ${btn('probe', 'ומה אם עוד נקודה?', { cls: 'sm ghost', ic: 'wand' })}</div>
      ${ui.probe ? note(ui.probe.add.length ? `עם תקרה של ${s.cap + 1} נ"ז אפשר להוסיף: <b>${ui.probe.add.map(id => C[id].name).join(', ')}</b> (סה"כ ${ui.probe.credits} נ"ז). ${btn('probe-apply', 'להעלות ל-' + (s.cap + 1), { cls: 'sm' })}` : `עוד נקודה לא מוסיפה אף קורס למערכת הטובה ביותר.`) : ''}`;
  }
  A.cap = (el, d) => { ui.probe = null; set(s => { s.cap = Math.max(6, Math.min(30, s.cap + +d)); }); };
  A.probe = () => { ui.probe = L.probe(); L.emit(); };
  A['probe-apply'] = () => { ui.probe = null; set(s => { s.cap += 1; }); };
  function planBlock() {
    const s = S();
    return `<fieldset class="fs"><legend>מה מתכננים</legend>
      ${seg('plan-mode', s.plan.mode, [['sem', 'סמסטר א׳'], ['year', 'שנה שלמה (א׳+ב׳)']], { label: 'היקף' })}
      ${s.plan.mode === 'year' ? `<p class="small muted">קורס בא׳ פותח את ההמשך שלו בב׳.</p>${seg('plan-split', s.plan.split, [['moreA', 'יותר בא׳'], ['balanced', 'מאוזן'], ['moreB', 'יותר בב׳']], { label: 'חלוקת עומס' })}` : ''}
      ${sw('summer', s.plan.summer, 'לתכנן גם סמסטר קיץ', { hint: 'נבנה מעל התוכנית שנבחרה, נספר בהתקדמות. קורס שננעץ לקיץ יוצא מהסמסטרים האחרים.' })}</fieldset>`;
  }
  A['plan-mode'] = el => set(s => { s.plan.mode = el.value; s.altIdx = 0; });
  A['plan-split'] = el => set(s => { s.plan.split = el.value; });
  A.summer = el => set(s => { s.plan.summer = el.checked; });

  /* ---------- preferences ---------- */
  function wishes() {
    const w = S().prefs.w;
    return `<div class="wishes">${L.WISHES.map(([k, t]) => `<div class="wish"><span class="wish-l" id="w-${k}">${t}</span>${seg('w', w[k], L.LEVELS.map((x, i) => [i, x]), { arg: k, label: t, cls: 'lv' })}</div>`).join('')}</div>`;
  }
  A.w = (el, k) => set(s => { s.prefs.w[k] = +el.value; });
  function weightsNotice() {
    if (S().prefs.wNoticeSeen) return '';
    return note(`<b>ברירות המחדל של המשקלים השתנו בעדכון האחרון</b> (למשל "ללמוד עם חברים" עלה מ"קצת" ל"חשוב"). ${btn('w-old', 'להחזיר את המשקלים הקודמים', { cls: 'sm' })} ${btn('w-ok', 'הבנתי', { cls: 'sm ghost' })}`, 'info');
  }
  A['w-old'] = () => set(s => { s.prefs.w = { ...L.OLD_W }; s.prefs.wNoticeSeen = true; });
  A['w-ok'] = () => set(s => { s.prefs.wNoticeSeen = true; }, { rebuild: false });
  function rulesBlock() {
    const p = S().prefs;
    const kind = (act, v) => seg(act, v ? 'strict' : 'wish', [['wish', 'רצון'], ['strict', 'כלל קשיח']], { cls: 'sm', label: 'סוג' });
    return `<fieldset class="fs"><legend>ימי חופש</legend><div class="days">${[1, 2, 3, 4, 5, 6].map(d => `<label class="day"><input type="checkbox" data-act-change="dayoff" data-arg="${d}"${p.daysOff.days.includes(d) ? ' checked' : ''}><span>${L.DAYL[d]}</span></label>`).join('')}</div>${kind('dayoff-kind', p.daysOff.strict)}</fieldset>
      <fieldset class="fs"><legend>חלון שעות</legend><div class="row wrap"><label class="fld"><span>מ-</span>${sel('hours-from', p.hours.from, hours(7, 14))}</label><label class="fld"><span>עד</span>${sel('hours-to', p.hours.to, hours(14, 22))}</label></div>${kind('hours-kind', p.hours.strict)}</fieldset>
      <fieldset class="fs"><legend>מקסימום ימים בקמפוס (כלל קשיח)</legend>${sel('max-days', p.maxDays || '', [['', 'ללא הגבלה'], [2, '2'], [3, '3'], [4, '4'], [5, '5']], { label: 'מקסימום ימים' })}</fieldset>`;
  }
  A.dayoff = (el, d) => set(s => { d = +d; const a = s.prefs.daysOff.days; s.prefs.daysOff.days = el.checked ? [...new Set([...a, d])] : a.filter(x => x !== d); });
  A['dayoff-kind'] = el => set(s => { s.prefs.daysOff.strict = el.value === 'strict'; });
  A['hours-from'] = el => set(s => { s.prefs.hours.from = +el.value; });
  A['hours-to'] = el => set(s => { s.prefs.hours.to = +el.value; });
  A['hours-kind'] = el => set(s => { s.prefs.hours.strict = el.value === 'strict'; });
  A['max-days'] = el => set(s => { s.prefs.maxDays = el.value ? +el.value : null; });
  function lecturersBlock() {
    const l = S().prefs.lect;
    const list = (k, t) => `<div class="lect"><b>${t}</b>${l[k].length ? l[k].map(n => `<span class="chip">${esc(n)}<button type="button" class="x" data-act="lect-rm" data-arg="${k}|${esc(n)}" aria-label="הסרת ${esc(n)}">${icon('close')}</button></span>`).join('') : '<span class="muted small">אין</span>'}</div>`;
    return `<fieldset class="fs"><legend>מרצים</legend><p class="small muted">לפי שם, בכל הקורסים, מול הקבוצה הראשית. אם אין מערכת עם המועדפים — מחפשים שוב בלעדיהם ומודיעים.</p>
      ${list('prefer', 'מעדיף/ה')}${list('avoid', 'להימנע')}
      <div class="row wrap">${sel('lect-pick', '', [['', 'בחירת מרצה…'], ...D.LECTURERS.map(n => [n, n])], { label: 'מרצה', id: 'lect-pick' })}${btn('lect-add', 'להעדיף', { arg: 'prefer', cls: 'sm' })}${btn('lect-add', 'להימנע', { arg: 'avoid', cls: 'sm' })}</div></fieldset>`;
  }
  A['lect-pick'] = () => { };
  A['lect-add'] = (el, k) => { const n = document.getElementById('lect-pick').value; if (!n) return toast('בחרו מרצה'); lectSet(n, k); };
  A['lect-rm'] = (el, a) => { const [k, n] = a.split('|'); set(s => { s.prefs.lect[k] = s.prefs.lect[k].filter(x => x !== n); }); };
  const lectSet = (n, k) => set(s => { const o = k === 'prefer' ? 'avoid' : 'prefer'; s.prefs.lect[o] = s.prefs.lect[o].filter(x => x !== n); if (!s.prefs.lect[k].includes(n)) s.prefs.lect[k].push(n); });
  A['lect-prefer'] = (el, n) => { lectSet(n, 'prefer'); toast('נוסף למועדפים: ' + n); };
  A['lect-avoid'] = (el, n) => { lectSet(n, 'avoid'); toast('נוסף ל"להימנע": ' + n); };
  function busyBlock() {
    const b = S().busy, e = ui.busyEdit;
    const form = e ? `<div class="busy-form" role="group" aria-label="${e.id ? 'עריכת' : 'הוספת'} זמן חסום">
        <label class="fld"><span>יום</span>${sel('be-d', e.d, [1, 2, 3, 4, 5, 6].map(d => [d, L.DAYS[d]]))}</label>
        <label class="fld"><span>מ-</span><input class="inp" type="time" step="900" value="${hm(e.s)}" data-act-change="be-s"></label>
        <label class="fld"><span>עד</span><input class="inp" type="time" step="900" value="${hm(e.e)}" data-act-change="be-e"></label>
        <label class="fld grow"><span>תיאור (לא חובה)</span><input class="inp" type="text" maxlength="24" value="${esc(e.label)}" data-act-change="be-l" placeholder="עבודה"></label>
        ${e.err ? `<p class="err">${e.err}</p>` : ''}
        <div class="row">${btn('be-save', 'שמירה', { cls: 'primary sm' })}${btn('be-cancel', 'ביטול', { cls: 'sm' })}</div></div>` : '';
    return `<fieldset class="fs"><legend>זמנים חסומים (${b.length}/12)</legend><p class="small muted">עבודה, אימון — אף שיעור לא ייכנס לזמנים האלה.</p>
      <ul class="busy">${b.map(x => `<li><span>${icon('clock')} ${L.DAYS[x.d]} ${L.rng(x.s, x.e)}${x.label ? ' · ' + esc(x.label) : ''}</span>
        <span>${btn('be-edit', '', { arg: x.id, ic: 'edit', cls: 'icb', aria: 'עריכה' })}${btn('be-rm', '', { arg: x.id, ic: 'trash', cls: 'icb', aria: 'מחיקה' })}</span></li>`).join('')}</ul>
      ${form || (b.length < 12 ? btn('be-new', 'הוספת זמן חסום', { ic: 'plus', cls: 'sm' }) : '<p class="small muted">הגעת למקסימום של 12.</p>')}</fieldset>`;
  }
  A['be-new'] = () => { ui.busyEdit = { id: null, d: 2, s: 16 * 60, e: 20 * 60, label: '' }; L.emit(); };
  A['be-edit'] = (el, id) => { ui.busyEdit = { ...S().busy.find(x => x.id === id) }; L.emit(); };
  A['be-d'] = el => { ui.busyEdit.d = +el.value; };
  A['be-s'] = el => { const [h, m] = el.value.split(':'); ui.busyEdit.s = +h * 60 + +m; };
  A['be-e'] = el => { const [h, m] = el.value.split(':'); ui.busyEdit.e = +h * 60 + +m; };
  A['be-l'] = el => { ui.busyEdit.label = el.value; };
  A['be-cancel'] = () => { ui.busyEdit = null; L.emit(); };
  A['be-save'] = () => {
    const e = ui.busyEdit;
    if (!(e.e > e.s)) { e.err = 'שעת הסיום חייבת להיות אחרי שעת ההתחלה.'; return L.emit(); }
    set(s => { if (e.id) s.busy = s.busy.map(x => x.id === e.id ? { ...e, err: undefined } : x); else s.busy.push({ ...e, id: 'b' + Date.now(), err: undefined }); });
    ui.busyEdit = null;
  };
  A['be-rm'] = (el, id) => set(s => { s.busy = s.busy.filter(x => x.id !== id); });
  function examsRuleBlock() {
    const p = S().prefs;
    return `<fieldset class="fs"><legend>מבחנים</legend><p class="small">${icon('lock')} תמיד: אין שני מבחני מועד א׳ באותו תאריך ובאותה שעה. נבדקים רק תאריכים ידועים.</p>
      ${sw('same-day', p.sameDayExams, 'גם לא שני מבחנים באותו יום')}</fieldset>`;
  }
  A['same-day'] = el => set(s => { s.prefs.sameDayExams = el.checked; });
  function groupsBlock() {
    const p = S().prefs;
    return `<fieldset class="fs"><legend>קבוצות</legend>${sw('include-full', p.includeFull, 'לכלול גם קבוצות מלאות', { hint: 'לפעמים מתפנה מקום; אבל אין הבטחה.' })}
      ${sw('split', p.split.on, 'לאפשר הרצאה ותרגול מקבוצות שונות', { hint: 'רק כשהמכללה לא מקשרת ביניהן. קצב ההוראה עלול להיות שונה, ודרוש אישור ייעוץ. חלופות כאלה מופיעות אחרי הרגילות.' })}</fieldset>`;
  }
  A['include-full'] = el => set(s => { s.prefs.includeFull = el.checked; });
  A.split = async el => {
    if (el.checked) {
      el.checked = false;
      const ok = await confirm('פיצול הרצאה ותרגול', `<p>החלופות האלה משלבות הרצאה מקבוצה אחת ותרגול מקבוצה אחרת, כשהמכללה לא מקשרת ביניהן.</p><ul><li>קצב ההוראה עלול להיות שונה בין הקבוצות.</li><li>צריך אישור של הייעוץ האקדמי.</li><li>הן יופיעו אחרי החלופות הרגילות, עם שמות הקורסים שמושפעים.</li></ul>`, 'הבנתי, להפעיל');
      if (ok) set(s => { s.prefs.split = { on: true, ack: true }; });
      return;
    }
    const lost = S().pins.filter(p => G[p] && G[p].parent && !G[G[p].parent].links.includes(p));
    set(s => { s.prefs.split.on = false; s.pins = s.pins.filter(p => !lost.includes(p)); });
    if (S().improve) improveSplitOff();
    toast(lost.length ? 'הפיצול כבוי. שוחררו נעיצות שהיו אפשריות רק איתו.' : 'הפיצול כבוי.');
  };
  async function resetPrefs() {
    if (!await confirm('איפוס ההעדפות', '<p>כל הרצונות, הכללים והמשקלים יחזרו לברירת המחדל.</p><p><b>נשארים:</b> המצב שלך, בחירת הקורסים, החברים והזמנים החסומים.</p>', 'איפוס', { danger: true })) return;
    set(s => { const f = L.fresh().prefs; s.prefs = { ...f, wNoticeSeen: true }; });
    toast('ההעדפות אופסו');
  }
  A['reset-prefs'] = resetPrefs;
  const prefsAll = () => `<p class="small muted">${icon('check')} כל שינוי נשמר מיד — אין כפתור שמירה.</p>${weightsNotice()}<h4>מה חשוב לי</h4>${wishes()}${rulesBlock()}${lecturersBlock()}${busyBlock()}${examsRuleBlock()}${groupsBlock()}<div class="row">${btn('reset-prefs', 'איפוס ההעדפות', { ic: 'refresh', cls: 'ghost sm' })}</div>`;

  /* ---------- friends ---------- */
  const FR_METHODS = [['link', 'קישור שחבר שלח', 'link'], ['paste', 'הדבקת טקסט', 'copy'], ['xlsx', 'קובץ Excel מאפקה-נט', 'file'], ['pdf', 'PDF (גם סרוק)', 'file'], ['photo', 'תמונה / צילום מסך', 'camera'], ['manual', 'בחירה ידנית', 'search']];
  const FR_REVIEW = [
    { t: 'ok', g: '279090408' }, { t: 'ok', g: '273012702' },
    { t: 'time', g: '279091107', text: 'יום א׳ ⁦08:00–10:50⁩ — הותאם לפי יום ושעה בלבד' },
    { t: 'amb', choices: ['273011204', '273011202'], text: 'תרמודינמיקה 1 — שתי קבוצות אפשריות' },
    { t: 'dup', g: '273012702', text: 'שורה כפולה — תיספר פעם אחת' },
    { t: 'unknown', text: 'קבוצה 273019944 לא נמצאת בנתונים — תדלג' }
  ];
  function friendsPanel() {
    const fs = S().friends, f = ui.fr;
    if (f) return friendFlow();
    return `<p class="small muted">${fs.length} מתוך 20 חברים · עד 40 קבוצות לכל אחד. שיעור משותף מסומן בשם החבר.</p>
      <ul class="friends">${fs.map(x => `<li class="fr${x.show ? '' : ' hid'}"><div class="fr-h"><span class="ava" aria-hidden="true">${esc(x.name[0])}</span><b>${esc(x.name)}</b><small class="muted">${x.groups.length} קבוצות · ${x.source === 'manual' ? 'ידני' : x.source === 'link' ? 'מקישור' : 'מקובץ'}</small></div>
        <div class="fr-c">${seg('fr-weight', x.weight, L.LEVELS.map((t, i) => [i, t]), { arg: x.id, label: 'חשיבות ' + x.name, cls: 'lv sm' })}
        <div class="row">${btn('fr-show', x.show ? 'מוצג' : 'מוסתר', { arg: x.id, ic: x.show ? 'eye' : 'eyeoff', cls: 'sm ghost', aria: (x.show ? 'הסתרת ' : 'הצגת ') + x.name })}
        ${x.source === 'manual' ? btn('fr-edit', 'עריכה', { arg: x.id, ic: 'edit', cls: 'sm ghost' }) : ''}${btn('fr-rm', 'הסרה', { arg: x.id, ic: 'trash', cls: 'sm ghost' })}</div></div></li>`).join('') || '<li class="empty">עוד אין חברים. מוסיפים מערכת של חבר כדי לראות שיעורים משותפים.</li>'}</ul>
      ${fs.length < 20 ? `<h4>הוספת חבר/ה</h4><div class="methods">${FR_METHODS.map(([k, t, ic]) => btn('fr-add', t, { arg: k, ic, cls: 'method' })).join('')}</div>` : note('הגעת ל-20 חברים.', 'mid')}`;
  }
  function friendFlow() {
    const f = ui.fr;
    const head = `<div class="row between"><h4>${FR_METHODS.find(m => m[0] === f.m)[1]}</h4>${btn('fr-cancel', 'ביטול', { cls: 'sm ghost' })}</div>`;
    if (f.stage === 'input') {
      let inp = '';
      if (f.m === 'link') inp = `<label class="fld"><span>הקישור</span><input class="inp" type="url" dir="ltr" placeholder="https://…#f=…" data-act-change="fr-val"></label>`;
      if (f.m === 'paste') inp = `<label class="fld"><span>הטקסט מהמערכת של החבר</span><textarea class="inp" rows="5" data-act-change="fr-val" placeholder="מדביקים כאן את הטקסט"></textarea></label>`;
      if (f.m === 'xlsx') inp = `<label class="btn file">${icon('upload')}<span>בחירת קובץ .xlsx</span><input class="vh" type="file" accept=".xlsx" data-act-change="fr-file"></label>`;
      if (f.m === 'pdf') inp = `<label class="btn file">${icon('upload')}<span>בחירת PDF</span><input class="vh" type="file" accept=".pdf" data-act-change="fr-file"></label><p class="small muted">PDF סרוק? אחרי הבחירה תבחרו אילו עמודים לקרוא (עד 12).</p>`;
      if (f.m === 'photo') inp = `<label class="btn file">${icon('camera')}<span>בחירת תמונה</span><input class="vh" type="file" accept="image/*" data-act-change="fr-file"></label><p class="small muted">התמונה נקראת בדפדפן (זיהוי טקסט), לא נשלחת.</p>`;
      if (f.m === 'manual') return head + manualPicker();
      return head + `<p class="small">${icon('info')} רק בהסכמת החבר/ה.</p>${inp}${f.m === 'link' || f.m === 'paste' ? `<div class="row">${btn('fr-read', 'קריאה', { cls: 'primary' })}${btn('fr-unreadable', 'הדגמה: קלט לא קריא', { cls: 'sm ghost' })}</div>` : ''}`;
    }
    if (f.stage === 'pages') return head + `<p>PDF סרוק — אילו עמודים לקרוא? (עד 12)</p><div class="days">${Array.from({ length: 14 }, (_, i) => `<label class="day"><input type="checkbox" data-act-change="fr-page" data-arg="${i + 1}"${f.pages.includes(i + 1) ? ' checked' : ''}><span>${i + 1}</span></label>`).join('')}</div>
      <p class="small muted">${f.pages.length} נבחרו</p>${btn('fr-ocr', 'קריאת העמודים', { cls: 'primary', dis: !f.pages.length || f.pages.length > 12 })}`;
    if (f.stage === 'reading') return head + `<div class="loading" role="status"><span class="spin"></span>${f.m === 'photo' || f.m === 'pdf' ? 'מזהים טקסט' : 'קוראים'}… <b>${f.pct}%</b></div><div class="bar"><i style="width:${f.pct}%"></i></div>`;
    if (f.stage === 'unreadable') return head + note('<b>לא הצלחנו לקרוא.</b> הקלט לא מזוהה כמערכת שעות. נסו קובץ אחר או בחירה ידנית.', 'high') + btn('fr-add', 'בחירה ידנית', { arg: 'manual' });
    if (f.stage === 'confirm-link') return head + `<div class="card-in"><p>זו המערכת של <b>${esc(f.name)}</b> (${f.groups.length} קבוצות).</p><p>להוסיף לחברים? אף פעם לא מוסיפים אוטומטית.</p>
      <div class="row">${btn('fr-link-yes', 'להוסיף', { cls: 'primary' })}${btn('fr-cancel', 'לא עכשיו')}</div></div>`;
    if (f.stage === 'review') {
      const lab = { ok: ['תקין', 'ok'], time: ['לפי יום ושעה בלבד', 'mid'], amb: ['לא חד-משמעי', 'mid'], dup: ['כפול', 'info'], unknown: ['לא נמצא', 'high'] };
      return head + `<p>בדקו מה נקרא לפני שמוסיפים:</p><ul class="review">${FR_REVIEW.map((r, i) => `<li class="rv rv-${lab[r.t][1]}"><span class="chip">${lab[r.t][0]}</span>
        <span>${r.g ? `${C[G[r.g].course].name} · ${num(r.g)}` : ''}${r.text ? ` <small>${r.text}</small>` : ''}</span>
        ${r.t === 'amb' ? sel('fr-amb', f.amb || '', [['', 'בחירה…'], ...r.choices.map(c => [c, num(c) + ' · ' + G[c].meetings.map(meetText).join(', ')])], { label: 'בחירת קבוצה' }) : ''}
        ${r.t === 'time' ? `<label class="cb"><input type="checkbox" data-act-change="fr-time-ok"${f.timeOk ? ' checked' : ''}> נכון</label>` : ''}</li>`).join('')}</ul>
        <div class="row wrap"><label class="fld grow"><span>שם החבר/ה</span><input class="inp" type="text" maxlength="20" value="${esc(f.name || '')}" data-act-change="fr-name"></label></div>
        ${f.dupName ? note(`כבר יש חבר בשם "${esc(f.name)}". ${btn('fr-commit', 'להחליף', { arg: 'replace', cls: 'sm' })} ${btn('fr-commit', 'להוסיף בנוסף', { arg: 'add', cls: 'sm' })}`, 'mid') :
          btn('fr-commit', 'הוספה', { cls: 'primary', dis: !f.amb || !f.timeOk || !f.name })}`;
    }
    return '';
  }
  function manualPicker() {
    const f = ui.fr, q = (f.q || '').trim();
    const hits = q ? Object.values(C).filter(c => c.groups.some(g => g.sem === 'א') && (c.name.includes(q) || c.id.includes(q))) : [];
    const chosen = f.groups;
    const overlaps = [];
    for (let i = 0; i < chosen.length; i++) for (let j = i + 1; j < chosen.length; j++)
      if (G[chosen[i]].meetings.some(m => G[chosen[j]].meetings.some(x => x.d === m.d && m.s < x.e && x.s < m.e))) overlaps.push(num(chosen[i]) + ' ו-' + num(chosen[j]));
    return `<label class="fld"><span>חיפוש לפי שם או מספר קורס</span><input class="inp" type="search" value="${esc(f.q || '')}" data-act-input="fr-q" placeholder="למשל: חוזק או 30127"></label>
      <ul class="hits">${hits.map(c => `<li><b>${c.name}</b>${c.groups.filter(g => g.sem === 'א').map(g => `<label class="cb"><input type="checkbox" data-act-change="fr-g" data-arg="${g.id}"${chosen.includes(g.id) ? ' checked' : ''}> ${num(g.id)} · ${kindName(g.kind)} · ${g.meetings.map(meetText).join(', ')}</label>`).join('')}</li>`).join('') || (q ? '<li class="muted">לא נמצא</li>' : '')}</ul>
      <p class="small">${chosen.length} קבוצות נבחרו (עד 40)</p>
      ${overlaps.length ? note('חפיפה בין קבוצות: ' + overlaps.join(', ') + ' — בדקו לפני שמירה.', 'mid') : ''}
      <label class="fld"><span>שם החבר/ה</span><input class="inp" type="text" maxlength="20" value="${esc(f.name || '')}" data-act-change="fr-name"></label>
      ${f.dupName ? note(`כבר יש חבר בשם "${esc(f.name)}". ${btn('fr-commit', 'להחליף', { arg: 'replace', cls: 'sm' })} ${btn('fr-commit', 'להוסיף בנוסף', { arg: 'add', cls: 'sm' })}`, 'mid')
        : btn('fr-commit', f.edit ? 'שמירת השינויים' : 'שמירה', { cls: 'primary', dis: !chosen.length || !f.name })}`;
  }
  A['fr-add'] = (el, m) => { ui.fr = { m, stage: 'input', groups: [], pages: [], name: '' }; L.emit(); };
  A['fr-cancel'] = () => { ui.fr = null; if (/^#f=/.test(location.hash)) L.clearHash(); L.emit(); };
  A['fr-val'] = el => { ui.fr.val = el.value; };
  A['fr-unreadable'] = () => { ui.fr.stage = 'unreadable'; L.emit(); };
  A['fr-read'] = () => {
    const f = ui.fr;
    if (f.m === 'link') {
      const m = (f.val || '').match(/#f=([\w-]+)/);
      if (!m) { f.stage = 'unreadable'; return L.emit(); }
      location.hash = 'f=' + m[1]; return;
    }
    fakeRead();
  };
  A['fr-file'] = () => { if (ui.fr.m === 'pdf') { ui.fr.stage = 'pages'; ui.fr.pages = [1, 2]; L.emit(); } else fakeRead(); };
  A['fr-page'] = (el, p) => { const f = ui.fr; p = +p; f.pages = el.checked ? [...f.pages, p] : f.pages.filter(x => x !== p); L.emit(); };
  A['fr-ocr'] = () => fakeRead();
  function fakeRead() {
    const f = ui.fr; f.stage = 'reading'; f.pct = 0; L.emit();
    const tick = () => { f.pct = Math.min(100, f.pct + 20); L.emit(); if (f.pct < 100) setTimeout(tick, 280); else { f.stage = 'review'; f.name = f.name || ''; L.emit(); } };
    setTimeout(tick, 280);
  }
  A['fr-amb'] = el => { ui.fr.amb = el.value; L.emit(); };
  A['fr-time-ok'] = el => { ui.fr.timeOk = el.checked; L.emit(); };
  A['fr-name'] = el => { ui.fr.name = el.value.trim().slice(0, 20); ui.fr.dupName = false; L.emit(); };
  A['fr-q'] = el => { ui.fr.q = el.value; L.emit(); };
  A['fr-g'] = (el, g) => { const f = ui.fr; f.groups = el.checked ? [...f.groups, g].slice(0, 40) : f.groups.filter(x => x !== g); L.emit(); };
  A['fr-commit'] = (el, how) => {
    const f = ui.fr;
    const groups = f.m === 'manual' ? f.groups : [...new Set(FR_REVIEW.filter(r => r.g).map(r => r.g).concat(f.amb ? [f.amb] : []))];
    const dup = S().friends.find(x => x.name === f.name && x.id !== f.edit);
    if (dup && !how) { f.dupName = true; return L.emit(); }
    set(s => {
      if (f.edit) s.friends = s.friends.map(x => x.id === f.edit ? { ...x, name: f.name, groups } : x).filter(x => how !== 'replace' || x.id === f.edit || x.name !== f.name);
      else {
        if (how === 'replace') s.friends = s.friends.filter(x => x.name !== f.name);
        s.friends.push({ id: 'f' + Date.now(), name: f.name, weight: 2, show: true, source: f.m === 'manual' ? 'manual' : f.m === 'link' ? 'link' : 'file', groups });
      }
    });
    ui.fr = null; toast('החבר/ה נוספ/ה');
  };
  A['fr-link-yes'] = () => { const f = ui.fr; set(s => { s.friends.push({ id: 'f' + Date.now(), name: f.name, weight: 2, show: true, source: 'link', groups: f.groups }); }); ui.fr = null; L.clearHash(); toast(f.name + ' נוספ/ה'); };
  A['fr-weight'] = (el, id) => set(s => { s.friends.find(x => x.id === id).weight = +el.value; });
  A['fr-show'] = (el, id) => set(s => { const x = s.friends.find(y => y.id === id); x.show = !x.show; });
  A['fr-rm'] = async (el, id) => { const x = S().friends.find(y => y.id === id); if (await confirm('הסרת חבר/ה', `להסיר את ${esc(x.name)}?`, 'הסרה', { danger: true })) set(s => { s.friends = s.friends.filter(y => y.id !== id); }); };
  A['fr-edit'] = (el, id) => { const x = S().friends.find(y => y.id === id); ui.fr = { m: 'manual', stage: 'input', groups: x.groups.slice(), name: x.name, edit: id }; L.emit(); };
  function friendFromHash(h) { ui.fr = { m: 'link', stage: 'confirm-link', name: h.name, groups: h.groups }; }

  /* ---------- results ---------- */
  const R = () => L.results;
  const pair = () => R() && R().alts && R().alts[S().altIdx];
  function semSel(sem) { const p = pair(); return p ? L.semSel(p, sem) : []; }
  function weekItems(sel, { ghosts = [] } = {}) {
    const it = [];
    const pins = S().pins;
    for (const o of sel) for (const m of o.meet) {
      const fr = S().friends.filter(f => f.show && f.groups.some(x => num(x) === num(m.g.id))).map(f => f.name);
      it.push({ d: m.d, s: m.s, e: m.e, kind: 'lesson', gid: m.g.id, c: o.c, title: C[o.c].name, type: kindName(m.g.kind), room: m.g.room, color: color(o.c), friends: fr, pinned: pins.includes(m.g.id), full: m.g.full, split: o.split });
    }
    for (const b of S().busy) it.push({ d: b.d, s: b.s, e: b.e, kind: 'busy', title: b.label || 'זמן חסום' });
    for (const g of ghosts) it.push({ ...g, kind: 'ghost' });
    return it;
  }
  function weekGrid(items, { label = 'מערכת שבועית', minDays = [1, 2, 3, 4, 5], hourPx = null } = {}) {
    const days = [...new Set(minDays.concat(items.map(i => i.d)))].sort();
    if (!items.length) return `<div class="wk-empty">${icon('cal')}<p>אין עדיין שיעורים להצגה.</p></div>`;
    const from = Math.min(8, ...items.map(i => Math.floor(i.s / 60))), to = Math.max(17, ...items.map(i => Math.ceil(i.e / 60)));
    const span = (to - from) * 60, pct = m => ((m - from * 60) / span * 100).toFixed(3) + '%';
    return `<div class="wk" role="region" aria-label="${esc(label)}" style="--hours:${to - from};--days:${days.length}${hourPx ? ';--hpx:' + hourPx + 'px' : ''}">
      <div class="wk-head" aria-hidden="true"><span></span>${days.map(d => `<span>${L.DAYS[d]}</span>`).join('')}</div>
      <div class="wk-body"><div class="wk-times" aria-hidden="true">${Array.from({ length: to - from }, (_, i) => `<span style="top:${pct((from + i) * 60)}">${pad2(from + i)}</span>`).join('')}</div>
      ${days.map(d => `<div class="wk-day" role="list" aria-label="יום ${L.DAYS[d]}">${items.filter(i => i.d === d).sort((a, b) => a.s - b.s).map(i => evBlock(i, pct)).join('')}</div>`).join('')}</div></div>`;
  }
  function evBlock(i, pct) {
    const st = `top:${pct(i.s)};height:calc(${pct(i.e)} - ${pct(i.s)})`;
    const time = `${L.rng(i.s, i.e)}`;
    if (i.kind === 'busy') return `<div class="ev busy" role="listitem" style="${st}" aria-label="${esc(i.title)}, ${time}"><b>${esc(i.title)}</b><small>${time}</small></div>`;
    if (i.kind === 'ghost') return `<div class="ev ghost" role="listitem" style="${st}" aria-label="היה כאן: ${esc(i.title)} ${time}"><small>${esc(i.label || 'היה כאן')}</small></div>`;
    const lab = `${i.title}, ${i.type}, ${L.DAYS[i.d]} ${time}${i.friends.length ? ', עם ' + i.friends.join(' ו') : ''}${i.pinned ? ', נעוץ' : ''}`;
    return `<button type="button" role="listitem" class="ev ${i.color}${i.hl ? ' hl' : ''}${i.moved ? ' moved' : ''}" style="${st}" data-act="lesson" data-arg="${i.gid}" aria-label="${esc(lab)}">
      <b>${esc(i.title)}</b><small class="evt">${time}</small><small class="evk">${i.type}</small>${i.friends.length ? `<span class="fb" title="${esc(i.friends.join(', '))}">${icon('users')}${esc(i.friends.join(', '))}</span>` : ''}${i.pinned ? `<span class="pinb">${icon('pin')}</span>` : ''}</button>`;
  }
  function agenda(items) {
    const days = [...new Set(items.map(i => i.d))].sort();
    if (!items.length) return `<div class="wk-empty">${icon('cal')}<p>אין עדיין שיעורים להצגה.</p></div>`;
    return `<div class="agenda">${days.map(d => `<section class="ag-day"><h4>${L.DAYS[d]}</h4><ol>${items.filter(i => i.d === d).sort((a, b) => a.s - b.s).map(i => i.kind === 'busy'
      ? `<li class="ag busy"><time>${hm(i.s)}<br>${hm(i.e)}</time><div><b>${esc(i.title)}</b><small>זמן חסום</small></div></li>`
      : i.kind === 'ghost' ? '' : `<li><button type="button" class="ag ${i.color}${i.hl ? ' hl' : ''}" data-act="lesson" data-arg="${i.gid}"><time>${hm(i.s)}<br>${hm(i.e)}</time><div><b>${esc(i.title)}</b><small>${i.type} · ${esc(i.room)}${i.full ? ' · מלאה' : ''}</small>${i.friends.length ? `<span class="fb">${icon('users')}${esc(i.friends.join(', '))}</span>` : ''}</div>${i.pinned ? `<span class="pinb">${icon('pin')}</span>` : ''}</button></li>`).join('')}</ol></section>`).join('')}</div>`;
  }
  function altStats(p, sem = 'א') {
    const a = sem === 'ב' ? p.B : p.A;
    if (!a) return '';
    const m = a.m;
    return `<ul class="sum">
      <li><b>${m.credits}</b><span>נ"ז</span></li><li><b>${m.days.length}</b><span>ימים</span></li>
      <li><b>${m.gapH.toFixed(1).replace('.0', '')}</b><span>ש׳ חלון</span></li><li><b>${m.shared}</b><span>עם חברים</span></li>
      <li><b>${m.exams.length}</b><span>מבחנים</span></li></ul>`;
  }
  function altDiff(i) {
    const r = R(); if (!r || i === 0) return '';
    const d = L.diff(r.alts[0].A, r.alts[i].A);
    if (!d.length) return '';
    return `<p class="diffl"><b>שונה מחלופה 1:</b> ${d.map(x => x.t === 'add' ? `+ ${C[x.c].name}` : x.t === 'out' ? `− ${C[x.c].name}` : `${C[x.c].name}: ${num(x.to.main.id)} במקום ${num(x.from.main.id)}`).join(' · ')}</p>`;
  }
  function altLeftOut(p) {
    const r = R();
    const lo = L.leftOut(p.A, r.courses || []);
    if (!lo.length) return '';
    return `<details class="lo"><summary>${lo.length} קורסים נשארו בחוץ (${lo.reduce((a, x) => a + x.credits, 0)} נ"ז)</summary><ul>${lo.map(x => `<li><b>${x.name}</b> · ${x.credits} נ"ז${x.must ? ' · חובה' : ''}<br><small>${x.why || 'הסיבה לא ידועה — חלופה אחרת עשויה לכלול אותו'}</small></li>`).join('')}</ul></details>`;
  }
  function resultNotes() {
    const r = R(); if (!r) return '';
    let h = '';
    if (r.cut) h += note(`<b>לא הכול נבדק</b> — החיפוש נעצר במגבלת הזמן, ייתכן שיש חלופות טובות יותר. ${S().budgetLevel < 2 ? btn('longer', 'חיפוש ארוך יותר', { cls: 'sm' }) : '(הגעת לחיפוש הארוך ביותר)'}`, 'mid');
    if (r.fallback) h += note('אין מערכת שמתאימה למרצים שהעדפת — חיפשנו שוב בלי העדפת המרצים.', 'mid');
    for (const n of r.notes || []) h += note(n, 'mid');
    if ((r.alts || []).some(a => a.A.split)) h += note('חלופות עם הרצאה ותרגול מקבוצות שונות מסומנות "פיצול" ומופיעות בסוף. דרוש אישור ייעוץ.', 'info');
    return h;
  }
  A.longer = () => set(s => { s.budgetLevel = Math.min(2, s.budgetLevel + 1); });
  A.order = el => set(s => { s.order = el.value; s.altIdx = 0; });
  const orderSel = () => seg('order', S().order, [['balanced', 'מאוזן'], ['credits', 'הכי הרבה נ"ז'], ['friends', 'הכי הרבה חברים'], ['unlocks', 'פותח הכי הרבה']], { label: 'מיון', cls: 'sm' });
  function stateBlock() {
    if (!S().profile.program) return `<div class="state">${icon('user')}<p>קודם בוחרים תוכנית ושנה.</p></div>`;
    if (L.computing) return `<div class="state computing" role="status" aria-live="polite"><span class="spin"></span><p>בונים מערכות… זה יכול לקחת כמה שניות.</p></div>`;
    if (L.error) return `<div class="state err" role="alert">${icon('warn')}<p>${L.error}</p>${btn('retry', 'נסו שוב', { cls: 'primary' })}</div>`;
    const r = R();
    if (r && !r.alts.length) return `<div class="state none" role="status">${icon('target')}<p><b>אין מערכת שמתאימה.</b></p><p>${esc(r.reason)}</p><p class="small muted">${r.cut ? 'לא הכול נבדק — זה לא בהכרח "אין פתרון".' : 'נבדקו כל השילובים.'}</p></div>`;
    return '';
  }
  A.retry = () => { L.forceError = false; L.compute(0); };
  const planNote = () => `<p class="plan-note">${icon('info')} תוכנית בלבד. ההרשמה עצמה נעשית באפקה-נט.</p>`;

  function lessonDetail(gid) {
    const g = typeof gid === 'string' && Object.hasOwn(G, gid) ? G[gid] : null;
    if (!g) return note('השיעור הזה לא נמצא בנתונים.', 'mid');
    const c = C[g.course], seats = g.seats;
    const fr = S().friends.filter(f => f.groups.some(x => num(x) === num(g.id))).map(f => f.name);
    const pinned = S().pins.includes(gid);
    const seatText = seats.left == null ? 'לא ידוע' : seats.left === 0 ? 'אין מקומות' : `${seats.left} מקומות`;
    const seatState = { ok: '', stale: '<span class="chip mid">ישן</span>', failed: '<span class="chip high">הבדיקה נכשלה</span>', unknown: '<span class="chip">לא ידוע</span>' }[seats.state];
    const others = c.groups.filter(x => !x.parent && x.sem === g.sem && x.id !== (g.parent || g.id));
    const ex = c.groups.find(x => !x.parent && x.exam && x.sem === g.sem);
    return `<div class="lesson ${color(c.id)}">
      <p class="les-k"><i class="dot" aria-hidden="true"></i>${kindName(g.kind)} · קבוצה ${num(g.id)}</p>
      <h3>${c.name}</h3>
      <dl class="kv">
        <dt>מרצה</dt><dd>${g.lecturer}</dd><dt>חדר</dt><dd>${g.room}</dd>
        <dt>מתי</dt><dd>${g.meetings.map(m => `${L.DAYS[m.d]} ${L.rng(m.s, m.e)}`).join('<br>')}</dd>
        <dt>מקומות</dt><dd>${seatText} ${seatState}<br><small>נבדק ${L.fmtDate(seats.checked)} · השתנה לאחרונה ${L.fmtDate(seats.changed)}</small></dd>
        <dt>מבחן</dt><dd>${ex ? `מועד א׳ ${L.fmtDate(ex.exam)}${D.EXAM_HOUR[c.id] ? ' ' + D.EXAM_HOUR[c.id] : ''}` : 'לא פורסם'}</dd>
        <dt>חברים</dt><dd>${fr.length ? fr.map(esc).join(', ') : '—'}</dd>
      </dl>
      ${g.full ? note('<b>הקבוצה מלאה.</b> ייתכן שלא יהיה מקום בהרשמה.', 'mid') : ''}
      <div class="row wrap">${btn(pinned ? 'unpin' : 'pin', pinned ? 'ביטול נעיצה' : 'לנעוץ בכל החלופות', { arg: gid, ic: 'pin', cls: pinned ? '' : 'primary' })}
        ${btn('lect-prefer', 'להעדיף מרצה', { arg: g.lecturer, cls: 'sm ghost', ic: 'star' })}${btn('lect-avoid', 'להימנע ממרצה', { arg: g.lecturer, cls: 'sm ghost', ic: 'close' })}
        ${btn('catalog', 'בקטלוג הרשמי', { arg: c.id, cls: 'sm ghost', ic: 'link' })}</div>
      ${others.length ? `<h4>קבוצות אחרות של הקורס</h4><ul class="others">${others.map(o => `<li><span><b>${num(o.id)}</b> · ${o.meetings.map(meetText).join(', ')} · ${o.lecturer}${o.full ? ' · <span class="chip">מלאה</span>' : ''}</span>${btn('pin', 'לנעוץ', { arg: o.id, cls: 'sm ghost', aria: 'לנעוץ קבוצה ' + num(o.id) })}</li>`).join('')}</ul>` : ''}
    </div>`;
  }
  A.pin = (el, gid) => { set(s => { const c = G[gid].course; s.pins = s.pins.filter(p => !G[p] || G[p].course !== c).concat(gid); }); toast('נעוץ: ' + C[G[gid].course].name + ' ' + num(gid)); };
  A.unpin = (el, gid) => { set(s => { s.pins = s.pins.filter(p => p !== gid); }); toast('הנעיצה בוטלה'); };
  A['pins-clear'] = async () => { if (await confirm('ניקוי נעיצות', 'לבטל את כל הנעיצות?', 'ניקוי')) set(s => { s.pins = []; }); };
  A.catalog = () => toast('בגרסה האמיתית: נפתח הקטלוג הרשמי של המכללה');
  function pinsBlock() {
    const p = S().pins;
    if (!p.length) return `<p class="muted small">${icon('pin')} אין נעיצות. נועצים קבוצה מתוך פרטי השיעור.</p>`;
    return `<ul class="pins">${p.map(id => G[id] ? `<li>${icon('pin')} <span>${C[G[id].course].name} · ${num(id)}${G[id].sem !== 'א' ? ' · סמסטר ' + G[id].sem : ''}</span>${btn('unpin', '', { arg: id, ic: 'close', cls: 'icb', aria: 'ביטול נעיצה' })}</li>`
      : `<li class="gone">${icon('warn')} <span>קבוצה ${esc(num(id))} כבר לא קיימת בנתונים</span>${btn('unpin', 'הסרה', { arg: id, cls: 'sm' })}</li>`).join('')}</ul>${btn('pins-clear', 'ניקוי כל הנעיצות', { cls: 'sm ghost' })}`;
  }
  function examsBlock(sel) {
    if (!sel.length) return '';
    const ex = sel.map(o => ({ c: o.c, date: o.main.exam, hour: D.EXAM_HOUR[o.c] })).sort((a, b) => (a.date || '9').localeCompare(b.date || '9'));
    const warn = [];
    for (let i = 1; i < ex.length; i++) {
      if (!ex[i].date || !ex[i - 1].date) continue;
      const g = (new Date(ex[i].date) - new Date(ex[i - 1].date)) / 864e5;
      if (g === 1) warn.push(`מבחנים בימים צמודים: ${C[ex[i - 1].c].name} ו${C[ex[i].c].name}`);
      if (g === 0) warn.push(`שני מבחנים באותו יום (${L.fmtDate(ex[i].date)}): ${C[ex[i - 1].c].name} ו${C[ex[i].c].name} — אורך המבחנים לא ידוע`);
    }
    return `<ul class="exams">${ex.map(e => `<li><time>${e.date ? L.fmtDate(e.date) : '—'}</time><span>${C[e.c].name}</span><small>${e.date ? (e.hour || 'שעה לא ידועה') : 'לא פורסם'}</small></li>`).join('')}</ul>
      ${warn.map(w => note(w, 'mid')).join('')}<p class="small muted">מקור: לוח מבחנים טיוטה מ-15.11.2026 · מועד א׳ בלבד.</p>`;
  }

  /* ---------- taking it out ---------- */
  // the timetable being exported: the chosen alternative, or the improved timetable (improve mode)
  const ep = () => ui.exportImp ? ui.exportPair : pair();
  function imPair() {
    const I = S().improve;
    if (!I || I.stage !== 'edit' || imOther()) return null;
    const sel = I.items.filter(it => it.c && !it.removed).map(it => L.mkOpt(it.c, G[it.main], it.subs.map(x => G[x]), it.subs.some(x => !G[it.main].links.includes(x))));
    if (!sel.length) return null;
    const a = { sel, m: L.metrics(sel, S().prefs, S().friends), miss: [] };
    return { A: a, B: a, improved: true };
  }
  function exportPanel(sem = 'א', ...improved) {
    ui.exportImp = improved.length > 0; ui.exportPair = improved[0] || null;
    const p = ep();
    const s = S();
    const bk = L.backupLink();
    // backup and erase do not need a timetable, so they stay available without one
    const keep = `<section class="ex"><h4>${icon('refresh')} קישור גיבוי</h4><p class="small muted">שומר את כל נתוני התכנון${bk.leftImprove ? '' : ' ואת המערכת המשופרת'}. פתיחה שלו תשאל לפני שמחליפים נתונים.</p>
        ${bk.leftImprove ? note('המערכת המשופרת לא נכנסה לקישור — הוא היה ארוך מדי.', 'mid') : ''}${btn('backup-copy', 'העתקת קישור גיבוי', { ic: 'copy' })}</section>
      <section class="ex danger-zone"><h4>${icon('trash')} מחיקת כל הנתונים</h4>${btn('erase', 'מחיקת הכול', { cls: 'danger sm' })}</section>`;
    if (!p) return `<div class="state">${icon('out')}<p>${ui.exportImp ? 'עוד אין מערכת משופרת לייצא. טוענים ומאשרים את המערכת קודם.' : 'עוד אין מערכת לייצא. בונים מערכת קודם.'}</p></div>${keep}`;
    const reg = L.registrationText(p, sem);
    const ic = L.ics(p, sem);
    return `<section class="ex"><h4>${icon('list')} רשימת הרשמה</h4><p class="small muted">כל הקורסים עם מספרי הקבוצות, קבוצות שוות, גיבוי למקרה שקבוצה מתמלאת, ומבחנים.</p>
        <details${ui.regOpen ? ' open' : ''}><summary>הצגת הרשימה</summary><pre class="pre">${esc(reg)}</pre></details>${btn('copy-reg', 'העתקה', { ic: 'copy', cls: 'primary', arg: sem })}</section>
      <section class="ex"><h4>${icon('cal')} ייצוא ליומן (.ics)</h4>${ic.error ? note(ic.error, 'mid') : `<p class="small muted">${ic.events} אירועים, בלי חגים. מבחנים: "שעת סיום משוערת — אורך המבחן לא פורסם".</p>${btn('ics', 'הורדת קובץ יומן', { ic: 'dl', arg: sem })}`}</section>
      <section class="ex"><h4>${icon('user')} סיכום ליועץ</h4><details><summary>תצוגה מקדימה</summary><pre class="pre">${esc(L.advisorText(p))}</pre></details>
        <div class="row wrap">${btn('adv-copy', 'העתקה כטקסט', { ic: 'copy' })}${btn('adv-print', 'הדפסה', { ic: 'print' })}${btn('adv-pdf', ui.advPdf === 'busy' ? 'מכינים…' : 'PDF / שיתוף', { ic: 'share', dis: ui.advPdf === 'busy' })}</div>
        ${ui.advPdf === 'fail' ? note('יצירת ה-PDF נכשלה בדפדפן הזה. אפשר להעתיק כטקסט או להדפיס ל-PDF.', 'mid') : ''}${ui.advPdf === 'chars' ? note('חלק מהתווים לא נתמכים ב-PDF ויוצגו כריבועים. העתקה כטקסט תמיד עובדת.', 'mid') : ''}</section>
      <section class="ex"><h4>${icon('share')} שיתוף עם חבר/ה</h4><p class="small muted">הקישור מכיל את השם ואת הקבוצות בלבד — בלי ציונים. כל מי שמחזיק אותו יכול לקרוא.</p>
        <label class="fld"><span>השם שיופיע</span><input class="inp" type="text" maxlength="20" value="${esc(s.shareName)}" data-act-change="share-name" placeholder="למשל: דנה"></label>
        <div class="row wrap">${btn('share-copy', 'העתקת קישור', { ic: 'link', cls: 'primary' })}${btn('share-native', 'שיתוף', { ic: 'share' })}<a class="btn" href="https://wa.me/?text=${encodeURIComponent(L.shareLink(p, s.shareName) || '')}" target="_blank" rel="noopener">${icon('share')}<span>וואטסאפ</span></a></div></section>
      ${keep}`;
  }
  A['copy-reg'] = (el, sem) => copyOrShow(L.registrationText(ep(), sem || 'א'), 'רשימת ההרשמה');
  A.ics = (el, sem) => { const r = L.ics(ep(), sem || 'א'); if (r.error) return toast(r.error); L.download('timetable.ics', r.text, 'text/calendar'); toast('קובץ היומן נוצר'); };
  A['adv-copy'] = () => copyOrShow(L.advisorText(ep()), 'הסיכום');
  A['adv-print'] = () => { const el = document.getElementById('print-area') || Object.assign(document.body.appendChild(document.createElement('pre')), { id: 'print-area' }); el.textContent = L.advisorText(ep()); window.print(); };
  A['adv-pdf'] = async () => {
    ui.advPdf = 'busy'; L.emit(); await new Promise(r => setTimeout(r, 900));
    const text = L.advisorText(ep());
    if (navigator.canShare && navigator.canShare({ text })) { try { await navigator.share({ title: 'סיכום ליועץ', text }); ui.advPdf = 'idle'; return L.emit(); } catch (e) { } }
    ui.advPdf = 'idle'; L.emit(); A['adv-print']();
  };
  A['share-name'] = el => set(s => { s.shareName = el.value.trim(); }, { rebuild: false });
  A['share-copy'] = () => { const u = L.shareLink(ep(), S().shareName); if (!u) return toast('אין עדיין מה לשתף'); copyOrShow(u, 'קישור השיתוף'); };
  A['share-native'] = async () => { const u = L.shareLink(ep(), S().shareName); if (!u) return toast('אין עדיין מה לשתף'); if (navigator.share) { try { await navigator.share({ title: 'המערכת שלי', url: u }); } catch (e) { } } else copyOrShow(u, 'קישור השיתוף'); };
  A['backup-copy'] = () => copyOrShow(L.backupLink().url, 'קישור הגיבוי');
  A.erase = async () => { if (await confirm('מחיקת כל הנתונים', '<p>כל מה ששמור בדפדפן יימחק: המצב שלך, הקורסים, ההעדפות, החברים והמערכות.</p><p><b>רק קישור גיבוי שהעתקת קודם יכול להחזיר אותם.</b></p>', 'מחיקה', { danger: true })) { L.eraseAll(); toast('הכול נמחק'); } };
  A.reload = () => location.reload();
  async function handleHash(onFriend) {
    const h = L.readHash(); if (!h) return;
    if (h.error) { await dialog(note(h.error, 'high') + `<div class="row end"><button class="btn primary" value="ok">הבנתי</button></div>`, { title: h.type === 'friend' ? 'קישור חבר' : 'קישור גיבוי' }); L.clearHash(); return; }
    if (h.type === 'friend') { friendFromHash(h); onFriend && onFriend(); L.emit(); return; }
    const ok = await confirm('שחזור מגיבוי', '<p>הקישור מכיל נתוני תכנון שמורים. <b>לשחזר ולהחליף את הנתונים הנוכחיים?</b></p><p class="small">אפשרות הפיצול לא תופעל מעצמה.</p>', 'שחזור');
    L.clearHash();
    if (ok) { L.restore(h.data); toast('הנתונים שוחזרו'); }
  }

  /* ---------- improve an existing timetable ---------- */
  function imLoad() {
    return `<p>טוענים את המערכת שכבר יש לך, שומרים מה שעובד ומזיזים רק מה שצריך.</p>
      <div class="methods">${btn('im-load', 'קובץ Excel מאפקה-נט', { arg: 'xlsx', ic: 'file', cls: 'method' })}${btn('im-load', 'PDF או צילום מסך של המתכנן', { arg: 'pdf', ic: 'camera', cls: 'method' })}${btn('im-load', 'בחירה ידנית', { arg: 'manual', ic: 'search', cls: 'method' })}</div>
      <p class="small muted">${icon('lock')} בקובץ ה-Excel יש מספר תעודת זהות במאפייני הקובץ. לא קוראים אותו לעולם.</p>`;
  }
  A['im-load'] = (el, src) => { L.improveLoad(src); toast('נקראו 8 שורות · 2 לבדיקה'); };
  function imReview() {
    const I = S().improve;
    const need = I.rows.filter(r => !r.sure);
    const ready = need.every(r => r.ok) && I.registered != null && I.sem;
    return `<p><b>${I.rows.length} שורות נקראו.</b> ${need.filter(r => !r.ok).length ? `${need.filter(r => !r.ok).length} מחכות לבדיקה.` : 'הכול מאושר.'}</p>
      <ul class="review">${I.rows.map(r => {
        if (r.gone) return `<li class="rv rv-info"><span class="chip">קבוע</span><span>${esc(r.fixed.name)} · ${L.DAYL[r.fixed.d]} ${L.rng(r.fixed.s, r.fixed.e)}<small>${esc(r.fileText)} — נשמר כשיעור קבוע עם השעות מהקובץ</small></span></li>`;
        if (r.sure) return `<li class="rv rv-ok"><span class="chip">תקין</span><span>${C[r.course].name} · ${num(r.main)}</span></li>`;
        return `<li class="rv ${r.ok ? 'rv-ok' : 'rv-mid'}"><span class="chip">${r.ok ? 'אושר' : 'לבדיקה'}</span><span>${C[r.course].name}<small>${esc(r.fileText)} · ${r.why}</small></span>
          ${r.choices.length > 1 ? sel('im-row-pick', r.pick || '', [['', 'בחירת קבוצה…'], ...r.choices.map(c => [c, num(c) + ' · ' + G[c].meetings.map(meetText).join(', ')])], { arg: r.id, label: 'קבוצה' }) : `<label class="cb"><input type="checkbox" data-act-change="im-row-ok" data-arg="${r.id}"${r.ok ? ' checked' : ''}> נכון</label>`}</li>`;
      }).join('')}</ul>
      <fieldset class="fs"><legend>המערכת הזאת כבר רשומה במכללה?</legend>${seg('im-registered', I.registered == null ? '' : I.registered ? 'y' : 'n', [['y', 'כן, רשום/ה'], ['n', 'עוד לא']])}
        <p class="small muted">אם כן — קבוצה מלאה תישאר רק איפה שכבר רשומים.</p></fieldset>
      <fieldset class="fs"><legend>סמסטר</legend>${I.source !== 'manual' ? `<p>סמסטר א׳ (מהקובץ) · סמסטר אחד בכל פעם</p>` : sel('im-sem', I.sem || '', [['', 'איזה סמסטר?'], ['א', 'סמסטר א׳'], ['ב', 'סמסטר ב׳']])}</fieldset>
      ${btn('im-continue', 'המשך', { cls: 'primary', dis: !ready })}${!ready ? '<p class="small muted">ממשיכים אחרי שכל שורה "לבדיקה" אושרה או תוקנה.</p>' : ''}`;
  }
  A['im-row-pick'] = (el, id) => { const r = S().improve.rows.find(x => x.id === id); r.pick = el.value || null; r.ok = !!el.value; L.save(); L.emit(); };
  A['im-row-ok'] = (el, id) => { const r = S().improve.rows.find(x => x.id === id); r.ok = el.checked; L.save(); L.emit(); };
  A['im-registered'] = el => { S().improve.registered = el.value === 'y'; L.save(); L.emit(); };
  A['im-sem'] = el => { S().improve.sem = el.value || null; L.save(); L.emit(); };
  A['im-continue'] = () => L.improveStart();
  function imOther() { const I = S().improve; return I && I.dataKey !== L.dataKey(); }
  function imEdit() {
    const I = S().improve;
    if (imOther()) return note(`המערכת השמורה שייכת לנתונים אחרים (תוכנית, שנה או מחזור אחרים). אפשר לצפות בה ולשחזר אותה; כדי לערוך — טוענים אותה מחדש. ${btn('im-reload', 'טעינה מחדש', { cls: 'sm' })}`, 'mid');
    const pend = imPending();
    const probs = L.improveProblems();
    const open = L.openCourses(I.sem || 'א').filter(x => ['ok', 'parallel'].includes(x.el.kind) && !I.items.some(it => it.c === x.c.id));
    return `${I.registered ? `<p class="small">${icon('clock')} מקומות נבדקו לפני ${L.fmtDate(D.SEATS_READ)}.</p>` : ''}
      <h4>מה נשאר ומה יכול לזוז</h4><ul class="im-items">${I.items.map(it => imItem(it)).join('')}</ul>
      <div class="row wrap">${sel('im-add', ui.imAdd, [['', 'הוספת קורס…'], ...open.map(x => [x.c.id, x.c.name])], { label: 'הוספת קורס' })}${btn('im-add-go', 'הוספה', { cls: 'sm', ic: 'plus' })}</div>
      ${pend.length ? `<h4>שינויים ממתינים (${pend.length})</h4><ul class="pend">${pend.map(p => `<li><span>${p.text}</span>${btn('im-undo', 'ביטול', { arg: p.key + '|' + p.kind, cls: 'sm ghost', ic: 'undo' })}</li>`).join('')}</ul>` : ''}
      <h4>המטרה</h4>${imGoals()}
      ${probs.map(p => note(p.text, p.t === 'overlap' ? 'high' : 'mid')).join('')}
      ${btn('im-search', 'חיפוש הצעות', { cls: 'primary', ic: 'search', dis: probs.some(p => p.t === 'overlap') })}`;
  }
  function imItem(it) {
    const I = S().improve;
    if (it.fixed) return `<li class="im-it fixedl"><div><b>${esc(it.fixed.name)}</b><small>${L.DAYL[it.fixed.d]} ${L.rng(it.fixed.s, it.fixed.e)} · שיעור קבוע מהקובץ</small></div></li>`;
    const c = C[it.c];
    const orig = I.original.find(o => o.key === it.key);
    const meet = L.itemMeet(it).map(m => meetText(m)).join(', ');
    let opts = '';
    if (it.move && !it.removed) {
      const others = I.items.filter(x => x !== it && !x.removed).flatMap(L.itemMeet);
      const list = L.optionsFor(it.c, I.sem || 'א', { ...S().prefs, includeFull: !I.registered && S().prefs.includeFull }, { busy: S().busy, lect: false }).filter(o => o.key !== [it.main, ...it.subs].join('+'));
      const fits = list.filter(o => !o.meet.some(m => others.some(x => x.d === m.d && m.s < x.e && x.s < m.e)));
      opts = `<details class="im-opts"><summary>${fits.length} שילובי קבוצות אחרים מתאימים לשאר המערכת</summary><p class="small muted">נמצאו בחיפוש מוגבל בזמן — לא הבטחה לכל האפשרויות.</p>
        <ul>${fits.map(o => `<li><span>${o.parts.map(g => num(g.id)).join('+')} · ${o.meet.map(meetText).join(', ')} · ${o.main.lecturer}${o.split ? ' · <span class="chip">פיצול</span>' : ''}</span>${btn('im-opt', 'לבחור', { arg: it.key + '|' + o.key, cls: 'sm' })}</li>`).join('') || '<li class="muted">אין שילוב שמתאים בלי להזיז עוד קורס.</li>'}</ul></details>`;
    }
    return `<li class="im-it ${color(it.c)}${it.removed ? ' removed' : ''}${it.added ? ' added' : ''}"><div><b>${c.name}</b><small>${[it.main, ...it.subs].map(num).join('+')} · ${meet}${orig && orig.main !== it.main ? ' · <b>שונה</b>' : ''}</small></div>
      ${it.removed ? '<span class="chip">יוסר</span>' : `<div class="row">${seg('im-move', it.move ? 'move' : 'stay', [['stay', 'נשאר'], ['move', 'יכול לזוז']], { arg: it.key, cls: 'sm', label: c.name })}${btn('im-rm', '', { arg: it.key, ic: 'trash', cls: 'icb', aria: 'הסרת ' + c.name })}</div>`}${opts}</li>`;
  }
  function imPending() {
    const I = S().improve, out = [];
    for (const it of I.items) {
      if (it.fixed) continue;
      const o = I.original.find(x => x.key === it.key);
      if (it.added) out.push({ key: it.key, kind: 'added', text: `+ הוספה: ${C[it.c].name}` });
      if (it.removed) out.push({ key: it.key, kind: 'removed', text: `− הסרה: ${C[it.c].name}` });
      if (it.move && !it.removed) out.push({ key: it.key, kind: 'move', text: `${C[it.c].name}: יכול לזוז` });
      if (o && o.main !== it.main) out.push({ key: it.key, kind: 'group', text: `${C[it.c].name}: קבוצה ${num(it.main)} במקום ${num(o.main)}` });
    }
    return out;
  }
  function imGoals() {
    const g = S().improve.goals;
    return `<div class="goals">
      <label class="fld"><span>לפנות יום</span>${sel('im-goal-day', g.freeDay || '', [['', 'לא'], ...[1, 2, 3, 4, 5].map(d => [d, 'יום ' + L.DAYS[d]])])}</label>
      <label class="cb"><input type="checkbox" data-act-change="im-goal-gaps"${g.gaps ? ' checked' : ''}> פחות חלונות</label>
      <label class="fld"><span>לסיים עד</span>${sel('im-goal-finish', g.finishBy || '', [['', 'לא משנה'], ...hours(13, 20)])}</label></div>`;
  }
  const imSet = fn => { const I = S().improve; fn(I); I.proposals = null; L.save(); L.emit(); };
  A['im-move'] = (el, key) => imSet(I => { I.items.find(x => x.key === key).move = el.value === 'move'; });
  A['im-opt'] = (el, a) => { const [key, ok] = a.split('|'); const parts = ok.split('+'); imSet(I => { const it = I.items.find(x => x.key === key); it.main = parts[0]; it.subs = parts.slice(1); it.move = false; }); toast('הקבוצה הוחלפה'); };
  A['im-rm'] = async (el, key) => {
    const I = S().improve, it = I.items.find(x => x.key === key);
    const dep = I.items.find(x => x.c && x.c !== it.c && !x.removed && L.PARALLEL[x.c] === it.c);
    if (dep) {
      const both = await confirm('הסרת קורס', `${C[dep.c].name} צריך את ${C[it.c].name} במקביל. להסיר את שניהם?`, 'להסיר את שניהם', { cancel: 'ביטול' });
      if (!both) return;
      imSet(I => { I.items.find(x => x.key === dep.key).removed = true; });
    }
    imSet(I => { const x = I.items.find(y => y.key === key); if (x.added) I.items = I.items.filter(y => y.key !== key); else x.removed = true; });
  };
  A['im-add'] = el => { ui.imAdd = el.value; };
  A['im-add-go'] = () => {
    const id = ui.imAdd; if (!id) return toast('בחרו קורס');
    const o = L.optionsFor(id, S().improve.sem || 'א', S().prefs, { lect: false })[0];
    if (!o) return toast('אין קבוצה פתוחה לקורס הזה');
    imSet(I => { I.items.push({ key: 'a' + Date.now(), c: id, main: o.main.id, subs: o.subs.map(g => g.id), move: true, added: true }); });
    ui.imAdd = '';
  };
  A['im-undo'] = (el, a) => {
    const [key, kind] = a.split('|');
    imSet(I => {
      const it = I.items.find(x => x.key === key), o = I.original.find(x => x.key === key);
      if (kind === 'added') I.items = I.items.filter(x => x.key !== key);
      if (kind === 'removed') it.removed = false;
      if (kind === 'move') it.move = false;
      if (kind === 'group') { it.main = o.main; it.subs = o.subs.slice(); }
    });
  };
  A['im-goal-day'] = el => imSet(I => { I.goals.freeDay = el.value ? +el.value : null; });
  A['im-goal-gaps'] = el => imSet(I => { I.goals.gaps = el.checked; });
  A['im-goal-finish'] = el => imSet(I => { I.goals.finishBy = el.value ? +el.value : null; });
  A['im-search'] = () => {
    const I = S().improve;
    if (!I.goals.freeDay && !I.goals.gaps && !I.goals.finishBy && !I.items.some(x => x.added || x.removed)) return toast('בחרו מטרה קודם');
    ui.imBusy = true; L.emit();
    setTimeout(() => { I.proposals = L.improveSearch(); ui.imBusy = false; ui.prop = 0; L.save(); L.emit(); }, 900);
  };
  A['im-let-move'] = (el, key) => { imSet(I => { I.items.find(x => x.key === key).move = true; }); A['im-search'](); };
  A['im-prop'] = (el, i) => { ui.prop = +i; ui.showWhere = null; L.emit(); };
  A['im-where'] = (el, c) => { ui.showWhere = ui.showWhere === c ? null : c; L.emit(); };
  A['im-save'] = () => {
    const I = S().improve, p = I.proposals.list[ui.prop];
    imSet(I2 => { for (const o of p.pick) { const it = I2.items.find(x => x.c === o.c); it.main = o.main.id; it.subs = o.subs.map(g => g.id); it.move = false; } I2.items = I2.items.filter(x => !x.removed).map(x => ({ ...x, added: false })); });
    toast('ההצעה נשמרה — זו עכשיו המערכת הנוכחית');
  };
  A['im-original'] = () => imSet(I => { I.items = JSON.parse(JSON.stringify(I.original)); });
  A['im-copy'] = () => copyOrShow(imChangesText(), 'רשימת השינויים');
  A['im-reload'] = () => { L.improveLoad(S().improve.source); };
  function imChangesText() {
    const I = S().improve, p = I.proposals && I.proposals.list[ui.prop];
    const add = [], rm = [];
    for (const it of I.items) if (it.added && !it.removed) { const o = p && p.pick.find(q => q.c === it.c); add.push(`${C[it.c].name}: ${(o ? o.parts.map(g => g.id) : [it.main, ...it.subs]).map(num).join(', ')}`); }
    if (p) for (const o of p.pick) { const it = I.items.find(x => x.c === o.c); if (it.added) continue; const was = [it.main, ...it.subs]; const now = o.parts.map(g => g.id); if (was.join() !== now.join()) { rm.push(`${C[o.c].name}: ${was.map(num).join(', ')}`); add.push(`${C[o.c].name}: ${now.map(num).join(', ')}`); } }
    for (const it of I.items) { if (it.removed && !it.added) rm.push(`${C[it.c].name}: ${[it.main, ...it.subs].map(num).join(', ')}`); }
    return `שינויים במערכת (תוכנית בלבד — מבצעים באפקה-נט)\n\nלהוסיף:\n${add.map(x => '  ' + x).join('\n') || '  —'}\n\nלהסיר:\n${rm.map(x => '  ' + x).join('\n') || '  —'}`;
  }
  function imProposals() {
    const I = S().improve, r = I.proposals;
    if (ui.imBusy) return `<div class="state computing" role="status"><span class="spin"></span><p>מחפשים הצעות…</p></div>`;
    if (!r) return '';
    if (r.recVer !== S().recVer || r.dataKey !== L.dataKey()) return note(`ההצעות שהוצגו בוטלו כי המצב שלך או הנתונים השתנו. ${btn('im-search', 'חיפוש חדש', { cls: 'sm' })}`, 'mid');
    if (!r.list.length) return `<div class="state none" role="status">${icon('target')}<p><b>${r.cut ? 'לא הכול נבדק' : 'אין הצעה שעומדת במטרה'}</b></p>${(r.diag || []).map(d => `<p>${d}</p>`).join('')}
      ${r.hint ? `<p>אם <b>${r.hint.name}</b> יזוז, יש פתרון.</p>${btn('im-let-move', `לאפשר ל${r.hint.name} לזוז`, { arg: r.hint.key, cls: 'primary' })}` : ''}${r.cut ? '<p class="small muted">החיפוש נעצר במגבלת הזמן — זה לא "אין פתרון".</p>' : ''}</div>`;
    const p = r.list[ui.prop] || r.list[0];
    return `<div class="props-nav" role="tablist" aria-label="הצעות">${r.list.map((x, i) => `<button type="button" role="tab" aria-selected="${i === ui.prop}" class="pchip${i === ui.prop ? ' on' : ''}${x.split ? ' split' : ''}" data-act="im-prop" data-arg="${i}">${i + 1}${x.split ? ' · פיצול' : ''}</button>`).join('')}</div>
      <div class="prop"><p class="prop-gain">${L.improveExplain(p)}</p>
      <table class="cmp"><caption class="vh">לפני ואחרי</caption><thead><tr><th scope="col">קורס</th><th scope="col">לפני</th><th scope="col">אחרי</th><th scope="col" class="w44"><span class="vh">איפה</span></th></tr></thead><tbody>
      ${p.pick.map(o => { const it = I.items.find(x => x.c === o.c); const was = G[it.main]; const same = was.id === o.main.id; return same ? '' : `<tr><th scope="row">${C[o.c].name}</th><td>${was.meetings.map(meetText).join(', ')}<br><small>${num(was.id)} · ${was.lecturer}</small></td><td>${o.main.meetings.map(meetText).join(', ')}<br><small>${num(o.main.id)} · ${o.main.lecturer}</small></td><td>${btn('im-where', '', { arg: o.c, cls: 'icb', ic: 'target', aria: 'איפה זה במערכת: ' + C[o.c].name })}</td></tr>`; }).join('')}
      ${I.items.filter(x => x.added).map(x => `<tr><th scope="row">${C[x.c].name}</th><td>—</td><td>נוסף</td><td></td></tr>`).join('')}
      ${I.items.filter(x => x.removed).map(x => `<tr><th scope="row">${C[x.c].name}</th><td>${num(x.main)}</td><td>הוסר</td><td></td></tr>`).join('')}</tbody></table>
      ${p.split ? note('הצעה עם פיצול הרצאה/תרגול — דרוש אישור ייעוץ.', 'mid') : ''}
      <div class="row wrap">${btn('im-save', 'לשמור את ההצעה', { cls: 'primary', ic: 'check' })}${btn('im-copy', 'העתקת השינויים', { ic: 'copy' })}${btn('im-original', 'חזרה למקור', { ic: 'undo', cls: 'ghost' })}</div></div>`;
  }
  function imWeekItems() {
    const I = S().improve; if (!I || !I.items.length) return [];
    const p = I.proposals && I.proposals.list.length && I.proposals.recVer === S().recVer ? I.proposals.list[ui.prop] : null;
    const it = [];
    for (const x of I.items) {
      if (x.removed) continue;
      const o = p && p.pick.find(q => q.c === x.c);
      const meets = o ? o.meet : L.itemMeet(x);
      const moved = o && o.main.id !== x.main;
      for (const m of meets) it.push(m.g ? { d: m.d, s: m.s, e: m.e, kind: 'lesson', gid: m.g.id, c: x.c, title: C[x.c].name, type: kindName(m.g.kind), room: m.g.room, color: color(x.c), friends: [], pinned: !x.move, moved, hl: ui.showWhere === x.c }
        : { d: m.d, s: m.s, e: m.e, kind: 'busy', title: x.fixed.name + ' (קבוע)' });
      if (moved) for (const m of L.itemMeet(x)) it.push({ d: m.d, s: m.s, e: m.e, kind: 'ghost', title: C[x.c].name, label: 'היה כאן: ' + C[x.c].name });
    }
    for (const b of S().busy) it.push({ d: b.d, s: b.s, e: b.e, kind: 'busy', title: b.label || 'זמן חסום' });
    return it;
  }
  function improveSplitOff() {
    const I = S().improve; if (!I || !I.items) return;
    const back = I.items.filter(it => it.c && it.subs.some(s => G[s] && !G[it.main].links.includes(s)));
    for (const it of back) { const o = I.original.find(x => x.key === it.key); if (o) { it.main = o.main; it.subs = o.subs.slice(); } }
    if (back.length) toast('הוחזרו קבוצות שדרשו פיצול: ' + back.map(x => C[x.c].name).join(', '));
    I.proposals = null; L.save();
  }

  /* ---------- progress map ---------- */
  function mapView() {
    const m = ui.map, p = pair();
    const planned = new Set(p ? ['A', 'B'].flatMap(k => p[k] ? p[k].sel.map(o => o.c) : []) : []);
    const y = S().profile.year || 1;
    const nodes = Object.values(C).filter(c => c.year && (m.filter === 'all' || (m.filter === 'remaining' ? !L.isDone(c.id) : c.year === y)));
    const stOf = c => L.isDone(c.id) ? 'done' : planned.has(c.id) ? 'planned' : ['ok', 'parallel'].includes(L.eligibility(c.id, 'א').kind) ? 'eligible' : 'open';
    const stName = { done: 'הושלם', planned: 'בתוכנית', eligible: 'אפשר לקחת', open: 'עוד לא פתוח' };
    const addCr = [...planned].reduce((a, id) => a + C[id].credits, 0);
    const head = `<div class="map-tools" role="toolbar" aria-label="כלי המפה">
      ${seg('map-filter', m.filter, [['all', 'הכול'], ['remaining', 'מה שנשאר'], ['year', 'השנה שלי']], { cls: 'sm', label: 'סינון' })}
      ${sw('map-initials', m.initials, 'ראשי תיבות')}
      ${btn('map-list', m.list ? 'מפה' : 'רשימה', { ic: m.list ? 'map' : 'list', cls: 'sm' })}
      ${R() && R().alts.length > 1 ? sel('map-alt', S().altIdx, R().alts.map((_, i) => [i, 'חלופה ' + (i + 1)]), { label: 'חלופה' }) : ''}
      ${btn('map-week', 'מבט על השבוע', { ic: 'cal', cls: 'sm ghost' })}</div>
      <p class="small">נ"ז בתואר: <b>${L.progress().done}</b> מתוך ${D.REQ.total} · התוכנית שנבחרה מוסיפה <b>${addCr}</b></p>
      <ul class="legend">${Object.entries(stName).map(([k, v]) => `<li><i class="lg ${k}"></i>${v}</li>`).join('')}</ul>`;
    if (m.list || ui.mapFail) return head + (ui.mapFail ? note('המפה לא נטענה — מוצגת רשימה.', 'mid') : '') + `<ul class="map-list">${[1, 2, 3, 4].map(yy => nodes.filter(c => c.year === yy)).filter(a => a.length).map(a => `<li><h5>שנה ${L.YEARS[a[0].year - 1]}</h5><ul>${a.map(c => `<li class="ml ${stOf(c)}"><b>${c.name}</b> · ${stName[stOf(c)]}<br><small>${c.prereqText ? 'קדם: ' + c.prereqText : 'אין קדם'}${L.PARALLEL[c.id] ? ' · במקביל: ' + C[L.PARALLEL[c.id]].name : ''} · פותח ${L.unlocks(c.id)}</small></li>`).join('')}</ul></li>`).join('')}</ul>`;
    const cols = {}, pos = {};
    for (const c of nodes) { (cols[c.year] = cols[c.year] || []).push(c); }
    const W = 190, H = 54, gx = 70, gy = 18;
    const years = Object.keys(cols).map(Number).sort();
    years.forEach((yy, xi) => cols[yy].forEach((c, i) => { pos[c.id] = { x: (years.length - 1 - xi) * (W + gx) + 20, y: i * (H + gy) + 40 }; }));
    const w = years.length * (W + gx) + 20, h = Math.max(...years.map(yy => cols[yy].length)) * (H + gy) + 60;
    let edges = '';
    for (const c of nodes) for (const alts of c.prereqs) for (const n of alts) { const src = Object.values(C).find(x => x.name === n); if (src && pos[src.id] && pos[c.id]) { const a = pos[src.id], b = pos[c.id]; edges += `<path class="edge${alts.length > 1 ? ' alt' : ''}" d="M${a.x} ${a.y + H / 2} C${a.x - 35} ${a.y + H / 2} ${b.x + W + 35} ${b.y + H / 2} ${b.x + W} ${b.y + H / 2}"/>`; } }
    const initials = n => n.split(/[\s-]+/).filter(Boolean).map(x => x[0]).join('').slice(0, 4);
    const z = ui.mapZoom;
    return head + `<div class="map-wrap"><div class="map-zoom" role="group" aria-label="זום">${btn('map-zoom', '', { arg: 'in', ic: 'plus', cls: 'icb', aria: 'הגדלה' })}${btn('map-zoom', '', { arg: 'out', ic: 'minus', cls: 'icb', aria: 'הקטנה' })}${btn('map-zoom', 'התאמה למסך', { arg: 'fit', cls: 'sm' })}</div>
      <div class="map-vp" id="map-vp" tabindex="0" aria-label="מפת התקדמות. גוררים להזזה; אפשר גם רשימה נגישה."><svg class="map" id="map-svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="transform:translate(${z.x}px,${z.y}px) scale(${z.k})" data-w="${w}" data-h="${h}" role="img" aria-label="מפת קורסים לפי שנים">
      ${years.map((yy, xi) => `<text class="yl" x="${(years.length - 1 - xi) * (W + gx) + 20 + W / 2}" y="22" text-anchor="middle">שנה ${L.YEARS[yy - 1]}</text>`).join('')}
      ${edges}${nodes.map(c => { const p0 = pos[c.id], st = stOf(c); return `<g class="node ${st}" transform="translate(${p0.x},${p0.y})"><rect width="${W}" height="${H}" rx="10"/><text x="${W - 12}" y="23" text-anchor="start" class="nt">${esc(m.initials ? initials(c.name) : c.name)}</text><text x="${W - 12}" y="42" text-anchor="start" class="ns">${c.credits} נ"ז · ${stName[st]}</text></g>`; }).join('')}</svg></div></div>`;
  }
  A['map-filter'] = el => { ui.map.filter = el.value; L.emit(); };
  A['map-initials'] = el => { ui.map.initials = el.checked; L.emit(); };
  A['map-list'] = () => { ui.map.list = !ui.map.list; L.emit(); };
  A['map-alt'] = el => set(s => { s.altIdx = +el.value; }, { rebuild: false });
  A['map-zoom'] = (el, how) => {
    const z = ui.mapZoom;
    if (how === 'in') z.k = Math.min(2.5, z.k * 1.25);
    if (how === 'out') z.k = Math.max(0.3, z.k / 1.25);
    if (how === 'fit') { const vp = document.getElementById('map-vp'), sv = document.getElementById('map-svg'); if (vp && sv) { z.k = Math.min(vp.clientWidth / sv.dataset.w, vp.clientHeight / sv.dataset.h, 1.2); z.x = 0; z.y = 0; } }
    L.emit();
  };
  function bindMapDrag() {
    const vp = document.getElementById('map-vp'); if (!vp || vp._b) return; vp._b = 1;
    let st = null;
    vp.addEventListener('pointerdown', e => { st = { x: e.clientX, y: e.clientY, ox: ui.mapZoom.x, oy: ui.mapZoom.y }; vp.setPointerCapture(e.pointerId); });
    vp.addEventListener('pointermove', e => { if (!st) return; ui.mapZoom.x = st.ox + e.clientX - st.x; ui.mapZoom.y = st.oy + e.clientY - st.y; const sv = document.getElementById('map-svg'); sv.style.transform = `translate(${ui.mapZoom.x}px,${ui.mapZoom.y}px) scale(${ui.mapZoom.k})`; });
    vp.addEventListener('pointerup', () => { st = null; });
    vp.addEventListener('keydown', e => { const k = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[e.key]; if (k) { e.preventDefault(); ui.mapZoom.x += k[0]; ui.mapZoom.y += k[1]; L.emit(); } if (e.key === '+') A['map-zoom'](null, 'in'); if (e.key === '-') A['map-zoom'](null, 'out'); });
  }

  /* ---------- the rarely seen states, shown once ---------- */
  function statesPage() {
    const card = (t, body) => `<section class="stc"><h4>${t}</h4>${body}</section>`;
    return `<p>הודעות שרואים לעיתים רחוקות. חלקן אפשר להפעיל "באמת" בכפתור.</p><div class="stgrid">
      ${card('אחסון נכשל', note('<b>השינויים לא נשמרים</b> בדפדפן הזה. כדי לא לאבד אותם — <button type="button" class="lnk" data-act="backup-copy">העתיקו קישור גיבוי</button>.', 'high'))}
      ${card('לשונית אחרת שינתה נתונים', note('<b>הנתונים השתנו בלשונית אחרת.</b> <button type="button" class="lnk" data-act="reload">טעינה מחדש</button>', 'mid'))}
      ${card('הודעה מהמפעיל', noticeBar())}
      ${card('טעינת הנתונים נכשלה', `<div class="state err">${icon('warn')}<p>לא הצלחנו לטעון את נתוני הקורסים.</p>${btn('reload', 'נסו שוב', { cls: 'primary sm' })}</div>`)}
      ${card('תוכנית או מחזור לא זמינים', note('אין נתונים למחזור 2023 של הנדסה מכנית. משתמשים במחזור <b>2024</b> במקומו.', 'mid') + note('אין עדיין נתונים לתוכנית "מדעי הנתונים".', 'high'))}
      ${card('נתוני ב׳ לא נטענו', note('נתוני סמסטר ב׳ לא נטענו — התוכנית השנתית חזרה לסמסטר אחד.', 'mid'))}
      ${card('קישור גיבוי פגום / ישן', note('הקישור פגום או חתוך (אולי הועתק חלקית). הנתונים הנוכחיים לא השתנו.', 'high') + note('קישור הגיבוי נוצר בגרסה ישנה ואינו נתמך. הנתונים הנוכחיים לא השתנו.', 'mid'))}
      ${card('קישור חבר משנה אחרת', note('הקישור מכיל קבוצות שלא קיימות בנתונים הנוכחיים (אולי משנה אחרת).', 'high'))}
      ${card('העתקה נכשלה', `<p class="small">כשהעתקה נכשלת מוצג הטקסט להעתקה ידנית.</p>${btn('demo-copyfail', 'להדגים', { cls: 'sm' })}`)}
      ${card('סיכום ליועץ', note('מכינים PDF…', 'info') + note('יצירת ה-PDF נכשלה בדפדפן הזה. אפשר להעתיק כטקסט או להדפיס ל-PDF.', 'mid') + note('חלק מהתווים לא נתמכים ב-PDF ויוצגו כריבועים. העתקה כטקסט תמיד עובדת.', 'mid'))}
      ${card('יומן לא זמין', note('לוח השנה של סמסטר קיץ עוד לא פורסם, אז אי אפשר לייצא ליומן.', 'mid'))}
      ${card('תור הרשמה לא ידוע', `<p>${icon('clock')} תור ההרשמה שלך: <b>לא ידוע</b> עדיין.</p>`)}
      ${card('מצבי מקומות', `<p>12 מקומות · <span class="chip mid">ישן</span> · <span class="chip high">הבדיקה נכשלה</span> · <span class="chip">לא ידוע</span></p><p class="small">נבדק 18.11.2026 22:00 · השתנה לאחרונה 17.11.2026 13:20</p>`)}
      ${card('מערכת שמורה מנתונים אחרים', note('המערכת השמורה שייכת לנתונים אחרים (תוכנית, שנה או מחזור אחרים). אפשר לצפות בה ולשחזר; כדי לערוך — טוענים מחדש.', 'mid'))}
      ${card('הצעה שבוטלה', note('ההצעות שהוצגו בוטלו כי המצב שלך או הנתונים השתנו. אפשר לחפש מחדש.', 'mid'))}
      ${card('שגיאת חישוב', `<p class="small">מפעיל שגיאה אמיתית בבניית המערכות.</p>${btn('demo-error', 'להפעיל', { cls: 'sm' })}`)}
      ${card('אין חלופות', `<div class="state none">${icon('target')}<p><b>אין מערכת שמתאימה.</b></p><p>חוזק חומרים 1 (חובה): כל הקבוצות נופלות על זמן חסום (עבודה).</p></div>`)}
      ${card('הייבוא מגיליון', Object.values(GI_STATES).map(v => note(`<b>${v[0]}.</b> ${v[1]}`, v[2])).join(''))}
    </div>`;
  }
  A['demo-copyfail'] = () => { L.forceCopyFail = true; copyOrShow('טקסט לדוגמה להעתקה ידנית').then(() => { L.forceCopyFail = false; }); };
  A['demo-error'] = () => { L.forceError = true; L.compute(0); toast('הופעלה שגיאת חישוב — ראו את מסך המערכות'); };
  A['terms-full'] = fullTerms;
  A.skip = (el, a, ev) => { ev.preventDefault(); const t = document.getElementById(el.getAttribute('href').slice(1)); if (t) { t.tabIndex = -1; t.focus(); } };

  /* ---------- event wiring ---------- */
  let extra = {};
  function use(actions) { extra = actions; }
  function run(name, el, ev) {
    const f = extra[name] || A[name];
    if (f) { f(el, el.dataset.arg, ev); return true; }
    return false;
  }
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    run(el.dataset.act, el, e);
  });
  document.addEventListener('change', e => { const el = e.target.closest('[data-act-change]'); if (el) run(el.dataset.actChange, el, e); });
  document.addEventListener('input', e => { const el = e.target.closest('[data-act-input]'); if (el) run(el.dataset.actInput, el, e); });

  // keep focus and scroll positions across full re-renders
  function keep(fn) {
    const a = document.activeElement;
    let fk = null;
    if (a && a !== document.body) {
      const all = [...document.querySelectorAll('button,input,select,textarea,a,[tabindex]')];
      fk = { act: a.dataset && (a.dataset.act || a.dataset.actChange || a.dataset.actInput), arg: a.dataset && a.dataset.arg, val: a.value, idx: all.indexOf(a), id: a.id, sel: a.selectionStart };
    }
    const scrolls = [...document.querySelectorAll('[data-keep]')].map(el => [el.dataset.keep, el.scrollTop, el.scrollLeft]);
    fn();
    for (const [k, t, l] of scrolls) { const el = document.querySelector(`[data-keep="${k}"]`); if (el) { el.scrollTop = t; el.scrollLeft = l; } }
    if (fk && !document.querySelector('dialog[open]')) {
      let el = fk.id && document.getElementById(fk.id);
      if (!el && fk.act) el = [...document.querySelectorAll(`[data-act="${fk.act}"],[data-act-change="${fk.act}"],[data-act-input="${fk.act}"]`)].find(x => (x.dataset.arg || '') === (fk.arg || '') && (x.type !== 'radio' || x.value === fk.val));
      if (el) { el.focus({ preventScroll: true }); if (fk.sel != null && el.setSelectionRange && el.type !== 'number') try { el.setSelectionRange(fk.sel, fk.sel); } catch (e) { } }
    }
    bindMapDrag();
  }
  function applyTheme() {
    const t = L.S.theme;
    document.documentElement.dataset.theme = t === 'auto' ? '' : t;
    if (t === 'auto') delete document.documentElement.dataset.theme;
    const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = dark ? '#111418' : '#ffffff';
  }
  A.theme = (el, t) => { set(s => { s.theme = t || (s.theme === 'auto' ? 'dark' : s.theme === 'dark' ? 'light' : 'auto'); }, { rebuild: false }); applyTheme(); };
  const themeIcon = () => icon(L.S.theme === 'dark' ? 'moon' : L.S.theme === 'light' ? 'sun' : 'auto');
  const themeLabel = () => ({ auto: 'ערכת צבעים: לפי המכשיר', dark: 'ערכת צבעים: כהה', light: 'ערכת צבעים: בהירה' })[L.S.theme];

  // demo entry: ?demo fills a sample student so every screen has content
  function demoSeed() {
    const q = new URLSearchParams(location.search);
    if (q.has('theme')) L.S.theme = q.get('theme');
    if (!q.has('demo')) return;
    L.set(s => {
      s.terms = true; s.tourSeen = true; s.profile = { program: 'me', track: 'יום', year: 2 };
      s.record = JSON.parse(JSON.stringify(D.DEMO_RECORD)); s.english = { exam: 'אמירנט', score: 124 };
      s.friends = JSON.parse(JSON.stringify(D.FRIENDS)); s.busy = [{ id: 'b1', d: 2, s: 18 * 60, e: 21 * 60, label: 'עבודה' }];
      if (q.get('demo') === 'review') L.improveLoad('xlsx');
      if (q.get('demo') === 'improve') { L.improveLoad('xlsx'); s.improve.rows.forEach(r => { r.ok = true; if (r.choices) r.pick = r.choices[0]; }); s.improve.registered = true; }
    }, { rebuild: true });
    if (q.get('demo') === 'improve') { L.improveStart(); const I = L.S.improve; I.items.find(x => x.c === '90917').move = true; I.goals.freeDay = 5; I.proposals = L.improveSearch(); L.save(); }
    history.replaceState(null, '', location.pathname + location.hash);
  }

  return {
    ui, A, icon, btn, seg, sw, note, chip, sel, color, kindName, meetText, esc,
    dialog, closeDialog, confirm, toast, copyOrShow, use, run, keep, applyTheme, themeIcon, themeLabel, demoSeed,
    termsBody, fullTerms, infoBlock, noticeBar, systemBanners, profileForm, turnBlock, progressBlock, specBlock, englishBlock,
    passedEditor, gradeImport, courseChooser, capBlock, planBlock, elText, wishes, weightsNotice, rulesBlock, lecturersBlock, busyBlock,
    examsRuleBlock, groupsBlock, prefsAll, resetPrefs, friendsPanel, handleHash, pair, semSel, weekItems, weekGrid, agenda, altStats, altDiff,
    altLeftOut, resultNotes, orderSel, stateBlock, planNote, lessonDetail, pinsBlock, examsBlock, exportPanel,
    imLoad, imReview, imEdit, imProposals, imWeekItems, imPending, imOther, imPair, mapView, statesPage
  };
})();
