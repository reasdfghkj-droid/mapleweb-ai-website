import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import {
 hashCustomerToken,issueCustomerReviewLink,handleCustomerReview,
 receiptRecorded,listCustomerReviewLinks,revokeCustomerReviewLinks
} from '../workers/customer-review.mjs';
import {handleOwnerRequest} from '../workers/owner-api.mjs';
import publicWorker from '../workers/developer.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const id='11111111-1111-4111-8111-111111111111';
const origin='https://mapleweb-ai-website.example';
const managerToken='a'.repeat(48);
const project={
 id,submission_id:'22222222-2222-4222-8222-222222222222',
 status:'QUOTED',current_version:1,row_version:5,
 quote_approved_version:1,quote_accepted_at:null,quote_evidence_reference:'quote/signed-v1',
 approved_final_total_cad_cents:120000,invoice_due_days:14,
 customer_approved_version:null,customer_approval_evidence_reference:null,
 preview_verified:0,security_check_passed:0,outstanding_revisions:0,
 stripe_invoice_id:null,invoice_status:null,delivered_at:null,
 name:'Dummy customer',email:'example@example.com',answers_json:'{}'
};
let active=null, receiptId=null, qaApproved=true;
const statements=[];
const qaRow={
 version:1,created_at:'2026-11-19T19:00:00.000Z',
 delivery_method:'SOURCE_TRANSFER',
 final_artifact_reference:'handover/website-v1',
 functional_test_reference:'tests/features-v1',
 security_test_reference:'tests/security-v1',
 mobile_accessibility_reference:'tests/mobile-a11y-v1',
 ownership_handover_reference:'handover/owner-v1',
 customer_support_reference:'handover/support-v1',
 approved:1,
 checklist_json:JSON.stringify({
  completeWebsiteBuilt:true,allContractedFeaturesImplemented:true,
  customerContactPathsTested:true,mobileAndAccessibilityReviewed:true,
  securityAndPrivacyTested:true,domainHostingAndOwnershipExplained:true,
  backupsAndFilesVerified:true,customerHandoverPrepared:true,
  paidIntegrationsConfirmed:true,noOpenCriticalDefects:true
 })
};
const db={
 prepare(sql){
  const op={sql,bind(...args){this.args=args;return this},
   async first(){
    if(sql.includes('FROM customer_review_tokens WHERE project_id=?')){
      return active&&!active.used&&!active.revoked?{id:active.id}:null;
    }
    if(sql.includes('FROM customer_review_tokens t JOIN projects p')){
      const tokenHash=this.args[0];
      if(active&&!active.used&&!active.revoked&&active.hash===tokenHash)
       return {...project,token_id:active.id,project_id:id,version:active.version,
        purpose:active.purpose,expires_at:active.expires_at};
      return null;
    }
    if(sql.includes('FROM delivery_quality_reviews WHERE project_id=?')){
      return qaApproved?qaRow:null;
    }
    if(sql.includes('FROM customer_review_responses r')){
      return receiptId?{id:receiptId,created_at:new Date().toISOString()}:null;
    }
    if(sql.includes('SELECT p.*,s.name,s.email,s.answers_json FROM projects')){
      return {...project};
    }
    throw Error('Unexpected D1 lookup: '+sql);
   },
   async run(){
    if(sql.startsWith('INSERT INTO customer_review_tokens')){
      active={id:this.args[0],hash:this.args[4],purpose:this.args[3],
       version:this.args[2],expires_at:this.args[6],used:false,revoked:false};
    }
    if(sql.startsWith('UPDATE customer_review_tokens SET revoked_at')){
      if(active)active.revoked=true;
    }
    return {success:true,meta:{changes:1}};
   },
   async all(){
    if(sql.includes('FROM customer_review_tokens WHERE project_id=?'))
      return {results:active?[{id:active.id,version:active.version,purpose:active.purpose}]:[]};
    return {results:[]};
   }};
  statements.push(op);return op;
 },
 async batch(ops){
  if(ops[0]?.sql.startsWith('INSERT INTO customer_review_responses')){
    assert.equal(ops.length,4);
    assert.ok(ops[1].sql.includes('row_version=?'));
    assert.ok(ops[2].sql.includes('consumed_at=?'));
    assert.ok(ops[3].sql.includes('project_events'));
    if(active.purpose==='DELIVERY_RECEIPT')receiptId=active.id;
    active.used=true;
  }
  return ops.map(()=>({success:true,meta:{changes:1}}));
 }
};
const env={DB:db,CUSTOMER_PORTAL_APPROVED:'true',PUBLIC_SITE_ORIGIN:origin};
assert.equal(await hashCustomerToken('bad'),null);
assert.equal((await issueCustomerReviewLink(db,project,{
 ...env,CUSTOMER_PORTAL_APPROVED:'false'
},{purpose:'QUOTE'})).ok,false);
const quoteOpts={purpose:'QUOTE',currentVersion:1,expectedRowVersion:5,
 confirm:'ISSUE_SINGLE_USE_CUSTOMER_REVIEW_LINK'};
