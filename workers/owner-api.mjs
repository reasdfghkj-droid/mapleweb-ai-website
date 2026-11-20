/**
 * MapleWeb AI owner-only operations. THIS FILE MUST NOT be routed by the public
 * customer-facing Worker. Deploy only as a separate protected Worker after
 * Cloudflare Access and MANAGER_TOKEN have been configured and tested.
 */
import { ownerAuthed, parseBody } from './mapleweb-agents.mjs';
import { createSandboxInvoiceDraft } from './stripe-invoices.mjs';
import {checkLiveStripeAccount,getLivePayoutSummary,createLiveInvoiceDraft,sendApprovedLiveInvoice} from './stripe-live.mjs';
import {prepareOwnerQuotePack} from '../billing/owner-quote-pack.mjs';
import {recordDeliveryQualityReview,getDeliveryQualityReadiness,preparePrivateHandoverSummary} from './delivery-quality.mjs';
import { buildWebsiteStarterBundle } from './site-bundle.mjs';
import { createPrivatePreviewShare,revokePrivatePreviewShares } from './private-previews.mjs';
import {issueCustomerReviewLink,listCustomerReviewLinks,revokeCustomerReviewLinks,receiptRecorded} from './customer-review.mjs';
import { listOwnerNotifications,markNotificationRead } from './owner-inbox.mjs';
import { abandonedDeletionEligibility,deleteAbandonedRequest } from './order-retention.mjs';
import { getDeveloperJobStatus,getPrivateStarterBundle,processDeveloperJob } from './developer-handoff.mjs';
import {listDeveloperQueue,markStalledDeveloperJob,retryFailedTemplateOnce,processApprovedTemplateBatch} from './agent-operations.mjs';
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
      ai_developer_enabled:env.AI_DEVELOPER_APPROVED==='true'&&env.AI_DRAFTS_APPROVED==='true'&&Boolean(env.AI),
      auto_template_batch_enabled:env.AUTO_AGENT_BATCH_APPROVED==='true'&&env.AUTO_BUILD_HANDOFF_APPROVED==='true',
      manager_only:true
    });
    if(request.method==='GET'&&path==='/api/manager/projects'){
      const results=await env.DB.prepare(
        'SELECT p.id,p.created_at,p.updated_at,p.status,p.current_version,p.generator,p.invoice_status,s.name,s.email FROM projects p JOIN submissions s ON s.id=p.submission_id ORDER BY p.created_at DESC LIMIT 50'
      ).all();
      return json({projects:results?.results||[]});
    }
    if(request.method==='GET'&&path==='/api/manager/live-stripe-status'){
      const result=await checkLiveStripeAccount(env,fetch);
      return json(result,result.ok?200:503);
    }
    if(request.method==='GET'&&path==='/api/manager/live-payouts'){
      const result=await getLivePayoutSummary(env,fetch);
      return json(result,result.ok?200:503);
    }
    if(request.method==='GET'&&path==='/api/manager/build-queue'){
      const result=await listDeveloperQueue(env.DB);
      return json(result,result.ok?200:503);
    }
    if(request.method==='POST'&&path==='/api/manager/run-template-batch'){
      const payload=await parseBody(request,800);
      if(payload?.confirm!=='RUN_APPROVED_PRIVATE_TEMPLATE_BATCH')
        return error('Explicit owner consent required for private processing',409);
      const result=await processApprovedTemplateBatch(env,Math.min(3,payload.limit||2));
      return json(result,result.ok?200:409);
    }
    if(request.method==='GET'&&path==='/api/manager/notifications'){
      return json(await listOwnerNotifications(env.DB));
    }
    const readMatch=/^\/api\/manager\/notifications\/([0-9a-f-]{36})\/read$/.exec(path);
    if(request.method==='POST'&&readMatch&&validId(readMatch[1])){
      const body=await parseBody(request,700);
      if(body?.confirm!=='MARK_NOTIFICATION_READ')return error('Explicit notification acknowledgment required');
      const result=await markNotificationRead(env.DB,readMatch[1]);
      return json(result,result.ok?200:400);
    }
    const match=/^\/api\/manager\/projects\/([0-9a-f-]{36})(?:\/(transition|improve-draft|invoice-assessment|approve-invoice|draft-test-invoice|bundle|preview-share|preview-revoke|preview-list|delete-request|builder-status|builder-output|process-build|mark-stalled-build|retry-template|quote-pack|delivery-quality|delivery-review|handover-summary|issue-review|review-links|revoke-review-links|live-draft|live-send))?$/.exec(path);
    if(!match||!validId(match[1]))return error('Not found',404);
    const id=match[1],operation=match[2]||'';
    const row=await rowOf(env.DB,id);
    if(!row)return error('Project not found',404);
    if(request.method==='GET'&&!operation){
      // This contains PII and the PRIVATE unpublished HTML, only for the protected owner API.
      const parsed={...row};
      try{parsed.answers=JSON.parse(row.answers_json);}catch{parsed.answers={};}
      delete parsed.answers_json;
      return json({project:parsed,invoice_eligibility:invoiceAssessment(row),abandoned_delete_eligibility:abandonedDeletionEligibility(row),developer_build:await getDeveloperJobStatus(env.DB,id),delivery_quality:await getDeliveryQualityReadiness(env.DB,row)});
    }
    if(request.method==='GET'&&operation==='review-links'){
      const result=await listCustomerReviewLinks(env.DB,id);
      return json(result,result.ok?200:409);
    }
    if(request.method==='GET'&&operation==='delivery-quality')
      return json(await getDeliveryQualityReadiness(env.DB,row));
    if(request.method==='GET'&&operation==='handover-summary'){
      const result=await preparePrivateHandoverSummary(env.DB,row);
      return json(result,result.ok?200:409);
    }
    if(request.method==='GET'&&operation==='quote-pack'){
      let answers;
      try{answers=JSON.parse(row.answers_json)}catch{return error('Stored requirements invalid',503);}
      const pack=prepareOwnerQuotePack(answers,{
        customerName:row.name,projectReference:id,
        approvedFinalTotalCadCents:row.approved_final_total_cad_cents,
        invoiceDueDays:row.invoice_due_days
      });
      return json(pack,pack.ok?200:409);
    }
    if(request.method==='GET'&&operation==='builder-status')
      return json(await getDeveloperJobStatus(env.DB,id));
    if(request.method==='GET'&&operation==='builder-output'){
      const result=await getPrivateStarterBundle(env.DB,id);
      return json(result,result.ok?200:409);
    }
    if(request.method==='GET'&&operation==='bundle'){
      let answers;
      try{answers=JSON.parse(row.answers_json)}catch{return error('Stored requirements invalid',503);}
      return json(buildWebsiteStarterBundle(answers));
    }
    if(request.method==='GET'&&operation==='preview-list'){
      const result=await env.DB.prepare(
        'SELECT id,version,created_at,expires_at,revoked_at,views,max_views FROM preview_shares WHERE project_id=? ORDER BY created_at DESC LIMIT 30'
      ).bind(id).all();
      return json({project_reference:id,shares:result?.results||[],raw_tokens_never_stored:true});
    }
    if(request.method==='GET'&&operation==='invoice-assessment')
      return json({project_reference:id,assessment:invoiceAssessment(row)});
    if(request.method!=='POST')return error('Method not allowed',405);
    if(operation==='issue-review'){
      const payload=await parseBody(request,2200);
      const result=await issueCustomerReviewLink(env.DB,row,env,payload);
      return json(result,result.ok?200:409);
    }
    if(operation==='revoke-review-links'){
      const payload=await parseBody(request,600);
      if(payload?.confirm!=='REVOKE_ALL_CUSTOMER_REVIEW_LINKS'||
         payload?.expectedRowVersion!==row.row_version)
        return error('Confirm the current project before revoking private links',409);
      const result=await revokeCustomerReviewLinks(env.DB,id);
      return json(result,result.ok?200:409);
    }
    if(operation==='delivery-review'){
      const payload=await parseBody(request,4500);
      if(!payload||typeof payload!=='object')return error('Invalid final website QA request');
      const result=await recordDeliveryQualityReview(env.DB,row,payload);
      return json(result,result.ok?200:409);
    }
    if(operation==='mark-stalled-build'){
      const payload=await parseBody(request,1200);
      if(payload?.confirm!=='MARK_STALLED_JOB_FAILED'||payload?.expectedRowVersion!==row.row_version)
        return error('Confirm stalled-job review and exact project version',409);
      const result=await markStalledDeveloperJob(env.DB,id);
      return json(result,result.ok?200:409);
    }
    if(operation==='retry-template'){
      const payload=await parseBody(request,1200);
      if(payload?.confirm!=='RETRY_FAILED_TEMPLATE_ONCE'||payload?.expectedRowVersion!==row.row_version)
        return error('Confirm one manual fixed-template retry and exact project version',409);
      const result=await retryFailedTemplateOnce(env.DB,id);
      return json(result,result.ok?200:409);
    }
    if(operation==='process-build'){
      const payload=await parseBody(request,1500);
      if(payload?.confirm!=='PROCESS_PRIVATE_STARTER_ONLY' ||
         payload?.expectedRowVersion!==row.row_version)
        return error('Explicit authorized build request and current project version required',409);
      if(env.AUTO_BUILD_HANDOFF_APPROVED!=='true')
        return error('Developer handoff is not approved for processing',503);
      const result=await processDeveloperJob(env.DB,id,env);
      return json(result,result.ok?200:409);
    }
    if(operation==='delete-request'){
      const payload=await parseBody(request,1200);
      if(payload?.confirm!=='DELETE_ABANDONED_REQUEST'||payload?.projectReference!==id||
         payload?.expectedRowVersion!==row.row_version)
        return error('Explicit project-matched deletion and current version required',409);
      const result=await deleteAbandonedRequest(env.DB,row);
      return json(result,result.ok?200:409);
    }
    if(operation==='preview-share'){
      const payload=await parseBody(request,1300);
      if(payload?.confirm!=='CREATE_PRIVATE_CUSTOMER_PREVIEW'||
         payload?.expectedRowVersion!==row.row_version)
        return error('Confirm the exact project version before sharing a preview',409);
      if(env.PRIVATE_PREVIEWS_APPROVED!=='true')
        return error('Private preview sharing has not been approved and configured',503);
      const result=await createPrivatePreviewShare(env.DB,row,env,payload.hours??48);
      return json(result,result.ok?200:409);
    }
    if(operation==='preview-revoke'){
      const payload=await parseBody(request,900);
      if(payload?.confirm!=='REVOKE_ALL_CUSTOMER_PREVIEW_LINKS')
        return error('Explicit link revocation confirmation required',409);
      const result=await revokePrivatePreviewShares(env.DB,id);
      return json(result,result.ok?200:409);
    }
    if(operation==='transition'){
      const payload=await parseBody(request,5000);
      if(!payload||typeof payload!=='object')return error('Invalid request');
      if(!Number.isSafeInteger(payload.expectedRowVersion)||payload.expectedRowVersion!==row.row_version)
        return error('Project has changed. Reload before proceeding.',409);
      if(payload.action==='DELIVERED'){
        if(env.CUSTOMER_PORTAL_APPROVED==='true'){
          const receipt=await receiptRecorded(env.DB,row);
          if(!receipt.ok)return json({error:'Customer must acknowledge final website handover through the secure review portal'},409);
          if(row.customer_approved_version!==row.current_version||
             !row.customer_approval_evidence_reference)
            return json({error:'The customer has not approved the delivered version'},409);
          payload.customerReceiptEvidenceReference=receipt.evidence_reference;
          payload.customerApprovalEvidenceReference=row.customer_approval_evidence_reference;
          payload.customerApproved=true;
        }
        const ready=await getDeliveryQualityReadiness(env.DB,row);
        if(!ready.ok||!ready.ready||ready.version!==row.current_version)
          return json({error:'Final website delivery QA has not been approved for this version',
            blockers:ready.blockers||[ready.reason]},409);
      }
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
    if(operation==='live-draft'||operation==='live-send'){
      const payload=await parseBody(request,1500);
      const required=operation==='live-draft'?'CREATE_POST_DELIVERY_LIVE_INVOICE_DRAFT':'SEND_POST_DELIVERY_LIVE_INVOICE';
      if(payload?.confirm!==required||payload?.expectedRowVersion!==row.row_version)
        return error('Current project version and explicit live invoice authorization are required',409);
      const qa=await getDeliveryQualityReadiness(env.DB,row);
      if(!qa.ready||qa.version!==row.current_version)
        return json({error:'Final website QA for this delivered version is required'},409);
      if(env.CUSTOMER_PORTAL_APPROVED==='true'){
        const receipt=await receiptRecorded(env.DB,row);
        if(!receipt.ok)return json({error:'Verified customer handover receipt is required'},409);
      }
      const result=operation==='live-draft'?
        await createLiveInvoiceDraft(env.DB,row,env,fetch):
        await sendApprovedLiveInvoice(env.DB,row,env,fetch);
      return json(result,result.ok?200:409);
    }
    if(operation==='draft-test-invoice'){
      const payload=await parseBody(request,1500);
      if(payload?.confirm!=='CREATE_STRIPE_SANDBOX_DRAFT_ONLY'||
         payload?.expectedRowVersion!==row.row_version)
        return error('Explicit sandbox confirmation and current project version required',409);
      const qa=await getDeliveryQualityReadiness(env.DB,row);
      if(!qa.ok||!qa.ready)
        return json({error:'Final website QA record required before even a test invoice draft',
          blockers:[qa.reason]},409);
      const outcome=await createSandboxInvoiceDraft(env.DB,row,env,fetch);
      return json(outcome,outcome.ok?200:409);
    }
    if(operation==='approve-invoice'){
      const payload=await parseBody(request,2500);
      if(payload?.confirm!=='APPROVE_POST_DELIVERY_INVOICE'||
         payload?.expectedRowVersion!==row.row_version)
        return error('Explicit approval and current row version required',409);
      if(row.owner_approved_invoice===1)return error('Invoice was already approved',409);
      const qa=await getDeliveryQualityReadiness(env.DB,row);
      if(!qa.ok||!qa.ready)
        return json({error:'Final website QA record required before invoice approval',
          blockers:[qa.reason]},409);
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
