# MapleWeb AI — Phase 9: Live Stripe Post-Delivery Billing

Updated November 19, 2026 (Toronto). This is a production-intended code implementation, **NOT a live Stripe account activation**.

## What the code does

- Separates Stripe TEST keys and webhooks from LIVE operations. All new LIVE endpoints are disabled by default and refuse sk_test keys.
- Requires the correct verified Canadian LIVE Stripe account ID, charges enabled, payouts enabled and completed business verification. The owner must confirm a real bank account and applicable taxes inside Stripe's secure Dashboard.
- Creates a **live invoice DRAFT only after** a customer-approved website was actually delivered and a final signed quote, version-matched QA, receipt, exact CAD amount, invoice terms and owner approval were recorded.
- Requires an independent owner action to finalize and send the live invoice. The code checks Stripe's authoritative invoice data: the exact price, currency, customer ID, project ID and current version before sending.
- Uses idempotency keys and a private database reservation/ledger to avoid duplicate invoices.
- On an uncertain Stripe response or reconciliation failure, marks the operation for MANUAL_REVIEW; it never silently retries an emailed invoice.
- Verifies the raw Stripe webhook signature and fetches the paid invoice directly from Stripe before recording payment in D1. An authenticated payment event is **not** the same as a bank deposit.
- Allows the private owner to read high-level payout status from Stripe. No bank account numbers or payment credentials are returned to customers or placed in GitHub.
- Maintains the business's NO-DEPOSIT, PAY-AFTER-FINISHED-WEBSITE-DELIVERY rule. No automatic customer payment is triggered.

## Activation requires the owner's live Stripe account

Only one connected Stripe account is currently available to ChatGPT: MapleWeb AI SANDBOX (livemode=false). No verified LIVE account is connected. The tool cannot activate the business's bank or identity for the owner.

In the Stripe Dashboard, the owner must create/activate a real Canadian Stripe business account, finish required business/identity verification, and securely add a bank account under payout settings. Do not paste bank account details, API keys or identity documents into ChatGPT.

Then, in Cloudflare Workers, after security review, configure these privately:

- STRIPE_LIVE_SECRET_KEY — encrypted Worker secret, starting with sk_live_.
- STRIPE_LIVE_ACCOUNT_ID — verified Stripe account ID, e.g. acct_..., not a customer ID.
- STRIPE_LIVE_WEBHOOK_SECRET — encrypted signing secret from a dedicated LIVE invoice.paid webhook endpoint.
- STRIPE_LIVE_ACCOUNT_VERIFIED=true
- STRIPE_LIVE_BANK_CONFIRMED=true
- STRIPE_LIVE_TAX_REVIEWED=true
- STRIPE_LIVE_DRAFTS_APPROVED=true on private Manager only
- STRIPE_LIVE_SEND_APPROVED=true on private Manager only
- STRIPE_LIVE_WEBHOOKS_APPROVED=true on public Worker only

These flags MUST remain false until the owner has completed all checks and understands that sending a live invoice emails a real payment request.

All existing requirements for Cloudflare D1 migrations 0001–0007, Access-protected Manager, customer approval portal and secure consented intake remain mandatory.

## Actual customer workflow

1. Customer accepts an exact CAD quote and relevant terms.
2. Website Developer and owner produce a **real completed** website (not just an AI-generated starter).
3. The finished site passes the ten-item version-matched owner QA and documented handover.
4. Customer approves the final version, receives the actual website and confirms receipt through the protected review workflow.
5. Owner records DELIVERED and separately approves the post-delivery invoice.
6. Owner creates LIVE Stripe draft. Verify taxes, legal invoicing information, customer details, included services and exact total in Stripe Dashboard.
7. Owner types SEND in the private Manager to finalize and email a Stripe-hosted invoice. This is a REAL financial communication.
8. Customer pays using Stripe's hosted invoice page. A signed invoice.paid webhook verifies the paid amount and version in D1.
9. Stripe manages account payouts to the owner's verified Canadian bank. A successful invoice payment does not guarantee that the bank payout has already arrived; verify actual payout status and reconcile with the bank.

## API and security

- Public: POST /api/stripe/live-webhook (signed, disabled by default).
- Owner-only: GET /api/manager/live-stripe-status and GET /api/manager/live-payouts.
- Owner-only: POST /api/manager/projects/:id/live-draft and /live-send, requiring explicit confirmation and current project row version.
- workers/stripe-live.mjs, workers/owner-api.mjs, workers/mapleweb-agents.mjs, manager-ui/ and tests/live-stripe.test.mjs.
- Never allow public customer routes to call owner API endpoints.
- No Stripe refunds, disputes, tax calculation, or automated debt collection are implemented; a reviewed financial operations policy is still required.

## Important: unverified production

Tests use simulated Stripe API responses and fake customer projects. Passing CI and a Cloudflare Worker dry-run prove code compiles; they do not prove actual live invoices, payment settlement or payouts. No real customer was charged and no bank was accessed by this release.
