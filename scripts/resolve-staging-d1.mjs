/** Map a verified existing D1 database to the exact staging Worker config.
 * No remote write is performed. Database must already exist.
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
const file = process.argv[2] || 'workers/wrangler.staging.jsonc';
const raw = fs.readFileSync(0,'utf8');
let result;
try { result = JSON.parse(raw); } catch { throw Error('Expected wrangler d1 list --json output on stdin'); }
const rows = Array.isArray(result) ? result : Array.isArray(result?.result) ? result.result : null;
assert.ok(rows, 'Expected an array of existing D1 databases');
const matches = rows.filter(db=>db.name==='mapleweb-agent-staging');
assert.equal(matches.length,1,'Expected exactly one existing staging database named mapleweb-agent-staging');
const id = matches[0].uuid || matches[0].id || matches[0].database_id;
assert.match(id,/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i,'Invalid D1 database UUID');
const config = JSON.parse(fs.readFileSync(file,'utf8'));
const workers = {
  'mapleweb-ai-agents-staging': 'mapleweb-agents.mjs',
  'mapleweb-ai-developer-staging': 'developer.mjs',
  'mapleweb-ai-manager-staging': 'manager.mjs',
};
assert.equal(config.main, workers[config.name], 'Unexpected staging Worker name/entrypoint');
if (config.name !== 'mapleweb-ai-manager-staging')
  assert.equal(config.vars?.SUBMISSIONS_APPROVED,'false');
else assert.ok(!('SUBMISSIONS_APPROVED' in (config.vars||{})), 'Manager must never accept submissions');
assert.ok(!('route' in config) && !('routes' in config));
config.d1_databases = [{binding:'DB',database_name:'mapleweb-agent-staging',database_id:id}];
fs.writeFileSync(file,JSON.stringify(config,null,2)+'\n');
console.log('Bound pre-existing staging D1 database by exact name. Customer submissions remain disabled.');
