# Where and how to run the scheduled Afeka scraper (as of 1 Oct 2026)

Research notes for: scripts/scrape.mjs (Node 22, about 175 requests at 2 s spacing, about 6 min) in public repo dolhack/lets_learn, refreshing web/data/afeka/... automatically.

Source access notes: docs.github.com, simonwillison.net and yahoo.com were blocked by this environment's proxy. GitHub docs were read from their source markdown in the `github/docs` repo on raw.githubusercontent.com (main branch, fetched 2026-10-01). Those files are the same text docs.github.com renders, but some of them contain `{% ifversion %}` conditionals. The four student repos were shallow-cloned and read directly. yedionpub.afeka.ac.il was not contacted.

---

## 1. GitHub Actions scheduled workflows: semantics, limits, permissions

### Takeaway
GitHub Actions on `ubuntu-latest` is free for this public repo and has ample timeouts (6 h per job). Cron is POSIX and UTC by default, and an IANA `timezone:` field has been supported since March 2026. The minimum interval is 5 minutes. Scheduled runs are best-effort: they are documented to be delayed or dropped under load. Since a 2026-08-26 Actions incident, users report delays of 4 to 6 hours and missing runs, and the Technion SAP fetcher's commit times match that pattern. Don't rely on the exact time a run fires. A commit pushed with `GITHUB_TOKEN` does **not** trigger `push` workflows; only `workflow_dispatch`/`repository_dispatch` are exempt.

