# MapleWeb AI — Phase 16: Private Website ZIP Integrity

November 20, 2026 (Toronto)

## Completed

- The owner-uploaded final website ZIP is SHA-256 hashed and the fingerprint is saved in private Cloudflare D1.
- On each customer-authorized ZIP download, the Worker now **reads the actual R2 bytes** (limited by existing maximum ZIP size of 7.5 MB), recalculates their SHA-256 hash and compares it with the approved D1 fingerprint **before** returning the download.
- A changed ZIP is rejected even when the replacement has the same filename and byte size. The customer's private download counter is not incremented for a rejected corrupted ZIP.
- A Cloudflare R2 HEAD/GET object carrying metadata that conflicts with the approved fingerprint is also rejected.
- The private Manager R2 file-presence check now reports whether R2 metadata matches; it explicitly says a full content hash is not verified by the HEAD request alone.
- This does not approve a website, publish it, send customer email, issue an invoice or collect payment.
- Existing delivery, customer approval, live Stripe sandbox mocks, customer email and real D1 migration tests remain included.

## Source

- `workers/final-site-files.mjs` — exact bytes hash validation before customer download, metadata comparison.
- `tests/final-site-files.test.mjs` — same-size tampered file and wrong metadata rejection tests.
- `.github/workflows/final-site-integrity.yml` — regression, Python ZIP format and both Workers dry-run.

## Still dependent on the owner's account

Cloudflare private R2 bucket and D1 bindings are not connected to a live private Manager. This code has been tested with simulated R2 objects and actual ZIP data but not real Cloudflare customer files. No live account, customer project, real email, payment, bank account or paid AI was used.

The final completed-site QA must still confirm real functionality, security, privacy, accessibility, ownership, all requested integrations, customer agreement and actual delivery before any post-delivery payment.
