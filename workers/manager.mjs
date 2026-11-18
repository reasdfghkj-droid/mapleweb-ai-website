/** Authenticated Website Manager Worker. No public intake, assets, or publishing. */
import backend from './mapleweb-agents.mjs';
export default {
  fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if (!path.startsWith('/api/manager/')) return new Response(JSON.stringify({error:'Not found'}),{status:404,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
    return backend.fetch(request,env,ctx);
  }
};
