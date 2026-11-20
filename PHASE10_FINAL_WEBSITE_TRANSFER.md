# MapleWeb AI — Phase 10 Finished Website File Transfer

Updated November 19, 2026 (Toronto). This is backend code and tests, not an activated real-customer service.

## Added

- The owner-only Manager can upload the **actual finished customer website files** (HTML, CSS, JavaScript, JSON, text, SVG and common image formats) as a ZIP into private Cloudflare R2. Up to 60 files, 6 MB uncompressed and 7.5 MB ZIP for this first version.
- A real ZIP file is constructed without a third-party dependency. GitHub CI independently opens it with Python zipfile and checks CRC32, file names and content.
- Paths are validated against traversal, hidden files, duplicate/case-insensitive names, unsupported types and folders commonly used for secrets. This does NOT replace malware/content review; uploaded JavaScript can be executable when the customer later hosts it.
- SHA-256, object key, project ID, exact version, size and count are saved in D1. The R2 bucket is PRIVATE and never returns a public bucket URL.
- If this feature is activated, the Manager refuses final website QA and customer final-review links unless the correct finished website ZIP exists in private R2 for that exact version.
- Customers holding an unexpired, unused, authorized final-review or delivery-receipt link can download their finished website ZIP. The route is read-only, version matched, view capped, noindex and no-store.
- A final ZIP download is not a website deployment or automatic claim of delivery. Customer approval and actual receipt still require separate customer response, owner QA and handover evidence.
- A previous project's files cannot be silently replaced after the version is recorded: revisions require a new project version and fresh review.
- No invoice, customer charge, paid AI call, or bank payout is triggered by saving or downloading files.

## Implementation

- migrations/0008_final_website_artifacts.sql
- workers/final-site-files.mjs
- workers/owner-api.mjs, workers/customer-review.mjs and workers/mapleweb-agents.mjs
- manager-ui/ finished website upload panel
- public/customer-review.html and customer-review.js download link
- tests/final-site-files.test.mjs
- .github/workflows/final-site-file-delivery.yml

## Required owner-account setup — NOT DONE

1. Verify the correct Cloudflare account, privacy and retention settings, and any R2 storage/operation costs.
2. Create a PRIVATE R2 bucket, for example mapleweb-private-finished-sites. Disable any public r2.dev access and unauthenticated public hostnames.
3. In the public Worker and separate, Cloudflare-Access-protected Manager Worker, add the same binding (example Wrangler JSONC, with your real bucket):
   `"r2_buckets": [{"binding":"FINAL_SITE_BUCKET","bucket_name":"<owner-created-private-bucket>"}]`
4. Configure the Cloudflare D1 database and apply migrations 0001–0008 in order. Attach as binding `DB` to both Workers.
5. Configure secure Turnstile, consent, privacy and retention for customer orders; protect the private Manager under Cloudflare Access with a strong encrypted MANAGER_TOKEN.
6. Test with a dummy fully completed website. Validate its code, payment/booking features, security, accessibility, file permissions, hosting/domain handover, and content licenses BEFORE recording QA.
7. After testing, enable FINAL_SITE_FILES_APPROVED=true separately on the public and private Workers, and CUSTOMER_PORTAL_APPROVED=true with exact PUBLIC_SITE_ORIGIN.
8. Issue one-time customer review links through the Manager. A customer may download their ZIP; this does not automatically publish a live site. If customer expects HOSTED_WEBSITE delivery, a separately approved real hosting deployment and DNS transfer workflow are still required.
9. Keep Stripe invoicing blocked until real delivery, version-matched customer approval and the explicit receipt. Bank settlement requires a verified LIVE Stripe account.

## Verified vs not verified

GitHub automated tests validate ZIP compatibility, the upload/download API, version and key guards, and all eight D1 migrations with dummy data. Both Cloudflare Workers were dry-run built. **No real R2 bucket or D1 database was created; no actual customer project was uploaded or downloaded.** The new flags default FALSE. Do not claim a production handover until it is exercised against real configured storage and approved accounts.
