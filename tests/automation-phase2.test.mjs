import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { renderPrivateDraft,buildStarterProject,improveDraftWithAI } from '../workers/website-studio.mjs';
import {
  validId, cleanEvidence, planOwnerTransition, toInvoiceGateProject,
  invoiceAssessment, saveLeadAsProject
} from '../workers/order-engine.mjs';
import { verifyStripeSignature,createSandboxInvoiceDraft,processSandboxInvoiceWebhook } from '../workers/stripe-invoices.mjs';
import { handleOwnerRequest } from '../workers/owner-api.mjs';
import { buildWebsiteStarterBundle } from '../workers/site-bundle.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
import publicDeveloper from '../workers/developer.mjs';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const answers={
  business:'Blue <script>alert(1)</script> Café',
  goal:'Welcome local guests <img src=x onerror=alert(1)>',
  pages:'3–5 pages',features:'Photo gallery',budget:'$1,200',
  style:'Classic <script>',timeline:'Within 1 month'
};
const starter=buildStarterProject(answers);
assert.equal(starter.status,'NEW');
assert.equal(starter.generator,'fixed-template');
assert.equal(starter.ai_model_connected,false);
assert.equal(starter.published,false);
assert.ok(starter.draft_html.includes('&lt;script&gt;'));
assert.ok(!starter.draft_html.includes('<script>'));
assert.ok(!starter.draft_html.includes('<img src=x'));
assert.ok(starter.draft_html.includes('Content-Security-Policy'));
const html=renderPrivateDraft(answers,{heading:'<svg onload=alert(1)>',firstBody:'<script>x</script>'});
assert.ok(html.includes('&lt;svg'));
assert.ok(!html.includes('<svg '));
assert.ok(!html.includes('<script>'));

let runs=0;
const blocked=await improveDraftWithAI(answers,{AI:{run:async()=>{runs++}},AI_DRAFTS_APPROVED:'false'});
assert.equal(blocked.ready,false);assert.equal(runs,0);
const ai=await improveDraftWithAI(answers,{
  AI_DRAFTS_APPROVED:'true',AI:{
    run:async()=>{runs++;return {response:JSON.stringify({
      heading:'Welcome <script>danger</script>',
      description:'Real business site',
      firstTitle:'About',firstBody:'Safe, useful content',
      secondTitle:'Contact',secondBody:'We can help',callToAction:'Ask us'
    })};}
  }
});
assert.equal(ai.ready,true);assert.equal(ai.published,false);assert.equal(ai.requires_owner_review,true);
assert.equal(runs,1);assert.ok(!ai.draft_html.includes('<script>'));
assert.ok(ai.draft_html.includes('&lt;script&gt;'));

