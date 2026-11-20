import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {customerEmailReady,sendCustomerReviewEmail} from '../workers/customer-email.mjs';
import {handleOwnerRequest} from '../workers/owner-api.mjs';
import publicWorker from '../workers/developer.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const projectId='11111111-1111-4111-8111-111111111111';
const tokenId='22222222-2222-4222-8222-222222222222';
const rawToken='A'.repeat(43);
const origin='https://mapleweb-ai-website.example';
const url=origin+'/review/'+rawToken;
const project={
 id:projectId,status:'QUOTED',current_version:1,row_version:7,
 name:'Test owner',email:'client@example.org',
 quote_approved_version:1,quote_accepted_at:null,
 customer_approved_version:null
};
const flags={
 CUSTOMER_EMAILS_APPROVED:'true',
 CUSTOMER_EMAIL_DOMAIN_VERIFIED:'true',
 RESEND_API_KEY:'re_'+ 'k'.repeat(36),
 CUSTOMER_EMAIL_FROM:'hello@mapleweb.example',
 CUSTOMER_EMAIL_VERIFIED_DOMAIN:'mapleweb.example',
 PUBLIC_SITE_ORIGIN:origin
};
assert.equal(customerEmailReady(flags),true);
for(const bad of [
 {...flags,CUSTOMER_EMAILS_APPROVED:'false'},
 {...flags,CUSTOMER_EMAIL_DOMAIN_VERIFIED:'false'},
 {...flags,RESEND_API_KEY:'no-key'},
 {...flags,CUSTOMER_EMAIL_FROM:'hello@unverified.example'},
 {...flags,CUSTOMER_EMAIL_VERIFIED_DOMAIN:'other.example'},
 {...flags,PUBLIC_SITE_ORIGIN:'http://insecure.example'}
]){
 assert.equal(customerEmailReady(bad),false);
}
let reserveCount=0,apiCount=0,providerStatus='ok',tokenAvailable=true;
const sqls=[];
const db={
 prepare(sql){
  const stmt={sql,bind(...params){this.params=params;return this},
   async first(){
    if(sql.includes('SELECT id,purpose,version FROM customer_review_tokens'))
      return tokenAvailable?{id:tokenId,purpose:'QUOTE',version:1}:null;
    throw Error('Unexpected read '+sql);
   },
   async run(){
    if(sql.startsWith('INSERT OR IGNORE INTO customer_review_email_operations')){
      reserveCount++;
      return {meta:{changes:reserveCount===1?1:0}};
    }
    return {meta:{changes:1}};
   }
  };
  sqls.push(stmt);return stmt;
 },
 async batch(){return []}
};
const fetcher=async(endpoint,init)=>{
 apiCount++;
 assert.equal(endpoint,'https://api.resend.com/emails');
 assert.equal(init.method,'POST');
 assert.equal(init.redirect,'error');
 assert.ok(init.headers.Authorization.startsWith('Bearer re_'));
 assert.ok(init.headers['Idempotency-Key'].includes(tokenId));
 const msg=JSON.parse(init.body);
 assert.equal(msg.from,'hello@mapleweb.example');
 assert.deepEqual(msg.to,['client@example.org']);
 assert.ok(msg.subject.includes('quotation'));
 assert.ok(msg.text.includes(url));
 assert.ok(msg.text.includes('No deposit'));
 assert.ok(!init.body.includes('password:'));
 if(providerStatus==='failed')return new Response('Unavailable',{status:503});
 if(providerStatus==='ambiguous')throw Error('Network timed out');
 return Response.json({id:'email_1234567890'});
};
const confirm={confirm:'SEND_OWNER_APPROVED_REVIEW_EMAIL',expectedRowVersion:7,reviewUrl:url};
assert.equal((await sendCustomerReviewEmail(db,project,{
 ...flags,CUSTOMER_EMAILS_APPROVED:'false'
},confirm,fetcher)).ok,false);
assert.equal(apiCount,0);
assert.equal((await sendCustomerReviewEmail(db,project,flags,{
 ...confirm,expectedRowVersion:6
},fetcher)).ok,false);
assert.equal((await sendCustomerReviewEmail(db,project,flags,{
 ...confirm,reviewUrl:'https://attacker.example/review/'+rawToken
},fetcher)).ok,false);
assert.equal((await sendCustomerReviewEmail(db,project,flags,{
 ...confirm,reviewUrl:url+'?redirect=evil'
},fetcher)).ok,false);
assert.equal(apiCount,0);
const sent=await sendCustomerReviewEmail(db,project,flags,confirm,fetcher);
assert.equal(sent.ok,true);
assert.equal(sent.email_submitted_to_provider,true);
assert.equal(sent.email_delivery_confirmed,false);
assert.equal(sent.invoice_created,false);
assert.equal(sent.website_published,false);
assert.equal(sent.customer_charged,false);
assert.equal(apiCount,1);
assert.ok(sqls.some(x=>x.sql.includes("status='SENT'")));
const inserted=sqls.find(x=>x.sql.startsWith('INSERT OR IGNORE INTO customer_review_email_operations'));
assert.ok(inserted);
assert.ok(!inserted.params.includes(rawToken));
assert.ok(!inserted.params.includes(project.email));
assert.ok(/^[a-f0-9]{64}$/.test(inserted.params[4]),'Email address must be hashed in send ledger');
const repeated=await sendCustomerReviewEmail(db,project,flags,confirm,fetcher);
assert.equal(repeated.ok,false);
assert.equal(apiCount,1,'Duplicate email must never be sent');
assert.ok(repeated.error.includes('already has an email attempt'));

