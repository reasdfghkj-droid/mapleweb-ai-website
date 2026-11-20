/**
 * PRIVATE MapleWeb AI Website Manager Worker entry.
 * Not deployed by the website's normal wrangler.jsonc.
 * Keep workers_dev=false, protect custom route with Cloudflare Access and
 * require an independently generated 32+ byte MANAGER_TOKEN.
 */
import { handleOwnerRequest } from './owner-api.mjs';
import {processApprovedTemplateBatch} from './agent-operations.mjs';
export default {
  fetch(request,env,ctx) {
    const path=new URL(request.url).pathname;
    if(env?.MANAGER_API_APPROVED!=='true')
      return new Response('Private manager is disabled',{status:503,
        headers:{'Cache-Control':'no-store','Content-Type':'text/plain;charset=utf-8'}});
    if(request.method==='GET' && (path==='/'||path==='/index.html'||path==='/style.css'||path==='/app.js')){
      if(!env.ASSETS||typeof env.ASSETS.fetch!=='function')
        return new Response('Private manager assets unavailable',{status:503});
      return env.ASSETS.fetch(request);
    }
    // Only /api/manager/* operations are handled. No public customer routes.
    if(!path.startsWith('/api/manager/'))
      return new Response('Not found',{status:404});
    return handleOwnerRequest(request,env,ctx);
  },
  // Future Cloudflare Cron handler; there is NO Cron trigger in Wrangler yet.
  // It never runs paid AI or publishes customer websites.
  scheduled(controller,env,ctx){
    if(env?.AUTO_AGENT_BATCH_APPROVED!=='true'||
       env?.AUTO_BUILD_HANDOFF_APPROVED!=='true'||
       env?.AI_DEVELOPER_APPROVED==='true')return;
    if(typeof ctx?.waitUntil==='function')
      ctx.waitUntil(processApprovedTemplateBatch(env,2));
  }
};
