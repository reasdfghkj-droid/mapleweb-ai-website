import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {QUESTIONS, PRICES, recommendPrice, chat} from '../workers/mapleweb-agents.mjs';

const cases=[
 [{business:'Local cafe',goal:'Show my services',pages:'1–2 pages',features:'Contact form',style:'Classic and elegant',timeline:'Flexible'},'simple-1-2'],
 [{business:'Salon',goal:'Find more customers',pages:'3–5 pages',features:'Photo gallery',style:'Green and gold',timeline:'Flexible'},'simple-3-5'],
 [{business:'Consulting firm',goal:'Show my services',pages:'5–7 pages',features:'Contact form',style:'Modern and minimal',timeline:'1–3 months'},'professional-5-7'],
 [{business:'Architect',goal:'Find more customers',pages:'3–5 pages',features:'Photo gallery',style:'Custom premium design',timeline:'Flexible'},'custom'],
 [{business:'Restaurant',goal:'Get booking requests',pages:'1–2 pages',features:'Booking',style:'Warm and welcoming',timeline:'Within a month'},'booking'],
 [{business:'Restaurant',goal:'Find more customers',pages:'3–5 pages',features:'Online booking, Contact form',style:'Classic and elegant',timeline:'Flexible'},'booking'],
 [{business:'Shop',goal:'Sell products',pages:'3–5 pages',features:'Online store',style:'Modern and minimal',timeline:'Flexible'},'store'],
 [{business:'Retail',goal:'Sell products online',pages:'1–2 pages',features:'Contact form',style:'Classic and elegant',timeline:'Flexible'},'store'],
 [{business:'Integration project',goal:'Showcase my services',pages:'3–5 pages',features:'Custom integrations',style:'Modern and minimal',timeline:'Flexible'},'store']
];
assert.equal(QUESTIONS.length,6,'Only 6 planning questions should be asked');
assert.equal(PRICES.length,6);
assert.ok(QUESTIONS.every(q=>q.key!=='budget'&&!/budget/i.test(q.question)),
  'No server-side budget question');
const text=fs.readFileSync('public/chat-experience.js','utf8');
const sales=fs.readFileSync('public/sales.html','utf8');
const handoff=fs.readFileSync('public/customer-handoff.js','utf8');
const summary=fs.readFileSync('public/build-with-ai.html','utf8');
const worker=fs.readFileSync('workers/mapleweb-agents.mjs','utf8');
const clientMatch=text.match(/function recommendPackage\(a\)\{[\s\S]*?\n \}\n function estimateText/);
assert.ok(clientMatch,'Chat must calculate the package from requirements');
const clientFunction=clientMatch[0].slice(0,-'\n function estimateText'.length);
const tiers=[
 ['Simple 1–2 pages',500,800],['Simple 3–5 pages',900,1500],
 ['Professional 5–7 pages',1500,2200],['Professional custom design',2300,3000],
 ['Advanced booking or payment',3000,4500],['Advanced online store or integrations',4500,7000]
];
for(let i=0;i<cases.length;i++){
 const [answers,expectedId]=cases[i];
 const quote=recommendPrice(answers);
 assert.equal(quote.id,expectedId,'Wrong server recommendation case '+i);
 assert.equal(quote.preliminary,true);
 assert.equal(quote.quoted,false);
 assert.equal(quote.charged,false);
 const clientTier=vm.runInNewContext(clientFunction+'\nrecommendPackage(payload)',{payload:answers,tiers});
 assert.deepEqual([...clientTier],[quote.label,quote.min,quote.max],'Customer chat and server price disagree case '+i);
 const res=chat({answers});
 assert.equal(res.completed,true,'All 6 answered questions should finish plan');
 assert.equal(res.recommendation.id,expectedId);
 assert.ok(res.reply.includes('$'+quote.min.toLocaleString('en-CA')));
 assert.ok(res.reply.includes('CAD'));
 assert.equal(res.inquiry_submitted,false);
 const noBudget={...answers,budget:undefined};
 assert.equal(recommendPrice(noBudget).id,expectedId,'No budget should affect price');
}
for(const path of ['public/chat-experience.js','chat-experience.js','public/customer-handoff.js','customer-handoff.js']){
 const source=fs.readFileSync(path,'utf8');
 new vm.Script(source,{filename:path});
 assert.ok(!source.includes("key:'budget'"));
 assert.ok(!source.includes("['business','goal','pages','features','budget'"));
}
assert.ok(text.includes("const topics=["));
assert.ok(text.includes("estimateText()"));
assert.ok(text.includes("action('Send to Website Developer'"));
assert.ok(handoff.includes("['business','goal','pages','features','style','timeline']"));
assert.ok(handoff.includes('consent:true'));
assert.ok(handoff.includes('builder_handoff_enabled'));
assert.ok(!handoff.includes('Finish the seven planning questions'));
assert.ok(!summary.includes('Your Budget. Your Website.'));
assert.ok(sales.includes('Question 1 of 6'));
assert.ok(!sales.includes("{key:'budget'"));
assert.ok(!sales.includes("answers.budget"));
assert.ok(!worker.includes("key: 'budget'"));
assert.ok(!worker.includes('!answers.budget'));
const cfg=JSON.parse(fs.readFileSync('wrangler.jsonc','utf8'));
assert.equal(cfg.vars.SUBMISSIONS_APPROVED,'false');
assert.equal(cfg.vars.AUTO_BUILD_HANDOFF_APPROVED,'false');
assert.equal(cfg.vars.PRIVATE_PREVIEWS_APPROVED,'false');
console.log('PASS budget-free six-question pricing, nine verified package scenarios, chat/server price parity, and safe disabled real intake');
