/**
 * MapleWeb AI: downloadable starter site builder.
 * Produces reviewable local HTML/CSS assets, never uploads or publishes them.
 * Advanced bookings, checkout and e-commerce are clearly placeholders.
 */
const keys=['business','goal','pages','features','budget','style','timeline'];
const txt=(v,max=200)=>typeof v==='string'?v.trim().slice(0,max):'';
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function clean(raw) {
 const r=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
 return Object.fromEntries(keys.map(k=>[k,txt(r[k])]));
}
function pagesFor(a) {
  const pageChoice=a.pages.toLowerCase();
  if(/1\s*[–-]\s*2/.test(pageChoice))return ['index.html','contact.html'];
  if(/5\s*[–-]\s*7|8\+/.test(pageChoice))
    return ['index.html','about.html','services.html','gallery.html','faq.html','contact.html'];
  return ['index.html','about.html','services.html','contact.html'];
}
const titles={
 'index.html':'Home','about.html':'About',
 'services.html':'Services','gallery.html':'Gallery','faq.html':'FAQ','contact.html':'Contact'
};
const contents={
 'about.html':{h:'About our business',p:'Learn about our team, values and the people we serve. Replace this sample text with verified business information.'},
 'services.html':{h:'Our services',p:'Describe each service or product here. Confirm prices, terms and availability before publishing.'},
 'gallery.html':{h:'Explore our work',p:'Add images you own or have permission to use. No fake portfolio projects or reviews are included.'},
 'faq.html':{h:'Questions and answers',p:'Add truthful answers about your hours, service area, policies, accessibility and typical projects.'},
 'contact.html':{h:'Get in touch',p:'Add a verified business email, phone, hours and location before publishing. Contact forms are not activated in this starter kit.'}
};
function makePage(filename,files,a) {
 const nav=files.map(p=>'<a href="'+p+'">'+escape(titles[p])+'</a>').join('');
 const brand=escape(a.business),label=escape(titles[filename]);
 const h=filename==='index.html'?'Welcome to '+brand:contents[filename].h;
 const intro=filename==='index.html'?escape(a.goal):escape(contents[filename].p);
 let optional='';
 if(filename==='services.html'&&a.features){
   optional='<section><h2>Planned features</h2><p>'+escape(a.features)+'</p></section>';
   if(/booking|payment|online store|shop|integrat/i.test(a.features))
     optional+='<p class="notice">Bookings, payments, online shopping and integrations are proposals only. They require real integrations, independent testing, and customer approval before going live.</p>';
 }
 if(filename==='contact.html')optional+='<p class="notice">No contact form or payment collection is active in this starter template.</p>';
 const content='<!doctype html><html lang="en"><head><meta charset="utf-8">'+
   '<meta name="viewport" content="width=device-width,initial-scale=1">'+
   '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;self&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;">'+
   '<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">'+
   '<title>'+label+' — '+brand+' (private draft)</title><link rel="stylesheet" href="styles.css"></head>'+
   '<body><a class="skip" href="#main">Skip to content</a>'+
   '<header><div class="shell"><strong class="brand">✦ '+brand+'</strong><nav aria-label="Main navigation">'+nav+'</nav></div></header>'+
   '<main class="shell" id="main"><span class="eyebrow">Private website starter · '+label+'</span>'+
   '<h1>'+h+'</h1><p class="intro">'+intro+'</p>'+
   '<section><h2>Built around your goals</h2><p>'+escape(a.goal)+'</p></section>'+optional+
   '<aside class="notice">Draft for customer review only. Replace all sample copy and verify features, privacy, contacts, and compliance before publication.</aside>'+
   '</main><footer><div class="shell">✦ '+brand+' · Private concept · Not published</div></footer></body></html>';
 return {path:filename,content};
}
const style='*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:#f9f6ef;color:#15392c;font:16px/1.65 system-ui,Arial,sans-serif}.shell{width:min(1000px,calc(100% - 40px));margin:auto}header,footer{background:#16392f;color:#f9deb1}header{padding:23px 0}header .shell{display:flex;justify-content:space-between;align-items:center;gap:25px;flex-wrap:wrap}.brand{font:700 1.35rem Georgia,serif}nav{display:flex;gap:13px;flex-wrap:wrap}nav a{color:#f4e3bc;text-decoration:none;font-size:.92rem;font-weight:650}nav a:hover{text-decoration:underline}.skip{position:absolute;left:-9999px}.skip:focus{left:12px;top:8px;background:#fff;padding:6px}main{padding:80px 0 100px}.eyebrow{text-transform:uppercase;letter-spacing:.14em;font-size:.73rem;color:#8d683a;font-weight:800}h1{font:400 clamp(2.4rem,7vw,4.8rem)/1.07 Georgia,serif;margin:20px 0}h2{font:400 1.65rem Georgia,serif}.intro{max-width:800px;font-size:1.17rem}section{background:white;border:1px solid #e1ccaa;border-radius:15px;padding:24px;margin:25px 0}.notice{border-left:4px solid #a17a3c;padding:12px 16px;background:#efe6d4;margin-top:35px;font-size:.92rem}footer{padding:24px 0;font-size:.85rem}@media(max-width:680px){main{padding:45px 0 65px}header{padding:18px 0}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}';

export function buildWebsiteStarterBundle(raw) {
 const a=clean(raw);
 if(!a.business||!a.goal)throw new Error('Business and goal are required');
 const files=pagesFor(a);
 return {
   kind:'mapleweb-private-website-source-bundle',
   generated_by:'fixed-template',
   published:false,deployable_without_review:false,
   requires_customer_approval:true,requires_owner_approval:true,
   advanced_integrations_connected:false,
   pages:files.length,
   files:[...files.map(p=>makePage(p,files,a)),{path:'styles.css',content:style}],
   instructions:'These are sample pages, not a complete contracted customer site. Save HTML and CSS into one directory, replace placeholder text, implement requested features, test, and obtain customer and owner approval before publishing.'
 };
}
