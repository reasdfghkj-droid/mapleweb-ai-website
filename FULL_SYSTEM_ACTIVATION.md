# MapleWeb AI — Full-System Activation and Verification

Updated November 19, 2026 (Toronto). This document separates completed code from features that actually work with real customers.

The public website is already available at:
https://mapleweb-ai-website.reasdfghkj.workers.dev/

**Do not accept real orders until the complete secure workflow has been tested.**

## Ready in the GitHub repository

- Six-question customer chat; the customer is NEVER asked for a budget. Price estimates follow the six approved CAD ranges.
- Secure consented intake -> Cloudflare D1 private order/project -> durable Developer Agent work queue.
- Owner-approved AI text drafts and safe multi-page starter templates; these are NOT full contracted ecommerce or booking websites.
- Private Manager queue, project audit, review and revisions, customer quote and scope.
- One-time private quote, finished-site approval and delivery receipt workflow.
- Owner-attested 10-check finished website QA record, versioned approvals and revisions.
- Protected finished website ZIP packaging, R2 metadata, private customer download.
- Sandbox Stripe invoice tests plus guarded LIVE Stripe invoice create/finalize/send/payment webhook code and owner-only payout status.
- Extensive regression suites and eight D1 migrations.

## What is NOT yet a live business

Cloudflare D1, private R2, Turnstile, Cloudflare Access, private Manager deployment, live Workers AI, real customer email delivery, independently tested customer website publishing/hosting, and verified LIVE Stripe to Canadian bank are not yet connected or activated.

GitHub tests prove code behavior with simulated accounts. They do not establish any real customer, bank payout, charge or hosted customer website.

## Owner actions that require authorized account access

1. **Cloudflare**: in the correct account create ONE D1 database, apply migrations 0001–0008 in order, and bind it as DB to both the public Worker and a separate protected Manager Worker.
2. **Cloudflare R2**: review storage/operation prices, create a PRIVATE bucket with no public r2.dev link, and bind it as FINAL_SITE_BUCKET to both Workers.
3. **Cloudflare Turnstile**: create a widget for the exact public website hostname, securely configure its site key and secret, an encrypted rate-limit key and precise SITE_ORIGIN. Finalize privacy, retention and consent review.
4. **Private Manager**: deploy the separate Worker from wrangler.manager.jsonc ONLY behind Cloudflare Access on an owner-restricted hostname. Secure its independent encrypted MANAGER_TOKEN. Check anonymous access is denied.
5. **Real AI**: decide whether to enable billable Workers AI and approve quotas and privacy handling. AI flags remain OFF until separately authorized.
6. **Customer communication**: establish a verified outgoing email sender or secure manual handover channel. The project currently does not send automatic customer emails or invite links.
7. **Complete custom sites**: a real developer/model/hosting integration must build and test each customer's contracted website. A starter template or generated copy must not be claimed as a completed booking/store/advanced website. Hosting and domains need customer permission.
8. **LIVE Stripe**: activate a verified live Canadian Stripe business account, add a bank inside Stripe Dashboard, review taxes and invoice terms, configure secret sk_live_ and signed live webhook privately. Stripe controls payout settlement. No bank numbers or keys should be put in ChatGPT.
9. **End-to-end launch test**: with a dummy customer, verify consented order, Developer assignment, owner quote, customer acceptance, finished website files, real QA, customer final approval, final file/hosted-site delivery, receipt, owner-approved live invoice, Stripe paid webhook and actual payout reconciliation.

## How to run the readiness audit

In GitHub Actions, open **MapleWeb full-business readiness audit** and select **Run workflow**. It only reads source/configuration and prints which prerequisites are absent; it never calls Stripe or Cloudflare to spend, deploy, email, or collect data.

For local use: `node scripts/activation-preflight.mjs`

The audit deliberately never claims full launch readiness without separate authoritative live service testing. A secret present in GitHub is NOT proof that a service has been configured correctly.

## Safety rules

- No deposits, no payment before actual delivery, no automatic invoice sending from a customer chat.
- Never put bank details or API keys in source files or messages.
- A customer review link is a bearer secret: share it only with the intended recipient.
- Do not publish any customer's website without explicit owner and customer approval.
- Do not make paid AI requests or purchase hosting without owner authorization.
- Keep sensitive defaults FALSE in GitHub. Only activate flags in protected Cloudflare environments after verification.

## Current blockers observed by connected tools

- The accessible Stripe account is MapleWeb AI SANDBOX (livemode=false), not a verified LIVE payout account.
- The TinyFish saved Cloudflare browser cannot currently start because its wallet has no available credit. No credit was purchased.
- No Cloudflare D1/R2/Access settings are connected through the available tools.
- GitHub Actions cannot independently verify a real customer delivery or transfer to a Canadian bank.

The correct status is therefore: **system coding substantially advanced; complete real-world business launch still blocked by service activation, true custom website building and end-to-end verification.**
