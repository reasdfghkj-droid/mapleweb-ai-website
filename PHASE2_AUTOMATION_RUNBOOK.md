# MapleWeb AI — Phase 2 Automation Runbook

Updated November 19, 2026. The new automation code has passed GitHub CI, but connected live business operations are NOT fully enabled.

## Completed in source code

- Existing live green/gold website, six approved CAD price ranges, guided planning chat and sales estimate.
- Consent-based inquiry endpoint with Turnstile, request-rate limits and strict origin checking (disabled until configured).
- One atomic D1 transaction saving each accepted request, a private project and its starter draft.
- Private Website Developer engine: template preview plus optional Cloudflare Workers AI-generated COPY. The model cannot inject executable HTML. AI is disabled by default to avoid charges.
- 2-page, 4-page and 6-page downloadable website starter source bundles. Advanced booking, payment and store integrations are explicitly placeholders, not real checkout systems.
- Private Owner Manager dashboard and API, separate from the customer-facing Worker. Supports statuses, quote acceptance, revisions, preview review, delivery receipt, and protected project records.
- Post-delivery invoice eligibility and separate owner approval, preventing premature invoicing.
- Sandbox-only Stripe draft invoicing, duplicate-invoice safeguards and signed payment webhook verification with a Stripe API recheck.
- Database migration files, CI tests and two separate Worker configurations, both validated using dry runs.

## Accounts, permissions and services to configure later

These steps need verified service accounts, administrator permissions or explicit owner approval. Do not enter credentials, bank details or customer private data into chat, GitHub files or public website source.

### 1. Secure storage and real customer orders
- In the correct Cloudflare account, create a D1 database within an owner-approved plan; review any charges.
- Apply migration 0001_secure_sales_submissions.sql, then 0002_orders_projects_and_billing.sql.
- Bind the same D1 database as DB to both the public Worker and the private Manager Worker.
- Configure Cloudflare Turnstile for mapleweb-ai-website.reasdfghkj.workers.dev and add TURNSTILE_SECRET, TURNSTILE_SITE_KEY, exact SITE_ORIGIN and an encrypted 32+ character RATE_LIMIT_SECRET.
- Review and publish privacy/retention/consent information, implement scheduled pruning and owner notifications.
- After tests, set SUBMISSIONS_APPROVED=true. Until then requests are NOT accepted.

### 2. Private Manager and Website Developer Agent
- Deploy the separate wrangler.manager.jsonc Worker behind Cloudflare Access and a restricted hostname.
- Configure a secure 32+ character MANAGER_TOKEN. The Manager Worker starts with MANAGER_API_APPROVED=false and workers_dev=false.
- Check that anonymous requests and the public customer Worker cannot reach the Manager API.
- Then enable MANAGER_API_APPROVED=true on the protected private Worker only.
- The optional AI binding is declared, but AI_DRAFTS_APPROVED remains false. Do not turn it on before model quota, cost and content review are approved.
- To build full bespoke customer websites, integrate real design/development tooling and authenticated preview approval. Current source bundles are starter templates.

### 3. Stripe payments after completed website delivery
- Stripe is connected in sandbox mode. The owner must activate a verified LIVE Stripe account and add the destination Canadian bank in Stripe's secure dashboard.
- Agree on total CAD price, taxes, hosting/domain fees, delivery definition, refund terms and due date in writing before starting.
- Customer reviews and receives the approved finished website first. No deposits, no payments before delivery.
- Owner records proof of delivery and customer acknowledgment and explicitly approves the final invoice.
- To test, configure encrypted STRIPE_SECRET_KEY (sandbox only) and STRIPE_WEBHOOK_SECRET in the correct Workers; set STRIPE_TEST_DRAFTS_APPROVED and STRIPE_SANDBOX_WEBHOOKS_APPROVED only after review.
- Private Manager can create a STRIPE SANDBOX DRAFT ONLY, not finalize, email or charge. Test signed invoice.paid webhook, duplicate events and amount matching.
- Live-mode invoicing is intentionally not implemented or authorized. Implement, verify and separately approve it before accepting real money.

### 4. GitHub auto-publishing
- The existing GitHub-to-Cloudflare publishing workflow is blocked by missing CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID GitHub Actions secrets.
- Only add these secrets in protected GitHub Settings; no keys in chat or code.
- Verify future production releases by visiting the actual Cloudflare URL, not just by checking source commits.

### 5. Notification and delivery automation
- Connect a verified owner inbox or notification service (not connected yet).
- Build secure customer preview and handover links with short-lived tokens, not public project IDs.
- Require customer and owner approval for every customer website publication.
- Test one REAL complete flow before calling the system fully automatic: consented order -> D1 project -> real AI/developer build -> customer revisions -> signed acceptance -> website delivery -> post-delivery invoice -> verified payment -> Stripe payout reconciliation.

## Test commands

Run: node tests/automation-phase2.test.mjs

Run: node tests/sales-studio.test.mjs

Run: node tests/post-delivery.test.mjs

Run: npx wrangler deploy --dry-run --config wrangler.jsonc

Run: npx wrangler deploy --dry-run --config wrangler.manager.jsonc

## User-help items postponed

The remaining blockers require one of: Cloudflare D1/Turnstile/Access account setup, a secure notification provider, a live Stripe account and bank verification, an approved privacy/contract policy, Cloudflare deployment credentials, or explicit approval for paid AI model usage. No new purchases, paid AI calls, live invoices, or customer website publications were performed as part of this phase.
