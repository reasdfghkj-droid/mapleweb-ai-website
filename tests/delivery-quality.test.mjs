import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {
  validateHandoverEvidence,recordDeliveryQualityReview,
  getDeliveryQualityReadiness,preparePrivateHandoverSummary
} from '../workers/delivery-quality.mjs';
import {handleOwnerRequest} from '../workers/owner-api.mjs';
import publicWorker from '../workers/developer.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;

const id='11111111-1111-4111-8111-111111111111';
const project={
  id,status:'PREVIEW_READY',current_version:3,row_version:5,
  quote_approved_version:3,quote_accepted_at:'2026-11-19T15:00:00.000Z',
  preview_verified:1,security_check_passed:1,outstanding_revisions:0,
  invoice_status:null,stripe_invoice_id:null,delivered_at:null,
  name:'Sample Customer',email:'test@example.com',answers_json:'{}'
};
const evidence={
  confirm:'REVIEW_FINAL_WEBSITE_QA',expectedRowVersion:5,currentVersion:3,
  deliveryMethod:'SOURCE_TRANSFER',
  finalArtifactReference:'handover/finished-v3',
  functionalTestReference:'testing/features-v3',
  securityTestReference:'testing/security-v3',
  mobileAccessibilityReference:'testing/mobile-a11y-v3',
  ownershipHandoverReference:'handover/ownership-v3',
  customerSupportReference:'handover/support-v3',
  completeWebsiteBuilt:true,allContractedFeaturesImplemented:true,
  customerContactPathsTested:true,mobileAndAccessibilityReviewed:true,
  securityAndPrivacyTested:true,domainHostingAndOwnershipExplained:true,
  backupsAndFilesVerified:true,customerHandoverPrepared:true,
  paidIntegrationsConfirmed:true,noOpenCriticalDefects:true
};
const result=validateHandoverEvidence(project,evidence);
assert.equal(result.ok,true);
assert.equal(result.ready,true);
assert.equal(result.version,3);
assert.equal(result.customer_approved,false);
assert.equal(result.website_delivered,false);
assert.equal(result.payment_due,false);

for(const change of [
  {status:'BUILDING'},{status:'DELIVERED'},
  {quote_approved_version:2},{quote_accepted_at:null},
  {preview_verified:0},{security_check_passed:0},
  {outstanding_revisions:1},{stripe_invoice_id:'in_test'}
]){
 const blocked=validateHandoverEvidence({...project,...change},evidence);
 assert.equal(blocked.ok,false,'Unsafe project stage was accepted: '+JSON.stringify(change));
}
for(const change of [
  {expectedRowVersion:4},{currentVersion:2},{confirm:'YES'},
  {deliveryMethod:'EMAIL'},{functionalTestReference:'https://example.com/secret'},
  {securityTestReference:'testing/features-v3'},
  {customerContactPathsTested:false},
  {noOpenCriticalDefects:false}
]){
 assert.equal(validateHandoverEvidence(project,{...evidence,...change}).ok,false,
   'Incomplete or unsafe evidence accepted: '+JSON.stringify(change));
}

// D1 fake tracks the two atomic statements and the saved QA review.
let saved=null,insertCount=0;
const db={
 prepare(sql){
  const st={sql,bind(...params){this.params=params;return this},
    async first(){
      if(sql.includes('FROM delivery_quality_reviews WHERE project_id=?')){
        return saved;
      }
      if(sql.includes('SELECT p.*,s.name,s.email,s.answers_json FROM projects'))return project;
      throw Error('Unexpected query: '+sql);
    },
    async run(){return {meta:{changes:1}}}
  };
  return st;
 },
 async batch(stmts){
  assert.equal(stmts.length,2,'QA and owner audit must commit together');
  assert.ok(stmts[0].sql.includes('INSERT INTO delivery_quality_reviews'));
  assert.ok(stmts[0].sql.includes('row_version=?'));
  assert.ok(stmts[0].sql.includes("status='PREVIEW_READY'"));
  assert.ok(stmts[1].sql.includes('INSERT INTO project_events'));
  insertCount++;
  saved={
    version:3,created_at:'2026-11-19T21:00:00.000Z',
    delivery_method:'SOURCE_TRANSFER',
    final_artifact_reference:evidence.finalArtifactReference,
    functional_test_reference:evidence.functionalTestReference,
    security_test_reference:evidence.securityTestReference,
    mobile_accessibility_reference:evidence.mobileAccessibilityReference,
    ownership_handover_reference:evidence.ownershipHandoverReference,
    customer_support_reference:evidence.customerSupportReference,
    checklist_json:JSON.stringify(result.checks),approved:1
  };
  return stmts.map(()=>({meta:{changes:1}}));
 }
};
const missing=await getDeliveryQualityReadiness(db,project);
assert.equal(missing.ready,false);
assert.equal(missing.ok,false);
const created=await recordDeliveryQualityReview(db,project,evidence,'2026-11-19T21:00:00.000Z');
assert.equal(created.ok,true);
assert.equal(created.website_delivered,false);
assert.equal(created.invoice_created,false);
assert.equal(created.independently_verified,false);
assert.equal(insertCount,1);

