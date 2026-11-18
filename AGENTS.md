# MapleWeb AI — Agent Development Instructions

This file guides development of the **Website Manager** and **Website Developer** for MapleWeb AI.

## Environment and status
- Canonical development repository: `reasdfghkj-droid/mapleweb-ai-website`
- Development branch: `mapleweb-ai-agents`
- Production website runs from the protected `main` release path; leave it unchanged until reviewed and approved.
- The verified Manager/Developer source has been imported into this development branch by the GitHub Actions Deployment Agent; it has **not been deployed to Cloudflare**.
- 32 backend tests and the development GitHub Actions checks passed; **no standalone Manager or Developer Worker is live yet**.
- The current Developer system builds sites from **fixed templates**; a generative AI model has not been connected.

## Responsibilities

**Website Manager**
- Track requests, project status, pricing and approvals.
- Report problems and verify deployments with evidence.
- Preserve the six approved CAD price ranges: $500–$800, $900–$1,500, $1,500–$2,200, $2,300–$3,000, $3,000–$4,500, $4,500–$7,000.

**Website Developer**
- Collect customer requirements and create mobile-friendly website drafts.
- Provide private previews and handle revision requests.
- Require customer approval and owner approval **of the same current version** before publishing.
- When a revision is requested, invalidate old approvals; closing or resolving the request must not silently restore old approvals.

## Non-negotiable safeguards
1. **Do not push to `main`, change the live site, merge branches, or deploy without explicit owner approval.**
2. **Never publish customer sites unless both approvals are verified for the latest version and there are no unresolved revision requests.**
3. Do not spend money, enable paid products, or change domains without explicit owner approval.
4. Never place API tokens, passkeys, setup codes, private credentials or real customer data in the repository.
5. Work in a separate branch; add tests for security-related behavior; record failures and limitations honestly.
6. Do not claim a Worker or AI agent is running until it has actually been deployed and tested end to end.
7. Keep test deployments and sample projects separate from real customers.

## Current layout and automation
- `workers/developer.mjs` — Developer Worker entry point; `workers/manager.mjs` — Manager entry point.
- `workers/mapleweb-agents.mjs` — shared rules and submission backend; `workers/schema.sql` — reviewed staging schema.
- `public/`, `site/` — customer website; `tests/`, `scripts/` — automated checks.
- `.github/workflows/mapleweb-import-release.yml` — verifies signed-off source release and imports it to development only.
- `.github/workflows/mapleweb-dev-tests.yml` — development tests only.
- `.github/workflows/mapleweb-staging-deploy.yml` — manually dispatched separate staging Worker deployment; never deploy automatically without approval.

The complete source release has already been extracted and committed on `mapleweb-ai-agents`; the archived ZIP is retained under `releases/` for reproducibility. Do not claim Cloudflare deployment or customer submission delivery until separately verified.
