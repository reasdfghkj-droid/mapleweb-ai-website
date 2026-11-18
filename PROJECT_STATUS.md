# MapleWeb AI — Phase 4 status

**Date:** 18 November 2026. Unless marked otherwise, these results are LOCAL only.

## Completed in the local package

- Phase 3 website, six approved CAD price ranges, chat, fixed-template sample preview, Manager status and approvals, private D1 schema, opt-in submission form and keyed rate limiting retained.
- Turnstile response must have `success: true`, expected `hostname` from `SITE_ORIGIN`, and exact `action: mapleweb_submit`; mismatches fail closed.
- Both HTML planning surfaces request that same Turnstile action, reset the widget after a failed request, and display a usable mobile checkbox (fixed zero-width issue discovered in an automated mobile test).
- JSON body parsing now enforces byte limits incrementally while reading.
- Secure-intake config fails closed if origin is not an exact HTTPS origin or a D1 `prepare()` binding is absent.
- 30/30 Node backend tests, copy/staging preflight, SQLite D1-compatible tests, both mobile page flows, and synthetic submission/retry browser tests passed.

## Still blocked or unverified

- GitHub: this exact Phase 4 package is **not committed** to either GitHub repository. The latest connector attempt said `link_id must identify an eligible linked account`; a prior GitHub write attempt returned 403.
- Cloudflare: **not deployed**. The real staging database migrations (including the rate-limit table), Worker D1 binding, Turnstile hostname/action and live submission test have not been verified.
- Real Samsung/mobile device, approved privacy notice, customer contact and retention policy, email notifications and automatic Developer handoff are not complete.
- No connected generative AI model; no website publishing service. Every draft remains unpublished and requires review.
- `main` and the production website have not been changed in Phase 4.

## Next when account access is available

1. Review this package and commit it on `mapleweb-ai-agents` only.
2. Run CI development tests, inspect exact site diffs, and check staging Worker project is separate from production.
3. Confirm free-tier eligibility and then apply the reviewed schema to **staging D1 only**, deploy staging Worker with intake OFF and verify `smoke-staging.mjs`.
4. Only after owner approval, configure Turnstile and secrets via Cloudflare, synthetic end-to-end D1 test, privacy notice, contact and retention settings.
5. Obtain explicit approval before any production or customer site publication.
