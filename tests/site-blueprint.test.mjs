import assert from 'node:assert/strict';
import fs from 'node:fs';
import {planWebsiteScope} from '../workers/site-blueprint.mjs';
import {buildWebsiteStarterBundle} from '../workers/site-bundle.mjs';
import {buildPrivateAIWebsite} from '../workers/ai-website-developer.mjs';

const common={
 business:'Local accounting services',goal:'Explain our work and meet new clients',
 pages:'3–5 pages',features:'Contact form and gallery',
 style:'Classic and elegant',timeline:'Flexible'
};
const scenarios=[
 {pages:'1–2 pages',count:2},
 {pages:'3–5 pages',count:4},
 {pages:'5–7 pages',count:6},
 {pages:'8+ pages',count:8},
 {pages:'10 pages',count:8},
 {pages:'Not sure yet',count:4}
];
for(const x of scenarios){
 const a={...common,pages:x.pages};
 const plan=planWebsiteScope(a);
 const bundle=buildWebsiteStarterBundle(a);
 assert.equal(plan.draft_page_count,x.count,'Expected scope '+x.pages);
 assert.equal(bundle.pages,x.count,'Incorrect page count for '+x.pages);
 assert.equal(bundle.files.filter(f=>f.path.endsWith('.html')).length,x.count);
 assert.equal(bundle.blueprint.draft_page_count,x.count);
 assert.equal(bundle.published,false);
 assert.equal(bundle.finished_customer_website,false);
 assert.equal(bundle.deployable_without_review,false);
 assert.equal(bundle.requires_owner_approval,true);
 assert.equal(bundle.requires_customer_approval,true);
 assert.equal(bundle.advanced_integrations_connected,false);
 assert.equal(bundle.blueprint.asks_customer_for_budget,false);
 assert.equal(bundle.files.find(f=>f.path==='MAPLEWEB_OWNER_QA_CHECKLIST.txt')?.path,
  'MAPLEWEB_OWNER_QA_CHECKLIST.txt');
 for(const file of bundle.files.filter(f=>f.path.endsWith('.html'))){
  assert.ok(file.content.includes('Content-Security-Policy'));
  assert.ok(file.content.includes('noindex,nofollow'));
  assert.ok(file.content.includes('href="styles.css"'));
  assert.ok(file.content.includes('Skip to content'));
  assert.ok(file.content.includes('aria-current="page"'));
  assert.ok(file.content.toLowerCase().includes('private'));
  assert.ok(!file.content.includes('<script>'));
  assert.ok(!file.content.includes('<form'));
  assert.ok(!file.content.includes('onclick='));
  assert.ok(!file.content.includes('https://checkout'));
  const links=[...file.content.matchAll(/href="([^"]+)"/g)].map(m=>m[1]);
  const found=new Set(bundle.files.map(f=>f.path));
  for(const link of links){
   if(link.startsWith('#'))continue;
   assert.ok(found.has(link),'Broken local navigation '+file.path+' => '+link);
  }
 }
 const css=bundle.files.find(f=>f.path==='styles.css')?.content;
 assert.ok(css.includes('@media(max-width:700px)'));
 assert.ok(css.includes('@media(prefers-reduced-motion:reduce)'));
 assert.ok(css.includes(':focus-visible'));
 assert.ok(css.includes('--paper:'));
 assert.ok(css.length>1200);
}
const extra=buildWebsiteStarterBundle({...common,pages:'8+ pages'});
assert.ok(extra.files.some(f=>f.path==='process.html'));
assert.ok(extra.files.some(f=>f.path==='resources.html'));
assert.ok(extra.blueprint.scope_warnings.some(w=>w.includes('Eight draft pages')));

