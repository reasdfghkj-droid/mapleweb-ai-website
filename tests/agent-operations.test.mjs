import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import {
 aiDeveloperAvailable,sanitizePageCopy,buildPrivateAIWebsite
} from '../workers/ai-website-developer.mjs';
import {buildWebsiteStarterBundle} from '../workers/site-bundle.mjs';
import {processDeveloperJob} from '../workers/developer-handoff.mjs';
import {
 inspectStaleBuild,listDeveloperQueue,markStalledDeveloperJob,
 retryFailedTemplateOnce,processApprovedTemplateBatch
} from '../workers/agent-operations.mjs';
import privateManager from '../workers/manager.mjs';
import publicWorker from '../workers/developer.mjs';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const pid='11111111-1111-4111-8111-111111111111';
const answers={
 business:'Independent Café <script>alert(1)</script>',
 goal:'Tell people about our cafe and show lunch services',
 pages:'3–5 pages',features:'Photo gallery and Contact form',
 style:'Classic and elegant',timeline:'Flexible',
 additional_details:'Use friendly headings. Do not invent an address.'
};
const starter=buildWebsiteStarterBundle(answers);
assert.equal(starter.pages,4);
assert.equal(starter.generated_by,'fixed-template');
assert.equal(starter.published,false);
assert.equal(starter.requires_factual_review,true);

const pages=starter.files.filter(f=>f.path.endsWith('.html')).map(f=>f.path);
const malicious={pages:Object.fromEntries(pages.map(p=>[p,{
 heading:'Welcome <script>alert(1)</script>',
 intro:'Friendly, helpful services and <img src=x onerror=alert(1)>',
 sectionHeading:'See our services now',
 sectionBody:'Information about this business and how to get started.'
}]))};
const safe=sanitizePageCopy(malicious,pages);
assert.equal(safe.ok,true);
assert.equal(sanitizePageCopy({pages:{}},pages).ok,false);
assert.equal(sanitizePageCopy({pages:[]},pages).ok,false);
const rendered=buildWebsiteStarterBundle(answers,{
 pageCopy:safe.pageCopy,generatedBy:'cloudflare-workers-ai'
});
assert.equal(rendered.pages,4);
assert.equal(rendered.generated_by,'cloudflare-workers-ai');
assert.equal(rendered.requires_customer_approval,true);
assert.equal(rendered.advanced_integrations_connected,false);
assert.ok(rendered.files.find(f=>f.path==='index.html').content.includes('&lt;script&gt;'));
assert.ok(!rendered.files.some(f=>f.content.includes('<script>alert')));
assert.ok(!rendered.files.some(f=>f.content.includes('<img src=x')));
assert.ok(!rendered.files.some(f=>f.path.endsWith('.html')&&!f.content.includes('Content-Security-Policy')));
assert.ok(rendered.files.some(f=>f.path==='MAPLEWEB_PRIVATE_BRIEF.txt'));
for(const file of rendered.files){
 assert.ok(file.path!=='index.html'||file.content.toLowerCase().includes('customer review'));
}

let aiRuns=0;
const ai={run:async(model,payload)=>{
  aiRuns++;
  assert.ok(model.startsWith('@cf/'));
  assert.ok(payload.messages[0].content.includes('No external links'));
  assert.ok(!JSON.stringify(payload).includes('customer@example.com'));
  return {response:JSON.stringify(malicious)};
}};
const flagEnv={AI:ai,AUTO_BUILD_HANDOFF_APPROVED:'true',
 AI_DEVELOPER_APPROVED:'true',AI_DRAFTS_APPROVED:'true'};
