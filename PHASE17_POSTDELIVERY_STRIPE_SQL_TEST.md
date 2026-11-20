# MapleWeb AI — Phase 17: Complete Post-Delivery Stripe Database Test

November 20, 2026 (Toronto)

## What the new independent test confirms

This test uses Node's real in-memory SQLite engine with **all nine actual Cloudflare D1 database migrations**. It exercises the actual code and SQL queries, but replaces Stripe's external network API with verified simulated responses. **No real Stripe account, customer, email, API key, charge or bank transfer is involved.**

It starts with a dummy project already marked DELIVERED, with an accepted quote, matching website version, owner/customer approvals, actual receipt dates and saved ten-point finished-site quality review. It then checks the real private Manager owner approval route and Stripe code:

1. A project with no explicit owner invoice approval cannot create an invoice or contact Stripe.
2. After explicit owner approval and complete post-delivery evidence, the private database can create exactly one live-mode-shaped invoice **draft** using fake Stripe responses.
3. The draft does not email a payment request or charge the customer.
4. Sending is a separate action; if disabled, no external send occurs. With the simulation explicitly approved, Stripe mock confirms a finalized/open invoice.
5. The database changes draft status to open only after the simulated provider reports an invoice was sent.
6. A signed, live-mode-shaped `invoice.paid` webhook is checked against the authoritative simulated Stripe invoice and the exact project, version, customer and agreed CAD total.
7. Private D1 records the invoice as paid and stores the unique event ID.
8. Replaying the identical signed event is safely recognized as a duplicate and does not create a second invoice.
9. The test confirms that a paid invoice is **not** proof that a payout arrived at a Canadian bank.

## Code

- `tests/stripe-full-journey-sqlite.test.mjs`: full real-database transaction test with a completely mocked Stripe network.
- `.github/workflows/stripe-full-sql-integration.yml`: CI regression workflow, including the full earlier dummy customer journey, security, website file integrity, email and privacy checks.

## Still required tomorrow with the owner

Verified live Canadian Stripe business/identity and bank account, signed webhook secret, appropriate invoices and tax review, Cloudflare D1/Access/R2, real customer submission consent and real completed website delivery.

This test is valuable evidence of **code correctness** under simulated conditions. It does not claim real payment acceptance, live settlement, operational readiness or a customer website publication.
