import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {saveLeadAsProject} from '../workers/order-engine.mjs';
import {
  developerJobInsert,processDeveloperJob,getDeveloperJobStatus,getPrivateStarterBundle
} from '../workers/developer-handoff.mjs';
import {buildWebsiteStarterBundle} from '../workers/site-bundle.mjs';
import backend from '../workers/developer.mjs';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const pid='11111111-1111-4111-8111-111111111111';
const sid='22222222-2222-4222-8222-222222222222';
const answers={
  business:'Family Café',goal:'Help customers find us',
  pages:'3–5 pages',features:'Booking and gallery',budget:'$1,200',
  style:'Green and gold',timeline:'Flexible',
  additional_details:'Please include vegetarian menu, reservation details, and an accessible contact page.'
};
const recorded=[];
const db={
  prepare(sql){
    const st={sql,bind(...args){this.args=args;return this},
      async first(){
        if(sql.includes('FROM developer_build_jobs j JOIN'))return {
          status:'QUEUED',attempts:0,project_status:'NEW',current_version:1,
          answers_json:JSON.stringify(answers)
        };
        if(sql.includes('FROM developer_build_jobs WHERE project_id=?'))return {
          status:'STARTER_READY',output_json:JSON.stringify(buildWebsiteStarterBundle(answers))
        };
        throw Error('Unexpected first query '+sql);
      },
      async run(){return {success:true,meta:{changes:1}}}};
    recorded.push(st);return st;
  },
  async batch(stmts){return stmts.map(()=>({success:true,meta:{changes:1}}));}
};
const submitted=await saveLeadAsProject(db,{
  submissionId:sid,projectId:pid,name:'Customer',email:'customer@example.com',answers
});
assert.equal(submitted.saved,true);
assert.equal(submitted.developer_brief_queued,true);
assert.equal(submitted.build_started,false);
assert.equal(submitted.full_website_finished,false);
assert.equal(submitted.payment_due_now,false);
assert.equal(submitted.published,false);
assert.ok(recorded.some(x=>x.sql.includes('INSERT INTO developer_build_jobs')));
const stored=recorded.find(x=>x.sql.startsWith('INSERT INTO submissions'));
assert.ok(stored,'Intake must store private customer requirement record');
assert.equal(JSON.parse(stored.args[4]).additional_details,answers.additional_details);
const step=developerJobInsert(db,pid,new Date().toISOString());
assert.ok(step.sql.includes('developer_build_jobs'));
assert.throws(()=>developerJobInsert(db,'bad-id',new Date().toISOString()));

const disabled=await processDeveloperJob(db,pid,{AUTO_BUILD_HANDOFF_APPROVED:'false'});
assert.equal(disabled.ok,false,'No work without explicit owner approval');

const built=await processDeveloperJob(db,pid,{AUTO_BUILD_HANDOFF_APPROVED:'true'});
assert.equal(built.ok,true);
assert.equal(built.status,'STARTER_READY');
assert.equal(built.full_website_finished,false);
assert.equal(built.customer_notified,false);
assert.equal(built.paid_ai_used,false);
assert.equal(built.published,false);
const finish=recorded.find(x=>x.sql.includes("UPDATE developer_build_jobs SET status='STARTER_READY'"));
assert.ok(finish,'Atomic job completion must store generated output');
const bundle=JSON.parse(finish.args[1]);
assert.equal(bundle.pages,4);
assert.equal(bundle.published,false);
assert.equal(bundle.deployable_without_review,false);
const brief=bundle.files.find(x=>x.path==='MAPLEWEB_PRIVATE_BRIEF.txt');
assert.ok(brief,'Owner brief must be present');
assert.ok(brief.content.includes(answers.additional_details));
assert.ok(bundle.files.some(x=>x.path==='index.html'));
const output=await getPrivateStarterBundle(db,pid);
assert.equal(output.ok,true);
assert.ok(output.bundle.files.find(x=>x.path==='MAPLEWEB_PRIVATE_BRIEF.txt'));
assert.ok(recorded.some(x=>x.sql.includes("WHERE project_id=? AND status='QUEUED' AND attempts=0")));
assert.ok(recorded.some(x=>x.sql.includes("AND current_version=?")));
assert.ok(recorded.some(x=>x.sql.includes('INSERT INTO owner_notifications')));

const raceDb={
 prepare(sql){return {sql,bind(){return this},async first(){
   return {status:'QUEUED',attempts:0,project_status:'NEW',current_version:1,answers_json:JSON.stringify(answers)};
 },async run(){return {meta:{changes:0}}}}},
 async batch(){return []}
};
const race=await processDeveloperJob(raceDb,pid,{AUTO_BUILD_HANDOFF_APPROVED:'true'});
assert.equal(race.ok,false);
assert.ok(race.reason.includes('already claimed'));

const expectedDisabled=await backend.fetch(new Request('https://example.com/api/submit',{
 method:'POST',headers:{'Content-Type':'application/json','Origin':'https://example.com'},
 body:JSON.stringify({consent:true,name:'Test',email:'test@example.com',answers})
}),{SUBMISSIONS_APPROVED:'false'});
assert.equal(expectedDisabled.status,503,'No real submissions without secure Cloudflare configuration');

for(const path of [
 'public/customer-handoff.js','customer-handoff.js',
 'public/chat-experience.js','chat-experience.js'
]){
 const code=fs.readFileSync(path,'utf8');new vm.Script(code,{filename:path});
}
const handoff=fs.readFileSync('public/customer-handoff.js','utf8');
const conversation=fs.readFileSync('public/chat-experience.js','utf8');
assert.ok(handoff.includes("cfg.builder_handoff_enabled!==true"));
assert.ok(handoff.includes('turnstileToken:securityToken'));
assert.ok(handoff.includes('consent:true'));
assert.ok(handoff.includes('Object.values(clean).some(sensitive)'));
assert.ok(handoff.includes("result.status===201&&data.saved===true&&data.developer_brief_queued===true"));
assert.ok(handoff.includes("additional_details=notes.input.value"));
assert.ok(conversation.includes("action('Send to Website Developer'"));
assert.ok(!handoff.includes('localStorage')&&!handoff.includes('sessionStorage'));
assert.ok(!handoff.includes('messages:')&&!handoff.includes('transcript:'),
  'Only consented website requirements and notes, not unrelated raw chats, go to builder');

const publicCfg=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8'));
const privateCfg=JSON.parse(fs.readFileSync('wrangler.manager.jsonc','utf8'));
assert.equal(publicCfg.vars.AUTO_BUILD_HANDOFF_APPROVED,'false');
assert.equal(privateCfg.vars.AUTO_BUILD_HANDOFF_APPROVED,'false');

console.log('PASS customer consent gate, all 7 website requirements and extra notes, durable build queue, private starter and no live charges or publishing');