for(const wrong of [
 {},{...flagEnv,AUTO_BUILD_HANDOFF_APPROVED:'false'},
 {...flagEnv,AI_DEVELOPER_APPROVED:'false'},
 {...flagEnv,AI_DRAFTS_APPROVED:'false'},
 {...flagEnv,AI:null}
]){
 assert.equal(aiDeveloperAvailable(wrong),false);
 const result=await buildPrivateAIWebsite(answers,wrong);
 assert.equal(result.ok,false);
 assert.equal(result.model_called,false);
}
assert.equal(aiRuns,0,'No model calls without explicit approval');
const enhanced=await buildPrivateAIWebsite(answers,flagEnv);
assert.equal(enhanced.ok,true);
assert.equal(enhanced.bundle.pages,4);
assert.equal(enhanced.bundle.generated_by,'cloudflare-workers-ai');
assert.equal(enhanced.published,false);
assert.equal(enhanced.payment_due,false);
assert.equal(enhanced.full_website_finished,false);
assert.equal(aiRuns,1);
const invalid=await buildPrivateAIWebsite(answers,{
 ...flagEnv,AI:{run:async()=>{aiRuns++;return {response:'This is not valid JSON content at all'}}}
});
assert.equal(invalid.ok,false);
assert.equal(invalid.code,'INVALID_AI_JSON');

// Private D1 mock: record exact SQL updates so paid AI output cannot imply delivery.
const recorded=[];
const db={
 prepare(sql){
  const op={sql,bind(...args){this.args=args;return this},
    async first(){return {
      status:'QUEUED',attempts:0,project_status:'NEW',current_version:1,
      answers_json:JSON.stringify(answers)
    }},
    async run(){return {meta:{changes:1}}}
  };recorded.push(op);return op;
 },
 async batch(ops){assert.equal(ops.length,4,'Builder completion needs 4 atomic updates');return ops.map(()=>({meta:{changes:1}}))}
};
const built=await processDeveloperJob(db,pid,{...flagEnv,DB:db});
assert.equal(built.ok,true);
assert.equal(built.automated_builder,'cloudflare-workers-ai');
assert.equal(built.paid_ai_used,true);
assert.equal(built.full_website_finished,false);
assert.equal(built.published,false);
assert.equal(built.customer_notified,false);
const claim=recorded.find(q=>q.sql.includes("SET status='BUILDING'"));
assert.ok(claim&&claim.args.includes('cloudflare-workers-ai'),'AI intent must be persisted BEFORE inference');
const projectUpdate=recorded.find(q=>q.sql.includes('SET draft_html=?,generator=?'));
assert.ok(projectUpdate,'Generated homepage must reach owner private preview');
assert.ok(projectUpdate.args[0].includes('&lt;script&gt;'),'The persisted preview must be HTML-escaped');
const jobUpdate=recorded.find(q=>q.sql.includes("SET status='STARTER_READY'"));
assert.ok(jobUpdate);
assert.equal(jobUpdate.args[2],'cloudflare-workers-ai');
assert.equal(JSON.parse(jobUpdate.args[1]).generated_by,'cloudflare-workers-ai');

// Queue operations do not expose contact details and require private D1.
const queued=[
 {project_id:pid,status:'QUEUED',generator:'fixed-template'},
 {project_id:pid,status:'FAILED',generator:'cloudflare-workers-ai'},
 {project_id:pid,status:'BUILDING',generator:'fixed-template'}
];
const queueDb={
 prepare(sql){return {sql,bind(){return this},async all(){return {results:queued}}}},
 async batch(ops){return ops.map(()=>({meta:{changes:1}}))}
};
const list=await listDeveloperQueue(queueDb);
assert.equal(list.ok,true);
assert.equal(list.queued,1);assert.equal(list.failed,1);assert.equal(list.building,1);
assert.equal(list.has_customer_pii,false);
assert.equal(list.private_only,true);
assert.equal((await listDeveloperQueue(queueDb,101)).ok,false);
const t=Date.parse('2026-11-19T22:00:00.000Z');
assert.equal(inspectStaleBuild({status:'BUILDING',started_at:'2026-11-19T21:00:00.000Z',attempts:1,output_json:null},t).ok,true);
assert.equal(inspectStaleBuild({status:'BUILDING',started_at:'2026-11-19T21:40:00.000Z',attempts:1,output_json:null},t).ok,false);
assert.equal(inspectStaleBuild({status:'STARTER_READY',started_at:'2026-11-19T21:00:00.000Z',attempts:1},t).ok,false);
assert.equal(inspectStaleBuild({status:'BUILDING',started_at:'2026-11-19T21:00:00.000Z',attempts:1,output_json:'{}'},t).ok,false);

