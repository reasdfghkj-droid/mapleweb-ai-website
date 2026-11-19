# MapleWeb AI — Automatic Sales System (Phase 1)

**Status:** Phase 1 published on Cloudflare and verified live on November 19, 2026. No real orders, payments, booking, or automatic agent delivery are enabled.

## What this release does
- New premium green-and-gold Sales Studio at \`/sales.html\` linked from the homepage and the planning chat.
- Seven-step, mobile-friendly customer qualification: business, goal, page count, features, budget, style, and timing.
- Honest rules-based package recommendation using exactly the six approved CAD ranges:
  1. Simple 1–2 pages: $500–$800
  2. Simple 3–5 pages: $900–$1,500
  3. Professional 5–7 pages: $1,500–$2,200
  4. Professional custom design: $2,300–$3,000
  5. Advanced booking or payment: $3,000–$4,500
  6. Advanced online store or integrations: $4,500–$7,000
- Shows budget mismatch honestly instead of inventing a discount or promising a final price.
- Customers can copy or download a preliminary estimate locally without sending anything.
- If an independently configured and approved secure intake API is available, the page reveals an optional consent-based quote request. A successful result says it is **saved**, not an accepted sale or agent-delivered message.

## Security and privacy
- No payment card fields or payment processing. No auto-invoices, marketing emails, orders, or customer-site publishing.
- No lead is sent on page load or when merely calculating an estimate.
- Raw name/email are entered only after the customer chooses to request review.
- Requests can be submitted only with consent, exact approved origin, Turnstile challenge, rate limiting and D1 storage.
- The existing Worker returns HTTP 503 for \`/api/submit\` until all required bindings are present and the owner sets \`SUBMISSIONS_APPROVED=true\`.
- Existing Manager endpoints must remain private and require \`MANAGER_TOKEN\`. The public Developer Worker must never expose them.
- **Do not enable intake** without a published privacy notice, tested deletion/retention procedures, and a confirmed person or process checking saved inquiries. Saved D1 records are **not** automatically delivered to the Website Developer Agent.

## Cloudflare publication and future releases
The public Cloudflare URL is \`https://mapleweb-ai-website.reasdfghkj.workers.dev/\`. This repo has a GitHub Action that can deploy when **GitHub Actions repository secrets** contain:
- \`CLOUDFLARE_API_TOKEN\` — limited-permission Cloudflare Worker deploy token
- \`CLOUDFLARE_ACCOUNT_ID\`

The GitHub publishing workflow is still blocked by missing deployment secrets, but the separate Cloudflare deployment mechanism did publish the Sales Studio after the merge. The [live verification run](https://github.com/reasdfghkj-droid/mapleweb-ai-website/actions/runs/44600679042) confirmed HTTP 200 for \`/sales.html\`, a homepage link, and disabled customer submissions. Do not put credentials in a chat, a source file, or a public variable. Set them directly in the GitHub Actions Secrets UI if this publishing workflow will be used for future releases. Always verify the actual Cloudflare URL after each change; a GitHub source commit alone is not publication.

## Optional lead intake activation (separate approval)
1. Create a Cloudflare D1 database for customer requests. Apply \`migrations/0001_secure_sales_submissions.sql\` on that database **only when authorized**.
2. Add a \`DB\` binding to \`wrangler.jsonc\` pointing at that D1 database.
3. Create a Cloudflare Turnstile widget scoped to the live site hostname with action \`mapleweb_submit\`. Put its site key in \`TURNSTILE_SITE_KEY\` and its secret in encrypted \`TURNSTILE_SECRET\`.
4. Configure exact \`SITE_ORIGIN=https://mapleweb-ai-website.reasdfghkj.workers.dev\` and an independently generated 32+ character encrypted \`RATE_LIMIT_SECRET\`.
5. Configure 30-day retention or another reviewed policy. The current Worker has Manager pruning and deletion endpoints, but **automatic pruning is not yet scheduled**.
6. Only after security review and full end-to-end tests, set \`SUBMISSIONS_APPROVED=true\`. Test that an explicitly consented request is saved in D1 and is visible to the authorized Manager; test failure paths and deletion.
7. Connect a verified owner inbox/notification pipeline and Website Developer intake processor separately. Only then can the product claim automatic delivery, agent handoff, or follow-up.

## Payments and confirmed sales — pay only after delivery (Phase 2; not implemented)
**Owner-selected model:** No deposit and no payment before delivery. The customer must first receive the completed approved website and confirm handover. Then the owner reviews the final amount and sends the invoice using Stripe Invoicing. The project price, applicable taxes, included services, due date and acceptance criteria must be agreed in writing before work begins. No Stripe invoice is sent automatically or in live mode yet. Do **not** accept raw card numbers, assume payment from a success URL, or issue an invoice before delivery. The Stripe sandbox is connected, but real billing and verified webhook integration remain disabled. See `POST_DELIVERY_PAYMENTS.md` and `billing/post-delivery-gate.mjs` for the tested owner-approval gate.

## Developer validation
Run \`node tests/sales-studio.test.mjs\` to check syntax, all six tiers, recommendation scenarios, and fail-closed intake signals. The branch includes a sales-specific workflow with no deployment or paid services.
