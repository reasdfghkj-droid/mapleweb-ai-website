# MapleWeb AI — Two-Worker staging release candidate

**Status: locally tested, not pushed to GitHub, not deployed to Cloudflare, not published.** This package extends the Phase 4 rules-based Developer/Manager starter with separate Cloudflare Worker entrypoints and a GitHub Actions manual staging deploy workflow. It does **not** contain Claude’s separate reported 18-file archive and is not a live generative-AI agent.

## What works locally

- Mobile homepage, approved slogan and six CAD prices, responsive planning chat that responds to every answer.
- Fixed-template, sandboxed draft website preview and download — never published or sent as a real customer website.
- Two separate rules-based Workers: `workers/developer.mjs` serves `/api/chat`, `/api/draft`, `/api/prices`, `/api/config`, `/health` and public site assets; `workers/manager.mjs` serves only authenticated `/api/manager/*` endpoints. Both share the tested `workers/mapleweb-agents.mjs` core.
- Optional consent-based submission form, disabled by default. When configured and approved, requires an exact HTTPS origin, Cloudflare Turnstile and a private D1 database. The result is stored for Manager review, **not automatically delivered to an agent**.
- Mandatory keyed-hash IP rate limit (10 attempts/hour), manual authenticated deletion and retention cleanup, safe data checks, no publishing endpoint.
- **Phase 4 security changes:** CAPTCHA Siteverify now checks both the allowed hostname and form action `mapleweb_submit`, and the browser creates a matching Turnstile token. Failed submissions reset the challenge so customers may retry. The mobile consent checkbox has a usable fixed width. JSON request bodies are limited **during streaming**, not buffered entirely before checking the size. Submission availability checks the D1 binding and HTTPS origin before advertising intake.

## Test it without connecting accounts

Run from the folder root:

```bash
npm test
npm run test:browser
```

`npm test` uses Node and Python SQLite; `test:browser` additionally needs Playwright/Chromium. All browser API calls use local synthetic mocks. The tests do **not** write to Cloudflare or send real customer information.

## Deployment and business approvals

See `RELEASE_HANDOFF.md`, `RELEASE_TEST_REPORT.md`, `DEPLOYMENT_CHECKLIST.md`, and `PROJECT_STATUS.md`. Staging deploy is a manual-only GitHub Action; it is not a completed deployment. Staging is allowed only on a separate `workers.dev` hostname and staging D1 database after explicit account authorization and cost review. Do not change `main`, DNS, or the live website without the owner’s approval. Keep `SUBMISSIONS_APPROVED=false` until an approved privacy notice, customer contact method, retention period, and real Turnstile/D1 test are ready.

The Worker is a **rules-based starter**, not a connected generative AI service. It does not build or publish fully customized websites, send notifications, automatically assign projects, or make payments. Those features need separate implementation, testing and approval.
