// Saving and restoring the edit page's state (package B of the 2026-11-19 scan): the failure flags and what the notice says,
// the backup link and its restore, and the other-tab check. The screens themselves run in test/browser/edit-*.spec.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const store = new Map();
const stub = (over = {}) => {
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), ...over };
};
stub();
const { app, save, normalize, restoreBackup, saveBroken, setEditSaveFailed } = await import('../web/app.js');
const { noticeHtml } = await import('../web/ui-view.js');
const { EDIT_KEY, emptyEdit, loadSchedule, loadEdit, saveEdit, getEdit, setEdit, backupEdit, forgetEdit, editMoved } = await import('../web/edit-state.js');
const { backupLink, backupReadable, readHash } = await import('../web/share.js');

const CATALOG = { year: 2027, programs: [{ id: 30, name: 'הנדסה מכנית', startYears: [2026] }] };
const L = (course, group, day, start, end) => ({ course, name: `n${course}`, type: 'הרצאה', group, day, start, end });
const DS = { year: 2027, sem: 'א', program: 30, startYear: 2026 };
const loaded = () => loadSchedule(emptyEdit(), [L('A', 'A1', 2, '08:00', '09:50'), L('B', 'B1', 3, '10:00', '11:50')], DS, true);
const AT = { year: 2027, semester: 'א' };
const hashOf = (link) => link.slice(link.indexOf('#'));
const clean = () => {
  store.clear();
  stub();
  forgetEdit();
  Object.assign(app, { catalog: CATALOG, noSave: false, saveFailed: false, editSaveFailed: false, otherTab: false, hashError: null, settings: { notice: '' }, sem: { 'א': null, 'ב': null } });
  app.state = normalize({ v: 1, program: 30, startYear: 2026, passed: [] }, CATALOG);
};
test.beforeEach(clean);

const full = () => {
  throw new Error('full');
};
const blockEdit = () => stub({ setItem: (k, v) => (k === EDIT_KEY ? full() : store.set(k, String(v))) });

test('the notice shows when either key failed to save: a good main save does not hide a failed edit save', () => {
  blockEdit();
  setEditSaveFailed(!saveEdit(loaded()));
  assert.equal(app.editSaveFailed, true);
  save(); // the main key saves fine
  assert.equal(app.saveFailed, false);
  assert.equal(saveBroken(), true);
  assert.match(noticeHtml(app), /השינויים לא נשמרים/);
  assert.match(noticeHtml(app), /data-act="backup"/, 'the way out stays');
  stub();
  setEditSaveFailed(!saveEdit(loaded()));
  assert.equal(saveBroken(), false);
  assert.equal(noticeHtml(app), '');
});

test('the other way round: a failed main save stays told after a good edit save', () => {
  stub({ setItem: (k, v) => (k === EDIT_KEY ? store.set(k, String(v)) : full()) });
  save();
  setEditSaveFailed(!saveEdit(loaded()));
  assert.equal(app.saveFailed, true);
  assert.equal(app.editSaveFailed, false);
  assert.match(noticeHtml(app), /השינויים לא נשמרים/);
});

test('noticeHtml: the site notice, a failed save and another tab each get their own alert; nothing when all is well', () => {
  const at = (over) => noticeHtml({ settings: { notice: '' }, saveFailed: false, editSaveFailed: false, otherTab: false, ...over });
  assert.equal(at({}), '');
  assert.match(at({ settings: { notice: 'נתונים בעייתיים <b>' } }), /נתונים בעייתיים &lt;b&gt;/);
  assert.match(at({ editSaveFailed: true }), /לא נשמרים/);
  assert.match(at({ otherTab: true }), /בלשונית אחרת[\s\S]*data-act="reloadPage"/);
  assert.equal((at({ settings: { notice: 'x' }, saveFailed: true, otherTab: true }).match(/role="alert"/g) ?? []).length, 3);
});

