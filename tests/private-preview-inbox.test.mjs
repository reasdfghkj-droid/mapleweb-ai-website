import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import {hashPreviewToken,createPrivatePreviewShare,servePrivatePreview,revokePrivatePreviewShares} from '../workers/private-previews.mjs';
import {notificationInsert,listOwnerNotifications,markNotificationRead} from '../workers/owner-inbox.mjs';
import {planOwnerTransition} from '../workers/order-engine.mjs';
import {abandonedDeletionEligibility,deleteAbandonedRequest} from '../workers/order-retention.mjs';
import publicDeveloper from '../workers/developer.mjs';
import {handleOwnerRequest} from '../workers/owner-api.mjs';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const uid='11111111-1111-4111-8111-111111111111';
const project={
 id:uid,current_version:3,status:'PREVIEW_READY',
 preview_verified:1,security_check_passed:1,outstanding_revisions:0
};
let params=[],sqls=[],active=true;
const db={
 prepare(sql){
   sqls.push(sql);
   return {
     bind(...args){params=args;this.args=args;this.sql=sql;return this},
     async run(){
       return {success:true,meta:{changes:active?1:0}};
     },
     async first(){
       return {draft_html:'<!doctype html><html><body>PRIVATE STUB</body></html>'};
     }
   };
 }
};
const env={PUBLIC_SITE_ORIGIN:'https://mapleweb-ai-website.reasdfghkj.workers.dev'};
const share=await createPrivatePreviewShare(db,project,env,24);
assert.equal(share.ok,true);
assert.equal(share.published,false);
assert.ok(share.url.startsWith(env.PUBLIC_SITE_ORIGIN+'/preview/'));
assert.equal(share.max_views,30);
const token=share.url.split('/').at(-1);
assert.equal(token.length,43);
assert.ok(/^[A-Za-z0-9_-]{43}$/.test(token));
const hash=await hashPreviewToken(token);
assert.ok(/^[a-f0-9]{64}$/.test(hash));
assert.notEqual(hash,token);
assert.ok(params.indexOf(hash)>=0,'Only the digest is stored, never token');
assert.ok(!params.includes(token));
assert.equal((await createPrivatePreviewShare(db,{...project,status:'BUILDING'},env)).ok,false);
assert.equal((await createPrivatePreviewShare(db,{...project,preview_verified:0},env)).ok,false);
assert.equal((await createPrivatePreviewShare(db,project,env,90)).ok,false);
assert.equal((await createPrivatePreviewShare(db,project,{PUBLIC_SITE_ORIGIN:'http://bad.example'})).ok,false);
assert.equal((await createPrivatePreviewShare(db,project,{PUBLIC_SITE_ORIGIN:'https://valid.example@bad.example'})).ok,false);

const url=share.url;
const unavailable=await servePrivatePreview(new Request(url),{
 DB:db,PRIVATE_PREVIEWS_APPROVED:'false'
});
assert.equal(unavailable.status,404);

active=true;
const preview=await servePrivatePreview(new Request(url),{
 DB:db,PRIVATE_PREVIEWS_APPROVED:'true'
});
assert.equal(preview.status,200);
assert.ok((await preview.text()).includes('PRIVATE STUB'));
assert.ok(preview.headers.get('content-security-policy').includes("script-src 'none'"));
assert.equal(preview.headers.get('referrer-policy'),'no-referrer');
assert.ok(preview.headers.get('cache-control').includes('no-store'));
assert.ok(preview.headers.get('x-robots-tag').includes('noindex'));
assert.ok(sqls.some(s=>s.includes('views<max_views')&&s.includes('current_version=preview_shares.version')));
assert.equal((await servePrivatePreview(new Request(url+'?analytics=1'),{
 DB:db,PRIVATE_PREVIEWS_APPROVED:'true'
})).status,404);
assert.equal((await servePrivatePreview(new Request(url,{method:'POST'}),{
 DB:db,PRIVATE_PREVIEWS_APPROVED:'true'
})).status,405);
active=false;
assert.equal((await servePrivatePreview(new Request(url),{
 DB:db,PRIVATE_PREVIEWS_APPROVED:'true'
})).status,404,'Expired, revoked, stale-version or max-view token must be rejected');

active=true;
const revoked=await revokePrivatePreviewShares(db,uid);
assert.equal(revoked.ok,true);assert.equal(revoked.revoked_count,1);

const notifications=[];
const inboxDb={
 prepare(sql){
   return {sql,bind(...args){this.args=args;return this},
      async all(){return {success:true,results:notifications}},
      async run(){return {success:true,meta:{changes:1}}}};
 }
};
const insert=notificationInsert(inboxDb,uid,'NEW_REQUEST');
assert.ok(insert.sql.startsWith('INSERT INTO owner_notifications'));
assert.equal(insert.args[1],uid);
assert.equal(insert.args[2],'NEW_REQUEST');
assert.throws(()=>notificationInsert(inboxDb,uid,'CUSTOMER_EMAIL_SENT'));
notifications.push({id:uid,project_id:uid,category:'NEW_REQUEST',status:'NEW',
 created_at:new Date().toISOString(),read_at:null});
