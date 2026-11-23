// Design A's first-run pass: the pure step list (web/first-run.js) and the mark (web/ui-common.js firstRun / setFirstRun): the migration reads
// (a missing mark counts as done for anyone who is not new), a stored mark wins, and a storage that throws still keeps the visit's own mark.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../web/app.js';
import { passSteps, stepOf, markOf, nextStep, prevStep, stepLine, yearsFor, startReady, STEPS } from '../web/first-run.js';


test('passSteps: a first-year student has four steps, everyone else five, and none is skippable', () => {
  assert.deepEqual(passSteps(1), ['start', 'courses', 'prefs', 'friends']);
  for (const y of [2, 3, 4, 5, null]) assert.deepEqual(passSteps(y), STEPS);
  assert.equal(passSteps(3).length, 5);
  assert.equal(passSteps(1).length, 4);
});

test('stepOf, nextStep and prevStep follow the steps the year has', () => {
  assert.equal(stepOf(1, 3), 'start');
  assert.equal(stepOf(2, 3), 'passed');
  assert.equal(stepOf(2, 1), 'courses', 'a mark on a step a first-year student does not have stands for the next one');
  assert.equal(stepOf(5, 1), 'friends');
  assert.equal(stepOf(null, 3), 'start');
  assert.equal(stepOf(9, 3), 'friends', 'a mark past the end is the last step');
  assert.equal(markOf('prefs'), 4);
  assert.equal(nextStep('start', 3), 'passed');
  assert.equal(nextStep('start', 1), 'courses');
  assert.equal(nextStep('friends', 3), 'done');
  assert.equal(prevStep('start', 3), null);
  assert.equal(prevStep('courses', 3), 'passed');
  assert.equal(prevStep('courses', 1), 'start');
});

test('stepLine: the position and the line of step names', () => {
  const l = stepLine('courses', 3);
  assert.equal(l.n, 3);
  assert.equal(l.of, 5);
  assert.deepEqual(l.steps.map((s) => s.state), ['done', 'done', 'now', 'next', 'next']);
  const first = stepLine('courses', 1);
  assert.equal(first.n, 2);
  assert.equal(first.of, 4);
  assert.deepEqual(first.steps.map((s) => s.name), ['תנאים', 'קורסים', 'מה חשוב לי', 'חברים']);
});

// the mark: each case evaluates ui-common.js again (its own in-memory mark), with the storage in place for the calls
const KEY = 'afeka-sched-v1-firstrun';
const store = (init = {}) => {
  const m = { ...init };
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => void (m[k] = String(v)), removeItem: (k) => void delete m[k], m };
};
const withStorage = async (storage, tag, fn) => {
  const was = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', storage);
  try {
    return await fn(await import(`../web/ui-common.js?firstrun-${tag}`));
  } finally {
    if (was) Object.defineProperty(globalThis, 'localStorage', was);
    else delete globalThis.localStorage;
  }
};
const ok = (s) => ({ configurable: true, value: s });

test('a new visitor has no mark yet, and the stored mark is read as its step or done', async () => {
  await withStorage(ok(store()), 'new', (c) => assert.equal(c.firstRun(), null));
  await withStorage(ok(store({ [KEY]: '3' })), 'three', (c) => assert.equal(c.firstRun(), 3));
  await withStorage(ok(store({ [KEY]: 'done' })), 'done', (c) => assert.equal(c.firstRun(), 'done'));
  await withStorage(ok(store({ [KEY]: 'nonsense' })), 'junk', (c) => assert.equal(c.firstRun(), null, 'an unreadable mark is no mark'));
  await withStorage(ok(store({ [KEY]: '9' })), 'nine', (c) => assert.equal(c.firstRun(), null));
});

test('migration: no mark but onboarded, or a record saved before, reads as done; the mark itself wins over that guess', async () => {
  await withStorage(ok(store({ 'afeka-sched-v1-onboarded': '1' })), 'onboarded', (c) => assert.equal(c.firstRun(), 'done'));
  await withStorage(ok(store({ 'afeka-sched-v1': '{"v":1}' })), 'saved', (c) => assert.equal(c.firstRun(), 'done'));
  await withStorage(ok(store({ 'afeka-sched-v1': '{"v":1}', [KEY]: '2' })), 'saved-marked', (c) => assert.equal(c.firstRun(), 2));
  await withStorage(ok(store({ 'afeka-sched-v1-entry': '1' })), 'entry-only', (c) => assert.equal(c.firstRun(), null, 'the entry choice alone is not an old save'));
});

test('setFirstRun stores the step and done', async () => {
  const s = store();
  await withStorage(ok(s), 'set', (c) => {
    c.setFirstRun(1);
    assert.equal(s.m[KEY], '1');
    c.setFirstRun(4);
    assert.equal(c.firstRun(), 4);
    c.setFirstRun('done');
    assert.equal(s.m[KEY], 'done');
    assert.equal(c.firstRun(), 'done');
  });
});

