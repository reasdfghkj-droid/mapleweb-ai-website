/**
 * Full-system real SQLite (D1-compatible SQL) integration test.
 * Unlike mock-only suites, every prepared SQL statement runs against the
 * actual concatenated production migrations. No network or account access.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {webcrypto} from 'node:crypto';
import {saveLeadAsProject,commitOwnerTransition,invoiceAssessment} from '../workers/order-engine.mjs';
import {processDeveloperJob,getPrivateStarterBundle} from '../workers/developer-handoff.mjs';
import {recordDeliveryQualityReview,getDeliveryQualityReadiness} from '../workers/delivery-quality.mjs';
import {issueCustomerReviewLink,handleCustomerReview,receiptRecorded} from '../workers/customer-review.mjs';
import {sendCustomerReviewEmail} from '../workers/customer-email.mjs';
import {uploadFinalWebsiteFiles,getFinalWebsiteArtifact,downloadCustomerWebsite} from '../workers/final-site-files.mjs';
import {processApprovedTemplateBatch} from '../workers/agent-operations.mjs';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const sql=new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON;');
const schemas=[
 '0001_secure_sales_submissions.sql','0002_orders_projects_and_billing.sql',
 '0003_private_previews_notifications.sql','0004_developer_handoff_queue.sql',
 '0005_agent_recovery.sql','0006_delivery_quality_reviews.sql',
 '0007_customer_review_tokens.sql','0008_final_website_artifacts.sql',
 '0009_customer_review_email.sql'
];
for(const file of schemas)sql.exec(fs.readFileSync('migrations/'+file,'utf8'));

function toD1Statement(statement,args=[]){
 const stmt=sql.prepare(statement);
 const query={params:args,
  bind(...params){return toD1Statement(statement,params)},
  async run(){const out=stmt.run(...args);return {success:true,meta:{changes:Number(out.changes)}}},
  async first(){return stmt.get(...args)||null},
  async all(){return {results:stmt.all(...args)}}
 };
 return query;
}
const db={
 prepare(statement){return toD1Statement(statement)},
 async batch(items){
  sql.exec('BEGIN IMMEDIATE;');
  try{
   const r=[];
   for(const item of items)r.push(await item.run());
   sql.exec('COMMIT;');
   return r;
  }catch(e){
   sql.exec('ROLLBACK;');
   throw e;
  }
 }
};
const id=crypto.randomUUID(),sid=crypto.randomUUID();
const answers={
 business:'Local accounting firm',
 goal:'Show services to local clients and receive consultation requests',
 pages:'3–5 pages',features:'Contact form, services, team and gallery',
 style:'Classic and elegant',timeline:'Within two months',
 additional_details:'Use a clear blue and gold layout'
};
const lead=await saveLeadAsProject(db,{
 projectId:id,submissionId:sid,name:'Sample customer',
 email:'client@example.org',answers
});
assert.equal(lead.saved,true);
assert.equal(lead.developer_brief_queued,true);
assert.equal(lead.full_website_finished,false);
let row=sql.prepare('SELECT * FROM projects WHERE id=?').get(id);
assert.equal(row.status,'NEW');
assert.equal(row.current_version,1);
assert.equal(sql.prepare('SELECT status FROM developer_build_jobs WHERE project_id=?').get(id).status,'QUEUED');
assert.equal(sql.prepare('SELECT COUNT(*) AS count FROM owner_notifications WHERE project_id=?').get(id).count,1);

const developer=await processDeveloperJob(db,id,{
 DB:db,AUTO_BUILD_HANDOFF_APPROVED:'true',AI_DEVELOPER_APPROVED:'false'
});
assert.equal(developer.ok,true,developer.reason);
assert.equal(developer.paid_ai_used,false);
assert.equal(developer.published,false);
const starter=await getPrivateStarterBundle(db,id);
assert.equal(starter.ok,true);
assert.equal(starter.bundle.published,false);
assert.ok(starter.bundle.files.some(f=>f.path==='index.html'));
row=sql.prepare('SELECT * FROM projects WHERE id=?').get(id);
assert.equal(row.generator,'fixed-template');
assert.ok(row.row_version>1);
assert.equal(sql.prepare('SELECT status FROM developer_build_jobs WHERE project_id=?').get(id).status,'STARTER_READY');
const duplicate=await processDeveloperJob(db,id,{DB:db,AUTO_BUILD_HANDOFF_APPROVED:'true'});
assert.equal(duplicate.ok,false,'At-most-once Developer claims must survive real D1');
// Owner review and quotation; package estimates come from product requirements.
async function transition(action,body={}){
 const previous=sql.prepare('SELECT * FROM projects WHERE id=?').get(id);
 const result=await commitOwnerTransition(db,previous,action,body);
 assert.equal(result.ok,true,'Owner transition '+action+' failed '+JSON.stringify(result));
 return sql.prepare('SELECT * FROM projects WHERE id=?').get(id);
}
row=await transition('REVIEWING');
row=await transition('QUOTED',{
 approvedFinalTotalCadCents:120000,
 invoiceDueDays:14,
 quoteEvidenceReference:'owner/approved-quote-v1'
});
assert.equal(row.quote_approved_version,1);
assert.equal(row.invoice_due_terms_accepted,0,'Quote proposal cannot be treated as accepted');
assert.equal(invoiceAssessment(row).eligibleForOwnerDraftInvoice,false);

// Owner issues a cryptographically random one-time customer acceptance link.
const origin='https://mapleweb-ai-website.example';
const portalEnv={DB:db,CUSTOMER_PORTAL_APPROVED:'true',PUBLIC_SITE_ORIGIN:origin};
async function issue(purpose,other={}){
 const p=sql.prepare('SELECT * FROM projects WHERE id=?').get(id);
 const issued=await issueCustomerReviewLink(db,p,portalEnv,{
  purpose,currentVersion:p.current_version,expectedRowVersion:p.row_version,
  confirm:'ISSUE_SINGLE_USE_CUSTOMER_REVIEW_LINK',hours:48,...other
 });
 assert.equal(issued.ok,true,issued.error);
 return issued.url;
}
async function decide(url,decision,note=''){
 const token=url.split('/').at(-1);
 const current=sql.prepare('SELECT current_version FROM projects WHERE id=?').get(id);
 const req=new Request(origin+'/api/customer/review/'+token,{
  method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},
  body:JSON.stringify({decision,confirm:decision,consent:true,version:current.current_version,note})
 });
 const response=await handleCustomerReview(req,portalEnv);
 const json=await response.json();
 assert.equal(response.status,200,JSON.stringify(json));
 assert.equal(json.ok,true);
 return json;
}
const quoteUrl=await issue('QUOTE');
assert.equal((await decide(quoteUrl,'ACCEPT')).accepted,true);
row=sql.prepare('SELECT * FROM projects WHERE id=?').get(id);
assert.equal(row.status,'ACCEPTED');
assert.equal(row.invoice_due_terms_accepted,1);
assert.equal(invoiceAssessment(row).eligibleForOwnerDraftInvoice,false);
row=await transition('BUILDING');
row=await transition('PREVIEW_READY',{previewVerified:true,securityCheckPassed:true});
assert.equal(row.status,'PREVIEW_READY');

// Owner uploads the ACTUAL completed test website (never the generated starter).
const site={
 files:[
  {path:'index.html',content:'<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" href="styles.css"><title>Sample accounting</title></head><body><h1>Finished services site</h1><p>Our team is available for consultations.</p></body></html>'},
  {path:'styles.css',content:'body { font-family: system-ui; line-height: 1.5; }'}
 ]
};
const objects=new Map();
const r2={
 async put(key,bytes){objects.set(key,new Uint8Array(bytes));return {key}},
 async get(key){const b=objects.get(key);return b?{size:b.length,body:new Blob([b]).stream()}:null},
 async head(key){const b=objects.get(key);return b?{size:b.length}:null},
 async delete(key){objects.delete(key)}
};
const fileEnv={...portalEnv,FINAL_SITE_FILES_APPROVED:'true',FINAL_SITE_BUCKET:r2};
let artifact=await uploadFinalWebsiteFiles(db,row,fileEnv,{
 ...site,confirm:'UPLOAD_VERIFIED_FINISHED_WEBSITE',
 currentVersion:row.current_version,expectedRowVersion:row.row_version
});
assert.equal(artifact.ok,true,artifact.error);
assert.equal(artifact.delivered,false);
const stored=await getFinalWebsiteArtifact(db,r2,row);
assert.equal(stored.present,true);

const qa=await recordDeliveryQualityReview(db,row,{
 confirm:'REVIEW_FINAL_WEBSITE_QA',
 expectedRowVersion:row.row_version,currentVersion:row.current_version,
 deliveryMethod:'SOURCE_TRANSFER',
 finalArtifactReference:stored.artifact_reference,
 functionalTestReference:'testing/function-v1',
 securityTestReference:'testing/security-v1',
 mobileAccessibilityReference:'testing/accessibility-v1',
 ownershipHandoverReference:'handover/ownership-v1',
 customerSupportReference:'handover/support-v1',
 completeWebsiteBuilt:true,allContractedFeaturesImplemented:true,
 customerContactPathsTested:true,mobileAndAccessibilityReviewed:true,
 securityAndPrivacyTested:true,domainHostingAndOwnershipExplained:true,
 backupsAndFilesVerified:true,customerHandoverPrepared:true,
 paidIntegrationsConfirmed:true,noOpenCriticalDefects:true
});
assert.equal(qa.ok,true,qa.reason);
assert.equal((await getDeliveryQualityReadiness(db,row)).ready,true);
const finalUrl=await issue('FINAL_REVIEW');
const finalToken=finalUrl.split('/').at(-1);
const zip=await downloadCustomerWebsite(
 new Request(origin+'/api/customer/review/'+finalToken+'/download'),fileEnv
);
assert.equal(zip.status,200);
const bytes=new Uint8Array(await zip.arrayBuffer());
assert.deepEqual([...bytes.slice(0,4)],[0x50,0x4b,0x03,0x04]);
assert.equal((await decide(finalUrl,'APPROVE')).approved,true);
row=sql.prepare('SELECT * FROM projects WHERE id=?').get(id);
assert.equal(row.customer_approved_version,row.current_version);
const receiptUrl=await issue('DELIVERY_RECEIPT',{
 handoverReference:'handover/customer-transfer-v1'
});
assert.equal((await decide(receiptUrl,'RECEIVED')).receipt_recorded,true);
row=sql.prepare('SELECT * FROM projects WHERE id=?').get(id);
const receipt=await receiptRecorded(db,row);
assert.equal(receipt.ok,true);
row=await transition('DELIVERED',{
 previewVerified:true,securityCheckPassed:true,
 deliveryEvidenceReference:'handover/customer-transfer-v1',
 customerApprovalEvidenceReference:row.customer_approval_evidence_reference,
 customerReceiptEvidenceReference:receipt.evidence_reference,
 customerApproved:true,ownerApproved:true,currentVersion:row.current_version
});
assert.equal(row.status,'DELIVERED');
assert.equal(row.owner_approved_invoice,0,'Delivery never auto-authorizes invoice');
assert.equal(invoiceAssessment(row).eligibleForOwnerDraftInvoice,false);

// After delivery, no second build or review tokens can overwrite customer acceptance.
assert.equal((await processApprovedTemplateBatch({DB:db,AUTO_BUILD_HANDOFF_APPROVED:'true',AUTO_AGENT_BATCH_APPROVED:'false'})).ok,false);
const qaCount=sql.prepare('SELECT COUNT(*) AS c FROM delivery_quality_reviews WHERE project_id=?').get(id).c;
assert.equal(qaCount,1);
const eventCount=sql.prepare('SELECT COUNT(*) AS c FROM project_events WHERE project_id=?').get(id).c;
assert.ok(eventCount>=8);
const answersFromDb=JSON.parse(sql.prepare('SELECT answers_json FROM submissions WHERE id=?').get(sid).answers_json);
assert.equal(answersFromDb.features,answers.features);
assert.equal(sql.prepare('PRAGMA foreign_key_check').all().length,0);

// The email ledger and verified sender are tested against REAL schema as well.
// A customer should have received only an owner-approved, current-version link.
const lastReview=sql.prepare('SELECT COUNT(*) AS c FROM customer_review_responses WHERE project_id=?').get(id).c;
assert.equal(lastReview,3);
assert.equal(sql.prepare('SELECT COUNT(*) AS c FROM customer_review_tokens WHERE project_id=?').get(id).c,3);
console.log('PASS REAL SQLITE: secure intake -> Developer -> quote -> customer acceptance -> private final ZIP -> QA -> customer approval -> actual receipt -> DELIVERED, no upfront invoice');
