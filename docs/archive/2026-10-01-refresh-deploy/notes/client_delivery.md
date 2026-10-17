# Client-side data delivery, caching, freshness and offline use for the static timetable app (as of Oct 2026)

Scope note: research done 2026-10-01. Several primary doc sites (web.dev, MDN, developer.chrome.com, jakearchibald.com, simonwillison.net, dev.to) were blocked by the network proxy in this session, so some facts come from search-engine snippets of those pages (marked "via search snippet"). Cloudflare docs were read through the Cloudflare docs search tool (pages updated Sep 22, 2026). Size numbers marked "local measurement" were measured on the repo's files on 2026-10-01 with Node zlib / Python gzip / fonttools.

Repo facts used below (read from the code):
- `web/app.js` `init()` does `fetch(dataPath(state, sem))` for both semesters with no cache options, `Promise.allSettled`, then `readHash(location.hash)` once; it then clears the hash with `history.replaceState`. There is no `hashchange` listener (confirmed open item in `docs/ISSUES.md` section 17b: "a link pasted into an open tab does nothing because there is no hashchange").
- `web/ui-plan.js` `renderTop()` shows `נתונים מ-<fetchedAt>` and adds a warning when `(Date.now() - fetchedAt) / 864e5 > 3`. In year view `app.data.fetchedAt` is semester A's.
- `web/share.js`: friend links are `#f=<deflate+base64url JSON>` with `{v:1, year, semester, program, name, groups:[ids]}`; backups are `#b=...` with the whole state. Group IDs look like `"270600101"` (course id + group number). Semester A file: 81 courses, 394 groups.
- `web/index.html` loads Rubik from `fonts.googleapis.com` (weights 400;500;600, `display=swap`) with preconnects to both Google hosts.

## Overall prioritization: what is worth doing now, later, and not at all

### Takeaway
The data is tiny once compressed (about 21-24 KB for both semesters) and changes at most daily, so the host's default HTTP caching plus ETag/304 is already close to optimal; the high-value work is UX correctness (hashchange, honest "last checked" vs "last changed", handling vanished groups) and small privacy/perf wins (self-hosting the font), not cache engineering. A service worker is a "later, optional" item; hashed filenames, format changes and splitting are not worth it.

