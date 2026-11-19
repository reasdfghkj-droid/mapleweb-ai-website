/**
 * Secure, short-lived customer preview share links.
 * Links are minted only by the authenticated PRIVATE Manager Worker.
 * Raw tokens are returned ONCE; D1 stores only a SHA-256 hash.
 * Public preview access is read-only and never publishes a customer site.
 */
const TOKEN=/^[A-Za-z0-9_-]{43}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const responseHeaders={
  'Cache-Control':'no-store, private, max-age=0',
  'Content-Type':'text/html; charset=utf-8',
  'Referrer-Policy':'no-referrer',
  'X-Robots-Tag':'noindex, nofollow, noarchive',
  'X-Content-Type-Options':'nosniff',
  'Cross-Origin-Resource-Policy':'same-origin',
  'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; object-src 'none'; frame-ancestors 'none'; script-src 'none'; connect-src 'none'; img-src 'none'"
};
const deny=(status=404)=>new Response('Private preview unavailable',{status,headers:{
  ...responseHeaders,'Content-Type':'text/plain; charset=utf-8'
}});
const encode64url=bytes=>{
  let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/g,'');
};
export async function hashPreviewToken(token) {
  if(typeof token!=='string'||!TOKEN.test(token))throw new Error('Invalid preview token');
  const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  return Array.from(new Uint8Array(d),b=>b.toString(16).padStart(2,'0')).join('');
}
export async function createPrivatePreviewShare(db,project,env={},hours=48){
  if(!db?.prepare||!uuid.test(project?.id||''))return {ok:false,error:'Project record unavailable'};
  if(project.status!=='PREVIEW_READY'||project.preview_verified!==1||
     project.security_check_passed!==1||!Number.isSafeInteger(project.current_version)||
     project.current_version<1||project.outstanding_revisions!==0)
    return {ok:false,error:'Project is not ready for private customer review'};
  if(!Number.isSafeInteger(hours)||hours<1||hours>72)
    return {ok:false,error:'Expiry must be between 1 and 72 hours'};
  if(typeof env.PUBLIC_SITE_ORIGIN!=='string')return {ok:false,error:'Public preview origin not configured'};
  let origin;
  try{
    const u=new URL(env.PUBLIC_SITE_ORIGIN);
    if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||u.origin!==env.PUBLIC_SITE_ORIGIN)
      throw Error('Invalid origin');
    origin=u.origin;
  }catch{return {ok:false,error:'Invalid public preview origin'};}
  const raw=new Uint8Array(32);crypto.getRandomValues(raw);
  const token=encode64url(raw),hash=await hashPreviewToken(token);
  const now=Date.now();
  const id=crypto.randomUUID();
  const createdAt=new Date(now).toISOString();
  const expiresAt=new Date(now+hours*60*60*1000).toISOString();
  const sql='INSERT INTO preview_shares(id,project_id,version,token_hash,created_at,expires_at,max_views) '+
    'SELECT ?,?,?,?,?,?,30 WHERE EXISTS(SELECT 1 FROM projects WHERE id=? AND status=? AND current_version=? AND preview_verified=1 AND security_check_passed=1 AND outstanding_revisions=0)';
  try{
    const out=await db.prepare(sql).bind(id,project.id,project.current_version,hash,createdAt,expiresAt,
      project.id,'PREVIEW_READY',project.current_version).run();
    if(out?.meta?.changes!==1)return {ok:false,error:'Project changed before link was created'};
    // Never log raw token, email it automatically, or store the URL in D1.
    return {ok:true,url:origin+'/preview/'+token,expires_at:expiresAt,max_views:30,
      raw_link_returned_once:true,project_reference:project.id,published:false};
  }catch{return {ok:false,error:'Could not create private preview link'};}
}
export async function revokePrivatePreviewShares(db,projectId) {
  if(!db?.prepare||!uuid.test(projectId||''))return {ok:false,error:'Project unavailable'};
  try{
    const changed=await db.prepare('UPDATE preview_shares SET revoked_at=? WHERE project_id=? AND revoked_at IS NULL')
      .bind(new Date().toISOString(),projectId).run();
    return {ok:true,revoked_count:changed?.meta?.changes||0};
  }catch{return {ok:false,error:'Could not revoke preview links'};}
}
export async function servePrivatePreview(req,env={}) {
  if(req.method!=='GET')return deny(405);
  if(env.PRIVATE_PREVIEWS_APPROVED!=='true'||!env.DB?.prepare)return deny();
  const url=new URL(req.url);
  const prefix='/preview/';
  if(!url.pathname.startsWith(prefix)||url.search||url.hash)return deny();
  const token=url.pathname.slice(prefix.length);
  if(!TOKEN.test(token))return deny();
  const hash=await hashPreviewToken(token);
  try{
    const now=new Date().toISOString();
    // An atomic update checks expiry, view limit and current version to prevent
    // stale previews after revisions, even when links have not been revoked yet.
    const stmt=env.DB.prepare(
      'UPDATE preview_shares SET views=views+1 WHERE token_hash=? AND revoked_at IS NULL '+
      'AND expires_at>? AND views<max_views AND EXISTS '+
      '(SELECT 1 FROM projects WHERE projects.id=preview_shares.project_id '+
      "AND projects.status='PREVIEW_READY' AND projects.current_version=preview_shares.version "+
      'AND projects.preview_verified=1 AND projects.security_check_passed=1 AND projects.outstanding_revisions=0)'
    ).bind(hash,now);
    const updated=await stmt.run();
    if(updated?.meta?.changes!==1)return deny();
    const row=await env.DB.prepare(
      'SELECT p.draft_html FROM preview_shares s JOIN projects p ON p.id=s.project_id '+
      "WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at>? "+
      "AND p.status='PREVIEW_READY' AND p.current_version=s.version AND p.preview_verified=1 AND p.security_check_passed=1"
    ).bind(hash,now).first();
    if(!row||typeof row.draft_html!=='string'||row.draft_html.length>150000)return deny();
    return new Response(row.draft_html,{status:200,headers:responseHeaders});
  }catch{return deny();}
}
