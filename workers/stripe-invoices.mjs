import { invoiceAssessment } from './order-engine.mjs';

/**
 * Stripe Invoicing adapter. SANDBOX ONLY: never creates live invoices.
 * Requires owner-authenticated private API + explicit Stripe sandbox secret.
 * It creates a DRAFT after verified delivery and owner invoice approval.
 * It does NOT finalize, email, charge, or send an invoice.
 */
const requireSandbox = env =>
  env?.STRIPE_TEST_DRAFTS_APPROVED==='true' &&
  typeof env?.STRIPE_SECRET_KEY==='string' &&
  env.STRIPE_SECRET_KEY.startsWith('sk_test_') &&
  env.STRIPE_SECRET_KEY.length>25;
const idPattern=/^[A-Za-z0-9_-]{3,100}$/;

async function stripeRequest(path,body,key,idempotencyKey,fetcher=fetch) {
  const headers={'Authorization':'Bearer '+key,'Accept':'application/json'};
  const options={method:body?'POST':'GET',headers,redirect:'error'};
  if(body){
    headers['Content-Type']='application/x-www-form-urlencoded';
    headers['Idempotency-Key']=idempotencyKey;
    options.body=new URLSearchParams(body).toString();
  }
  const response=await fetcher('https://api.stripe.com/v1/'+path,options);
  if(!response.ok)throw new Error('Stripe API request did not succeed');
  const data=await response.json();
  if(!data||typeof data!=='object')throw new Error('Invalid Stripe API response');
  return data;
}

export async function createSandboxInvoiceDraft(db,project,env,fetcher=fetch) {
  if(!requireSandbox(env))return {ok:false,error:'Stripe sandbox draft creation is not approved/configured'};
  if(!db?.prepare || !db?.batch)return {ok:false,error:'Private project database unavailable'};
  const check=invoiceAssessment(project);
  if(!check.eligibleForOwnerDraftInvoice)
    return {ok:false,error:'Post-delivery invoice gate blocked',blockers:check.blockers};
  if(!Number.isSafeInteger(project.invoice_due_days)||project.invoice_due_days<1||project.invoice_due_days>60)
    return {ok:false,error:'Invalid due date terms'};
  if(!Number.isSafeInteger(project.approved_final_total_cad_cents)||project.approved_final_total_cad_cents<1)
    return {ok:false,error:'Invalid final amount'};
  // This value is the already signed/approved CAD grand total INCLUDING applicable tax.
  // Tax breakout and Stripe Tax settings need owner review before production invoicing.
  const pid=project.id;
  if(!/^[0-9a-f-]{36}$/.test(pid))return {ok:false,error:'Invalid project reference'};
  const now=new Date().toISOString();
  const idemKey='mapleweb-sandbox-draft-'+pid;
  let reserved;
  try{
    reserved=await db.prepare('INSERT OR IGNORE INTO invoice_operations(project_id,created_at,updated_at,status,idempotency_key) VALUES (?,?,?,?,?)')
      .bind(pid,now,now,'RESERVED',idemKey).run();
  }catch{return {ok:false,error:'Unable to reserve invoice draft'};}
  if(reserved?.meta?.changes!==1)
    return {ok:false,error:'Invoice operation already exists; manual review required before retrying'};
  try{
    const customer=await stripeRequest('customers',{
      email:project.email,name:project.name||'MapleWeb customer',
      'metadata[mapleweb_project_id]':pid
    },env.STRIPE_SECRET_KEY,idemKey+'-customer',fetcher);
    if(!idPattern.test(customer.id)||!customer.id.startsWith('cus_'))throw new Error('Customer missing');
    const invoice=await stripeRequest('invoices',{
      customer:customer.id,collection_method:'send_invoice',
      days_until_due:String(project.invoice_due_days),
      auto_advance:'false',currency:'cad',
      'metadata[mapleweb_project_id]':pid,
      'description':'MapleWeb AI website development — payable after confirmed delivery'
    },env.STRIPE_SECRET_KEY,idemKey+'-invoice',fetcher);
    if(!idPattern.test(invoice.id)||!invoice.id.startsWith('in_')||invoice.status!=='draft')
      throw new Error('Expected draft invoice not returned');
    const item=await stripeRequest('invoiceitems',{
      customer:customer.id,invoice:invoice.id,currency:'cad',
      amount:String(project.approved_final_total_cad_cents),
      description:'Approved completed website development (CAD total; tax details subject to invoice review)'
    },env.STRIPE_SECRET_KEY,idemKey+'-line',fetcher);
    if(!idPattern.test(item.id))throw new Error('Invoice line missing');
    // Never finalize or email. Owner must inspect Stripe dashboard and reconcile
    // tax line items and totals before sending any invoice to a customer.
    const update=await db.batch([
      db.prepare('UPDATE invoice_operations SET status=?,stripe_customer_id=?,stripe_invoice_id=?,updated_at=? WHERE project_id=? AND status=?')
        .bind('DRAFT_CREATED',customer.id,invoice.id,now,pid,'RESERVED'),
      db.prepare('UPDATE projects SET stripe_customer_id=?,stripe_invoice_id=?,invoice_status=?,updated_at=?,row_version=row_version+1 WHERE id=? AND stripe_invoice_id IS NULL AND status=?')
        .bind(customer.id,invoice.id,'draft',now,pid,'DELIVERED')
    ]);
    if(update?.[0]?.meta?.changes!==1||update?.[1]?.meta?.changes!==1)
      throw new Error('Could not reconcile local draft invoice status');
    return {ok:true,mode:'test',draft_created:true,invoice_sent:false,customer_charged:false,
      invoice_id:invoice.id,project_reference:pid,requires_owner_review:true};
  }catch{
    // Partial Stripe-side changes may have happened. Never automatically retry.
    try{await db.prepare("UPDATE invoice_operations SET status='MANUAL_REVIEW',updated_at=? WHERE project_id=?")
      .bind(new Date().toISOString(),pid).run();}catch{/* owner must reconcile */}
    return {ok:false,error:'Draft preparation incomplete. Manual Stripe reconciliation required. Do not retry automatically.'};
  }
}

