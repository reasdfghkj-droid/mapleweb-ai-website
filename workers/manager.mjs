/**
 * PRIVATE MapleWeb AI Website Manager Worker entry.
 * Not deployed by the website's normal wrangler.jsonc.
 * Keep workers_dev=false, protect custom route with Cloudflare Access and
 * require an independently generated 32+ byte MANAGER_TOKEN.
 */
import { handleOwnerRequest } from './owner-api.mjs';
export default {
  fetch(request,env,ctx) {
    return handleOwnerRequest(request,env,ctx);
  }
};
