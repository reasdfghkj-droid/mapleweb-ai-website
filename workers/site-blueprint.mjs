/**
 * MapleWeb AI deterministic website scope planner.
 *
 * Works without AI, secrets, billing or Cloudflare account access.
 * Input is a customer-supplied BRIEF, not instructions or verified facts.
 * Output is a private plan with concrete pages, design tokens and unresolved
 * features. It does NOT represent a completed or publishable website.
 */
const text=(v,max=250)=>typeof v==='string'?
 v.replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';
const REG={
 restaurant:/\b(restauran(?:t|ts)|cafe|café|coffee|bakery|bistro|catering|food|pizza|diner)\b/i,
 wellness:/\b(salon|barber|spa|beauty|massage|wellness|nail|hair|fitness|gym|yoga)\b/i,
 retail:/\b(shop|store|retail|boutique|product|clothing|merchandise|ecommerce|e-commerce)\b/i,
 professional:/\b(account|law|legal|consult|advisor|finance|bookkeep|clinic|dentist|realtor|real estate|insurance)\b/i,
 trades:/\b(plumb|electri|renovation|landscap|cleaning|repair|contractor|roof|home service)\b/i
};
const THEMES={
 classic:{
  key:'classic',name:'Classic & Elegant',ink:'#18372c',paper:'#f7f3ea',
  panel:'#ffffff',accent:'#aa8050',dark:'#14372d',soft:'#ece2d0',
  buttonText:'#122d24',font:"Georgia,'Times New Roman',serif"
 },
 modern:{
  key:'modern',name:'Modern & Minimal',ink:'#173247',paper:'#f1f6f8',
  panel:'#ffffff',accent:'#007b83',dark:'#163a4f',soft:'#e3edf0',
  buttonText:'#ffffff',font:"system-ui,'Segoe UI',sans-serif"
 },
 warm:{
  key:'warm',name:'Warm & Welcoming',ink:'#4a2a29',paper:'#fcf5ed',
  panel:'#fffdf9',accent:'#ac6041',dark:'#633d36',soft:'#f3e4d8',
  buttonText:'#ffffff',font:"Georgia,'Times New Roman',serif"
 },
 futuristic:{
  key:'futuristic',name:'Futuristic',ink:'#e7f4f0',paper:'#0e1b24',
  panel:'#152733',accent:'#49c9b5',dark:'#071720',soft:'#203642',
  buttonText:'#071b20',font:"system-ui,'Segoe UI',sans-serif"
 }
};
const PAGE_DATA={
 'index.html':{title:'Home',heading:'A new home for your business',summary:'A clear introduction to your business, its services and the next step customers can take.'},
 'about.html':{title:'About',heading:'Our story',summary:'Add verified details about the business, its people and what makes it different.'},
 'services.html':{title:'Services',heading:'What we offer',summary:'Present your actual services and explain their benefits. Confirm any prices and conditions before publication.'},
 'gallery.html':{title:'Gallery',heading:'Our work',summary:'Replace the private placeholders with approved images of your real work and business.'},
 'faq.html':{title:'FAQ',heading:'Common questions',summary:'Add verified answers about service areas, availability, policies and how customers can get help.'},
 'contact.html':{title:'Contact',heading:'Get in touch',summary:'Add verified contact details and a tested, privacy-compliant way for customers to reach you.'},
 'process.html':{title:'How It Works',heading:'How we work',summary:'Explain actual steps, timelines and expectations only after the business confirms them.'},
 'resources.html':{title:'Resources',heading:'Helpful resources',summary:'Publish approved guides and resources relevant to customers; do not invent claims or quotations.'}
};
const pageSets={
 2:['index.html','contact.html'],
 4:['index.html','about.html','services.html','contact.html'],
 6:['index.html','about.html','services.html','gallery.html','faq.html','contact.html'],
 8:['index.html','about.html','services.html','gallery.html','process.html','faq.html','resources.html','contact.html']
};
function choosePageCount(answer){
 const s=text(answer,150).toLowerCase();
 if(/\b(?:8\s*\+|8\s*or\s*more|more\s*than\s*7|8\s*pages|9\s*pages|10\s*pages)\b/i.test(s))return 8;
 if(/\b(?:5\s*[–-]\s*7|6\s*pages|7\s*pages)\b/i.test(s))return 6;
 if(/\b(?:1\s*[–-]\s*2|1\s*page|2\s*pages)\b/i.test(s))return 2;
 return 4;
}
function chooseTheme(style){
 const v=text(style,200).toLowerCase();
 if(/futur|dark|cyber|tech|digital|neon/.test(v))return THEMES.futuristic;
 if(/modern|minimal|clean|bright|simple/.test(v))return THEMES.modern;
 if(/warm|friendly|welcom|earth|natural|cozy|cosy/.test(v))return THEMES.warm;
 return THEMES.classic;
}
function chooseIndustry(business){
 const v=text(business,250);
 for(const [type,test] of Object.entries(REG)){if(test.test(v))return type;}
 return 'general';
}
const integrations=[
 {id:'booking',rx:/\b(booking|appointment|reservation|calendar|scheduling|schedule)\b/i,
  title:'Online booking',steps:'Choose an approved booking platform, configure business availability, notifications, cancellation policies and test real booking requests.'},
 {id:'store',rx:/\b(online\s+(store|shop)|e-commerce|ecommerce|cart|checkout|sell products|selling products|inventory)\b/i,
  title:'Online store and checkout',steps:'Configure real products, inventory, taxes, shipping, checkout, returns and verified payment processing. Never fake a checkout.'},
 {id:'payments',rx:/\b(payment|pay online|deposit|stripe|subscription|billing)\b/i,
  title:'Customer payment collection',steps:'Owner must approve a secure payment provider and test tax, consent, refunds and live payment flows. MapleWeb website development payments are separate.'},
 {id:'contact_form',rx:/\b(contact form|enquiry form|inquiry form|lead form|quote form|submit message)\b/i,
  title:'Working contact form',steps:'Connect a verified email or CRM backend with consent, spam controls, data retention and delivery testing.'},
 {id:'members',rx:/\b(login|sign\s*in|account|membership|member portal|user portal)\b/i,
  title:'User accounts',steps:'Implement real authentication, protected data storage, account recovery, access controls and security reviews.'},
 {id:'custom_api',rx:/\b(integration|api|crm|database sync|third.party)\b/i,
  title:'External service integrations',steps:'List each third-party service, verify credentials and permissions, and test failures and data privacy.'},
 {id:'cms',rx:/\b(blog|content management|cms|news updates)\b/i,
  title:'Editable content or blog',steps:'Select and secure a content management system and confirm editing permissions, backups and publishing rules.'}
];
const media=[
 {id:'gallery_media',rx:/\b(gallery|photo|picture|portfolio|image|video)\b/i,
  title:'Licensed images and media',steps:'Obtain real approved assets and written permission before publishing.'},
 {id:'contact_details',rx:/(?:)/,title:'Verified contact details',steps:'Verify actual business email, phone, address, service hours and service area. Never invent them.'}
];

