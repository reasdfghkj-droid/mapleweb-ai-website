# MapleWeb AI — Start Here Tomorrow

**Goal:** Connect the code already prepared in GitHub to the real Cloudflare and Stripe accounts, then test the business safely. The public website is live, but the full customer-to-payment service is **NOT** active yet.

GitHub repository: https://github.com/reasdfghkj-droid/mapleweb-ai-website

Live public website: https://mapleweb-ai-website.reasdfghkj.workers.dev/

## We will do these account-only steps together

1. **Cloudflare secure customer database (D1):** In the correct Cloudflare account, create a private D1 database. Apply migrations `0001` through `0009` in order, and bind it as `DB` to both the public Worker and a **separately protected** Manager Worker. Do not enable public customer submissions until Turnstile, consent, retention and storage are tested.
2. **Finished website file storage (R2):** Review any storage costs before creating a private R2 bucket. No public R2 URL. Bind it as `FINAL_SITE_BUCKET` to both Workers. Test a dummy completed website ZIP and its SHA-256 customer download check.
3. **Private Manager + customer protections:** Protect the Manager Worker behind Cloudflare Access. Set a strong encrypted `MANAGER_TOKEN`, verify anonymous visitors cannot access it, configure the correct `PUBLIC_SITE_ORIGIN`, secure Turnstile, rate limits and the privacy/retention policy.
4. **Real Website Developer:** Decide whether to approve billable Workers AI and its limits. The generator currently produces safe multi-page private **drafts**, not finished booking/ecommerce sites. Real customer contacts, domain/hosting, booking, store, forms and payment providers need separate configuration and testing. Do not mark a starter draft as delivered.
5. **Customer email:** Verify an approved transactional sender domain and provider privately. Test an invitation to an email address you control before enabling real customer review notifications.
6. **LIVE Stripe + Canadian bank:** Open your **own Stripe Dashboard**, finish the required live business/identity verification, and add/verify the Canadian bank **inside Stripe**. Review taxes and invoice terms before adding live secrets and enabling the guarded invoice send. No deposit; customers pay only after actual completed website delivery and approval.
7. **Dummy complete order:** Test customer chat and consent -> D1 handoff -> Developer -> written CAD quote acceptance -> real finished website -> independent QA -> customer approval -> ZIP/hosted handover -> receipt -> owner approves invoice -> simulated payment and then, only when safe, controlled live payment verification and payout reconciliation.

## How to work safely

- Never paste passwords, private API keys, bank account numbers, or identity documents into chat or GitHub.
- Enter secrets only in provider security settings or encrypted Cloudflare Worker secrets.
- Do **not** authorize purchases, paid AI inference, real customer charges or publishing without checking the cost and approval first.
- Run **MapleWeb full-business readiness audit** from GitHub Actions to see which local/configuration prerequisites are missing. Passing source tests does not mean external accounts are operational.
- When an account connection is blocked, record the exact error and required permission rather than turning off safety checks.

## What was finished today (code, no real billing)

- [PR #18](https://github.com/reasdfghkj-droid/mapleweb-ai-website/pull/18): improved 2/4/6/8-page Website Developer drafts, themes and integration requirements.
- [PR #19](https://github.com/reasdfghkj-droid/mapleweb-ai-website/pull/19): block broken links, missing assets and unfinished starter drafts before final-site upload.
- [PR #20](https://github.com/reasdfghkj-droid/mapleweb-ai-website/pull/20): verify actual final ZIP SHA-256 bytes before customer download.
- [PR #21](https://github.com/reasdfghkj-droid/mapleweb-ai-website/pull/21): real SQLite test of owner post-delivery approval, mock Stripe invoice, send and signed paid notification.

**Do not call the entire business 100% complete** until the authorized Cloudflare/AI/email/hosting/Stripe connections are working and a full realistic dummy order is verified. The customer never provides a budget; prices are recommended from the six approved CAD website packages.
