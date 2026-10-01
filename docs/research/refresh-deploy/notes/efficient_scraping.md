# Efficient, polite and robust scheduled scraping of Afeka's Michlol yedion (as of October 2026)

Notes on sources: repo facts are cited by file path in dolhack/lets_learn (cloned at /home/user/lets_learn, read on 2026-10-01; numbers marked "measured" were computed by me from `web/data/afeka/2027-1/30-2026.json` and `web/data/afeka/2027-2/30-2026.json`). yedionpub.afeka.ac.il was NOT accessed (blocked by the environment proxy, and out of scope). Several web pages (afeka.ac.il terms of use, rfc-editor.org, docs.github.com, computer-law.co.il, moticohenadv.com, hoganlovells.com, techpolicy.org.il) were blocked by the egress proxy, so some claims below rest on search-result snippets of those pages; this is flagged where it matters.

## 1. Request budget: what is duplicated today, and what a combined or tiered run would cost

### Takeaway
Every request in `scrape.mjs` is independent of `--semester`; the semester is only used in `buildDataset()` and in the output path. So the second run (semester ב) repeats 100% of the first run's ~169 requests. One combined run producing all semester files costs ~169 requests (half of today's ~338). A tiered scheme (daily: setup + S_LOOK_FOR_NOSE + 1 exam probe; weekly: everything) costs ~84 requests per daily run and roughly 670 per week, versus ~2,370 per week for today's two daily full runs (about a 72% cut).