function ownerDb(job){
 const calls=[];
 const d={
  prepare(sql){
   const stmt={sql,bind(...a){this.args=a;return this},
     async first(){return job},
     async run(){return {meta:{changes:1}}}};
   calls.push(stmt);return stmt;
  },
  async batch(ops){return ops.map(()=>({meta:{changes:1}}))}
 };
 return {d,calls};
}
const stalled=ownerDb({status:'BUILDING',started_at:'2026-11-19T21:00:00.000Z',
 attempts:1,generator:'cloudflare-workers-ai',output_json:null});
const mark=await markStalledDeveloperJob(stalled.d,pid,t);
assert.equal(mark.ok,true);
assert.equal(mark.auto_retried,false);
assert.equal(mark.paid_ai_retried,false);
assert.ok(stalled.calls.some(q=>q.sql.includes("SET status='FAILED'")));

const failedTemplate={status:'FAILED',generator:'fixed-template',attempts:1,manual_retries:0,
 output_json:null,project_status:'NEW',stripe_invoice_id:null,quote_accepted_at:null};
const retry=ownerDb(failedTemplate);
const outcome=await retryFailedTemplateOnce(retry.d,pid);
assert.equal(outcome.ok,true);
assert.equal(outcome.manual_retries,1);
assert.equal(outcome.paid_ai_used,false);
assert.ok(retry.calls.some(q=>q.sql.includes('manual_retries=1')));
for(const item of [
 {...failedTemplate,generator:'cloudflare-workers-ai'},
 {...failedTemplate,manual_retries:1},
 {...failedTemplate,project_status:'ACCEPTED'},
 {...failedTemplate,stripe_invoice_id:'in_sandbox'},
 {...failedTemplate,quote_accepted_at:'2026-11-19T21:00:00.000Z'},
 {...failedTemplate,output_json:'{}'}
]){
 const block=ownerDb(item);
 const result=await retryFailedTemplateOnce(block.d,pid);
 assert.equal(result.ok,false,'Unsafe manual retry should be rejected: '+JSON.stringify(item));
}
let batchQueries=0;
const denied=await processApprovedTemplateBatch({
 AUTO_AGENT_BATCH_APPROVED:'false',AUTO_BUILD_HANDOFF_APPROVED:'true',DB:queueDb
});
assert.equal(denied.ok,false);
assert.equal(batchQueries,0);
const paidDenied=await processApprovedTemplateBatch({
 AUTO_AGENT_BATCH_APPROVED:'true',AUTO_BUILD_HANDOFF_APPROVED:'true',
 AI_DEVELOPER_APPROVED:'true',DB:queueDb,AI:ai
});
assert.equal(paidDenied.ok,false);
assert.equal(aiRuns,3,'No paid AI should be run by scheduled batching');
assert.equal((await processApprovedTemplateBatch({},100)).ok,false);

const config=JSON.parse(fs.readFileSync('wrangler.manager.jsonc','utf8'));
assert.equal(config.vars.AUTO_AGENT_BATCH_APPROVED,'false');
assert.equal(config.vars.AI_DEVELOPER_APPROVED,'false');
assert.equal(config.vars.AI_DRAFTS_APPROVED,'false');
assert.equal(config.workers_dev,false);
const managerRes=await privateManager.fetch(new Request('https://private.test/api/manager/build-queue'),{});
assert.equal(managerRes.status,503);
const customerRes=await publicWorker.fetch(new Request('https://www.test/api/manager/build-queue'),{});
assert.equal(customerRes.status,404);
new vm.Script(fs.readFileSync('manager-ui/app.js','utf8'));
console.log('PASS private AI multi-page draft, escaped content, cost flags, queue audit, recovery and no public access');
