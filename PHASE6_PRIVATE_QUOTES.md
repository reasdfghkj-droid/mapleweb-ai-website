# MapleWeb AI — Phase 6 Owner Quote and Payment Terms

Updated November 19, 2026 (Toronto). This is a private business-system feature, not a change to the public website design.

## What this phase prepares

- An owner-only quote generator using customers' six website-planning answers: business, goal, pages, features, design, timeline, plus optional notes. It does NOT ask for or use customer budgets.
- A recommendation from the existing six approved Canadian-dollar package ranges. The owner can specify an exact price only after considering the customer's detailed requirements; out-of-range proposals need a documented explanation.
- A downloadable plain-text scope and quote draft inside the private Manager. The download includes a proposed price, an estimate range, outstanding scope/acceptance items and invoice due terms.
- Clear contract wording that the customer receives the completed and approved website FIRST, then pays. There are no deposits or upfront charges.
- Automatic drafts cannot be sent as emails, signed as contracts, converted to invoices, published to a customer site or used to charge a card.
- Taxes, hosting, domains, licenses, third-party integrations and renewal fees are NOT calculated. The owner must disclose and agree to applicable costs and obtain appropriate legal/tax review.
- An important workflow correction: proposing a quote no longer pretends the customer accepted the invoice due terms. Due terms are marked accepted only after the owner's recorded customer written acceptance.

## Implementation

- billing/owner-quote-pack.mjs — estimate, scope and post-delivery terms.
- workers/owner-api.mjs — protected GET /api/manager/projects/:id/quote-pack.
- manager-ui/index.html and manager-ui/app.js — download private text draft.
- workers/order-engine.mjs — quote accepted vs quote proposed separation.
- tests/owner-quote-pack.test.mjs and updated tests/automation-phase2.test.mjs — verified six packages, owner-only access, no-budget pricing and no-deposit policy.
- .github/workflows/phase6-owner-quote.yml — test and Worker dry-run checks.

## Not yet active

Public customer intake, D1, Cloudflare Access for private Manager, live Stripe invoices, email transmission, true completed customer websites and Canadian bank payouts still require the separately approved and tested integrations.

## What the owner must do later

1. Secure Cloudflare D1 and the private Manager according to the previous runbooks.
2. Review a real customer's scope, pages, features and estimated package.
3. Agree an exact total CAD price, taxes, third-party fees, revision terms, delivery criteria, ownership, cancellation and refund terms.
4. Have the customer accept the written terms before starting development.
5. Deliver the completed, approved website first; obtain the customer's delivery receipt.
6. Only then approve and send the final Stripe invoice from a verified LIVE account. Stripe payout to the verified Canadian bank follows settlement rules.

No customer was charged, no invoice was created, no bank details were used, and no customer contract was sent during this phase.