test('the first-load hook writes 1 for a new visitor under design A only, and never over a mark or an old save', async () => {
  const withDesign = (design, fn) => {
    const was = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: { dataset: design ? { design } : {} } } });
    try {
      return fn();
    } finally {
      if (was) Object.defineProperty(globalThis, 'document', was);
      else delete globalThis.document;
    }
  };
  const classic = store();
  await withStorage(ok(classic), 'hook-classic', (c) => withDesign('', () => app.firstLoad()));
  assert.equal(classic.m[KEY], undefined, 'classic writes nothing');
  const fresh = store();
  await withStorage(ok(fresh), 'hook-new', (c) => withDesign('a', () => (app.firstLoad(), assert.equal(c.firstRun(), 1))));
  assert.equal(fresh.m[KEY], '1');
  const marked = store({ [KEY]: '3' });
  await withStorage(ok(marked), 'hook-marked', (c) => withDesign('a', () => (app.firstLoad(), assert.equal(c.firstRun(), 3))));
  assert.equal(marked.m[KEY], '3');
  const old = store({ 'afeka-sched-v1': '{"v":1}' });
  await withStorage(ok(old), 'hook-old', (c) => withDesign('a', () => (app.firstLoad(), assert.equal(c.firstRun(), 'done'))));
  assert.equal(old.m[KEY], undefined, 'an old save is never marked');
});

test('a storage that throws: the mark lives in memory for the visit, and nothing throws', async () => {
  const boom = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } };
  await withStorage(ok(boom), 'throws', (c) => {
    assert.equal(c.firstRun(), null);
    c.setFirstRun(1);
    assert.equal(c.firstRun(), 1);
    c.setFirstRun(3);
    assert.equal(c.firstRun(), 3);
    c.setFirstRun('done');
    assert.equal(c.firstRun(), 'done');
  });
  await withStorage({ configurable: true, get() { throw new Error('blocked'); } }, 'gone', (c) => {
    assert.equal(c.firstRun(), null);
    c.setFirstRun(2);
    assert.equal(c.firstRun(), 2);
  });
  // a write that fails on a storage that reads: the visit's mark wins over the old stored one
  const full = { getItem: (k) => (k === KEY ? '1' : null), setItem: () => { throw new Error('quota'); } };
  await withStorage(ok(full), 'quota', (c) => {
    assert.equal(c.firstRun(), 1);
    c.setFirstRun(2);
    assert.equal(c.firstRun(), 2);
  });
});

test('yearsFor: the loaded track knows its years, another one is told by its name (an evening track runs five)', () => {
  assert.equal(yearsFor('הנדסה מכנית', 4), 4);
  assert.equal(yearsFor('מדעי המחשב', 3), 3, 'the loaded track wins over the guess');
  assert.equal(yearsFor('הנדסה מכנית (ערב)'), 5);
  assert.equal(yearsFor('הנדסה מכנית'), 4);
  assert.equal(yearsFor(undefined), 4);
});

test('startReady: the box, and in the pass the track (when asked) and the year', () => {
  const all = { t: true, p: 30, y: 2 };
  assert.equal(startReady(all, { track: true, year: true }), true);
  assert.equal(startReady({ ...all, t: false }, { track: true, year: true }), false);
  assert.equal(startReady({ ...all, p: null }, { track: true, year: true }), false);
  assert.equal(startReady({ ...all, p: null }, { track: false, year: true }), true, 'a catalog with one track asks none');
  assert.equal(startReady({ ...all, y: null }, { track: true, year: true }), false);
  assert.equal(startReady({ t: true, p: null, y: null }, { track: false, year: false }), true, 'the terms alone need only the box');
});

test('the draft of step 1: kept in storage, read back, cleared; a storage that throws keeps it in memory', async () => {
  const s1 = store();
  await withStorage(ok(s1), 'draft', (c) => {
    assert.deepEqual(c.firstDraft(), { t: false, p: null, y: null });
    c.setFirstDraft({ t: true });
    c.setFirstDraft({ p: 30 });
    assert.deepEqual(c.firstDraft(), { t: true, p: 30, y: null }, 'each patch keeps the rest');
    assert.equal(s1.m['afeka-sched-v1-firstrun-draft'], '{"t":true,"p":30,"y":null}');
    c.clearFirstDraft();
    assert.deepEqual(c.firstDraft(), { t: false, p: null, y: null });
  });
  await withStorage(ok(store({ 'afeka-sched-v1-firstrun-draft': '{"t":"yes","p":"x","y":2.5}' })), 'draft-junk', (c) => {
    assert.deepEqual(c.firstDraft(), { t: false, p: null, y: null }, 'a draft that is not what was written is none');
  });
  const boom = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
  await withStorage(ok(boom), 'draft-throws', (c) => {
    c.setFirstDraft({ t: true, y: 3 });
    assert.deepEqual(c.firstDraft(), { t: true, p: null, y: 3 }, 'in memory for the visit');
    c.clearFirstDraft();
    assert.deepEqual(c.firstDraft(), { t: false, p: null, y: null });
  });
});
