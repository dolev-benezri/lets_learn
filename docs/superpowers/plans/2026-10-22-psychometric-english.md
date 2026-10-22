# English exemption from the psychometric English score

Owner's ask, 2026-10-22: students are exempt from English levels not only by Amirnet but also by the English section of the
psychometric exam. Research only; nothing is implemented until the owner approves.

## Findings

1. **Same scale, same score.** NITE's Amirnet FAQ: Amirnet scores are on a 50–150 scale and "שקולים לציונים בתחום אנגלית של
   הבחינה הפסיכומטרית וכן לציונים שהתקבלו בעבר בבחינת אמיר"ם ובבחינת אמי"ר". Same page: Amirnet's difficulty equals the
   psychometric English section's.
   Source: <https://www.nite.org.il/other-tests/amirnet/faq/> (page `dateModified` 2026-08-12, read 2026-10-22).
2. **Old psychometric English scores stay valid.** NITE FAQ on the two-domain test: the English score is valid for at least 7
   years, whether from the psychometric English section or from Amir/Amiram/Amirnet. From the December 2026 sitting the
   psychometric exam has no English; English is tested by Amirnet only (a Council for Higher Education decision, quoted on
   the same page). So every current student and applicant up to the September 2026 sitting may hold a psychometric English
   score.
   Source: <https://www.nite.org.il/two-domain-psychometric-entrance-test/faqs/> (`dateModified` 2026-08-05, read 2026-10-22).
   Press: Maariv, 2026-02-15, <https://www.maariv.co.il/news/israel/article-1285094>.
3. **Placement is the institution's.** NITE: the level each score gives, and which score counts when a student has several
   (latest, highest, average), are set by each institution.
   Source: Amirnet FAQ above.
4. **Afeka's table already names the psychometric exam.** Afeka regulations (תקנון לימודים תואר ראשון, 5.2.2026), sections
   6.2.7–6.2.8, as recorded in `docs/research-degree-rules.md` §3.2 (read 2026-10-02): the column header is "ציון
   (פסיכומטרי, אמיר"ם או אמי"ר)", 85/100/120/134 for basic / advanced A / advanced B / exemption. These are exactly
   `AMIRNET = [85, 100, 120, 134]` in `web/rules.js`. Not re-fetched now (no requests to Afeka sites).
5. Other institutions agree on 134 for exemption (cross-check only, not Afeka's rule): Bar-Ilan
   <https://efl.biu.ac.il/en/node/2230>, Tel Aviv <https://en-languages.tau.ac.il/english_courses>, Technion
   <https://admissions.technion.ac.il/?p=903>. Lower bands differ between institutions, so only Afeka's table applies.

**Conclusion:** no new thresholds. A psychometric English score is entered on the same 50–150 scale and gives the same levels.

## Open questions for the owner (Afeka text needed)

- Afeka's rule when a student has more than one English score (for example psychometric 118 and Amirnet 125): which counts?
  If the owner can paste that line from the regulations or the admissions page, the hint can say it; otherwise the hint
  sends the student to the office (below).
- Confirm that section 6.2.7 in the current regulations still reads "פסיכומטרי, אמיר"ם או אמי"ר" (pasted text is enough).

## Proposal

One field, not two. The scores are equivalent, and the rule for several scores is Afeka's, so a second field would force the
site to guess a rule (max? latest?) it cannot source.

Data: none. Keep the profile key `amirnet` (saved state, backup links and friend links already carry it; renaming would need a
migration for no gain). `rules.js` `ENGLISH` / `AMIRNET` unchanged; update the comment to name both exams and the NITE source.

Wording (every place that says "ציון אמירנט"):

- me page field (`web/ui-me.js`): label `ציון אנגלית (אמירנט או פרק האנגלית בפסיכומטרי)`, hint
  `סולם 50–150. ריק אם לא ידוע. יש לכם כמה ציונים? בדקו מול המזכירות איזה מהם נחשב.` (second sentence replaced by Afeka's
  rule if the owner pastes it).
- `web/rules.js`: exempt reason `פטור (ציון אנגלית)`; blocked hint `הזינו ציון אנגלית (אמירנט או פסיכומטרי) ב"המצב שלי"…`.
- `web/ui-side.js`: English box text `ציון אנגלית (אמירנט או פסיכומטרי) פוטר מהרמה…`, the "if you have a score" link, and the
  `פטור (ציון אמירנט)` group title.
- `web/legal.html`: the two lines that say "ציון אמירנט".

Tests: update the three string assertions (`test/rules.test.mjs:187`, `:364`, `test/app.test.mjs:538`) and add one to the me
page render test that the label names both exams. No new logic, so no new rule tests.

Size: about 8 changed lines in 4 files plus 3–4 test lines. Branch `claude/psychometric-english` from `main`.

## Done (owner OK 2026-10-22: one field, wording and tests only)

Branch `claude/psychometric-english` from `main`. Wording as above in `web/rules.js`, `web/ui-me.js`, `web/ui-side.js`,
`web/legal.html` (dated 23.10.2026). Tests: `test/rules.test.mjs`, `test/app.test.mjs`, new field test in
`test/xss.test.mjs`. The rule for several scores is still open: the hint sends the student to the office.
