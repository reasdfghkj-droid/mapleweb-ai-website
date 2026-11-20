# MapleWeb AI — Phase 14: Scope-aware Website Developer

November 20, 2026 (Toronto)

## What this improves today

The Developer now prepares a professional, mobile-friendly **private website concept** based on the customer's scope, not a fixed 2/4/6-page template for every request.

- Page selection supports 1–2, 3–5, 5–7, and 8+ requested pages. The generator prepares **2, 4, 6, or 8 draft pages** (larger websites still need exact page scoping).
- For eight pages, concepts include Home, About, Services, Gallery, How It Works, FAQ, Resources, and Contact.
- Four safe visual theme directions: Classic & Elegant, Modern & Minimal, Warm & Welcoming, and Futuristic. All CSS design values come from a fixed trusted palette.
- Navigation marks the current page, provides a skip link, follows responsive layouts, honors reduced motion preferences, and provides keyboard-visible focus.
- Gallery pages have empty image placeholders rather than fabricated customer projects, copyrighted photos or fake testimonials.
- Services and contact pages state clearly when online booking, payment, online store, contact forms, CRM, CMS and other integrations have not been connected.
- Generates an owner-only blueprint containing page plan, business category, design direction, required media and missing integrations. Includes `MAPLEWEB_OWNER_QA_CHECKLIST.txt` in the private source bundle.
- Optional Workers AI can write short, sanitized copy for up to eight pages only when owner AI usage flags and model binding are explicitly approved. No billable model call was made for this phase.
- Corrects the sales planner link to say **six questions**, not seven. The customer is never asked for a budget.
- Keeps the no-deposit, pay-after-completed-delivery policy and all customer/owner website approval gates.

## What this does NOT mean

**These are more capable draft websites, NOT fully completed contracted websites.** The customer still must supply and verify real contact details, services, hours, ownership of media and business claims. A working contact form, booking calendar, customer payments, authentication, store inventory, domain hosting and real third-party integrations require approved providers and integration testing.

No customer website is automatically published, no payment or deposit is taken, and no real customer information is sent from an unactivated public intake.

## Source and verification

- `workers/site-blueprint.mjs` — deterministic page/industry/theme planning and integration disclosure.
- `workers/site-bundle.mjs` — responsive accessible private HTML/CSS generator and owner QA file.
- `workers/ai-website-developer.mjs` — page-aware model token budget (still disabled until approved).
- `public/build-with-ai.html` — six-question wording corrected.
- `tests/site-blueprint.test.mjs` and `.github/workflows/site-blueprint-tests.yml` — test page counts, links, safe themes, escaped markup, missing integration warnings, no-budget rule and AI disabled-by-default behavior.

GitHub CI also tests the **real temporary SQLite customer journey**, live Stripe safety with mocked API, customer approval and website delivery, all prior Developer tests and both Cloudflare Worker dry-run builds. No production Cloudflare account, database, bank account or paid model is used.

## Tomorrow: account tasks to do together

1. Connect and verify Cloudflare D1, private R2 bucket, the private Manager Worker and Turnstile.
2. Apply all nine D1 migrations and test dummy customer intake.
3. Decide which customer-site AI model/provider should be enabled and review usage cost/quotas first.
4. Connect and test real contact forms, booking and ecommerce providers only when a real customer has approved those features.
5. Activate customer review emails after verifying an approved sending domain.
6. Set up owner-verified LIVE Stripe business account and Canadian bank payout in Stripe Dashboard.
7. Complete a real end-to-end dummy customer order, actual finished site QA/delivery and post-delivery Stripe verification before accepting real orders.
