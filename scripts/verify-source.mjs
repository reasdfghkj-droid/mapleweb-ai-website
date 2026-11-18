import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('public/index.html','utf8');
const chat=fs.readFileSync('public/build-with-ai.html','utf8');
assert.match(html,/^<!doctype html>/i);
assert.match(chat,/^<!doctype html>/i);
for(const required of [
  'Your Business Deserves a Website',
  'Professional Websites. Smart Design. Real Business Growth.',
  'Build My Website with AI', 'Start with AI',
  '$500–$800', '$900–$1,500', '$1,500–$2,200',
  '$2,300–$3,000', '$3,000–$4,500', '$4,500–$7,000',
]) assert.ok(html.includes(required),`Missing approved homepage copy: ${required}`);
for(const h of [html,chat]) {
  assert.ok(h.includes('Preview a sample website'));
  assert.ok(h.includes('Secure submissions are not connected yet'));
  assert.ok(h.includes('turnstile'));
  assert.ok(h.includes("action:'mapleweb_submit'"),'Turnstile form action required');
  assert.ok(h.includes('turnstile.reset(captchaWidgetId)'),'Failed CAPTCHA must be retryable');
  assert.ok(h.includes('flex:0 0 18px'),'Consent checkbox must not collapse on mobile');
}
const cfg=fs.readFileSync('workers/wrangler.staging.jsonc','utf8');
assert.ok(cfg.includes('"SUBMISSIONS_APPROVED": "false"'));
assert.ok(cfg.includes('"name": "mapleweb-ai-agents-staging"'));
assert.ok(!cfg.includes('api_token'));
console.log('Approved homepage copy, optional draft previews, disabled submissions and staging config verified.');
