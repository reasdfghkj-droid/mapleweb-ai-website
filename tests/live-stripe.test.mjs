import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import {
 checkLiveStripeAccount,getLivePayoutSummary,createLiveInvoiceDraft,
 sendApprovedLiveInvoice,processLiveStripeWebhook
} from '../workers/stripe-live.mjs';
import {handleOwnerRequest} from '../workers/owner-api.mjs';
import publicWorker from '../workers/developer.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;

const pid='11111111-1111-4111-8111-111111111111';
const now=new Date();
const past=ms=>new Date(now.getTime()-ms).toISOString();
const row={
 id:pid,name:'Dummy Customer',email:'example@example.com',
 status:'DELIVERED',row_version:15,current_version:1,
 quote_approved_version:1,customer_approved_version:1,owner_approved_version:1,
 preview_verified:1,security_check_passed:1,outstanding_revisions:0,
 quote_accepted_at:past(1000000),delivered_at:past(500000),
 delivery_confirmed_at:past(300000),invoice_due_terms_accepted:1,
 owner_approved_invoice:1,approved_final_total_cad_cents:120000,
 owner_approved_invoice_total_cad_cents:120000,invoice_due_days:14,
 stripe_invoice_id:null,stripe_customer_id:null,invoice_status:null,
 paid_at:null
};
const acctId='acct_1234567890ab';
const secret='sk_live_'+'z'.repeat(32);
const flags={
 STRIPE_LIVE_ACCOUNT_ID:acctId,STRIPE_LIVE_SECRET_KEY:secret,
 STRIPE_LIVE_ACCOUNT_VERIFIED:'true',STRIPE_LIVE_BANK_CONFIRMED:'true',
 STRIPE_LIVE_TAX_REVIEWED:'true',
 STRIPE_LIVE_DRAFTS_APPROVED:'true',STRIPE_LIVE_SEND_APPROVED:'true',
 STRIPE_LIVE_WEBHOOKS_APPROVED:'true'
};
let calls=[];
let account={
 id:acctId,country:'CA',charges_enabled:true,payouts_enabled:true,details_submitted:true
};
let invoiceStatus='draft',invoicePaid=false;
let stripeTotal=120000;
const invoice=()=>({
 id:'in_live_dummy',customer:'cus_live_dummy',
 status:invoiceStatus,livemode:true,currency:'cad',
 collection_method:'send_invoice',
 amount_due:stripeTotal,total:stripeTotal,
 amount_paid:invoicePaid?120000:0,
 paid:invoicePaid,
 metadata:{mapleweb_project_id:pid,mapleweb_project_version:'1'},
 hosted_invoice_url:'https://invoice.stripe.com/i/test_dummy'
});
const stripeFetch=async(url,init={})=>{
 calls.push({url,method:init.method,body:init.body,headers:init.headers});
 assert.ok(init.headers?.Authorization?.startsWith('Bearer sk_live_'));
 const path=new URL(url).pathname;
 if(path==='/v1/account')return Response.json(account);
 if(path==='/v1/payouts')return Response.json({data:[{
  id:'po_dummy',status:'paid',currency:'cad',amount:110000,
  arrival_date:Math.floor(Date.now()/1000)
 }]});
 if(path==='/v1/customers'&&init.method==='POST')return Response.json({id:'cus_live_dummy',livemode:true});
 if(path==='/v1/invoices'&&init.method==='POST')return Response.json({id:'in_live_dummy',status:'draft',livemode:true});
 if(path==='/v1/invoiceitems'&&init.method==='POST')return Response.json({id:'ii_live_dummy'});
 if(path==='/v1/invoices/in_live_dummy'&&init.method==='GET')return Response.json(invoice());
 if(path.endsWith('/finalize')&&init.method==='POST'){
  invoiceStatus='open';return Response.json(invoice());
 }
 if(path.endsWith('/send')&&init.method==='POST')return Response.json(invoice());
 throw Error('Unexpected Stripe endpoint '+path);
};
assert.equal((await checkLiveStripeAccount({})).ok,false);
assert.equal((await createLiveInvoiceDraft({},row,{},stripeFetch)).ok,false);
assert.equal(calls.length,0,'No unapproved calls to live Stripe');
assert.equal((await createLiveInvoiceDraft({},row,{
 ...flags,STRIPE_LIVE_SECRET_KEY:'sk_test_not_live'
},stripeFetch)).ok,false);
assert.equal(calls.length,0);

