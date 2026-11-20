/**
 * MapleWeb AI protected FINAL customer website ZIP and Cloudflare R2 storage.
 * This is a private transfer mechanism, NOT a website builder, public host,
 * automated quality tester, completed order or bank payment.
 *
 * The owner uploads ACTUAL completed files, then performs independent final QA.
 * R2 bucket MUST be private. No public R2 URLs or credentials are returned.
 */
import {hashCustomerToken} from './customer-review.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FILE=/^[A-Za-z0-9][A-Za-z0-9._/-]{0,150}$/;
const TEXT=/\.(html|css|js|json|txt|svg)$/i;
const BINARY=/\.(png|jpg|jpeg|webp|ico)$/i;
const maxCount=60,maxTotal=6000000;
const encoder=new TextEncoder();
const fail=error=>({ok:false,error,published:false,delivered:false,customer_charged:false});
function validPath(path) {
 if(typeof path!=='string'||!FILE.test(path)||!(/\.(html|css|js|json|txt|svg|png|jpg|jpeg|webp|ico)$/i.test(path))||
    path.startsWith('/')||path.includes('//')||path.includes('\\')||
    path.split('/').some(part=>part==='.'||part==='..'||part.startsWith('.'))||
    /(?:^|\/)(?:node_modules|secrets?|private|credentials?)(?:\/|$)/i.test(path))
  return false;
 return true;
}
const crcTable=(()=>{
 const a=new Uint32Array(256);
 for(let n=0;n<256;n++){
  let x=n;for(let i=0;i<8;i++)x=x&1?0xedb88320^(x>>>1):x>>>1;
  a[n]=x>>>0;
 }
 return a;
})();
const crc32=data=>{
 let crc=0xffffffff;
 for(const b of data)crc=crcTable[(crc^b)&255]^(crc>>>8);
 return (crc^0xffffffff)>>>0;
};
const u16=(dv,at,n)=>dv.setUint16(at,n,true);
const u32=(dv,at,n)=>dv.setUint32(at,n,true);
function merge(chunks){
 const size=chunks.reduce((sum,c)=>sum+c.byteLength,0);
 const result=new Uint8Array(size);
 let i=0;for(const c of chunks){result.set(c,i);i+=c.byteLength;}
 return result;
}
function encodeFile(record){
 if(typeof record?.path!=='string'||!validPath(record.path))return null;
 const isText=TEXT.test(record.path);
 if(isText){
  if(typeof record.content!=='string'||record.content.length<1)return null;
  return encoder.encode(record.content);
 }
 if(!BINARY.test(record.path)||typeof record.data_base64!=='string'||
    record.data_base64.length>2700000||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(record.data_base64))return null;
 try{
  const raw=atob(record.data_base64);
  const bytes=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
  return bytes;
 }catch{return null;}
}
/**
 * ZIP store (method 0), standard CRC32 and central directory.
 * No dependency downloads, no extraction, no executable code.
 */
