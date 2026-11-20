/**
 * MapleWeb AI transactional customer review email adapter.
 *
 * Owner-authenticated use only. A private, single-use review link must have
 * been issued separately. A DB ledger prevents duplicate send attempts.
 * Provider: Resend API. A provider acceptance is NOT proof of inbox delivery.
 * No marketing, attachments, automatic invoices or website publication.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const EMAIL=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const purposes=new Set(['QUOTE','FINAL_REVIEW','DELIVERY_RECEIPT']);
const fail=(error)=>({ok:false,error,email_sent:false,invoice_created:false,
 customer_charged:false,website_published:false});
const sha=async text=>{
 const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
 return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,'0')).join('');
};
function validOrigin(s){
 try{
  const u=new URL(s);
  return u.protocol==='https:'&&u.origin===s&&u.pathname==='/'&&
    !u.username&&!u.password&&!u.hash&&!u.search;
 }catch{return false;}
}
export function customerEmailReady(env={}) {
 if(env.CUSTOMER_EMAILS_APPROVED!=='true'||env.CUSTOMER_EMAIL_DOMAIN_VERIFIED!=='true'||
    typeof env.RESEND_API_KEY!=='string'||!/^re_[A-Za-z0-9_]{12,}$/.test(env.RESEND_API_KEY)||
    typeof env.CUSTOMER_EMAIL_FROM!=='string'||!EMAIL.test(env.CUSTOMER_EMAIL_FROM)||
    !validOrigin(env.PUBLIC_SITE_ORIGIN))
  return false;
 const senderDomain=env.CUSTOMER_EMAIL_FROM.split('@')[1].toLowerCase();
 return typeof env.CUSTOMER_EMAIL_VERIFIED_DOMAIN==='string'&&
  senderDomain===env.CUSTOMER_EMAIL_VERIFIED_DOMAIN.toLowerCase();
}
function reviewMail(purpose,url){
 const titles={
  QUOTE:'Review your MapleWeb AI website quotation',
  FINAL_REVIEW:'Review your completed MapleWeb AI website',
  DELIVERY_RECEIPT:'Confirm receipt of your MapleWeb AI website'
 };
 const introduction={
  QUOTE:'Please read the separate written website quote and the agreed terms before accepting or requesting changes.',
  FINAL_REVIEW:'Please review the complete finished website, not only a starter draft, before approving or requesting changes.',
  DELIVERY_RECEIPT:'Confirm receipt only after you have actually received the completed approved website and files or hosted access.'
 };
 return {subject:titles[purpose],text:
  'MapleWeb AI — Private Customer Review\n\n'+introduction[purpose]+
  '\n\nOpen your private review link:\n'+url+
  '\n\nThis link is single-use and expires. Do not forward it. '+
  'If you did not request this website project, contact MapleWeb AI using its official website.\n\n'+
  'No deposit or payment is requested. You pay only after the completed website is delivered and approved.\n\n'+
  'This is a transactional project message, not marketing.'};
}
/**
 * An owner sends an already-issued token to the project's saved billing email.
 * The owner must confirm by passing the current project row version.
 *
 * Never silently retry a failed/ambiguous email. Provider might have accepted
 * it even when network returned an error; reserve and mark MANUAL_REVIEW.
 */
