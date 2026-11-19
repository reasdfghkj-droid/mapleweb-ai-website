import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sales=fs.readFileSync('public/sales.html','utf8');
const home=fs.readFileSync('public/index.html','utf8');
const planner=fs.readFileSync('public/build-with-ai.html','utf8');
const worker=fs.readFileSync('workers/mapleweb-agents.mjs','utf8');
const script=sales.match(/<script>([\s\S]*?)<\/script>/)?.[1];
assert.ok(script,'sales script must exist');
new vm.Script(script,{filename:'sales-inline.js'});
assert.ok(home.includes('href="/sales.html"'), 'homepage must link sales page');
assert.ok(planner.includes('href="/sales.html"'), 'planning page must link sales page');
assert.ok(sales.includes('Question 1 of 6')&&sales.includes('max="6"'), 'six-step sales flow must exist');
assert.ok(sales.includes("cfg.submissions_enabled!==true"),'fail closed when intake off');
assert.ok(sales.includes('turnstileToken'),'must verify Turnstile before sending');
assert.ok(sales.includes('consent:true'),'send only with explicit consent');
assert.ok(sales.includes('No payment or publication has been authorized.'),'clearly deny automatic payment and publishing');
assert.ok(sales.includes("textContent=row[1]"), 'input content must use safe text rendering');
assert.ok(sales.includes("configReady=false"), 'intake must default to disabled');
const expected=[
['simple-1-2',500,800],['simple-3-5',900,1500],
['professional-5-7',1500,2200],['custom',2300,3000],
['booking',3000,4500],['store',4500,7000]
];
const packs=expected.map(([id,min,max])=>({id,min,max}));
for(const [id,min,max] of expected){
assert.ok(worker.includes("id: '"+id+"'"),'missing approved worker tier '+id);
assert.ok(script.includes("id:'"+id+"'"),'missing approved sales tier '+id);
assert.ok(script.includes('min:'+min+',max:'+max), 'wrong approved range '+id);
}
const match=script.match(/function has\(feature\)\{[\s\S]*?\}\s*function getPack\(\)\{[\s\S]*?\}\s*function explainEstimate/);
assert.ok(match,'pricing recommendation logic must be available');
const helpers=match[0].slice(0,-'function explainEstimate'.length);
const scenarios=[
[{pages:'1–2 pages',features:'Contact form',goal:'Showcase my services',style:'Modern and minimal'},'simple-1-2'],
[{pages:'3–5 pages',features:'Photo gallery',goal:'Attract more customers',style:'Green and gold'},'simple-3-5'],
[{pages:'5–7 pages',features:'Contact form',goal:'Showcase my services',style:'Modern and minimal'},'professional-5-7'],
[{pages:'3–5 pages',features:'Contact form',goal:'Attract more customers',style:'Custom premium design'},'custom'],
[{pages:'1–2 pages',features:'Online booking',goal:'Attract more customers',style:'Modern and minimal'},'booking'],
[{pages:'1–2 pages',features:'Online store',goal:'Sell products online',style:'Modern and minimal'},'store'],
[{pages:'3–5 pages',features:'Custom integrations',goal:'Showcase my services',style:'Modern and minimal'},'store'],
];
for(const [answers,want] of scenarios){
const got=vm.runInNewContext(helpers+'\ngetPack().id',{answers,packs});
assert.equal(got,want, 'wrong package recommendation for '+JSON.stringify(answers));
}
assert.ok(!script.includes("{key:'budget'"), 'sales page must never ask the customer for a budget');
assert.ok(!sales.includes('What is your approximate budget'), 'budget prompt must be absent');
console.log('PASS six-step, no-budget sales wizard, seven scope recommendation scenarios, six approved CAD prices, consent and disabled-by-default intake');
