/** Customer-facing Website Developer Worker.
 * Uses fixed-template rules only; does not run a generative model.
 * Manager administration is deliberately NOT routed on this public service.
 */
import backend from './mapleweb-agents.mjs';
const allowedExact = new Set(['/','/index.html','/build-with-ai.html','/health','/api/chat','/api/draft','/api/prices','/api/config','/api/submit','/api/stripe/webhook']);
export default {
  fetch(request, env, ctx) {
    if (!allowedExact.has(new URL(request.url).pathname) && !new URL(request.url).pathname.startsWith('/preview/') && !new URL(request.url).pathname.startsWith('/review/') && !new URL(request.url).pathname.startsWith('/api/customer/review/')) return new Response(JSON.stringify({error:'Not found'}),{status:404,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
    return backend.fetch(request,env,ctx);
  }
};
