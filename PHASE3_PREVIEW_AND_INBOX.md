# MapleWeb AI — Phase 3 Private Previews, Owner Inbox and Safe Data Removal

Updated November 19, 2026.

## Prepared in GitHub

- Private customer preview links with random 256-bit tokens. The database stores SHA-256 hashes, not raw tokens. The default expiry is 48 hours, with a maximum 72 hours and 30 views.
- Preview pages have restrictive HTTP Content Security Policy: no scripts, images, forms, network calls, indexing, caching or framing. Preview links expire, can be revoked, and stop working if the project version changes.
- Private owner notification inbox for new consented requests, customer revisions, preview readiness and recorded delivery. Notifications are created in D1 transactions and show only to the authorized owner; they do NOT send email or push alerts.
- Owner-reviewed deletion for unused customer requests. Accepted, quoted/priced, delivered and invoiced projects cannot use quick deletion; financial and legal retention must be reviewed separately.
- GitHub CI validates all previous sales, payment and development tests, all three database migrations, and the public and private Cloudflare Worker builds without deploying the private Manager.

## Existing live configuration remains disabled

Both public and private Workers set PRIVATE_PREVIEWS_APPROVED=false by default. Preview sharing is not operational until D1, the private Manager and customer-data safeguards are connected, approved and tested. A live public preview route returning HTTP 404 while disabled is expected.

## Account-dependent tasks postponed

1. Create Cloudflare D1 database; apply migrations 0001, 0002 and 0003_private_previews_notifications.sql in order.
2. Bind D1 to both Workers. Configure Turnstile, exact allowed origin, request rate limiting, privacy notice, customer consent and retention/deletion policy before enabling submissions.
3. Deploy a separate private Manager behind Cloudflare Access; set strong encrypted MANAGER_TOKEN and enable MANAGER_API_APPROVED only after identity and access tests.
4. Set PUBLIC_SITE_ORIGIN to the exact verified HTTPS hostname and PRIVATE_PREVIEWS_APPROVED=true on both Workers only after secure storage and access checks.
5. With a dummy project, test the private preview life cycle: accepted written quote, project build, owner preview verification, 48-hour share, recipient access, expiry, revocation and invalidation after a revision.
6. Connect an owner-approved notification/email provider if real emailed notices are wanted. The internal inbox does not send external mail.
7. Real AI inference, customer-specific full website delivery, live invoicing and bank payouts remain separate steps, as described in PHASE2_AUTOMATION_RUNBOOK.md.

## Security and honest delivery expectations

A preview URL is a bearer credential, so anyone holding it can see the private mockup until it expires or is revoked. Share it only through a secure customer channel. A mockup is not a finished customer website. Customer and owner approvals remain required before publishing, and payment still happens only AFTER verified delivery. No purchases, live invoices, customer emails or customer website publications are performed by Phase 3.

## Tests

Run node tests/private-preview-inbox.test.mjs plus the existing test suites. The Phase 3 GitHub Actions workflow checks database foreign-key cascades and validates public/private Cloudflare Worker bundles without deployment.
