import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {packageFinalWebsite,uploadFinalWebsiteFiles,getFinalWebsiteArtifact,downloadCustomerWebsite} from '../workers/final-site-files.mjs';
import publicWorker from '../workers/developer.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const html='<!doctype html><html lang="en"><head><title>Example finished site</title><link rel="stylesheet" href="styles.css"></head><body><h1>Finished website</h1><p>Contact our team.</p></body></html>';
const files=[
 {path:'index.html',content:html},
 {path:'styles.css',content:'body{font-family:system-ui;color:#123}'},
 {path:'assets/script.js',content:'document.body.dataset.ready="true"'},
 {path:'assets/logo.png',data_base64:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg=='}
];
const pack=packageFinalWebsite(files);
assert.equal(pack.ok,true);
assert.equal(pack.file_count,4);
assert.equal(pack.compressed,false);
assert.equal(pack.published,false);
assert.deepEqual(pack.filenames,files.map(f=>f.path));
assert.deepEqual([...pack.bytes.slice(0,4)],[0x50,0x4b,0x03,0x04]);
fs.writeFileSync('/tmp/mapleweb-test-final.zip',pack.bytes);
for(const bad of [
 [{path:'../index.html',content:html}],
 [{path:'/index.html',content:html}],
 [{path:'index.html',content:'not HTML'}],
 [{path:'index.html',content:html},{path:'INDEX.html',content:html}],
 [{path:'.env',content:'secret'},{path:'index.html',content:html}],
 [{path:'assets/../index.html',content:html}],
 [{path:'index.html',content:html},{path:'secrets/api.txt',content:'key'}],
 [{path:'style.css',content:'body{}'}],
 Array.from({length:61},(_,i)=>({path:i===0?'index.html':('file'+i+'.txt'),content:i===0?html:'x'})),
 [{path:'index.html',content:html},{path:'bad.png',data_base64:'$not-base64'}]
]){
 assert.equal(packageFinalWebsite(bad).ok,false,'Unsafe or malformed site bundle accepted');
}
const projectId='11111111-1111-4111-8111-111111111111';
const project={
 id:projectId,status:'PREVIEW_READY',row_version:5,current_version:3,
 quote_approved_version:3,quote_accepted_at:new Date().toISOString(),
 delivered_at:null,invoice_status:null,stripe_invoice_id:null
};
let storageKey=null,stored=null,artifact=null,views=0,metadataOverride=null;
const r2={
 async put(key,bytes){storageKey=key;stored=new Uint8Array(bytes);return {key,size:bytes.length}},
 async head(key){return key===storageKey?{size:stored.length,customMetadata:metadataOverride?{sha256_hex:metadataOverride}:{}}:null},
 async get(key){return key===storageKey?{size:stored.length,body:new Blob([stored]).stream(),customMetadata:metadataOverride?{sha256_hex:metadataOverride}:{}}:null},
 async delete(key){if(key===storageKey){stored=null;storageKey=null;}}
};
const rawToken='A'.repeat(43);
const hashBytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(rawToken));
const hash=[...new Uint8Array(hashBytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
const prepared=[];
const db={
 prepare(sql){
  const stmt={sql,bind(...args){this.args=args;return this},
   async first(){
    if(sql.includes('SELECT storage_key FROM final_website_artifacts'))
      return artifact?{storage_key:artifact.storage_key}:null;
    if(sql.includes('SELECT version,storage_key,sha256_hex,byte_size,file_count,created_at'))
      return artifact;
    if(sql.includes('SELECT t.id AS token_id,t.purpose')){
      assert.equal(this.args[0],hash);
      return {
       token_id:'33333333-3333-4333-8333-333333333333',
       purpose:'DELIVERY_RECEIPT',version:3,project_id:projectId,
       current_version:3,status:'PREVIEW_READY',customer_approved_version:3,
       preview_verified:1,security_check_passed:1,outstanding_revisions:0,
       storage_key:artifact.storage_key,byte_size:artifact.byte_size,
       sha256_hex:artifact.sha256_hex
      };
    }
    throw Error('Unexpected D1 query '+sql);
   },
   async run(){
    if(sql.startsWith('UPDATE customer_review_tokens SET view_count'))views++;
    return {meta:{changes:1}};
   }
  };prepared.push(stmt);return stmt;
 },
 async batch(stmts){
   assert.equal(stmts.length,2);
   assert.ok(stmts[0].sql.includes('INSERT INTO final_website_artifacts'));
   assert.ok(stmts[0].sql.includes('row_version=?'));
   assert.ok(stmts[1].sql.includes('project_events'));
   const args=stmts[0].args;
   artifact={version:args[1],storage_key:args[2],sha256_hex:args[3],
    byte_size:args[4],file_count:args[5],created_at:args[6]};
   return stmts.map(()=>({meta:{changes:1}}));
 }
};
const env={DB:db,FINAL_SITE_BUCKET:r2,FINAL_SITE_FILES_APPROVED:'true',CUSTOMER_PORTAL_APPROVED:'true'};
const payload={files,confirm:'UPLOAD_VERIFIED_FINISHED_WEBSITE',currentVersion:3,expectedRowVersion:5};
assert.equal((await uploadFinalWebsiteFiles(db,project,{...env,FINAL_SITE_FILES_APPROVED:'false'},payload)).ok,false);
assert.equal(stored,null);
assert.equal((await uploadFinalWebsiteFiles(db,project,env,{...payload,currentVersion:1})).ok,false);
assert.equal((await uploadFinalWebsiteFiles(db,{...project,status:'DELIVERED'},env,payload)).ok,false);
const uploaded=await uploadFinalWebsiteFiles(db,project,env,payload);
assert.equal(uploaded.ok,true);
assert.equal(uploaded.file_count,4);
assert.equal(uploaded.version,3);
assert.equal(uploaded.delivered,false);
assert.equal(uploaded.published,false);
assert.equal(uploaded.customer_notified,false);
assert.ok(uploaded.private_artifact_reference.startsWith('final-artifact/'));
assert.ok(storageKey.startsWith('mapleweb-private-final/'));
assert.ok(/^[0-9a-f]{64}$/.test(uploaded.sha256_hex));
const current=await getFinalWebsiteArtifact(db,r2,project);
assert.equal(current.ok,true);
assert.equal(current.present,true);
assert.equal(current.version,3);
assert.equal(current.byte_size,stored.length);
assert.equal(current.artifact_reference,uploaded.private_artifact_reference);
assert.equal(current.full_sha256_content_verified,true,'Manager QA requires full actual ZIP SHA-256 verification');
assert.equal((await uploadFinalWebsiteFiles(db,project,env,payload)).ok,false,
 'No silent replacement of finished customer files');

const endpoint='https://site.example/api/customer/review/'+rawToken+'/download';
const disabled=await downloadCustomerWebsite(new Request(endpoint),{...env,FINAL_SITE_FILES_APPROVED:'false'});
assert.equal(disabled.status,404);
const download=await downloadCustomerWebsite(new Request(endpoint),env);
assert.equal(download.status,200);
assert.equal(download.headers.get('content-type'),'application/zip');
assert.equal(download.headers.get('referrer-policy'),'no-referrer');
assert.ok(download.headers.get('content-disposition').includes('attachment'));
assert.ok(download.headers.get('cache-control').includes('no-store'));
assert.deepEqual([...new Uint8Array(await download.arrayBuffer())],[...stored]);
assert.equal(views,1);
const publicResponse=await publicWorker.fetch(new Request(endpoint),env);
assert.equal(publicResponse.status,200);
assert.equal((await publicResponse.arrayBuffer()).byteLength,stored.length);
assert.equal(views,2);
// A same-size private R2 object mutation MUST never reach the customer.
const original=new Uint8Array(stored);
stored[110]^=1; // Corrupt one ZIP byte; size and file name are unchanged.
const brokenOwnerStatus=await getFinalWebsiteArtifact(db,r2,project);
assert.equal(brokenOwnerStatus.ok,false,'Manager owner QA must refuse a same-size altered R2 ZIP');
const changed=await downloadCustomerWebsite(new Request(endpoint),env);
assert.equal(changed.status,404,'A same-size tampered ZIP must fail SHA-256 validation');
assert.equal(views,2,'Rejected changed files must not count as a successful download');
stored=original;
assert.equal((await getFinalWebsiteArtifact(db,r2,project)).full_sha256_content_verified,true);
assert.equal((await downloadCustomerWebsite(new Request(endpoint),env)).status,200);
assert.equal(views,3);
// R2 metadata that conflicts with the approved D1 hash is independently rejected.
metadataOverride='0'.repeat(64);
assert.equal((await getFinalWebsiteArtifact(db,r2,project)).ok,false);
assert.equal((await downloadCustomerWebsite(new Request(endpoint),env)).status,404);
assert.equal(views,3);
metadataOverride=uploaded.sha256_hex;
assert.equal((await getFinalWebsiteArtifact(db,r2,project)).metadata_sha256_matches,true);
assert.equal((await downloadCustomerWebsite(new Request(endpoint),env)).status,200);
assert.equal(views,4);
assert.equal((await downloadCustomerWebsite(new Request('https://site.example/api/customer/review/'+projectId+'/download'),env)).status,404);
assert.equal((await downloadCustomerWebsite(new Request(endpoint,{method:'POST'}),env)).status,405);
const publicCfg=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8'));
const privateCfg=JSON.parse(fs.readFileSync('wrangler.manager.jsonc','utf8'));
assert.equal(publicCfg.vars.FINAL_SITE_FILES_APPROVED,'false');
assert.equal(privateCfg.vars.FINAL_SITE_FILES_APPROVED,'false');
assert.equal(privateCfg.workers_dev,false);
const ownerUi=fs.readFileSync('manager-ui/app.js','utf8');
new vm.Script(ownerUi);
assert.ok(ownerUi.includes('UPLOAD_VERIFIED_FINISHED_WEBSITE'));
const reviewUi=fs.readFileSync('public/customer-review.js','utf8');
new vm.Script(reviewUi);
assert.ok(reviewUi.includes('/download'));
console.log('PASS real finished website ZIP, R2 storage, SHA256 and version guard, 4 files, private customer download and disabled-by-default release');
