/**
 * MapleWeb AI launch readiness preflight.
 *
 * Read-only. Never buys services, deploys, migrates, calls a paid AI model,
 * sends real customer email, issues an invoice, or opens a bank account.
 * Reports secret PRESENCE ONLY. A secret present != account verified.
 *
 * Local use: node scripts/activation-preflight.mjs
 * CI use:    node scripts/activation-preflight.mjs --output-json
 */
import fs from 'node:fs';
import path from 'node:path';

function load(file){
 try{
  const value=JSON.parse(fs.readFileSync(file,'utf8'));
  if(!value||typeof value!=='object')throw Error('Invalid config');
  return value;
 }catch{return null;}
}
const exists=(file)=>fs.existsSync(file)&&fs.statSync(file).size>0;
const present=(name)=>typeof process.env[name]==='string'&&process.env[name].trim().length>0;
const checks=[];
function check(id,title,passed,action,kind='configuration'){
 checks.push({id,title,ready:passed===true,kind,action:passed?'None; verify via separate real-world tests':action});
}
const customer=load('wrangler.jsonc');
const manager=load('wrangler.manager.jsonc');
check('public_worker','Customer-facing Cloudflare Worker exists',
  Boolean(customer?.main&&exists(customer.main)),
  'Restore the customer-facing Worker config and entry file');
check('private_manager','Separate non-public Manager Worker is prepared',
  Boolean(manager?.main&&exists(manager.main)&&manager.workers_dev===false),
  'Configure private Manager Worker with workers_dev=false and a protected Cloudflare Access route');
const migrations=[
 '0001_secure_sales_submissions.sql',
 '0002_orders_projects_and_billing.sql',
 '0003_private_previews_notifications.sql',
 '0004_developer_handoff_queue.sql',
 '0005_agent_recovery.sql',
 '0006_delivery_quality_reviews.sql',
 '0007_customer_review_tokens.sql',
 '0008_final_website_artifacts.sql'
];
check('d1_migration_files','All eight D1 migration files exist',
 migrations.every(name=>exists(path.join('migrations',name))),
 'Restore all schema migrations before creating customer records');
function binding(conf,key,binding){
 return Array.isArray(conf?.[key])&&conf[key].some(entry=>entry?.binding===binding);
}
check('public_d1','Secure D1 storage bound to the public Worker',
 binding(customer,'d1_databases','DB'),'Create and bind a private D1 database, then safely apply migrations 0001–0008');
check('private_d1','Same secure D1 storage bound to private Manager',
 binding(manager,'d1_databases','DB'),'Bind the same verified D1 database to the protected Manager');
check('public_r2','Private finished-site R2 storage bound to the customer Worker',
 binding(customer,'r2_buckets','FINAL_SITE_BUCKET'),
 'Create a PRIVATE R2 bucket with no r2.dev public access and bind it as FINAL_SITE_BUCKET');
check('private_r2','Private finished-site R2 storage bound to Manager',
 binding(manager,'r2_buckets','FINAL_SITE_BUCKET'),
 'Bind the same private R2 bucket to the protected Manager');
check('cloudflare_deployment_access','Cloudflare deployment credentials present in this runner',
 present('CLOUDFLARE_API_TOKEN')&&present('CLOUDFLARE_ACCOUNT_ID'),
 'Set a least-privilege Cloudflare API token and account ID in protected GitHub repository secrets');
check('turnstile_approval','Cloudflare Turnstile and rate limit secrets present',
 present('TURNSTILE_SECRET')&&present('RATE_LIMIT_SECRET')&&present('TURNSTILE_SITE_KEY'),
 'Create and test a Turnstile widget for the actual public host; store secrets only in Cloudflare');
check('manager_access','Private Manager authentication configured',
 present('MANAGER_TOKEN')&&present('CLOUDFLARE_ACCESS_VERIFIED'),
 'Protect Manager with Cloudflare Access and an independent encrypted 32+ character token');
