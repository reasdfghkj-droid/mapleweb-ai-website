# MapleWeb AI — Pay After Website Delivery

**Approved payment policy — November 19, 2026**

Customers pay **only after they receive the completed website**. No upfront deposit and no partial payment during development. This applies to MapleWeb AI website-design services, not third-party charges, which must be clearly disclosed in the written quote.

## End-to-end sequence
1. Customer visits the sales page, answers project questions, and sees a **non-binding** CAD range.
2. MapleWeb reviews the request and agrees in writing on the exact scope, total CAD price, applicable taxes, hosting/domain/third-party fees, due date and acceptance criteria **before work starts**. An estimate is not a contract.
3. Website Developer builds the customer project; previews are private. The customer requests revisions and approves the final version. The owner approves the same current version and security review.
4. **Deliver the finished website first**: publish to the agreed destination with explicit customer and owner approval, and hand over the agreed access/files/credentials through secure channels. A mere preview does not qualify as delivery.
5. Keep owner-verifiable proof of delivery and customer acknowledgment of receipt. The completed delivered version must match the quote and approvals.
6. **Only after step 5**, owner reviews the final invoice for the approved price, tax, customer details and agreed due date. Stripe Invoicing is the selected payment method (one-time, invoice sent after delivery). A draft invoice can be prepared only when these conditions hold; sending it must require separate owner authorization.
7. Customer receives the Stripe-hosted invoice and pays under the written due terms. A Stripe-signed webhook plus a server-side Stripe API check should confirm the invoice was paid. Do **not** interpret the customer's return URL or a screenshot as payment confirmation.
8. Mark the order paid only after verification. Handle invoice errors, refunds, revisions, support and overdue follow-ups according to the agreed policies.

## Implementation status

**Live website:** The marketing/sales pages will show "Pay after delivery" after this code is released and verified.

**Stripe connection:** The connected MapleWeb AI account is currently a **sandbox** (test mode). It does not accept real money. The Stripe Invoicing integration has not yet been connected to Cloudflare; no real invoices, charges, or automated payment reminders are being sent.

**Invoice gate:** \`billing/post-delivery-gate.mjs\` is a pure preparatory check with comprehensive tests. It can say whether a *trusted* completed-project record is eligible for **owner review** of a draft invoice. It cannot create, send, or mark an invoice paid, and is not wired to the public Worker. It requires recorded delivery, confirmed customer receipt, accepted written quote, customer/owner approval of the matching version, correct owner-approved amount, agreed invoice terms and no prior invoice.

**Customer submissions:** The public site's existing inquiry capture is still disabled until D1, Cloudflare Turnstile, verified origin, rate limits, owner review and retention/privacy steps are configured and tested.

## Stripe production work remaining (not authorized/activated)
- Verify Stripe business and tax settings with the owner; confirm if account can switch from sandbox to live mode when ready.
- Connect the owner-controlled Cloudflare back end to Stripe using **encrypted Stripe credentials** with minimum permissions. Never place a secret API key in GitHub, public JS, a page, or a chat message.
- Store trusted project status, quote signature, approved amount, delivered version, proof of customer receipt and invoice ID in protected server-side storage (D1 or equivalent).
- Use Stripe Invoicing to prepare an owner-reviewed **draft** invoice; issue an invoice **only after** the delivery gate passes and the owner approves it. Use \`collection_method=send_invoice\`, with a due date agreed in the contract. Require idempotency and prevent duplicate invoices.
- Configure endpoint that verifies the **raw body webhook signature** before processing \`invoice.paid\` or payment failures. Include replay protection, event idempotency, and a server-side Stripe recheck to prevent fraudulent "paid" statuses.
- Reconcile invoice emails, line items, taxes, discounts, customer communications, refunds and support before switching to **live Stripe mode**. Test with a sandbox customer and a completed sample project first.
- Do not automatically publish a customer website without their approval. Do not charge a customer before delivery even if they request faster work.

Stripe reference: https://docs.stripe.com/invoicing/integration and https://docs.stripe.com/invoicing/integration/testing

## Operational safeguard
Offering all work before taking payment creates non-payment risk. Use a signed scope and acceptance agreement, defined milestones and a written post-delivery due date, while honoring the no-deposit policy. Never invent payment or delivery dates for an individual customer.