const accountStatus=await checkLiveStripeAccount(flags,stripeFetch);
assert.equal(accountStatus.ok,true);
assert.equal(accountStatus.payouts_enabled,true);
assert.equal(accountStatus.bank_details_returned_to_chat,false);
assert.equal(accountStatus.payout_transferred,false);
account={...account,payouts_enabled:false};
assert.equal((await checkLiveStripeAccount(flags,stripeFetch)).ok,false);
account={...account,payouts_enabled:true};
const payouts=await getLivePayoutSummary(flags,stripeFetch);
assert.equal(payouts.ok,true);
assert.equal(payouts.payouts[0].status,'paid');
assert.equal(payouts.payout_initiated_by_mapleweb,false);
assert.ok(!JSON.stringify(payouts).includes('bank_number'));

const statements=[];
const db={
 prepare(sql){
  const op={sql,bind(...args){this.args=args;return this},
   async run(){return {success:true,meta:{changes:1}}},
   async first(){
    if(sql.includes('FROM invoice_operations WHERE project_id=?'))
     return {status:'DRAFT_CREATED',stripe_customer_id:'cus_live_dummy',stripe_invoice_id:'in_live_dummy'};
    if(sql.includes('FROM projects WHERE id=?'))
     return {...row,stripe_invoice_id:'in_live_dummy',stripe_customer_id:'cus_live_dummy',
      invoice_status:'open'};
    throw Error('Unexpected D1 lookup '+sql);
   }
  };statements.push(op);return op;
 },
 async batch(ops){return ops.map(()=>({success:true,meta:{changes:1}}))}
};
const before=calls.length;
const preDelivery=await createLiveInvoiceDraft(db,{...row,status:'PREVIEW_READY'},flags,stripeFetch);
assert.equal(preDelivery.ok,false);
assert.equal(calls.length,before,'Never contact Stripe before completed delivery');
const noTax=await createLiveInvoiceDraft(db,row,{
 ...flags,STRIPE_LIVE_TAX_REVIEWED:'false'
},stripeFetch);
assert.equal(noTax.ok,false);
const draft=await createLiveInvoiceDraft(db,row,flags,stripeFetch);
assert.equal(draft.ok,true);
assert.equal(draft.mode,'live');
assert.equal(draft.draft_created,true);
assert.equal(draft.invoice_sent,false);
assert.equal(draft.customer_charged,false);
assert.equal(draft.bank_payout_initiated,false);
assert.ok(statements.some(s=>s.sql.includes('INSERT OR IGNORE INTO invoice_operations')));
assert.ok(statements.some(s=>s.sql.includes("status='DRAFT_CREATED'")));
const draftCalls=calls.slice(before);
assert.ok(draftCalls.some(c=>c.url.endsWith('/v1/customers')));
assert.ok(draftCalls.some(c=>c.url.endsWith('/v1/invoices')));
assert.ok(draftCalls.some(c=>c.url.endsWith('/v1/invoiceitems')));
assert.ok(!draftCalls.some(c=>c.url.endsWith('/finalize')||c.url.endsWith('/send')));
assert.ok(draftCalls.filter(c=>c.method==='POST').every(c=>c.headers['Idempotency-Key']));

const readyToSend={...row,stripe_invoice_id:'in_live_dummy',
 stripe_customer_id:'cus_live_dummy',invoice_status:'draft'};