const ready=await getDeliveryQualityReadiness(db,project);
assert.equal(ready.ready,true);
assert.equal(ready.version,3);
assert.equal(ready.checked_items,10);
assert.equal(ready.customer_approved,false);
assert.equal(ready.website_delivered,false);
const pack=await preparePrivateHandoverSummary(db,project);
assert.equal(pack.ok,true);
assert.equal(pack.private_only,true);
assert.equal(pack.delivered_by_this_operation,false);
assert.equal(pack.invoice_created,false);
assert.ok(pack.text.includes('NOT a finished customer website'));
assert.ok(pack.text.includes('No upfront payment'));
assert.ok(pack.text.includes('Customer'));
assert.equal((await getDeliveryQualityReadiness(db,{...project,current_version:4,quote_approved_version:4})).ready,false,
  'QA from version 3 must not approve version 4');
assert.equal((await getDeliveryQualityReadiness(db,{...project,preview_verified:0})).ready,false);
assert.equal((await getDeliveryQualityReadiness(db,{...project,status:'BUILDING'})).ready,false);
const invalidDb={prepare(){throw Error('Migration 0006 missing')}};
assert.equal((await getDeliveryQualityReadiness(invalidDb,project)).ready,false);

// Protected owner endpoints never accept arbitrary customers.
const managerEnv={MANAGER_API_APPROVED:'true',MANAGER_TOKEN:'a'.repeat(48),DB:db};
const url='https://manager.test/api/manager/projects/'+id;
const withAuth=(path,method='GET',body)=>new Request(url+path,{
  method,headers:{Authorization:'Bearer '+managerEnv.MANAGER_TOKEN,
    ...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})
});
assert.equal((await handleOwnerRequest(withAuth('/delivery-quality'),{})).status,503);
assert.equal((await handleOwnerRequest(new Request(url+'/delivery-quality'),
 managerEnv)).status,401);
const good=await handleOwnerRequest(withAuth('/delivery-quality'),managerEnv);
assert.equal(good.status,200);
assert.equal((await good.json()).ready,true);
const summary=await handleOwnerRequest(withAuth('/handover-summary'),managerEnv);
assert.equal(summary.status,200);
assert.equal((await summary.json()).invoice_created,false);
const anonymousPublic=await publicWorker.fetch(
  new Request('https://public.test/api/manager/projects/'+id+'/handover-summary'),{}
);
assert.equal(anonymousPublic.status,404);

// The delivery transition MUST refuse to proceed if no current-version QA exists.
saved=null;
const deliverPayload={
 action:'DELIVERED',expectedRowVersion:5,
 previewVerified:true,securityCheckPassed:true,
 deliveryEvidenceReference:'handover/receipt-v3',
 customerApprovalEvidenceReference:'customer/approval-v3',
 customerReceiptEvidenceReference:'customer/receipt-v3',
 currentVersion:3,customerApproved:true,ownerApproved:true
};
const blocked=await handleOwnerRequest(
  withAuth('/transition','POST',deliverPayload),managerEnv
);
assert.equal(blocked.status,409);
const reason=await blocked.json();
assert.ok(reason.error.includes('Final website delivery QA'));
const blockedInvoice=await handleOwnerRequest(withAuth('/approve-invoice','POST',{
  confirm:'APPROVE_POST_DELIVERY_INVOICE',expectedRowVersion:5
}),managerEnv);
assert.equal(blockedInvoice.status,409,'Even test invoice approval must check QA first');
const blockedStripe=await handleOwnerRequest(withAuth('/draft-test-invoice','POST',{
  confirm:'CREATE_STRIPE_SANDBOX_DRAFT_ONLY',expectedRowVersion:5
}),managerEnv);
assert.equal(blockedStripe.status,409,'No sandbox invoice without final version QA');
assert.equal(insertCount,1,'No additional QA record should be created by delivery or invoice checks');

const ui=fs.readFileSync('manager-ui/app.js','utf8');
new vm.Script(ui,{filename:'manager-ui/app.js'});
for(const id of ['saveDeliveryQA','downloadHandoverSummary','qaCompleteSite','qaFinalArtifact']){
 assert.ok(fs.readFileSync('manager-ui/index.html','utf8').includes('id="'+id+'"'));
}
assert.ok(ui.includes('REVIEW_FINAL_WEBSITE_QA'));
assert.ok(ui.includes("'/delivery-review'"));
assert.ok(!ui.includes('localStorage')&&!ui.includes('sessionStorage'));
console.log('PASS private versioned final-website QA, 10 checks, 6 independent evidence refs, delivery/invoice gates and protected handover summary');