// A different token/provider error must enter MANUAL_REVIEW and never retry automatically.
reserveCount=0;
providerStatus='ambiguous';
const failed=await sendCustomerReviewEmail(db,project,flags,confirm,fetcher);
assert.equal(failed.ok,false);
assert.ok(failed.error.includes('manual')||failed.error.includes('provider'));
assert.ok(sqls.some(x=>x.sql.includes("status='MANUAL_REVIEW'")));
assert.equal(apiCount,2);
tokenAvailable=false;
const unavailable=await sendCustomerReviewEmail(db,project,flags,confirm,fetcher);
assert.equal(unavailable.ok,false);
assert.equal(apiCount,2);

// Public Worker and disabled private Manager cannot be abused to send customer email.
const publicResponse=await publicWorker.fetch(
 new Request('https://public.example/api/manager/projects/'+projectId+'/send-review-email'),{}
);
assert.equal(publicResponse.status,404);
const managerResponse=await handleOwnerRequest(
 new Request('https://manager.example/api/manager/projects/'+projectId+'/send-review-email'),{}
);
assert.equal(managerResponse.status,503);
const publicConfig=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8'));
const managerConfig=JSON.parse(fs.readFileSync('wrangler.manager.jsonc','utf8'));
assert.equal(managerConfig.vars.CUSTOMER_EMAILS_APPROVED,'false');
assert.equal(managerConfig.vars.CUSTOMER_EMAIL_DOMAIN_VERIFIED,'false');
assert.equal(publicConfig.vars.SUBMISSIONS_APPROVED,'false');
new vm.Script(fs.readFileSync('manager-ui/app.js','utf8'));
assert.ok(fs.readFileSync('manager-ui/index.html','utf8').includes('id="sendReviewEmail"'));
const src=fs.readFileSync('scripts/activation-preflight.mjs','utf8');
assert.ok(src.includes("present('RESEND_API_KEY')"));
assert.ok(src.includes("present('CUSTOMER_EMAIL_FROM')"));
assert.ok(!src.includes('console.log(process.env.'));
console.log('PASS owner-approved one-time email, verified Resend sender, no duplicate retry, no secrets in ledger, public isolation');
