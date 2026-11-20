# MapleWeb AI — Phase 7 Final Website Delivery Quality Review

Updated November 19, 2026. This release improves the private business automation backend; the public website's gold-and-green design, six CAD prices and budget-free chat are unchanged.

## Why this exists

An AI starter draft or a private screenshot is **not** a finished customer website. Before a real customer project can be marked DELIVERED and before an invoice may be approved, the owner must have evidence that the contracted final website has passed real tests. This phase adds a *manual owner-attested* final-website QA record for the exact approved project version.

This is NOT automatic verification of a hosted site or proof that a customer has actually received it.

## Built in Phase 7

- Database migration **0006_delivery_quality_reviews.sql** saves quality reviews by project ID and exact website version, and cascades deletion with removed abandoned projects.
- A private owner checklist requires 10 explicit confirmations: complete finished site, contracted features, contact/forms, mobile/accessibility, security/privacy, hosting and ownership, backups/files, handover package, third-party integrations and no critical defects.
- Six *different* verified evidence references record the real final artifact, functional tests, security tests, mobile/accessibility tests, ownership/handover, and support handover. References are IDs, not customer secrets or URLs containing credentials.
- Each review is saved with an audit event in a D1 transactional batch and is bound to the unchanged project version and PREVIEW_READY status. Duplicate approvals for the same version fail.
- The private Manager dashboard has a review form and allows downloading a private QA checklist, **not** a customer website or a delivery receipt.
- The Manager API blocks a DELIVERED transition until a current-version QA record is found. It also blocks post-delivery invoice approval and sandbox draft creation without the current QA record.
- Revisions invalidate an old QA record automatically because the project version changes.
- Customer approval, owner approval, actual delivery proof and customer receipt remain **additional** mandatory requirements. QA alone never sends an email, publishes a customer site or initiates payment.

## Code

- workers/delivery-quality.mjs — validation, recording, private readiness and owner handover checklist
- workers/owner-api.mjs — protected GET delivery-quality, GET handover-summary, POST delivery-review, delivery and invoice guards
- manager-ui/index.html, manager-ui/app.js — private owner QA form and checklist download
- migrations/0006_delivery_quality_reviews.sql — final-version QA database
- tests/delivery-quality.test.mjs and .github/workflows/phase7-delivery-quality.yml — security, regression, all six migrations, Worker dry runs

## Not operational until services are connected

The private Manager remains disabled by default, and Cloudflare D1/Access/Turnstile still require owner account configuration. No real customer details were collected; no real website was developed, delivered, published, or invoiced by this phase. No paid AI, email, invoice or bank action occurred. GitHub CI validates source code, mock scenarios and Worker builds, not a production end-to-end order.

## Activation later

1. On the correct Cloudflare account, configure D1, Turnstile, privacy and retention, encrypted secrets, and the separate owner-authenticated Manager Worker behind Cloudflare Access.
2. Run migrations **0001 through 0006 in order**. Bind the same secure DB as `DB` to both Workers.
3. Test a dummy project from written quotation and acceptance through building and a completed independently tested website.
4. With the dummy project in PREVIEW_READY, perform the actual final-site tests, record evidence identifiers, complete the owner QA checklist and verify the current project version.
5. Record separate customer and owner approvals and proof that the customer received the approved finished site. Only then move the project to DELIVERED.
6. Confirm the no-deposit, post-delivery invoice gate stays blocked without the full evidence chain. Do not enable live Stripe without a reviewed verified live account and agreed terms.

The automation does **not** independently verify the truth of checkboxes. The owner must only attest completed real-world checks. Never mark an AI starter template or an unfinished website as delivered.