assert.equal((await issueCustomerReviewLink(db,project,env,{
 ...quoteOpts,expectedRowVersion:4
})).ok,false);
const issued=await issueCustomerReviewLink(db,project,env,quoteOpts);
assert.equal(issued.ok,true);
assert.equal(issued.purpose,'QUOTE');
assert.equal(issued.not_emailed,true);
assert.equal(issued.published,false);
assert.ok(issued.url.startsWith(origin+'/review/'));
const token=issued.url.split('/').at(-1);
assert.equal(token.length,43);
const hash=await hashCustomerToken(token);
assert.ok(/^[0-9a-f]{64}$/.test(hash));
assert.notEqual(hash,token);
assert.ok(statements.some(q=>q.sql.startsWith('INSERT INTO customer_review_tokens')&&q.args.includes(hash)));
assert.ok(!statements.some(q=>q.args?.includes(token)),'Raw bearer token must not be stored');
assert.equal((await issueCustomerReviewLink(db,project,env,quoteOpts)).ok,false,'Only one active token');

const getUrl=origin+'/api/customer/review/'+token;
const get=await handleCustomerReview(new Request(getUrl),env);
assert.equal(get.status,200);
const summary=await get.json();
assert.equal(summary.ok,true);
assert.equal(summary.purpose,'QUOTE');
assert.equal(summary.total_cad_cents,120000);
assert.equal(summary.invoice_due_days,14);
assert.equal(summary.deposit_cad_cents,0);
assert.equal(summary.acceptance_is_not_digital_signature,true);
assert.equal(summary.payment_model,'AFTER_COMPLETED_WEBSITE_DELIVERY');
assert.ok(!JSON.stringify(summary).includes('example@example.com'),'Do not expose customer PII');
const wrongOrigin=await handleCustomerReview(new Request(getUrl,{
 method:'POST',headers:{Origin:'https://attacker.test','Content-Type':'application/json'},
 body:JSON.stringify({decision:'ACCEPT',confirm:'ACCEPT',consent:true,version:1})
}),env);
assert.equal(wrongOrigin.status,403);
const wrongVersion=await handleCustomerReview(new Request(getUrl,{
 method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
 body:JSON.stringify({decision:'ACCEPT',confirm:'ACCEPT',consent:true,version:2})
}),env);
assert.equal(wrongVersion.status,400);
const accept=await handleCustomerReview(new Request(getUrl,{
 method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
 body:JSON.stringify({decision:'ACCEPT',confirm:'ACCEPT',consent:true,version:1})
}),env);
assert.equal(accept.status,200);
const accepted=await accept.json();
assert.equal(accepted.ok,true);assert.equal(accepted.accepted,true);
assert.equal(accepted.invoice_sent,false);assert.equal(accepted.customer_charged,false);
assert.equal((await handleCustomerReview(new Request(getUrl),env)).status,404,
 'A used token cannot be reopened');
assert.equal((await handleCustomerReview(new Request(getUrl,{
 method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
 body:JSON.stringify({decision:'ACCEPT',confirm:'ACCEPT',consent:true,version:1})
}),env)).status,404,'A used quote token must not be reusable');

// Final review: a real QA record and matching quote acceptance are mandatory.
project.status='PREVIEW_READY';project.row_version=6;
project.quote_accepted_at='2026-11-19T18:00:00.000Z';
project.preview_verified=1;project.security_check_passed=1;
qaApproved=false;
const reviewOpts={...quoteOpts,purpose:'FINAL_REVIEW',expectedRowVersion:6};
assert.equal((await issueCustomerReviewLink(db,project,env,reviewOpts)).ok,false);
qaApproved=true;
const final=await issueCustomerReviewLink(db,project,env,reviewOpts);
assert.equal(final.ok,true);
const finalToken=final.url.split('/').at(-1);
const finalUrl=origin+'/api/customer/review/'+finalToken;
const finalGet=await handleCustomerReview(new Request(finalUrl),env);
assert.equal(finalGet.status,200);
assert.equal((await finalGet.json()).purpose,'FINAL_REVIEW');
const approval=await handleCustomerReview(new Request(finalUrl,{
 method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
 body:JSON.stringify({decision:'APPROVE',confirm:'APPROVE',consent:true,version:1})
}),env);
assert.equal(approval.status,200);
assert.equal((await approval.json()).approved,true);
assert.equal((await handleCustomerReview(new Request(finalUrl),env)).status,404);

