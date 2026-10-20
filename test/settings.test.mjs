import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanSettings, SETTINGS_DEFAULT } from '../web/settings.js';

const VALID = {
  supportEmail: 'help@afeka.ac.il', counselingUrl: 'https://www.afeka.ac.il/counseling', notice: 'תקלה זמנית',
  turns: [{ id: 't1', label: 'שנה ד׳', opensAt: '2026-09-01T09:00:00+03:00' }],
  programs: { 30: { approved: { 2024: '2026-07-01' }, conflicts: [{ cohorts: [2023, 2024], text: 'סתירה' }] } },
};

test('cleanSettings: null and non-objects give the defaults', () => {
  for (const bad of [null, undefined, 5, 'x', [], true]) assert.deepEqual(cleanSettings(bad), SETTINGS_DEFAULT);
  assert.deepEqual(SETTINGS_DEFAULT, { supportEmail: '', counselingUrl: '', notice: '', turns: [], programs: {} });
});

test('cleanSettings: each bad field falls back to its default', () => {
  const s = cleanSettings({ notice: 5, turns: 'x', supportEmail: 'not an email', counselingUrl: 'javascript:alert(1)', programs: [] });
  assert.deepEqual(s, SETTINGS_DEFAULT);
});

test('cleanSettings: a valid file round-trips', () => {
  assert.deepEqual(cleanSettings(JSON.parse(JSON.stringify(VALID))), VALID);
});

test('cleanSettings: a turn without a parsable opensAt (or id/label) is dropped', () => {
  const ok = { id: 'a', label: 'A', opensAt: '2026-09-01T09:00:00Z' };
  const s = cleanSettings({ turns: [ok, { ...ok, opensAt: 'soon' }, { ...ok, opensAt: 5 }, { id: 'b', label: 'B' }, { ...ok, id: '' }, null] });
  assert.deepEqual(s.turns, [ok]);
});

test('cleanSettings: counselingUrl accepts only https', () => {
  for (const bad of ['http://a.co', 'javascript:alert(1)', 'data:text/html,x', '//a.co', 'a.co', 'ftp://a.co']) {
    assert.equal(cleanSettings({ counselingUrl: bad }).counselingUrl, '', bad);
  }
  assert.equal(cleanSettings({ counselingUrl: 'https://a.co/x?y=1' }).counselingUrl, 'https://a.co/x?y=1');
});

test('cleanSettings: supportEmail must look like an address', () => {
  for (const bad of ['a b@c.d', 'a@', '@c.d', 'a@b@c', '<a>@c.d', 'a"@c.d', 'plain']) assert.equal(cleanSettings({ supportEmail: bad }).supportEmail, '', bad);
  assert.equal(cleanSettings({ supportEmail: 'a@c.d' }).supportEmail, 'a@c.d');
});

test('cleanSettings: conflict text over 300 chars is dropped, bad cohorts and dates too', () => {
  const p = cleanSettings({ programs: { 7: {
    conflicts: [{ cohorts: [2024], text: 'x'.repeat(300) }, { cohorts: [2024], text: 'x'.repeat(301) }, { cohorts: ['a'], text: 'ok' }, { cohorts: [2024], text: 5 }],
    approved: { 2024: '2026-13-45', 2025: 'yesterday', abc: '2026-01-01', 2026: '2026-02-03' },
  } } }).programs;
  assert.deepEqual(p[7].conflicts, [{ cohorts: [2024], text: 'x'.repeat(300) }]);
  assert.deepEqual(p[7].approved, { 2026: '2026-02-03' });
});

test('cleanSettings: programs without anything valid vanish; __proto__ is not a program', () => {
  const s = cleanSettings(JSON.parse('{"programs":{"1":{},"2":5,"__proto__":{"approved":{"2024":"2026-01-01"}}}}'));
  assert.deepEqual(s.programs, {});
  assert.equal(Object.getPrototypeOf(s.programs), Object.prototype);
});