const disabledSend=await sendApprovedLiveInvoice(db,readyToSend,{
 ...flags,STRIPE_LIVE_SEND_APPROVED:'false'
},stripeFetch);
assert.equal(disabledSend.ok,false);
const sendStart=calls.length;
stripeTotal=130000;
const mismatch=await sendApprovedLiveInvoice(db,readyToSend,flags,stripeFetch);
assert.equal(mismatch.ok,false);
assert.ok(!calls.slice(sendStart).some(c=>c.url.endsWith('/send')));
stripeTotal=120000;
invoiceStatus='draft';
const sent=await sendApprovedLiveInvoice(db,readyToSend,flags,stripeFetch);
assert.equal(sent.ok,true);
assert.equal(sent.invoice_sent,true);
assert.equal(sent.customer_charged,false);
assert.equal(sent.customer_can_pay_via_stripe,true);
assert.equal(sent.invoice_paid,false);
assert.equal(sent.bank_payout_initiated,false);
assert.ok(sent.hosted_invoice_url.startsWith('https://invoice.stripe.com/'));
assert.ok(calls.some(c=>c.url.endsWith('/finalize')));
assert.ok(calls.some(c=>c.url.endsWith('/send')));
assert.ok(statements.some(s=>s.sql.includes("status='SENT'")));

const webhookSecret='whsec_live_dummy';
const evt={id:'evt_live_dummy123',livemode:true,type:'invoice.paid',
 data:{object:{id:'in_live_dummy'}}};
const raw=JSON.stringify(evt);
const timestamp=Math.floor(Date.now()/1000);
const key=await crypto.subtle.importKey('raw',
 new TextEncoder().encode(webhookSecret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
const sig=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(timestamp+'.'+raw));
const hex=[...new Uint8Array(sig)].map(x=>x.toString(16).padStart(2,'0')).join('');
const headers={'Stripe-Signature':'t='+timestamp+',v1='+hex};
const webhookEnv={...flags,STRIPE_LIVE_WEBHOOK_SECRET:webhookSecret,DB:db};
const noHook=await processLiveStripeWebhook(
 new Request('https://site.example/api/stripe/live-webhook',{
  method:'POST',headers,body:raw
 }),{...webhookEnv,STRIPE_LIVE_WEBHOOKS_APPROVED:'false'},stripeFetch);
assert.equal(noHook.status,503);
const forgery=await processLiveStripeWebhook(
 new Request('https://site.example/api/stripe/live-webhook',{
  method:'POST',headers:{'Stripe-Signature':'t=0,v1=bad'},body:raw
 }),webhookEnv,stripeFetch);
assert.equal(forgery.status,400);
invoiceStatus='paid';invoicePaid=true;
const paid=await processLiveStripeWebhook(
 new Request('https://site.example/api/stripe/live-webhook',{
  method:'POST',headers,body:raw
 }),webhookEnv,stripeFetch);
assert.equal(paid.status,200);
const result=await paid.json();
assert.equal(result.payment_confirmed_at_stripe,true);
assert.equal(result.bank_payout_confirmed,false);

const publicCfg=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8'));
const managerCfg=JSON.parse(fs.readFileSync('wrangler.manager.jsonc','utf8'));
assert.equal(publicCfg.vars.STRIPE_LIVE_WEBHOOKS_APPROVED,'false');
assert.equal(managerCfg.vars.STRIPE_LIVE_DRAFTS_APPROVED,'false');
assert.equal(managerCfg.vars.STRIPE_LIVE_SEND_APPROVED,'false');
assert.equal(managerCfg.vars.STRIPE_LIVE_BANK_CONFIRMED,'false');
assert.equal(managerCfg.workers_dev,false);
new vm.Script(fs.readFileSync('manager-ui/app.js','utf8'));
const blocked=await publicWorker.fetch(new Request('https://site.example/api/stripe/live-webhook',{
 method:'POST',headers,body:raw
}),{});
assert.equal(blocked.status,503);
const publicAdmin=await publicWorker.fetch(new Request('https://site.example/api/manager/live-payouts'),{});
assert.equal(publicAdmin.status,404);
const ownerDisabled=await handleOwnerRequest(new Request('https://private.example/api/manager/live-stripe-status'),{});
assert.equal(ownerDisabled.status,503);
console.log('PASS Stripe LIVE fail-closed invoice draft, signed quote and delivery gate, explicit send, signed payment confirmation and payout visibility without bank access');