### Cited Findings
- Schedule syntax: "Use POSIX cron syntax… By default, scheduled workflows run in UTC. You can optionally specify a timezone using an IANA timezone string… The shortest interval you can run scheduled workflows is once every 5 minutes." Example: `- cron: '30 5 * * 1-5'` followed by `timezone: "America/New_York"`. — [github/docs reusable: actions-scheduled-workflow-example](https://raw.githubusercontent.com/github/docs/main/data/reusables/repositories/actions-scheduled-workflow-example.md)
- The timezone feature is enabled on github.com (`fpt: '*'`) and on GHES >= 3.22. — [github/docs feature flag actions-schedule-timezone](https://raw.githubusercontent.com/github/docs/main/data/features/actions-schedule-timezone.yml)
- Timezone support was announced on 2026-03-19. — [GitHub Changelog: Late March 2026 updates](https://github.blog/changelog/2026-03-19-github-actions-late-march-2026-updates/); [GHChangelog on X](https://x.com/GHchangelog/status/2034736688132432174)
- DST caveat: in a zone with DST, a schedule that falls in a skipped spring-forward hour moves to the next valid time (2:30 runs at 3:00). Israel observes DST, so avoid 02:00–03:00 local. — [github/docs reusable](https://raw.githubusercontent.com/github/docs/main/data/reusables/repositories/actions-scheduled-workflow-example.md)
- GitHub Actions does not support `@daily`/`@hourly` and the other non-standard macros. — [github/docs events-that-trigger-workflows source](https://raw.githubusercontent.com/github/docs/main/content/actions/reference/workflows-and-actions/events-that-trigger-workflows.md)
- Delays and drops (official): "The `schedule` event can be delayed during periods of high loads… High load times include the start of every hour. If the load is sufficiently high enough, some queued jobs may be dropped. To decrease the chance of delay, schedule your workflow to run at a different time of the hour." — [github/docs reusable schedule-delay](https://raw.githubusercontent.com/github/docs/main/data/reusables/actions/schedule-delay.md)
- Scheduled workflows run only on the default branch, use the latest commit there, and the workflow file must exist on the default branch. — [events-that-trigger-workflows source](https://raw.githubusercontent.com/github/docs/main/content/actions/reference/workflows-and-actions/events-that-trigger-workflows.md); [branch-requirement reusable](https://raw.githubusercontent.com/github/docs/main/data/reusables/actions/branch-requirement.md)
- Current reliability problem (2026): community discussion #207346, "Scheduled (cron) workflow runs dropped and delayed by hours since 2026-08-26". Users report about 40 min delays before 26 Aug, then 4 to 6 h delays (e.g. "Sep 08 11:58 (slot 07:00, +4h58)") and only 0–2 of 3 daily runs firing. `created_at == run_started_at`, meaning the run is *created* late rather than waiting in a queue for a runner. As of late Sept 2026 the thread had no GitHub staff answer and the issue was unresolved. Suggested workaround: an external cron (cron-job.org) calling the `workflow_dispatch` REST API. — [GitHub community discussion #207346](https://github.com/orgs/community/discussions/207346)
- Other reports of scheduled runs never or rarely firing while `workflow_dispatch` works: [#206028](https://github.com/orgs/community/discussions/206028), [#202034](https://github.com/orgs/community/discussions/202034), [#156282](https://github.com/orgs/community/discussions/156282). A third-party blog notes delays growing from under 2 h to 4 h+ during 2026. This is a vendor blog selling cron monitoring, so treat it as weak corroboration. — [cronguard blog](https://www.cronguard.app/blog/github-actions-scheduled-workflows-run-late)
- Independent evidence: the technion-sap-info-fetcher workflow is `cron: '0 8 * * *'` (08:00 UTC), but its gh-pages bot commits in September 2026 land between 12:22 and 14:04 UTC (e.g. 2026-09-25 13:20, 09-24 13:17, 09-08 12:42, 09-07 14:04). That is 4 to 6 h after the slot, and the job's own `timeout-minutes: 120` caps the run itself at 2 h. — repo clone of [michael-maltsev/technion-sap-info-fetcher](https://github.com/michael-maltsev/technion-sap-info-fetcher) (`.github/workflows/deploy.yml` and `git log origin/gh-pages`)
- 60-day rule: "In a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days." Re-enable from the Actions tab. A commit by a user with write access that changes the `cron` line also reactivates the workflow. — [events-that-trigger-workflows source](https://raw.githubusercontent.com/github/docs/main/content/actions/reference/workflows-and-actions/events-that-trigger-workflows.md)
- What counts as "activity": the official docs don't define it. Community and marketplace keepalive tools say commits reset the timer, while releases (and, per one source, tags, issues and PR merges) do not. Several orgs keep schedules alive with a once-a-day `github-actions[bot]` commit, i.e. they treat bot commits as counting. — [Keepalive Workflow (Marketplace)](https://github.com/marketplace/actions/keepalive-workflow); [efrecon/gh-action-keepalive](https://github.com/efrecon/gh-action-keepalive); [r-observatory/vcs-signals PR #46](https://github.com/r-observatory/vcs-signals/pull/46); [cronuru guide](https://cronuru.com/guides/github-actions-scheduled-workflows)
- Minutes and billing: "GitHub Actions usage is **free** for **self-hosted runners** and for **public repositories** that use standard GitHub-hosted runners." Larger runners are always billed. — [github/docs billing source](https://raw.githubusercontent.com/github/docs/main/content/billing/concepts/product-billing/github-actions.md)
- Timeouts: GitHub-hosted job execution time is 6 hours per job, and a workflow run (including waiting and approval) is limited to 35 days. Self-hosted jobs can run up to 5 days and a self-hosted job can sit in the queue for 24 h. — [github/docs limits source](https://raw.githubusercontent.com/github/docs/main/content/actions/reference/limits.md)
- Concurrency: `concurrency:` groups are supported. With `queue: max`, up to 100 runs can be queued per group. — [limits source](https://raw.githubusercontent.com/github/docs/main/content/actions/reference/limits.md). The Technion fetcher uses `concurrency: generate-courses` to serialize runs, and shmoosefork's Pages deploy uses `group: "pages"`, `cancel-in-progress: false`. — repo clones (see section 5)
- GITHUB_TOKEN-triggered events: "events triggered by the `GITHUB_TOKEN` will not create a new workflow run, with the following exceptions: `workflow_dispatch` and `repository_dispatch` events always create workflow runs" (plus PR opened/synchronize/reopened, which create approval-required runs). "If a workflow run pushes code using the repository's `GITHUB_TOKEN`, a new workflow will not run even when the repository contains a workflow configured to run when `push` events occur." — [github/docs reusable actions-do-not-trigger-workflows](https://raw.githubusercontent.com/github/docs/main/data/reusables/actions/actions-do-not-trigger-workflows.md)
- `workflow_dispatch`: allows manual runs from the Actions tab or REST API, and it is always created even when the GITHUB_TOKEN triggers it (see above). Both Technion workflows include `workflow_dispatch:`. — [same reusable](https://raw.githubusercontent.com/github/docs/main/data/reusables/actions/actions-do-not-trigger-workflows.md); repo clones
- Multiple schedules per workflow are allowed, and `github.event.schedule` tells you which cron string fired. This supports "daily in registration, weekly otherwise" in one file. — [actions-scheduled-workflow-example reusable](https://raw.githubusercontent.com/github/docs/main/data/reusables/repositories/actions-scheduled-workflow-example.md)

### Inferences
- **Pages deploy trap**: if lets_learn deploys Pages with an Actions workflow `on: push` (like shmoosefork's `static.yml`), a data commit pushed by the scrape job with `GITHUB_TOKEN` will **not** redeploy the site. Options:
  - (a) Run the Pages deploy steps (`upload-pages-artifact` plus `deploy-pages`) as a second job in the scrape workflow.
  - (b) Have the scrape job call `gh workflow run pages.yml`, which is allowed because it is `workflow_dispatch`.
  - (c) Make the deploy workflow `on: workflow_run` of the scrape workflow.
  - (d) Use "Deploy from a branch" Pages mode. Whether a GITHUB_TOKEN push triggers the legacy branch build was not verified; see Gaps.
- Use a minute that isn't :00 or :30 and run the job well before the time data must be fresh. Given 4–6 h delays in Aug–Sep 2026, an Israeli-morning refresh should be scheduled around 01:17–03:17 UTC, or skip-guarded twice-daily runs should be used. For must-run precision, an external trigger (cron-job.org → `POST /repos/{owner}/{repo}/actions/workflows/{id}/dispatches` with a fine-grained PAT that can only run Actions) avoids the scheduler entirely.
- Daily bot data commits during registration will keep the 60-day timer reset. Off-season, if data doesn't change for 60 days and there are no human commits, the schedule can be disabled. So either commit a `last-checked` timestamp file at least monthly, or accept re-enabling by hand.
- Permissions: the workflow needs `permissions: contents: write` (plus `pages: write` and `id-token: write` if it deploys Pages in the same run). The default GITHUB_TOKEN permission for new repos is read-only. This comes from general knowledge and was not re-verified in this session.

### Gaps
- Whether a `git push` made with GITHUB_TOKEN to a branch used by the legacy "Deploy from a branch" Pages source triggers the `pages-build-deployment` run: no primary source read. The Technion fetcher relies on pushing to `gh-pages` with the default token and its data branch is updated daily, but I could not confirm that the Pages site itself rebuilds.
- The official docs do not define "repository activity" for the 60-day rule. The evidence that bot commits count is community and marketplace practice only.
- Whether GitHub fixed the post-2026-08-26 scheduler degradation: not found (no githubstatus.com check was possible).

---

## 2. The "git scraping" pattern: best practices and pitfalls

### Takeaway
Git scraping means fetching the data, writing it to files in the repo, and committing only if `git` sees a change. The repo history then becomes the change log. Simon Willison's canonical workflow is about 20 lines of YAML, and the Technion fetcher uses the same "commit only if diff" idiom. For lets_learn the existing validation and shrink-check should run *before* `git add`, so a failed or blocked run leaves the files untouched and nothing is committed.

### Cited Findings
- Canonical workflow (simonw/ca-fires-history): triggers `push`, `workflow_dispatch`, `schedule: cron '6,26,46 * * * *'`. Note the minutes chosen away from :00. Steps: checkout → `curl … | jq > file.json` → `git add -A; timestamp=$(date -u); git commit -m "Latest data: ${timestamp}" || exit 0; git push`. Committer is set to `"Automated"` / `actions@users.noreply.github.com`. — [simonw/ca-fires-history scrape.yml](https://raw.githubusercontent.com/simonw/ca-fires-history/main/.github/workflows/scrape.yml)
- The Technion variant: `git add .` then `git diff-index --quiet --cached HEAD || git commit -m "Update courses"` then `git push`, committing as `github-actions[bot]` / `github-actions[bot]@users.noreply.github.com`. Data goes to a separate `gh-pages` branch checked out into a second directory, which keeps data churn out of `main`. — [technion-sap-info-fetcher deploy.yml](https://github.com/michael-maltsev/technion-sap-info-fetcher/blob/main/.github/workflows/deploy.yml)
- Simon Willison's original write-up (simonwillison.net/2020/Oct/9/git-scraping/) could not be fetched here (proxy-blocked). Its content is reflected in the workflow above.

### Inferences
- Best practices for this project:
  1. Write JSON deterministically: stable key order, sorted arrays, no "scraped_at" timestamp inside the data files. Otherwise every run produces a diff and a commit. Put the timestamp in a separate tiny `meta.json` / `last-checked` file only if you want a heartbeat commit.
  2. Pretty-print JSON (one record per line or indented) so `git diff` and commit history are readable and the repo stays small through delta compression.
  3. Put a summary in the commit message, e.g. "afeka 2027-1: +3 courses, 12 changed groups", computed by the script.
  4. Validation and shrink-safety run before write. Non-zero exit means no write and a red run.
  5. Add `git pull --rebase` before `push` (or use a `concurrency` group) so a human push between checkout and push doesn't make the job fail.
  6. Use `fetch-depth: 1` checkout for speed.
- Pitfalls:
  - History bloat if files are large and change daily. Probably minor here: a few JSON files of tens to hundreds of KB.
  - A noisy history in `main` mixes with code commits. Mitigate with a dedicated data branch or path-filtered views.
  - The Pages redeploy trap from section 1.
  - Silent "no change" runs hide failures if the script exits 0 on a blocked page. Make WAF and throttle pages exit non-zero.

### Gaps
- No primary-source text from simonwillison.net (blocked).

---

## 3. Runner IP risk: will Afeka's WAF block GitHub/Azure IPs?

### Takeaway
There is no direct evidence either way for yedionpub.afeka.ac.il. The two closest Israeli academic precedents both point to real risk. The Technion SAP fetcher, which runs on GitHub-hosted runners against an Israeli university system, added proxy support in March 2026 that routes requests through a proxy URL kept in a secret, then disabled it in April 2026, and it still runs daily from GitHub now. The older Technion UG fetcher has proxy secrets wired in and its schedule was turned off in June 2025. Israel also has a precedent of curbing foreign traffic to government sites during cyber threats. Treat datacenter or foreign-IP blocking as plausible and build a probe-plus-fallback design rather than assuming either outcome.

### Cited Findings
- technion-sap-info-fetcher commit history:
  - 2026-03-06 "Add proxy support"
  - 2026-03-07 "Revert…", then "Use proxy from env vars" (`HTTP_PROXY`/`HTTPS_PROXY` secrets)
  - 2026-03-07 "Fetch proxy server from a URL": a secret `PROXY_SERVER_URL` is curl'ed at run time and the result masked with `::add-mask::`
  - 2026-04-20 "Disable PROXY_SERVER_URL for now" (env block commented out)
  - Daily `github-actions[bot]` "Update courses" commits continue through 2026-09-25, i.e. direct access from GitHub-hosted runners currently works for Technion SAP.

  The commit messages do not state *why* a proxy was needed (blocking, rate limits, or geo). — [repo clone](https://github.com/michael-maltsev/technion-sap-info-fetcher/commits/main)
- technion-ug-info-fetcher passes secrets `COURSE_INFO_FETCHER_PROXY`, `COURSE_INFO_FETCHER_PROXY_URL` and `COURSE_INFO_FETCHER_PROXY_AUTH` into the job. The PHP code supports both a normal HTTP proxy and a custom relay that takes `Proxy-Auth` and `Proxy-Target-URL` headers, i.e. a self-hosted forwarding endpoint. The job also needs a `MOODLE_SESSIONSTUDENTSPROD` cookie secret. The schedule was commented out on 2025-06-12 ("Turn off scheduled course updates"). — [technion-ug-info-fetcher deploy.yml & course_info_fetcher.php](https://github.com/michael-maltsev/technion-ug-info-fetcher)
- Israel curbed foreign traffic to government websites over cyberattack fears, including refusing electronic payment from abroad (headline via search snippet; full article not fetchable here). — [Yahoo/Times of Israel: "Fearing cyberattack, Israel curbs gov't websites' foreign traffic"](https://www.yahoo.com/news/fearing-cyberattack-israel-curbs-govt-182905932.html)
- Israeli universities were among targets of 2023 DDoS and hacktivist campaigns, and gov.il was unreachable worldwide on 2023-10-08 (Killnet claim). — [CYFIRMA](https://www.cyfirma.com/research/israel-gaza-conflict-the-cyber-perspective/); [Fortune 2023-10-09](https://fortune.com/2023/10/09/cyberattacks-israel-hamas-attack-russia-palestineddos)
- General anti-bot practice: vendors keep reputation lists of datacenter ranges (AWS, GCP, Azure, DigitalOcean), and datacenter IPs are flagged by default on many high-security sites. These are scraping-vendor sources with a commercial interest. — [ScrapingBee](https://www.scrapingbee.com/blog/datacenter-proxies/); [Decodo 2026 guide](https://decodo.com/blog/web-scraping-without-getting-blocked)
- The Technion UG workflow also had to install the Technion intermediate certificate on the runner (`openssl s_client … > technion.crt; update-ca-certificates`). Israeli academic servers can have incomplete TLS chains, which fail on Linux runners but not on Windows, which fetches missing intermediates itself. — [technion-ug deploy.yml](https://github.com/michael-maltsev/technion-ug-info-fetcher/blob/main/.github/workflows/deploy.yml)

### Inferences
- Afeka-specific risk factors:
  - The F5 "Request Rejected" page is ASM/Advanced WAF policy output. It triggers on signatures, rate and bot-defense, and can include geolocation or IP-intelligence (datacenter/cloud category) rules if the admin enabled them. Whether Afeka enabled those is unknown.
  - The Hebrew per-minute and per-hour throttle is application-level and keyed by IP. GitHub runners get a fresh Azure IP each run, which helps against per-hour IP throttles but not against a datacenter ASN block.
  - 175 requests in 6 minutes is about 29/min. If the per-minute limit is under that, it applies equally from home.
- Detection design (recommended):
  1. A cheap **probe step** first: fetch one catalog page, check for `<title>Request Rejected</title>`, the Hebrew throttle phrase and the expected markup, and exit with a distinctive code (e.g. 78) and a `::error::` annotation such as "WAF blocked from runner IP x.x.x.x / AS8075".
  2. The scraper itself should abort on the first block page (not retry 175 times). Never write files on a partial run.
  3. Log `curl -s https://api.ipify.org` and the response status so blocks are diagnosable.
  4. Run a one-off `workflow_dispatch` probe before committing to the design. It answers the question in about 1 minute without risking a ban (one request).
- Fallback design if blocked:
  - (a) A self-hosted runner at home, label-gated (section 4).
  - (b) Keep the owner's Windows Task Scheduler job as the primary scraper, and have Actions only deploy and alert.
  - (c) An Israeli-region cloud VM or function (section 4).
  - (d) The Technion-style relay (`Proxy-Target-URL` header) on an Israeli host.

  Residential proxy services are not free and raise ToS questions.

### Gaps
- No public report found of Afeka (or Michlol/fireflyweb sites generally) blocking cloud or foreign IPs. Search found nothing specific to Israeli universities' WAF geo-policies.
- Why Technion added and then dropped the proxy is not documented in the repo.
- Exact GitHub-hosted runner geography and IP ranges (Azure, `api.github.com/meta` "actions" list) were not re-verified here (api.github.com was proxy-restricted for these repos).

---

## 4. Alternatives if datacenter IPs are blocked

### Takeaway
Ranked for a free student project:
1. GitHub-hosted runner, if the probe passes.
2. The owner's Windows PC running Windows Task Scheduler and `git push`. It has the least attack surface and already works, but only runs while the PC is on.
3. A self-hosted runner on the home PC. It works, but GitHub explicitly warns against self-hosted runners on public repos, so it needs strict lockdown.
4. An Oracle Cloud Always Free VM with home region Jerusalem (il-jerusalem-1), which is truly free and Israeli but has account and capacity friction.
5. AWS Lambda in il-central-1. Its always-free tier covers this easily and the 15-min timeout fits 6 min, but it needs a scheduler plus GitHub-API commit plumbing.

Cloudflare Workers free does **not** fit: 50 external subrequests per invocation versus 175 needed, and 10 ms CPU. GCP's free e2-micro is US-only.

### Cited Findings
**Self-hosted runner on a public repo**
- "We recommend that you only use self-hosted runners with private repositories. This is because forks of your public repository can potentially run dangerous code on your self-hosted runner machine by creating a pull request that executes the code in a workflow." — [github/docs reusable self-hosted-runner-security](https://raw.githubusercontent.com/github/docs/main/data/reusables/actions/self-hosted-runner-security.md)
- "self-hosted runners should almost never be used for public repositories… because any user can open pull requests against the repository and compromise the environment." Runners "can be persistently compromised by untrusted code". Consider what secrets and keys sit on the machine. JIT/ephemeral runners exist but "there is no way to guarantee that a self-hosted runner only runs one job". — [github/docs secure-use source](https://raw.githubusercontent.com/github/docs/main/content/actions/reference/security/secure-use.md)
- Fork PR approval: by default all first-time contributors need approval before workflows run. But "If you are using self-hosted runners, potentially malicious user-controlled workflow code will execute automatically if the user is allowed to bypass approval… or if the pull request is approved." `pull_request_target` runs "will always run, regardless of approval settings". Unapproved runs expire after 30 days. — [github/docs approve-runs-from-forks source](https://raw.githubusercontent.com/github/docs/main/content/actions/how-tos/manage-workflow-runs/approve-runs-from-forks.md)
- Self-hosted usage is free, the job limit is 5 days, and queue time is 24 h. If the PC is off, a queued scheduled job is cancelled after 24 h. — [billing source](https://raw.githubusercontent.com/github/docs/main/content/billing/concepts/product-billing/github-actions.md); [limits source](https://raw.githubusercontent.com/github/docs/main/content/actions/reference/limits.md)

**Cloudflare Workers (Cron Triggers)**
- Free plan: CPU time 10 ms per invocation, 50 subrequests per request, 6 simultaneous outgoing connections, 5 Cron Triggers per account, 100,000 requests/day. Cron Trigger wall-clock duration limit is 15 min. — [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- 2026-02-11 change: paid Workers default to 10,000 subrequests (raisable to 10M), but "Workers on the free plan remain limited to 50 external subrequests… per invocation". — [Cloudflare changelog 2026-02-11](https://developers.cloudflare.com/changelog/post/2026-02-11-subrequests-limit/)
- Paid ($5/month Standard): up to 15 min CPU per Cron Trigger invocation, 30M CPU-ms included. — [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

**AWS**
- Lambda always-free: 1M requests plus 400,000 GB-seconds per month, never expires, same in all regions. Lambda is available in il-central-1 (Tel Aviv). This is a secondary aggregator source. — [srvrlss.io](https://www.srvrlss.io/provider/amazon-lambda/); [AWS Lambda pricing](https://aws.amazon.com/lambda/pricing/); [AWS Tel Aviv region launch](https://aws.amazon.com/blogs/aws/now-open-aws-israel-tel-aviv-region)
- An AWS re:Post thread reports service quotas for il-central-1 being unavailable on some accounts. il-central-1 is an opt-in region. — [AWS re:Post](https://repost.aws/questions/QUg1AEfthWT5agpurq-kiwmg/tel-aviv-region-il-central-1-service-quota-not-available)

**Oracle Cloud**
- Always Free resources exist only in the tenancy's **home region** "for the life of the account". The Israel Central (Jerusalem) region is `il-jerusalem-1` with one availability domain. — [Oracle Always Free Resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/resourceref.htm); [Oracle release note: New Region in Jerusalem](https://docs.oracle.com/iaas/releasenotes/changes/42075bb1-29a3-4ae2-96a1-588001665b3e/index.htm)
- Reported 2026 cut: Always-Free Ampere A1 limits reduced to 2 OCPU / 12 GB, with instances above the new limit terminated on or after 2026-08-18. This is a secondary source; not confirmed on Oracle's page in this session. — [search snippet aggregating Oracle emails, via fullmetalbrackets / LowEndSpirit results](https://fullmetalbrackets.com/blog/oci-free-tier-breakdown)

**Google Cloud**
- The free e2-micro VM applies only in us-west1, us-central1 and us-east1. — [DEV: GCP free tier guide](https://dev.to/jeaniscoding/how-to-host-your-side-projects-for-0-the-ultimate-gcp-free-tier-guide-3p07); [aatayyab 2026-06 summary](https://aatayyab.wordpress.com/2026/06/26/google-cloud-free-tier-services-and-limits/)
- Cloud Run lists me-west1 (Tel Aviv) as Tier 1 pricing. — [Cloud Run locations](https://docs.cloud.google.com/run/docs/locations)

### Inferences
- **Windows Task Scheduler and git push** (owner's PC):
  - Zero new attack surface and the same IP that works today.
  - Use `git pull --rebase && node scripts/scrape.mjs && git add web/data && git diff --cached --quiet || (git commit -m ... && git push)`.
  - Set "Run whether user is logged on or not" and "Run task as soon as possible after a scheduled start is missed" so a laptop that was off catches up.
  - Credentials: a fine-grained PAT scoped to this repo only with `contents: write`, stored in Git Credential Manager.
  - The push (human identity) triggers `on: push` Pages workflows normally, unlike GITHUB_TOKEN.
  - Downsides: depends on the PC being on, and failures are invisible unless the script itself notifies, e.g. by opening a GitHub issue through the PAT or via a healthchecks.io-style ping.
- **Self-hosted runner lockdown** if chosen:
  - Repo Settings → Actions → "Require approval for all external contributors".
  - Never use `pull_request`/`pull_request_target` workflows that target the self-hosted label. Put the scrape job only in a workflow triggered by `schedule` + `workflow_dispatch`, with `if: github.repository == 'dolhack/lets_learn' && github.event_name != 'pull_request'`.
  - Run the runner service as a low-privilege local user, not the owner's account, with no SSH keys or browser profiles accessible.
  - Use a custom label (`runs-on: [self-hosted, afeka-home]`) so no other workflow lands there by accident.
  - Turn off the runner outside registration periods.

  Residual risk remains: any workflow file change merged to `main` runs on the PC.
- **Cloudflare Workers free**: 175 sequential requests exceed the 50-subrequest cap. It would need chaining (one cron invocation per 40 pages, state in KV) or the $5 paid plan. It also can't run git, so the commit would go through the GitHub Contents API. Egress is from Cloudflare's network (not Israeli residential), so it adds complexity without solving the IP-reputation question. Not recommended.
- **Israeli-region cloud**: AWS Lambda (Node 22 runtime, 15-min max, EventBridge Scheduler) in il-central-1 fits the 6-min job within always-free limits. Oracle's Jerusalem Always Free VM can run cron and git exactly like the home PC. Both give Israeli datacenter IPs. That beats US Azure if the WAF geo-blocks, but would not help if it blocks datacenter or cloud ASNs generally. Both require a credit card at signup.
- GCP me-west1 has no always-free VM. Cloud Run Jobs free-tier eligibility in me-west1 was not confirmed (see Gaps).

### Gaps
- Cloud Run free-tier allowances for Jobs in me-west1, and Azure Israel Central free-tier specifics, were not verified.
- Cloudflare Workers egress IP behavior (whether F5 or Afeka treats Cloudflare egress as bot traffic) was not documented.
- The current AWS new-account free plan (credit-based since mid-2025) and whether opt-in il-central-1 is usable under it: not verified.

---

## 5. Failure handling and alerting

### Takeaway
By default, failure emails for a scheduled workflow go to the user who created the workflow, or who last edited its cron line or re-enabled it. That is fine for a solo owner, but only if their notification settings include Actions. Add an explicit "open or update an issue on failure" step, a status badge, and, because the scheduler itself can silently skip runs, a staleness check: something that alerts when data is older than N days, not just when a run fails.

### Cited Findings
- "Notifications for scheduled workflows are sent to the user who initially created the workflow. If a different user updates the cron syntax… subsequent notifications will be sent to that user instead. If a scheduled workflow is disabled and then re-enabled, notifications will be sent to the user who re-enabled the workflow." Users can choose to be notified only on failure. — [github/docs notifications-for-workflow-runs source](https://raw.githubusercontent.com/github/docs/main/content/actions/concepts/workflows-and-actions/notifications-for-workflow-runs.md)
- Dropped scheduled runs produce **no** run at all, so there is no failure email. The workaround discussed is an external cron calling `workflow_dispatch`. — [community discussion #207346](https://github.com/orgs/community/discussions/207346)

### Inferences
- Recommended pattern:
  1. The scrape script exits non-zero on WAF, throttle or validation failure and writes nothing, so the previous data stays live automatically.
  2. A final step `if: failure()` uses `gh issue create`/`gh issue comment` (needs `permissions: issues: write`) to open a single "Scheduled scrape failing" issue, or comment on the existing open one. A success step closes it. This gives a visible, deduplicated alert that also reaches watchers.
  3. Put a README badge on the workflow (`/actions/workflows/scrape.yml/badge.svg`).
  4. The site shows "data updated at …" from a `meta.json` the scraper writes on success, so users and the owner see staleness.
  5. Optionally, a dead-man's switch: a free healthchecks.io-type ping on success that emails when no ping arrives in 36 h. This catches dropped schedules.

  Items 2 and 5 are standard practice but were not sourced in this session.

### Gaps
- No primary source fetched for issue-on-failure actions or badge URL syntax (not needed for the decision, but unverified here).

---

## 6. How the comparable Israeli student projects do it

### Takeaway
Only the Technion projects use scheduled GitHub Actions. They run daily on `ubuntu-latest`, commit as `github-actions[bot]` with the default GITHUB_TOKEN to a separate `gh-pages` data branch, and commit only on change. The SAP one currently runs daily at 08:00 UTC, in practice about 12:30–14:00 UTC, and has a dormant proxy escape hatch. The UG one is now manual-only. huji-cheesefork and shmoosefork do **not** scrape on a schedule: the former is a desktop app built by CI, and the latter commits hand-run "Scrape" results and deploys Pages on push.

### Cited Findings
- **technion-sap-info-fetcher** (`deploy.yml`):
  - Triggers: `on: workflow_dispatch, push (main), schedule '0 8 * * *'`, with `concurrency: generate-courses`.
  - Job: `runs-on: ubuntu-latest`, `timeout-minutes: 120`. Checks out `main` and `gh-pages` into separate paths, then Python 3 with `requests tqdm`, then `courses_to_json.py last-3 ...` writing into `./gh-pages/`.
  - Deploy step: `git config user github-actions[bot]`, `git add .`, `git diff-index --quiet --cached HEAD || git commit -m "Update courses"`, `git push`.
  - No `permissions:` block is present, so it relies on the repo's default token permission being write.
  - Proxy hooks: `PROXY_SERVER_URL` secret, disabled 2026-04-20.
  - gh-pages bot commits run almost daily through 2026-09-25, with gaps on some days (no change, or skipped runs).
  - Last code commit on main: 2026-08-19.

  — [repo](https://github.com/michael-maltsev/technion-sap-info-fetcher)
- **technion-ug-info-fetcher**:
  - Same structure (PHP 8.3, actions/checkout@v4). Schedule `0 9 * * *` and `push` triggers are commented out (commit 2025-06-12 "Turn off scheduled course updates"); it is now `workflow_dispatch` only.
  - An earlier commit (2024-08-08) moved it to run after the SAP fetcher.
  - Uses secrets for a Moodle session cookie and proxy/relay. Installs the Technion intermediate certificate on the runner.
  - The README notes that Technion moved to SAP from Winter 2024-25.

  — [repo](https://github.com/michael-maltsev/technion-ug-info-fetcher)
- **yotamgod/huji-cheesefork** (`main.yml`): `on: push/pull_request (main), workflow_dispatch`, `runs-on: windows-latest`, builds a PyInstaller desktop app and uploads it as an artifact. No schedule and no data commit. It uses a semaphore to limit concurrent downloads ("digmi fails" otherwise). Last commit 2022-09-06, so it is stale. — [repo](https://github.com/yotamgod/huji-cheesefork)
- **szaionz/shmoosefork** (`static.yml`, Hebrew University):
  - Standard "Deploy static content to Pages" on `push` to main plus `workflow_dispatch`, deploying the `deploy/` folder.
  - Permissions `contents: read, pages: write, id-token: write`, with `concurrency: group "pages", cancel-in-progress: false`.
  - Scraping is done by hand: commits titled "Scrape" or "Fresh scrape" by the author, last in 2024-08.

  — [repo](https://github.com/szaionz/shmoosefork)

### Inferences
- The proven Israeli-academic pattern is: GitHub-hosted Ubuntu, daily cron, data branch, diff-guarded bot commit, plus a secret-gated proxy fallback that can be switched on without code changes. lets_learn can copy it almost verbatim and swap Python for `actions/setup-node` with Node 22 and `npm ci`.
- shmoosefork shows exactly the hand-run model lets_learn has today. Its Pages-on-push workflow is the kind that a GITHUB_TOKEN data commit would *not* trigger (section 1).

### Gaps
- Run-level data (actual start times, skipped or failed scheduled runs) for these repos could not be read because the Actions API was restricted for them in this environment. Commit timestamps are the only proxy.

---

## Recommended pattern (synthesis for the report writer)

1. **Probe first.** Add a `workflow_dispatch` probe workflow that fetches one Afeka page from a GitHub runner and reports OK, Rejected or Throttled plus the runner IP. That single request decides the architecture.
2. **If the probe is OK**, use one workflow, `scrape.yml`:
   - Triggers: `schedule` with `timezone: "Asia/Jerusalem"`, at an off-minute time such as `'17 4 * * *'` during registration, and a weekly entry for the off-season. Also `workflow_dispatch`.
   - `concurrency: scrape`, `permissions: contents: write` (plus `pages`/`id-token` or `actions: write` as needed), and `timeout-minutes: 30`.
   - Steps: setup-node 22, `npm ci`, then `node scripts/scrape.mjs`, which validates and shrink-checks and exits non-zero without writing. Then a diff-guarded commit with a summary message.
   - Redeploy Pages explicitly in the same workflow, because a GITHUB_TOKEN push won't trigger it. Open or update an issue on failure.
   - Keep the registration-period on/off switch either as two cron lines plus a `github.event.schedule` check, or as a repo variable the job reads.
3. **Because the GitHub scheduler is unreliable in Aug–Sep 2026**, schedule early, accept a few hours of drift, and add a staleness signal on the site. For guaranteed timing during registration, trigger `workflow_dispatch` from an external cron with a minimal fine-grained PAT.
4. **If the probe is Rejected**, the fallback order is:
   - (a) Windows Task Scheduler on the owner's PC running the existing script, then `git push` with a fine-grained PAT. That push triggers Pages normally.
   - (b) A locked-down self-hosted runner on the same PC, only for `schedule`/`workflow_dispatch` workflows.
   - (c) An Israeli-region free host (Oracle Jerusalem Always Free VM, or AWS Lambda in il-central-1), only if the PC route is too unreliable.

   Keep the Technion-style secret-gated proxy hook so the hosted runner can later go through an Israeli relay.