check('customer_contact','Customer notification provider configured',
 present('VERIFIED_CUSTOMER_EMAIL_FROM')&&present('CUSTOMER_EMAIL_PROVIDER_KEY'),
 'Verify an approved customer email sending domain and secure the provider credentials');
check('stripe_live','Live Stripe credentials and account verification available',
 present('STRIPE_LIVE_SECRET_KEY')&&present('STRIPE_LIVE_ACCOUNT_ID')&&present('STRIPE_LIVE_WEBHOOK_SECRET'),
 'Activate a live Canadian Stripe account, verify payouts and configure a signed live webhook');
check('stripe_bank','Canadian bank payout verification documented',
 present('OWNER_BANK_PAYOUT_VERIFIED'),
 'Add and verify the bank in Stripe Dashboard and check live payout status; never share bank details in chat');
check('privacy_review','Customer consent, privacy and retention review acknowledged',
 present('PRIVACY_NOTICE_OWNER_APPROVED'),
 'Review the privacy notice, consent, retention, deletion and email communications policy');
check('completed_site_deploy','Complete customer website publishing/hosting integration verified',
 present('CUSTOMER_SITE_HOSTING_VERIFIED'),
 'Review and test how actual custom sites are hosted, published and handed to each customer, with approval');
check('end_to_end','Real-world end-to-end test with consented dummy customer performed',
 present('END_TO_END_TEST_VERIFIED'),
 'Test order > Developer > quote > approved completed site > handover > post-delivery Stripe > payout');
for(const key of [
 'SUBMISSIONS_APPROVED','AUTO_BUILD_HANDOFF_APPROVED',
 'CUSTOMER_PORTAL_APPROVED','FINAL_SITE_FILES_APPROVED',
 'STRIPE_LIVE_WEBHOOKS_APPROVED'
]) {
 check('safe_public_'+key,'Public '+key+' has safe default OFF',
  customer?.vars?.[key]==='false',
  'Set this feature to false in version-controlled defaults and enable only through reviewed protected deployment');
}
for(const key of [
 'MANAGER_API_APPROVED','AI_DRAFTS_APPROVED','AI_DEVELOPER_APPROVED',
 'AUTO_AGENT_BATCH_APPROVED','STRIPE_LIVE_DRAFTS_APPROVED',
 'STRIPE_LIVE_SEND_APPROVED'
]){
 check('safe_private_'+key,'Private '+key+' has safe default OFF',
   manager?.vars?.[key]==='false',
   'Keep paid, privileged and financial operations disabled in source defaults');
}
const outcome={
 name:'MapleWeb AI full-business launch readiness',
 generated_at:new Date().toISOString(),
 evaluated_read_only:true,
 ready:false,
 total_checks:checks.length,
 passed_checks:checks.filter(x=>x.ready).length,
 missing_checks:checks.filter(x=>!x.ready).length,
 warning:'Presence checks do NOT prove a provider account works, a website is finished, legal terms are adequate or a bank payout occurred.',
 checks,
 financial_actions_performed:false,
 website_deployed_by_this_check:false,
 customer_contacted_by_this_check:false
};
// Even with every local/secret presence check passing, do not claim true
// go-live readiness without authoritative external service tests.
outcome.ready=false;
if(process.argv.includes('--output-json')){
 console.log(JSON.stringify(outcome,null,2));
}else{
 console.log('MAPLEWEB AI BUSINESS SYSTEM — READ-ONLY PRELAUNCH CHECK');
 console.log(outcome.passed_checks+'/'+outcome.total_checks+' static/preflight checks pass');
 console.log('FULLY OPERATIONAL: NO — independent live-account and customer-flow verification required');
 for(const item of outcome.checks.filter(x=>!x.ready)){
  console.log('- '+item.title+': '+item.action);
 }
 console.log('No secrets, banking details, invoices, paid calls or customer data were accessed.');
}
