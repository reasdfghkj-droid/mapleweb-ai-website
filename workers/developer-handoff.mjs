/**
 * MapleWeb AI - durable Website Developer Agent handoff.
 *
 * Every consented customer brief is saved atomically with its private project
 * AND a build job. The consumer generates a review-only starter bundle using
 * fixed templates. There is NO paid AI inference, publication, email, invoice,
 * or customer approval implied by a successful handoff.
 */
import { buildWebsiteStarterBundle } from './site-bundle.mjs';


const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function idOk(id){return typeof id==='string'&&UUID.test(id)}
function okEnv(env){return env?.AUTO_BUILD_HANDOFF_APPROVED==='true' && Boolean(env?.DB?.prepare) && Boolean(env?.DB?.batch)}

/** Use as the fifth D1 batch statement in saveLeadAsProject(). */
export function developerJobInsert(db,projectId,createdAt) {
  if(!db?.prepare||!idOk(projectId)||typeof createdAt!=='string')throw Error('Invalid developer handoff job');
  return db.prepare(
    "INSERT INTO developer_build_jobs(project_id,created_at,status,generator) VALUES (?,?,'QUEUED','fixed-template')"
  ).bind(projectId,createdAt);
}

/**
 * At-most-once claim: two workers cannot process the same queued job.
 * Do not automatically retry failed/ambiguous jobs: owner must investigate.
 */
export async function processDeveloperJob(db,projectId,env={}) {
  if(!okEnv({...env,DB:db}))return {ok:false,reason:'Developer build processing is not approved or storage is missing',accepted:false};
  if(!idOk(projectId))return {ok:false,reason:'Invalid project reference',accepted:false};
  let job;
  try {
    job=await db.prepare(
      'SELECT j.status,j.attempts,p.status AS project_status,p.current_version,s.answers_json '+
      'FROM developer_build_jobs j JOIN projects p ON p.id=j.project_id '+
      'JOIN submissions s ON s.id=p.submission_id WHERE j.project_id=?'
    ).bind(projectId).first();
  }catch{return {ok:false,reason:'Build queue unavailable',accepted:false};}
  if(!job||job.status!=='QUEUED'||!['NEW','REVIEWING'].includes(job.project_status))
    return {ok:false,reason:'Job is not queued for a review-only starter',accepted:false};
  const timestamp=new Date().toISOString();
  try{
    const claim=await db.prepare(
      "UPDATE developer_build_jobs SET status='BUILDING',started_at=?,attempts=attempts+1 "+
      "WHERE project_id=? AND status='QUEUED' AND attempts=0 AND EXISTS "+
      "(SELECT 1 FROM projects WHERE id=? AND status IN ('NEW','REVIEWING') AND current_version=?)"
    ).bind(timestamp,projectId,projectId,job.current_version).run();
    if(claim?.meta?.changes!==1)return {ok:false,reason:'Build job was already claimed or project changed',accepted:false};
  }catch{return {ok:false,reason:'Build job could not be claimed',accepted:false};}
  try {
    const a=JSON.parse(job.answers_json);
    const result=buildWebsiteStarterBundle(a);
    const output=JSON.stringify(result);
    if(output.length>230000)throw Error('Bundle too large');
    const now=new Date().toISOString();
    const statements=[
      db.prepare(
        "UPDATE developer_build_jobs SET status='STARTER_READY',completed_at=?,output_json=?,error_code=NULL "+
        "WHERE project_id=? AND status='BUILDING' AND EXISTS "+
        "(SELECT 1 FROM projects WHERE id=? AND status IN ('NEW','REVIEWING') AND current_version=?)"
      ).bind(now,output,projectId,projectId,job.current_version),
      db.prepare(
        "INSERT INTO project_events(id,project_id,created_at,action,actor,details_json) "+
        "SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM developer_build_jobs WHERE project_id=? AND status='STARTER_READY')"
      ).bind(crypto.randomUUID(),projectId,now,'PRIVATE_STARTER_PREPARED','developer',
        '{"generated_by":"fixed-template","published":false}',projectId),
      db.prepare(
        "INSERT INTO owner_notifications(id,project_id,category,created_at) "+
        "SELECT ?,?,?,? WHERE EXISTS "+
        "(SELECT 1 FROM developer_build_jobs WHERE project_id=? AND status='STARTER_READY')"
      ).bind(crypto.randomUUID(),projectId,'READY_FOR_REVIEW',now,projectId)
    ];
    const recorded=await db.batch(statements);
    if(recorded?.length!==3||recorded.some(x=>x?.meta?.changes!==1))
      throw Error('Could not save the completed starter');
    return {ok:true,project_reference:projectId,status:'STARTER_READY',
      developer_starter_ready:true,automated_builder:'fixed-template',
      full_website_finished:false,customer_notified:false,
      paid_ai_used:false,published:false};
  }catch {
    try{
      await db.prepare(
        "UPDATE developer_build_jobs SET status='FAILED',error_code='STARTER_GENERATION_FAILED' "+
        "WHERE project_id=? AND status='BUILDING'"
      ).bind(projectId).run();
    }catch{/* leave queued record for owner investigation; do not auto-retry */}
    return {ok:false,reason:'Private starter build needs owner investigation',accepted:true};
  }
}

/** No PII, customer raw text, or source HTML in this status. */
export async function getDeveloperJobStatus(db,projectId) {
  if(!db?.prepare||!idOk(projectId))return {ok:false,status:'UNKNOWN'};
  const job=await db.prepare(
    'SELECT status,created_at,started_at,completed_at,attempts,generator,error_code '+
    'FROM developer_build_jobs WHERE project_id=?'
  ).bind(projectId).first();
  if(!job)return {ok:false,status:'NOT_FOUND'};
  return {ok:true,project_reference:projectId,...job,
    full_customer_website_ready:false,customer_payment_required:false};
}

export async function getPrivateStarterBundle(db,projectId) {
  if(!db?.prepare||!idOk(projectId))return {ok:false,error:'Invalid project'};
  const result=await db.prepare(
    "SELECT status,output_json FROM developer_build_jobs WHERE project_id=?"
  ).bind(projectId).first();
  if(result?.status!=='STARTER_READY'||typeof result.output_json!=='string')
    return {ok:false,error:'Starter bundle not prepared yet'};
  try{
    const bundle=JSON.parse(result.output_json);
    if(bundle.kind!=='mapleweb-private-website-source-bundle'||bundle.published!==false)
      return {ok:false,error:'Invalid stored starter bundle'};
    return {ok:true,bundle};
  }catch{return {ok:false,error:'Starter bundle unavailable'};}
}
