import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanSettings, SETTINGS_DEFAULT } from '../web/settings.js';

const VALID = {
  supportEmail: 'help@afeka.ac.il',
  counselingUrl: 'https://www.afeka.ac.il/counseling',
  notice: 'תקלה זמנית',
  turns: [{ id: 't1', label: 'שנה ד׳', opensAt: '2026-09-01T09:00:00+03:00' }],
  programs: { 30: { approved: { 2024: '2026-07-01' }, conflicts: [{ cohorts: [2023, 2024], text: 'סתירה' }] } },
};

test('cleanSettings: null and non-objects give the defaults', () => {
  for (const bad of [null, undefined, 5, 'x', [], true]) assert.deepEqual(cleanSettings(bad), SETTINGS_DEFAULT);
  assert.deepEqual(SETTINGS_DEFAULT, { supportEmail: '', counselingUrl: '', notice: '', turns: [], programs: {} });
});

test('cleanSettings: each bad field falls back to its default', () => {
  const s = cleanSettings({
    notice: 5,
    turns: 'x',
    supportEmail: 'not an email',
    counselingUrl: 'javascript:alert(1)',
    programs: []
  });
  assert.deepEqual(s, SETTINGS_DEFAULT);
});

test('cleanSettings: a valid file round-trips', () => {
  assert.deepEqual(cleanSettings(JSON.parse(JSON.stringify(VALID))), VALID);
});

test('cleanSettings: a turn without a parsable opensAt (or id/label) is dropped', () => {
  const ok = { id: 'a', label: 'A', opensAt: '2026-09-01T09:00:00Z' };
  const s = cleanSettings({
    turns: [ok, { ...ok, opensAt: 'soon' }, { ...ok, opensAt: 5 }, { id: 'b', label: 'B' }, { ...ok, id: '' }, null]
  });
  assert.deepEqual(s.turns, [ok]);
});

test('cleanSettings: counselingUrl accepts only https', () => {
  for (const bad of ['http://a.co', 'javascript:alert(1)', 'data:text/html,x', '//a.co', 'a.co', 'ftp://a.co']) {
    assert.equal(cleanSettings({ counselingUrl: bad }).counselingUrl, '', bad);
  }
  assert.equal(cleanSettings({ counselingUrl: 'https://a.co/x?y=1' }).counselingUrl, 'https://a.co/x?y=1');
});

test('cleanSettings: supportEmail must look like an address', () => {
  for (const bad of ['a b@c.d', 'a@', '@c.d', 'a@b@c', '<a>@c.d', 'a"@c.d', 'plain'])
    assert.equal(cleanSettings({ supportEmail: bad }).supportEmail, '', bad);
  assert.equal(cleanSettings({ supportEmail: 'a@c.d' }).supportEmail, 'a@c.d');
});

test('cleanSettings: conflict text over 300 chars is dropped, bad cohorts and dates too', () => {
  const p = cleanSettings({
    programs: {
      7: {
        conflicts: [
          { cohorts: [2024], text: 'x'.repeat(300) },
          { cohorts: [2024], text: 'x'.repeat(301) },
          { cohorts: ['a'], text: 'ok' },
          { cohorts: [2024], text: 5 }
        ],
        approved: { 2024: '2026-13-45', 2025: 'yesterday', abc: '2026-01-01', 2026: '2026-02-03' },
      }
    }
  }).programs;
  assert.deepEqual(p[7].conflicts, [{ cohorts: [2024], text: 'x'.repeat(300) }]);
  assert.deepEqual(p[7].approved, { 2026: '2026-02-03' });
});

test('cleanSettings: programs without anything valid vanish; __proto__ is not a program', () => {
  const s = cleanSettings(JSON.parse('{"programs":{"1":{},"2":5,"__proto__":{"approved":{"2024":"2026-01-01"}}}}'));
  assert.deepEqual(s.programs, {});
  assert.equal(Object.getPrototypeOf(s.programs), Object.prototype);
});

test('cleanSettings: counselingUrl must be a string and comes back as the normalized href', () => {
  for (const bad of [['https://a.co'], { href: 'https://a.co' }, 5, true, 'a.co', '/x']) {
    assert.equal(cleanSettings({ counselingUrl: bad }).counselingUrl, '', String(bad));
  }
  assert.equal(cleanSettings({ counselingUrl: 'https://a.co' }).counselingUrl, 'https://a.co/');
  // 'https:foo' would be a relative path as an href; the normalized href is absolute
  assert.equal(cleanSettings({ counselingUrl: 'https:foo' }).counselingUrl, 'https://foo/');
});

