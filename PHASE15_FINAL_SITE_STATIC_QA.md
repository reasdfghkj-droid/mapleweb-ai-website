# MapleWeb AI — Phase 15: Finished-Site Static Quality Gate

November 20, 2026 (Toronto)

## Why this phase was necessary

The customer Website Developer deliberately creates private starter websites for review. An owner-uploaded ZIP should not automatically become a "finished website" just because it contains an `index.html`.

This adds a **fail-closed static quality check before private Cloudflare R2 upload**. It does not replace independent real-world functional, security and accessibility tests.

## Checks completed without any external account

- Ensures every local linked HTML, CSS, JavaScript, image and other supported asset exists within the uploaded website folder, including relative `../` paths.
- Checks local CSS `url()` assets and `@import` references.
- Refuses unsafe URL schemes, HTTP mixed-content dependencies and HTML forms without a configured secure external endpoint.
- Detects and rejects the known "Private website starter", "Private concept", unfilled image placeholders, Lorem Ipsum and internal MapleWeb project-brief/QA checklist markers.
- Finds broken links across multiple pages and blocks uploads with missing or unsafe files.
- Reports missing HTML `lang`, page title, viewport metadata, image `alt` text and externally hosted dependencies as warnings for owner review.
- Does not echo external URL paths, query parameters or credentials in audit reports; only the hostname is shown.
- Integrates with `packageFinalWebsite()` so a failed audit prevents any private R2 upload.
- The private Manager now displays why the upload was rejected, and shows warnings when it accepts an actual completed-site ZIP.

## Important limitations

**Static checks cannot prove that a website is fully completed, safe or functioning correctly.** A passing audit is not a customer approval, hosting deployment, license review, AI builder activation, automated accessibility audit, real payment integration or evidence of delivery.

HTML/JS files from customers remain untrusted content; owner and developer must inspect code, test on actual phones and browsers, verify contact forms, bookings, stores, checkout, data handling and perform the version-matched ten-item finished-site QA before delivery.

Customer websites are not published and customer payments are not requested by this code.

## Code and tests

- `workers/final-site-static-audit.mjs` — read-only source checker.
- `workers/final-site-files.mjs` — rejects invalid/unfinished website bundles before upload and includes static findings.
- `manager-ui/index.html` and `manager-ui/app.js` — clearly show owner failures and warnings.
- `tests/final-site-static-audit.test.mjs` — covers broken HTML and CSS links, internal draft rejection, unsafe schemes, real complete site packaging and unverified features.
- `.github/workflows/final-site-static-audit.yml` — new integration/regression and both Cloudflare Worker dry-run checks.

Real Cloudflare R2, D1, account access, fully functional customer hosting and live Stripe remain for owner-authorized activation together. No real customer information, email, paid AI, bank or Stripe charge was used.
