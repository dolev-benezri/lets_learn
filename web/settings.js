// The holder-edited file web/settings.json (see the adoption design, items 6, 8, 10, 11). Rebuilt field by field, like normalize() in app.js:
// whatever is missing or the wrong type falls back to the default, so a broken file never breaks the site.
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MOMENT = /^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d(\.\d+)?)?(Z|[+-]\d\d:\d\d)$/; // an instant: the zone is required
const str = (v) => (typeof v === 'string' ? v : '');
const trimmed = (v) => str(v).trim();
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const validDate = (s) => typeof s === 'string' && !Number.isNaN(new Date(s).getTime());

export const SETTINGS_DEFAULT = { supportEmail: '', counselingUrl: '', notice: '', turns: [], programs: {} };

function httpsUrl(v) {
  if (typeof v !== 'string') return '';
  try { const u = new URL(v); return u.protocol === 'https:' && u.href.startsWith('https://') ? u.href : ''; } catch { return ''; }
}

function cleanTurns(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((t) => isObj(t) && str(t.id) && str(t.label) && MOMENT.test(t.opensAt) && validDate(t.opensAt)).map((t) => ({ id: t.id, label: t.label, opensAt: t.opensAt }));
}

function cleanProgram(raw) {
  const out = {};
  if (isObj(raw.approved)) {
    const a = Object.fromEntries(Object.entries(raw.approved).filter(([y, d]) => /^\d{4}$/.test(y) && DAY.test(d) && validDate(d)));
    if (Object.keys(a).length) out.approved = a;
  }
  if (Array.isArray(raw.conflicts)) {
    const c = raw.conflicts
      .filter((x) => isObj(x) && Array.isArray(x.cohorts) && x.cohorts.length && x.cohorts.every(Number.isInteger) && trimmed(x.text) && trimmed(x.text).length <= 300)
      .map((x) => ({ cohorts: [...x.cohorts], text: x.text.trim() }));
    if (c.length) out.conflicts = c;
  }
  return out;
}

function cleanPrograms(raw) {
  const out = {};
  if (!isObj(raw)) return out;
  for (const [id, p] of Object.entries(raw)) {
    if (!/^\d+$/.test(id) || !isObj(p)) continue; // program ids are numbers; this also keeps "__proto__" out
    const c = cleanProgram(p);
    if (Object.keys(c).length) out[id] = c;
  }
  return out;
}

export function cleanSettings(raw) {
  if (!isObj(raw)) return { ...SETTINGS_DEFAULT, turns: [], programs: {} };
  return {
    supportEmail: EMAIL.test(str(raw.supportEmail)) ? raw.supportEmail : '',
    counselingUrl: httpsUrl(raw.counselingUrl),
    notice: trimmed(raw.notice),
    turns: cleanTurns(raw.turns),
    programs: cleanPrograms(raw.programs),
  };
}
