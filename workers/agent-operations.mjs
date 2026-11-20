/**
 * PRIVATE Website Developer Agent operations.
 * No public endpoint. No unsolicited payments, customer-site publication,
 * external email, automatic paid AI retries or unsupervised data export.
 */
import {processDeveloperJob} from './developer-handoff.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validId=id=>typeof id==='string'&&UUID.test(id);
const fail=error=>({ok:false,error});
const validDb=db=>Boolean(db?.prepare&&db?.batch);
const STALE_MINUTES=30;

/** Only internal identifiers and statuses; never expose customer emails or briefs. */
export async function listDeveloperQueue(db,limit=50){
  if(!validDb(db)||!Number.isSafeInteger(limit)||limit<1||limit>100)
    return fail('Private queue database is not ready');
  try{
    const res=await db.prepare(
      'SELECT j.project_id,j.status,j.generator,j.created_at,j.started_at,j.completed_at,'+
      'j.attempts,j.manual_retries,j.error_code,p.status AS project_status '+
      'FROM developer_build_jobs j JOIN projects p ON p.id=j.project_id '+
      'ORDER BY CASE j.status WHEN \'FAILED\' THEN 0 WHEN \'BUILDING\' THEN 1 '+
      'WHEN \'QUEUED\' THEN 2 ELSE 3 END,j.created_at DESC LIMIT ?'
    ).bind(limit).all();
    const jobs=res?.results||[];
    return {ok:true,jobs,private_only:true,has_customer_pii:false,
      stale_build_after_minutes:STALE_MINUTES,
      queued:jobs.filter(x=>x.status==='QUEUED').length,
      failed:jobs.filter(x=>x.status==='FAILED').length,
      building:jobs.filter(x=>x.status==='BUILDING').length};
  }catch{return fail('Developer queue unavailable; check D1 migration 0005');}
}

/** Verify a job has been stuck for at least 30 minutes before owner review. */
export function inspectStaleBuild(job,nowMs=Date.now()){
  if(!job||job.status!=='BUILDING')return fail('Only active building jobs can be reviewed as stalled');
  const start=Date.parse(job.started_at||'');
  if(!Number.isFinite(start)||start>nowMs||nowMs-start<STALE_MINUTES*60000)
    return fail('Build has not passed the 30-minute recovery window');
  if(job.output_json!==null&&job.output_json!==undefined)
    return fail('Build output already exists; owner review required');
  if(!Number.isInteger(job.attempts)||job.attempts<1)
    return fail('No processing attempt has been recorded');
  return {ok:true,reason:'Stalled job requires manual owner review before retrying'};
}

/**
 * Mark stalled jobs as FAILED, not QUEUED. Does not call a paid AI provider.
 * A template-only job can subsequently be retried once by an owner.
 */
export async function markStalledDeveloperJob(db,projectId,nowMs=Date.now()){
  if(!validDb(db)||!validId(projectId))return fail('Invalid private job');
  try{
    const job=await db.prepare(
      'SELECT status,started_at,attempts,generator,output_json FROM developer_build_jobs WHERE project_id=?'
    ).bind(projectId).first();
    const check=inspectStaleBuild(job,nowMs);
    if(!check.ok)return check;
    const now=new Date(nowMs).toISOString();
    const statements=[
      db.prepare(
        "UPDATE developer_build_jobs SET status='FAILED',error_code='STALE_JOB_OWNER_REVIEW' "+
        "WHERE project_id=? AND status='BUILDING' AND started_at=? AND attempts=? AND output_json IS NULL"
      ).bind(projectId,job.started_at,job.attempts),
      db.prepare(
        'INSERT INTO project_events(id,project_id,created_at,action,actor,details_json) '+
        "SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM developer_build_jobs WHERE project_id=? AND status='FAILED' AND error_code='STALE_JOB_OWNER_REVIEW')"
      ).bind(crypto.randomUUID(),projectId,now,'STALLED_DEVELOPER_JOB_MARKED_FAILED','owner',
        '{"auto_retried":false,"customer_notified":false}',projectId)
    ];
    const done=await db.batch(statements);
    if(done?.length!==2||done.some(x=>x?.meta?.changes!==1))
      return fail('Concurrent job change; refresh the private queue');
    return {ok:true,status:'FAILED',auto_retried:false,
      paid_ai_retried:false,owner_review_required:true};
  }catch{return fail('Could not mark stalled job for owner review');}
}