// The owner can issue handover acknowledgment ONLY after final customer approval.
project.customer_approved_version=1;
project.customer_approval_evidence_reference='customer-portal/'+active.id;
project.row_version=7;
const receiptOpts={...quoteOpts,purpose:'DELIVERY_RECEIPT',expectedRowVersion:7,
 handoverReference:'handover/finished-site-sent-v1'};
assert.equal((await issueCustomerReviewLink(db,project,env,{
 ...receiptOpts,handoverReference:'https://example.com?token=secret'
})).ok,false);
const receipt=await issueCustomerReviewLink(db,project,env,receiptOpts);
assert.equal(receipt.ok,true);
const receiptToken=receipt.url.split('/').at(-1);
const receiptResult=await handleCustomerReview(new Request(origin+'/api/customer/review/'+receiptToken,{
 method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
 body:JSON.stringify({decision:'RECEIVED',confirm:'RECEIVED',consent:true,version:1})
}),env);
assert.equal(receiptResult.status,200);
assert.equal((await receiptResult.json()).receipt_recorded,true);
assert.equal((await receiptRecorded(db,project)).ok,true);
assert.equal((await receiptRecorded(db,project)).evidence_reference,
 'customer-portal/'+active.id);
assert.equal((await revokeCustomerReviewLinks(db,id)).ok,true);
assert.equal((await listCustomerReviewLinks(db,id)).raw_tokens_never_stored,true);

// Customer text containing secrets must be rejected before it reaches the DB.
project.row_version=8;project.customer_approved_version=null;
const revised=await issueCustomerReviewLink(db,project,env,{
 ...reviewOpts,expectedRowVersion:8
});
assert.equal(revised.ok,true);
const reviewUrl=origin+'/api/customer/review/'+revised.url.split('/').at(-1);
for(const note of ['password: mysecret123',
 'My card is 4242 4242 4242 4242']){
 const response=await handleCustomerReview(new Request(reviewUrl,{
  method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
  body:JSON.stringify({decision:'REQUEST_CHANGES',confirm:'REQUEST_CHANGES',
   consent:true,version:1,note})
 }),env);
 assert.equal(response.status,400);
}
const revision=await handleCustomerReview(new Request(reviewUrl,{
 method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
 body:JSON.stringify({decision:'REQUEST_CHANGES',confirm:'REQUEST_CHANGES',
  consent:true,version:1,note:'Please change the contact page and colors.'})
}),env);
assert.equal(revision.status,200);
assert.equal((await revision.json()).requested_changes,true);

// All external-facing features remain OFF in checked-in public config.
const publicConfig=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8'));
const managerConfig=JSON.parse(fs.readFileSync('wrangler.manager.jsonc','utf8'));
assert.equal(publicConfig.vars.CUSTOMER_PORTAL_APPROVED,'false');
assert.equal(managerConfig.vars.CUSTOMER_PORTAL_APPROVED,'false');
assert.ok(publicConfig.assets.run_worker_first.includes('/review/*'));
new vm.Script(fs.readFileSync('public/customer-review.js','utf8'));
new vm.Script(fs.readFileSync('manager-ui/app.js','utf8'));
const disabled=await publicWorker.fetch(new Request(origin+'/review/'+token),{
 CUSTOMER_PORTAL_APPROVED:'false',DB:db
});
assert.equal(disabled.status,404);
const privateManager=await publicWorker.fetch(new Request(origin+'/api/manager/projects'),env);
assert.equal(privateManager.status,404);
const livePage=await publicWorker.fetch(new Request(origin+'/review/'+token),{
 ...env,ASSETS:{fetch:async()=>new Response('<!doctype html>',{status:200})}
});
assert.equal(livePage.status,200);
assert.ok(livePage.headers.get('content-security-policy').includes("script-src 'self'"));
assert.equal(livePage.headers.get('referrer-policy'),'no-referrer');
console.log('PASS private single-use customer quote, QA final approval, delivery receipt, no secrets, strict origins, no live charges');