const themes=[
 ['Classic and elegant','classic','#f7f3ea'],
 ['Modern and minimal','modern','#f1f6f8'],
 ['Warm and welcoming','warm','#fcf5ed'],
 ['Futuristic and dark','futuristic','#0e1b24']
];
for(const [style,key,paper] of themes){
 const result=buildWebsiteStarterBundle({...common,style});
 assert.equal(result.blueprint.theme.key,key);
 assert.ok(result.files.find(f=>f.path==='styles.css').content.includes('--paper:'+paper));
}
const businessTypes=[
 ['Family café','restaurant'],
 ['Hair salon','wellness'],
 ['Online retail shop','retail'],
 ['Tax and accounting practice','professional'],
 ['Roof repair contractor','trades']
];
for(const [business,industry] of businessTypes)
 assert.equal(planWebsiteScope({...common,business}).business_type,industry);

const allFeatures={...common,
 business:'Lakeside Restaurant <script>alert("x")</script>',
 features:'Online store, online booking, contact form, payment and custom integrations',
 additional_details:'Need an appointment calendar and approved photo gallery.',
 style:'Futuristic dark with } body{background:red} <script>alert(1)</script>'
};
const advanced=buildWebsiteStarterBundle(allFeatures);
const missing=advanced.blueprint.integration_needs.map(x=>x.id);
for(const expected of ['booking','store','payments','contact_form','custom_api'])
 assert.ok(missing.includes(expected),'Missing integration disclosure: '+expected);
assert.ok(advanced.blueprint.media_needs.some(x=>x.id==='gallery_media'));
assert.ok(advanced.files.find(f=>f.path==='services.html').content.includes('proposals only'));
assert.ok(advanced.files.find(f=>f.path==='index.html').content.includes('&lt;script&gt;'));
assert.ok(!advanced.files.some(x=>x.content.includes('<script>alert')));
assert.ok(!advanced.files.find(f=>f.path==='styles.css').content.includes('background:red'));
assert.ok(!advanced.files.find(f=>f.path==='styles.css').content.includes('alert(1)'));
assert.ok(!advanced.files.find(f=>f.path==='index.html').content.includes('https://'));
assert.ok(advanced.blueprint.integration_needs.every(x=>x.status==='NOT_CONNECTED'));
assert.equal(advanced.blueprint.finished_customer_website,false);
assert.ok(advanced.files.find(f=>f.path==='MAPLEWEB_OWNER_QA_CHECKLIST.txt')
 .content.includes('CONNECT AND TEST'));
assert.ok(!JSON.stringify(advanced.blueprint).includes('"budget"'));
assert.equal(
 planWebsiteScope({...common,budget:'CAD 100000'}).draft_page_count,
 planWebsiteScope({...common,budget:'CAD 1'}).draft_page_count);

const fakeAiPages=Object.fromEntries(extra.blueprint.pages.map(p=>[
 p.path,{
  heading:'Welcome to our business',
  intro:'Explore more about our verified services and information',
  sectionHeading:'An introduction to our work',
  sectionBody:'This draft content needs approval from the real business owner.'
 }
]));
let aiCallCount=0,maxTokens=0;
const ai=await buildPrivateAIWebsite({...common,pages:'8+ pages'},{
 AUTO_BUILD_HANDOFF_APPROVED:'true',AI_DRAFTS_APPROVED:'true',
 AI_DEVELOPER_APPROVED:'true',AI:{run:async(model,prompt)=>{
  aiCallCount++;
  maxTokens=prompt.max_tokens;
  return {response:JSON.stringify({pages:fakeAiPages})};
 }}
});
assert.equal(ai.ok,true,ai.message);
assert.equal(ai.bundle.pages,8);
assert.equal(ai.bundle.published,false);
assert.equal(ai.bundle.finished_customer_website,false);
assert.equal(ai.bundle.generated_by,'cloudflare-workers-ai');
assert.equal(aiCallCount,1);
assert.ok(maxTokens>=2000,'Eight-page AI draft should have sufficient structured text token allowance');
assert.equal(ai.payment_due,false);

const planner=fs.readFileSync('public/build-with-ai.html','utf8');
assert.ok(!planner.includes('Answer 7 easy questions'), 'Public text must match the six-question flow');
console.log('PASS scope-aware 2/4/6/8-page builder, four design themes, safe pages, real integration disclosure, no budget and eight-page AI output');