/** Manual retry is allowed ONLY once for fixed templates, never for paid AI. */
export async function retryFailedTemplateOnce(db,projectId) {
  if(!validDb(db)||!validId(projectId))return fail('Invalid private job');
  try{
    const job=await db.prepare(
      'SELECT j.status,j.generator,j.attempts,j.manual_retries,j.output_json,'+
      'p.status AS project_status,p.stripe_invoice_id,p.quote_accepted_at '+
      'FROM developer_build_jobs j JOIN projects p ON p.id=j.project_id WHERE j.project_id=?'
    ).bind(projectId).first();
    if(!job||job.status!=='FAILED'||job.generator!=='fixed-template'||
       job.attempts!==1||job.manual_retries!==0||job.output_json!==null||
       !['NEW','REVIEWING'].includes(job.project_status)||
       job.quote_accepted_at||job.stripe_invoice_id)
      return fail('Only one reviewed retry of a failed, unquoted fixed-template job is allowed');
    const now=new Date().toISOString();
    const statements=[
      db.prepare(
        "UPDATE developer_build_jobs SET status='QUEUED',attempts=0,manual_retries=1,"+
        'started_at=NULL,completed_at=NULL,error_code=NULL '+
        "WHERE project_id=? AND status='FAILED' AND generator='fixed-template' "+
        "AND attempts=1 AND manual_retries=0 AND output_json IS NULL AND EXISTS "+
        "(SELECT 1 FROM projects WHERE id=? AND status IN ('NEW','REVIEWING') "+
        'AND quote_accepted_at IS NULL AND stripe_invoice_id IS NULL)'
      ).bind(projectId,projectId),
      db.prepare(
        "INSERT INTO project_events(id,project_id,created_at,action,actor,details_json) "+
        "SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM developer_build_jobs WHERE project_id=? AND status='QUEUED' AND manual_retries=1)"
      ).bind(crypto.randomUUID(),projectId,now,'OWNER_RETRIED_TEMPLATE_JOB','owner',
        '{"paid_ai_used":false,"manual_retry":true}',projectId)
    ];
    const done=await db.batch(statements);
    if(done?.length!==2||done.some(x=>x?.meta?.changes!==1))
      return fail('Retry was not saved; reload the job');
    return {ok:true,status:'QUEUED',manual_retries:1,
      paid_ai_used:false,auto_retried:false};
  }catch{return fail('Could not retry template job');}
}

/**
 * Optional private scheduled/operator batch. Hard limits prevent mass AI calls.
 * Disabled by default and only processes fixed-template jobs.
 */
export async function processApprovedTemplateBatch(env={},limit=2) {
  if(env.AUTO_AGENT_BATCH_APPROVED!=='true'||
     env.AUTO_BUILD_HANDOFF_APPROVED!=='true'||
     env.AI_DEVELOPER_APPROVED==='true'||!validDb(env.DB))
    return fail('Private scheduled template processing is disabled or AI billing is enabled');
  if(!Number.isSafeInteger(limit)||limit<1||limit>3)
    return fail('Batch size must be between 1 and 3');
  let list;
  try{
    list=await env.DB.prepare(
      "SELECT j.project_id FROM developer_build_jobs j JOIN projects p ON p.id=j.project_id "+
      "WHERE j.status='QUEUED' AND j.attempts=0 AND p.status IN ('NEW','REVIEWING') "+
      'ORDER BY j.created_at ASC LIMIT ?'
    ).bind(limit).all();
  }catch{return fail('Could not read pending private template jobs');}
  let ready=0,skipped=0;
  for(const row of list?.results||[]){
    const outcome=await processDeveloperJob(env.DB,row.project_id,env);
    if(outcome.ok)ready++;else skipped++;
  }
  return {ok:true,attempted:ready+skipped,starters_ready:ready,skipped,
    paid_ai_used:false,published:false,customer_emailed:false};
}
