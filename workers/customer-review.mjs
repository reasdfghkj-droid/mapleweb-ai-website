/**
 * MapleWeb AI - single-use customer quote, final review and handover links.
 *
 * Handoff links are bearer secrets, returned ONCE only from the protected
 * Manager. D1 stores SHA-256 hashes, never raw tokens. Nothing here sends
 * an email, publishes a website, takes a payment or proves legal identity.
 */
import {getDeliveryQualityReadiness} from './delivery-quality.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const PURPOSES=new Set(['QUOTE','FINAL_REVIEW','DELIVERY_RECEIPT']);
const DECISIONS={
 QUOTE:['ACCEPT','REQUEST_CHANGES'],
 FINAL_REVIEW:['APPROVE','REQUEST_CHANGES'],
 DELIVERY_RECEIPT:['RECEIVED']
};
const responseHeaders={
 'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'private, no-store, max-age=0',
 'Referrer-Policy':'no-referrer',
 'X-Content-Type-Options':'nosniff',
 'X-Robots-Tag':'noindex, nofollow, noarchive',
 'Cross-Origin-Resource-Policy':'same-origin',
 'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
};
const resp=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:responseHeaders});
const blocked=()=>resp({error:'This private review link is unavailable, used or expired'},404);
const validDb=db=>Boolean(db?.prepare&&db?.batch);
const validRef=value=>typeof value==='string'&&value.length>=8&&value.length<=180&&
 /^[a-z0-9_./:-]+$/i.test(value)&&!/^https?:/i.test(value)&&
 !/password|secret|token|api.?key|credential/i.test(value);