assert.equal(validId('11111111-1111-4111-8111-111111111111'),true);
assert.equal(validId('oh no'),false);
assert.equal(cleanEvidence('agreement/signed-2026-001'),'agreement/signed-2026-001');
assert.equal(cleanEvidence('https://example.com/?token=abc'),'');
const small=buildWebsiteStarterBundle({...answers,pages:'1–2 pages'});
const medium=buildWebsiteStarterBundle({...answers,pages:'3–5 pages'});
const big=buildWebsiteStarterBundle({...answers,pages:'5–7 pages',features:'Online store'});
assert.equal(small.pages,2);assert.equal(medium.pages,4);assert.equal(big.pages,6);
assert.equal(big.published,false);
assert.equal(big.advanced_integrations_connected,false);
for(const file of big.files){
  assert.ok(file.content.length>30);
  assert.ok(!file.content.includes('<script>'),'Starter kit must not run scripts');
  assert.ok(!file.content.includes('<img src=x'),'Customer input escaped');
}
assert.ok(big.files.some(f=>f.path==='styles.css'));
assert.ok(big.files.some(f=>f.path==='services.html'&&f.content.includes('proposals only')));
const ui=fs.readFileSync('manager-ui/app.js','utf8');
new vm.Script(ui,{filename:'owner-ui.js'});
assert.ok(!ui.includes('localStorage')&&!ui.includes('sessionStorage'),'Do not persist admin credentials');
const privateConfig=JSON.parse(fs.readFileSync('wrangler.manager.jsonc','utf8'));
assert.equal(privateConfig.workers_dev,false);
assert.equal(privateConfig.vars.MANAGER_API_APPROVED,'false');
assert.equal(privateConfig.vars.AI_DRAFTS_APPROVED,'false');
assert.equal(privateConfig.vars.STRIPE_TEST_DRAFTS_APPROVED,'false');
const now='2026-11-19T18:00:00.000Z';
const row={
 id:'11111111-1111-4111-8111-111111111111',
 status:'NEW',row_version:1,current_version:1,
 quote_approved_version:null,customer_approved_version:null,owner_approved_version:null,
 approved_final_total_cad_cents:null,owner_approved_invoice_total_cad_cents:null,
 quote_accepted_at:null,preview_verified:0,security_check_passed:0,outstanding_revisions:0,
 invoice_due_terms_accepted:0,owner_approved_invoice:0,delivered_at:null,
 delivery_confirmed_at:null,stripe_invoice_id:null,invoice_status:null,email:'test@example.com'
};
assert.equal(planOwnerTransition(row,'DELIVERED',{},now).ok,false);
assert.equal(planOwnerTransition(row,'REVIEWING',{},now).ok,true);
const reviewing={...row,status:'REVIEWING'};
assert.equal(planOwnerTransition(reviewing,'QUOTED',{approvedFinalTotalCadCents:90000},now).ok,false);
const quotedPlan=planOwnerTransition(reviewing,'QUOTED',{
 approvedFinalTotalCadCents:90000,invoiceDueDays:14,quoteEvidenceReference:'signed/quote-1'
},now);
assert.equal(quotedPlan.ok,true);
const quoted={...reviewing,...quotedPlan.fields};
assert.equal(planOwnerTransition(quoted,'ACCEPTED',{},now).ok,false);
const acceptedPlan=planOwnerTransition(quoted,'ACCEPTED',{
 customerQuoteAcceptanceReference:'customer/accepted-1'
},now);
assert.equal(acceptedPlan.ok,true);
assert.equal(acceptedPlan.fields.quote_acceptance_evidence_reference,'customer/accepted-1');
const accepted={...quoted,...acceptedPlan.fields};
assert.equal(planOwnerTransition(accepted,'BUILDING',{},now).ok,true);
const building={...accepted,status:'BUILDING'};
const previewPlan=planOwnerTransition(building,'PREVIEW_READY',{previewVerified:true,securityCheckPassed:true},now);
assert.equal(previewPlan.ok,true);
const preview={...building,...previewPlan.fields};
assert.equal(planOwnerTransition(preview,'DELIVERED',{},now).ok,false);
assert.equal(planOwnerTransition(preview,'REVISE',{},now).ok,false);
const revision=planOwnerTransition(preview,'REVISE',{revisionEvidenceReference:'revisions/customer-001'},now);
assert.equal(revision.ok,true);
assert.equal(revision.fields.status,'REVIEWING');
assert.equal(revision.fields.current_version,2);
assert.equal(revision.fields.quote_approved_version,null);
assert.equal(revision.fields.quote_accepted_at,null);
const deliveredPlan=planOwnerTransition(preview,'DELIVERED',{
 currentVersion:1,customerApproved:true,ownerApproved:true,
 deliveryEvidenceReference:'delivery/secure-handover-1',
 customerApprovalEvidenceReference:'approval/signed-v1',
 customerReceiptEvidenceReference:'receipt/customer-1'
},now);
assert.equal(deliveredPlan.ok,true);
assert.equal(deliveredPlan.fields.customer_receipt_evidence_reference,'receipt/customer-1');
const delivered={...preview,...deliveredPlan.fields,invoice_due_terms_accepted:1,
 owner_approved_invoice:1,delivered_at:'2026-11-19T18:00:00.000Z',
 delivery_confirmed_at:'2026-11-19T18:00:00.000Z',
 quote_accepted_at:'2026-11-19T17:00:00.000Z',
 approved_final_total_cad_cents:90000,owner_approved_invoice_total_cad_cents:90000};
assert.equal(invoiceAssessment(delivered).eligibleForOwnerDraftInvoice,true);
assert.equal(invoiceAssessment({...delivered,owner_approved_invoice:0}).eligibleForOwnerDraftInvoice,false);
assert.equal(invoiceAssessment({...delivered,delivered_at:null}).eligibleForOwnerDraftInvoice,false);
assert.equal(invoiceAssessment({...delivered,status:'PREVIEW_READY'}).eligibleForOwnerDraftInvoice,false);
assert.equal(invoiceAssessment({...delivered,invoice_status:'open'}).eligibleForOwnerDraftInvoice,false);
assert.equal(toInvoiceGateProject(delivered).paymentModel,'post_delivery');

// D1 mock proves consented requests use batch insert with matching submission and project.
const prepared=[];
const db={prepare(sql){const q={sql,bind(...params){this.params=params;return this}};prepared.push(q);return q},
  async batch(statements){assert.equal(statements.length,5);return statements.map(()=>({success:true,meta:{changes:1}}));}};
const lead=await saveLeadAsProject(db,{
  submissionId:'22222222-2222-4222-8222-222222222222',
  projectId:'33333333-3333-4333-8333-333333333333',
  name:'Test customer',email:'test@example.com',answers
});
assert.equal(lead.saved,true);
assert.equal(lead.private_preview_ready,true);
assert.equal(lead.payment_due_now,false);
assert.equal(lead.owner_inbox_recorded,true);
assert.equal(lead.developer_brief_queued,true);
assert.equal(lead.build_started,false);
assert.equal(lead.notification_email_sent,false);
assert.equal(lead.published,false);
assert.equal(prepared.length,5);
assert.ok(prepared.some(p=>p.sql.startsWith('INSERT INTO projects')));

