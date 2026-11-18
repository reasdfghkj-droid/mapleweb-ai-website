# MapleWeb AI — Deployment handoff, November 18, 2026

**Not deployed as of this release.** Two separate Cloudflare Worker entrypoints are now prepared: `workers/developer.mjs` serves the customer chat and website; `workers/manager.mjs` serves only authenticated administration. Both import a shared rules-based core. **Neither Worker has been deployed, neither runs a generative model, and there are no email alerts or real AI-led website construction pipeline.** The source intentionally fails closed for customer submissions.

## What is completed

- Approved homepage, six CAD price tiers, mobile conversational planner, sandboxed draft previews.
- Rules-based Developer and Manager endpoints, review/approval checks, D1 submission schema, secure origin and Turnstile validation, rate limits, retention/deletion endpoints.
- Offline tests for source, 30 backend behaviors, SQLite schema, and both mobile chat pages.
- Controlled **manual staging-only** GitHub workflow in `.github/workflows/mapleweb-staging-deploy.yml`. The workflow has `contents:read`, refuses non-development refs and only deploys the **two separate staging Workers** if all preflight checks pass.

## Remaining external work that cannot be done offline

1. **GitHub** — Reconnect an authorized GitHub account with `Contents: Read and write` for the exact `reasdfghkj-droid/mapleweb-ai-website` repository. As of the last attempted call, the GitHub connector returned `link_id must identify an eligible linked account`. Commit these package contents to the `mapleweb-ai-agents` branch, preserving `main`.
2. **Cloudflare staging** — Provide a Cloudflare API token with appropriate Workers and D1 permissions via repository Actions secret `CF_API_TOKEN`, plus account ID secret `CF_ACCOUNT_ID`. Set a repository environment named `mapleweb-staging` with verified variables `MAPLEWEB_DEVELOPER_STAGING_URL` and `MAPLEWEB_MANAGER_STAGING_URL` for the respective `https://mapleweb-ai-developer-staging.<subdomain>.workers.dev` and `https://mapleweb-ai-manager-staging.<subdomain>.workers.dev` sites. Those are expected patterns, **not verified live addresses**. Do not include secrets in messages, commits, or screenshots. Review the staging D1 schema before running the manual workflow.
3. **Database + CAPTCHA + private Manager access** — Add a Cloudflare Turnstile widget for the actual Developer staging hostname. Configure the Developer Worker secrets `TURNSTILE_SECRET`, `RATE_LIMIT_SECRET` and variables `SITE_ORIGIN`, `TURNSTILE_SITE_KEY`; configure the separate Manager Worker secret `MANAGER_TOKEN`. Never put Manager secrets in the public Developer Worker. `SUBMISSIONS_APPROVED` must stay `false` until a privacy notice, consent text, retention policy, contact channel, and end-to-end synthetic submission test are approved.
4. **Real customer intake** — Once above gates pass, turn on consent-based submissions explicitly, then test an actual Turnstile token and D1 insert/read/delete, and confirm the Manager can review the data. The current code saves a request in D1 but does NOT automatically hand it to a separate AI model or send email. Real agent routing must be implemented and verified before telling customers it happens.
5. **Production publication** — User has now requested the upgraded public website to be published. First verify staging and re-check the production endpoint, deployment ownership, release configuration and backups. Only then replace the production website; never modify customer websites or DNS as part of this release. A production rollout workflow is intentionally omitted until live staging checks pass.

## Known deployment limitations

- A Cloudflare user session or valid API token is required. The repository is not writable using the currently selected GitHub plugin account.
- A working staging Worker URL has NOT been observed from this release and should never be invented.
- The staging smoke test expects submissions disabled; therefore a green staging deployment is **not evidence of functional customer intake**.
- Cloudflare Workers Free/D1 and Workers AI have finite quotas. Workers AI model access and any paid usage must be approved separately; this release uses no AI model API.
