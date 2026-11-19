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
// The conversation UI is in an external, first-party script shared by both pages.
const conversation=fs.readFileSync('public/chat-experience.js','utf8');
const conversationCSS=fs.readFileSync('public/chat-experience.css','utf8');
for(const h of [html,chat]) {
  assert.ok(h.includes('/chat-experience.js'),'Conversation script must load');
  assert.ok(h.includes('/chat-experience.css'),'Conversation styles must load');
  assert.ok(h.includes('id="chat-form"'),'Accessible chat form must remain');
  assert.ok(h.includes('id="log"'),'Accessible chat history must remain');
  assert.ok(!h.includes("action:'mapleweb_submit'"),'Obsolete submission logic must not remain inline');
}
assert.ok(conversation.includes('Preview sample website'),'Sample preview action required');
assert.ok(conversation.includes('Copy my plan'),'Plan copy action required');
assert.ok(conversation.includes('looksSensitive'),'Sensitive-input guard required');
assert.ok(conversation.includes('No automatic submission'),'No-submission disclosure required');
assert.ok(conversation.includes('not a connected generative AI model'),'Model limitation disclosure required');
assert.ok(!conversation.includes("fetch('/api/submit'"),'Chat must never automatically submit customer data');
assert.ok(!conversation.includes('localStorage')&&!conversation.includes('sessionStorage'),'Chat must not persist customer messages');
assert.ok(conversationCSS.includes('mw-conversation'),'Conversation layout CSS missing');
const cfg=fs.readFileSync('workers/wrangler.staging.jsonc','utf8');
assert.ok(cfg.includes('"SUBMISSIONS_APPROVED": "false"'));
assert.ok(cfg.includes('"name": "mapleweb-ai-agents-staging"'));
assert.ok(!cfg.includes('api_token'));
console.log('Approved homepage copy, private conversation studio, safe sample previews and staging config verified.');
