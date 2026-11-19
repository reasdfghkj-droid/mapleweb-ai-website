// MapleWeb Publishing Agent — Cloudflare Worker
// This is a rules-based monitoring agent, not a paid AI model.
// GET /status runs a live check; Cloudflare cron checks once an hour.
const REPO = "reasdfghkj-droid/mapleweb-ai-website";
const URLS = [
  "https://mapleweb-ai-website.reasdfghkj.workers.dev/",
  "https://mapleweb-ai-website.reasdfghkj.workers.dev/sales.html"
];
async function check(env) {
  const headers = { "User-Agent": "mapleweb-publishing-agent", Accept: "application/vnd.github+json" };
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  let github = { ok: false };
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/commits/main`, { headers });
    const data = r.ok ? await r.json() : {};
    github = { ok: r.ok, httpStatus: r.status, commit: data.sha || null };
  } catch (e) { github = { ok: false, error: String(e) }; }
  const websites = [];
  for (const url of URLS) {
    try {
      const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(12000) });
      const type = r.headers.get("content-type") || "";
      const body = type.includes("text/html") ? (await r.text()).slice(0, 10000) : "";
      websites.push({ url, httpStatus: r.status, live: r.ok && /mapleweb/i.test(body), contentType: type });
    } catch (e) { websites.push({ url, live: false, error: String(e) }); }
  }
  return { checkedAt: new Date().toISOString(), github, websites, verifiedLive: websites.some(w => w.live), note: "A live homepage check is not proof of the newest Cloudflare deployment. Check deployment logs separately." };
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/status") return new Response("MapleWeb Publishing Agent: GET /status", { status: 200 });
    const result = await check(env);
    return Response.json(result, { headers: { "cache-control": "no-store", "access-control-allow-origin": "*" } });
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      const result = await check(env);
      console.log(JSON.stringify(result));
      // No outbound messages by default; logs are visible in Cloudflare.
      // Do not claim notification is configured until a secure delivery method is added.
    })());
  }
};
