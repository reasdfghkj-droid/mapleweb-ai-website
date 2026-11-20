/**
 * MapleWeb AI static final-site QA (zero external services).
 *
 * Blocks obvious broken local file references, unsafe direct link schemes,
 * and uploading MapleWeb's private starter as a delivered customer site.
 * It is deliberately NOT a malware scanner, website hosting test, independent
 * security audit, accessibility certification or proof that features work.
 */
const filesRx=/\.(?:html|css|js|json|txt|svg|png|jpe?g|webp|ico)$/i;
const MAX=50;
const problem=(code,file,detail)=>({
 code,file:String(file||'').slice(0,160),detail:String(detail||'').slice(0,180)
});
const lookupPath=(current,value)=>{
 const v=String(value||'').trim().replace(/&amp;/g,'&');
 if(!v||v.startsWith('#')||v.startsWith('?'))return {ignore:true};
 if(/^(?:mailto|tel):/i.test(v))return {ignore:true};
 if(/^https?:\/\//i.test(v)||v.startsWith('//'))return {external:true};
 if(/^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,/i.test(v))
  return {ignore:true};
 if(/^[a-z][a-z\d+.-]*:/i.test(v))
  return {unsafe:true};
 if(v.includes('\\')||/%(?:2f|5c|00)/i.test(v))
  return {unsafe:true};
 const path=v.split(/[?#]/,1)[0];
 if(!path)return {ignore:true};
 let decoded;
 try{decoded=decodeURIComponent(path)}catch{return {unsafe:true};}
 if(decoded.includes('\\')||decoded.includes('\0'))return {unsafe:true};
 const chunks=decoded.startsWith('/')?[]:current.split('/').slice(0,-1);
 for(const part of decoded.split('/')){
  if(!part||part==='.')continue;
  if(part==='..'){
   if(!chunks.length)return {unsafe:true};
   chunks.pop();continue;
  }
  if(/^[.]/.test(part))return {unsafe:true};
  chunks.push(part);
 }
 if(!chunks.length||decoded.endsWith('/'))chunks.push('index.html');
 const result=chunks.join('/');
 if(!filesRx.test(result))return {unknownRoute:result};
 return {path:result};
};
const add=(arr,code,file,detail)=>{if(arr.length<MAX)arr.push(problem(code,file,detail));};
const badMarkers=[
 /private website starter/i,
 /private website draft/i,
 /private concept\b/i,
 /draft for customer review only/i,
 /no contact form or payment collection is active in this starter/i,
 /replace all sample copy/i,
 /unpublished sample/i,
 /image placeholder\s*\d/i,
 /\blorem ipsum\b/i
];
function inspectReference(from,value,paths,blockers,warnings,kind){
 const resolved=lookupPath(from,value);
 if(resolved.ignore)return;
 if(resolved.unsafe){
  add(blockers,'UNSAFE_REFERENCE',from,kind+' uses an unsafe or unsupported URL');
  return;
 }
 if(resolved.external){
  add(warnings,'EXTERNAL_SERVICE_NEEDS_REVIEW',from,kind+' points outside this website: '+value.slice(0,85));
  return;
 }
 if(resolved.unknownRoute){
  add(warnings,'UNVERIFIED_DYNAMIC_ROUTE',from,kind+' needs hosting rewrites or a backend: '+resolved.unknownRoute);
  return;
 }
 if(!paths.has(resolved.path.toLowerCase()))
  add(blockers,'MISSING_LOCAL_FILE',from,kind+' points to missing file '+resolved.path);
}
/**
 * Static checks only; returning ok=true is NOT a safety or publication approval.
 * HTML is treated as untrusted SOURCE TEXT. No scripts are executed.
 */
export function auditFinalWebsiteFiles(files){
 const blockers=[],warnings=[];
 if(!Array.isArray(files)||files.length<1||files.length>60)
  return {ok:false,checked_files:0,blocked:[problem('INVALID_BUNDLE','','Invalid file list')],
   warnings:[],independently_verified:false,ready_to_publish:false};
 const paths=new Set();
 for(const f of files){
  const path=f?.path;
  if(typeof path!=='string'||path.length>160||!filesRx.test(path)||
     path.includes('\\')||path.startsWith('/')||
     path.split('/').some(part=>!part||part==='.'||part==='..'||part.startsWith('.'))){
   add(blockers,'INVALID_FILENAME',path,'Unsupported or unsafe path');
   continue;
  }
  if(paths.has(path.toLowerCase()))add(blockers,'DUPLICATE_FILENAME',path,'Duplicate (case-insensitive) website filename');
  paths.add(path.toLowerCase());
 }
 if(!paths.has('index.html'))
  add(blockers,'MISSING_HOMEPAGE','index.html','Completed website requires a root index.html');
 let htmlCount=0;
 for(const f of files){
  const path=f?.path;
  if(typeof path!=='string'||typeof f.content!=='string')continue;
  if(/^MAPLEWEB_PRIVATE_BRIEF\.txt$/i.test(path)||/^MAPLEWEB_OWNER_QA_CHECKLIST\.txt$/i.test(path)){
   add(blockers,'PRIVATE_DEVELOPER_FILE',path,'Remove the internal MapleWeb project/QA notes from customer website files');
  }
  if(/\.html$/i.test(path)){
   htmlCount++;
   const c=f.content;
   if(!/<html(?:\s|>)/i.test(c)||!/<body(?:\s|>)/i.test(c))
    add(blockers,'NOT_AN_HTML_PAGE',path,'Missing html or body element');
   if(badMarkers.some(rx=>rx.test(c)))
    add(blockers,'UNFINISHED_STARTER',path,'This still contains draft, starter, placeholder or private concept text');
   if(!/<html\b[^>]*\blang\s*=/i.test(c))
    add(warnings,'MISSING_LANGUAGE',path,'Specify the language on the html element');
   if(!/<title\b[^>]*>\s*\S[\s\S]*?<\/title>/i.test(c))
    add(warnings,'MISSING_TITLE',path,'Provide a relevant page title');
   if(!/<meta\b[^>]*\bname\s*=\s*["']viewport["']/i.test(c))
    add(warnings,'MISSING_VIEWPORT',path,'Include the responsive viewport meta tag');
   if(/<form\b/i.test(c)&&!/<form\b[^>]*\baction\s*=\s*["']https:\/\//i.test(c))
    add(blockers,'UNVERIFIED_FORM',path,'A form needs an approved and tested secure backend before delivery');
   if(/on(?:click|error|load|submit|mouseover|focus)\s*=/i.test(c))
    add(warnings,'INLINE_EVENT_HANDLER',path,'Review inline event handlers and script security');
   const markup=c.replace(/<!--[\s\S]*?-->/g,'');
   const tags=markup.match(/<[a-z][^>]{0,1800}>/gi)||[];
   for(const tag of tags){
    const kind=(tag.match(/^<([a-z]+)/i)||[])[1]?.toLowerCase()||'tag';
    if(kind==='img'&&!/\balt\s*=/i.test(tag))
     add(warnings,'MISSING_IMAGE_ALT',path,'Add useful alt text or alt="" for decorative images');
    for(const attr of tag.matchAll(/\b(href|src|poster|action)\s*=\s*(["'])(.*?)\2/gi))
     inspectReference(path,attr[3],paths,blockers,warnings,kind+' '+attr[1]);
    if(/\b(?:href|src|action)\s*=\s*(?!["'])/i.test(tag))
     add(warnings,'UNQUOTED_URL_ATTRIBUTE',path,'Quote URL attributes and verify link safety');
   }
  }
  if(/\.css$/i.test(path)){
   for(const match of f.content.matchAll(/\burl\(\s*['"]?([^)'"]+)['"]?\s*\)/gi))
    inspectReference(path,match[1].trim(),paths,blockers,warnings,'CSS url()');
   for(const match of f.content.matchAll(/@import\s+["']([^"']+)["']/gi))
    inspectReference(path,match[1],paths,blockers,warnings,'CSS @import');
  }
 }
 if(htmlCount===0)add(blockers,'NO_HTML_FILES','','No HTML pages provided');
 return {
  ok:blockers.length===0,
  checked_files:files.length,checked_html_pages:htmlCount,
  blockers,warnings,
  blocked_count:blockers.length,warning_count:warnings.length,
  static_checks_only:true,independently_verified:false,
  functionality_verified:false,customer_approved:false,
  ready_to_publish:false,invoice_eligible:false
 };
}