// Verify signature over exact raw bytes per Stripe webhook signing rules.
function hex(bytes){return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('')}
function timingSafeEq(a,b){
  if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
export async function verifyStripeSignature(raw,header,secret,now=Date.now()) {
  if(typeof raw!=='string'||typeof header!=='string'||typeof secret!=='string'||!secret.startsWith('whsec_'))
    return false;
  const pieces=header.split(',').map(s=>s.trim()),time=pieces.find(s=>s.startsWith('t='))?.slice(2);
  const signatures=pieces.filter(s=>s.startsWith('v1=')).map(s=>s.slice(3));
  const timestamp=Number(time);
  if(!/^\d{9,12}$/.test(time||'')||!Number.isFinite(timestamp)||Math.abs(now-timestamp*1000)>300000||!signatures.length)
    return false;
  const encoder=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const digest=await crypto.subtle.sign('HMAC',key,encoder.encode(time+'.'+raw));
  const expected=hex(digest);
  return signatures.some(signature=>/^[0-9a-f]{64}$/i.test(signature)&&timingSafeEq(signature.toLowerCase(),expected));
}

export async function processSandboxInvoiceWebhook(request,env,fetcher=fetch) {
  const fail=(error,status=400)=>new Response(JSON.stringify({error}),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(env?.STRIPE_SANDBOX_WEBHOOKS_APPROVED!=='true'||!requireSandbox(env)||
     typeof env.STRIPE_WEBHOOK_SECRET!=='string'||!env.STRIPE_WEBHOOK_SECRET.startsWith('whsec_')||
     !env.DB?.prepare||!env.DB?.batch)
    return fail('Stripe invoice webhooks are disabled',503);
  if(request.method!=='POST')return fail('Method not allowed',405);
  const len=Number(request.headers.get('content-length')||0);
  if(len>65536)return fail('Payload too large',413);
  let raw;
  try{raw=await request.text();if(raw.length>65536)return fail('Payload too large',413);}
  catch{return fail('Unreadable payload');}
  const verified=await verifyStripeSignature(raw,request.headers.get('stripe-signature')||'',env.STRIPE_WEBHOOK_SECRET);
  if(!verified)return fail('Invalid signature',400);
  let event;
  try{event=JSON.parse(raw)}catch{return fail('Invalid JSON');}
  if(typeof event.id!=='string'||!/^evt_[A-Za-z0-9_]+$/.test(event.id))return fail('Invalid event ID');
  if(event.type!=='invoice.paid')return new Response(JSON.stringify({received:true,ignored:true}),{headers:{'Content-Type':'application/json'}});
  const obj=event.data?.object;
  if(!obj?.id||typeof obj.id!=='string'||!obj.id.startsWith('in_'))
    return fail('Invalid invoice');
  try{
    // Do not trust even a signature-valid event as current invoice state.
    const stripeInvoice=await stripeRequest('invoices/'+encodeURIComponent(obj.id),null,env.STRIPE_SECRET_KEY,null,fetcher);
    if(stripeInvoice.status!=='paid'||stripeInvoice.currency!=='cad'||stripeInvoice.paid!==true)
      return fail('Invoice not confirmed paid at Stripe',409);
    if(event.livemode!==false||stripeInvoice.livemode!==false)
      return fail('Live events are not allowed by sandbox handler',400);
    const pid=stripeInvoice.metadata?.mapleweb_project_id;
    if(!pid||!/^[0-9a-f-]{36}$/.test(pid))return fail('Missing verified project reference');
    const row=await env.DB.prepare('SELECT stripe_invoice_id,invoice_status,status,approved_final_total_cad_cents,stripe_customer_id FROM projects WHERE id=?')
      .bind(pid).first();
    if(row?.stripe_invoice_id!==stripeInvoice.id||row.status!=='DELIVERED'||
       row.stripe_customer_id!==stripeInvoice.customer||
       row.approved_final_total_cad_cents!==stripeInvoice.amount_paid)
      return fail('Verified invoice does not match completed project',409);
    const now=new Date().toISOString();
    const changes=await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO stripe_webhook_events(stripe_event_id,received_at,type) VALUES (?,?,?)')
        .bind(event.id,now,event.type),
      env.DB.prepare("UPDATE projects SET invoice_status='paid',paid_at=?,updated_at=?,row_version=row_version+1 WHERE id=? AND stripe_invoice_id=? AND (invoice_status IS NULL OR invoice_status!='paid')")
        .bind(now,now,pid,stripeInvoice.id),
      env.DB.prepare("UPDATE invoice_operations SET status='PAID',updated_at=? WHERE project_id=? AND stripe_invoice_id=?")
        .bind(now,pid,stripeInvoice.id)
    ]);
    return new Response(JSON.stringify({received:true,duplicate:changes?.[0]?.meta?.changes===0}),{
      status:200,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}
    });
  }catch{return fail('Invoice verification unavailable; Stripe will retry',503);}
}
