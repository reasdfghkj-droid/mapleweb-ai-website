import { buildStarterProject, improveDraftWithAI } from './website-studio.mjs';
import { evaluatePostDeliveryInvoice } from '../billing/post-delivery-gate.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATES = Object.freeze(['NEW','REVIEWING','QUOTED','ACCEPTED','BUILDING','PREVIEW_READY','DELIVERED','CANCELLED']);
const transitions = Object.freeze({
  REVIEWING:['NEW'],
  QUOTED:['REVIEWING'],
  ACCEPTED:['QUOTED'],
  BUILDING:['ACCEPTED'],
  PREVIEW_READY:['BUILDING'],
  DELIVERED:['PREVIEW_READY'],
  CANCELLED:['NEW','REVIEWING','QUOTED','ACCEPTED','BUILDING','PREVIEW_READY']
});
const dataText = (s,n=250) => typeof s==='string'?s.trim().slice(0,n):'';
export function validId(s) { return typeof s==='string' && UUID.test(s); }
export function cleanEvidence(value) {
  const s=dataText(value,180);
  // Evidence is an identifier/reference, NOT raw documents, URLs containing tokens or credentials.
  return s.length>=8 && /^[A-Za-z0-9_./:-]+$/.test(s) && !/https?:|secret|password|token|key=/i.test(s) ? s : '';
}
export function toInvoiceGateProject(p) {
  const iso = x => x||null;
  return {
    paymentModel:'post_delivery',status:p.status,currentVersion:p.current_version,
    quoteApprovedVersion:p.quote_approved_version,
    customerApprovedVersion:p.customer_approved_version,
    ownerApprovedVersion:p.owner_approved_version,
    approvedFinalTotalCadCents:p.approved_final_total_cad_cents,
    ownerApprovedInvoiceTotalCadCents:p.owner_approved_invoice_total_cad_cents,
    quoteAcceptedAt:iso(p.quote_accepted_at),deliveredAt:iso(p.delivered_at),
    deliveryConfirmedAt:iso(p.delivery_confirmed_at),customerEmail:p.email,
    invoiceDueTermsAccepted:p.invoice_due_terms_accepted===1,
    ownerApprovedInvoice:p.owner_approved_invoice===1,
    previewVerified:p.preview_verified===1,
    securityCheckPassed:p.security_check_passed===1,
    outstandingRevisions:p.outstanding_revisions===1,
    existingInvoiceId:p.stripe_invoice_id,invoiceStatus:p.invoice_status
  };
}
export function invoiceAssessment(p) {
  return evaluatePostDeliveryInvoice(toInvoiceGateProject(p));
}

/** Creates lead, private project and audit event in one D1 batch transaction. */
export async function saveLeadAsProject(db, data) {
  if (!db || typeof db.batch!=='function') throw new Error('Project storage requires D1 transactional batch');
  const submissionId=dataText(data?.submissionId,50);
  const projectId=dataText(data?.projectId,50);
  if (!validId(submissionId) || !validId(projectId) || submissionId===projectId) throw new Error('Invalid project reference');
  const name=dataText(data.name,100),email=dataText(data.email,200);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Valid contact details required');
  const draft=buildStarterProject(data.answers);
  const createdAt=new Date().toISOString(),answers=JSON.stringify(data.answers);
  const statements=[
    db.prepare('INSERT INTO submissions (id,created_at,name,email,answers_json,status) VALUES (?,?,?,?,?,?)')
      .bind(submissionId,createdAt,name,email,answers,'NEW'),
    db.prepare('INSERT INTO projects (id,submission_id,created_at,updated_at,status,current_version,generator,draft_html) VALUES (?,?,?,?,?,?,?,?)')
      .bind(projectId,submissionId,createdAt,createdAt,'NEW',1,draft.generator,draft.draft_html),
    db.prepare('INSERT INTO project_events (id,project_id,created_at,action,actor,details_json) VALUES (?,?,?,?,?,?)')
      .bind(crypto.randomUUID(),projectId,createdAt,'LEAD_RECEIVED','system','{"source":"consented-secure-intake"}')
  ];
  const res=await db.batch(statements);
  if (!Array.isArray(res) || res.length!==3 || res.some(x=>x?.success===false))
    throw new Error('Transaction did not commit');
  return {saved:true,reference:submissionId,project_reference:projectId,
    private_preview_ready:true,generated_by:draft.generator,delivered_to_agent:false,
    payment_due_now:false,published:false};
}