### Cited Findings
- Request sequence per run in `main()`: GET `prgname=Enter_Search`, POST `ChangeYear` (2 setup); one `S_SHOW_PROGS` per list code, and program 30 has 9 list codes `[30001, 30002, 30003, 30004, 30007, 30010, 30031, 30901, 60004]`; one `S_LOOK_FOR_NOSE` per unique course id; one `S_CourseDetails` per course that has a primary group with `detailsArgs`; one `S_EXAMS` POST with `R1C28: program, R1C29: '0', R1C30: '0'`. None of these arguments contains the semester. — [scripts/scrape.mjs](https://github.com/dolhack/lets_learn/blob/main/scripts/scrape.mjs)
- `opt.semester` is used only in `buildDataset({... semester: opt.semester ...})` and in the output directory `web/data/afeka/${year}-${SEMESTER_CODE[semester]}`. — [scripts/scrape.mjs](https://github.com/dolhack/lets_learn/blob/main/scripts/scrape.mjs)
- `buildDataset()` does the semester split after the fact: it keeps a group only if `g.meetings.every((m) => m.semester === semester)`, and filters exams with `exams.filter((e) => e.semester === semester)`. `parseGroups()` already returns each meeting's `semester` column and `parseExams()` returns each row's `semester`. — [scripts/build.mjs](https://github.com/dolhack/lets_learn/blob/main/scripts/build.mjs), [scripts/parse.mjs](https://github.com/dolhack/lets_learn/blob/main/scripts/parse.mjs)
- `S_CourseDetails` is requested with the `detailsArgs` of the first primary group found among ALL semesters' groups (parsed before the semester filter), so it is the same request in both runs. — [scripts/scrape.mjs](https://github.com/dolhack/lets_learn/blob/main/scripts/scrape.mjs)
- Measured: both files have 81 courses; 76 courses have credits > 0 in each file (a proxy for the number of successful `S_CourseDetails` calls); 44 courses have prerequisites in each file. Semester א: 52 offered courses, 394 groups (205 primary), 90 groups flagged full, fetched 2026-09-30T16:08Z. Semester ב: 55 offered, 355 groups (203 primary), 110 full, fetched 2026-10-01T00:39Z. 69 courses are offered in at least one semester; 12 are offered in neither. — measured from [web/data/afeka/2027-1/30-2026.json](https://github.com/dolhack/lets_learn/blob/main/web/data/afeka/2027-1/30-2026.json) and [web/data/afeka/2027-2/30-2026.json](https://github.com/dolhack/lets_learn/blob/main/web/data/afeka/2027-2/30-2026.json)
- The owner already measured that all 81 courses have identical name/credits/prereqs in both semester files (stated in the task brief; consistent with the code path above).
- Today a run takes about 5 minutes at `--delay 2000`, and is manual only. — [docs/ISSUES.md §12](https://github.com/dolhack/lets_learn/blob/main/docs/ISSUES.md)

Request counts (derived from the code plus the measured counts; S_CourseDetails taken as ~76):

| Scheme | Requests per run | Runs/week in registration | Requests/week |
|---|---|---|---|
| Today: 2 full runs (א, ב), daily | 2 × (2 + 9 + 81 + ~76 + 1) ≈ 2 × 169 = ~338 | 7 | ~2,370 |
| (a) One combined run → writes 2027-1, 2027-2 (and קיץ if any meetings) | ~169 | 7 | ~1,180 |
| (b) Tiered: daily = 2 setup + 81 S_LOOK_FOR_NOSE + 1 S_EXAMS | ~84 | 6 daily + 1 weekly full (169) | ~670 |
| (b') Tiered, daily skips the 12 courses offered in neither semester (they get checked weekly) | ~72 | 6 + 1 weekly | ~600 |
| Out of registration season: weekly combined full run only | ~169 | 1 | ~169 |

At 2,000 ms spacing, ~169 requests ≈ 5.6 min of sleep alone; ~84 ≈ 2.8 min (plus server latency).

Which fields change during registration (from the data model; see Gaps for time-series):
- Fast-changing, from `S_LOOK_FOR_NOSE` only: `full` ("הקורס מלא" text), the set of groups (new or cancelled group ids), `linked` sub-groups, meeting `day/start/end/room`, `lecturer`. — [scripts/parse.mjs `parseGroups`](https://github.com/dolhack/lets_learn/blob/main/scripts/parse.mjs)
- Slow-changing: list membership and `minCredits` (`S_SHOW_PROGS`), `credits` and `prereqs` (`S_CourseDetails`). — [scripts/parse.mjs](https://github.com/dolhack/lets_learn/blob/main/scripts/parse.mjs)
- Exams: `S_EXAMS` is one request returning all semesters; currently no rows for תשפ"ז (`examsPublished: false` in both files). — measured; [docs/ISSUES.md §13](https://github.com/dolhack/lets_learn/blob/main/docs/ISSUES.md)

### Inferences
- Priority 1 (biggest, simplest win): make one run emit all semester files. Collect `lists`, `raw`, `exams` once, then call `buildDataset()` once per semester code that appears in any meeting (א, ב, and קיץ if present), run `validate()`/`compareToPrevious()` per file, and write all files only if all pass (keep the "write nothing on any failure" contract). Halves load with no loss of freshness.
- Priority 2: tiered refresh. Keep a small cache file (e.g. `web/data/afeka/2027-cache/30-2026.raw.json` or a non-published `data/cache/`) of `lists` and `details` per course with `fetchedAt`. Daily: setup + all S_LOOK_FOR_NOSE + S_EXAMS. Re-fetch `S_CourseDetails` for a course only when (i) it has no cached details, (ii) cache is older than 7 days, or (iii) its set of primary group ids changed (new course offering). Re-fetch the 9 `S_SHOW_PROGS` weekly, or when a course id appears in S_LOOK_FOR_NOSE data that is not in any cached list (cannot happen with the current id source, so weekly is the practical trigger).
- The `S_CourseDetails` key `detailsArgs` embeds a group id (`-N{course},-N1,-N1,-N{group},-N`), so cache by course id, not by detailsArgs, otherwise a group renumbering forces a needless refetch.
- Do not cut S_LOOK_FOR_NOSE below "all offered courses" during registration: full flags and new groups are exactly what users need fresh.
- Spread a run's requests evenly (constant spacing with small jitter) rather than in bursts; with ~84 requests the daily run fits comfortably under any per-hour limit that tolerated a 169-request run.

### Gaps
- No time series exists yet, so I cannot say how often each field actually changed in practice (e.g. how many groups flip to full per day, how often rooms change). Recommendation: the job should log a per-run change summary (see §5) so this can be measured after 2–3 weeks and the schedule tuned.
- Whether a single Michlol query can return groups for many courses at once (a department-level timetable query) is unknown; no public documentation of Michlol `prgname` endpoints was found. Other public scrapers (MTA, Braude) also call `S_LOOK_FOR_NOSE` per course (see §6), which suggests no cheaper bulk endpoint is commonly known.
- Exact S_CourseDetails count is approximated by "courses with credits > 0" (76); the real count may differ by a few if some details pages returned 0 credits.

## 2. Conditional requests (ETag / Last-Modified) and content hashing

### Takeaway
Dynamic ASP.NET pages by default send `Cache-Control: private` and no `ETag`/`Last-Modified`, so 304 revalidation is unlikely to be available on `fireflyweb.aspx`; this is easy to verify with one or two requests. Since conditional GETs probably cannot save requests, the useful substitute is hashing the parsed (normalized) per-course record: it detects "unchanged", avoids no-op commits, and drives the tiering and change summary, but it does not reduce request count by itself.

### Cited Findings
- RFC 9110: a client sending `If-None-Match` lets the server reply 304 Not Modified when a stored response matches; `If-Modified-Since` makes a GET/HEAD conditional on the modification date; a recipient MUST ignore If-Modified-Since when If-None-Match is present. — [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html) (via search snippet; the page itself was blocked by the proxy)
- For classic ASP.NET dynamic pages, `Cache-Control: private` is the default; `ETag` and `Last-Modified` are only emitted if the page code sets them (`HttpCachePolicy.SetETag`, `SetLastModified`), and by default the page is not cached on the server. — search summary of [Ultra-Fast ASP.NET, ch. 3](https://www.codemag.com/Article/100013/Ultra-Fast-ASP.NET-Chapter-3---Caching) and [HttpCachePolicy docs](https://learn.microsoft.com/pl-pl/dotnet/api/system.web.httpcachepolicy) (page bodies blocked; snippet-level evidence)
- An independent FireFly scraper (Braude, `braude-mcp`) contains no caching or ETag logic at all; it treats each response independently. — [oshriagronov/braude-mcp src/scrapers/firefly.ts](https://raw.githubusercontent.com/oshriagronov/braude-mcp/main/src/scrapers/firefly.ts)
- The Technion data fetcher caches responses locally by query hash to avoid redundant calls within/between runs. — [technion-sap-info-fetcher courses_to_json.py](https://raw.githubusercontent.com/michael-maltsev/technion-sap-info-fetcher/main/courses_to_json.py)

### Inferences
- Cheap verification (from the owner's own machine, once, outside registration-opening times): `curl -s -D - -o /dev/null -A '<your UA>' 'https://yedionpub.afeka.ac.il/yedion/fireflyweb.aspx?prgname=Enter_Search'` and look for `ETag`, `Last-Modified`, `Cache-Control`, `Expires`, `Vary`. If an `ETag`/`Last-Modified` is present, repeat once with `If-None-Match`/`If-Modified-Since` (with the session cookie) and see whether a 304 comes back. Prefer GET over HEAD: the WAF may treat HEAD unusually, and a HEAD costs the same server work for a dynamic page. Expected result: `Cache-Control: private`, no validators → conditional requests are not an option.
- Hash the normalized parsed record, not raw HTML: Michlol HTML may embed session- or time-dependent bits (cookies, hidden fields, timestamps), which would make raw-HTML hashes change on every fetch. Store `sha256(JSON.stringify(parsedCourse))` per course in the cache file; if all hashes equal the previous run and lists/details were not refreshed, skip writing and skip the commit (also keeps git history small: the two JSON files are ~185 KB and ~167 KB per the brief).
- Also keep `fetchedAt` updated separately (e.g. a tiny `meta.json` with `lastCheckedAt`) so the UI's 3-day staleness warning (`renderTop` in `web/ui-plan.js`, per [docs/ISSUES.md §12](https://github.com/dolhack/lets_learn/blob/main/docs/ISSUES.md)) does not fire just because nothing changed. Otherwise "no change, no commit" would make data look stale.

### Gaps
- The actual response headers of yedionpub were not observed (site blocked from this environment). The ASP.NET-default claim is general, not verified for this server; Michlol may sit behind a WAF/reverse proxy that alters headers.

## 3. Politeness norms: delays, User-Agent, off-peak timing, backoff, stopping

### Takeaway
There is no robots.txt and no standardized crawl-delay, so politeness is self-imposed. Evidence from this site: 1,000 ms spacing triggered blocks, 2,000 ms worked. Michlol's throttle is per-IP and product-level (the same Hebrew notice appears at Braude), with a per-hour lockout until a stated clock time. Recommended: keep 2,000–3,000 ms with jitter (and fix the 1,000 ms default), sequential only, an identifying User-Agent with a URL and email, an Israel-night schedule at an off-minute, honor Retry-After, exponential backoff on transient errors, and abort the whole run (writing nothing) on the first per-hour block or repeated WAF rejection.

### Cited Findings
- The scraper's default `--delay` is `'1000'`; HISTORY records that 1000 was blocked and the saved run used 2000, and lists this as a deferred item. — [scripts/scrape.mjs](https://github.com/dolhack/lets_learn/blob/main/scripts/scrape.mjs), [docs/HISTORY.md §7](https://github.com/dolhack/lets_learn/blob/main/docs/HISTORY.md)
- Current User-Agent: `'afeka-scheduler/1.0 (student timetable tool)'` (no URL or contact). — [scripts/scrape.mjs](https://github.com/dolhack/lets_learn/blob/main/scripts/scrape.mjs)
- Current retry logic: base sleep = delay; on retry `delay × 5 × 2^(attempt−1)` (with 2,000 ms: 10 s, 20 s, 40 s, 80 s); 429/5xx retried up to 3 times (Retry-After header is not read); per-minute throttle ("בדקה") waits 65 s up to 4 times; per-hour throttle throws immediately; WAF "Request Rejected" retried up to 4 times; network `TypeError` retried up to 3 times. No request timeout is set on `fetch`. — [scripts/scrape.mjs](https://github.com/dolhack/lets_learn/blob/main/scripts/scrape.mjs)
- The saved per-hour throttle page reads: "השהיית גישה זמנית: כתובת IP: … / יותר מידי שאילתות בשעה / ניתן לנסות שוב החל משעה 19:00" (temporary access suspension, per IP, too many queries per hour, retry from 19:00). — [scripts/fixtures/throttled.html](https://github.com/dolhack/lets_learn/blob/main/scripts/fixtures/throttled.html)
- A Braude (also Michlol) scraper detects the same strings, `'השהיית גישה זמנית'` and `'יותר מידי שאילתות'`, retries up to 4 times with `attempt * 4000` ms backoff, uses per-request timeouts (8 s GET, 15 s POST), and spoofs a Chrome User-Agent. — [braude-mcp firefly.ts](https://raw.githubusercontent.com/oshriagronov/braude-mcp/main/src/scrapers/firefly.ts)
- An MTA Michlol Scrapy spider has no delay or throttling settings at all. — [ranl/mta-course-scraper course_spider.py](https://raw.githubusercontent.com/ranl/mta-course-scraper/master/mta_course_scraper/spiders/course_spider.py)
- RFC 9309 (Robots Exclusion Protocol) does not include `crawl-delay`; a 4xx (e.g. 404) for robots.txt means crawlers may access any resource. — [searchengineworld summary of RFC 9309](https://www.searchengineworld.com/rfc9309-robots-txt-quietly-became-an-official-internet-standard); [robotstxtlab](https://robotstxtlab.net/glossary/crawl-delay)
- Common etiquette: identify the crawler with contact info in the User-Agent (e.g. "AcmeCo Crawler - acme.co - contact@acme.co"); respect Retry-After on 429; jittered exponential backoff on 429/5xx; stop on persistent 403/429. — [Firecrawl: polite crawling](https://www.firecrawl.dev/glossary/web-crawling-apis/what-is-polite-crawling), [undici crawling best practices](https://undici.nodejs.org/best-practices/crawling), [lagindicator polite scraping patterns](https://lagindicator.com/dev-tools/polite-web-scraping-design-patterns/) (secondary/industry sources, not standards)
- GitHub Actions `schedule` runs in UTC, can be delayed under load, and high-load times include the start of every hour; sufficiently high load can drop queued jobs; GitHub suggests scheduling at a different minute. In public repos, scheduled workflows are disabled after 60 days without repository activity. — [GitHub Docs: troubleshooting workflows](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows) and [cronuru guide](https://cronuru.com/guides/github-actions-scheduled-workflows) (via search snippets), [gh-action-keepalive](https://github.com/efrecon/gh-action-keepalive)
- Technion's fetcher runs daily at `cron: '0 8 * * *'` with `concurrency: generate-courses` so runs never overlap, and commits only when `git diff-index --quiet --cached HEAD` reports changes. — [technion-sap-info-fetcher deploy.yml](https://raw.githubusercontent.com/michael-maltsev/technion-sap-info-fetcher/main/.github/workflows/deploy.yml)
- Contrast: that Technion fetcher uses 16 concurrent processes against an SAP OData `$batch` endpoint, a far more robust API than Michlol's HTML pages. — [courses_to_json.py](https://raw.githubusercontent.com/michael-maltsev/technion-sap-info-fetcher/main/courses_to_json.py)

### Inferences
- Concrete settings: default delay 2,500 ms ± 500 ms jitter; strictly sequential; a 20–30 s `AbortSignal.timeout` per request; read `Retry-After` on 429/503 and wait at least that long; cap total retries per run (e.g. 10) and abort the run beyond that.
- On the per-hour notice: abort, write nothing, and do not retry within the same hour (the notice names the retry time; parse it and log it). Same for 3+ consecutive "Request Rejected": treat as "the WAF dislikes us", stop, and alert, instead of cycling retries.
- User-Agent: `afeka-scheduler/1.1 (+https://<public-site-or-repo>; <email>)`. Do not spoof a browser UA (unlike braude-mcp); a transparent UA is the main signal of good faith and lets Afeka IT contact the owner rather than block. Note the trade-off: a WAF could block non-browser UAs; if that happens, ask Afeka rather than disguise.
- Timing: run in Israel night hours, e.g. 02:00–05:00 Israel time (Israel is UTC+3 in summer / UTC+2 in winter; GitHub cron is UTC, so e.g. `17 0 * * *` = 02:17 or 03:17 Israel). Avoid :00 and :30. During registration, avoid the hours when registration windows open (Afeka publishes registration slots per year/track; the job should keep a small config list of "no-run" windows, e.g. ±2 hours around a window opening), because that is when the yedion is under real student load.
- Concurrency guard: `concurrency: { group: scrape, cancel-in-progress: false }` in the workflow so a manual run and a scheduled run never overlap (two runs from different IPs would still double the load).
- GitHub-hosted runners use shared cloud IP ranges; ISSUES §12 already flags the risk that the yedion may block them. The per-IP throttle is mostly fine for a fresh runner, but a WAF IP-reputation block is possible. Plan B: run from the owner's home machine/Raspberry Pi via cron or a self-hosted runner. Test with one manual `workflow_dispatch` run first.
- Public repos lose scheduled workflows after 60 days of no commits; a data-commit job normally keeps the repo active during registration, but with "no change, no commit" the off-season weekly job could go silent; add a keepalive or commit a `lastCheckedAt` meta file.

### Gaps
- No published Israeli guideline (from the Privacy Protection Authority or academic research-ethics bodies) on request rates for scraping was found. The norms above are industry etiquette, not regulation.
- Afeka's exact per-minute and per-hour thresholds are unknown. From the brief: 1,000 ms spacing was blocked and 2,000 ms passed a ~169-request run, which suggests the per-minute cap is somewhere between roughly 25 and 50 requests per minute (an inference that ignores server latency, not a measurement).
- The registration calendar for תשפ"ז (when windows open) was not checked (afeka.ac.il blocked from this environment).

## 4. Legal and ethical notes for Israel (practical, not legal advice)

### Takeaway
No Israeli statute or leading ruling bans scraping public web pages outright; the main risks are (1) "disrupting a computer" under the Computers Law if load is excessive, which polite rate limits address, (2) terms of use, whose enforceability against non-registered visitors is doubtful in Israeli rulings, and (3) privacy law for personal data: lecturer names are personal data in principle, and the Israeli PPA has signed the international position that publicly accessible personal data is still protected. For a non-commercial student tool republishing the college's own public timetable (course, group, time, room, lecturer name in a teaching role), the privacy risk looks low but not zero. Minimize, don't enrich, and be ready to remove on request.

### Cited Findings
- Israeli practitioner commentary (June 2025 update): there is no Israeli law or guiding ruling that broadly prohibits extracting information from websites; Computers Law 1995 §2 prohibits disrupting a computer's proper operation or interfering with its use, but scraping does not necessarily cause that; a court held Facebook's terms bind only registered users, not unregistered visitors seeing freely available information; courts have held that where the law gives no IP protection, site terms cannot create it. — [Adv. Moti Cohen, "האם מותר לבצע סריקת (גרידת) אתרים", June 2025](https://moticohenadv.com/%D7%94%D7%90%D7%9D-%D7%9E%D7%95%D7%AA%D7%A8-%D7%9C%D7%91%D7%A6%D7%A2-%D7%A1%D7%A8%D7%99%D7%A7%D7%AA-%D7%90%D7%AA%D7%A8%D7%99%D7%9D-data-scraping/) (via search snippets; page blocked by proxy, so case names/numbers could not be extracted)
- The same source (via snippet) notes an April 2025 Privacy Protection Authority draft opinion saying that in some circumstances data mining would violate privacy law. — [same article](https://moticohenadv.com/%D7%94%D7%90%D7%9D-%D7%9E%D7%95%D7%AA%D7%A8-%D7%9C%D7%91%D7%A6%D7%A2-%D7%A1%D7%A8%D7%99%D7%A7%D7%AA-%D7%90%D7%AA%D7%A8%D7%99%D7%9D-data-scraping/)
- The PPA's draft guidance of 28 April 2025 on AI systems: scraping personal data from the internet to train or use AI systems requires informed consent; publication of personal data online is not in itself permission to mine it for further purposes; unlawful scraping from a database is a severe security incident requiring immediate reporting. — [Herzog law firm summary](https://herzoglaw.co.il/he/news-and-insights/%D7%98%D7%99%D7%95%D7%98%D7%AA-%D7%94%D7%A0%D7%97%D7%99%D7%99%D7%AA-%D7%94%D7%A8%D7%A9%D7%95%D7%AA-%D7%9C%D7%94%D7%92%D7%A0%D7%AA-%D7%94%D7%A4%D7%A8%D7%98%D7%99%D7%95%D7%AA-%D7%91%D7%A0%D7%95%D7%A9/), [Goldfarb summary](https://www.goldfarb.com/he/%D7%98%D7%99%D7%95%D7%98%D7%AA-%D7%94%D7%A0%D7%97%D7%99%D7%99%D7%AA-%D7%94%D7%A8%D7%A9%D7%95%D7%AA-%D7%9C%D7%94%D7%92%D7%A0%D7%AA-%D7%94%D7%A4%D7%A8%D7%98%D7%99%D7%95%D7%AA-%D7%AA%D7%97%D7%95%D7%9C/) (via search snippets)
- Israel's PPA co-signed the 28 October 2024 Concluding Joint Statement on data scraping (17 authorities incl. ICO), which states that publicly accessible personal information is subject to data protection laws in most jurisdictions and expects all companies hosting such data to protect it against unlawful scraping. — [ICO news, Oct 2024](https://ico.org.uk/about-the-ico/media-centre/news-and-blogs/2024/10/global-privacy-authorities-issue-follow-up-joint-statement-on-data-scraping-after-industry-engagement/), [Concluding statement PDF (Swiss FDPIC)](https://www.edoeb.admin.ch/dam/en/sd-web/aNyux13gXLiF/Concluding%20Statement%20-%20English.pdf)
- Amendment 13 to the Privacy Protection Law was passed 8 Aug 2024 and took effect 14 Aug 2025, broadening the definition of personal data (incl. professional qualifications, online identifiers). — [DataGuidance Israel](https://www.dataguidance.com/jurisdictions/israel), [Ius Laboris](https://iuslaboris.com/insights/major-amendment-to-privacy-law-in-israel/). One search summary claimed the definition excludes publicly available information; I could not verify this against the statute text and it conflicts in spirit with the PPA positions above, so treat it as unconfirmed.
- Israeli copyright practice follows Feist: "sweat of the brow" alone does not make a database protected; computerized databases may be protected as compilations if original. A Petah Tikva magistrate's court held republishing RSS content with attribution and removal on request was not infringement. — [Law Library of Congress / law.co.il guides (search snippet)](https://www.law.co.il/media/knowledge-centers/copyright_2020_israel.pdf), [Plagiarism Today, 2013](https://www.plagiarismtoday.com/2013/02/21/israeli-court-rules-rss-scraping-legal/)
- US contrast (persuasive only): hiQ v. LinkedIn and Meta v. Bright Data (an Israeli company) held that logged-off scraping of public data does not violate the CFAA / Meta's terms. — [Calcalist](https://www.calcalistech.com/ctechnews/article/r11rft196), [EFF](https://www.eff.org/deeplinks/2022/04/scraping-public-websites-still-isnt-crime-court-appeals-declares)
- Afeka has a site terms-of-use page and a privacy policy. — [Afeka terms of use](https://www.afeka.ac.il/about-afeka/general-information/terms-of-use/), [Afeka privacy policy](https://www.afeka.ac.il/about-afeka/general-information/privacy-policy/) (found in search; content could not be fetched, see Gaps)
- The data includes lecturer names (measured: 119 distinct lecturer strings in א, 122 in ב) and rooms. — measured from the repo's data files

### Inferences
- Load is the real legal lever (§2 "disruption"): a 2–3 s spaced, nightly, ~84-request job is far from disruptive; documenting the rate limit in the README is good evidence of good faith.
- Terms of use: the owner should read Afeka's terms page by hand (it was not reachable here) for clauses on automated access or reuse, and note whether they cover the `yedionpub` subdomain at all. Even if doubtful legally, a clear "no automated access" clause would be a strong reason to ask Afeka first (see §6).
- Lecturer names: they appear in a professional, public-role context that Afeka itself publishes, and the tool uses them only for matching exams to groups and for display. Practical minimization: do not add anything not on the yedion (no ratings, photos, emails), do not build cross-year histories per lecturer, publish only current-year files, add a contact/removal line on the site, and consider whether the published JSON needs lecturer names at all (the solver needs them only for exam matching in `buildDataset`; the UI may show them; the decision is the owner's).
- Do not use the scraped data to train or feed AI systems; the PPA's April 2025 draft is aimed squarely at that use.
- This is a low-stakes, non-commercial setting, but none of the above is legal advice; uncertainty is real because the key Israeli sources could only be read as snippets.

### Gaps
- Could not read Afeka's terms of use text (egress blocked), so whether they forbid automated access or reuse is unknown.
- Could not extract Israeli case names/numbers on scraping or on "unauthorized access" (חדירה שלא כדין) from primary sources; computer-law.co.il and the practitioner article were blocked.
- Whether the PPA's April 2025 draft became final guidance by October 2026 was not established.

## 5. Robustness: detecting silent parse breakage and producing a change summary

### Takeaway
The current gates catch a partly blocked run (shrink checks) and gross failures (≥40 courses, physics 90903 with ≥3 primary groups), and golden-fixture parser tests exist. What is missing is field-level "parse health" checks (a change in HTML that silently empties one field, e.g. `minCredits` → 0, as HISTORY already notes) and a human-readable diff. Both are cheap to add because all needed data is already in memory.

### Cited Findings
- `validate()` errors: fewer than 40 courses; course 90903 missing or with fewer than 3 primary groups. Warnings only: offered course with 0 credits; unlinked sub-group; mandatory course without moed-1 exam (when exams are published). — [scripts/build.mjs](https://github.com/dolhack/lets_learn/blob/main/scripts/build.mjs)
- `compareToPrevious()` refuses writes if course count drops > 10%, offered-course count > 20%, or group count > 25% versus the existing file; `--force` overrides. — [scripts/build.mjs](https://github.com/dolhack/lets_learn/blob/main/scripts/build.mjs)
- `S_SHOW_PROGS` with zero courses throws (`list ${code} returned no courses`). — [scripts/scrape.mjs](https://github.com/dolhack/lets_learn/blob/main/scripts/scrape.mjs)
- Known deferred issue: silent parsing when page structure changes, e.g. `minCredits` becoming 0. — [docs/HISTORY.md §7](https://github.com/dolhack/lets_learn/blob/main/docs/HISTORY.md)
- Golden HTML fixtures exist (`prog-30001`, `groups-90903`, `groups-10336`, `details-90903`, `details-30120`, `exams-2026`, `exams-nodata`, `rejected`, `throttled`) and are used by `test/parse.test.mjs`. — [scripts/fixtures/](https://github.com/dolhack/lets_learn/tree/main/scripts/fixtures), [test/parse.test.mjs](https://github.com/dolhack/lets_learn/blob/main/test/parse.test.mjs)
- Parsers depend on specific Hebrew markers and layout: `'<div class="TextAlignRight">'` + `'קורס מסוג'` for groups; 6-column rows with HH:MM times for meetings; `'נקודות זכות'` for credits; a `.card` whose h2 contains `'תנאי קדם לנושא'` for prereqs; 11-column rows for exams; `'לפחות'` for minCredits. `parseDay` returns `null` for unknown day text. — [scripts/parse.mjs](https://github.com/dolhack/lets_learn/blob/main/scripts/parse.mjs)
- Measured baseline ratios usable as thresholds: 76/81 courses with credits > 0; 44/81 with prereqs; 90/394 and 110/355 groups full; ~205 primary groups per semester. — measured from repo data files

### Inferences
Recommended additional checks (errors unless noted), all computed on the in-memory dataset:
- Per-field health ratios against fixed floors and against the previous file: share of meetings with `day === null` must be 0; share of meetings with empty `room` < 10%; share of primary groups with empty `lecturer` < 20%; every list has `minCredits > 0` where the previous file had > 0; credits > 0 for ≥ 90% of offered courses; number of courses with prereqs within ±20% of previous (a parser break typically zeroes it). Also the existing warning "offered course with 0 credits" should become an error when it hits more than ~5 courses.
- "Page looked fine but parse found nothing": for S_LOOK_FOR_NOSE, if the HTML contains `קורס מסוג` but `parseGroups` returns 0 groups, or contains times `\d\d:\d\d` but no meetings parsed, raise an error. Same for S_EXAMS: if the HTML contains dates `dd/mm/20\d\d` but `parseExams` returns 0 rows, error (this is how a format change in the new exam table would show up).
- Raw HTML snapshot on failure: save the offending page to the workflow's artifacts (not to the repo) so a new golden fixture can be made quickly.
- Change-amount guard in both directions: besides shrink, flag unusual growth (e.g. > 30% more groups) and mass field changes (e.g. > 30% of meetings changed time/room in one day) as "needs review" (fail without write, or write to a PR branch instead of main).
- Human-readable change summary (diff of previous vs new per semester), used as the commit message body and optionally as a `changes.json` the UI shows ("What changed since yesterday"):
  - groups that became full / were reopened (`full` flipped), listed as course name + group id;
  - added / removed groups (by group id), and added / removed courses (offered flipped);
  - meeting changes per group: day/time/room changes, lecturer changes;
  - credits / prereq changes (weekly tier);
  - exams: "exam table published" and per-course moed date changes.
  Commit title like `data(afeka): 2027-1 +3 groups, 12 became full, 2 room changes`. A no-diff run makes no commit.
- Alerting: on failure, keep previous data (already the behavior) and surface the failure: GitHub Actions marks the run failed and emails the owner by default; optionally open/update a single GitHub issue "Scrape failing" with the error lines, and close it on the next success.

### Gaps
- No external source was consulted on schema-check tooling; the recommendations are engineering inferences from the repo's existing design.

## 6. Asking Afeka for a feed or permission; precedents at other Israeli institutions

### Takeaway
I found no evidence that any Israeli institution provides an official open course-data feed to student projects, or that CheeseFork-style projects obtained formal permission; they appear to fetch from public (or semi-public) endpoints and publish derived JSON, the Technion one via a daily GitHub Actions job. Asking Afeka is still worthwhile and cheap: a short email to the registrar/IT (Michlol is run in-house by the college's IT) asking for permission, preferred hours/rate, or a periodic export (CSV/JSON) of the public yedion data.

### Cited Findings
- Technion: `technion-sap-info-fetcher` queries the Technion SAP OData endpoint `https://portalex.technion.ac.il/sap/opu/odata/sap/Z_CM_EV_CDIR_DATA_SRV/$batch?sap-client=700`, runs daily via GitHub Actions, and publishes JSON on the repo's gh-pages branch; the README mentions no permission from the Technion. — [technion-sap-info-fetcher README](https://github.com/michael-maltsev/technion-sap-info-fetcher), [courses_to_json.py](https://raw.githubusercontent.com/michael-maltsev/technion-sap-info-fetcher/main/courses_to_json.py), [deploy.yml](https://raw.githubusercontent.com/michael-maltsev/technion-sap-info-fetcher/main/.github/workflows/deploy.yml)
- HUJI: `huji-cheesefork` reuses CheeseFork with Hebrew University data; its README says courses are saved locally and reused, with a "re-download all course data" option; no mention of permission or data source agreement in the README. — [yotamgod/huji-cheesefork](https://github.com/yotamgod/huji-cheesefork)
- Other Michlol-based public scrapers exist for MTA (`ranl/mta-course-scraper`, endpoints `Enter_Search`, `JSON` Action 700, `S_PROG`, `S_LOOK_FOR_NOSE`, `S_YPratem`) and Braude (`oshriagronov/braude-mcp`, `idoo25/braude-degree-planner` with `yedion-*-scraper.mjs` scripts and backfill JSON files); none of what I read mentions permission from the institution. — [mta-course-scraper](https://raw.githubusercontent.com/ranl/mta-course-scraper/master/mta_course_scraper/spiders/course_spider.py), [braude-mcp firefly.ts](https://raw.githubusercontent.com/oshriagronov/braude-mcp/main/src/scrapers/firefly.ts), GitHub code search for "S_LOOK_FOR_NOSE" (results list `idoo25/braude-degree-planner` files; repo content not fetched)
- Existing Afeka projects (ScheduleBuilder via AfekaNet login, now broken by 2FA; ChoiceFreak requires Google login for group data) show the public yedion is the only practical source. — [docs/research.md §7](https://github.com/dolhack/lets_learn/blob/main/docs/research.md)

### Inferences
- The MTA spider shows Michlol has a `PRGNAME=JSON` handler (`Action: 700`) at least at MTA. Michlol may expose other JSON actions; this is worth asking Afeka IT about rather than probing.
- Suggested ask (short, Hebrew, to the dean of students / registrar with IT in cc): what the tool is (free, open source, non-commercial, link), what it fetches (public yedion pages for program 30, list of endpoints), how (one run per night at ~2.5 s spacing, ~85–170 requests, identified UA with email), and the questions: is this OK; preferred hours; any registration-period blackout; would they offer a periodic export, or whitelist the UA from throttling. Offer to stop immediately on request. A "yes" removes most of the legal ambiguity in §4; a "please don't" is also valuable to know early.
- Even if Afeka offers nothing, a documented, polite request plus an identifying UA is the strongest good-faith posture.

### Gaps
- Could not determine how CheeseFork (Technion) or HUJI projects arranged access, if at all; no public statements of permission were found. TAU-specific projects were not found in this pass.
- Whether Afeka has an open-data policy or an API for Michlol is unknown.

## 7. Exam schedule: detecting publication and switching on `examsPublished`

### Takeaway
Detection is already built in and costs one request: `S_EXAMS` returns all semesters for program 30, and `buildDataset()` sets `examsPublished = semExams.length > 0` per semester. Keep the single S_EXAMS POST in every daily run (even off-season), add a "page has dates but parsed nothing" guard so a new table format cannot masquerade as "not published", and announce the flip in the change summary.

### Cited Findings
- The exam request is one POST: `PRGNAME: 'S_EXAMS', ARGUMENTS: 'R1C28,R1C29,R1C30', R1C28: program, R1C29: '0', R1C30: '0'`. — [scripts/scrape.mjs](https://github.com/dolhack/lets_learn/blob/main/scripts/scrape.mjs)
- `parseExams` keeps rows with exactly 11 columns and a 4–6 digit course id; dates must match `dd/mm/yyyy`; `examsPublished: semExams.length > 0`. — [scripts/parse.mjs](https://github.com/dolhack/lets_learn/blob/main/scripts/parse.mjs), [scripts/build.mjs](https://github.com/dolhack/lets_learn/blob/main/scripts/build.mjs)
- Both current data files have `examsPublished: false`; the תשפ"ז exam schedule is not yet published, and the "exam spread" preference is hidden until it is. — measured; [docs/ISSUES.md §13](https://github.com/dolhack/lets_learn/blob/main/docs/ISSUES.md)
- Fixtures for both states exist: `exams-2026.html` (previous year's table) and `exams-nodata.html`. — [scripts/fixtures/](https://github.com/dolhack/lets_learn/tree/main/scripts/fixtures)
- `validate()` warns (not errors) when exams are published but a mandatory offered course lacks a moed-1 exam. — [scripts/build.mjs](https://github.com/dolhack/lets_learn/blob/main/scripts/build.mjs)

### Inferences
- Check that `R1C29`/`R1C30` = `0` really means "all semesters / current year" for תשפ"ז after `ChangeYear`; the call depends on the session's selected year. Add an assertion that returned exam dates fall within the academic year being built (e.g. 2026-10 to 2027-10 for year 2027) so the job cannot publish last year's table as this year's.
- Publication guard: if the S_EXAMS HTML contains any `\d\d/\d\d/20\d\d` date but `parseExams` returns 0 rows, fail the run (format changed). If it returns rows for some semesters only, `examsPublished` flips per semester, which is correct.
- On the first run where a semester flips to `examsPublished: true`, mark it in the commit title ("exam table published for 2027-1"), keep the moed-1 coverage check as an error once coverage is clearly partial (e.g. > 30% of mandatory offered courses without moed 1), and add a fixture from the new table to tests (ISSUES §13 already asks for this).
- Exams change rarely after publication; once published, the daily S_EXAMS call is still cheap (1 request) and catches date changes.

### Gaps
- The publication date of the תשפ"ז exam schedule is unknown (Afeka site not reachable from here); historical publication timing was not researched.