export function packageFinalWebsite(files) {
 if(!Array.isArray(files)||files.length<1||files.length>maxCount)
  return fail('Final website must contain between 1 and 60 files');
 const entries=[],seen=new Set();
 let total=0;
 for(const record of files){
  if(!validPath(record?.path))return fail('Disallowed filename, path traversal or file type');
  const name=record.path.toLowerCase();
  if(seen.has(name))return fail('Duplicate final website filename');
  seen.add(name);
  const bytes=encodeFile(record);
  if(!bytes||bytes.length<1||bytes.length>2000000)
   return fail('Invalid or oversized website file content');
  total+=bytes.byteLength;
  if(total>maxTotal)return fail('Final website exceeds 6 MB uncompressed upload limit');
  entries.push({path:record.path,name:encoder.encode(record.path),bytes,
    crc:crc32(bytes)});
 }
 if(!seen.has('index.html'))return fail('A finished website must include index.html');
 const homepage=entries.find(e=>e.path.toLowerCase()==='index.html');
 const text=new TextDecoder().decode(homepage.bytes);
 if(!/<html[\s>]/i.test(text)||!/<body[\s>]/i.test(text))
  return fail('The submitted index.html must be an HTML website page');
 const chunks=[],central=[];
 let offset=0;
 for(const e of entries){
  const header=new Uint8Array(30),d=new DataView(header.buffer);
  u32(d,0,0x04034b50);u16(d,4,20);u16(d,6,0x0800);
  u16(d,8,0);u16(d,10,0);u16(d,12,0);
  u32(d,14,e.crc);u32(d,18,e.bytes.length);u32(d,22,e.bytes.length);
  u16(d,26,e.name.length);u16(d,28,0);
  chunks.push(header,e.name,e.bytes);
  const dir=new Uint8Array(46),cd=new DataView(dir.buffer);
  u32(cd,0,0x02014b50);u16(cd,4,20);u16(cd,6,20);u16(cd,8,0x0800);
  u16(cd,10,0);u16(cd,12,0);u16(cd,14,0);
  u32(cd,16,e.crc);u32(cd,20,e.bytes.length);u32(cd,24,e.bytes.length);
  u16(cd,28,e.name.length);u16(cd,30,0);u16(cd,32,0);u16(cd,34,0);
  u16(cd,36,0);u32(cd,38,0);u32(cd,42,offset);
  central.push(dir,e.name);
  offset+=header.length+e.name.length+e.bytes.length;
 }
 const centralSize=central.reduce((n,c)=>n+c.length,0);
 const end=new Uint8Array(22),e=new DataView(end.buffer);
 u32(e,0,0x06054b50);u16(e,4,0);u16(e,6,0);
 u16(e,8,entries.length);u16(e,10,entries.length);
 u32(e,12,centralSize);u32(e,16,offset);u16(e,20,0);
 const zip=merge([...chunks,...central,end]);
 if(zip.length>7500000)return fail('ZIP package exceeds secure transfer limit');
 return {ok:true,bytes:zip,byte_size:zip.length,file_count:entries.length,
  filenames:entries.map(x=>x.path),compressed:false,published:false};
}
const hex=buf=>[...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
const privateReady=(env,db)=>env?.FINAL_SITE_FILES_APPROVED==='true'&&
 typeof env?.FINAL_SITE_BUCKET?.put==='function'&&
 typeof env?.FINAL_SITE_BUCKET?.get==='function'&&
 typeof db?.prepare==='function'&&typeof db?.batch==='function';

export async function uploadFinalWebsiteFiles(db,project,env={},payload={}){
 if(!privateReady(env,db))return fail('Private final website R2 storage is not configured or approved');
 if(!project||!UUID.test(project.id||'')||!['BUILDING','PREVIEW_READY'].includes(project.status)||
    !project.quote_accepted_at||project.quote_approved_version!==project.current_version||
    project.delivered_at||project.invoice_status||project.stripe_invoice_id)
  return fail('Only an accepted, undelivered website can receive final files');
 if(payload?.confirm!=='UPLOAD_VERIFIED_FINISHED_WEBSITE'||payload?.currentVersion!==project.current_version||
    payload?.expectedRowVersion!==project.row_version)
  return fail('Owner must confirm the exact current website version');
 const zip=packageFinalWebsite(payload.files);
 if(!zip.ok)return zip;
 const sha=hex(await crypto.subtle.digest('SHA-256',zip.bytes));
 const key='mapleweb-private-final/'+project.id+'/v'+project.current_version+'/'+
   crypto.randomUUID()+'.zip';
 const now=new Date().toISOString();
 try{
  const existing=await db.prepare(
    'SELECT storage_key FROM final_website_artifacts WHERE project_id=? AND version=?'
  ).bind(project.id,project.current_version).first();
  if(existing)return fail('Final files already recorded for this version; create a new version for changes');
  await env.FINAL_SITE_BUCKET.put(key,zip.bytes,{
   httpMetadata:{contentType:'application/zip'},
   customMetadata:{project_id:project.id,version:String(project.current_version),
    sha256_hex:sha}
  });
  const results=await db.batch([
   db.prepare(
    'INSERT INTO final_website_artifacts '+
    '(project_id,version,storage_key,sha256_hex,byte_size,file_count,created_at) '+
    'SELECT ?,?,?,?,?,?,? WHERE EXISTS('+
    'SELECT 1 FROM projects WHERE id=? AND row_version=? AND current_version=? '+
    "AND status IN ('BUILDING','PREVIEW_READY') AND delivered_at IS NULL "+
    'AND quote_approved_version=? AND quote_accepted_at IS NOT NULL)'
   ).bind(project.id,project.current_version,key,sha,zip.byte_size,zip.file_count,now,
    project.id,project.row_version,project.current_version,project.current_version),
   db.prepare(
    'INSERT INTO project_events(id,project_id,created_at,action,actor,details_json) '+
    'SELECT ?,?,?,?,?,? WHERE EXISTS('+
    'SELECT 1 FROM final_website_artifacts WHERE project_id=? AND version=? AND sha256_hex=?)'
   ).bind(crypto.randomUUID(),project.id,now,'OWNER_FINAL_ZIP_UPLOADED','owner',
    JSON.stringify({version:project.current_version,byte_size:zip.byte_size,file_count:zip.file_count,
     owner_review_required:true,website_published:false,customer_delivered:false}),
    project.id,project.current_version,sha)
  ]);
  if(results?.length!==2||results.some(r=>r?.meta?.changes!==1))
   throw Error('Final website record did not commit');
  return {ok:true,project_reference:project.id,version:project.current_version,
   private_artifact_reference:'final-artifact/'+project.id+'/v'+project.current_version,
   sha256_hex:sha,file_count:zip.file_count,byte_size:zip.byte_size,
   owner_quality_review_required:true,customer_notified:false,published:false,delivered:false};
 }catch{
  try{await env.FINAL_SITE_BUCKET.delete(key)}catch{/* owner must investigate orphan R2 object */}
  return fail('Final file upload incomplete. Check private R2 and D1; do not claim delivery');
 }
}

export async function getFinalWebsiteArtifact(db,bucket,project){
 if(!db?.prepare||!UUID.test(project?.id||'')||
    !Number.isSafeInteger(project?.current_version))
  return fail('Private project unavailable');
 try{
  const r=await db.prepare(
   'SELECT version,storage_key,sha256_hex,byte_size,file_count,created_at '+
   'FROM final_website_artifacts WHERE project_id=? AND version=?'
  ).bind(project.id,project.current_version).first();
  if(!r)return {ok:true,present:false,version:project.current_version};
  if(typeof bucket?.head!=='function')
   return fail('Private final website bucket is not bound for verification');
  const object=await bucket.head(r.storage_key);
  if(!object||object.size!==r.byte_size)
   return fail('Final R2 package is missing or its size changed');
  return {ok:true,present:true,version:r.version,
   artifact_reference:'final-artifact/'+project.id+'/v'+r.version,
   sha256_hex:r.sha256_hex,byte_size:r.byte_size,file_count:r.file_count,
   uploaded_at:r.created_at,verified_r2_presence:true,
   published:false,customer_delivered:false};
 }catch{return fail('Final website metadata or storage unavailable');}
}

/**
 * The recipient may download a manually finished website ZIP while reviewing
 * its final version or confirming handover. No download triggers payment.
 */
export async function downloadCustomerWebsite(request,env={}){
 const denied=(status=404)=>new Response('Private website download unavailable',{
  status,headers:{'Content-Type':'text/plain; charset=utf-8',
   'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer',
   'X-Robots-Tag':'noindex,nofollow','X-Content-Type-Options':'nosniff'}
 });
 if(request.method!=='GET')return denied(405);
 if(env.CUSTOMER_PORTAL_APPROVED!=='true'||env.FINAL_SITE_FILES_APPROVED!=='true'||
    !env.DB?.prepare||!env.FINAL_SITE_BUCKET?.get)return denied();
 const url=new URL(request.url);
 const match=/^\/api\/customer\/review\/([A-Za-z0-9_-]{43})\/download$/.exec(url.pathname);
 if(!match||url.search||url.hash)return denied();
 const hash=await hashCustomerToken(match[1]);
 if(!hash)return denied();
 try{
  const now=new Date().toISOString();
  const row=await env.DB.prepare(
   'SELECT t.id AS token_id,t.purpose,t.version,p.id AS project_id,p.status,p.current_version,'+
   'p.customer_approved_version,p.preview_verified,p.security_check_passed,p.outstanding_revisions,'+
   'a.storage_key,a.byte_size,a.sha256_hex FROM customer_review_tokens t '+
   'JOIN projects p ON p.id=t.project_id '+
   'JOIN final_website_artifacts a ON a.project_id=p.id AND a.version=t.version '+
   'JOIN delivery_quality_reviews q ON q.project_id=p.id AND q.version=t.version AND q.approved=1 '+
   'WHERE t.token_hash=? AND t.revoked_at IS NULL AND t.consumed_at IS NULL '+
   'AND t.expires_at>? AND t.version=p.current_version '+
   "AND t.purpose IN ('FINAL_REVIEW','DELIVERY_RECEIPT') "+
   "AND p.status='PREVIEW_READY' AND p.preview_verified=1 "+
   'AND p.security_check_passed=1 AND p.outstanding_revisions=0'
  ).bind(hash,now).first();
  if(!row||!['FINAL_REVIEW','DELIVERY_RECEIPT'].includes(row.purpose)||
    row.current_version!==row.version||
    (row.purpose==='DELIVERY_RECEIPT'&&row.customer_approved_version!==row.version))
    return denied();
  const object=await env.FINAL_SITE_BUCKET.get(row.storage_key);
  if(!object||object.size!==row.byte_size||!object.body)return denied();
  const count=await env.DB.prepare(
   'UPDATE customer_review_tokens SET view_count=view_count+1 '+
   'WHERE id=? AND consumed_at IS NULL AND revoked_at IS NULL '+
   'AND expires_at>? AND view_count<15'
  ).bind(row.token_id,now).run();
  if(count?.meta?.changes!==1)return denied();
  return new Response(object.body,{status:200,headers:{
   'Content-Type':'application/zip',
   'Content-Disposition':'attachment; filename="mapleweb-website-v'+row.version+'.zip"',
   'Content-Length':String(row.byte_size),
   'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer',
   'X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff',
   'X-Frame-Options':'DENY',
   'Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'; sandbox"
  }});
 }catch{return denied();}
}
