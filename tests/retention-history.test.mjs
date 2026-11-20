import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {abandonedDeletionEligibility,deleteAbandonedRequest} from '../workers/order-retention.mjs';
const sql=new DatabaseSync(':memory:');
sql.exec('PRAGMA foreign_keys=ON;');
for(const name of [
 '0001_secure_sales_submissions.sql','0002_orders_projects_and_billing.sql',
 '0003_private_previews_notifications.sql','0004_developer_handoff_queue.sql',
 '0005_agent_recovery.sql','0006_delivery_quality_reviews.sql',
 '0007_customer_review_tokens.sql','0008_final_website_artifacts.sql',
 '0009_customer_review_email.sql'
])sql.exec(fs.readFileSync('migrations/'+name,'utf8'));
const d1={
 prepare(statement){return {
  bind(...args){return {
   async run(){const result=sql.prepare(statement).run(...args);return {meta:{changes:Number(result.changes)}}}
  }}
 }}
};
const iso='2026-11-19T18:00:00.000Z';
function makeProject(status='REVIEWING'){
 const id=randomUUID(),sid=randomUUID();
 sql.prepare('INSERT INTO submissions(id,created_at,name,email,answers_json,status) VALUES (?,?,?,?,?,?)')
 .run(sid,iso,'Dummy Name','dummy@example.org','{}','NEW');
 sql.prepare('INSERT INTO projects(id,submission_id,created_at,updated_at,status,draft_html) VALUES (?,?,?,?,?,?)')
 .run(id,sid,iso,iso,status,'<html><body>Private</body></html>');
 return sql.prepare('SELECT * FROM projects WHERE id=?').get(id);
}
const deleted=makeProject('NEW');
assert.equal(abandonedDeletionEligibility(deleted).allowed,true);
assert.equal(abandonedDeletionEligibility(deleted).history_check_required,true);
const first=await deleteAbandonedRequest(d1,deleted);
assert.equal(first.ok,true,first.error);
assert.equal(sql.prepare('SELECT COUNT(*) AS c FROM submissions WHERE id=?').get(deleted.submission_id).c,0);
assert.equal(sql.prepare('SELECT COUNT(*) AS c FROM projects WHERE id=?').get(deleted.id).c,0);

const accepted=makeProject('REVIEWING');
sql.prepare('INSERT INTO project_events(id,project_id,created_at,action,actor,details_json) VALUES (?,?,?,?,?,?)')
 .run(randomUUID(),accepted.id,iso,'STATUS_ACCEPTED','owner','{}');
const acceptedResult=await deleteAbandonedRequest(d1,accepted);
assert.equal(acceptedResult.ok,false,'Historical accepted quote must NEVER be quickly erased after revision');
assert.equal(sql.prepare('SELECT COUNT(*) AS c FROM projects WHERE id=?').get(accepted.id).c,1);

const portalAccepted=makeProject('REVIEWING');
sql.prepare('INSERT INTO project_events(id,project_id,created_at,action,actor,details_json) VALUES (?,?,?,?,?,?)')
 .run(randomUUID(),portalAccepted.id,iso,'CUSTOMER_PORTAL_ACCEPT','customer-portal','{}');
assert.equal((await deleteAbandonedRequest(d1,portalAccepted)).ok,false);

const finishedSite=makeProject('REVIEWING');
sql.prepare('INSERT INTO final_website_artifacts(project_id,version,storage_key,sha256_hex,byte_size,file_count,created_at) VALUES (?,?,?,?,?,?,?)')
 .run(finishedSite.id,1,'private/'+finishedSite.id+'/finished.zip','f'.repeat(64),2000,2,iso);
assert.equal((await deleteAbandonedRequest(d1,finishedSite)).ok,false,
 'A private R2 website artifact must not be orphaned by quick D1 deletion');
assert.equal(sql.prepare('SELECT COUNT(*) AS c FROM final_website_artifacts WHERE project_id=?').get(finishedSite.id).c,1);

const quality=makeProject('REVIEWING');
sql.prepare('INSERT INTO delivery_quality_reviews(project_id,version,created_at,delivery_method,final_artifact_reference,functional_test_reference,security_test_reference,mobile_accessibility_reference,ownership_handover_reference,customer_support_reference,checklist_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
 .run(quality.id,1,iso,'SOURCE_TRANSFER','bundle/owner-v1','test/functional-v1','test/security-v1','test/mobile-v1','handover/owner-v1','handover/support-v1','{}');
assert.equal((await deleteAbandonedRequest(d1,quality)).ok,false,
 'A completed owner quality review cannot be treated as an abandoned lead');

const financial=makeProject('REVIEWING');
sql.prepare('INSERT INTO invoice_operations(project_id,created_at,updated_at,status,idempotency_key) VALUES (?,?,?,?,?)')
 .run(financial.id,iso,iso,'MANUAL_REVIEW','invoice-'+financial.id);
assert.equal((await deleteAbandonedRequest(d1,financial)).ok,false);

const response=makeProject('REVIEWING');
const token=randomUUID();
sql.prepare('INSERT INTO customer_review_tokens(id,project_id,version,purpose,token_hash,created_at,expires_at) VALUES (?,?,?,?,?,?,?)')
 .run(token,response.id,1,'QUOTE','e'.repeat(64),iso,'2027-11-19T18:00:00.000Z');
sql.prepare('INSERT INTO customer_review_responses(id,project_id,token_id,version,purpose,decision,created_at,note) VALUES (?,?,?,?,?,?,?,?)')
 .run(randomUUID(),response.id,token,1,'QUOTE','ACCEPT',iso,'');
assert.equal((await deleteAbandonedRequest(d1,response)).ok,false);
const onlyRequested=makeProject('REVIEWING');
const requestToken=randomUUID();
sql.prepare('INSERT INTO customer_review_tokens(id,project_id,version,purpose,token_hash,created_at,expires_at) VALUES (?,?,?,?,?,?,?)')
 .run(requestToken,onlyRequested.id,1,'QUOTE','a'.repeat(64),iso,'2027-11-19T18:00:00.000Z');
sql.prepare('INSERT INTO customer_review_responses(id,project_id,token_id,version,purpose,decision,created_at,note) VALUES (?,?,?,?,?,?,?,?)')
 .run(randomUUID(),onlyRequested.id,requestToken,1,'QUOTE','REQUEST_CHANGES',iso,'Need a different style');
assert.equal((await deleteAbandonedRequest(d1,onlyRequested)).ok,true,
 'A genuinely abandoned quote never accepted and without final work may be removed');
assert.equal(sql.prepare('SELECT COUNT(*) AS c FROM customer_review_tokens WHERE project_id=?').get(onlyRequested.id).c,0);

assert.deepEqual(sql.prepare('PRAGMA foreign_key_check').all(),[]);
console.log('PASS actual SQLite blocks deletion of historical acceptance, finished R2 files, QA and financial records; deletes only genuinely abandoned inquiries');
