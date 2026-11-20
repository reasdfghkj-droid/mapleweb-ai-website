# MapleWeb AI — Phase 11 Customer Review Email Delivery

Updated November 19, 2026 (Toronto). Source code only; real email sending is disabled until a verified provider is activated.

## Implemented

The protected Website Manager can create a single-use customer review link for a written quote, a final website review or delivery receipt and then explicitly request an email to the intended customer already saved in the secure project database.

The email service uses Resend's transactional email API. Sending is disabled unless the owner approves customer emails, confirms domain verification and configures the verified sender and secure API key. It only includes the protected review link, general steps and the no-deposit/pay-after-delivery policy. It does not send customer passwords, payment cards, a Stripe invoice, a website ZIP or private project notes.

A unique private D1 ledger records a single send attempt for each review token, storing a hashed recipient email but not the raw review token or email address. Resend supports idempotency keys; both database reservations and a stable provider idempotency key defend against accidental duplicate sends.

If the provider confirms accepting the email request, the Manager reports email SUBMITTED, not guaranteed inbox delivery. If the provider response is uncertain or the database cannot reconcile the result, the operation goes to MANUAL_REVIEW and **is never automatically retried**.

## Source

- migrations/0009_customer_review_email.sql
- workers/customer-email.mjs
- workers/owner-api.mjs
- manager-ui/index.html, manager-ui/app.js
- scripts/activation-preflight.mjs
- tests/customer-email.test.mjs and .github/workflows/customer-email-safety.yml

## Required external setup

1. Confirm a real approved sender domain in Resend (or arrange equivalent approved transactional provider). Verify the required DNS records privately.
2. Inside the protected Cloudflare Manager Worker, configure encrypted RESEND_API_KEY and verified sender details CUSTOMER_EMAIL_FROM and CUSTOMER_EMAIL_VERIFIED_DOMAIN.
3. Set PUBLIC_SITE_ORIGIN to the exact HTTPS public Cloudflare host.
4. Create and bind D1, apply migrations 0001 through **0009**, and verify the separate Manager behind Cloudflare Access.
5. After sending a dummy invitation to an owner-controlled test email and confirming it actually arrives, enable CUSTOMER_EMAILS_APPROVED and CUSTOMER_EMAIL_DOMAIN_VERIFIED in the private Worker. Both default FALSE.
6. Test expired, revoked and used review links, revisions and confirmed delivery receipts.
7. Never email real customer information or payment requests before a privacy/security review and confirmed recipient consent.

## Status

No real Resend account or verified business sending domain is connected. All existing live customer data, AI and bank operations are disabled. CI tests use mocked provider responses; they do not establish real email deliverability. No email was sent or paid for during this code release.