test('backupEdit: the schedule without the import draft; nothing when no schedule was loaded', () => {
  assert.equal(backupEdit(), null);
  setEdit({ ...loaded(), draft: { rows: [], choices: {}, registered: false, sem: 'א' } });
  const b = backupEdit();
  assert.equal(b.draft, null);
  assert.equal(b.original.length, 2);
  setEdit({ ...emptyEdit(), draft: { rows: [], choices: {}, registered: false, sem: 'א' } });
  assert.equal(backupEdit(), null, 'a draft alone is not worth a longer link');
});

test('a backup link carries the edit state and restoring it writes the state, here and in storage', async () => {
  setEdit({ ...loaded(), movable: ['A'] });
  const link = await backupLink('https://x.test/', { ...app.state, v: 1 }, backupEdit());
  const r = await readHash(hashOf(link), AT);
  assert.equal(r.type, 'backup');
  assert.deepEqual(r.payload.edit.movable, ['A']);
  clean(); // a new device
  assert.deepEqual(getEdit(), emptyEdit());
  assert.equal(await restoreBackup(r.payload), true);
  assert.deepEqual(getEdit().movable, ['A']);
  assert.equal(getEdit().original.length, 2);
  assert.deepEqual(loadEdit().movable, ['A'], 'and it is saved');
});

test('a backup without an edit part (an old link, or no schedule loaded) leaves the saved edit state alone', async () => {
  const link = await backupLink('https://x.test/', { ...app.state, v: 1 });
  const r = await readHash(hashOf(link), AT);
  assert.equal('edit' in r.payload, false);
  setEdit(loaded());
  saveEdit(getEdit());
  assert.equal(await restoreBackup(r.payload), true);
  assert.equal(getEdit().original.length, 2);
  assert.equal(loadEdit().original.length, 2);
});

test('a restored edit part is checked like a saved one: junk is dropped, a bad shape is ignored', async () => {
  const link = await backupLink('https://x.test/', { ...app.state, v: 1 }, { ...loaded(), evil: 1, added: ['A', 5], goal: { dayOff: 9 } });
  const r = await readHash(hashOf(link), AT);
  await restoreBackup(r.payload);
  assert.equal('evil' in getEdit(), false);
  assert.deepEqual(getEdit().added, ['A']);
  assert.equal(getEdit().goal.dayOff, null);
  for (const bad of [5, 'x', [], null]) {
    const l = await backupLink('https://x.test/', { ...app.state, v: 1 }, bad);
    const rr = await readHash(hashOf(l), AT);
    assert.equal(rr.type, 'backup');
    assert.equal('edit' in rr.payload, false, `edit ${JSON.stringify(bad)}`);
  }
});

test('a restore whose edit part cannot be written is told, not silent', async () => {
  const link = await backupLink('https://x.test/', { ...app.state, v: 1 }, loaded());
  const r = await readHash(hashOf(link), AT);
  blockEdit();
  assert.equal(await restoreBackup(r.payload), true);
  assert.equal(getEdit().original.length, 2, 'the page still has it');
  assert.equal(app.editSaveFailed, true);
});

test('editMoved: another tab writing the edit key makes this copy old only when what is stored differs from what this tab read', () => {
  store.set(EDIT_KEY, JSON.stringify(loaded()));
  assert.equal(editMoved(), false, 'this tab never read the edit state');
  getEdit(); // the page reads it
  assert.equal(editMoved(), false, 'the same state');
  store.set(EDIT_KEY, JSON.stringify(Object.fromEntries(Object.entries(loaded()).reverse())));
  assert.equal(editMoved(), false, 'the same state, other key order');
  store.set(EDIT_KEY, JSON.stringify({ ...loaded(), movable: ['A'] }));
  assert.equal(editMoved(), true);
  store.delete(EDIT_KEY);
  assert.equal(editMoved(), true, 'erased in the other tab');
  store.set(EDIT_KEY, 'not json');
  assert.equal(editMoved(), true);
  stub({ getItem: full });
  assert.equal(editMoved(), false, 'storage that cannot be read has no other tab');
});