export function planWebsiteScope(raw={}) {
 const input=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 const a={
  business:text(input.business,200),
  goal:text(input.goal,400),
  pages:text(input.pages,140),
  features:text(input.features,450),
  style:text(input.style,200),
  timeline:text(input.timeline,150),
  additional_details:text(input.additional_details,900)
 };
 if(!a.business||!a.goal)throw new Error('Business and goal are required');
 const requested=a.pages||'Not sure yet';
 const count=choosePageCount(requested);
 const selected=pageSets[count];
 const industry=chooseIndustry(a.business);
 const theme=chooseTheme(a.style);
 const featuresText=[a.goal,a.features,a.additional_details].join(' ');
 const integrationNeeds=integrations.filter(x=>x.rx.test(featuresText)).map(x=>({
  id:x.id,title:x.title,status:'NOT_CONNECTED',owner_action:x.steps
 }));
 const mediaNeeds=media.filter(x=>x.id==='contact_details'||x.rx.test(featuresText)).map(x=>({
  id:x.id,title:x.title,status:'NEEDS_VERIFIED_INPUT',owner_action:x.steps
 }));
 const scopeWarnings=[
  'Private website draft only; no customer website has been published or delivered.',
  'Business facts, services, media, licensing, accessibility and local compliance require review.',
  'A price estimate is not a final accepted contract; the final scope and CAD price need written agreement.',
  'No payment or deposit is collected before completed website delivery.'
 ];
 if(/not sure|unsure|don.t know/i.test(requested))
  scopeWarnings.push('Page count was not decided. Four starter pages were prepared; owner and customer must agree on final number.');
 if(count===8)
  scopeWarnings.push('Eight draft pages were prepared. Larger bespoke sites may require more pages after owner scoping.');
 if(integrationNeeds.length)
  scopeWarnings.push('Requested live features require separate secure integrations; no live forms, bookings, checkout, login or APIs are connected.');
 const contentPlan=selected.map((file,index)=>({
  path:file,title:PAGE_DATA[file].title,
  heading:PAGE_DATA[file].heading,
  summary:PAGE_DATA[file].summary,
  order:index+1,
  draft_only:true
 }));
 return {
  schema_version:1,kind:'mapleweb-owner-website-blueprint',
  business_type:industry,requested_page_answer:requested,
  draft_page_count:count,pages:contentPlan,
  theme:{...theme},integration_needs:integrationNeeds,media_needs:mediaNeeds,
  scope_warnings:scopeWarnings,
  requested_features:a.features,
  design_preference:a.style,
  requires_owner_review:true,requires_customer_approval:true,
  features_verified:false,real_contact_details_verified:false,
  advanced_integrations_connected:false,
  finished_customer_website:false,published:false,
  invoice_created:false,customer_charged:false,
  asks_customer_for_budget:false
 };
}