let stripeCalls=0;
const disabledDraft=await createSandboxInvoiceDraft({},delivered,{},async()=>{stripeCalls++});
assert.equal(disabledDraft.ok,false);assert.equal(stripeCalls,0);
// Positive SANDBOX test: three remote calls create a DRAFT ONLY (no send, finalize, or charge).
const requests=[];
const fakeDb={
 prepare(sql){
   return {sql,bind(...params){this.params=params;return this},
     async run(){return {success:true,meta:{changes:1}}}};
 },
 async batch(stmts){return stmts.map(()=>({success:true,meta:{changes:1}}));}
};
const testKey='sk_test_'+ 'x'.repeat(32);
const testProject={...delivered,name:'Test buyer',invoice_due_days:14};
const fakeStripe=async(url,init)=>{
 requests.push({url,method:init.method,body:init.body||null});
 const path=new URL(url).pathname;
 if(path.endsWith('/customers'))return Response.json({id:'cus_sandbox123'});
 if(path.endsWith('/invoices'))return Response.json({id:'in_sandbox123',status:'draft'});
 if(path.endsWith('/invoiceitems'))return Response.json({id:'ii_sandbox123'});
 throw Error('Unexpected Stripe request '+path);
};
const draft=await createSandboxInvoiceDraft(fakeDb,testProject,
 {STRIPE_TEST_DRAFTS_APPROVED:'true',STRIPE_SECRET_KEY:testKey},fakeStripe);
assert.equal(draft.ok,true);
assert.equal(draft.invoice_sent,false);
assert.equal(draft.customer_charged,false);
assert.equal(requests.length,3);
assert.ok(requests.every(r=>r.method==='POST'));
assert.ok(requests.every(r=>!r.url.includes('send')&&!r.url.includes('finalize')));
assert.ok(requests[1].body.includes('auto_advance=false'));
assert.ok(requests[2].body.includes('amount=90000'));

// Signed webhook: accept exact payload/timestamp only, never tampered content.
const secret='whsec_some-test-secret';
const payload=JSON.stringify({id:'evt_test',type:'invoice.paid',data:{object:{id:'in_test'}}});
const timestamp=Math.floor(Date.now()/1000);
const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
const mac=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(timestamp+'.'+payload));
const signature=Array.from(new Uint8Array(mac),b=>b.toString(16).padStart(2,'0')).join('');
const header='t='+timestamp+',v1='+signature;
assert.equal(await verifyStripeSignature(payload,header,secret),true);
assert.equal(await verifyStripeSignature(payload+' ',header,secret),false);
assert.equal(await verifyStripeSignature(payload,header,'whsec_other'),false);
assert.equal(await verifyStripeSignature(payload,header,secret,(timestamp+601)*1000),false);

const hookResponse=await processSandboxInvoiceWebhook(new Request('https://example.com/api/stripe/webhook',{
 method:'POST',headers:{'Stripe-Signature':header},body:payload
}),{},async()=>{stripeCalls++});
assert.equal(hookResponse.status,503);
assert.equal(stripeCalls,0);
const paidEvent=JSON.stringify({id:'evt_paid_123',type:'invoice.paid',livemode:false,data:{object:{id:'in_sandbox123'}}});
const paidMac=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(timestamp+'.'+paidEvent));
const paidSignature=Array.from(new Uint8Array(paidMac),b=>b.toString(16).padStart(2,'0')).join('');
const verifiedDb={
 prepare(sql){
   return {sql,bind(...params){this.params=params;return this},
     async first(){return {stripe_invoice_id:'in_sandbox123',invoice_status:'draft',
       status:'DELIVERED',approved_final_total_cad_cents:90000,stripe_customer_id:'cus_sandbox123'}}};
 },
 async batch(s){return s.map(()=>({success:true,meta:{changes:1}}));}
};
const verifiedEnv={
 STRIPE_SANDBOX_WEBHOOKS_APPROVED:'true',STRIPE_TEST_DRAFTS_APPROVED:'true',
 STRIPE_SECRET_KEY:testKey,STRIPE_WEBHOOK_SECRET:secret,DB:verifiedDb
};
const paidHook=await processSandboxInvoiceWebhook(new Request('https://site.example/api/stripe/webhook',{
 method:'POST',headers:{'Stripe-Signature':'t='+timestamp+',v1='+paidSignature},body:paidEvent
}),verifiedEnv,async()=>Response.json({
 id:'in_sandbox123',status:'paid',currency:'cad',paid:true,livemode:false,
 amount_paid:90000,customer:'cus_sandbox123',metadata:{mapleweb_project_id:testProject.id}
}));
assert.equal(paidHook.status,200);

// Private owner routes are off unless explicitly configured.
const ownerRes=await handleOwnerRequest(new Request('https://example.com/api/manager/projects',{
 headers:{authorization:'Bearer test'}
}),{});
assert.equal(ownerRes.status,503);
// Public developer worker MUST NOT expose private owner API regardless of token.
const publicRes=await publicDeveloper.fetch(new Request('https://site.example/api/manager/projects'),{
 MANAGER_TOKEN:'a'.repeat(64),MANAGER_API_APPROVED:'true'
});
assert.equal(publicRes.status,404);

console.log('PASS: escaping, 2/4/6-page source bundles, optional AI, revisions, atomic intake, Stripe sandbox draft and signature recheck, private Manager and no live payments');
