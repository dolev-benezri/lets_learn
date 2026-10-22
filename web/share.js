// State <-> URL hash. Friend links carry only name + group ids (privacy); backups carry everything.
import { cleanProfile } from './rules.js';
import { PERSISTED, SHAPE } from './state-schema.js';
const toB64url = (bytes) => {
  let b64 = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    b64 += String.fromCharCode(...bytes.slice(i, i + 0x8000));
  }
  return btoa(b64).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const pipe = async (bytes, stream) =>
  new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

export const encode = async (obj) =>
  toB64url(await pipe(new TextEncoder().encode(JSON.stringify(obj)), new CompressionStream('deflate')));

export const decode = async (s) => {
  const compressed = fromB64url(s);
  const decompressor = new Response(
    new Blob([compressed]).stream().pipeThrough(new DecompressionStream('deflate'))
  ).body.getReader();
  let totalBytes = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await decompressor.read();
    if (done) break;
    totalBytes += value.length;
    if (totalBytes > 262144) throw new Error('Decompressed size exceeds limit');
    chunks.push(value);
  }
  const decompressed = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    decompressed.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(decompressed));
};

export const friendPayload = (state, groups) => ({
  v: 1,
  year: state.year,
  semester: state.semester,
  program: state.program,
  startYear: state.startYear,
  name: state.name,
  groups
});

export const friendLink = async (base, state, groups) => `${base}#f=${await encode(friendPayload(state, groups))}`;
export const backupLink = async (base, state) => `${base}#b=${await encode({ ...state, v: 1 })}`;

export async function readHash(hash, { year, semester }) {
  const m = hash.match(/^#([fb])=(.+)$/);
  if (!m) return null;

  const type = m[1];
  const encoded = m[2];

  // Cap input size: friend ≤ 4096, backup ≤ 65536
  const maxLen = type === 'f' ? 4096 : 65536;
  if (encoded.length > maxLen) return { error: 'הקישור פגום' };

  let payload;
  try {
    payload = await decode(encoded);
  } catch {
    return { error: 'הקישור פגום' };
  }

  // Validate payload is a plain object
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { error: 'הקישור פגום' };

  // Validate v and version
  if (payload.v !== 1) return { error: 'גרסת קישור לא נתמכת' };

  // Validate year and semester types before interpolating
  if (typeof payload.year !== 'number' || typeof payload.semester !== 'string') return { error: 'הקישור פגום' };

  // A friend's groups belong to one semester. A backup outlives the year: its record stays, last year's group ids are dropped (below).
  // a newer backup (the site fell back to an older year) is refused below, not aged backwards
  const lastYear = type === 'b' && payload.year < year;
  if (!lastYear && (payload.year !== year || payload.semester !== semester)) {
    return { error: `הקישור שייך לסמסטר אחר (${payload.year} ${payload.semester.slice(0, 10)})` };
  }

  // Per-type validation and rebuild
  if (type === 'f') {
    // Friend: must have name (string, ≤60 chars) and groups (array of strings, ≤40 entries, each ≤20 chars)
    if (typeof payload.name !== 'string' || payload.name.length > 60) return { error: 'הקישור פגום' };
    if (!Array.isArray(payload.groups) || payload.groups.length > 40) return { error: 'הקישור פגום' };
    for (const g of payload.groups) {
      if (typeof g !== 'string' || g.length > 20) return { error: 'הקישור פגום' };
    }
    // Rebuild friend object (drops unknown keys, no __proto__)
    return {
      type: 'friend',
      payload: {
        v: 1,
        year: payload.year,
        semester: payload.semester,
        program: payload.program,
        startYear: payload.startYear,
        name: payload.name,
        groups: payload.groups
      }
    };
  } else {
    // Backup: passed (array of strings), failed/choices/weights/constraints (plain objects), friends/pins (arrays)
    if (!Array.isArray(payload.passed)) return { error: 'הקישור פגום' };
    for (const p of payload.passed) {
      if (typeof p !== 'string') return { error: 'הקישור פגום' };
    }
    if (payload.failed && (typeof payload.failed !== 'object' || Array.isArray(payload.failed)))
      return { error: 'הקישור פגום' };
    if (payload.choices && (typeof payload.choices !== 'object' || Array.isArray(payload.choices)))
      return { error: 'הקישור פגום' };
    if (payload.weights && (typeof payload.weights !== 'object' || Array.isArray(payload.weights)))
      return { error: 'הקישור פגום' };
    if (payload.constraints && (typeof payload.constraints !== 'object' || Array.isArray(payload.constraints)))
      return { error: 'הקישור פגום' };
    if (payload.friends && !Array.isArray(payload.friends)) return { error: 'הקישור פגום' };
    if (payload.pins && !Array.isArray(payload.pins)) return { error: 'הקישור פגום' };

    // Rebuild backup object: only the saved fields (state-schema.js), each of its shape; normalize() checks the values
    const rebuilt = { v: 1, year: payload.year, semester: payload.semester, program: payload.program };
    if (typeof payload.startYear === 'number') rebuilt.startYear = payload.startYear;
    for (const [k, shape] of Object.entries(PERSISTED)) if (SHAPE[shape](payload[k])) rebuilt[k] = payload[k];
    if (rebuilt.profile) rebuilt.profile = cleanProfile(rebuilt.profile);
    if (lastYear) {
      // group ids don't carry across years; the student is a year further on
      for (const k of ['pins', 'semesterOf', 'friends']) delete rebuilt[k];
      if (rebuilt.profile?.year)
        rebuilt.profile.year = cleanProfile({ year: Math.min(5, rebuilt.profile.year + year - payload.year) }).year;
    }

    return { type: 'backup', payload: rebuilt };
  }
}
