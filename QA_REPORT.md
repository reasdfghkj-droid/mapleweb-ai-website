# MapleWeb AI — Phase 4 local QA

**Date:** 18 November 2026. No GitHub push, live deployment or real customer data involved.

| Check | Result |
|---|---|
| JavaScript syntax and Manager/Developer rules tests | 30 of 30 PASS |
| Staging preflight (no production routes, intake OFF) | PASS |
| Approved copy, prices, Turnstile action and mobile consent CSS | PASS |
| SQLite D1-compatible schema and keyed rate counter | PASS |
| Desktop/mobile browser test at 375 and 320 px, preview and safe restart | PASS on both pages |
| Synthetic browser test: secure form action, failed CAPTCHA, retry | PASS on both pages |

## Defects resolved

1. Server previously accepted a Turnstile `success: true` without checking the response `hostname` and `action`. That is now rejected; matching values are required. Unit tests cover wrong host, wrong action, omitted host/action, success false and valid values.
2. Client script previously discarded a failed token without resetting the Turnstile widget, making another submission difficult. On failure, the widget is now reset, and browser tests submit twice with synthetic failure responses.
3. The 375 px planning chat originally collapsed its consent checkbox to **0 px wide** because of generic input flex styling. It is now at least 18 px and clickable; regression tested.
4. Request parsing previously buffered the whole JSON body before checking its size. Streaming parsing now cancels oversized requests and rejects malformed encodings.
5. Intake status no longer reports enabled when D1 has no `prepare` or `SITE_ORIGIN` is not a valid exact HTTPS origin.

## Not yet tested

- No real Cloudflare Siteverify token was issued; local responses were simulated using Cloudflare's documented Siteverify field structure.
- No Cloudflare Worker, real Turnstile widget, live D1 migration, real customer device, domain publishing, secrets or billing tested.
- No automatic agent delivery, production privacy policy, generative AI connection, payment provider or notification system.

**Release decision:** Suitable for a protected staging review after authorized deployment; not suitable for production customer intake.