const bad = msg => ({ok:false,reason:msg});
const positiveCents = n => Number.isSafeInteger(n) && n>=50000 && n<=10000000;
const integerDue = n => Number.isSafeInteger(n) && n>=1 && n<=60;

export function planOwnerTransition(row, requested, data={}, now=new Date().toISOString()) {
  if (!row || !STATES.includes(row.status)) return bad('Project record is invalid');
  if (!Object.prototype.hasOwnProperty.call(transitions,requested)) return bad('Unknown action');
  if (!transitions[requested].includes(row.status)) return bad('Action is not allowed from this project stage');
  if (row.stripe_invoice_id || row.invoice_status) return bad('Billing has already started; project cannot change stages');
  const p = data && typeof data==='object'&&!Array.isArray(data) ? data : {};
  const fields={status:requested,updated_at:now};
  let event='STATUS_'+requested;
  if(requested==='QUOTED'){
    if(!positiveCents(p.approvedFinalTotalCadCents)) return bad('A specific owner-approved final CAD price is required');
    if(!integerDue(p.invoiceDueDays)) return bad('Written invoice due terms (1–60 days) required');
    const evidence=cleanEvidence(p.quoteEvidenceReference);
    if(!evidence) return bad('Signed quotation evidence reference required');
    fields.approved_final_total_cad_cents=p.approvedFinalTotalCadCents;
    fields.owner_approved_invoice_total_cad_cents=p.approvedFinalTotalCadCents;
    fields.quote_approved_version=row.current_version;
    fields.quote_evidence_reference=evidence;
    fields.invoice_due_days=p.invoiceDueDays;
    fields.invoice_due_terms_accepted=1;
  }
  if(requested==='ACCEPTED'){
    if(row.quote_approved_version!==row.current_version) return bad('Quote version is not current');
    const evidence=cleanEvidence(p.customerQuoteAcceptanceReference);
    if(!evidence)return bad('Written customer acceptance evidence required');
    fields.quote_accepted_at=now;
    fields.quote_acceptance_evidence_reference=evidence;
    // Acceptance time generated by trusted server, not the browser.
  }
  if(requested==='PREVIEW_READY'){
    if(p.previewVerified!==true || p.securityCheckPassed!==true)
      return bad('Preview and security checks must be completed by an authorized reviewer');
    fields.preview_verified=1;fields.security_check_passed=1;
  }
  if(requested==='DELIVERED'){
    if(row.preview_verified!==1 || row.security_check_passed!==1) return bad('Preview/security checks missing');
    if(row.quote_approved_version!==row.current_version) return bad('Quote approval is for another version');
    if(row.outstanding_revisions!==0)return bad('Revisions remain unresolved');
    const evidence=cleanEvidence(p.deliveryEvidenceReference);
    const customerApproval=cleanEvidence(p.customerApprovalEvidenceReference);
    const receipt=cleanEvidence(p.customerReceiptEvidenceReference);
    if(!evidence||!customerApproval||!receipt)
      return bad('Delivery, customer-approved version and receipt acknowledgment evidence required');
    if(p.currentVersion!==row.current_version)
      return bad('Customer and owner must approve exact delivered version');
    if(p.customerApproved!==true || p.ownerApproved!==true)
      return bad('Explicit customer and owner approval required');
    if(!row.quote_accepted_at) return bad('Written quote not accepted');
    fields.customer_approved_version=row.current_version;
    fields.owner_approved_version=row.current_version;
    fields.customer_approval_evidence_reference=customerApproval;
    fields.delivery_evidence_reference=evidence;
    fields.delivered_at=now;
    fields.delivery_confirmed_at=now;
    fields.owner_approved_invoice=0; // Invoice is NEVER auto-authorized by project delivery.
  }
  return {ok:true,fields,event,version:row.row_version};
}

