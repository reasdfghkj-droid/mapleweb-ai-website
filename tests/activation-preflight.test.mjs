import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';

const run=spawnSync(process.execPath,['scripts/activation-preflight.mjs','--output-json'],{
 encoding:'utf8',
 env:{...process.env,
   CLOUDFLARE_API_TOKEN:'',CLOUDFLARE_ACCOUNT_ID:'',
   STRIPE_LIVE_SECRET_KEY:'',STRIPE_LIVE_WEBHOOK_SECRET:'',
   STRIPE_LIVE_ACCOUNT_ID:'',OWNER_BANK_PAYOUT_VERIFIED:'',
   END_TO_END_TEST_VERIFIED:'',MANAGER_TOKEN:''
 },
 timeout:10000
});
assert.equal(run.status,0,run.stderr);
const report=JSON.parse(run.stdout);
assert.equal(report.ready,false);
assert.equal(report.evaluated_read_only,true);
assert.equal(report.financial_actions_performed,false);
assert.equal(report.website_deployed_by_this_check,false);
assert.equal(report.customer_contacted_by_this_check,false);
assert.ok(report.total_checks>=25);
assert.ok(report.missing_checks>=4);
for(const x of report.checks){
 assert.equal(typeof x.ready,'boolean');
 assert.equal(typeof x.title,'string');
 assert.ok(x.id);
 assert.ok(x.action);
}
function status(id){
 const found=report.checks.find(x=>x.id===id);
 assert.ok(found,'Missing preflight check '+id);
 return found.ready;
}
assert.equal(status('public_worker'),true);
assert.equal(status('private_manager'),true);
assert.equal(status('d1_migration_files'),true);
assert.ok(fs.readFileSync('scripts/activation-preflight.mjs','utf8').includes('0009_customer_review_email.sql'),
 'Customer email migration must be in the mandatory launch preflight');
assert.equal(status('public_d1'),false);
assert.equal(status('private_d1'),false);
assert.equal(status('public_r2'),false);
assert.equal(status('private_r2'),false);
assert.equal(status('stripe_live'),false);
assert.equal(status('stripe_bank'),false);
assert.equal(status('end_to_end'),false);
assert.equal(status('safe_public_SUBMISSIONS_APPROVED'),true);
assert.equal(status('safe_public_CUSTOMER_PORTAL_APPROVED'),true);
assert.equal(status('safe_public_FINAL_SITE_FILES_APPROVED'),true);
assert.equal(status('safe_public_STRIPE_LIVE_WEBHOOKS_APPROVED'),true);
assert.equal(status('safe_private_STRIPE_LIVE_SEND_APPROVED'),true);
assert.equal(status('safe_private_MANAGER_API_APPROVED'),true);
const ui=fs.readFileSync('manager-ui/app.js','utf8');
const html=fs.readFileSync('manager-ui/index.html','utf8');
new vm.Script(ui,{filename:'manager-ui/app.js'});
assert.ok(html.includes('id="finishedSiteFolder"'));
assert.ok(html.includes('webkitdirectory'));
assert.ok(ui.includes('const folderFiles='));
assert.ok(ui.includes('const commonRoot='));
assert.ok(ui.includes("$('finishedSiteFolder').value=''"));
assert.ok(!ui.includes('localStorage'));
assert.ok(!ui.includes('sessionStorage'));
console.log('PASS launch preflight fails safely without account connections, hides secrets and preserves real folder paths');