test('editMoved reads the key, not the event: an older event for a state this tab has since read changes nothing', () => {
  store.set(EDIT_KEY, JSON.stringify({ ...loaded(), movable: ['A'] })); // the other tab wrote S1, then S2
  store.set(EDIT_KEY, JSON.stringify({ ...loaded(), movable: ['A', 'B'] }));
  getEdit(); // this tab read S2 before the event for S1 was handled
  assert.equal(editMoved(), false);
});

test('editMoved: a copy ahead of the storage (its save failed) is not an old copy; the next write by another tab is', () => {
  store.set(EDIT_KEY, JSON.stringify(loaded())); // S1, read by this tab
  getEdit();
  blockEdit();
  assert.equal(saveEdit({ ...getEdit(), movable: ['A'] }), false); // S2 in the page, S1 still stored
  setEdit({ ...getEdit(), movable: ['A'] });
  assert.equal(editMoved(), false, 'a late event for S1 does not freeze the tab');
  stub();
  store.set(EDIT_KEY, JSON.stringify({ ...loaded(), movable: ['B'] })); // another tab writes S3
  assert.equal(editMoved(), true);
  forgetEdit();
  assert.equal(editMoved(), false);
});

test('a restore before the page read the state, with its write failing, still leaves the tab watching the key', async () => {
  store.set(EDIT_KEY, JSON.stringify(loaded())); // S0, stored; this tab has not read it yet
  const link = await backupLink('https://x.test/', { ...app.state, v: 1 }, { ...loaded(), movable: ['A'] });
  const r = await readHash(hashOf(link), AT);
  blockEdit();
  assert.equal(await restoreBackup(r.payload), true);
  assert.deepEqual(getEdit().movable, ['A']);
  stub(); // storage works again
  assert.equal(editMoved(), false, 'what is stored is what this tab started from');
  store.set(EDIT_KEY, JSON.stringify({ ...loaded(), movable: ['B'] })); // another tab writes
  assert.equal(editMoved(), true);
});

test('editMoved follows this tab\'s own good saves: what it wrote is what it holds', () => {
  store.set(EDIT_KEY, JSON.stringify(loaded()));
  getEdit();
  const next = { ...getEdit(), movable: ['A'] };
  setEdit(next);
  assert.equal(saveEdit(next), true);
  assert.equal(editMoved(), false);
});

test('a restore in a stale tab takes the edit part in memory and writes nothing', async () => {
  const link = await backupLink('https://x.test/', { ...app.state, v: 1 }, { ...loaded(), movable: ['A'] });
  const r = await readHash(hashOf(link), AT);
  setEdit(emptyEdit());
  store.set(EDIT_KEY, JSON.stringify(loaded()));
  app.otherTab = true;
  assert.equal(await restoreBackup(r.payload), true);
  assert.deepEqual(getEdit().movable, ['A'], 'the page shows the backup');
  assert.deepEqual(loadEdit().movable, [], 'what the other tab stored is untouched');
  assert.equal(app.editSaveFailed, false, 'not a failed save');
});

test('backupReadable: a link that readHash would refuse, too long or too big once decoded, is told before it is copied', async () => {
  // about the most the state can hold (100 courses with 20 swapped-in groups each, ids that do not compress): a real schedule is far from it
  const ids = () => Array.from({ length: 20 }, () => randomBytes(30).toString('base64url'));
  const long = { ...loaded(), swaps: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`C${i}`, ids()])) };
  const big = { ...loaded(), filler: 'a'.repeat(300000) }; // a short link that decodes to more than the reader allows
  const link = (edit) => backupLink('https://x.test/', { ...app.state, v: 1 }, edit);
  assert.equal(await backupReadable(await link(loaded()), app.state), true);
  assert.equal(await backupReadable(await link(long), app.state), false, 'over the length limit');
  assert.equal(await backupReadable(await link(big), app.state), false, 'over the decoded limit');
  assert.ok((await link(big)).length < 5000, 'and the length check alone would have let it through');
  assert.equal((await readHash(hashOf(await link(big)), AT)).error, 'הקישור פגום', 'what the check protects against');
});
