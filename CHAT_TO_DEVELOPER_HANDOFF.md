# MapleWeb AI — Chat to Website Developer Agent

Built November 19, 2026. This describes the new **customer-consented handoff**; it is NOT a claim that Cloudflare customer submissions, AI inference, or payment collection are currently active.

## Customer journey

1. A customer opens "Start with AI" or "Build with AI" on the premium green-and-gold MapleWeb website.
2. The guided planning chat asks six questions: type of business, goal, page count, features, design/style, and timeline. It automatically shows a preliminary price range based on the website requirements. The chat also answers common questions.
3. At completion, "Send to Website Developer" opens a secure form **only when customer-submission and Developer-handoff configuration report ready**. The customer may add extra website instructions (up to 900 characters).
4. The customer enters name and email, actively consents to share the six answers and extra notes, and passes Cloudflare Turnstile.
5. Only after pressing "Send my plan to Website Developer" does a POST to /api/submit occur. No raw unrelated conversation transcript, payment card, password, API key or private chat is deliberately uploaded.
6. Cloudflare verifies HTTPS origin, consent, contact, Turnstile, rate limits and data bounds. A single D1 transaction inserts the submission, private project, project audit event, owner inbox alert, and **Developer build queue record**. If any required table is missing, the transaction fails; no false confirmation is returned.
7. The response acknowledges a saved request and build job reference, not an accepted sales contract or a completed website.
8. When AUTO_BUILD_HANDOFF_APPROVED=true and the Worker has an execution context, background processing generates a 2-, 4- or 6-page fixed-template **private starter source** from the saved requirements. It also generates MAPLEWEB_PRIVATE_BRIEF.txt preserving the customer’s requirements and additional notes in escaped form. It stores the output under the project and notifies the protected owner inbox.
9. The owner-only Manager dashboard shows Developer job status; the owner can review/download the private starter, and can process a pending job manually after activation. A failed or uncertain job is not automatically retried.
10. Building an actual bespoke finished website, handling advanced bookings/stores, publishing it with customer and owner approval, and sending a Stripe invoice **after delivery** are separate reviewed steps.

## What is and is not automatic

- **Code implemented:** Consent prompt, guarded secure POST, atomic job record and owner notification, optional background fixed-template starter preparation, private project/status and output access, tests.
- **Disabled on live site by default:** customer submissions, Developer background processing, private Manager, paid AI, live Stripe invoicing and publishing.
- **Not yet implemented:** a fully autonomous end-to-end bespoke website developer, customer-email delivery, live Stripe bank payout or a production-tested customer acceptance portal.
- A saved job is NOT a delivered website. A generated fixed-template sample is NOT a final customer deliverable.

## Owner-dependent activation — do later

1. In Cloudflare, set up D1 and apply migrations 0001, 0002, 0003, then **0004_developer_handoff_queue.sql**. Bind this database to the public and private Workers.
2. Configure Turnstile and exact SITE_ORIGIN plus encrypted TURNSTILE_SECRET, RATE_LIMIT_SECRET and public TURNSTILE_SITE_KEY. Verify data retention, privacy notice, contact support and deletion handling.
3. Deploy the private Manager Worker behind Cloudflare Access with a protected MANAGER_TOKEN. Verify no public Manager APIs.
4. Test a fake customer order all the way through D1 queue, private starter and owner Manager. Then enable SUBMISSIONS_APPROVED=true and AUTO_BUILD_HANDOFF_APPROVED=true on the appropriate Workers only after cost/security review. These default to false.
5. To add true AI drafting, separately approve provider costs and enable the protected AI_DRAFTS_APPROVED setting. No AI inference is performed automatically by the fixed-template queue.
6. Connect secure customer notifications, private preview approvals and production delivery before calling it a fully automatic website-building business. Live Stripe and bank payout must be verified independently.
7. Never send real customer data until privacy notices, consent and storage protections are reviewed.

## Security checks

Run:
- node tests/chat-developer-handoff.test.mjs
- node tests/automation-phase2.test.mjs
- node tests/private-preview-inbox.test.mjs
- node tests/sales-studio.test.mjs
- node tests/post-delivery.test.mjs

The GitHub Actions workflow checks all four D1 migrations in SQLite and both public/private Worker bundles in dry-run mode.

## Deployment verification

Cloudflare live URL: https://mapleweb-ai-website.reasdfghkj.workers.dev/

A GitHub commit alone is not proof of publication. The release workflow should verify the new JS asset and homepage link, /api/config.builder_handoff_enabled=false before account activation, and /health marker. Do not claim secure customer requests actually reach a live AI builder until an end-to-end real service test passes.
