/**
 * MapleWeb AI owner-only operations. THIS FILE MUST NOT be routed by the public
 * customer-facing Worker. Deploy only as a separate protected Worker after
 * Cloudflare Access and MANAGER_TOKEN have been configured and tested.
 */
import { ownerAuthed, parseBody } from './mapleweb-agents.mjs';
import { createSandboxInvoiceDraft } from './stripe-invoices.mjs';
import { buildWebsiteStarterBundle } from './site-bundle.mjs';
import {
  validId,commitOwnerTransition,createOwnerAIDraft,invoiceAssessment
} from './order-engine.mjs';

const HEADERS = {
  'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
  'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
  'Referrer-Policy':'no-referrer'
};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const error=(message,status=400)=>json({error:message},status);
const validDb=env=>env?.DB&&typeof env.DB.prepare==='function'&&typeof env.DB.batch==='function';
const rowOf=async(db,id)=>db.prepare('SELECT p.*,s.name,s.email,s.answers_json FROM projects p JOIN submissions s ON s.id=p.submission_id WHERE p.id=?').bind(id).first();

export async function handleOwnerRequest(request,env={}) {
  // Deliberately fail closed if Access is not enforced on the manager Worker.
  // Cloudflare Access identity is supplied only after validation at the edge.
  if(env.MANAGER_API_APPROVED!=='true')return error('Private Manager API not activated',503);
  if(!ownerAuthed(request,env))return error('Unauthorized',401);
  if(!validDb(env))return error('Owner project storage is not configured',503);
  const url=new URL(request.url);
  const path=url.pathname;
  try {
    if(request.method==='GET'&&path==='/api/manager/status')return json({
      service:'MapleWeb AI Private Website Manager',connected_storage:true,
      payments_enabled:false,public_customer_publication_enabled:false,
      ai_drafts_enabled:env.AI_DRAFTS_APPROVED==='true'&&Boolean(env.AI),
      manager_only:true
    });
    if(request.method==='GET'&&path==='/api/manager/projects'){
      const results=await env.DB.prepare(
        'SELECT p.id,p.created_at,p.updated_at,p.status,p.current_version,p.generator,p.invoice_status,s.name,s.email FROM projects p JOIN submissions s ON s.id=p.submission_id ORDER BY p.created_at DESC LIMIT 50'
      ).all();
      return json({projects:results?.results||[]});
    }
    const match=/^\/api\/manager\/projects\/([0-9a-f-]{36})(?:\/(transition|improve-draft|invoice-assessment|approve-invoice|draft-test-invoice|bundle))?$/.exec(path);
    if(!match||!validId(match[1]))return error('Not found',404);
    const id=match[1],operation=match[2]||'';
    const row=await rowOf(env.DB,id);
    if(!row)return error('Project not found',404);
    if(request.method==='GET'&&!operation){
      // This contains PII and the PRIVATE unpublished HTML, only for the protected owner API.
      const parsed={...row};
      try{parsed.answers=JSON.parse(row.answers_json);}catch{parsed.answers={};}
      delete parsed.answers_json;
      return json({project:parsed,invoice_eligibility:invoiceAssessment(row)});
    }
    if(request.method==='GET'&&operation==='bundle'){
      let answers;
      try{answers=JSON.parse(row.answers_json)}catch{return error('Stored requirements invalid',503);}
      return json(buildWebsiteStarterBundle(answers));
    }
    if(request.method==='GET'&&operation==='invoice-assessment')
      return json({project_reference:id,assessment:invoiceAssessment(row)});
    if(request.method!=='POST')return error('Method not allowed',405);
    if(operation==='transition'){
      const payload=await parseBody(request,5000);
      if(!payload||typeof payload!=='object')return error('Invalid request');
      if(!Number.isSafeInteger(payload.expectedRowVersion)||payload.expectedRowVersion!==row.row_version)
        return error('Project has changed. Reload before proceeding.',409);
      const outcome=await commitOwnerTransition(env.DB,row,payload.action,payload);
      return json(outcome,outcome.ok?200:409);
    }
    if(operation==='improve-draft'){
      if(env.AI_DRAFTS_APPROVED!=='true'||!env.AI)
        return error('Paid AI inference has not been approved/connected',503);
      // No client-supplied instructions are forwarded; requirements come from stored,
      // consented customer answers.
      const answers=JSON.parse(row.answers_json);
      const result=await createOwnerAIDraft(env.DB,row,answers,env);
      return json(result,result.ok?200:409);
    }
    if(operation==='draft-test-invoice'){
      const payload=await parseBody(request,1500);
      if(payload?.confirm!=='CREATE_STRIPE_SANDBOX_DRAFT_ONLY'||
         payload?.expectedRowVersion!==row.row_version)
        return error('Explicit sandbox confirmation and current project version required',409);
      const outcome=await createSandboxInvoiceDraft(env.DB,row,env,fetch);
      return json(outcome,outcome.ok?200:409);
    }
    if(operation==='approve-invoice'){
      const payload=await parseBody(request,2500);
      if(payload?.confirm!=='APPROVE_POST_DELIVERY_INVOICE'||
         payload?.expectedRowVersion!==row.row_version)
        return error('Explicit approval and current row version required',409);
      if(row.owner_approved_invoice===1)return error('Invoice was already approved',409);
      const assessment=invoiceAssessment({...row,owner_approved_invoice:1});
      if(!assessment.eligibleForOwnerDraftInvoice)
        return json({error:'Project is not eligible for post-delivery invoicing',blockers:assessment.blockers},409);
      const now=new Date().toISOString();
      const write=env.DB.prepare('UPDATE projects SET owner_approved_invoice=1,row_version=row_version+1,updated_at=? WHERE id=? AND row_version=? AND owner_approved_invoice=0')
        .bind(now,id,row.row_version);
      const event=env.DB.prepare('INSERT INTO project_events(id,project_id,created_at,action,actor,details_json) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM projects WHERE id=? AND row_version=?)')
        .bind(crypto.randomUUID(),id,now,'POST_DELIVERY_INVOICE_REVIEW_APPROVED','owner','{"invoice_sent":false}',id,row.row_version+1);
      const changes=await env.DB.batch([write,event]);
      if(changes[0]?.meta?.changes!==1||changes[1]?.meta?.changes!==1)
        return error('Concurrent project update',409);
      return json({
        approved_for_draft_review:true,invoice_created:false,invoice_sent:false,
        customer_charged:false,project_reference:id
      });
    }
    return error('Not found',404);
  } catch(e) {
    if(Number.isSafeInteger(e?.status)&&e.status>=400&&e.status<500)
      return error(e.message,e.status);
    // Never return raw database, customer data, Cloudflare API or payment errors.
    return error('Private manager operation unavailable; check secure logs',503);
  }
}
