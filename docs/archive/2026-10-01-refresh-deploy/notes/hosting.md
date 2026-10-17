# Free static hosting for lets_learn (web/), as of October 2026

Research method note: docs.github.com, vercel.com, netlify.com, cdnplanet.com and all *.github.io / *.pages.dev hosts were blocked by this session's egress proxy. Primary-source text for GitHub and Cloudflare was read from the docs' own source repos on GitHub (`github/docs`, `cloudflare/cloudflare-docs`, `main`/`production` branches, fetched 2026-10-01). Those are the same Markdown files that render on docs.github.com and developers.cloudflare.com, and the links below point to the rendered pages. Netlify and Vercel figures come from search-result snippets of their docs plus third-party 2026 summaries, so treat them as lower confidence. Live response headers could not be probed.

Measured payload of `web/` today: 14 files, 551,647 bytes raw, **88,665 bytes if each file is gzip -9'd** (both JSONs included). Fonts are extra. The current Google Fonts usage is Rubik 400/500/600 (index.html) and Suez One (via `@import` in map.css).

---

## 1. GitHub Pages: subfolder publishing, limits, caching, and triggering from a scheduled job

### Takeaway
GitHub Pages with the "GitHub Actions" source can publish only `web/` by passing `path: web` to `actions/upload-pages-artifact`. Its limits (1 GB site, 100 GB/month soft bandwidth) far exceed this app's needs. The catch is caching: `Cache-Control: max-age=600` is fixed and you can't add custom headers. A data refresh that commits with `GITHUB_TOKEN` will **not** trigger a push-based Pages workflow, so the refresh workflow should deploy Pages itself, in the same run.

