// scripts/pull-exams.mjs: exam dates by hand from the course pages, kept in the repo so the nightly run needs no extra request.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detailsToPull, pullExams } from '../scripts/pull-exams.mjs';
import { parseGroups } from '../scripts/parse.mjs';

const fx = (name) => readFileSync(new URL(`../scripts/fixtures/${name}`, import.meta.url), 'utf8');
const g = (detailsArgs, primary = true) => ({ primary, detailsArgs });

test('detailsToPull: the first primary group of each semester; no link, not primary or an unknown code is skipped', () => {
  assert.deepEqual(
    detailsToPull([
      g(null),
      g('-NA,-N1,-N1,-N11,-N'),
      g('-NA,-N1,-N1,-N12,-N'),
      g('-NA,-N2,-N1,-N21,-N'),
      g('-NA,-N3,-N1,-N31,-N', false),
      g('-NA,-N9,-N1,-N91,-N')
    ]),
    [{ semester: 'א', args: '-NA,-N1,-N1,-N11,-N' }, { semester: 'ב', args: '-NA,-N2,-N1,-N21,-N' }]
  );
  assert.deepEqual(detailsToPull([]), []);
});

test('pullExams: one details request per semester; rows carry the course and semester and no lecturer', async () => {
  const groups = fx('groups-90903.html'),
    asked = [];
  const request = async (q) => {
    asked.push(q);
    return q.includes('S_LOOK_FOR_NOSE') ? groups : fx('details-exams.html');
  };
  const rows = await pullExams({ ids: ['90903'], request, log: () => {} });
  const want = detailsToPull(parseGroups(groups));
  assert.ok(want.length >= 1);
  assert.deepEqual(asked, [
    'prgname=S_LOOK_FOR_NOSE&arguments=-N90903',
    ...want.map((w) => `prgname=S_CourseDetails&arguments=${w.args}`)
  ]);
  assert.deepEqual(rows.map((r) => r.semester), want.map((w) => w.semester));
  for (const r of rows) {
    assert.deepEqual([r.courseId, r.lecturer, r.kind], ['90903', null, 'בחינה']);
    assert.equal(r.moeds[0].date, '2027-01-27');
  }
});

test('pullExams: a course with no exam on its page, or no groups, gives no row', async () => {
  const request = async (q) => (q.includes('N1,') ? fx('groups-90903.html') : q.includes('S_LOOK_FOR_NOSE') ? '' : '<p>אין</p>');
  assert.deepEqual(await pullExams({ ids: ['1', '2'], request, log: () => {} }), []);
});
