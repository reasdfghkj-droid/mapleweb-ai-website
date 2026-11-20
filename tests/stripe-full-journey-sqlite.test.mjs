/**
 * MapleWeb AI: real SQLite + mocked Stripe API, post-delivery integration.
 *
 * The database executes ACTUAL production D1 migrations and prepared SQL.
 * Stripe responses are simulated; NO real Stripe account, email or bank used.
 * The test proves the payment ledger cannot start before owner approval.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {webcrypto,randomUUID} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {handleOwnerRequest} from '../workers/owner-api.mjs';
import {invoiceAssessment} from '../workers/order-engine.mjs';
import {
 createLiveInvoiceDraft,sendApprovedLiveInvoice,processLiveStripeWebhook
} from '../workers/stripe-live.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const sql=new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON;');
for(const name of [
 '0001_secure_sales_submissions.sql','0002_orders_projects_and_billing.sql',
 '0003_private_previews_notifications.sql','0004_developer_handoff_queue.sql',
 '0005_agent_recovery.sql','0006_delivery_quality_reviews.sql',
 '0007_customer_review_tokens.sql','0008_final_website_artifacts.sql',
 '0009_customer_review_email.sql'
])sql.exec(fs.readFileSync('migrations/'+name,'utf8'));
function prepared(query,args=[]){
 const statement=sql.prepare(query);
 return {
  bind(...vals){return prepared(query,vals)},
  async run(){const r=statement.run(...args);return {success:true,meta:{changes:Number(r.changes)}}},
  async first(){return statement.get(...args)||null},
  async all(){return {results:statement.all(...args)}}
 };
}
const db={
 prepare(q){return prepared(q)},
 async batch(statements){
  sql.exec('BEGIN IMMEDIATE;');
  try{
   const res=[];
   for(const statement of statements)res.push(await statement.run());
   sql.exec('COMMIT;');
   return res;
  }catch(e){sql.exec('ROLLBACK;');throw e;}
 }
};
const id=randomUUID(),sid=randomUUID();
const now=Date.now(),dt=offset=>new Date(now-offset).toISOString();
const at=dt(12000000),quoteAt=dt(7200000),deliveredAt=dt(3600000),confirmedAt=dt(1800000);
sql.prepare('INSERT INTO submissions(id,created_at,name,email,answers_json,status) VALUES (?,?,?,?,?,?)')
 .run(sid,at,'Test Customer','dummy@example.org','{}','NEW');
sql.prepare('INSERT INTO projects(id,submission_id,created_at,updated_at,status,draft_html) VALUES (?,?,?,?,?,?)')
 .run(id,sid,at,confirmedAt,'DELIVERED','<!doctype html><html><body>Delivered dummy website</body></html>');
sql.prepare(
 'UPDATE projects SET quote_approved_version=1,customer_approved_version=1,owner_approved_version=1,'+
 'preview_verified=1,security_check_passed=1,outstanding_revisions=0,'+
 'approved_final_total_cad_cents=120000,owner_approved_invoice_total_cad_cents=120000,'+
 'quote_accepted_at=?,delivered_at=?,delivery_confirmed_at=?,'+
 'invoice_due_days=14,invoice_due_terms_accepted=1,owner_approved_invoice=0,'+
 'quote_evidence_reference=?,quote_acceptance_evidence_reference=?,'+
 'customer_approval_evidence_reference=?,customer_receipt_evidence_reference=?,'+
 'delivery_evidence_reference=? WHERE id=?'
).run(quoteAt,deliveredAt,confirmedAt,
 'owner/quote-accepted-v1','customer/quote-accepted-v1',
 'customer/site-approval-v1','customer/receipt-v1','handover/complete-v1',id);
const checks={
 completeWebsiteBuilt:true,allContractedFeaturesImplemented:true,
 customerContactPathsTested:true,mobileAndAccessibilityReviewed:true,
 securityAndPrivacyTested:true,domainHostingAndOwnershipExplained:true,
 backupsAndFilesVerified:true,customerHandoverPrepared:true,
 paidIntegrationsConfirmed:true,noOpenCriticalDefects:true
};
sql.prepare(
 'INSERT INTO delivery_quality_reviews(project_id,version,created_at,delivery_method,'+
 'final_artifact_reference,functional_test_reference,security_test_reference,'+
 'mobile_accessibility_reference,ownership_handover_reference,'+
 'customer_support_reference,checklist_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
).run(id,1,confirmedAt,'SOURCE_TRANSFER','final-artifact/site-v1',
 'tests/features-v1','tests/security-v1','tests/accessibility-v1',
 'handover/owner-v1','handover/support-v1',JSON.stringify(checks));
function project(){
 return sql.prepare('SELECT p.*,s.name,s.email,s.answers_json FROM projects p '+
  'JOIN submissions s ON s.id=p.submission_id WHERE p.id=?').get(id);
}
let row=project();
assert.equal(row.status,'DELIVERED');
assert.equal(invoiceAssessment(row).eligibleForOwnerDraftInvoice,false);
assert.ok(invoiceAssessment(row).blockers.some(x=>x.includes('Owner has not approved')));
const accountId='acct_1234567890abc',customerId='cus_dummy_live_1',invoiceId='in_dummy_live_1';
const key='sk_live_'+'z'.repeat(34);
const flags={
 STRIPE_LIVE_DRAFTS_APPROVED:'true',
 STRIPE_LIVE_SEND_APPROVED:'true',
 STRIPE_LIVE_ACCOUNT_VERIFIED:'true',
 STRIPE_LIVE_BANK_CONFIRMED:'true',
 STRIPE_LIVE_TAX_REVIEWED:'true',
 STRIPE_LIVE_WEBHOOKS_APPROVED:'true',
 STRIPE_LIVE_ACCOUNT_ID:accountId,
 STRIPE_LIVE_SECRET_KEY:key,
 STRIPE_LIVE_WEBHOOK_SECRET:'whsec_dummy_demo_signature'
};
let requests=[],invoiceState='draft',paid=false,total=120000;
const invoice=()=>({
 id:invoiceId,livemode:true,status:invoiceState,
 currency:'cad',collection_method:'send_invoice',
 customer:customerId,
 metadata:{mapleweb_project_id:id,mapleweb_project_version:'1'},
 total,amount_due:total,amount_paid:paid?total:0,paid,
 hosted_invoice_url:'https://invoice.stripe.com/i/dummy-test',
});
const api=async(url,init={})=>{
 const p=new URL(url).pathname;
 requests.push({p,method:init.method,headers:init.headers});
 assert.ok(init.headers.Authorization.startsWith('Bearer sk_live_'));
 if(p==='/v1/account')return Response.json({
  id:accountId,country:'CA',charges_enabled:true,
  payouts_enabled:true,details_submitted:true
 });
 if(p==='/v1/customers'&&init.method==='POST')return Response.json({
  id:customerId,livemode:true
 });
 if(p==='/v1/invoices'&&init.method==='POST')return Response.json({
  id:invoiceId,status:'draft',livemode:true
 });
 if(p==='/v1/invoiceitems'&&init.method==='POST')return Response.json({
  id:'ii_dummy_live_1'
 });
 if(p==='/v1/invoices/'+invoiceId&&init.method==='GET')return Response.json(invoice());
 if(p==='/v1/invoices/'+invoiceId+'/finalize'&&init.method==='POST'){
  invoiceState='open';return Response.json(invoice());
 }
 if(p==='/v1/invoices/'+invoiceId+'/send'&&init.method==='POST')
  return Response.json(invoice());
 throw Error('Unexpected mocked Stripe request '+p);
};
// Before explicit owner approval there must be NO external Stripe calls.
const blocked=await createLiveInvoiceDraft(db,row,flags,api);
assert.equal(blocked.ok,false);
assert.equal(requests.length,0);
const auth='a'.repeat(48);
const ownerEnv={DB:db,MANAGER_API_APPROVED:'true',MANAGER_TOKEN:auth};
const approve=await handleOwnerRequest(new Request(
 'https://private.example/api/manager/projects/'+id+'/approve-invoice',{
 method:'POST',headers:{Authorization:'Bearer '+auth,'Content-Type':'application/json'},
 body:JSON.stringify({confirm:'APPROVE_POST_DELIVERY_INVOICE',
  expectedRowVersion:row.row_version})
}),ownerEnv);
assert.equal(approve.status,200,await approve.text());
row=project();
assert.equal(row.owner_approved_invoice,1);
assert.equal(invoiceAssessment(row).eligibleForOwnerDraftInvoice,true);
// All external requests are fake; now exercise the actual live module SQL.
const draft=await createLiveInvoiceDraft(db,row,flags,api);
assert.equal(draft.ok,true,draft.error);
assert.equal(draft.draft_created,true);
assert.equal(draft.invoice_sent,false);
assert.equal(draft.customer_charged,false);
assert.equal(draft.bank_payout_initiated,false);
assert.ok(requests.some(x=>x.p==='/v1/customers'));
assert.ok(requests.some(x=>x.p==='/v1/invoiceitems'));
assert.ok(requests.filter(x=>x.method==='POST').every(x=>x.headers['Idempotency-Key']));
row=project();
assert.equal(row.invoice_status,'draft');
assert.equal(row.stripe_customer_id,customerId);
assert.equal(row.stripe_invoice_id,invoiceId);
assert.equal(sql.prepare('SELECT status FROM invoice_operations WHERE project_id=?').get(id).status,
 'DRAFT_CREATED');
const duplicate=await createLiveInvoiceDraft(db,row,flags,api);
assert.equal(duplicate.ok,false,'Duplicate post-delivery invoice request must never create a second invoice');
const beforeSend=requests.length;
const disabled=await sendApprovedLiveInvoice(db,row,{
 ...flags,STRIPE_LIVE_SEND_APPROVED:'false'
},api);
assert.equal(disabled.ok,false);
assert.equal(requests.length,beforeSend);
const sent=await sendApprovedLiveInvoice(db,row,flags,api);
assert.equal(sent.ok,true,sent.error);
assert.equal(sent.invoice_sent,true);
assert.equal(sent.customer_charged,false);
assert.equal(sent.bank_payout_initiated,false);
assert.ok(requests.some(x=>x.p==='/v1/invoices/'+invoiceId+'/finalize'));
assert.ok(requests.some(x=>x.p==='/v1/invoices/'+invoiceId+'/send'));
row=project();
assert.equal(row.invoice_status,'open');
assert.equal(sql.prepare('SELECT status FROM invoice_operations WHERE project_id=?').get(id).status,'SENT');
assert.equal((await sendApprovedLiveInvoice(db,row,flags,api)).ok,false,
 'Sending a second invoice is not allowed');
async function signature(event){
 const raw=JSON.stringify(event),timestamp=Math.floor(Date.now()/1000);
 const imported=await crypto.subtle.importKey(
  'raw',new TextEncoder().encode(flags.STRIPE_LIVE_WEBHOOK_SECRET),
  {name:'HMAC',hash:'SHA-256'},false,['sign']
 );
 const sig=await crypto.subtle.sign('HMAC',imported,new TextEncoder().encode(timestamp+'.'+raw));
 const value=[...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,'0')).join('');
 return {raw,header:'t='+timestamp+',v1='+value};
}
const event={id:'evt_dummy_live_paid_1',livemode:true,type:'invoice.paid',
 data:{object:{id:invoiceId}}};
const goodSig=await signature(event);
const badWebhook=await processLiveStripeWebhook(new Request(
 'https://site.example/api/stripe/live-webhook',{
 method:'POST',headers:{'Stripe-Signature':'t=0,v1=broken'},body:goodSig.raw
}),{...flags,DB:db},api);
assert.equal(badWebhook.status,400);
assert.equal(project().invoice_status,'open');
invoiceState='paid';paid=true;
const receipt=await processLiveStripeWebhook(new Request(
 'https://site.example/api/stripe/live-webhook',{
 method:'POST',headers:{'Stripe-Signature':goodSig.header},body:goodSig.raw
}),{...flags,DB:db},api);
assert.equal(receipt.status,200,await receipt.text());
row=project();
assert.equal(row.invoice_status,'paid');
assert.ok(row.paid_at);
assert.equal(sql.prepare('SELECT status FROM invoice_operations WHERE project_id=?').get(id).status,'PAID');
assert.equal(sql.prepare('SELECT COUNT(*) AS c FROM stripe_webhook_events').get().c,1);
assert.equal(row.stripe_invoice_id,invoiceId);
const replay=await processLiveStripeWebhook(new Request(
 'https://site.example/api/stripe/live-webhook',{
 method:'POST',headers:{'Stripe-Signature':goodSig.header},body:goodSig.raw
}),{...flags,DB:db},api);
assert.equal(replay.status,200);
const again=await replay.json();
assert.equal(again.duplicate,true);
assert.equal(again.bank_payout_confirmed,false);
assert.equal(sql.prepare('SELECT COUNT(*) AS c FROM stripe_webhook_events').get().c,1);
assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length,0);
assert.equal(sql.prepare('SELECT COUNT(*) AS c FROM invoice_operations').get().c,1);
console.log('PASS REAL SQLITE & FAKE STRIPE: delivered website -> owner approval -> one CAD live draft -> verified send -> signed paid webhook -> replay-safe ledger; NO real charges or bank payouts');
