import assert from 'node:assert/strict';
import {auditFinalWebsiteFiles} from '../workers/final-site-static-audit.mjs';
import {packageFinalWebsite} from '../workers/final-site-files.mjs';
import {buildWebsiteStarterBundle} from '../workers/site-bundle.mjs';

const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Acme Services</title><link rel="stylesheet" href="assets/styles.css"></head><body><a href="#main">Skip to content</a><nav><a href="contact.html">Contact</a><a href="https://example.org/verified" rel="noopener">Provider</a></nav><main id="main"><img src="images/brand.webp" alt="Brand picture"><h1>Service introduction</h1></main></body></html>';
const contact='<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Contact Acme</title><link rel="stylesheet" href="assets/styles.css"></head><body><h1>Contact</h1><a href="mailto:hello@example.org">Email</a><a href="index.html">Home</a></body></html>';
const valid=[
 {path:'index.html',content:html},
 {path:'contact.html',content:contact},
 {path:'assets/styles.css',content:'body{background-image:url("../images/brand.webp");color:#333}'},
 {path:'images/brand.webp',data_base64:'UklGRiIAAABXRUJQVlA4ICAAAADQAQCdASoBAAEAAQAcJaQAA3AAAAAA'}
];
const checked=auditFinalWebsiteFiles(valid);
assert.equal(checked.ok,true,JSON.stringify(checked));
assert.equal(checked.checked_files,4);
assert.equal(checked.checked_html_pages,2);
assert.equal(checked.blocked_count,0);
assert.ok(checked.warning_count>=1,'External provider must be flagged for owner review');
assert.ok(checked.warnings.some(w=>w.code==='EXTERNAL_SERVICE_NEEDS_REVIEW'));
assert.equal(checked.independently_verified,false);
assert.equal(checked.ready_to_publish,false);
assert.equal(checked.functionality_verified,false);
assert.equal(checked.invoice_eligible,false);
assert.ok(!JSON.stringify(checked).includes('/verified'),'Do not echo token-bearing URL paths');
const packageResult=packageFinalWebsite(valid);
assert.equal(packageResult.ok,true);
assert.equal(packageResult.static_audit.ok,true);
assert.equal(packageResult.published,false);

const site=(target)=>valid.map(f=>f.path==='index.html'?{...f,content:target}:f);
const breakRef=(target)=>{
 const result=auditFinalWebsiteFiles(site(target));
 assert.equal(result.ok,false,JSON.stringify(result));
 return result;
};
const noCss=breakRef(html.replace('assets/styles.css','assets/missing.css'));
assert.ok(noCss.blockers.some(x=>x.code==='MISSING_LOCAL_FILE'));
assert.equal(packageFinalWebsite(site(html.replace('assets/styles.css','assets/missing.css'))).ok,false);
const missingImg=breakRef(html.replace('images/brand.webp','images/no-image.webp'));
assert.ok(missingImg.blockers.some(x=>x.code==='MISSING_LOCAL_FILE'));
const link=breakRef(html.replace('href="contact.html"','href="missing.html"'));
assert.ok(link.blockers.some(x=>x.code==='MISSING_LOCAL_FILE'));
const js=breakRef(html.replace('href="contact.html"','href="javascript:alert(1)"'));
assert.ok(js.blockers.some(x=>x.code==='UNSAFE_REFERENCE'));
const mixed=breakRef(html.replace('href="contact.html"','href="http://unsafe.example/payment"'));
assert.ok(mixed.blockers.some(x=>x.code==='UNSAFE_REFERENCE'));
const badData=breakRef(html.replace('src="images/brand.webp"','src="data:text/html,evil"'));
assert.ok(badData.blockers.some(x=>x.code==='UNSAFE_REFERENCE'));
const badForm=breakRef(html.replace('</main>','<form><input name="email"><button>Send</button></form></main>'));
assert.ok(badForm.blockers.some(x=>x.code==='UNVERIFIED_FORM'));
const misleading=breakRef(html.replace('<h1>Service introduction</h1>','<h1>Private website starter · Do not publish</h1>'));
assert.ok(misleading.blockers.some(x=>x.code==='UNFINISHED_STARTER'));
const latin=breakRef(html.replace('<h1>Service introduction</h1>','<h1>Lorem ipsum dolor sit amet</h1>'));
assert.ok(latin.blockers.some(x=>x.code==='UNFINISHED_STARTER'));
const missingCss=valid.filter(f=>f.path!=='assets/styles.css');
assert.equal(auditFinalWebsiteFiles(missingCss).ok,false);
const cssMissingAsset=valid.map(f=>f.path==='assets/styles.css'?{...f,content:'div{background:url(../images/lost.webp)}'}:f);
assert.ok(auditFinalWebsiteFiles(cssMissingAsset).blockers.some(x=>x.code==='MISSING_LOCAL_FILE'));
assert.equal(packageFinalWebsite(cssMissingAsset).ok,false);
const cssHttp=valid.map(f=>f.path==='assets/styles.css'?{...f,content:'@import "http://unsafe.example/layout.css";'}:f);
assert.ok(auditFinalWebsiteFiles(cssHttp).blockers.some(x=>x.code==='UNSAFE_REFERENCE'));
const noAlt=auditFinalWebsiteFiles(site(html.replace('alt="Brand picture"','')));
assert.equal(noAlt.ok,true);
assert.ok(noAlt.warnings.some(x=>x.code==='MISSING_IMAGE_ALT'));
const noViewport=auditFinalWebsiteFiles(site(html.replace('<meta name="viewport" content="width=device-width,initial-scale=1">','')));
assert.equal(noViewport.ok,true);
assert.ok(noViewport.warnings.some(x=>x.code==='MISSING_VIEWPORT'));
const relativeLink=auditFinalWebsiteFiles(valid.map(f=>f.path==='contact.html'?
 {...f,content:contact.replace('href="index.html"','href="./index.html"')}:f));
assert.equal(relativeLink.ok,true);

// A code-generated PRIVATE STARTER must not qualify as a final customer site.
const starter=buildWebsiteStarterBundle({
 business:'Example bakery',goal:'Show our services',
 pages:'3–5 pages',style:'Classic and elegant',
 features:'Online booking',timeline:'Flexible'
});
assert.equal(starter.published,false);
assert.equal(starter.finished_customer_website,false);
const starterAudit=auditFinalWebsiteFiles(starter.files);
assert.equal(starterAudit.ok,false);
assert.ok(starterAudit.blockers.some(x=>x.code==='UNFINISHED_STARTER'));
assert.ok(starterAudit.blockers.some(x=>x.code==='PRIVATE_DEVELOPER_FILE'));
const starterWithoutOwnerNotes=starter.files.filter(f=>f.path.endsWith('.html')||f.path==='styles.css');
assert.equal(packageFinalWebsite(starterWithoutOwnerNotes).ok,false,
 'A private draft cannot be renamed to a finished customer website');
assert.equal(packageFinalWebsite(valid).ok,true,'A real owner-supplied site remains accepted');
console.log('PASS real final-site static QA: local links, CSS assets, unsafe URLs, private-starter rejection, accessible warnings and no automatic publication');
