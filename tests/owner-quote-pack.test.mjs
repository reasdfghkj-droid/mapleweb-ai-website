import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {prepareOwnerQuotePack} from '../billing/owner-quote-pack.mjs';
import {handleOwnerRequest} from '../workers/owner-api.mjs';
import publicWorker from '../workers/developer.mjs';

const scenarios=[
 [{business:'Bakery',goal:'Be found online',pages:'1–2 pages',features:'Contact form',style:'Classic and elegant',timeline:'Flexible'},'simple-1-2',500,800],
 [{business:'Salon',goal:'Show services',pages:'3–5 pages',features:'Photo gallery',style:'Modern and minimal',timeline:'Flexible'},'simple-3-5',900,1500],
 [{business:'Professional',goal:'Explain services',pages:'5–7 pages',features:'Contact form',style:'Modern and minimal',timeline:'Flexible'},'professional-5-7',1500,2200],
 [{business:'Creative',goal:'Show work',pages:'3–5 pages',features:'Contact form',style:'Custom premium design',timeline:'Flexible'},'custom',2300,3000],
 [{business:'Restaurant',goal:'Get customers',pages:'3–5 pages',features:'Online booking',style:'Classic and elegant',timeline:'Flexible'},'booking',3000,4500],
 [{business:'Shop',goal:'Sell products online',pages:'3–5 pages',features:'Online store',style:'Classic and elegant',timeline:'Flexible'},'store',4500,7000]
];
for(const [answers,id,min,max] of scenarios){
 const q=prepareOwnerQuotePack({...answers,additional_details:'Customer wants simple navigation'},{});
 assert.equal(q.ok,true);
 assert.equal(q.status,'OWNER_DRAFT_NOT_SENT');
 assert.equal(q.recommended_package.id,id);
 assert.deepEqual(q.estimated_range_cad,{min,max});
 assert.equal(q.amount_not_yet_agreed,true);
 assert.equal(q.proposed_final_total_cad_cents,null);
 assert.equal(q.price_exception_needs_review,false);
 assert.equal(q.deposit_cad_cents,0);
 assert.equal(q.payment_policy,'AFTER_CONFIRMED_DELIVERY');
 assert.equal(q.customer_receives_site_before_payment,true);
 assert.equal(q.owner_review_required,true);
 assert.equal(q.customer_acceptance_required,true);
 assert.equal(q.legal_and_tax_review_required,true);
 assert.equal(q.taxes_calculated,false);
 assert.equal(q.quote_sent,false);
 assert.equal(q.invoice_created,false);
 assert.equal(q.customer_charged,false);
 assert.equal(q.site_published,false);
 assert.ok(q.draft_text.includes('No deposit and no upfront payment'));
 assert.ok(q.draft_text.includes('customer receives the completed, approved website before'));
 assert.ok(q.draft_text.includes('$'+min.toLocaleString('en-CA')));
 assert.ok(!q.draft_text.includes('What is your budget?'));
 assert.ok(q.draft_text.includes('not calculated') || q.draft_text.includes('Not calculated'));
 assert.ok(q.draft_text.includes('NOT A SIGNED CONTRACT'));
 assert.ok(q.checklist.some(x=>x.id==='signatures'&&x.complete===false));
}
const answers=scenarios[1][0];
const approved=prepareOwnerQuotePack(answers,{
 projectReference:'11111111-1111-4111-8111-111111111111',
 customerName:'Example Customer',
 approvedFinalTotalCadCents:120000,invoiceDueDays:14
});
assert.equal(approved.ok,true);
assert.equal(approved.proposed_final_total_cad_cents,120000);
assert.equal(approved.invoice_due_days,14);
assert.equal(approved.price_exception_needs_review,false);
assert.ok(approved.draft_text.includes('$1,200.00'));
assert.ok(approved.draft_text.includes('14 days'));
const outside=prepareOwnerQuotePack(answers,{approvedFinalTotalCadCents:400000,invoiceDueDays:14});
assert.equal(outside.ok,true);
assert.equal(outside.price_exception_needs_review,true);
assert.ok(outside.draft_text.includes('outside published range'));
for(const amount of [0,1,999.3,NaN,-1,10000001]){
 assert.equal(prepareOwnerQuotePack(answers,{approvedFinalTotalCadCents:amount}).ok,false);
}
for(const due of [0,-2,61,2.5,NaN]){
 assert.equal(prepareOwnerQuotePack(answers,{invoiceDueDays:due}).ok,false);
}
assert.equal(prepareOwnerQuotePack({business:'No scope'}).ok,false);
// A customer budget must NEVER influence the package.
assert.equal(prepareOwnerQuotePack({...answers,budget:'$1'}).recommended_package.id,
 prepareOwnerQuotePack({...answers,budget:'$100,000'}).recommended_package.id);

// Private API is fail-closed and can produce a draft ONLY to a valid owner token.
const pid='11111111-1111-4111-8111-111111111111';
const secret='x'.repeat(56);
const db={prepare(sql){return {bind(...args){this.args=args;return this},
  async first(){return {...answers,id:pid,status:'NEW',row_version:1,
    submission_id:'22222222-2222-4222-8222-222222222222',
    name:'Example Customer',email:'test@example.com',
    approved_final_total_cad_cents:null,invoice_due_days:null,
    answers_json:JSON.stringify(answers)}}
}},async batch(){return []}};
const req=new Request('https://private.example/api/manager/projects/'+pid+'/quote-pack',{
  headers:{Authorization:'Bearer '+secret}
});
assert.equal((await handleOwnerRequest(req,{DB:db})).status,503);
assert.equal((await handleOwnerRequest(new Request(req.url),{
 DB:db,MANAGER_API_APPROVED:'true',MANAGER_TOKEN:secret
})).status,401);
const resp=await handleOwnerRequest(req,{
 DB:db,MANAGER_API_APPROVED:'true',MANAGER_TOKEN:secret
});
assert.equal(resp.status,200);
const payload=await resp.json();
assert.equal(payload.ok,true);
assert.equal(payload.project_reference,pid);
assert.equal(payload.quote_sent,false);
assert.equal(payload.invoice_created,false);
assert.equal(payload.customer_charged,false);
assert.ok(payload.draft_text.includes('Example Customer'));
const publicResp=await publicWorker.fetch(new Request(
 'https://public.example/api/manager/projects/'+pid+'/quote-pack'
),{});
assert.equal(publicResp.status,404,'The customer Worker cannot expose quote packs');
const ui=fs.readFileSync('manager-ui/app.js','utf8');
new vm.Script(ui,{filename:'manager-ui/app.js'});
assert.ok(ui.includes("id+'/quote-pack'"));
assert.ok(!ui.includes("sendInvoice("));
console.log('PASS 6 scoped quote packages, pay-after-delivery terms, no budget, no deposits, owner-only draft, no Stripe/email');
