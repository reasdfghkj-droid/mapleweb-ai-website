# MapleWeb AI source / staging deployment candidate — offline test report

**Date:** 2026-11-18. **Scope:** local source and staging workflow only, not an external deployment. No GitHub commits, Cloudflare staging changes or live website publication were made by this release preparation.

- `npm test`: 32/32 automated backend tests passing, approved pricing/source checks passing, staging preflight passing, SQLite schema checks passing.
- `python3 tests/browser-check.py`: both `index.html` and `build-with-ai.html` pass synthetic mobile chat/preview/security checks; tested at 375px and 320px without real backend connections.
- `python3 tests/submission-browser-check.py`: both pages pass synthetic Turnstile submission failure/retry tests without real customer information.
- `python3 tests/staging-binding-check.py`: validates D1 binding configuration and refuses wrong/invalid/nonexistent database names and checks the Manager-only D1 binding, retaining disabled customer intake.
- `.github/workflows/mapleweb-staging-deploy.yml`: parsed as YAML and reviewed as a manual, development-branch-only deployment workflow. The workflow **has not run on GitHub** because connector access is missing. Production deployment is not included.
- **Important:** Cloudflare staging D1 data, Turnstile host/action, secrets, Worker URLs, real customer submissions, Manager authentication and production site upgrade cannot be verified without actual Cloudflare account access and a successful staging deploy.

- Separate Worker tests confirm that Developer cannot access Manager routes, and Manager cannot accept chat, submissions, or public assets. No remote deployment has occurred.
