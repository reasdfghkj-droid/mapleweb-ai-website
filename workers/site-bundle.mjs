import {planWebsiteScope} from './site-blueprint.mjs';
/**
 * MapleWeb AI: downloadable starter site builder.
 * Produces reviewable local HTML/CSS assets, never uploads or publishes them.
 * Advanced bookings, checkout and e-commerce are clearly placeholders.
 */
const keys=['business','goal','pages','features','style','timeline'];
const txt=(v,max=200)=>typeof v==='string'?v.trim().slice(0,max):'';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function clean(raw) {
 const r=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 const cleaned=Object.fromEntries(keys.map(k=>[k,txt(r[k])]));
 cleaned.additional_details=txt(r.additional_details,900);
 return cleaned;
}
function pagesFor(a) {
 return planWebsiteScope(a).pages.map(p=>p.path);
}
const titles={
 'index.html':'Home','about.html':'About',
 'services.html':'Services','gallery.html':'Gallery','faq.html':'FAQ','contact.html':'Contact',
 'process.html':'How It Works','resources.html':'Resources'
};
const contents={
 'about.html':{h:'About our business',p:'Learn about our team, values and the people we serve. Replace this sample text with verified business information.'},
 'services.html':{h:'Our services',p:'Describe each service or product here. Confirm prices, terms and availability before publishing.'},
 'gallery.html':{h:'Explore our work',p:'Add images you own or have permission to use. No fake portfolio projects or reviews are included.'},
 'faq.html':{h:'Questions and answers',p:'Add truthful answers about your hours, service area, policies, accessibility and typical projects.'},
 'contact.html':{h:'Get in touch',p:'Add a verified business email, phone, hours and location before publishing. Contact forms are not activated in this starter kit.'},
 'process.html':{h:'How we work',p:'Describe your real process and timelines after checking them with the owner.'},
 'resources.html':{h:'Helpful resources',p:'Add accurate, approved resources, guides and support information.'}
};
function makePage(filename,files,a,custom={}) {
 const nav=files.map(p=>'<a href="'+p+'"'+(p===filename?' aria-current="page"':'')+'>'+escape(titles[p])+'</a>').join('');
 const brand=escape(a.business),label=escape(titles[filename]);
 const safe=(key,max=230)=>typeof custom[key]==='string'?custom[key].trim().slice(0,max):'';
 const h=safe('heading')?escape(safe('heading')):filename==='index.html'?'Welcome to '+brand:escape(contents[filename].h);
 const intro=safe('intro',400)?escape(safe('intro',400)):filename==='index.html'?escape(a.goal):escape(contents[filename].p);
 const sectionHeading=escape(safe('sectionHeading',140)||'Built around your goals');
 const sectionBody=escape(safe('sectionBody',350)||a.goal);
 let optional='';
 if(filename==='services.html'&&a.features){
   optional='<section><h2>Planned features</h2><p>'+escape(a.features)+'</p></section>';
   if(/booking|payment|online store|shop|integrat/i.test(a.features))
     optional+='<p class="notice">Bookings, payments, online shopping and integrations are proposals only. They require real integrations, independent testing, and customer approval before going live.</p>';
 }
 if(filename==='contact.html')optional+='<p class="notice">No contact form or payment collection is active in this starter template.</p>';
 if(filename==='index.html')optional+='<section class="feature-grid" aria-label="Website plan overview"><article><h2>Professional design</h2><p>Built around verified business information and customer needs.</p></article><article><h2>Responsive pages</h2><p>Layout adapts to phones, tablets and larger screens.</p></article><article><h2>Clear next steps</h2><p>Actual forms, booking and payment links need separate setup and testing.</p></article></section>';
 if(filename==='gallery.html')optional+='<section aria-label="Gallery placeholders"><h2>Approved images go here</h2><div class="gallery-grid"><div role="img" aria-label="Placeholder for first approved business image">Image placeholder 1</div><div role="img" aria-label="Placeholder for second approved business image">Image placeholder 2</div><div role="img" aria-label="Placeholder for third approved business image">Image placeholder 3</div></div></section>';
 if(filename==='faq.html')optional+='<details><summary>What services are offered?</summary><p>Add verified details about actual services and availability before publishing.</p></details><details><summary>How do I contact the business?</summary><p>Provide a verified contact method from the owner.</p></details>';
 if(filename==='process.html')optional+='<section><h2>How it works</h2><p>Confirm the real consultation, service and follow-up steps before publication.</p></section>';
 if(filename==='resources.html')optional+='<section><h2>Resources for customers</h2><p>Add accurate, approved guidance and links only after ownership and accuracy checks.</p></section>';
 const content='<!doctype html><html lang="en"><head><meta charset="utf-8">'+
   '<meta name="viewport" content="width=device-width,initial-scale=1">'+
   '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;self&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;">'+
   '<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">'+
   '<title>'+label+' — '+brand+' (private draft)</title><link rel="stylesheet" href="styles.css"></head>'+
   '<body><a class="skip" href="#main">Skip to content</a>'+
   '<header><div class="shell"><strong class="brand">✦ '+brand+'</strong><nav aria-label="Main navigation">'+nav+'</nav></div></header>'+
   '<main class="shell" id="main"><div class="hero"><span class="eyebrow">Private website starter · '+label+'</span>'+
   '<h1>'+h+'</h1><p class="intro">'+intro+'</p><div class="actions"><a class="cta-link" href="'+(filename==='contact.html'?'index.html':'contact.html')+'">'+(filename==='contact.html'?'Explore our website':'View contact information')+'</a></div></div>'+
   '<section><h2>'+sectionHeading+'</h2><p>'+sectionBody+'</p></section>'+optional+
   '<aside class="notice">Draft for customer review only. Replace all sample copy and verify features, privacy, contacts, and compliance before publication.</aside>'+
   '</main><footer><div class="shell">✦ '+brand+' · Private concept · Not published</div></footer></body></html>';
 return {path:filename,content};
}
const style='*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f9f6ef;color:#15392c;font:16px/1.65 system-ui,Arial,sans-serif}.shell{width:min(1000px,calc(100% - 40px));margin:auto}header,footer{background:#16392f;color:#f9deb1}header{padding:23px 0}header .shell{display:flex;justify-content:space-between;align-items:center;gap:25px;flex-wrap:wrap}.brand{font:700 1.35rem Georgia,serif}nav{display:flex;gap:13px;flex-wrap:wrap}nav a{color:#f4e3bc;text-decoration:none;font-size:.92rem;font-weight:650}nav a:hover{text-decoration:underline}.skip{position:absolute;left:-9999px}.skip:focus{left:12px;top:8px;background:#fff;padding:6px}main{padding:80px 0 100px}.eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:.73rem;color:#8d683a;font-weight:800}h1{font:400 clamp(2.4rem,7vw,4.8rem)/1.07 Georgia,serif;margin:20px 0}h2{font:400 1.65rem Georgia,serif}.intro{max-width:800px;font-size:1.17rem}section{background:white;border:1px solid #e1ccaa;border-radius:15px;padding:24px;margin:25px 0}.notice{border-left:4px solid #a17a3c;padding:12px 16px;background:#efe6d4;margin-top:35px;font-size:.92rem}footer{padding:24px 0;font-size:.85rem}@media(max-width:680px){main{padding:45px 0 65px}header{padding:18px 0}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}';