/** Operator-only fields are updated through fixed SQL column allow-list and CAS. */
const SAFE_COLUMNS = new Set([
  'status','updated_at','quote_approved_version','customer_approved_version','owner_approved_version',
  'preview_verified','security_check_passed','outstanding_revisions','approved_final_total_cad_cents',
  'owner_approved_invoice_total_cad_cents','quote_accepted_at','delivered_at',
  'delivery_confirmed_at','delivery_evidence_reference','quote_evidence_reference',
  'quote_acceptance_evidence_reference',
  'customer_approval_evidence_reference','invoice_due_days','invoice_due_terms_accepted',
  'owner_approved_invoice'
]);
export async function commitOwnerTransition(db, row, requested, input) {
  const plan=planOwnerTransition(row,requested,input);
  if(!plan.ok)return plan;
  const fields=Object.entries(plan.fields);
  if(fields.some(([k])=>!SAFE_COLUMNS.has(k)))return bad('Attempted unsafe project update');
  const sql='UPDATE projects SET '+fields.map(([k])=>k+'=?').join(',')+
    ',row_version=row_version+1 WHERE id=? AND row_version=?';
  const stmt=db.prepare(sql).bind(...fields.map(([,v])=>v),row.id,row.row_version);
  const audit=db.prepare('INSERT INTO project_events(id,project_id,created_at,action,actor,details_json) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM projects WHERE id=? AND row_version=?)')
    .bind(crypto.randomUUID(),row.id,plan.fields.updated_at,plan.event,'owner','{"verified_by":"owner-authenticated"}',row.id,row.row_version+1);
  const res=await db.batch([stmt,audit]);
  if(!Array.isArray(res)||res[0]?.meta?.changes!==1 || res[1]?.meta?.changes!==1)
    return bad('Concurrent change or storage error; review current project before retrying');
  return {ok:true,status:requested,version:row.row_version+1};
}

/** AI-generated versions are private and invalidate existing approvals. */
export async function createOwnerAIDraft(db,row,answers,env) {
  if (!['NEW','REVIEWING'].includes(row?.status)) return bad('AI draft changes require pre-quote owner review');
  const draft=await improveDraftWithAI(answers,env);
  if(!draft.ready)return bad(draft.reason);
  const version=row.current_version+1;
  const status='REVIEWING';
  const now=new Date().toISOString();
  const change=db.prepare('UPDATE projects SET draft_html=?,generator=?,current_version=?,status=?,updated_at=?,row_version=row_version+1,quote_approved_version=NULL,customer_approved_version=NULL,owner_approved_version=NULL,preview_verified=0,security_check_passed=0 WHERE id=? AND row_version=?')
    .bind(draft.draft_html,draft.generator,version,status,now,row.id,row.row_version);
  const audit=db.prepare('INSERT INTO project_events(id,project_id,created_at,action,actor,details_json) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM projects WHERE id=? AND row_version=?)')
    .bind(crypto.randomUUID(),row.id,now,'AI_DRAFT_CREATED','owner','{"private":true}',row.id,row.row_version+1);
  const changes=await db.batch([change,audit]);
  if(changes[0]?.meta?.changes!==1||changes[1]?.meta?.changes!==1)
    return bad('Concurrent update; review project before retrying');
  return {ok:true,current_version:version,status,generated_by:draft.generator,
    private_preview:true,published:false,ai_model_connected:true};
}
