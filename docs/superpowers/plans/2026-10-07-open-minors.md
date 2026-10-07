# Open minors sweep (2026-10-07)

Goal: close the small open items that need no owner decision (ISSUES.md 18, 23). Blocked and left open: #8 (F-19, waits for owner D2), #9 (exams, Firefox/Safari, first nightly), real-phone checks, screen-reader checks.

1. `ctxOf` ran twice per full redraw (ui.onShown, then render): render takes the context.
2. Electives chip "לא רלוונטי (N)": text, `<bdi>` and ")" were three flex items, so the bidi parens split ("( 31 )"): one span.
3. Hidden legend (`.sr`) still read its abbreviations: `aria-hidden` on them until the toggle is on (markup and toggle).
4. Block abbreviation hidden below 11px (spec), was 10px: `@container (height < 11px)`.
5. Test: markup keeps `aria-hidden` while the legend is hidden.

Verify: `node --test test/ui-map.test.mjs`, then `npm test`.