const premiumStyle=':root{--paper:#f8f5ee;--ink:#173a30;--panel:#ffffff;--accent:#a9814b;--header:#16392f;--heading-font:Georgia,serif}body{background:var(--paper);color:var(--ink)}header,footer{background:var(--header)}section{background:var(--panel);border-color:var(--accent)}.shell{width:min(1120px,calc(100% - 38px))}.hero{background:radial-gradient(circle at 92% 10%,#e8dac4,transparent 60%);padding:38px 0 45px;border-radius:16px}.hero h1{max-width:840px}h1,h2{font-family:var(--heading-font)}nav a[aria-current=page]{text-decoration:underline;text-decoration-color:#e7bc7c;text-underline-offset:7px}.actions{display:flex;gap:12px;margin:25px 0}.cta-link{display:inline-block;background:var(--accent);color:#11251d;text-decoration:none;padding:11px 18px;border-radius:9px;font-weight:800;min-height:44px}.feature-grid,.gallery-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:17px;margin:24px 0}.feature-grid article{border:1px solid var(--accent);padding:19px;border-radius:12px;background:var(--panel)}.feature-grid h2{font-size:1.16rem}.feature-grid p{margin:0}.gallery-grid div{aspect-ratio:4/3;border:2px dashed var(--accent);background:linear-gradient(145deg,#eee5d3,var(--panel));border-radius:14px;display:flex;align-items:center;justify-content:center;padding:20px;text-align:center;font-weight:700}details{border:1px solid var(--accent);background:var(--panel);border-radius:11px;padding:17px;margin:15px 0}summary{font-weight:800;cursor:pointer}@media(max-width:700px){.feature-grid,.gallery-grid{grid-template-columns:1fr 1fr}.hero{padding:25px 0}}@media(max-width:480px){.feature-grid,.gallery-grid{grid-template-columns:1fr}}';
function designCss(theme) {
 // Values are strictly preselected by the scope planner. Customer/AI text
 // must never be interpolated into HTML attributes or CSS.
 return ':root{--paper:'+theme.paper+';--ink:'+theme.ink+
   ';--panel:'+theme.panel+';--accent:'+theme.accent+';--header:'+
   theme.dark+';--heading-font:'+theme.font+'}';
}

