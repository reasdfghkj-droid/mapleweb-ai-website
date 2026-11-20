# MapleWeb AI — Phase 8 Customer Acceptance and Handover Links

Updated November 19, 2026 (Toronto).

## Implemented, tested and disabled by default

The private Manager can issue a random 256-bit, one-use customer review link for an exact website version. Only a SHA-256 token hash is saved in Cloudflare D1. Tokens expire in 1–168 hours (default 72 hours) and the owner may revoke them.

Three distinct steps are supported:

1. QUOTE: after an owner-approved written quote with a final CAD price and invoice terms is recorded, the customer may explicitly accept the quote or request changes. No budget question, deposit, card collection or payment is involved. This is not a legal digital-signature service.
2. FINAL_REVIEW: after the owner records full final-site QA for the matching version, the customer may approve that version or request changes. A revision returns the project to reviewing and invalidates old version approvals. The review page reminds the customer to inspect the actual completed site separately — a starter draft is not sufficient.
3. DELIVERY_RECEIPT: after customer approval and owner-recorded website handover, the recipient can confirm actual receipt. This does not itself mark delivery or create an invoice. The separate owner DELIVERED action checks this receipt whenever customer portal integration is activated.

The public customer review page uses a strict origin policy, short-lived bearer links, no caching or indexing, a restrictive CSP, anti-replay controls, explicit customer consent, no payment processing and no external email or customer-site publishing. Customer name and email are not returned to public reviews.

The private Manager has buttons to create, revoke or clear links and records their status. The owner must share each link securely with its intended customer. Customers can request revisions and add up to 900 characters of notes; credentials and payment card numbers are rejected.

## Source

- migrations/0007_customer_review_tokens.sql
- workers/customer-review.mjs
- workers/owner-api.mjs
- workers/mapleweb-agents.mjs, workers/developer.mjs
- public/customer-review.html, public/customer-review.css, public/customer-review.js
- manager-ui/index.html, manager-ui/app.js
- tests/customer-review.test.mjs
- .github/workflows/customer-review-portal-tests.yml

## Activation needed later

1. Configure Cloudflare D1 and apply all seven migrations in order. Bind the SAME DB to both separate Workers.
2. Protect the Manager Worker behind Cloudflare Access with independent token and owner-verified account security.
3. Review privacy, retention, and real customer data handling; ensure secure submissions and customer notification method are configured.
4. Only after end-to-end tests, enable CUSTOMER_PORTAL_APPROVED=true separately on the customer and private Manager Workers; configure PUBLIC_SITE_ORIGIN to the exact secure customer site URL.
5. Test quote, final QA, customer approval and delivery receipt with dummy projects and version changes.
6. Send invitation links only through a secure recipient-specific channel; this release does NOT email customers automatically.
7. Implement and test delivery of a REAL finished customer website. The portal itself does not upload, host or publish final website files.
8. After actual delivery and customer acknowledgment, the owner may review invoicing. No invoice is automatically sent by the portal.

## Status

Code-level tests and D1/Worker dry runs are NOT proof of live customer operations. The public website still has customer intake disabled. All gates default to false. No customer site, customer data, live invoice, bank payout or AI usage was initiated by this phase.