const inbox=await listOwnerNotifications(inboxDb);
assert.equal(inbox.ok,true);
assert.equal(inbox.notifications.length,1);
assert.equal(inbox.email_sent,false);
assert.equal(inbox.push_sent,false);
assert.equal(inbox.delivery,'IN_APP_ONLY');
assert.equal((await markNotificationRead(inboxDb,uid)).marked_read,true);
assert.equal((await markNotificationRead(inboxDb,'bad-id')).ok,false);

// Abandoned-lead deletion must NEVER delete a priced, accepted or invoiced project.
const abandoned={
 id:uid,submission_id:'22222222-2222-4222-8222-222222222222',
 row_version:1,status:'NEW',quote_accepted_at:null,stripe_invoice_id:null,
 invoice_status:null,paid_at:null,delivered_at:null,approved_final_total_cad_cents:null
};
assert.equal(abandonedDeletionEligibility(abandoned).allowed,true);
for(const update of [
 {status:'DELIVERED'},
 {status:'ACCEPTED'},
 {status:'QUOTED'},
 {stripe_invoice_id:'in_test1'},
 {invoice_status:'paid'},
 {quote_accepted_at:'2026-11-19T18:00:00.000Z'},
 {approved_final_total_cad_cents:50000},
 {paid_at:'2026-11-19T18:00:00.000Z'},
 {delivered_at:'2026-11-19T18:00:00.000Z'}
])assert.equal(abandonedDeletionEligibility({...abandoned,...update}).allowed,false,JSON.stringify(update));
let sqlDeletion='';
const deleteDb={prepare(sql){sqlDeletion=sql;return {bind(){return this},async run(){return {meta:{changes:1}}}}}};
const deletion=await deleteAbandonedRequest(deleteDb,abandoned);
assert.equal(deletion.ok,true);
assert.equal(deletion.deleted,true);
assert.equal(deletion.customer_notified,false);
assert.ok(sqlDeletion.includes('DELETE FROM submissions'));
assert.ok(sqlDeletion.includes('p.stripe_invoice_id IS NULL'));
assert.ok(sqlDeletion.includes('p.quote_accepted_at IS NULL'));
assert.ok(sqlDeletion.includes('p.row_version=?'));
assert.equal((await deleteAbandonedRequest(deleteDb,{...abandoned,status:'DELIVERED'})).ok,false);

// Double-check owner-only isolation and no public project previews by predictable IDs.
const owner=await handleOwnerRequest(new Request('https://manager.example/api/manager/notifications'),{});
assert.equal(owner.status,503);
const blocked=await publicDeveloper.fetch(new Request('https://www.example/api/manager/notifications'),{});
assert.equal(blocked.status,404);
const notFound=await publicDeveloper.fetch(new Request('https://www.example/preview/'+uid),{
 PRIVATE_PREVIEWS_APPROVED:'true',DB:db
});
assert.equal(notFound.status,404,'A project UUID alone is NOT an access token');

// Revisions invalidate old approved preview versions.
const review=planOwnerTransition({
 ...project,row_version:3,stripe_invoice_id:null,invoice_status:null,quote_approved_version:3,
 quote_accepted_at:'2026-11-19T18:00:00.000Z'
},'REVISE',{revisionEvidenceReference:'revision/001'});
assert.equal(review.ok,true);
assert.equal(review.fields.current_version,4);
assert.equal(review.fields.preview_verified,0);

const managerUi=fs.readFileSync('manager-ui/app.js','utf8');
new vm.Script(managerUi);
assert.ok(!managerUi.includes('localStorage'));
assert.ok(!managerUi.includes('sessionStorage'));
assert.ok(managerUi.includes('CREATE_PRIVATE_CUSTOMER_PREVIEW'));
assert.ok(managerUi.includes('REVOKE_ALL_CUSTOMER_PREVIEW_LINKS'));
const managerConfig=JSON.parse(fs.readFileSync('wrangler.manager.jsonc','utf8'));
const publicConfig=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8'));
assert.equal(managerConfig.vars.PRIVATE_PREVIEWS_APPROVED,'false');
assert.equal(publicConfig.vars.PRIVATE_PREVIEWS_APPROVED,'false');
assert.ok(publicConfig.assets.run_worker_first.includes('/preview/*'));
console.log('PASS Phase 3: hashed preview tokens, no scripts, denied stale links, private inbox, safe abandoned-lead deletion, manager isolation');