const validOrigin=v=>{
 try{
  const url=new URL(v);
  return url.protocol==='https:'&&url.origin===v&&url.pathname==='/'&&
    !url.username&&!url.password&&!url.search&&!url.hash;
 }catch{return false}
};
const raw64=bytes=>{
 let s='';for(const b of bytes)s+=String.fromCharCode(b);
 return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
};
export async function hashCustomerToken(value) {
 if(typeof value!=='string'||!TOKEN.test(value))return null;
 const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
 return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
const issueAllowed=async(db,project,purpose)=>{
 if(!project||!UUID.test(project.id||'')||!Number.isSafeInteger(project.current_version)||
    project.current_version<1)return {ok:false,error:'Project version is unavailable'};
 if(purpose==='QUOTE'){
  if(project.status!=='QUOTED'||project.quote_approved_version!==project.current_version||
     project.quote_accepted_at||!Number.isSafeInteger(project.approved_final_total_cad_cents)||
     project.approved_final_total_cad_cents<1||
     !Number.isSafeInteger(project.invoice_due_days)||project.invoice_due_days<1||
     project.invoice_due_days>60||!project.quote_evidence_reference)
   return {ok:false,error:'Written quote, final amount and agreed terms must be recorded first'};
 }else{
  if(project.status!=='PREVIEW_READY')
   return {ok:false,error:'A verified complete website must be ready for review'};
  const qa=await getDeliveryQualityReadiness(db,project);
  if(!qa.ready||qa.version!==project.current_version)
   return {ok:false,error:'Final website QA for the current version is required'};
  if(purpose==='FINAL_REVIEW'&&project.customer_approved_version===project.current_version)
   return {ok:false,error:'Customer already approved this version'};
  if(purpose==='DELIVERY_RECEIPT'&&
     (project.customer_approved_version!==project.current_version||
      !project.customer_approval_evidence_reference))
   return {ok:false,error:'Customer must approve the final reviewed version before handover'};
 }
 return {ok:true};
};
export async function issueCustomerReviewLink(db,project,env={},opts={}) {
 if(!validDb(db)||env.CUSTOMER_PORTAL_APPROVED!=='true')
  return {ok:false,error:'Customer review portal not activated'};
 if(!validOrigin(env.PUBLIC_SITE_ORIGIN))
  return {ok:false,error:'Exact HTTPS review origin is not configured'};
 if(!PURPOSES.has(opts.purpose))return {ok:false,error:'Invalid review purpose'};
 if(opts.expectedRowVersion!==project?.row_version||opts.currentVersion!==project?.current_version||
    opts.confirm!=='ISSUE_SINGLE_USE_CUSTOMER_REVIEW_LINK')
  return {ok:false,error:'Current project version and owner confirmation are required'};
 const hours=opts.hours??72;
 if(!Number.isSafeInteger(hours)||hours<1||hours>168)
  return {ok:false,error:'Link expiry must be between 1 and 168 hours'};
 const eligible=await issueAllowed(db,project,opts.purpose);
 if(!eligible.ok)return eligible;
 if(opts.purpose==='DELIVERY_RECEIPT'&&!validRef(opts.handoverReference))
  return {ok:false,error:'Record a real final-website transfer reference before requesting a receipt'};
 const existing=await db.prepare(
  'SELECT id FROM customer_review_tokens WHERE project_id=? AND version=? AND purpose=? '+
  'AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>? LIMIT 1'
 ).bind(project.id,project.current_version,opts.purpose,new Date().toISOString()).first();
 if(existing)return {ok:false,error:'An active review link exists; revoke it before creating a new one'};
 const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);
 const token=raw64(bytes),hash=await hashCustomerToken(token);
 const id=crypto.randomUUID(),now=Date.now(),createdAt=new Date(now).toISOString();
 const expiresAt=new Date(now+hours*3600000).toISOString();
 const targetStatus=opts.purpose==='QUOTE'?'QUOTED':'PREVIEW_READY';
 const params=[
  id,project.id,project.current_version,opts.purpose,hash,createdAt,expiresAt,
  opts.purpose==='DELIVERY_RECEIPT'?opts.handoverReference:null,
  project.id,project.row_version,project.current_version,targetStatus
 ];
 try{
  const result=await db.prepare(
    'INSERT INTO customer_review_tokens '+
    '(id,project_id,version,purpose,token_hash,created_at,expires_at,handover_reference) '+
    'SELECT ?,?,?,?,?,?,?,? WHERE EXISTS('+
    'SELECT 1 FROM projects WHERE id=? AND row_version=? AND current_version=? AND status=?)'
  ).bind(...params).run();
  if(result?.meta?.changes!==1)return {ok:false,error:'Project changed; reload before creating the link'};
  return {ok:true,purpose:opts.purpose,project_reference:project.id,
    version:project.current_version,expires_at:expiresAt,
    url:env.PUBLIC_SITE_ORIGIN+'/review/'+token,
    returned_once:true,not_emailed:true,not_publicly_listed:true,
    invoice_created:false,published:false};
 }catch{return {ok:false,error:'Private review link could not be created'};}
}
export async function revokeCustomerReviewLinks(db,projectId) {
 if(!validDb(db)||!UUID.test(projectId||''))return {ok:false,error:'Invalid project'};
 try{
  const r=await db.prepare(
   'UPDATE customer_review_tokens SET revoked_at=? '+
   'WHERE project_id=? AND revoked_at IS NULL AND consumed_at IS NULL'
  ).bind(new Date().toISOString(),projectId).run();
  return {ok:true,revoked_count:r?.meta?.changes||0};
 }catch{return {ok:false,error:'Cannot revoke private review links'};}
}
export async function listCustomerReviewLinks(db,projectId) {
 if(!validDb(db)||!UUID.test(projectId||''))return {ok:false,error:'Invalid project'};
 const r=await db.prepare(
  'SELECT id,version,purpose,created_at,expires_at,consumed_at,revoked_at,view_count '+
  'FROM customer_review_tokens WHERE project_id=? ORDER BY created_at DESC LIMIT 30'
 ).bind(projectId).all();
 return {ok:true,links:r?.results||[],raw_tokens_never_stored:true};
}
export async function receiptRecorded(db,project) {
 if(!db?.prepare||!UUID.test(project?.id||'')||
    !Number.isSafeInteger(project?.current_version))return {ok:false};
 try{
  const r=await db.prepare(
    "SELECT t.id,r.created_at FROM customer_review_responses r "+
    "JOIN customer_review_tokens t ON t.id=r.token_id "+
    "WHERE r.project_id=? AND r.version=? AND r.purpose='DELIVERY_RECEIPT' "+
    "AND r.decision='RECEIVED' AND t.consumed_at IS NOT NULL "+
    "ORDER BY r.created_at DESC LIMIT 1"
  ).bind(project.id,project.current_version).first();
  return r?{ok:true,evidence_reference:'customer-portal/'+r.id,received_at:r.created_at}:{ok:false};
 }catch{return {ok:false};}
}
async function findValidReview(db,hash) {
 const now=new Date().toISOString();
 const row=await db.prepare(
  'SELECT t.id AS token_id,t.project_id,t.version,t.purpose,t.expires_at,t.handover_reference,'+
  'p.status,p.current_version,p.row_version,p.quote_approved_version,p.quote_accepted_at,'+
  'p.approved_final_total_cad_cents,p.invoice_due_days,p.customer_approved_version,'+
  'p.customer_approval_evidence_reference,p.preview_verified,p.security_check_passed,'+
  'p.outstanding_revisions,p.invoice_status,p.stripe_invoice_id '+
  'FROM customer_review_tokens t JOIN projects p ON p.id=t.project_id '+
  'WHERE t.token_hash=? AND t.revoked_at IS NULL AND t.consumed_at IS NULL AND t.expires_at>? '+
  'AND t.version=p.current_version'
 ).bind(hash,now).first();
 if(!row)return null;
 const eligible=await issueAllowed(db,{id:row.project_id,...row},row.purpose);
 if(!eligible.ok)return null;
 return row;
}
function reviewInfo(row){
 return {ok:true,purpose:row.purpose,version:row.version,
   suggested_actions:DECISIONS[row.purpose],
   total_cad_cents:row.purpose==='QUOTE'?row.approved_final_total_cad_cents:null,
   invoice_due_days:row.purpose==='QUOTE'?row.invoice_due_days:null,
   payment_model:'AFTER_COMPLETED_WEBSITE_DELIVERY',
   deposit_cad_cents:0,
   acceptance_is_not_digital_signature:true,
   real_website_must_be_reviewed_separately:true,
   handover_recorded_by_owner:row.purpose==='DELIVERY_RECEIPT',
   customer_contacted_by_this_endpoint:false};
}
const plainNote=v=>{
 if(typeof v!=='string')return '';
 return v.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,900);
};
/** Public route, allowed only after owner explicitly activates the review portal. */
export async function handleCustomerReview(request,env={}) {
 if(env.CUSTOMER_PORTAL_APPROVED!=='true'||!validDb(env.DB)||
    !validOrigin(env.PUBLIC_SITE_ORIGIN))return resp({error:'Private review portal is disabled'},503);
 const url=new URL(request.url);
 const token=url.pathname.startsWith('/api/customer/review/')
   ?url.pathname.slice('/api/customer/review/'.length):'';
 const hash=await hashCustomerToken(token);
 if(!hash||url.search||url.hash)return blocked();
 if(request.method!=='GET'&&request.method!=='POST')
  return resp({error:'Method not allowed'},405);
 try{
  const row=await findValidReview(env.DB,hash);
  if(!row)return blocked();
  if(request.method==='GET')return resp(reviewInfo(row));
  if(request.headers.get('origin')!==env.PUBLIC_SITE_ORIGIN)
   return resp({error:'Origin not permitted'},403);
  if(!(request.headers.get('content-type')||'').toLowerCase().startsWith('application/json'))
   return resp({error:'JSON content required'},415);
  const claimed=Number(request.headers.get('content-length')||0);
  if(claimed>2800)return resp({error:'Request too large'},413);
  const raw=await request.text();
  if(raw.length>2800)return resp({error:'Request too large'},413);
  let payload;
  try{payload=JSON.parse(raw)}catch{return resp({error:'Invalid JSON'},400);}
  const decision=payload?.decision;
  if(!DECISIONS[row.purpose].includes(decision)||payload?.confirm!==decision||
     payload?.version!==row.version||payload?.consent!==true)
   return resp({error:'Please confirm your decision and the exact website version'},400);
  const note=plainNote(payload.note);
  if(decision==='REQUEST_CHANGES'&&note.length<8)
   return resp({error:'Explain the requested changes (at least eight characters)'},400);
  const at=new Date().toISOString(),responseId=crypto.randomUUID();
  const ref='customer-portal/'+row.token_id;
  let updateSql,updateParams;
  if(row.purpose==='QUOTE'&&decision==='ACCEPT'){
   updateSql="UPDATE projects SET status='ACCEPTED',quote_accepted_at=?,"+
    "quote_acceptance_evidence_reference=?,invoice_due_terms_accepted=1,"+
    'updated_at=?,row_version=row_version+1 '+
    "WHERE id=? AND current_version=? AND status='QUOTED' AND row_version=? "+
    'AND quote_approved_version=? AND quote_accepted_at IS NULL AND EXISTS('+
    "SELECT 1 FROM customer_review_responses WHERE token_id=? AND decision='ACCEPT')";
   updateParams=[at,ref,at,row.project_id,row.version,row.row_version,row.version,row.token_id];
  }else if(row.purpose==='FINAL_REVIEW'&&decision==='APPROVE'){
   updateSql='UPDATE projects SET customer_approved_version=?,'+
    'customer_approval_evidence_reference=?,updated_at=?,row_version=row_version+1 '+
    "WHERE id=? AND current_version=? AND status='PREVIEW_READY' AND row_version=? "+
    'AND preview_verified=1 AND security_check_passed=1 AND outstanding_revisions=0 '+
    'AND EXISTS(SELECT 1 FROM delivery_quality_reviews WHERE project_id=? AND version=? AND approved=1) '+
    "AND EXISTS(SELECT 1 FROM customer_review_responses WHERE token_id=? AND decision='APPROVE')";
   updateParams=[row.version,ref,at,row.project_id,row.version,row.row_version,
    row.project_id,row.version,row.token_id];
  }else if(decision==='REQUEST_CHANGES'){
   if(row.purpose==='FINAL_REVIEW'){
    updateSql="UPDATE projects SET status='REVIEWING',current_version=current_version+1,"+
      'quote_approved_version=NULL,customer_approved_version=NULL,owner_approved_version=NULL,'+
      'preview_verified=0,security_check_passed=0,quote_accepted_at=NULL,'+
      'quote_acceptance_evidence_reference=NULL,customer_approval_evidence_reference=NULL,'+
      'quote_evidence_reference=NULL,approved_final_total_cad_cents=NULL,'+
      'owner_approved_invoice_total_cad_cents=NULL,invoice_due_days=NULL,'+
      'invoice_due_terms_accepted=0,owner_approved_invoice=0,'+
      'revision_evidence_reference=?,updated_at=?,row_version=row_version+1 '+
      "WHERE id=? AND status='PREVIEW_READY' AND current_version=? AND row_version=? "+
      "AND stripe_invoice_id IS NULL AND delivered_at IS NULL "+
      "AND EXISTS(SELECT 1 FROM customer_review_responses WHERE token_id=? AND decision='REQUEST_CHANGES')";
   }else{
    updateSql="UPDATE projects SET status='REVIEWING',quote_approved_version=NULL,"+
      'quote_evidence_reference=NULL,approved_final_total_cad_cents=NULL,'+
      'invoice_due_days=NULL,invoice_due_terms_accepted=0,revision_evidence_reference=?,'+
      'updated_at=?,row_version=row_version+1 '+
      "WHERE id=? AND status='QUOTED' AND current_version=? AND row_version=? "+
      "AND EXISTS(SELECT 1 FROM customer_review_responses WHERE token_id=? AND decision='REQUEST_CHANGES')";
   }
   updateParams=[ref,at,row.project_id,row.version,row.row_version,row.token_id];
  }else if(row.purpose==='DELIVERY_RECEIPT'&&decision==='RECEIVED'){
   // Customer receipt is recorded, but DELIVERED requires a separate
   // owner operation that records the actual handover and approves this version.
   updateSql="UPDATE projects SET updated_at=?,row_version=row_version+1 "+
      "WHERE id=? AND status='PREVIEW_READY' AND current_version=? AND row_version=? "+
      'AND customer_approved_version=? AND EXISTS('+
      "SELECT 1 FROM customer_review_responses WHERE token_id=? AND decision='RECEIVED')";
   updateParams=[at,row.project_id,row.version,row.row_version,row.version,row.token_id];
  }else return resp({error:'Decision is not allowed'},400);
  const changes=await env.DB.batch([
   env.DB.prepare(
    'INSERT INTO customer_review_responses(id,project_id,token_id,version,purpose,decision,created_at,note) '+
    'SELECT ?,?,?,?,?,?,?,? WHERE EXISTS('+
    'SELECT 1 FROM customer_review_tokens WHERE id=? AND token_hash=? '+
    'AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>? AND version=?)'
   ).bind(responseId,row.project_id,row.token_id,row.version,row.purpose,decision,at,note,
    row.token_id,hash,at,row.version),
   env.DB.prepare(updateSql).bind(...updateParams),
   env.DB.prepare(
    'UPDATE customer_review_tokens SET consumed_at=? WHERE id=? AND token_hash=? '+
    'AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at>? AND EXISTS('+
    'SELECT 1 FROM customer_review_responses WHERE token_id=? AND decision=?)'
   ).bind(at,row.token_id,hash,at,row.token_id,decision),
   env.DB.prepare(
    'INSERT INTO project_events(id,project_id,created_at,action,actor,details_json) '+
    'SELECT ?,?,?,?,?,? WHERE EXISTS('+
    'SELECT 1 FROM customer_review_tokens WHERE id=? AND consumed_at IS NOT NULL)'
   ).bind(crypto.randomUUID(),row.project_id,at,'CUSTOMER_PORTAL_'+decision,
    'customer-portal',JSON.stringify({purpose:row.purpose,version:row.version,
      quote_only:row.purpose==='QUOTE',published:false,payment_requested:false}),
    row.token_id)
  ]);
  if(changes?.length!==4||changes.some(c=>c?.meta?.changes!==1))
   return resp({error:'Project changed; ask for a fresh private review link'},409);
  return resp({ok:true,decision,accepted:decision==='ACCEPT',
    approved:decision==='APPROVE',receipt_recorded:decision==='RECEIVED',
    requested_changes:decision==='REQUEST_CHANGES',website_published:false,
    invoice_sent:false,customer_charged:false,
    next_step:'The MapleWeb AI owner will review your response.'});
 }catch{return resp({error:'Private review is unavailable; contact MapleWeb AI for help'},503);}
}
