# MapleWeb AI — verified deployment status (18 November 2026)

## LIVE: upgraded business website and safe Developer

- Canonical repository: `reasdfghkj-droid/mapleweb-ai-website`.
- Production branch: `main`, release commit `968698e3b8767f9d4a7de2360673efc655de8a28`.
- Live URL: https://mapleweb-ai-website.reasdfghkj.workers.dev/
- **Verified from an independent GitHub-hosted network check:** home and planning chat return HTTP 200; headline, approved subtitle and six CAD prices visible.
- **Developer API verified live:** GET `/health`, GET `/api/config`, GET `/api/prices`, POST `/api/chat`, POST `/api/draft` respond as expected with synthetic input.
- This Developer is rule-based with fixed-template draft previews; **no paid generative AI model is connected**.
- **Customer submissions are NOT enabled**: POST `/api/submit` returned 503 by design.
- **Manager is NOT exposed on the public Developer service**: GET `/api/manager/status` returned 404.
- Verified live check: https://github.com/reasdfghkj-droid/mapleweb-ai-website/actions/runs/44455958665
- Pre-API production backup branch: `mapleweb-pre-developer-api-backup-2026-11-18`.
- Pre-homepage upgrade backup branch: `mapleweb-pre-upgrade-backup-2026-11-18`.

## Development branch and automation

- Development branch: `mapleweb-ai-agents`.
- Complete tested release ZIP and unpacked website / Manager / Developer Worker code are committed.
- `.github/workflows/mapleweb-import-release.yml` successfully imported release.
- `.github/workflows/mapleweb-dev-tests.yml` passed.
- `.github/workflows/mapleweb-developer-bundle-check.yml` passed Cloudflare bundling without deployment.
- `.github/workflows/mapleweb-staging-deploy.yml` is a **manual or one-time-request** deployment workflow for two separate staging Workers using the existing D1 database named `mapleweb-agent-staging`. It does not run automatically on ordinary commits.

## NOT complete / verified

1. Separate Cloudflare staging Workers `mapleweb-ai-manager-staging` and `mapleweb-ai-developer-staging` have not been deployed or smoke-tested.
2. Private customer submissions have not been connected to Cloudflare D1, Turnstile, or Manager review/delivery.
3. A private Manager access token is not configured. A working management interface and email notification flow have not been built.
4. Real-device testing and final privacy notice/retention owner decisions remain open.
5. Publishing customer websites is prohibited until both customer and owner approval for the same version; the current Workers never auto-publish.

## Exact external blocker

GitHub Actions secure credential audit on 18 November 2026 confirmed **no Cloudflare API token is configured**. The account ID and expected staging URLs are now known to the staging workflow, so the remaining CI credential is a scoped secret named `CLOUDFLARE_API_TOKEN` (or `CF_API_TOKEN`) in repository or `mapleweb-staging` environment.

Never paste this secret into source or chat. Generate in the Cloudflare dashboard and set it in GitHub Actions Secrets, scoped to the required account and least-privilege Worker/D1 permissions. Once present, a normal authorized maintainer can dispatch the manual staging workflow or commit a one-time `.github/mapleweb-stage/deploy-request.txt` file to the development branch.

No purchases, domain changes, or customer-website publishing have been performed.
