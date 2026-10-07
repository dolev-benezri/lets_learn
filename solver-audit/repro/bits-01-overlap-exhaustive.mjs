// bits-01-overlap-exhaustive.mjs
// What it checks: overlaps(meetingsMask(a), meetingsMask(b)) against the TRUE minute overlap of two single-day intervals,
//   exhaustively (every pair of intervals s<e), and states exactly when the 30-minute slot model disagrees with minutes.
// Source lines targeted: web/solver-core.js:4-6 (grid constants), :11-20 (meetingsMask: floor start / ceil end), :22 (overlaps).
// Run:  node solver-audit/repro/bits-01-overlap-exhaustive.mjs        (any cwd, ~10-20 s, deterministic, no PRNG needed)
// Reference (independent of the solver): an interval [s,e) is the set of busy minutes {s, s+1, ..., e-1} (half-open: an
//   interval that ends at 09:50 is NOT busy at minute 09:50). Two intervals conflict iff their minute sets intersect.
//   A slot k is "touched" by an interval iff some busy minute m of it has floor((m-420)/30)==k.
// Output: CHECK lines assert correct behaviour; BUG lines assert the defect "slot model reports a conflict for intervals that
//   share no minute" (REPRODUCED = the defect exists). Exit 0 iff all CHECK PASS and all BUG REPRODUCED.
import { meetingsMask, overlaps, toMin } from '../../web/solver-core.js';

const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
const maskOf = (s, e) => meetingsMask([{ day: 1, start: hhmm(s), end: hhmm(e) }]);
let allOk = true;
const CHECK = (id, ok, detail) => { console.log(`CHECK ${id} ${ok ? 'PASS' : 'FAIL'} ${detail}`); if (!ok) allOk = false; };
const BUG = (id, reproduced, detail) => { console.log(`BUG ${id} ${reproduced ? 'REPRODUCED' : 'NOT-REPRODUCED'} ${detail}`); if (!reproduced) allOk = false; };

// Reference helpers (minute semantics, no solver code).
const minutesBig = (s, e, base) => ((1n << BigInt(e - s)) - 1n) << BigInt(s - base);    // bit (m-base) set for each busy minute m
const slotsTouched = (s, e) => { let set = 0; for (let m = s; m < e; m++) { const k = Math.floor((m - 420) / 30); if (k >= 0 && k < 32) set |= 1 << k; } return set; };
const ceil30 = (m) => 420 + 30 * Math.ceil((m - 420) / 30);
// Closed-form predicate under test: "A ends inside a half-hour cell (not on its boundary) and B starts before that cell ends".
const predicate = (A, B) => (A.e <= B.s && (A.e - 420) % 30 !== 0 && B.s < ceil30(A.e)) || (B.e <= A.s && (B.e - 420) % 30 !== 0 && A.s < ceil30(B.e));

function sweep(label, from, to, step) {
  const pts = []; for (let t = from; t <= to; t += step) pts.push(t);
  const ivs = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
    const s = pts[i], e = pts[j];
    ivs.push({ s, e, mask: maskOf(s, e)[1], big: minutesBig(s, e, from), touched: slotsTouched(s, e) });
  }
  let pairs = 0, agree = 0, falseC = 0, missed = 0, predMismatch = 0, touchMismatch = 0, selfOK = 0;
  const falseByGap = {};
  const examples = [];
  for (let i = 0; i < ivs.length; i++) {
    const A = ivs[i];
    if ((A.mask & A.mask) !== 0) selfOK++;
    for (let j = i + 1; j < ivs.length; j++) {
      const B = ivs[j]; pairs++;
      const slot = (A.mask & B.mask) !== 0;                  // what overlaps(meetingsMask(a), meetingsMask(b)) says (single day)
      const truth = (A.big & B.big) !== 0n;                   // minute truth
      if ((A.touched & B.touched) !== 0 !== slot) touchMismatch++;   // slot model == "both touch a common slot"
      if (slot === truth) agree++;
      else if (slot && !truth) { falseC++; const g = A.e <= B.s ? B.s - A.e : A.s - B.e; falseByGap[g] = (falseByGap[g] ?? 0) + 1; if (examples.length < 3) examples.push(`[${hhmm(A.s)},${hhmm(A.e)}) vs [${hhmm(B.s)},${hhmm(B.e)})`); }
      else missed++;
      if ((slot && !truth) !== predicate(A, B)) predMismatch++;
    }
  }
  console.log(`-- ${label}: ${ivs.length} intervals, ${pairs} pairs; agree=${agree} falseConflicts=${falseC} missedConflicts=${missed}; false-conflict gap histogram (minutes between the two) ${JSON.stringify(falseByGap)}; examples ${examples.join(' ; ')}`);
  return { pairs, agree, falseC, missed, predMismatch, touchMismatch, selfOK, n: ivs.length };
}