### Cited Findings
- Usage limits: published sites "may be no larger than 1 GB"; deployments "timeout if they take longer than 10 minutes"; "soft bandwidth limit of 100 GB per month"; "soft limit of 10 builds per hour. **This limit does not apply if you build and publish your site with a custom GitHub Actions workflow**"; rate limiting may return HTTP 429. If quotas are exceeded GitHub may stop serving the site or email suggesting a CDN — [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- Usage policy: Pages "is not intended for or allowed to be used as a free web-hosting service to run your online business, e-commerce site, or … commercial software as a service (SaaS)". A free student tool is fine under this — [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- Educational-copy clause: a copy of an existing website made as a learning exercise must "include a prominent disclaimer on the site indicating that the project is not associated with the original". This is relevant to Afeka naming (see §6) — [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)
- Custom workflow pattern: `actions/configure-pages@v5`, `actions/upload-pages-artifact@v4`, `actions/deploy-pages@v4`. The deploy job needs `pages: write` and `id-token: write`, plus `environment: name: github-pages`. A "single deploy job no building" variant is documented for sites without a build step — [Using custom workflows with GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- `upload-pages-artifact` inputs: `path` (required, default `_site/`), `retention-days` (default 1), `include-hidden-files` (default false; dotfiles are excluded unless set). The tar must contain no symlinks or hard links. The official supported maximum is 1 GB, with an unofficial absolute cap of 10 GB — [actions/upload-pages-artifact README](https://github.com/actions/upload-pages-artifact)
- Branch vs Actions source: with the Actions source, "GitHub Pages does not associate a specific workflow to the GitHub Pages settings". Templates use the `github-pages` environment, and GitHub recommends a protection rule so only the default branch can deploy. A `CNAME` file does **not** set the custom domain when using Actions; it must be set in Settings or via the API — [Configuring a publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- Branch source still runs an Actions workflow (`pages-build-deployment`). Branch publishing only allows the branch root or `/docs`, so `web/` can't be published from `main` without moving it or keeping a `gh-pages` branch — [Configuring a publishing source](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- GITHUB_TOKEN rule: "events triggered by the `GITHUB_TOKEN` will not create a new workflow run", except `workflow_dispatch` and `repository_dispatch`, which "always create workflow runs". Example given: "if a workflow run pushes code using the repository's `GITHUB_TOKEN`, a new workflow will not run even when the repository contains a workflow configured to run when `push` events occur." The documented alternative is a GitHub App installation token or a PAT — [Triggering a workflow](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)
- `workflow_run` fires when another workflow is `requested` / `in_progress` / `completed`. It runs on the default branch (GITHUB_SHA = "Last commit on default branch") and can't chain more than three levels — [Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)
- Schedule caveats: `schedule` runs on the last commit of the default branch. It "can be delayed during periods of high loads … High load times include the start of every hour … some queued jobs may be dropped". "In a public repository, scheduled workflows are automatically disabled when no repository activity has occurred in 60 days" — [Events that trigger workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- Caching: GitHub Pages sends `Cache-Control: max-age=600` (10 min). Users can't set custom headers, and the long-running request thread (since Feb 2022) has had no staff response. The community workaround is putting Cloudflare in front of a custom domain — [GitHub Community discussion #11884](https://github.com/orgs/community/discussions/11884). A 2026 issue in another project confirms "production on GitHub Pages cannot set the header at all" — [OurHike issue #1771](https://github.com/OurHike/OurHike/issues/1771)
- HTTPS: all Pages sites support HTTPS enforcement, and github.io sites are HTTPS automatically. Custom-domain certificates come from Let's Encrypt automatically, and the full domain must be under 64 characters — [Securing your site with HTTPS](https://docs.github.com/en/pages/getting-started-with-github-pages/securing-your-github-pages-site-with-https)
- Custom domains: apex, `www` and custom subdomains are supported, and GitHub recommends a `www` subdomain. Verifying the domain at profile level prevents takeover if the repo is later deleted — [About custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages), [Verifying your custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages)
- GitHub Pages is fronted by Fastly — [HN thread](https://news.ycombinator.com/item?id=19982584), [iBug blog](https://ibug.io/blog/2019/11/optimize-github-pages-with-cloudflare/)

### Inferences
- **Recommended GitHub Pages pattern: one workflow that refreshes and deploys.** Triggers are `schedule` + `workflow_dispatch` + `push` (paths `web/**`). Job 1 refreshes the data and commits it with `GITHUB_TOKEN` (`contents: write`). Job 2 checks out the new HEAD and runs `upload-pages-artifact` with `path: web`, then `deploy-pages`. This sidesteps the GITHUB_TOKEN rule without a PAT, and the same workflow still deploys on ordinary pushes. Sketch:
  ```yaml
  on:
    push: { branches: [main], paths: ['web/**'] }
    schedule: [{ cron: '17 3 * * *' }]     # off-the-hour to avoid the top-of-hour delay
    workflow_dispatch:
  concurrency: { group: pages, cancel-in-progress: false }
  jobs:
    refresh:
      if: github.event_name != 'push'
      permissions: { contents: write }
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v5
        - run: node scripts/refresh-data.mjs     # writes web/data/...
        - run: |
            git config user.name github-actions[bot]
            git config user.email 41898282+github-actions[bot]@users.noreply.github.com
            git add web/data && git diff --cached --quiet || git commit -m "data: refresh" && git push
    deploy:
      needs: refresh
      if: always() && (needs.refresh.result == 'success' || needs.refresh.result == 'skipped')
      permissions: { contents: read, pages: write, id-token: write }
      environment: { name: github-pages, url: '${{ steps.d.outputs.page_url }}' }
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v5
          with: { ref: main }                    # pick up the commit just pushed
        - uses: actions/configure-pages@v5
        - uses: actions/upload-pages-artifact@v4
          with: { path: web }                    # docs/ scripts/ test/ never published
        - id: d
          uses: actions/deploy-pages@v4
  ```
  Alternatives: (a) a separate `pages.yml` with `on: workflow_run: workflows: [refresh-data] types: [completed]`, gated on `github.event.workflow_run.conclusion == 'success'`; (b) refresh calls `gh workflow run pages.yml` (`workflow_dispatch` is exempt from the GITHUB_TOKEN rule; this needs `actions: write`); (c) `workflow_call` a reusable `pages.yml` from the refresh workflow. These are equivalent; the single-workflow form has the fewest moving parts.
  - (b) depends on the documented `workflow_dispatch` exception. (a) is widely used and fires on workflow completion rather than on a token-generated event, but I didn't find a doc sentence explicitly saying `workflow_run` fires when the upstream run was itself token-triggered. The upstream here is a `schedule` run, so this shouldn't matter.
- **Keep the scheduled workflow alive:** daily data commits count as repository activity, but if registration ends and nothing is pushed for 60 days, the schedule is auto-disabled and must be re-enabled before the next registration period.
- **Caching consequences:** with max-age=600, a returning student may see data up to ~10 minutes stale after a refresh, which is acceptable. The bigger risk is a code deploy where a browser holds some old ES modules and fetches some new ones within the 10-minute window, causing a version skew. Mitigations: fetch the data JSON with `fetch(url, {cache: 'no-cache'})` so the browser revalidates every time; add a `?v=<commit-sha>` suffix to module imports, or ship a tiny `version.json`, if code changes often.
- Bandwidth estimate: about 89 KB gzipped for all of `web/` plus maybe 50–100 KB of woff2 fonts, so roughly 0.2 MB per cold load. 3,000 students × 20 cold loads/month ≈ 12 GB/month, about 12% of the soft cap even at the high end. The 10 builds/hour soft limit doesn't apply to custom-workflow deploys.

### Gaps
- Couldn't probe live headers (github.io was blocked), so whether Pages sends `ETag` and/or `Last-Modified` (and therefore 304s) is unconfirmed here. Widely reported: yes for both, plus gzip, not brotli. Verify with `curl -sI https://<user>.github.io/<repo>/` once live.
- Latest major versions of `upload-pages-artifact` and `deploy-pages` as of Oct 2026 couldn't be confirmed (GitHub API blocked). The docs show `@v4`/`@v4`/`configure-pages@v5`; check the Marketplace before pinning.
- Whether Pages' Fastly edge has an Israeli PoP: see §4.

---

## 2. Cloudflare Pages vs Cloudflare Workers static assets

### Takeaway
Cloudflare explicitly steers new projects to **Workers with static assets** ("Start new projects with Workers"). Pages still works and is supported. On both, static asset requests are **free and unlimited**, `_headers` gives per-path `Cache-Control`, and the default is `max-age=0, must-revalidate` plus an `ETag`, so a data refresh shows up immediately via cheap 304s. Deploy directly from GitHub Actions with wrangler (`assets.directory = ./web`). This avoids the GITHUB_TOKEN problem entirely, because the deploy doesn't depend on a push event.

### Cited Findings
- Pages docs banner: "Workers supports most Pages use cases and offers a broader feature set … It is Cloudflare's primary platform for building applications. **Start new projects with Workers.**" — [Cloudflare Pages docs (partial "workers-for-new-projects")](https://developers.cloudflare.com/pages/)
- Pages isn't deprecated: existing projects stay supported and keep receiving bug fixes, while new capabilities ship on Workers (third-party 2026 summary) — [bejamas.com](https://bejamas.com/stack/hosting/cloudflare), [mecanik.dev](https://mecanik.dev/en/posts/cloudflare-pages-vs-workers-which-to-use-in-2026/)
- Workers static assets billing: "Requests to static assets are free and unlimited … There is no additional cost for storing Assets." On the free plan, requests that invoke a Worker script count against **100,000/day** (Error 1027 when exceeded). An assets-only project has no script, so this limit doesn't apply — [Workers static assets: Billing and Limitations](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- Pages static requests: "On both free and paid plans, requests to static assets are free and unlimited" — [Pages Functions pricing](https://developers.cloudflare.com/pages/functions/pricing/)
- Workers static assets limits (Free): 20,000 files per Worker version, 25 MiB per file — [Workers limits](https://developers.cloudflare.com/workers/platform/limits/#static-assets)
- Pages Free limits: 500 builds/month, 1 concurrent build, 20-minute build timeout, 20,000 files, 25 MiB per file, 100 custom domains per project, 100 `_headers` rules (2,000 chars per header), 100 projects per account — [Pages limits](https://developers.cloudflare.com/pages/platform/limits/)
- Workers Builds (Git-connected CI for Workers), Free: 3,000 build minutes/month, 1 concurrent build, 20-minute timeout — [Workers Builds limits & pricing](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)
- Default headers on Workers static assets: `Cache-Control: public, max-age=0, must-revalidate` ("the browser should revalidate the freshness of the content every time"), an `ETag` that "is a hash of the static asset file" for `If-None-Match` revalidation, and `CF-Cache-Status` — [Workers static assets: Headers](https://developers.cloudflare.com/workers/static-assets/headers/)
- `_headers`: a plain-text file in the asset directory, not served itself. Rules match path patterns; multiple matching rules merge, and `! Header` removes a header. Example in the docs: `Cache-Control: public, max-age=31556952, immutable` for hashed assets — [Workers static assets: Headers](https://developers.cloudflare.com/workers/static-assets/headers/), [Pages headers](https://developers.cloudflare.com/pages/configuration/headers/)
- `_headers` and `_redirects` are "supported natively in Workers with static assets", same as Pages — [Migrate from Pages to Workers](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)
- Config: `wrangler.jsonc` with `"assets": { "directory": "./dist" }`. With no Worker script, unmatched URLs return 404. A `.assetsignore` file (gitignore syntax) excludes files from upload — [Workers static assets](https://developers.cloudflare.com/workers/static-assets/), [Static assets binding: .assetsignore](https://developers.cloudflare.com/workers/static-assets/binding/)
- Pages Git integration: "root directory" is for monorepos. With no framework, leave the build command blank (or use `exit 0`). The build output directory is configurable — [Pages build configuration](https://developers.cloudflare.com/pages/configuration/build-configuration/)
- Pages direct upload from CI: `npx wrangler pages deploy <DIRECTORY> --project-name=<NAME>`, or `cloudflare/wrangler-action@v4` with secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` — [Use Direct Upload with CI](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)
- Workers Sites (the older approach) is deprecated in Wrangler v4; don't use it — [search summary of Cloudflare docs](https://developers.cloudflare.com/workers/configuration/sites/)
- wrangler latest on npm: 4.145.0 (checked 2026-10-01) — [npm registry](https://registry.npmjs.org/wrangler/latest)
- Israeli PoPs: Cloudflare has Tel Aviv (TLV, live since 2018 as its 135th data center) and Haifa (HFA, 2022) — [Cloudflare blog: Tel Aviv](https://medium.com/cloudflare-blog/tel-aviv-israel-cloudflares-135th-data-center-now-live-24de7fcaac49), [Cloudflare network](https://www.cloudflare.com/network/), [Cloudflare community TLV status 2025-11-12](https://community.cloudflare.com/t/tlv-tel-aviv-on-2025-11-12/854407)
- Cloudflare Web Analytics is available on all plans and "does not collect or use your visitors' personal data" — [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/about/)

### Inferences
- **Recommended Cloudflare pattern (Workers static assets + wrangler from Actions):**
  - Add `wrangler.jsonc` at the repo root: `{ "name": "lets-learn", "compatibility_date": "2026-10-01", "assets": { "directory": "./web" } }`. Only `web/` is uploaded, so docs/, scripts/ and test/ stay private.
  - Add `web/_headers`:
    ```
    /data/*
      Cache-Control: public, max-age=0, must-revalidate
    /*.js
      Cache-Control: public, max-age=300, must-revalidate
    /fonts/*
      Cache-Control: public, max-age=31536000, immutable
    /*
      X-Content-Type-Options: nosniff
      Referrer-Policy: no-referrer
    ```
    `Referrer-Policy: no-referrer` is a cheap extra guard. Fragments are never sent in Referer anyway.
  - In the same refresh workflow, after committing the data, run `cloudflare/wrangler-action@v4` with `command: deploy` (Workers) or `pages deploy web --project-name=lets-learn` (Pages).
  - No push trigger is needed, so GITHUB_TOKEN-triggered pushes are irrelevant.
  - Daily deploys use no "build" quota, since builds happen in GitHub Actions; direct uploads are not Pages/Workers Builds.
- If Cloudflare's own Git integration is used instead (Pages: root dir `web`, build command blank; or Workers Builds), Cloudflare's GitHub App receives the push webhook, so a commit pushed with GITHUB_TOKEN **should** still trigger a Cloudflare build. The GITHUB_TOKEN rule only governs GitHub Actions runs. This wasn't verified against a doc statement. About 30 data deploys/month is far under 500 Pages builds/month.
- The `max-age=0` + ETag default suits daily-changing JSON better than GitHub's fixed 600 s: no stale window, and a revalidation of an unchanged 10 KB file costs a 304.
- Cost of Cloudflare over GitHub Pages: one more account and an API token stored as a repo secret. Benefit: Israeli PoPs and header control.

### Gaps
- Exact Cloudflare free-plan behaviour for `*.workers.dev` vs `*.pages.dev` URLs. Both are free subdomains, but `workers.dev` hostnames include the account subdomain (`lets-learn.<account>.workers.dev`), which is uglier. I didn't confirm whether any free-plan feature differs between them.
- Whether Cloudflare serves brotli for static assets on `*.pages.dev`/`*.workers.dev` by default wasn't verified here.

---

## 3. Netlify and Vercel free tiers (2026)

### Takeaway
Both are workable, but neither beats GitHub Pages or Cloudflare for this app. **Netlify Free is a poor fit:** its credit system charges 15 credits per production deploy against 300 credits/month, so a daily data deploy (~30/month = 450 credits) would exhaust the allowance and **pause the site** mid-registration. **Vercel Hobby** (100 GB transfer, hard caps) is restricted to non-commercial personal use. A free student tool qualifies, but there's no Israeli PoP and you'd be on a hard-capped plan.

### Cited Findings
- Netlify Free: 300 credits/month, a hard cap with no automatic recharge. Credit costs: production deploy 15 credits, bandwidth 20 credits/GB, web requests 2 credits per 10,000. Failed deploys and rollbacks are free. On exhaustion you "wait till the start of your next billing cycle or upgrade" — [Netlify docs: How credits work](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/), [Netlify billing FAQ](https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/billing-faq-for-credit-based-plans/), [Netlify changelog: credit-based plans](https://www.netlify.com/changelog/netlify-pricing-update-introducing-credit-based-plans/)
- At 300 credits "your sites pause until the next month"; 300 credits ≈ 15 GB bandwidth or 20 deploys — [netli.fyi (third party, 2026)](https://netli.fyi/blog/netlify-free-plan-limits-2026), [costbench (third party)](https://costbench.com/software/cloud-infrastructure/netlify/free-plan/)
- Netlify edge locations (Mar 2025 forum post): Frankfurt, São Paulo, Virginia, San Francisco, Singapore, Sydney. Bahrain (Middle East) and Cape Town are on the High-Performance CDN only. No Israel listing — [Netlify support forum](https://answers.netlify.com/t/updated-of-edge-cdn-locations/51104)
- Vercel Hobby: 100 GB Fast Data Transfer/month, 1M edge requests/month, 1M function invocations. Hard caps; exhausted limits generally mean waiting for the next 30-day window — [costbench (third party)](https://costbench.com/software/developer-tools/vercel/free-plan/), [flexprice (third party)](https://flexprice.io/blog/vercel-pricing-breakdown)
- Vercel Hobby is for "personal, non-commercial" use. Commercial use means "any deployment used for the financial gain of anyone involved", e.g. payments, ads, paid hosting or affiliate links. "Asking for donations is explicitly allowed" — [justinmckelvey.com summary of Vercel fair-use guidelines](https://justinmckelvey.com/blog/is-vercel-free), [zplatform.ai](https://zplatform.ai/guides/is-vercel-free/)
- Vercel CDN: 126 PoPs in 94 cities and 51 countries, with no Vercel compute region or PoP listed in Israel — [search summary of vercel.com/docs/regions](https://vercel.com/docs/regions)
- Headers config: Netlify uses `_headers` or `netlify.toml`; Vercel uses `vercel.json` `headers`. Both support per-path Cache-Control (well-known; official pages blocked here) — [Vercel docs: headers (via MCP doc search)](https://vercel.com/docs/project-configuration/vercel-json)

### Inferences
- Netlify math: 30 daily deploys × 15 = 450 credits/month, already over 300 before any bandwidth. Even weekly deploys plus 10 GB of traffic would use (4×15) + (10×20) = 260 credits, close to the cap. Avoid Netlify Free for a daily-refreshing site.
- Vercel is viable, but it adds an account and has no Israel PoP advantage. If the project later shows ads or takes payment, Hobby terms would be breached. GitHub Pages' "no commercial SaaS/e-commerce" rule is similar but looser for a free tool.

### Gaps
- Netlify's and Vercel's official pricing and limits pages were egress-blocked, so the Vercel numbers (100 GB, 1M requests, deployments/day) come from 2026 third-party summaries. Re-check at vercel.com/docs/limits before relying on them.
- I didn't find whether Vercel Hobby **pauses** a project on overage or just blocks further usage. Sources say "hard caps … wait for the next period".

---

## 4. Latency for users in Israel (CDN PoPs)

### Takeaway
Cloudflare is the only candidate with confirmed in-country PoPs (Tel Aviv and Haifa). Fastly (GitHub Pages) planned an Israel PoP in 2015, but I couldn't confirm a current one. Vercel and Netlify list none. For a ~200 KB app the practical difference is tens of milliseconds on first load, and nothing after caching, so latency is a tiebreaker, not a decider.

### Cited Findings
- Cloudflare TLV (2018) and HFA (2022). After TLV launched, median response time for Israeli users fell from 86 ms to 29 ms — [Cloudflare blog: Tel Aviv](https://medium.com/cloudflare-blog/tel-aviv-israel-cloudflares-135th-data-center-now-live-24de7fcaac49), [Cloudflare network](https://www.cloudflare.com/network/)
- Fastly in 2015 listed Israel among planned new POPs — [Fastly press release](https://www.fastly.com/press/press-releases/fastly-raises-75-million-fund-global-expansion). A third-party approximation of Fastly edge locations lists Dubai and Fujairah (UAE) but no Israeli city — [tobilg/fastly-edge-locations](https://github.com/tobilg/fastly-edge-locations). Fastly's live map is the authority — [Fastly network map](https://www.fastly.com/network-map)
- Vercel: no PoP in Israel per its regions docs (search summary) — [Vercel regions](https://vercel.com/docs/regions)
- Netlify: no Israel edge; the nearest is Bahrain, on the High-Performance tier only — [Netlify forum](https://answers.netlify.com/t/updated-of-edge-cdn-locations/51104)

### Inferences
- If GitHub Pages is chosen, Israeli users likely hit a European Fastly PoP, typically about 40–70 ms RTT. With roughly 10 requests (HTML, CSS, ~10 modules, worker, JSON), HTTP/2 multiplexing keeps this to a few round trips. Acceptable.
- Putting Cloudflare (free plan, custom domain, proxied DNS) in front of GitHub Pages gives TLV/HFA PoPs and Cache Rules without moving hosting, but it adds the double-CDN complexity that moving to Workers static assets avoids.

### Gaps
- Whether Fastly has an operational Tel Aviv PoP in Oct 2026 is **unverified**. fastly.com/network-map wasn't fetchable. Check the `X-Served-By` header from an Israeli connection once deployed.

---

## 5. Domain, URL stability for friend links, analytics, fonts

### Takeaway
Buy a domain on day 1 if you expect to keep the tool beyond one semester. The `#…` payload in friend and backup links is host-agnostic, but **localStorage is per-origin**, so any later move from `dolhack.github.io` to another origin silently drops every student's saved state and leaves old links depending on a redirect stub. A cheap `.com` is enough; `.co.il` costs ~$29–60/year. For analytics, use Cloudflare Web Analytics (if on Cloudflare) or GoatCounter (free for non-commercial use), or none. Self-host Rubik and Suez One (OFL-1.1) via Fontsource to remove the Google dependency.

### Cited Findings
- `.co.il` is administered by ISOC-IL, and registrar prices vary: about $29, $49, $59.99 per year, €49–51.95, £41 — [101domain](https://www.101domain.com/co_il.htm), [EuroDNS](https://www.eurodns.com/domain-extensions/co.il-domain-registration), [Instra](https://www.instra.com/en/domain-names/israel/co-il-domain-registration/co-il), [search summary](https://letsdomains.com/domain-database/co.il)
- GitHub Pages supports custom domains with free automatic HTTPS. Domain verification prevents takeover — [About custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages), [Verifying your custom domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/verifying-your-custom-domain-for-github-pages)
- A user site's custom domain is inherited by that account's project sites (`www.octocat.com/octo-project`) — [About custom domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/about-custom-domains-and-github-pages)
- GoatCounter: open source, no cookies, no persistent identifiers, "doesn't need a GDPR notice". Hosted free for non-commercial use (reported as under 100k pageviews/month), ~3.5 KB script, also self-hostable — [GoatCounter](https://www.goatcounter.com/), [privacytools.io review](https://privacytools.io/app/goatcounter)
- Cloudflare Web Analytics: free on all plans, collects no personal data — [Cloudflare Web Analytics](https://developers.cloudflare.com/web-analytics/about/)
- `@fontsource/rubik` and `@fontsource/suez-one` v5.3.0, both licensed OFL-1.1, packaged for self-hosting — [npm @fontsource/rubik](https://registry.npmjs.org/@fontsource/rubik/latest), [fontsource.org/fonts/rubik](https://fontsource.org/fonts/rubik)

### Inferences
- **Friend links:** the fragment is never sent to the server, so moving hosts doesn't break link *content*, only the origin part of the URL. Old `https://dolhack.github.io/lets_learn/#…` links could be kept alive with a stub page that runs `location.replace('https://new.example' + location.hash)`, since the hash is readable client-side. GitHub Pages can't do server-side 301s, so the stub is the only option.
- **localStorage is the bigger problem.** It's scoped to scheme+host+port, so a host change orphans all saved data. Users would need to export a backup link on the old origin and open it on the new one. Also, `dolhack.github.io` is shared by every project site of that account, so all of them share one localStorage namespace; this is minor but argues for a dedicated origin.
- So a custom domain from day 1 (`www.<name>.com` or `<name>.co.il`), pointed at whichever host, makes hosting swappable with zero user impact. The cost is roughly the price of a `.com` (Cloudflare Registrar sells at cost; price not verified here) or ~$29–60/year for `.co.il`. If no money is spent, accept that the `*.github.io` / `*.pages.dev` origin is permanent.
- Fonts: self-hosting (copy the woff2 files for the Hebrew and Latin subsets into `web/fonts/`, plus `@font-face` with `font-display: swap`) removes two third-party connections (googleapis + gstatic) and a render-blocking CSS hop, and stops sending student IPs to Google. Hebrew-subset woff2 files are typically tens of KB each.
- Analytics: "none" is defensible for a localStorage-only privacy-first tool. If wanted, Cloudflare Web Analytics is zero-config when hosted on Cloudflare (it can be auto-injected), and GoatCounter is host-agnostic. Neither sees the `#` fragment unless the script explicitly sends it. GoatCounter's default path excludes the hash; verify before shipping, since the fragment holds user data.

### Gaps
- Current `.com` pricing at Cloudflare Registrar or Namecheap wasn't fetched (egress blocked).
- I didn't verify whether Cloudflare Web Analytics' beacon includes `location.hash`. Check that before enabling, given the backup links carry data in the fragment.

---

## 6. Trademark / impersonation risk from Afeka naming

### Takeaway
Low risk if handled sensibly, but avoid a domain that is just "afeka" (e.g. `afeka-courses.co.il`), or one that looks official. Put the tool's own brand first, and show a visible "not affiliated with Afeka College" disclaimer. `.il` disputes go through IL-DRP, which targets names "confusingly similar" to a complainant's mark that were registered or used in bad faith.

### Cited Findings
- IL-DRP grounds: the domain is "the same or confusingly similar to a trademark, trade name, registered company name" of the complainant, the complainant has rights, the holder has none, and the domain was allocated or used in bad faith — [ISOC-IL dispute resolution](https://en.isoc.org.il/il-cctld/dispute_resolution/dispute-resolution-panels), [IL-DRP decision example](https://www.isoc.org.il/files/docs/ILDRP_Decision-noam-kuris.co.il.pdf)
- GitHub Pages terms require a "prominent disclaimer … not associated with the original" for copies of existing sites. This doesn't strictly apply to an original tool but signals platform expectations — [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)

### Inferences
- A descriptive, neutral brand (e.g. "lets-learn" / "מערכת שעות לסטודנטים") with "for Afeka students" in page text rather than in the domain keeps the tool clearly unofficial. Avoid Afeka's logo and colours.
- The college is unlikely to object to a free student tool, but a domain like `afeka.app` invites a takedown request and confuses students about who is responsible for data accuracy.

### Gaps
- I didn't check whether "Afeka" or "אפקה" is a registered Israeli trademark (the ILPO database wasn't searched). This isn't legal advice.

---

## Summary comparison (for the report writer)

| | GitHub Pages (Actions source) | Cloudflare Workers static assets (or Pages) | Netlify Free | Vercel Hobby |
|---|---|---|---|---|
| Bandwidth / requests | 100 GB/mo soft; 429 rate limits possible | Static requests free and unlimited | 300 credits/mo (20 credits/GB ⇒ ≈15 GB if nothing else) | ~100 GB/mo hard cap (third-party) |
| Deploys | No limit with custom workflow (10/h soft applies only to legacy builds) | Direct upload from Actions; Pages Git builds 500/mo; Workers Builds 3,000 min/mo | **15 credits each ⇒ daily refresh exceeds the free cap** | Not verified |
| Cache headers | Fixed `max-age=600`; no custom headers | `_headers` per path; default `max-age=0, must-revalidate` + ETag | `_headers` / netlify.toml | `vercel.json` headers |
| Publish only web/ | `upload-pages-artifact path: web` | `assets.directory: ./web` or root dir `web` | base/publish dir | root/output dir |
| Overage behaviour | Possible email or service refusal | N/A for static | Sites paused until next cycle | Wait for next period |
| Israel PoP | Fastly: unconfirmed | **Yes: Tel Aviv + Haifa** | No (Bahrain on HP CDN) | No |
| Commercial terms | No commercial SaaS/e-commerce | Allowed | Allowed | Non-commercial only |
| Extra accounts | None | Cloudflare + API token secret | Netlify | Vercel |

**Recommendation (inference):**
- **Day 1, zero friction:** GitHub Pages via the "GitHub Actions" source, with one workflow that refreshes the data and deploys in the same run (`path: web`). Data JSON fetched with `cache: 'no-cache'`. Self-hosted fonts. This needs no new accounts, keeps docs/, scripts/ and test/ unpublished, and stays comfortably within limits.
- **Better technical fit, if one Cloudflare account is acceptable:** Workers static assets deployed by `wrangler-action` from the same workflow. It adds Israeli PoPs, `_headers` control (no 10-minute stale window) and unlimited static requests.
- **Either way:** decide the permanent origin up front. Ideally that's a cheap custom domain from day 1, so localStorage and shared links survive any later host change.