export function buildWebsiteStarterBundle(raw, options={}) {
 // Optional AI copy is safe DATA, never code, and is escaped in every page.
 // Only the private owner-approved Developer Agent may request AI generation.
 const o=options&&typeof options==='object'&&!Array.isArray(options)?options:{};
 const pageCopy=o.pageCopy&&typeof o.pageCopy==='object'&&!Array.isArray(o.pageCopy)?o.pageCopy:{};
 const generatedBy=o.generatedBy==='cloudflare-workers-ai'?'cloudflare-workers-ai':'fixed-template';
 const a=clean(raw);
 if(!a.business||!a.goal)throw new Error('Business and goal are required');
 const blueprint=planWebsiteScope(a);
 const files=pagesFor(a);
 const review='PRIVATE OWNER QA CHECKLIST — NOT A CUSTOMER WEBSITE\n'+
  'Pages planned: '+files.length+'\nDesign: '+blueprint.theme.name+'\n'+
  files.map(p=>'[ ] Verify '+p+' content, navigation, mobile and accessibility').join('\n')+'\n'+
  blueprint.integration_needs.map(i=>'[ ] CONNECT AND TEST '+i.title+': '+i.owner_action).join('\n')+'\n'+
  blueprint.media_needs.map(i=>'[ ] VERIFY '+i.title+': '+i.owner_action).join('\n')+'\n'+
  '[ ] Confirm real contact information, privacy, media rights, full website QA, owner and customer approval.\n'+
  '[ ] Deliver the finished website before requesting any payment.\n';
 return {
   kind:'mapleweb-private-website-source-bundle',
   schema_version:2,blueprint,finished_customer_website:false,
   generated_by:generatedBy,
   requires_factual_review:true,
   published:false,deployable_without_review:false,
   requires_customer_approval:true,requires_owner_approval:true,
   advanced_integrations_connected:false,
   pages:files.length,
   files:[...files.map(p=>makePage(p,files,a,pageCopy[p])),{path:'styles.css',content:style+'\n'+premiumStyle+'\n'+designCss(blueprint.theme)},
     {path:'MAPLEWEB_PRIVATE_BRIEF.txt',content:
       'OWNER REVIEW COPY - DO NOT PUBLISH\n\n'+
       keys.map(k=>k+': '+escape(a[k])).join('\n')+
       '\nAdditional instructions: '+escape(a.additional_details||'None')+
       '\n\nCustomer contact details are stored separately in the protected project record.'},
     {path:'MAPLEWEB_OWNER_QA_CHECKLIST.txt',content:review}],
   instructions:'These are sample pages, not a complete contracted customer site. Save HTML and CSS into one directory, replace placeholder text, implement requested features, test, and obtain customer and owner approval before publishing.'
 };
}
