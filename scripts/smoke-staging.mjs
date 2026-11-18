/** Read-only staging checks; synthetic API request drafts are never saved or published. */
const target=process.argv[2];
if(!target || !/^https:\/\//.test(target)) {
  console.error('Usage: node scripts/smoke-staging.mjs https://YOUR-STAGING.workers.dev');
  process.exit(2);
}
const base=new URL(target);
if (!base.hostname.endsWith('.workers.dev') && !base.hostname.endsWith('.pages.dev')) {
 console.error('Refusing to probe a non-staging domain without explicit code review.');
 process.exit(2);
}
if (base.pathname!=='/' || base.search || base.hash) { console.error('Pass only the staging origin.'); process.exit(2); }
let failed=false;
async function check(name,callback){try{const ok=await callback();console.log(`${ok?'PASS':'FAIL'} ${name}`);if(!ok)failed=true;}catch(e){failed=true;console.error('FAIL',name,String(e.message||e));}}
for(const [path,checkFn] of [
 ['/health',body=>body.status==='ok' && body.ai_model_connected===false],
 ['/api/prices',body=>body.prices?.length===6 && body.currency==='CAD'],
 ['/api/config',body=>body.publishing_enabled===false && body.submissions_enabled===false && body.ai_model_connected===false],
]){
 await check('GET '+path,async()=>{const r=await fetch(new URL(path,base));return r.ok && checkFn(await r.json());});
}
for(const path of ['/','/build-with-ai.html']) {
 await check('GET '+path,async()=>{const r=await fetch(new URL(path,base));const html=await r.text();return r.ok&&html.includes('Your Business Deserves a Website')&&html.includes('Preview a sample website');});
}
await check('Developer does not expose Manager API',async()=>{
 const r=await fetch(new URL('/api/manager/submissions',base));return r.status===404;
});
await check('Customer submissions remain disabled',async()=>{
 const r=await fetch(new URL('/api/submit',base),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Synthetic only',email:'synthetic@example.invalid'})});return r.status===503;
});
await check('Draft API never publishes',async()=>{
 const r=await fetch(new URL('/api/draft',base),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({answers:{business:'Synthetic demo cafe',goal:'Show a sample homepage'}})});
 const data=await r.json();return r.ok&&data.published===false&&data.draft_only===true&&data.ai_model_connected===false;
});
if(failed)process.exitCode=1;
