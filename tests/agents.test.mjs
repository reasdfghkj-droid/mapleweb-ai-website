import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { PRICES, QUESTIONS, chat, publishGate, ownerAuthed, submit, draftPreview, parseBody, TURNSTILE_ACTION } from '../workers/mapleweb-agents.mjs';
const base = 'https://example.workers.dev';
const req = (path, method = 'GET', body = null, headers = {}) => new Request(base + path, { method, ...(body === null ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json', ...headers } }) });
const json = async r => r.json();
test('approved CAD prices and guided next question', () => {
  assert.equal(PRICES.length, 6);
  assert.deepEqual(PRICES.map(p => [p.min, p.max]), [[500,800],[900,1500],[1500,2200],[2300,3000],[3000,4500],[4500,7000]]);
  assert.equal(chat({ answers: {} }).next_key, 'business');
  assert.equal(chat({ answers: { business: 'Cafe' } }).next_key, 'goal');
  const all = Object.fromEntries(QUESTIONS.map(q => [q.key, 'test']));
  assert.equal(chat({ answers: all }).completed, true);
  assert.equal(chat({ answers: all }).inquiry_submitted, false);
  assert.equal(chat({ answers: all }).ai_model_connected, false);
});
test('draft publication must fail closed with no approvals', () => {
  const draft = publishGate({ currentVersion: 2, previewVerified: false, customerApprovedVersion: 1, ownerApprovedVersion: 1, revisionRequests: [{ status: 'open' }], securityCheckPassed: false });
  assert.equal(draft.readyForOwnerDecision, false);
  assert.ok(draft.blockers.length >= 4);
  const approved = publishGate({ currentVersion: 2, previewVerified: true, customerApprovedVersion: 2, ownerApprovedVersion: 2, revisionRequests: [], securityCheckPassed: true });
  assert.equal(approved.readyForOwnerDecision, true);
  assert.equal(approved.action, 'ASSESS_ONLY_NO_PUBLISH');
});
test('manager requires a secret and cannot authenticate with missing secret', () => {
  assert.equal(ownerAuthed(req('/api/manager/status'), {}), false);
  assert.equal(ownerAuthed(req('/api/manager/status', 'GET', null, { authorization: 'Bearer x' }), {}), false);
});
test('health reports disabled integrations honestly', async () => {
  const r = await worker.fetch(req('/health'), {});
  assert.equal(r.status, 200);
  const body = await json(r);
  assert.equal(body.secure_submissions_enabled, false);
  assert.equal(body.ai_model_connected, false);
});
test('homepage assets fail closed without binding', async () => {
  const r = await worker.fetch(req('/'), {});
  assert.equal(r.status, 503);
});
test('POST chat validates content type and payload size', async () => {
  assert.equal((await worker.fetch(req('/api/chat', 'POST', { answers: { business: 'Salon' } }), {})).status, 200);
  const bad = await worker.fetch(new Request(base + '/api/chat', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'hello' }), {});
  assert.equal(bad.status, 415);
  const huge = await worker.fetch(req('/api/chat', 'POST', { answers: { business: 'a'.repeat(16000) } }), {});
  assert.equal(huge.status, 413);
});
test('submissions fail closed without D1 and security challenge', async () => {
  const r = await worker.fetch(req('/api/submit', 'POST', { name: 'A', email: 'a@example.com', consent: true }), {});
  assert.equal(r.status, 503);
  const b = await json(r);
  assert.match(b.error, /not configured/);
});
test('submissions reject cross-origin requests even if services are configured', async () => {
  const env = { DB: { prepare() {} }, TURNSTILE_SECRET: 'dummy', TURNSTILE_SITE_KEY: 'sitekey', SITE_ORIGIN: 'https://maplewebai.example', SUBMISSIONS_APPROVED: 'true', RATE_LIMIT_SECRET: 'r'.repeat(48) };
  const r = await worker.fetch(req('/api/submit', 'POST', { consent: true }, { origin: 'https://wrong.example' }), env);
  assert.equal(r.status, 403);
});
test('manager status and assessment are unavailable without 32-char token', async () => {
  const r = await worker.fetch(req('/api/manager/status'), { MANAGER_TOKEN: 'short' });
  assert.equal(r.status, 401);
  const r2 = await worker.fetch(req('/api/manager/status', 'GET', null, { authorization: 'Bearer wrong' }), { MANAGER_TOKEN: 'x'.repeat(48) });
  assert.equal(r2.status, 401);
});

test('guided Worker chat acknowledges the previous answer before asking next', async () => {
  const step = chat({ answers: { business: 'Bicycle repair' } });
  assert.match(step.acknowledgment, /Bicycle repair/);
  assert.match(step.reply, /What would you like your website/);
  assert.equal(step.next_key, 'goal');
  const response = await worker.fetch(req('/api/chat', 'POST', { answers: { business: 'Cafe', goal: 'New customers' } }), {});
  assert.equal(response.status, 200);
  const body = await json(response);
  assert.match(body.reply, /included it in your plan/i);
  assert.equal(body.next_key, 'pages');
  assert.equal(body.inquiry_submitted, false);
});
test('developer creates an escaped, unpublished preview without script injection', async () => {
  const payload = { answers: { business: '<img src=x onerror=alert(1)>', goal: '<script>alert(1)</script>', style: 'Modern' } };
  const preview = draftPreview(payload);
  assert.ok(preview);
  assert.equal(preview.published, false);
  assert.equal(preview.draft_only, true);
  assert.equal(preview.ai_model_connected, false);
  assert.ok(preview.html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(preview.html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!preview.html.includes('<script>alert(1)</script>'));
  assert.match(preview.html, /form-action 'none'/);
  const response = await worker.fetch(req('/api/draft', 'POST', payload), {});
  assert.equal(response.status, 200);
  assert.equal((await json(response)).published, false);
});
test('developer draft refuses missing business or goal and invalid JSON', async () => {
  assert.equal((await worker.fetch(req('/api/draft', 'POST', { answers: { business: 'Cafe' } }), {})).status, 400);
  assert.equal((await worker.fetch(new Request(base+'/api/draft', { method:'POST',headers:{'content-type':'application/json'},body:'{broken' }), {})).status, 400);
});
test('public config never reveals security secret and does not misreport live agents', async () => {
  const env = { DB: { prepare() {} }, TURNSTILE_SECRET: 'secret-will-not-leak', TURNSTILE_SITE_KEY: 'public-site-key', SITE_ORIGIN: 'https://example.workers.dev', SUBMISSIONS_APPROVED:'true', RATE_LIMIT_SECRET:'r'.repeat(48), MANAGER_TOKEN: 'x'.repeat(48) };
  const response = await worker.fetch(req('/api/config'), env);
  assert.equal(response.status, 200);
  const result = await json(response);
  assert.equal(result.submissions_enabled, true);
  assert.equal(result.turnstile_site_key, 'public-site-key');
  assert.equal(result.publishing_enabled, false);
  assert.equal(result.ai_model_connected, false);
  assert.doesNotMatch(JSON.stringify(result), /secret-will-not-leak/);
});
test('submission stores data only after consent, origin and Turnstile verification', async () => {
  let saves = 0;
  let inserted = null;
  const env = {
    SITE_ORIGIN: base,
    TURNSTILE_SECRET: 'dummy-secret',
    TURNSTILE_SITE_KEY: 'public-site-key',
    SUBMISSIONS_APPROVED: 'true', RATE_LIMIT_SECRET: 'r'.repeat(48),
    DB: { prepare(sql) {
      if (sql.startsWith('INSERT INTO submission_rate_limits'))
        return { bind(clientKey,windowStart) { assert.match(clientKey,/^[0-9a-f]{64}$/); assert.ok(Number.isInteger(windowStart)); return { async first() { return {attempts:1}; } }; } };
      assert.match(sql, /^INSERT INTO submissions/);
      return { bind(...args) { inserted = args; return { async run() { saves++; return {success:true}; } }; } };
    } },
  };
  const payload = { name: 'Example Customer', email: 'example@sample.org', consent: true, website:'', turnstileToken:'verified-token', answers:{ business:'Cafe',goal:'More bookings',budget:'1200',pages:'3' } };
  const request = req('/api/submit','POST',payload,{origin:base,'CF-Connecting-IP':'192.0.2.10'});
  const pass = await submit(request,env,async (_url,options) => {
    assert.equal(options.method, 'POST');
    assert.match(options.body.toString(), /verified-token/);
    return new Response(JSON.stringify({success:true,hostname:'example.workers.dev',action:TURNSTILE_ACTION}),{status:200,headers:{'content-type':'application/json'}});
  });
  assert.equal(pass.status, 201);
  assert.equal(saves, 1);
  assert.equal(inserted[2], 'Example Customer');
  assert.equal((await json(pass)).delivered_to_agent, false);
  const reject = await submit(req('/api/submit','POST',payload,{origin:base,'CF-Connecting-IP':'192.0.2.10'}),env,async()=>new Response(JSON.stringify({success:false}),{status:200}));
  assert.equal(reject.status,403);
  assert.equal(saves,1);
});
test('submissions reject consent missing and honeypot field', async () => {
  const env={ DB:{prepare(){}}, TURNSTILE_SECRET:'s',TURNSTILE_SITE_KEY:'k', SITE_ORIGIN:base, SUBMISSIONS_APPROVED:'true', RATE_LIMIT_SECRET:'r'.repeat(48) };
  const data={name:'Customer',email:'example@sample.org',turnstileToken:'token',answers:{business:'Cafe',goal:'Leads',budget:'700'}};
  const a=await submit(req('/api/submit','POST',{...data,consent:false},{origin:base}),env,async()=>{throw Error('Must not call fetch');});
  const b=await submit(req('/api/submit','POST',{...data,consent:true,website:'SPAM'},{origin:base}),env,async()=>{throw Error('Must not call fetch');});
  assert.equal(a.status,400);
  assert.equal(b.status,400);
});

test('submission is disabled even with database when owner approval flag is missing', async () => {
 const env={DB:{},TURNSTILE_SECRET:'secret',TURNSTILE_SITE_KEY:'key',SITE_ORIGIN:base};
 const config=await json(await worker.fetch(req('/api/config'),env));
 assert.equal(config.submissions_enabled,false);
 const payload={name:'Test',email:'a@b.ca',consent:true,turnstileToken:'ok',answers:{business:'Cafe',goal:'Leads',budget:'800'}};
 assert.equal((await submit(req('/api/submit','POST',payload,{origin:base,'CF-Connecting-IP':'192.0.2.10'}),env,async()=>{throw Error('Must not call');})).status,503);
});
test('Developer refuses payment card numbers instead of echoing them', async () => {
  const response = chat({answers:{business:'Cafe',goal:'my credit card is 4111 1111 1111 1111'}});
  assert.equal(response.sensitive_rejected, true);
  assert.equal(response.answers.goal, '');
  assert.equal(response.next_key, 'goal');
  assert.doesNotMatch(response.reply, /4111/);
});
test('Developer refuses password strings and private key blocks', async () => {
  const response=chat({answers:{business:'password: supersecret123',goal:'Find customers'}});
  assert.equal(response.sensitive_rejected,true);
  assert.equal(response.answers.business,'');
  assert.equal(draftPreview({answers:{business:'Cafe',goal:'API_KEY=abcd1234'}}),null);
});
test('Manager assessment never publishes and rejects unresolved revisions', async () => {
  const env={MANAGER_TOKEN:'x'.repeat(48)};
  const project={currentVersion:3,customerApprovedVersion:3,ownerApprovedVersion:3,securityCheckPassed:true,previewVerified:true,revisionRequests:[{status:'open'}]};
  const r=await worker.fetch(req('/api/manager/assess','POST',project,{authorization:'Bearer '+env.MANAGER_TOKEN}),env);
  assert.equal(r.status,200);
  const body=await json(r);
  assert.equal(body.readyForOwnerDecision,false);
  assert.equal(body.action,'ASSESS_ONLY_NO_PUBLISH');
});
test('budget in a gap between published price tiers does not promise the wrong package', () => {
  const between=chat({answers:{business:'Cafe',goal:'Leads',pages:'3',features:'Contact',budget:'850'}});
  assert.match(between.reply, /between our published price bands/i);
  assert.doesNotMatch(between.reply, /Simple 3–5 pages usually costs/);
  const normal=chat({answers:{business:'Cafe',goal:'Leads',pages:'3',features:'Contact',budget:'1200'}});
  assert.match(normal.reply, /Simple 3–5 pages usually costs/);
});

test('customer submissions remain disabled until keyed rate protection exists', async () => {
  const env={DB:{},TURNSTILE_SECRET:'turnstile-secret',TURNSTILE_SITE_KEY:'site-key',SITE_ORIGIN:base,SUBMISSIONS_APPROVED:'true'};
  const c=await json(await worker.fetch(req('/api/config'),env));
  assert.equal(c.submissions_enabled,false);
  const p={name:'Test Customer',email:'test@example.net',consent:true,turnstileToken:'test',answers:{business:'Cafe',goal:'Leads',budget:'1000'}};
  assert.equal((await worker.fetch(req('/api/submit','POST',p,{origin:base,'CF-Connecting-IP':'192.0.2.4'}),env)).status,503);
});

test('submit protection hashes IP, counts failed Turnstile attempts, and blocks 11th in same hour', async () => {
  let hits=0;let captchaCalls=0;const keys=[];
  const env={DB:{prepare(sql){assert.match(sql,/^INSERT INTO submission_rate_limits/);return {bind(key,hour){
    keys.push(key);assert.match(key,/^[0-9a-f]{64}$/);assert.ok(Number.isSafeInteger(hour));
    return {async first(){return {attempts:++hits};}};
  }};}},TURNSTILE_SECRET:'test-secret',TURNSTILE_SITE_KEY:'site-key',SITE_ORIGIN:base,SUBMISSIONS_APPROVED:'true',RATE_LIMIT_SECRET:'a'.repeat(40)};
  const p={name:'Synthetic customer',email:'synthetic@example.net',consent:true,turnstileToken:'invalid-token',answers:{business:'Cafe',goal:'More customers',budget:'1000'}};
  let status=0;
  for(let i=0;i<11;i++){
    const r=await submit(req('/api/submit','POST',p,{origin:base,'CF-Connecting-IP':'192.0.2.15'}),env,async()=>{
      captchaCalls++;return new Response(JSON.stringify({success:false}),{status:200});
    });status=r.status;
    if(i<10)assert.equal(r.status,403);
  }
  assert.equal(status,429);
  assert.equal(captchaCalls,10);
  assert.ok(keys.every(key=>key===keys[0]));
  assert.ok(keys.every(key=>!key.includes('192.0.2.15')));
});

test('rate protection fails closed for missing client IP or failed D1 counter', async () => {
  let captchaCalls=0;
  const env={DB:{prepare(){throw Error('D1 unavailable');}},TURNSTILE_SECRET:'test-secret',TURNSTILE_SITE_KEY:'site-key',SITE_ORIGIN:base,SUBMISSIONS_APPROVED:'true',RATE_LIMIT_SECRET:'a'.repeat(40)};
  const p={name:'Synthetic',email:'synthetic@example.net',consent:true,turnstileToken:'token',answers:{business:'Cafe',goal:'More customers',budget:'1000'}};
  const mock=async()=>{captchaCalls++;return new Response(JSON.stringify({success:true}),{status:200});};
  assert.equal((await submit(req('/api/submit','POST',p,{origin:base}),env,mock)).status,503);
  assert.equal((await submit(req('/api/submit','POST',p,{origin:base,'CF-Connecting-IP':'192.0.2.5'}),env,mock)).status,503);
  assert.equal(captchaCalls,0);
});

test('reject sensitive customer name fields before Turnstile', async () => {
  let used=false;
  const env={DB:{prepare(){}},TURNSTILE_SECRET:'secret',TURNSTILE_SITE_KEY:'site',SITE_ORIGIN:base,SUBMISSIONS_APPROVED:'true',RATE_LIMIT_SECRET:'a'.repeat(40)};
  const p={name:'password: my-secret',email:'synthetic@example.net',consent:true,turnstileToken:'test',answers:{business:'Cafe',goal:'More customers',budget:'1000'}};
  const r=await submit(req('/api/submit','POST',p,{origin:base,'CF-Connecting-IP':'192.0.2.8'}),env,async()=>{used=true;});
  assert.equal(r.status,400);assert.equal(used,false);
});

test('only authenticated manager may delete a single confirmed submission', async () => {
  const token='M'.repeat(48);let deleted=0;
  const env={MANAGER_TOKEN:token,DB:{prepare(sql){assert.equal(sql,'DELETE FROM submissions WHERE id = ?');return {bind(id){assert.equal(id,'550e8400-e29b-41d4-a716-446655440000');return {async run(){deleted++;return {success:true,meta:{changes:1}};}}}}}}};
  const id='550e8400-e29b-41d4-a716-446655440000';
  const path='/api/manager/submissions/'+id;
  const request=(headers)=>new Request(base+path,{method:'DELETE',headers});
  assert.equal((await worker.fetch(request({'x-confirm-delete':'DELETE_THIS_SUBMISSION'}),env)).status,401);
  assert.equal((await worker.fetch(request({authorization:'Bearer '+token}),env)).status,400);
  const result=await worker.fetch(request({authorization:'Bearer '+token,'x-confirm-delete':'DELETE_THIS_SUBMISSION'}),env);
  assert.equal(result.status,200);assert.equal((await result.json()).deleted,true);assert.equal(deleted,1);
  assert.equal((await worker.fetch(new Request(base+'/api/manager/submissions/invalid',{method:'DELETE',headers:{authorization:'Bearer '+token,'x-confirm-delete':'DELETE_THIS_SUBMISSION'}}),env)).status,400);
});

test('confirmed manager retention prune requires a configured policy', async () => {
  const token='T'.repeat(48);const calls=[];
  const env={MANAGER_TOKEN:token,RETENTION_DAYS:'30',DB:{prepare(sql){return {bind(value){calls.push({sql,value});return {async run(){return {success:true,meta:{changes:2}};}}}}}}};
  const call=(body)=>req('/api/manager/prune','POST',body,{authorization:'Bearer '+token});
  assert.equal((await worker.fetch(call({confirm:'wrong'}),env)).status,400);
  assert.equal((await worker.fetch(call({confirm:'DELETE_EXPIRED_SUBMISSIONS'}),{...env,RETENTION_DAYS:'0'})).status,503);
  const good=await worker.fetch(call({confirm:'DELETE_EXPIRED_SUBMISSIONS'}),env);
  assert.equal(good.status,200);
  const body=await good.json();assert.equal(body.deleted_expired,2);assert.equal(body.retention_days,30);
  assert.equal(calls.length,2);assert.match(calls[0].sql,/^DELETE FROM submissions WHERE created_at/);assert.match(calls[1].sql,/^DELETE FROM submission_rate_limits WHERE window_start/);
});

test('submissions refuse non-HTTPS origin at the configuration gate', async () => {
  const env={DB:{prepare(){}},TURNSTILE_SECRET:'turnstile-secret',TURNSTILE_SITE_KEY:'site-key',SITE_ORIGIN:'http://example.workers.dev',SUBMISSIONS_APPROVED:'true',RATE_LIMIT_SECRET:'r'.repeat(40)};
  const r=await submit(req('/api/submit','POST',{},{origin:'http://example.workers.dev'}),env,async()=>{throw Error('Should not run');});
  assert.equal(r.status,503);
});


test('Turnstile validation requires correct hostname and exact form action', async () => {
  let writes = 0;
  let verifyCalls = 0;
  const env = {
    DB: { prepare(sql) {
      if (sql.startsWith('INSERT INTO submission_rate_limits')) return { bind() { return { async first() { return { attempts: 1 }; } }; } };
      if (sql.startsWith('INSERT INTO submissions')) return { bind() { return { async run() { writes++; return { success: true }; } }; } };
      throw Error('Unexpected SQL');
    } },
    TURNSTILE_SECRET: 'testing-secret', TURNSTILE_SITE_KEY: 'public-key',
    SITE_ORIGIN: base, SUBMISSIONS_APPROVED: 'true', RATE_LIMIT_SECRET: 'm'.repeat(48),
  };
  const data = { name: 'Synthetic Customer', email: 'synthetic@example.net', consent: true,
    turnstileToken: 'test-only-token', answers: { business: 'Cafe', goal: 'Customers', budget: '1000' } };
  const request = () => req('/api/submit','POST',data,{origin:base,'CF-Connecting-IP':'192.0.2.123'});
  const scenarios = [
    { success: true, hostname: 'attacker.example', action: TURNSTILE_ACTION },
    { success: true, hostname: 'example.workers.dev', action: 'unrelated_form' },
    { success: true, hostname: 'example.workers.dev' },
    { success: true, action: TURNSTILE_ACTION },
    { success: false, hostname: 'example.workers.dev', action: TURNSTILE_ACTION },
  ];
  for (const scenario of scenarios) {
    const response = await submit(request(),env,async () => {
      verifyCalls++;
      return new Response(JSON.stringify(scenario),{status:200,headers:{'content-type':'application/json'}});
    });
    assert.equal(response.status,403,JSON.stringify(scenario));
  }
  assert.equal(verifyCalls,5);
  assert.equal(writes,0);
});

test('streaming JSON parser cancels oversized bodies without buffering the full stream', async () => {
  let reads = 0;
  let canceled = false;
  const stream = new ReadableStream({
    pull(controller) {
      reads++;
      controller.enqueue(new Uint8Array(512).fill(65));
      if (reads > 1000) throw Error('Parser read too much');
    },
    cancel() { canceled = true; },
  });
  const request = new Request(base+'/api/chat',{method:'POST',headers:{'content-type':'application/json'},body:stream,duplex:'half'});
  await assert.rejects(parseBody(request,1024),err=>err.status===413);
  assert.equal(canceled,true);
  assert.ok(reads < 20,`read ${reads} chunks`);
});

test('staging intake reports unavailable when origin is malformed or DB prepare is missing', async () => {
  const valid = { DB:{prepare(){}},TURNSTILE_SECRET:'secret',TURNSTILE_SITE_KEY:'sitekey',
    SUBMISSIONS_APPROVED:'true',RATE_LIMIT_SECRET:'s'.repeat(40),SITE_ORIGIN:base };
  const a = await json(await worker.fetch(req('/api/config'),valid));
  const b = await json(await worker.fetch(req('/api/config'),{...valid,DB:{}}));
  const c = await json(await worker.fetch(req('/api/config'),{...valid,SITE_ORIGIN:'http://example.workers.dev'}));
  const d = await json(await worker.fetch(req('/api/config'),{...valid,SITE_ORIGIN:base+'/'}));
  assert.equal(a.submissions_enabled,true);
  assert.equal(b.submissions_enabled,false);
  assert.equal(c.submissions_enabled,false);
  assert.equal(d.submissions_enabled,false);
});

import developerWorker from '../workers/developer.mjs';
import managerWorker from '../workers/manager.mjs';
test('Developer is an independent Worker endpoint that cannot access Manager API', async () => {
  assert.equal((await developerWorker.fetch(req('/api/chat','POST',{answers:{business:'Cafe'}}),{})).status,200);
  assert.equal((await developerWorker.fetch(req('/api/manager/status'),{MANAGER_TOKEN:'x'.repeat(40)})).status,404);
  assert.equal((await developerWorker.fetch(req('/api/manager/submissions'),{MANAGER_TOKEN:'x'.repeat(40)})).status,404);
});
test('Manager is an independent Worker that cannot serve customer chat or submit', async () => {
  const token='x'.repeat(48);
  const withAuth = new Request(base+'/api/manager/status',{headers:{authorization:'Bearer '+token}});
  assert.equal((await managerWorker.fetch(withAuth,{MANAGER_TOKEN:token})).status,200);
  assert.equal((await managerWorker.fetch(req('/api/chat','POST',{answers:{business:'Cafe'}}),{MANAGER_TOKEN:token})).status,404);
  assert.equal((await managerWorker.fetch(req('/api/submit','POST',{}),{MANAGER_TOKEN:token})).status,404);
  assert.equal((await managerWorker.fetch(req('/'),{MANAGER_TOKEN:token})).status,404);
  assert.equal((await managerWorker.fetch(req('/api/manager/status'),{MANAGER_TOKEN:token})).status,401);
});
