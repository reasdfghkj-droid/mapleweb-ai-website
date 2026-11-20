# MapleWeb AI — Final Customer ZIP Integrity Protection

November 20, 2026

## Strengthened private delivery verification

Before the Manager is allowed to treat a final customer website bundle as ready for quality review or to issue the customer a private review link, the system now verifies the **actual ZIP file contents**, not just its name, object size or storage metadata.

The private Cloudflare R2 object is retrieved and checked against the immutable SHA-256 digest recorded when the owner originally uploaded the exact website version.

- A changed ZIP with identical file size is rejected.
- Conflicting R2 metadata is rejected.
- Missing, unreadable or oversized files fail closed.
- The private Manager's artifact status includes `full_sha256_content_verified: true` only after the full-byte comparison succeeds.
- The customer's download route already verifies the full SHA-256; this adds equivalent protection **before** owner approval and customer review invitations.
- The maximum verified file size is 7.5 MB. No external API, paid AI, customer communication or Stripe operation is made.

## What this does not prove

SHA-256 proves only that the stored ZIP bytes match the originally approved upload. It does not prove the website is complete, functional, secure, accessible, hosted, or delivered. The independent ten-point finished-site quality review, written customer approval and actual delivery receipt remain necessary.

GitHub tests include tampering with an R2 object while keeping its original size and filename. Both owner readiness and customer download must refuse the changed ZIP.

Cloudflare D1, R2, Access and Stripe account verification still require owner-authorized activation. This change alone does not activate any real customer service.