test('cleanSettings: opensAt needs an ISO date-time with a zone', () => {
  const t = (opensAt) => cleanSettings({ turns: [{ id: 'a', label: 'A', opensAt }] }).turns.length;
  for (const bad of [
    '1',
    '2026-09-01',
    '2026-09-01T09:00',
    '2026-09-01T09:00:00',
    'Sep 1 2026 09:00 GMT',
    '2026-13-01T09:00:00Z'
  ])
    assert.equal(t(bad), 0, bad);
  for (const ok of ['2026-09-01T09:00:00+03:00', '2026-09-01T06:00Z', '2026-09-01T06:00:00.5Z'])
    assert.equal(t(ok), 1, ok);
});

test('cleanSettings: notice and conflict text are trimmed, blank ones vanish, empty cohorts drop the conflict', () => {
  assert.equal(cleanSettings({ notice: '  שלום \n' }).notice, 'שלום');
  assert.equal(cleanSettings({ notice: ' \t\n ' }).notice, '');
  const c = cleanSettings({
    programs: {
      3: {
        conflicts: [
          { cohorts: [2024], text: '  סתירה ' },
          { cohorts: [2024], text: '   ' },
          { cohorts: [], text: 'x' },
          { cohorts: [2024], text: ` ${'x'.repeat(300)} ` },
        ]
      }
    }
  }).programs[3].conflicts;
  assert.deepEqual(c, [
    { cohorts: [2024], text: 'סתירה' },
    { cohorts: [2024], text: 'x'.repeat(300) }
  ]);
});

test('cleanSettings: a turn id the profile could not keep (over 40 characters) is dropped', () => {
  const ok = { id: 'x'.repeat(40), label: 'A', opensAt: '2026-09-01T09:00:00Z' };
  assert.deepEqual(cleanSettings({ turns: [ok, { ...ok, id: 'x'.repeat(41) }] }).turns, [ok]);
});

test('the shipped settings.json: a clean, factual conflict for each program section 21 names (22, 20, 32, 12, 11, 112, 19)', () => {
  const raw = JSON.parse(readFileSync(new URL('../web/settings.json', import.meta.url), 'utf8')),
    s = cleanSettings(raw);
  const cat = JSON.parse(readFileSync(new URL('../web/data/afeka/catalog.json', import.meta.url), 'utf8'));
  for (const id of [22, 20, 32, 12, 11, 112, 19]) {
    const list = s.programs[id]?.conflicts ?? [];
    assert.ok(list.length >= 1, `program ${id} has a conflict`);
    assert.equal(
      list.length,
      raw.programs[id].conflicts.length,
      `none of program ${id}'s conflicts was dropped by cleanSettings`
    );
    const years = cat.programs.find((p) => p.id === id).startYears;
    for (const c of list) {
      assert.ok(
        c.cohorts.every((y) => years.includes(y)),
        `${id}: cohorts ${c.cohorts} are cohorts the program has`
      );
      assert.ok(!/[.!?]$/.test(c.text), `${id}: "${c.text}" ends no sentence (the line adds the full stop)`);
    }
  }
});

test('cleanSettings: a supportEmail with mailto separators (, % ? & #) is dropped', () => {
  for (const bad of ['a@b.c,d@e.f', 'a%40b@c.d', 'a@b.c?cc=x@y.z', 'a@b.c&x=1', 'a@b.c#h', 'a?b@c.d', 'a@b%c.d'])
    assert.equal(cleanSettings({ supportEmail: bad }).supportEmail, '', bad);
  assert.equal(cleanSettings({ supportEmail: 'help.me+x@afeka.ac.il' }).supportEmail, 'help.me+x@afeka.ac.il');
});

test("cleanSettings: a conflict keeps plan, yedion and tool texts (each at most 300 characters); a bad one is left out, the conflict stays", () => {
  const c = cleanSettings({
    programs: {
      3: {
        conflicts: [
          { cohorts: [2024], text: "א", plan: " פ ", yedion: "x".repeat(300), tool: "x".repeat(301) },
          { cohorts: [2024], text: "ב", plan: 5, yedion: "  " },
        ]
      }
    }
  }).programs[3].conflicts;
  assert.deepEqual(c, [
    { cohorts: [2024], text: "א", plan: "פ", yedion: "x".repeat(300) },
    { cohorts: [2024], text: "ב" }
  ]);
});