export async function sendCustomerReviewEmail(db,row,env={},payload={},fetcher=fetch){
 if(!customerEmailReady(env))return fail('Customer email provider is not approved or verified');
 if(!db?.prepare||!db?.batch)return fail('Private email send ledger unavailable');
 if(!row||!UUID.test(row.id||'')||!Number.isSafeInteger(row.current_version)||
    !Number.isSafeInteger(row.row_version)||!EMAIL.test(row.email||''))
  return fail('Private customer record or recipient is invalid');
 if(payload?.confirm!=='SEND_OWNER_APPROVED_REVIEW_EMAIL'||
    payload?.expectedRowVersion!==row.row_version)
  return fail('Explicit owner approval and current project version required');
 if(typeof payload?.reviewUrl!=='string'||payload.reviewUrl.length>550)
  return fail('The private single-use customer review URL is required');
 const prefix=env.PUBLIC_SITE_ORIGIN+'/review/';
 if(!payload.reviewUrl.startsWith(prefix))return fail('Review URL must use the approved public site');
 const raw=payload.reviewUrl.slice(prefix.length);
 if(!TOKEN.test(raw))return fail('Review URL contains an invalid or modified token');
 const hash=await sha(raw),at=new Date().toISOString();
 let token;
 try{
  token=await db.prepare(
   'SELECT id,purpose,version FROM customer_review_tokens '+
   'WHERE project_id=? AND version=? AND token_hash=? AND consumed_at IS NULL '+
   'AND revoked_at IS NULL AND expires_at>?'
  ).bind(row.id,row.current_version,hash,at).first();
 }catch{return fail('Private customer review token lookup unavailable');}
 if(!token||!UUID.test(token.id)||!purposes.has(token.purpose)||
    token.version!==row.current_version)
  return fail('Review link is used, expired, revoked or does not belong to this customer project');
 if(token.purpose==='QUOTE'&&row.status!=='QUOTED')
  return fail('Customer quotation has not been approved');
 if(token.purpose==='FINAL_REVIEW'&&row.status!=='PREVIEW_READY')
  return fail('Final website is not ready for customer review');
 if(token.purpose==='DELIVERY_RECEIPT'&&
    (row.status!=='PREVIEW_READY'||row.customer_approved_version!==row.current_version))
  return fail('Customer has not yet approved the exact completed website version');
 const emailHash=await sha(row.email.trim().toLowerCase());
 const idem='mapleweb-review-email-'+token.id,now=new Date().toISOString();
 try{
  const reservation=await db.prepare(
   'INSERT OR IGNORE INTO customer_review_email_operations '+
   '(token_id,project_id,created_at,updated_at,status,recipient_email_hash,idempotency_key) '+
   "VALUES (?,?,?,?,'RESERVED',?,?)"
  ).bind(token.id,row.id,now,now,emailHash,idem).run();
  if(reservation?.meta?.changes!==1)
   return fail('This review link already has an email attempt; do not resend automatically');
 }catch{return fail('Cannot reserve a unique customer email operation');}
 const mail=reviewMail(token.purpose,payload.reviewUrl);
 try{
  const response=await fetcher('https://api.resend.com/emails',{
   method:'POST',redirect:'error',
   headers:{Authorization:'Bearer '+env.RESEND_API_KEY,
    'Content-Type':'application/json','Idempotency-Key':idem},
   body:JSON.stringify({from:env.CUSTOMER_EMAIL_FROM,to:[row.email.trim()],
    subject:mail.subject,text:mail.text})
  });
  if(!response.ok)throw Error('Email provider refused request');
  const provider=await response.json();
  if(!provider||typeof provider.id!=='string'||provider.id.length<8||
     provider.id.length>128||!/^[-_a-z0-9]+$/i.test(provider.id))
   throw Error('Email provider did not return a valid message reference');
  const change=await db.prepare(
   "UPDATE customer_review_email_operations SET status='SENT',provider_message_id=?,updated_at=? "+
   "WHERE token_id=? AND status='RESERVED'"
  ).bind(provider.id,new Date().toISOString(),token.id).run();
  if(change?.meta?.changes!==1)throw Error('Email status not committed');
  return {ok:true,provider:'resend',email_submitted_to_provider:true,
   email_delivery_confirmed:false,review_purpose:token.purpose,
   project_reference:row.id,provider_message_id:provider.id,
   invoice_created:false,customer_charged:false,website_published:false};
 }catch{
  try{
   await db.prepare(
    "UPDATE customer_review_email_operations SET status='MANUAL_REVIEW',updated_at=? "+
    "WHERE token_id=? AND status='RESERVED'"
   ).bind(new Date().toISOString(),token.id).run();
  }catch{/* no automatic retries */}
  return fail('Review email may or may not have been accepted. Check provider before manually sharing the link; no automatic retry');
 }
}
