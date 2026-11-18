/** Read-only Manager staging smoke test. Never sends real customer information. */
const target = process.argv[2];
if (!target) { console.error('Usage: node scripts/smoke-manager-staging.mjs https://MANAGER-STAGING.workers.dev'); process.exit(2); }
const url = new URL(target);
if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash ||
  !url.hostname.startsWith('mapleweb-ai-manager-staging.') || !url.hostname.endsWith('.workers.dev')) {
  console.error('Refusing to probe a non-Manager staging origin');
  process.exit(2);
}
const checks = [
  ['/api/manager/status', 'GET', 401],
  ['/api/manager/submissions', 'GET', 401],
  ['/api/chat', 'GET', 404],
  ['/api/submit', 'POST', 404],
  ['/', 'GET', 404],
];
for (const [path,method,status] of checks) {
  const res=await fetch(new URL(path,url),{method});
  if(res.status!==status){console.error('FAIL',method,path,'expected',status,'got',res.status);process.exitCode=1;}
  else console.log('PASS',method,path,status);
}
