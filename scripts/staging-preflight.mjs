/** Offline safety audit. Refuses production config or prematurely enabled customer intake. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
const config = JSON.parse(fs.readFileSync('workers/wrangler.staging.jsonc','utf8'));
assert.equal(config.name, 'mapleweb-ai-agents-staging', 'Staging Worker name required');
assert.equal(config.main, 'mapleweb-agents.mjs');
assert.equal(config.workers_dev, true);
assert.equal(config.vars?.SUBMISSIONS_APPROVED,'false','Customer intake must remain disabled');
assert.equal(config.vars?.RETENTION_DAYS,'30','Review retention before enabling customer intake');
assert.equal(config.assets?.directory,'../public');
assert.equal(config.assets?.binding,'ASSETS');
assert.ok(Array.isArray(config.assets?.run_worker_first) && config.assets.run_worker_first.includes('/api/*'));
assert.ok(!('routes' in config) && !('route' in config) && !('zone_id' in config),'Must not connect production domain');
assert.ok(!('account_id' in config),'Do not hardcode an account');
const files=['public/index.html','public/build-with-ai.html','workers/mapleweb-agents.mjs','workers/schema.sql','tests/agents.test.mjs'];
for(const file of files)assert.ok(fs.existsSync(file),`Missing ${file}`);
const worker=fs.readFileSync('workers/mapleweb-agents.mjs','utf8');
assert.ok(worker.includes("action: 'ASSESS_ONLY_NO_PUBLISH'"));
assert.ok(worker.includes("env.SUBMISSIONS_APPROVED === 'true'"));
assert.ok(worker.includes('RATE_LIMIT_SECRET'));
assert.ok(worker.includes('data.hostname === new URL(expectedOrigin).hostname'));
assert.ok(worker.includes('data.action === TURNSTILE_ACTION'));
assert.ok(worker.includes('DELETE_EXPIRED_SUBMISSIONS'));
for (const [path,name,main] of [
  ['workers/wrangler.developer.staging.jsonc','mapleweb-ai-developer-staging','developer.mjs'],
  ['workers/wrangler.manager.staging.jsonc','mapleweb-ai-manager-staging','manager.mjs']
]) {
  const worker=JSON.parse(fs.readFileSync(path,'utf8'));
  assert.equal(worker.name,name);
  assert.equal(worker.main,main);
  assert.equal(worker.workers_dev,true);
  assert.ok(!('routes' in worker) && !('route' in worker));
  assert.ok(!('account_id' in worker));
  if (main==='developer.mjs') {
    assert.equal(worker.assets?.directory,'../public');
    assert.equal(worker.vars?.SUBMISSIONS_APPROVED,'false');
  } else {
    assert.ok(!worker.assets, 'Manager must not serve the customer website');
    assert.ok(!('SUBMISSIONS_APPROVED' in (worker.vars||{})));
  }
}
console.log('PASS staging preflight: no production route, disabled submissions, verified manager and rate protection.');
