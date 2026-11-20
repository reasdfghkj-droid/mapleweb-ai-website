/**
 * MapleWeb AI LIVE Stripe Invoicing -- intentionally disabled by default.
 *
 * No deposits, subscriptions or pre-delivery charges. The owner explicitly
 * creates a draft AFTER completed website delivery and a separate review
 * is required before finalizing/sending it. Never use Stripe keys in browser.
 *
 * Stripe, not this application, controls settlement and bank payouts.
 */
import {invoiceAssessment} from './order-engine.mjs';
import {verifyStripeSignature} from './stripe-invoices.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STRIPE_ID=/^[A-Za-z0-9_-]{4,100}$/;
const json=(data,status=200)=>new Response(JSON.stringify(data),{
 status,headers:{'Content-Type':'application/json; charset=utf-8',
 'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}
});
const fail=(reason,blockers=[])=>({ok:false,error:reason,blockers,
 customer_charged:false,bank_payout_initiated:false});
const secretReady=env=>typeof env?.STRIPE_LIVE_SECRET_KEY==='string'&&
 env.STRIPE_LIVE_SECRET_KEY.startsWith('sk_live_')&&
 env.STRIPE_LIVE_SECRET_KEY.length>=25&&
 typeof env.STRIPE_LIVE_ACCOUNT_ID==='string'&&
 /^acct_[A-Za-z0-9]{8,100}$/.test(env.STRIPE_LIVE_ACCOUNT_ID);
const ownerGated=env=>secretReady(env)&&env.STRIPE_LIVE_ACCOUNT_VERIFIED==='true'&&
 env.STRIPE_LIVE_BANK_CONFIRMED==='true'&&env.STRIPE_LIVE_TAX_REVIEWED==='true';
const dataStore=db=>Boolean(db?.prepare&&db?.batch);

async function requestStripe(path,key,{body=null,idempotency=null,fetcher=fetch}={}){
 const headers={'Authorization':'Bearer '+key,'Accept':'application/json'};
 const request={method:body===null?'GET':'POST',headers,redirect:'error'};
 if(body!==null){
  if(typeof idempotency!=='string'||idempotency.length<10)
   throw Error('Stripe idempotency is required');
  headers['Content-Type']='application/x-www-form-urlencoded';
  headers['Idempotency-Key']=idempotency;
  request.body=new URLSearchParams(body).toString();
 }
 const response=await fetcher('https://api.stripe.com/v1/'+path,request);
 if(!response.ok)throw Error('Stripe request was not successful');
 const data=await response.json();
 if(!data||typeof data!=='object')throw Error('Invalid Stripe response');
 return data;
}

export async function checkLiveStripeAccount(env={},fetcher=fetch){
 if(!ownerGated(env))
  return fail('Live Stripe account, Canadian bank and reviewed tax configuration are not activated');
 try{
  const account=await requestStripe('account',env.STRIPE_LIVE_SECRET_KEY,{fetcher});
  const acceptable=account.id===env.STRIPE_LIVE_ACCOUNT_ID &&
    account.country==='CA' &&
    account.charges_enabled===true &&
    account.payouts_enabled===true &&
    account.details_submitted===true;
  return {ok:acceptable,mode:'live',
   account_verified:account.id===env.STRIPE_LIVE_ACCOUNT_ID,
   country_is_canada:account.country==='CA',
   charges_enabled:account.charges_enabled===true,
   payouts_enabled:account.payouts_enabled===true,
   business_details_submitted:account.details_submitted===true,
   bank_details_returned_to_chat:false,
   payout_transferred:false,
   reason:acceptable?'': 'Live account is not ready for Canadian payments and payouts'};
 }catch{return fail('Unable to verify live Stripe account and payout readiness');}
}
export async function getLivePayoutSummary(env={},fetcher=fetch){
 const checked=await checkLiveStripeAccount(env,fetcher);
 if(!checked.ok)return checked;
 try{
  const payouts=await requestStripe('payouts?limit=5',env.STRIPE_LIVE_SECRET_KEY,{fetcher});
  if(!Array.isArray(payouts.data))return fail('Payout summary unavailable');
  // Only owner-facing settlement statuses, NO bank account fields.
  return {ok:true,account_ready:true,payouts_enabled:true,
   payout_initiated_by_mapleweb:false,bank_account_details_exposed:false,
   payouts:payouts.data.map(p=>({
    reference:typeof p.id==='string'?p.id:'',
    status:typeof p.status==='string'?p.status:'unknown',
    currency:p.currency,amount_cents:p.amount,
    arrival_date_utc:typeof p.arrival_date==='number'?
      new Date(p.arrival_date*1000).toISOString():null
   }))};
 }catch{return fail('Stripe payout history could not be read');}
}

function eligibleForDraft(project){
 const check=invoiceAssessment(project);
 if(!check.eligibleForOwnerDraftInvoice)
  return fail('Full payment-after-delivery evidence is required',check.blockers);
 if(!UUID.test(project?.id||'')||
    !Number.isSafeInteger(project?.invoice_due_days)||
    project.invoice_due_days<1||project.invoice_due_days>60||
    !Number.isSafeInteger(project?.approved_final_total_cad_cents)||
    project.approved_final_total_cad_cents<50000||
    project.approved_final_total_cad_cents>10000000)
  return fail('Exact approved CAD amount and due terms are required');
 return {ok:true};
}
function invoiceMatches(row,invoice,requiredStatus){
 return invoice?.id===row.stripe_invoice_id&&
  invoice?.status===requiredStatus&&invoice?.livemode===true&&
  invoice?.currency==='cad'&&invoice?.collection_method==='send_invoice'&&
  invoice?.customer===row.stripe_customer_id&&
  invoice?.metadata?.mapleweb_project_id===row.id&&
  Number(invoice?.metadata?.mapleweb_project_version)===row.current_version&&
  invoice?.amount_due===row.approved_final_total_cad_cents&&
  invoice?.total===row.approved_final_total_cad_cents;
}
export async function createLiveInvoiceDraft(db,row,env={},fetcher=fetch){
 if(env.STRIPE_LIVE_DRAFTS_APPROVED!=='true'||!ownerGated(env))
  return fail('Live Stripe draft invoicing is disabled or banking/tax review is missing');
 if(!dataStore(db))return fail('Secure private D1 ledger unavailable');
 const ready=eligibleForDraft(row);
 if(!ready.ok)return ready;
 const account=await checkLiveStripeAccount(env,fetcher);
 if(!account.ok)return fail('Stripe live account failed verification');
 const now=new Date().toISOString();
 const pid=row.id, idem='mapleweb-live-draft-'+pid;
 let reservation;
 try{
  reservation=await db.prepare(
   'INSERT OR IGNORE INTO invoice_operations(project_id,created_at,updated_at,status,idempotency_key) VALUES (?,?,?,?,?)'
  ).bind(pid,now,now,'RESERVED',idem).run();
 }catch{return fail('Unable to reserve a unique live invoice draft');}
 if(reservation?.meta?.changes!==1)
  return fail('Invoice already reserved or exists. Owner must reconcile Stripe before retrying');
 try{
  const customer=await requestStripe('customers',env.STRIPE_LIVE_SECRET_KEY,{
   body:{email:row.email,name:row.name||'MapleWeb customer',
    'metadata[mapleweb_project_id]':pid},
   idempotency:idem+'-customer',fetcher
  });
  if(!STRIPE_ID.test(customer.id)||!customer.id.startsWith('cus_')||
     customer.livemode===false)throw Error('Live customer creation failed');
  const invoice=await requestStripe('invoices',env.STRIPE_LIVE_SECRET_KEY,{
   body:{customer:customer.id,collection_method:'send_invoice',
    days_until_due:String(row.invoice_due_days),auto_advance:'false',currency:'cad',
    'metadata[mapleweb_project_id]':pid,
    'metadata[mapleweb_project_version]':String(row.current_version),
    description:'Completed MapleWeb AI website development; payment due only after delivery'},
   idempotency:idem+'-invoice',fetcher
  });
  if(!STRIPE_ID.test(invoice.id)||!invoice.id.startsWith('in_')||
     invoice.status!=='draft'||invoice.livemode!==true)
    throw Error('Stripe did not create a LIVE draft');
  const item=await requestStripe('invoiceitems',env.STRIPE_LIVE_SECRET_KEY,{
   body:{customer:customer.id,invoice:invoice.id,currency:'cad',
    amount:String(row.approved_final_total_cad_cents),
    description:'Website development — previously agreed final CAD total (tax presentation requires owner review)'},
   idempotency:idem+'-item',fetcher
  });
  if(!STRIPE_ID.test(item.id)||!item.id.startsWith('ii_'))throw Error('Invoice item missing');
  const saved=await db.batch([
   db.prepare(
    "UPDATE invoice_operations SET status='DRAFT_CREATED',stripe_customer_id=?,stripe_invoice_id=?,updated_at=? "+
    "WHERE project_id=? AND status='RESERVED'"
   ).bind(customer.id,invoice.id,now,pid),
   db.prepare(
    "UPDATE projects SET stripe_customer_id=?,stripe_invoice_id=?,invoice_status='draft',updated_at=?,row_version=row_version+1 "+
    "WHERE id=? AND status='DELIVERED' AND stripe_invoice_id IS NULL AND owner_approved_invoice=1 "+
    'AND current_version=? AND approved_final_total_cad_cents=?'
   ).bind(customer.id,invoice.id,now,pid,row.current_version,row.approved_final_total_cad_cents)
  ]);
  if(saved?.length!==2||saved.some(x=>x?.meta?.changes!==1))
   throw Error('Database could not reconcile draft state');
  return {ok:true,mode:'live',draft_created:true,invoice_id:invoice.id,
   owner_must_review_tax_and_amount:true,invoice_sent:false,
   customer_charged:false,bank_payout_initiated:false};
 }catch{
  try{
   await db.prepare(
    "UPDATE invoice_operations SET status='MANUAL_REVIEW',updated_at=? WHERE project_id=?"
   ).bind(new Date().toISOString(),pid).run();
  }catch{/* fail closed; owner must investigate */}
  return fail('Live invoice draft is incomplete. Check Stripe Dashboard; NEVER automatically retry');
 }
}
export async function sendApprovedLiveInvoice(db,row,env={},fetcher=fetch){
 if(env.STRIPE_LIVE_SEND_APPROVED!=='true'||!ownerGated(env))
  return fail('Owner has not activated LIVE invoice sending and reviewed the bank/tax configuration');
 if(!dataStore(db))return fail('Private Stripe ledger unavailable');
 if(!UUID.test(row?.id||'')||row.status!=='DELIVERED'||
    row.owner_approved_invoice!==1||
    row.invoice_status!=='draft'||!/^in_[A-Za-z0-9_]+$/.test(row.stripe_invoice_id||'')||
    !/^cus_[A-Za-z0-9_]+$/.test(row.stripe_customer_id||''))
  return fail('Only an approved delivered website with an existing live draft may be invoiced');
 // Existing draft invoice is ignored for the *policy check only*; it must be
 // verified against the saved live invoice ID before sending.
 const assessment=invoiceAssessment({...row,stripe_invoice_id:null,invoice_status:null});
 if(!assessment.eligibleForOwnerDraftInvoice)
  return fail('Post-delivery invoice evidence is incomplete',assessment.blockers);
 const account=await checkLiveStripeAccount(env,fetcher);
 if(!account.ok)return fail('Live account/bank payout readiness not confirmed');
 const pid=row.id,now=new Date().toISOString(),idem='mapleweb-live-send-'+pid;
 try{
  const ledger=await db.prepare(
   'SELECT status,stripe_customer_id,stripe_invoice_id FROM invoice_operations WHERE project_id=?'
  ).bind(pid).first();
  if(ledger?.status!=='DRAFT_CREATED'||ledger.stripe_customer_id!==row.stripe_customer_id||
     ledger.stripe_invoice_id!==row.stripe_invoice_id)
   return fail('Live invoice draft is not reconciled in the private ledger');
  const invoice=await requestStripe(
   'invoices/'+encodeURIComponent(row.stripe_invoice_id),env.STRIPE_LIVE_SECRET_KEY,{fetcher}
  );
  if(!invoiceMatches(row,invoice,'draft'))return fail('Live draft amount, tax, version, customer or mode does not match signed agreement');
  const finalized=await requestStripe(
   'invoices/'+encodeURIComponent(invoice.id)+'/finalize',env.STRIPE_LIVE_SECRET_KEY,
   {body:{auto_advance:'false'},idempotency:idem+'-finalize',fetcher}
  );
  if(!invoiceMatches(row,finalized,'open')||
     !/^https:\/\/invoice\.stripe\.com\//.test(finalized.hosted_invoice_url||''))
   throw Error('Stripe finalized amount or payment URL was not verified');
  const sent=await requestStripe(
   'invoices/'+encodeURIComponent(invoice.id)+'/send',env.STRIPE_LIVE_SECRET_KEY,
   {body:{},idempotency:idem+'-email',fetcher}
  );
  if(!invoiceMatches(row,sent,'open'))throw Error('Stripe invoice send not confirmed');
  const saved=await db.batch([
   db.prepare(
    "UPDATE invoice_operations SET status='SENT',updated_at=? "+
    "WHERE project_id=? AND stripe_invoice_id=? AND status='DRAFT_CREATED'"
   ).bind(now,pid,invoice.id),
   db.prepare(
    "UPDATE projects SET invoice_status='open',updated_at=?,row_version=row_version+1 "+
    "WHERE id=? AND status='DELIVERED' AND stripe_invoice_id=? AND invoice_status='draft'"
   ).bind(now,pid,invoice.id)
  ]);
  if(saved?.length!==2||saved.some(x=>x?.meta?.changes!==1))
   throw Error('Stripe sent invoice but local reconciliation failed');
  return {ok:true,mode:'live',invoice_id:invoice.id,
   invoice_sent:true,hosted_invoice_url:sent.hosted_invoice_url||finalized.hosted_invoice_url,
   customer_charged:false,bank_payout_initiated:false,
   invoice_paid:false,customer_can_pay_via_stripe:true};
 }catch{
  try{
   await db.prepare(
    "UPDATE invoice_operations SET status='MANUAL_REVIEW',updated_at=? WHERE project_id=?"
   ).bind(new Date().toISOString(),pid).run();
  }catch{/* no retry */}
  return fail('Invoice may have been finalized or emailed. Reconcile manually in Stripe; NEVER retry automatically');
 }
}
export async function processLiveStripeWebhook(request,env={},fetcher=fetch){
 const failResponse=(text,status=400)=>json({error:text},status);
 if(env.STRIPE_LIVE_WEBHOOKS_APPROVED!=='true'||!ownerGated(env)||
    typeof env.STRIPE_LIVE_WEBHOOK_SECRET!=='string'||
    !env.STRIPE_LIVE_WEBHOOK_SECRET.startsWith('whsec_')||
    !dataStore(env.DB))
  return failResponse('Live Stripe webhooks not activated',503);
 if(request.method!=='POST')return failResponse('Method not allowed',405);
 const length=Number(request.headers.get('content-length')||0);
 if(length>65536)return failResponse('Payload too large',413);
 let raw;
 try{raw=await request.text();if(raw.length>65536)return failResponse('Payload too large',413)}
 catch{return failResponse('Could not read webhook payload');}
 const verified=await verifyStripeSignature(raw,request.headers.get('stripe-signature')||'',
    env.STRIPE_LIVE_WEBHOOK_SECRET);
 if(!verified)return failResponse('Invalid Stripe webhook signature',400);
 let event;
 try{event=JSON.parse(raw)}catch{return failResponse('Invalid Stripe webhook JSON',400);}
 if(event.livemode!==true||!/^evt_[A-Za-z0-9_]+$/.test(event.id||''))
  return failResponse('Unexpected Stripe environment or event ID',400);
 if(event.type!=='invoice.paid')return json({received:true,ignored:true});
 const invoiceId=event.data?.object?.id;
 if(!/^in_[A-Za-z0-9_]+$/.test(invoiceId||''))
  return failResponse('Invalid invoice reference',400);
 try{
  // Fetch the authoritative paid invoice from Stripe; never trust only webhook data.
  const invoice=await requestStripe('invoices/'+encodeURIComponent(invoiceId),
    env.STRIPE_LIVE_SECRET_KEY,{fetcher});
  if(invoice.livemode!==true||invoice.status!=='paid'||invoice.paid!==true||
     invoice.currency!=='cad')return failResponse('Invoice payment not verified at Stripe',409);
  const pid=invoice.metadata?.mapleweb_project_id,version=Number(invoice.metadata?.mapleweb_project_version);
  if(!UUID.test(pid||'')||!Number.isSafeInteger(version)||version<1)
   return failResponse('Missing project and version identity',409);
  const row=await env.DB.prepare(
   'SELECT id,invoice_status,stripe_invoice_id,stripe_customer_id,status,current_version,approved_final_total_cad_cents '+
   'FROM projects WHERE id=?'
  ).bind(pid).first();
  if(!row||row.status!=='DELIVERED'||row.current_version!==version||
     row.stripe_invoice_id!==invoice.id||row.stripe_customer_id!==invoice.customer||
     row.approved_final_total_cad_cents!==invoice.amount_paid||
     !['open','paid'].includes(row.invoice_status))
   return failResponse('Live paid invoice does not match the delivered website',409);
  const now=new Date().toISOString();
  const results=await env.DB.batch([
   env.DB.prepare(
    'INSERT OR IGNORE INTO stripe_webhook_events(stripe_event_id,received_at,type) VALUES (?,?,?)'
   ).bind(event.id,now,event.type),
   env.DB.prepare(
    "UPDATE projects SET invoice_status='paid',paid_at=?,updated_at=?,row_version=row_version+1 "+
    "WHERE id=? AND stripe_invoice_id=? AND invoice_status='open'"
   ).bind(now,now,pid,invoice.id),
   env.DB.prepare(
    "UPDATE invoice_operations SET status='PAID',updated_at=? "+
    "WHERE project_id=? AND stripe_invoice_id=? AND status='SENT'"
   ).bind(now,pid,invoice.id)
  ]);
  if(results?.length!==3||results.some((r,i)=>i===0?r?.meta?.changes===undefined:r?.meta?.changes===undefined))
   throw Error('D1 webhook reconciliation incomplete');
  return json({received:true,duplicate:results[0]?.meta?.changes===0,
    payment_confirmed_at_stripe:true,bank_payout_confirmed:false});
 }catch{return failResponse('Stripe payment verification unavailable; Stripe may retry',503);}
}