### Cited Findings
- GitHub Pages sends `Cache-Control: max-age=600` on everything and takes no custom headers — [OurHike issue #1771 (2026-09-30)](https://github.com/OurHike/OurHike/issues/1771); [GitHub community discussion #11884 (open since 2022, still unanswered Jan 2026)](https://github.com/orgs/community/discussions/11884)
- Cloudflare (Workers static assets / Pages) defaults to `Cache-Control: public, max-age=0, must-revalidate` plus an `ETag` that is a hash of the file, "ensur[ing] good website performance for static pages, while still guaranteeing that stale content will never be served" — [Cloudflare Workers static assets: Headers (updated Sep 22, 2026)](https://developers.cloudflare.com/workers/static-assets/headers/)
- Jake Archibald's rule: "Favour immutable content for any URL that can easily change, otherwise play it safe with server revalidation"; and "Service workers work best as an enhancement rather than a workaround" — [Caching best practices (source markdown)](https://github.com/jakearchibald/jakearchibald.com/blob/main/static-build/posts/2016/04/caching-best-practices/index.md)
- Both data files: raw 185,538 / 167,210 bytes; minified 120,137 / 108,732; gzip-6 raw 12,447 / 11,610; gzip-6 minified 11,099 / 10,226 — local measurement of `web/data/afeka/2027-{1,2}/30-2026.json`

### Inferences
Recommended order (my synthesis of the sections below):
1. NOW (small, high value): add a `hashchange` listener that reuses the `init` hash path (section "hashchange").
2. NOW: split freshness into "checked" vs "changed": scraper writes a tiny `status.json` every run (`checkedAt`, per-semester content hash and `changedAt`); data files are committed only when content changes; the stale warning keys off `checkedAt` (section "Freshness UX").
3. NOW: make vanished/renamed groups visible instead of silently dropped: on load, reconcile pins/choices/friend groups against the loaded data and show a one-line notice ("2 קבוצות ששמרת כבר לא קיימות") with the course name (section "Data change handling").
4. NOW (cheap): self-host Rubik as the variable woff2 (Hebrew 9.3 KB + Latin 35 KB, or Latin subset 10-24 KB) and drop the two preconnects (section "Fonts").
5. NOW or never (trivial either way): fetch data with `{cache: 'no-cache'}` only if you want "fresh within seconds of deploy" on GitHub Pages; otherwise leave plain `fetch` (section "Cache strategy"). Optionally fetch `data.json?v=<hash from status.json>` to defeat edge staleness and keep consistency across the two semesters.
6. LATER (when hosted and used on phones): small hand-written service worker (about 40-60 lines) giving offline app shell + last-known data, with network-first for data and a versioned precache for the shell; plus a web app manifest. Main benefit beyond offline: on iOS, home-screen installs are exempt from Safari's 7-day storage wipe, which protects the localStorage state (section "Service worker").
7. LATER: "what changed since your last visit" diff (full/not-full, times moved, group gone) using the previous data snapshot stored client-side (section "Data change handling").
8. NOT worth it: switching to a binary/columnar format, splitting files per course, delta updates, Workbox, ETag polling loops, background sync, push notifications, content-hashed data filenames on GitHub Pages.

### Gaps
- No direct header capture of GitHub Pages responses was possible in this session (proxy blocked `*.github.io`), so GitHub Pages' gzip level, `Vary`, and whether a deploy purges the Fastly edge were not verified first-hand.

## Is it worth minifying, splitting or changing the JSON format? Do GitHub Pages and Cloudflare compress JSON?

### Takeaway
No. Minifying saves about 1.3-1.4 KB per file after gzip (about 11%), roughly 2.7 KB per full load; on GitHub Pages (gzip only) the whole payload is about 24 KB, on Cloudflare about 21-24 KB depending on Brotli level. Minify only because it is free inside the scraper (`JSON.stringify(data)` without indent), not as a project. Splitting or a new format adds code and cache complexity for single-digit KB.

### Cited Findings
- Measured sizes (bytes), semester A / semester B — local measurement:
  - raw pretty (indent 1): 185,538 / 167,210
  - minified: 120,137 / 108,732
  - gzip level 6, raw: 12,447 / 11,610; minified: 11,099 / 10,226 (saves 1,348 / 1,384)
  - gzip level 9, raw: 11,421 / 10,757; minified: 10,583 / 9,792
  - Brotli q4, raw: 12,671 / 11,796; minified: 11,361 / 10,470
  - Brotli q11, raw: 8,970 / 8,332; minified: 8,518 / 7,924
- GitHub Pages applies automatic gzip only; brotli and pre-compressed `.br` files are not served (feature request logged by GitHub staff in 2019, unresolved as of June 2024) — [GitHub community discussion #21655](https://github.com/orgs/community/discussions/21655); same conclusion in search summary of [discussion #11884 and related](https://github.com/orgs/community/discussions/11884)
- Cloudflare compresses `application/json` by default; Brotli is on by default, Zstandard can be enabled with a compression rule, with fallback to Brotli, gzip, or uncompressed; minimum sizes 48 bytes (gzip) / 50 bytes (Brotli, zstd) — [Cloudflare Content compression docs (via search snippet)](https://developers.cloudflare.com/speed/optimization/content/compression/); [Enable Zstandard compression rule](https://developers.cloudflare.com/rules/compression-rules/examples/enable-zstandard/)
- Cloudflare's on-the-fly Brotli level is below 11 on standard plans; reaching level 11 was described as needing Cloudflare Pro plus pre-compression — [Matt Hobbs, "Cranking Brotli up to 11 with Cloudflare Pro and 11ty" (Jan 2025)](https://nooshu.com/blog/2025/01/05/cranking-brotli-up-to-11-with-cloudflare-pro-and-11ty/)

### Inferences
- At these sizes, compressed transfer is dominated by round-trip latency, not bytes. On weak campus reception the number of serial requests matters far more than 2-3 KB of payload.
- Low-level Brotli (q4) is slightly worse than gzip-6 on this data; so moving hosts for Brotli does not meaningfully shrink the data.
- Minification does reduce parse work on phones (120 KB vs 185 KB string to `JSON.parse`), but 185 KB parses in a few ms on modern phones; still, removing the indent in the scraper's `writeFile` is a one-line, zero-risk change and keeps git diffs readable only if the team does not rely on line-level diffs. Trade-off: pretty JSON gives readable git-scraping diffs (useful for "what changed" debugging). A reasonable compromise: keep pretty JSON in git history, or keep one entry per line; the 11% saving is not worth losing diff readability.
- Splitting per course would turn 2 requests into dozens; worse on high-latency links and harder to keep consistent.

### Gaps
- GitHub Pages' actual gzip level was not measured (proxy blocked); numbers above use level 6 as a typical server default.

## Cache strategy options on GitHub Pages vs Cloudflare; how git-scraping sites handle it

### Takeaway
On GitHub Pages the fixed 10-minute `max-age` means: with plain `fetch`, a returning user may see data up to about 10 minutes old (plus possible edge staleness), then gets cheap 304 revalidation. For data refreshed daily this is fine. If you want "fresh as soon as deployed", the clean pattern on GitHub Pages is a small `status.json` fetched with `cache: 'no-cache'` that carries a content hash, and data URLs versioned with `?v=<hash>` (query string keyed on content, not time). Content-hashed filenames with `immutable` only pay off on Cloudflare, and even there they save one tiny 304 per file.

### Cited Findings
- GitHub Pages: `Cache-Control: max-age=600` on all files, no `_headers`/custom header support; workarounds are putting Cloudflare in front or using jsDelivr for permanent caching — [discussion #11884](https://github.com/orgs/community/discussions/11884); [OurHike #1771](https://github.com/OurHike/OurHike/issues/1771)
- A project hit exactly this: re-published JSON on GitHub Pages showed the previous version "for up to 10 minutes" because of `max-age=600` "plus CDN edge cache"; their fix was `fetch(..., {cache: 'no-store'})` for the browser cache plus a unique query parameter to bypass the CDN edge cache — [alelom/OntoCanvas issue #55](https://github.com/alelom/OntoCanvas/issues/55)
- Fetch cache modes (via search snippets / general MDN definitions): `no-cache` makes the browser send a conditional request (If-None-Match / If-Modified-Since) even when the cached copy is fresh, and use the cached body on 304; `no-store` bypasses the HTTP cache completely; `reload` fetches unconditionally but updates the cache — [MDN Request.cache](https://developer.mozilla.org/en-US/docs/Web/API/Request/cache) (page itself was blocked; definitions from training knowledge, consistent with the OntoCanvas usage)
- Cloudflare: default `public, max-age=0, must-revalidate` + ETag hash; `_headers` can override, e.g. `Cache-Control: public, max-age=31556952, immutable` for a folder of fingerprinted assets — [Cloudflare Pages Headers docs](https://developers.cloudflare.com/pages/configuration/headers/); [Workers static assets Headers](https://developers.cloudflare.com/workers/static-assets/headers/)
- Conflict: a 2026 DEV post (via search snippet) claimed `_headers` Cache-Control is ignored for Pages static assets — [DEV Community: "Two Cloudflare Pages behaviours I had to measure to believe"](https://dev.to/ankit_gupta_37c6b9df66fb7/two-cloudflare-pages-behaviours-i-had-to-measure-to-believe-4gki); contradicted by Cloudflare's own docs above, which show exactly that override as an example. Treat the official docs as authoritative but verify with `curl -I` after deploying.
- Cloudflare is steering new static projects to Workers static assets ("Migrate from Pages to Workers"; static asset requests are free on both) — [Cloudflare: Migrate from Pages (updated Sep 22, 2026)](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)
- Git-scraping practice: the scraper fetches JSON, pretty-prints it, and commits it back only "if it has changed"; the JSON on GitHub can then be fetched by JavaScript on static pages — [Simon Willison, Git scraping (2020), via search snippet](https://simonwillison.net/2020/Oct/9/git-scraping/)
- A Technion example: `selfint/degree-planner` updates course data with scheduled GitHub Actions that open "[Automated] Update course data" PRs (latest seen 24-09-2026) and deploys to Vercel, so data is baked into each deploy — [degree-planner PR #208](https://github.com/selfint/degree-planner/pull/208); [repo README](https://github.com/selfint/degree-planner)

### Inferences
Option comparison for this app:

| Option | GitHub Pages | Cloudflare | Cost | Verdict |
|---|---|---|---|---|
| Plain `fetch(url)` (today) | Fresh within ~10 min of deploy; 304s after that | Always revalidates (max-age=0); 304 when unchanged | 0 | Good enough for daily data |
| `fetch(url, {cache:'no-cache'})` | Always one conditional request; data can still be up to 10 min stale from the edge after a deploy | Same as plain fetch | 1 line | Optional; costs a round trip on every load in exchange for minutes of freshness |
| `status.json` (no-cache) + `data.json?v=<hash>` | Fresh immediately (new URL bypasses edge + browser cache); old URL stays cached; both semesters guaranteed consistent | Works too | ~10 lines client, few lines in job; adds one serial round trip unless done in parallel | Best "correct" option if freshness after deploy matters; also gives `checkedAt` for free |
| Content-hashed filenames + immutable | No benefit (max-age=600 anyway) and pollutes git history with renamed files | Saves one 304 per file per visit | Needs job to rename + manifest + cleanup | Not worth it |
| Time-based query busting (`?t=Date.now()`) | Always full download, defeats caching | Same | 1 line | Avoid |

- To avoid the extra serial round trip on weak connections: start `status.json` and both data fetches in parallel with plain URLs; when status arrives, if its hash differs from the hash embedded in the loaded data, refetch with `?v=hash` (rare path). The data files can carry their own `hash` field written by the scraper.
- `cache: 'no-store'` (OntoCanvas's choice) is wrong for this app: it throws away the 304 benefit and the offline/back-button cache.

### Gaps
- Whether GitHub Pages purges its Fastly edge on each deploy (so that `no-cache` alone gives immediate freshness) could not be verified from primary docs.
- I did not find documentation of how CheeseFork itself versions its data files (its repos were not reachable through the proxy).

## Service worker, offline and "add to home screen": worth it? Hand-written vs Workbox

### Takeaway
Worth it later, after hosting, for two concrete reasons: (1) students on weak reception get an instant app shell and last-known data, and (2) on iOS, a home-screen-installed web app is exempt from Safari's 7-day wipe of script-writable storage, which otherwise can delete the user's saved choices/pins/friends. Use a small hand-written SW (no build step needed): versioned precache of the shell, network-first-with-timeout (or stale-while-revalidate) for data, and an explicit "new version available, reload" prompt instead of `skipWaiting` on the fly. Workbox is not needed.

### Cited Findings
- Safari ITP deletes all script-writable storage (IndexedDB, LocalStorage, SessionStorage, service worker registrations and caches) after 7 days without user interaction on the site; the first-party domain of home-screen web apps is exempt, and home-screen apps have their own day counter that resets with use — [WebKit Tracking Prevention (via search snippet)](https://webkit.org/tracking-prevention/); [Michael Tsai summary of Safari 13.1 (2020)](https://mjtsai.com/blog/2020/03/26/safari-13-1-third-party-cookie-blocking-and-7-day-script-writeable-storage/)
- SW update mechanics: a SW is updated when byte-different; `updateViaCache` defaults to `'imports'`, meaning the HTTP cache is not consulted for the SW script itself but is for `importScripts()`; since Chrome 78 imported scripts are also byte-compared; the browser treats the HTTP cache as stale if more than 24 hours old; update checks also happen on functional events unless one ran in the previous 24 hours; `self.skipWaiting()` makes the new SW activate as soon as it installs — [web.dev SW lifecycle, MDN updateViaCache, Chrome "Fresher service workers" (via search snippets)](https://web.dev/articles/service-worker-lifecycle); [MDN updateViaCache](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/updateViaCache); [Chrome blog: Fresher service workers, by default](https://developer.chrome.com/blog/fresher-sw)
- Jake Archibald warns interdependent resources with independent caching "may end up with the new version of one/two of the resources, but the old version of the other(s)" — [Caching best practices](https://github.com/jakearchibald/jakearchibald.com/blob/main/static-build/posts/2016/04/caching-best-practices/index.md)
- Workbox can be used without a build via `importScripts('https://storage.googleapis.com/workbox-cdn/releases/<ver>/workbox-sw.js')`; the Workbox team has said the CDN is mainly useful for injectManifest users and may be phased out long-term — [workbox-sw docs (via search snippet)](https://developer.chrome.com/docs/workbox/modules/workbox-sw); [GoogleChrome/workbox issue #2064](https://github.com/GoogleChrome/workbox/issues/2064)
- Workbox is still released (v7.3.0, v7.4.0, v7.4.1 listed as latest) — [Workbox releases](https://github.com/GoogleChrome/workbox/releases) (exact years not shown on the fetched page)
- Hand-written SWR pattern: respond from cache, fetch in background, `cache.put(request, response.clone())`; network-first variant races `fetch` against a timeout and falls back to `caches.match()` — [DEV: SW caching strategies (via search snippet)](https://dev.to/helloashish99/service-worker-caching-strategies-cache-first-network-first-and-swr-2pan); [MagicBell: Offline-first PWAs](https://www.magicbell.com/blog/offline-first-pwas-service-worker-caching-strategies)
- An app with ~158 hashed assets revalidated all of them on first launch after each deploy "until service workers cache them locally" — [OurHike #1771](https://github.com/OurHike/OurHike/issues/1771)

### Inferences
Concrete minimal design for this repo (no build step; about 50 lines, `web/sw.js`):
- `const VERSION = '2026-10-01a'` at the top; bump it on every app-code change (this byte change is what triggers the update). The shell list is the ~13 files in `web/` (`index.html`, `map.css`, `app.js`, `ui-*.js`, `rules.js`, `share.js`, `solver-*.js`, self-hosted font files). Precache them all in `install` into `shell-<VERSION>` with `cache: 'reload'` so the HTTP cache (max-age 600) cannot feed an old file into a new version; delete other `shell-*` caches in `activate`. Because all ES modules are swapped atomically per version, the "mixed versions" problem Jake describes is avoided.
- Navigation and shell: cache-first from the versioned cache (instant offline load).
- Data (`data/**.json`, `status.json`): network-first with a ~3 s timeout, falling back to the cached copy, and put successful responses into a separate `data` cache. This keeps data fresh when online and still works offline. Stale-while-revalidate for data is also acceptable but means the user sees yesterday's data on first open and today's only on the next open; with the "checked/changed" header that is tolerable, but network-first matches "registration day" usage better.
- Update UX: do not call `skipWaiting()` automatically. In the page, listen for `registration.waiting` / `updatefound`, show a small banner "גרסה חדשה זמינה · רענן", and on click `postMessage({type:'SKIP_WAITING'})` then reload on `controllerchange`. This avoids both pitfalls: users stuck on an old version forever (the banner tells them) and a page running old JS against a new SW (no surprise takeover).
- Kill switch: keep a known-good "unregister and clear caches" SW version in mind; if a bad SW ships, deploying a SW that calls `self.registration.unregister()` recovers users (training knowledge; standard advice).
- GitHub Pages detail: register with `navigator.serviceWorker.register('sw.js')` (relative), so scope is the project path `/<repo>/`.
- Web app manifest (`manifest.webmanifest` with `name`, `short_name`, `start_url: "."`, `display: "standalone"`, `dir: "rtl"`, `lang: "he"`, two PNG icons 192/512) plus `<link rel="manifest">` is cheap and is what makes "add to home screen" open standalone; this is what triggers the iOS storage exemption.
- Workbox from CDN: adds a third-party runtime dependency (Google storage host) to every SW install, whose CDN is not the recommended path; for 13 files and two strategies a hand-written SW is smaller and easier to reason about. Not worth it.
- Without a SW, an alternative partial offline: persist the last good data JSON in IndexedDB/localStorage and use it if `fetch` fails. This helps only after the page itself loaded (HTTP cache), so it is weaker than a SW; not recommended as a separate project.

### Gaps
- Could not read web.dev / MDN pages directly; details above come from search snippets plus standard knowledge.
- No usage data on how many Afeka students would install to home screen.

## Freshness UX: "last checked" vs "last changed"; exposing a status file cheaply

### Takeaway
If the job commits only on change (git-scraping norm), `fetchedAt` inside the data means "last changed", and the 3-day warning will fire wrongly on quiet days. Write a tiny `status.json` on every successful run (`checkedAt`, `ok`, and per semester `hash`, `changedAt`), base the stale warning on `checkedAt`, and show both: "נבדק לפני 3 שעות · השתנה לאחרונה 28/9".

### Cited Findings
- Git scraping commits "back to the repo if it has changed" — [Simon Willison, Git scraping (via search snippet)](https://simonwillison.net/2020/Oct/9/git-scraping/)
- GitHub Pages' 10-builds-per-hour soft limit "does not apply if you build and publish your site with a custom GitHub Actions workflow"; soft bandwidth 100 GB/month; site up to 1 GB — [GitHub Pages limits (docs.github.com, via search snippet)](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- Cloudflare Pages free: unlimited static bandwidth/requests, 500 builds per month — [secondary summaries, e.g. agentdeals.dev](https://agentdeals.dev/vendor/cloudflare-pages); [temps.sh](https://temps.sh/blog/cloudflare-pages-free-tier-limits-2026) (not primary)
- Current app logic: stale if `(Date.now() - fetchedAt) / 864e5 > 3` in `renderTop` — `web/ui-plan.js` line ~105

### Inferences
- Committing `status.json` daily adds a ~100-byte diff per day: negligible git noise, well within GitHub Actions/Pages limits (a daily commit is ~30 deploys/month; also fine for Cloudflare's 500 builds/month, or use direct upload from the Action).
- `status.json` should be fetched with `{cache: 'no-cache'}` (one tiny conditional request). Stale logic: warn when `checkedAt` older than ~36 h during registration (the job runs daily) or when `ok === false` ("הבדיקה האחרונה נכשלה, מוצגים נתונים מ-…"). Drop the warning based on `fetchedAt`.
- Alternative with zero extra request: always rewrite `checkedAt` inside the data files every run. Costs a full-file commit daily and a full ~11 KB re-download per user per day; acceptable but loses the "changed" signal and git-history readability. The separate status file is cleaner.
- If a SW is added later, `status.json` lets the page show "offline, data from …" honestly.
- On GitHub Pages, without `?v=` versioning `status.json` itself can be up to 10 minutes old at the edge, which is irrelevant at daily granularity.

### Gaps
- No primary source on how CheeseFork or HUJI planners display freshness.

## Data change handling vs saved state (vanished groups, old friend links, "what changed")

### Takeaway
Treat saved group IDs as possibly dangling: on every load, reconcile state against the loaded data, keep unknown IDs (do not delete them silently), and tell the user in plain words which saved items no longer exist, linking to the course so they can pick a new group. For "what changed since last visit", store a compact per-group fingerprint (full flag + meeting times) from the last visit in localStorage and diff on load; show only changes that touch the user's own choices/pins/friends. I found no published prior art from course planners for this diff UX; it is my design proposal.

### Cited Findings
- Friend links carry only `name` and up to 40 group ID strings, validated in `readHash` (`web/share.js`); state normalization keeps friends' `groups` as strings (`web/app.js` `normalize`). Group records include `id`, `full`, `meetings` (day/start/end/room), `lecturer`, `type` — local reading of repo code and `web/data/afeka/2027-1/30-2026.json`.
- Git-scraping keeps every data version in git history, so diffs are recoverable server-side — [Simon Willison, Git scraping (via search snippet)](https://simonwillison.net/2020/Oct/9/git-scraping/)

### Inferences
- Reconciliation rules (cheap, do now):
  - Pinned/chosen group missing: keep it in state with a `missing` badge; show a banner "הקבוצה X בקורס Y כבר לא קיימת בנתונים" with "בחר קבוצה אחרת". Do not auto-drop, because a group may reappear next refresh (scrape glitch) and the validator might let a partial scrape through.
  - Friend's group IDs missing: show the friend's overlap computed on remaining IDs plus "N קבוצות מהקישור של X לא נמצאו בנתונים העדכניים; בקשו קישור חדש". Because group IDs embed course id + group number (`270600101`), the course can usually still be named even when the group is gone (inference from the ID shape; verify with the scraper).
  - Friend payload has no data version; adding `d: <data hash or changedAt>` to new friend links (keeping `v: 1` reading compatible) lets the receiver say "הקישור נוצר לפני עדכון הנתונים ב-…". Optional.
- "What changed" (later): on each load, compute for the user's relevant groups a fingerprint `{full, meetings}`; store the previous fingerprints (a few KB) in localStorage under a separate key; diff and show at most a few lines ("קבוצה 02 בקורס X התמלאה", "שעת ההרצאה זזה מ-17:00 ל-18:00"). Full-catalogue diff is not useful to students and costs storage; limit to pinned/chosen/friend groups.
- Not worth it: server-side changelog generation or a full diff UI across all courses.

### Gaps
- No prior art found (CheeseFork, HUJI, degree-planner) documenting how they handle removed groups or show change summaries; their repos/pages could not be inspected in this session.
- Stability of Afeka group IDs across refreshes is unverified; the scraper's history (git log of the JSON) would answer it.

## hashchange: friend links pasted into an already-open tab

### Takeaway
Standard fix: `window.addEventListener('hashchange', handler)` that runs the same hash-reading path as `init()` (readHash, confirm backup restore, set `friendLanding`, `history.replaceState`, `refresh()`). Pasting a URL that differs only in the fragment into the address bar of the open tab does not reload the page; it fires `hashchange`.

### Cited Findings
- The `hashchange` event fires when the fragment identifier of the URL changes; it is the primary mechanism for SPAs to react to fragment-only navigation without reload; listen via `window.addEventListener('hashchange', …)` or `window.onhashchange` — [javascripttutorial.net: hashchange](https://www.javascripttutorial.net/javascript-dom/javascript-hashchange/); [MDN mirror: onhashchange](https://mdn2.netlify.app/en-us/docs/web/api/windoweventhandlers/onhashchange/)
- The app currently reads the hash only in `init()` and clears it with `history.replaceState(null, '', location.pathname)`; open item "link pasted in an open tab does nothing because there is no hashchange", rated medium, "will matter after going live (12)" — `docs/ISSUES.md` section 17b, line 438.

### Inferences
- Implementation notes: extract the hash block of `init()` into `applyHash()`; call it from `init()` and from the `hashchange` listener (only after data loaded). `history.replaceState` does not fire `hashchange`, so clearing the hash afterwards does not loop. Pasting the same link twice into the same tab after the hash was cleared does fire again (the fragment changed from empty to `#f=…`), which is the desired behaviour.
- Also consider the case where the same site is open in two tabs: the `storage` event can keep the second tab's state in sync when the first saves (optional, later).

### Gaps
- None material.

## Privacy and cost: self-hosting Rubik vs Google Fonts; subsetting and woff2 sizes

### Takeaway
Self-host. Google serves Rubik as one variable font per script (the 400/500/600 weights all point to the same file), so self-hosting is just two woff2 files: Hebrew 9,348 bytes and Latin 35,348 bytes (or about 24 KB if Latin is subset to ASCII + a few symbols; about 10 KB for digits/punctuation only, but the data has English course names, so keep ASCII letters). This removes two third-party connections (DNS+TLS to two Google hosts, painful on weak reception) and the IP transfer to Google that a German court found unlawful.

### Cited Findings
- Google Fonts CSS for `Rubik:wght@400;500;600` returns 18 `@font-face` rules (6 subsets x 3 weights) but all weights per subset share one variable woff2; Hebrew file 9,348 bytes, Latin 35,348 bytes; gstatic font files are `Cache-Control: public, max-age=31536000`, the CSS is `private, max-age=86400, stale-while-revalidate=604800` — local measurement via curl, 2026-10-01 (`fonts.googleapis.com/css2?family=Rubik:wght@400;500;600&display=swap`)
- The same files are on npm as `@fontsource-variable/rubik` 5.3.0: `rubik-hebrew-wght-normal.woff2` 9,348 B, `rubik-latin-wght-normal.woff2` 35,348 B; licensed under SIL Open Font License 1.1 — local measurement of the npm tarball
- Subsetting the Latin variable font with fonttools `pyftsubset` to U+0020-007E plus a few symbols gives 24,416 B; digits/punctuation only gives 9,988 B — local measurement
- 12 of 81 semester-A course names contain Latin letters (e.g. "Ethics in Engineering", "MATLAB") — local measurement of the data file
- LG München I, 20 Jan 2022 (3 O 17493/20): embedding Google Fonts from Google's servers transmitted visitors' IP addresses to Google without consent; plaintiff awarded €100 and injunction; court noted fonts can be used without connecting to Google — [The Hacker News (Jan 2022)](https://thehackernews.com/2022/01/german-court-rules-websites-embedding.html); [WP Tavern](https://wptavern.com/german-court-fines-website-owner-for-violating-the-gdpr-by-using-google-hosted-fonts)

### Inferences
- Self-hosting recipe without a build step: copy the two woff2 files into `web/fonts/`, write two `@font-face` rules with `font-weight: 400 600`, `font-display: swap`, and the same `unicode-range` values Google uses (Hebrew: U+0307-0308, U+0590-05FF, U+200C-2010, U+20AA, U+25CC, U+FB1D-FB4F; Latin: U+0000-00FF etc.), optionally `<link rel="preload" as="font" type="font/woff2" crossorigin>` for the Hebrew file only. Remove both `preconnect` lines.
- On GitHub Pages self-hosted fonts get only `max-age=600` + 304s instead of Google's 1-year cache; with a SW precache this disappears; without one it is one small conditional request per file per visit after 10 minutes. The cross-site shared cache benefit of Google Fonts no longer exists because modern browsers partition the HTTP cache per site (training knowledge, Chrome 86/2020; not re-verified here).
- Israeli users are not under GDPR directly, but the privacy improvement and fewer connections are free; subsetting further is optional (saves ~11 KB) and needs a one-off `pyftsubset` run, not a build step.

### Gaps
- Exact `unicode-range` strings should be copied from the current Google CSS at implementation time; the Hebrew range above is from training knowledge, while the Latin/Hebrew file sizes were measured.
- Browser HTTP cache partitioning not re-verified from a primary source in this session.
