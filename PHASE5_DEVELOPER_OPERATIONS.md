# MapleWeb AI — Phase 5 Developer Agent Operations

Updated November 19, 2026 (Toronto). Phase 5 includes backend code and tests, NOT active customer service.

## Work completed in code

1. Optional Workers AI multi-page content generator in workers/ai-website-developer.mjs. It uses consented website requirements, accepts only structured page text, escapes all text through safe HTML templates, and never executes model-generated scripts, forms or payment code.
2. Existing Website Developer queue now writes private AI/fixed-template multi-page homepage previews into protected project storage and logs the owner review event.
3. Paid AI inference requires all three explicit flags AUTO_BUILD_HANDOFF_APPROVED=true, AI_DRAFTS_APPROVED=true, and AI_DEVELOPER_APPROVED=true plus a valid private Workers AI binding. All flags default to false. Model calls in tests are mocked; no paid model was called.
4. Failed AI calls cannot be automatically retried. Agent job records identify AI generation before calling the model.
5. The private Manager dashboard and API now include a job queue, status and limited private batch processing.
6. Owner-only recovery can mark jobs stalled for at least 30 minutes as FAILED. It does not retry AI.
7. A failed fixed-template job can be retried manually once. Migration 0005_agent_recovery.sql enforces the database retry limit. AI jobs cannot use this option.
8. A future scheduled-processing handler is prepared but NO Cloudflare Cron trigger is configured. The batch feature defaults off and rejects paid AI mode.
9. Previous six approved CAD price ranges and post-delivery payment policy remain unchanged. Public website styling was not changed.

## New files and important modifications

- workers/ai-website-developer.mjs — structured, owner-approved Workers AI website drafts.
- workers/site-bundle.mjs — safe per-page AI copy rendering.
- workers/developer-handoff.mjs — improved job processing and private preview.
- workers/agent-operations.mjs — private backlog, stalled jobs and one-time retries.
- workers/owner-api.mjs — owner-only operations.
- workers/manager.mjs — disabled future scheduled handler.
- manager-ui/index.html and manager-ui/app.js — private queue controls.
- migrations/0005_agent_recovery.sql — single retry constraint.
- tests/agent-operations.test.mjs and .github/workflows/phase5-agent-operations.yml — security and regression tests.

## Not yet operational

- Cloudflare customer database and secure intake still require D1, Turnstile, privacy and retention activation.
- The private Manager Worker must be deployed behind verified Cloudflare Access and a secure token.
- Real AI inference and builder costs are NOT approved or enabled.
- AI-written drafts are not completed bespoke customer websites; advanced booking, checkout and store integrations need additional services and tests.
- Real customer delivery, customer email notifications, live Stripe invoicing and bank payouts are not enabled.

## Later owner-dependent activation

1. Verify the correct Cloudflare account. Create D1, apply migrations 0001 through 0005 and bind the database privately to both Workers.
2. Configure verified origin, Turnstile, rate limiting, consent, privacy notice, and customer-data deletion before opening secure public intake.
3. Deploy a protected private Manager Worker behind Cloudflare Access. Use a strong encrypted MANAGER_TOKEN and confirm the public Worker cannot see Manager operations.
4. Test fake customer orders end-to-end through the queue, private draft, review and notification inbox.
5. Before approving Workers AI, review pricing, quotas, data handling, billing and content quality. Without explicit approval the AI flags must remain false.
6. Connect full website build tools, customer preview approval and final delivery processes.
7. Respect the established business rule: customers receive their completed approved website BEFORE paying. No deposits. Live Stripe and a verified Canadian bank connection are separately required.

## Verification and safety

GitHub CI runs all existing customer order, price, Stripe, preview and security tests, the new agent operations tests, all five database migrations and dry-run builds of both Workers. A passing CI run proves code-level tests only, not live customer integration. No paid AI calls, new invoices, customer emails, customer website publications, purchases or bank changes were performed.
