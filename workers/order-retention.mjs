/**
 * Privacy request handling for ABANDONED, never-accepted leads.
 *
 * Financial, delivered, accepted, or invoiced records cannot be deleted via this
 * shortcut. Such requests require a reviewed retention/legal workflow.
 * Database FKs cascade the related private drafts, preview hashes and inbox notes.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function abandonedDeletionEligibility(p) {
  if(!p||!UUID.test(p.id||''))return {allowed:false,reason:'Invalid project'};
  if(!['NEW','REVIEWING','CANCELLED'].includes(p.status))
    return {allowed:false,reason:'Only abandoned, never-accepted requests use quick deletion'};
  if(p.quote_accepted_at||p.stripe_invoice_id||p.invoice_status||p.paid_at||
     p.delivered_at||p.approved_final_total_cad_cents!==null)
    return {allowed:false,reason:'Accepted, priced, delivered, or financially relevant record requires separate retention review'};
  if(!UUID.test(p.submission_id||'')||!Number.isSafeInteger(p.row_version))
    return {allowed:false,reason:'Incomplete project record'};
  return {allowed:true,history_check_required:true,reason:'Provisionally eligible; private DB checks historical acceptance, QA, website files and financial records before deletion'};
}
export async function deleteAbandonedRequest(db,p) {
  const check=abandonedDeletionEligibility(p);
  if(!check.allowed)return {ok:false,error:check.reason};
  if(!db?.prepare)return {ok:false,error:'Storage unavailable'};
  try{
    const sql='DELETE FROM submissions WHERE id=? AND EXISTS '+
      '(SELECT 1 FROM projects p WHERE p.submission_id=submissions.id AND p.id=? '+
      'AND p.row_version=? AND p.status IN (?,?,?) AND p.quote_accepted_at IS NULL '+
      'AND p.stripe_invoice_id IS NULL AND p.invoice_status IS NULL AND p.paid_at IS NULL '+
      'AND p.delivered_at IS NULL AND p.approved_final_total_cad_cents IS NULL '+
      // A previously accepted/project with a final artifact must NEVER be
      // reclassified as an abandoned lead just because a revision resets fields.
      "AND NOT EXISTS(SELECT 1 FROM project_events e WHERE e.project_id=p.id "+ 
      "AND e.action IN ('STATUS_ACCEPTED','CUSTOMER_PORTAL_ACCEPT','STATUS_DELIVERED')) "+
      "AND NOT EXISTS(SELECT 1 FROM customer_review_responses r WHERE r.project_id=p.id "+
      "AND r.decision IN ('ACCEPT','APPROVE','RECEIVED')) "+
      "AND NOT EXISTS(SELECT 1 FROM invoice_operations i WHERE i.project_id=p.id) "+
      "AND NOT EXISTS(SELECT 1 FROM final_website_artifacts a WHERE a.project_id=p.id) "+
      "AND NOT EXISTS(SELECT 1 FROM delivery_quality_reviews q WHERE q.project_id=p.id))";
    const result=await db.prepare(sql).bind(p.submission_id,p.id,p.row_version,
      'NEW','REVIEWING','CANCELLED').run();
    if(result?.meta?.changes!==1)return {ok:false,error:'Record changed or deletion blocked; reload before retrying'};
    return {ok:true,deleted:true,project_reference:p.id,customer_notified:false,
      note:'Submission, draft, expiring links and internal notices removed through database cascade.'};
  }catch{return {ok:false,error:'Deletion unavailable; check database foreign-key configuration'};}
}