// Grid A: all intervals on a 10-minute grid, 07:00-23:00 (the whole solver grid).
const A = sweep('10-min grid 07:00-23:00', 420, 1380, 10);
CHECK('bits-01a', A.missed === 0, `no missed conflict on the 10-minute grid inside 07:00-23:00 (missed=${A.missed} of ${A.pairs} pairs)`);
CHECK('bits-01b', A.touchMismatch === 0, `overlaps() is exactly "both intervals touch one common 30-min slot" for all ${A.pairs} pairs (mismatches=${A.touchMismatch})`);
CHECK('bits-01c', A.predMismatch === 0, `false conflicts == closed form {earlier end E not on a :00/:30 boundary, later start in [E, ceil30(E))} for all pairs (mismatches=${A.predMismatch})`);
CHECK('bits-01d', A.selfOK === A.n, `every interval overlaps itself (${A.selfOK}/${A.n})`);
BUG('bits-01e', A.falseC > 0, `slot model says "conflict" for ${A.falseC} of ${A.pairs} interval pairs that share no minute (${(100 * A.falseC / A.pairs).toFixed(3)} %)`);

// Grid B: 1-minute grid over a 90-minute window crossing three cell boundaries (08:30, 09:00, 09:30).
const B = sweep('1-min grid 08:10-09:40', 490, 580, 1);
CHECK('bits-01f', B.missed === 0, `no missed conflict on the 1-minute grid 08:10-09:40 (missed=${B.missed} of ${B.pairs})`);
CHECK('bits-01g', B.touchMismatch === 0 && B.predMismatch === 0, `1-minute grid: slot semantics and closed-form false-conflict predicate hold for all ${B.pairs} pairs (mismatches ${B.touchMismatch}/${B.predMismatch})`);
BUG('bits-01h', B.falseC > 0, `1-minute grid: ${B.falseC} false conflicts of ${B.pairs} pairs`);

// The three situations that matter for real timetables (all lessons start :00, end :50, :30 or :00).
const T = (a, b, c, d) => overlaps(meetingsMask([{ day: 2, start: a, end: b }]), meetingsMask([{ day: 2, start: c, end: d }]));
CHECK('bits-01i', T('08:00', '09:50', '10:00', '11:50') === false, 'lesson 08:00-09:50 and lesson 10:00-11:50 do not conflict (consecutive real lessons)');
CHECK('bits-01j', T('08:00', '09:50', '09:30', '10:20') === true, 'lesson 08:00-09:50 and 09:30-10:20 conflict (true overlap 20 min)');
BUG('bits-01m', T('08:00', '09:50', '09:50', '10:30') === true, 'interval [09:50,10:30) touches but does not overlap [08:00,09:50): solver reports a conflict');
BUG('bits-01n', T('08:00', '09:50', '09:55', '10:30') === true, 'interval [09:55,10:30) starts 5 min AFTER [08:00,09:50) ended: solver reports a conflict');
CHECK('bits-01o', T('08:00', '09:50', '10:00', '10:30') === false, 'interval starting at the next slot boundary 10:00 is free (no false conflict from the :50 end)');
process.exit(allOk ? 0 : 1);
