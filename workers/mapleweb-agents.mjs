/** MapleWeb AI development Worker — no publishing or paid model calls. */
// Assets are served from the public directory through Cloudflare Workers Assets.
const PRICES = Object.freeze([
  { id: 'simple-1-2', label: 'Simple 1–2 pages', min: 500, max: 800 },
  { id: 'simple-3-5', label: 'Simple 3–5 pages', min: 900, max: 1500 },
  { id: 'professional-5-7', label: 'Professional 5–7 pages', min: 1500, max: 2200 },
  { id: 'custom', label: 'Professional custom design', min: 2300, max: 3000 },
  { id: 'booking', label: 'Advanced booking or payment', min: 3000, max: 4500 },
  { id: 'store', label: 'Advanced online store or integrations', min: 4500, max: 7000 },
]);
const QUESTIONS = Object.freeze([
  { key: 'business', question: 'What type of business do you have?' },
  { key: 'goal', question: 'What would you like your website to help your business achieve?' },
  { key: 'pages', question: 'How many pages do you want?' },
  { key: 'features', question: 'Which features do you need, such as booking, contact form, or an online store?' },
  { key: 'budget', question: 'What is your approximate budget in CAD, starting at $500?' },
  { key: 'style', question: 'Which colours or style do you prefer?' },
  { key: 'timeline', question: 'When would you like your website ready?' },
]);
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' };
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS }); }
function txt(x, max = 300) { return typeof x === 'string' ? x.trim().slice(0, max) : ''; }
function cleanAnswers(a) { const obj = a && typeof a === 'object' && !Array.isArray(a) ? a : {}; return Object.fromEntries(QUESTIONS.map(q => [q.key, txt(obj[q.key])])); }

function looksLikePaymentCard(value) {
  const runs = String(value).match(/(?:\d[ -]?){13,19}/g) || [];
  return runs.some(part => {
    const digits = part.replace(/\D/g, '');
    if (digits.length < 13 || digits.length > 19) return false;
    let sum = 0, twice = false;
    for (let i = digits.length - 1; i >= 0; i--) {
      let digit = Number(digits[i]);
      if (twice) { digit *= 2; if (digit > 9) digit -= 9; }
      sum += digit; twice = !twice;
    }
    return sum % 10 === 0;
  });
}
function looksLikeCredential(value) {
  const text = String(value);
  return /(?:password|passcode|secret\s*key|api[_ -]?key|private[_ -]?key|access[_ -]?token)\s*(?:is|:|=)\s*\S+/i.test(text) || /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text);
}
function sensitiveKeys(answers) { return Object.keys(answers).filter(key => looksLikePaymentCard(answers[key]) || looksLikeCredential(answers[key])); }

function replyFor(key, value) {
  if (key === 'business') return `Thanks! A website for ${value} can help customers learn about your business.`;
  if (key === 'goal') return 'That is a useful goal. I have included it in your plan.';
  if (key === 'pages') return `Understood. Your requested page count is: ${value}.`;
  if (key === 'features') return /booking|payment|store|shop|commerce/i.test(value) ? 'These advanced features may require a separate service and costs. We will review them before agreeing on a quote.' : 'Good. I have noted those features.';
  if (key === 'budget') {
    const n = Number(value.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(n) || n <= 0) return 'Thanks. We can discuss your budget during the quote review.';
    if (n < 500) return 'Our website projects start at $500 CAD.';
    const tiers = PRICES;
    const match = tiers.find(t => n >= t.min && n <= t.max);
    if (match) return `${match.label} usually costs $${match.min.toLocaleString('en-CA')}–$${match.max.toLocaleString('en-CA')} CAD. Final cost depends on your approved scope.`;
    if (n > 7000) return 'Budgets above $7,000 CAD need a custom quote; no price is guaranteed.';
    return 'Your budget falls between our published price bands. We can recommend an appropriate scope when we review your plan.';
  }
  return 'Thanks, I have included that preference in your website plan.';
}
function chat(data) {
  const a = cleanAnswers(data?.answers);
  const unsafe = sensitiveKeys(a);
  if (unsafe.length) {
    for (const key of unsafe) a[key] = '';
    return { reply: 'Please do not enter passwords, payment card numbers, API keys, or other secrets. Please answer without private details.',
      acknowledgment: '', next_key: unsafe[0], completed: false, answers: a,
      sensitive_rejected: true, inquiry_submitted: false, ai_model_connected: false };
  }
  const nextIndex = QUESTIONS.findIndex(q => !a[q.key]);
  const completed = nextIndex === -1;
  const prior = completed ? QUESTIONS[QUESTIONS.length - 1] : QUESTIONS[nextIndex - 1];
  const acknowledgment = prior ? replyFor(prior.key, a[prior.key]) : '';
  const nextQuestion = completed ? 'Your plan is ready. Copy it for your records. Nothing has been submitted or published.' : QUESTIONS[nextIndex].question;
  return {
    reply: [acknowledgment, nextQuestion].filter(Boolean).join('\n\n'),
    acknowledgment,
    next_key: completed ? null : QUESTIONS[nextIndex].key,
    completed, answers: a, inquiry_submitted: false, ai_model_connected: false,
  };
}
// A safe and clearly marked starter *preview*, not an actual deployed customer site.
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function draftPreview(data) {
  const a = cleanAnswers(data?.answers);
  if (!a.business || !a.goal || sensitiveKeys(a).length) return null;
  const name = escapeHtml(a.business);
  const goal = escapeHtml(a.goal);
  const features = escapeHtml(a.features || 'Contact form and business information');
  const style = escapeHtml(a.style || 'Modern, professional');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Draft concept — ${name}</title>
<style>*{box-sizing:border-box}body{margin:0;font:16px/1.55 system-ui,Arial;background:#f5f9ff;color:#18304e}header{padding:18px 6%;background:#09234a;color:white}main{max-width:900px;margin:auto;padding:60px 6%}.eyebrow{color:#166cb4;letter-spacing:.1em;text-transform:uppercase;font-size:.8rem;font-weight:800}h1{font-size:clamp(2.3rem,6vw,4.2rem);line-height:1.1;margin:12px 0}p{max-width:680px}section{margin:32px 0;background:white;padding:25px;border-radius:15px;box-shadow:0 5px 30px #1232}footer{padding:25px 6%;font-size:.85rem;background:#09234a;color:white}</style></head>
<body><header>${name} · Draft preview only</header><main><div class="eyebrow">Website concept</div><h1>Welcome to ${name}</h1><p>${goal}</p><section><h2>What we're planning</h2><p>${features}</p></section><section><h2>Look and feel</h2><p>${style}</p></section><p>Contact details, images and final text will be added after review.</p></main><footer>Not a published website or approved quotation. Customer review and owner approval required.</footer></body></html>`;
  return { html, generated_by: 'MapleWeb AI fixed-template Developer', draft_only: true, published: false, ai_model_connected: false };
}
async function parseBody(req, max = 12000) {
  if (!(req.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) throw Object.assign(new Error('Content-Type must be application/json'), { status: 415 });
  const claimedLength = req.headers.get('content-length');
  if (claimedLength !== null && Number(claimedLength) > max) throw Object.assign(new Error('Request too large'), { status: 413 });
  if (!req.body) throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  // Enforce the maximum while reading. req.text() buffers the entire body before rejecting it.
  const reader = req.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel().catch(() => {});
        throw Object.assign(new Error('Request too large'), { status: 413 });
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } catch (e) {
    if (e?.status === 413) throw e;
    throw Object.assign(new Error('Invalid request encoding'), { status: 400 });
  } finally { reader.releaseLock(); }
  try { return JSON.parse(text); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}
function ownerAuthed(req, env) {
  const expected = txt(env.MANAGER_TOKEN, 512);
  if (!expected || expected.length < 32) return false;
  const auth = req.headers.get('authorization') || '';
  const given = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  // Avoid early-exit comparison when comparing same-length credentials.
  if (given.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i !== given.length; i += 1) mismatch |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}
function publishGate(project) {
  const p = project && typeof project === 'object' && !Array.isArray(project) ? project : {};
  const blockers = [];
  const version = p.currentVersion;
  if (!Number.isSafeInteger(version) || version < 1) blockers.push('Valid draft version missing');
  if (p.previewVerified !== true) blockers.push('Preview not verified');
  if (p.customerApprovedVersion !== version) blockers.push('Customer approval is for a different version');
  if (p.ownerApprovedVersion !== version) blockers.push('Owner approval is for a different version');
  if (!Array.isArray(p.revisionRequests) || p.revisionRequests.some(r => !r || r.status !== 'resolved')) blockers.push('Unresolved or unverified revision requests');
  if (p.securityCheckPassed !== true) blockers.push('Security check missing');
  return { readyForOwnerDecision: blockers.length === 0, blockers, action: 'ASSESS_ONLY_NO_PUBLISH' };
}
function secureOrigin(req, env) {
  const allowed = txt(env.SITE_ORIGIN, 300);
  if (!allowed || !allowed.startsWith('https://')) return false;
  try { return new URL(allowed).origin === allowed && req.headers.get('origin') === allowed; } catch { return false; }
}
const HOURLY_SUBMISSION_LIMIT = 10;
function submissionsEnabled(env) {
  // Do not advertise or activate intake until the origin and all security bindings are valid.
  let validOrigin = false;
  try {
    const url = new URL(env.SITE_ORIGIN || '');
    validOrigin = url.protocol === 'https:' && url.origin === env.SITE_ORIGIN;
  } catch { /* fail closed */ }
  return env.SUBMISSIONS_APPROVED === 'true' && validOrigin && Boolean(
    env.DB && typeof env.DB.prepare === 'function' &&
    typeof env.TURNSTILE_SECRET === 'string' && env.TURNSTILE_SECRET.length > 0 &&
    typeof env.TURNSTILE_SITE_KEY === 'string' && env.TURNSTILE_SITE_KEY.length > 0 &&
    txt(env.RATE_LIMIT_SECRET, 512).length >= 32);
}
function emailValid(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200; }
// Never store a raw IP in D1. Limit even failed Turnstile attempts by a keyed hash.
async function rateLimitSubmission(req, env) {
  const ip = req.headers.get('CF-Connecting-IP') || '';
  if (!ip || ip.length > 64 || !/^[\da-fA-F:.]+$/.test(ip)) return { error: 'Request protection unavailable', status: 503 };
  const keyBytes = new TextEncoder().encode(env.RATE_LIMIT_SECRET);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip));
  const clientKey = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  const hour = Math.floor(Date.now() / 3_600_000);
  try {
    const result = await env.DB.prepare(`INSERT INTO submission_rate_limits (client_key,window_start,attempts)
      VALUES (?, ?, 1)
      ON CONFLICT(client_key) DO UPDATE SET
        attempts = CASE WHEN submission_rate_limits.window_start = excluded.window_start
          THEN submission_rate_limits.attempts + 1 ELSE 1 END,
        window_start = excluded.window_start
      RETURNING attempts`).bind(clientKey, hour).first();
    if (!Number.isSafeInteger(result?.attempts) || result.attempts < 1) return { error: 'Request protection unavailable', status: 503 };
    if (result.attempts > HOURLY_SUBMISSION_LIMIT) return { error: 'Too many requests. Try again later.', status: 429 };
    return null;
  } catch { return { error: 'Request protection unavailable', status: 503 }; }
}
const TURNSTILE_ACTION = 'mapleweb_submit';
async function verifyCaptcha(token, secret, remoteIp, expectedOrigin, fetcher) {
  const params = new URLSearchParams({ secret, response: token });
  if (remoteIp) params.set('remoteip', remoteIp);
  const r = await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: params });
  if (!r.ok) return false;
  const data = await r.json();
  // A successful challenge issued for a different hostname or action cannot authorize this intake.
  return data?.success === true &&
    data.hostname === new URL(expectedOrigin).hostname &&
    data.action === TURNSTILE_ACTION;
}
async function submit(req, env, fetcher) {
  if (!submissionsEnabled(env)) return json({ error: 'Submissions are not configured or approved yet' }, 503);
  if (!secureOrigin(req, env)) return json({ error: 'Origin not permitted' }, 403);
  let data;
  try { data = await parseBody(req, 14000); } catch (e) { return json({ error: e.message }, e.status || 400); }
  if (!data || typeof data !== 'object' || data.consent !== true || txt(data.website, 200)) return json({ error: 'Consent required or request rejected' }, 400);
  const name = txt(data.name, 100);
  const email = txt(data.email, 200);
  const token = txt(data.turnstileToken, 3000);
  if (!name || !emailValid(email) || !token) return json({ error: 'Valid name, email, and security check required' }, 400);
  const answers = cleanAnswers(data.answers);
  if (!answers.business || !answers.goal || !answers.budget) return json({ error: 'Please complete business, goal, and budget' }, 400);
  if (sensitiveKeys(answers).length || looksLikePaymentCard(name) || looksLikeCredential(name) || looksLikePaymentCard(email) || looksLikeCredential(email))
    return json({ error: 'Remove passwords, payment card numbers and private keys before submitting.' }, 400);
  const limited = await rateLimitSubmission(req, env);
  if (limited) return json({ error: limited.error }, limited.status);
  let passed = false;
  try { passed = await verifyCaptcha(token, env.TURNSTILE_SECRET, req.headers.get('CF-Connecting-IP') || '', env.SITE_ORIGIN, fetcher); } catch { /* fail closed */ }
  if (!passed) return json({ error: 'Security check failed' }, 403);
  const id = crypto.randomUUID();
  try {
    await env.DB.prepare('INSERT INTO submissions (id,created_at,name,email,answers_json,status) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id, new Date().toISOString(), name, email, JSON.stringify(answers), 'NEW').run();
  } catch { return json({ error: 'Could not save request. Please try again later.' }, 503); }
  return json({ saved: true, reference: id, delivered_to_agent: false }, 201);
}
export default {
  async fetch(req, env = {}) {
    const url = new URL(req.url);
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/build-with-ai.html')) {
      if (env.ASSETS && typeof env.ASSETS.fetch === 'function') return env.ASSETS.fetch(req);
      return json({ error: 'Website assets not configured' }, 503);
    }
    if (req.method === 'GET' && url.pathname === '/health') return json({ status: 'ok', service: 'MapleWeb AI development agents', manager_enabled: Boolean(env.MANAGER_TOKEN), secure_submissions_enabled: submissionsEnabled(env), ai_model_connected: false });
    if (req.method === 'GET' && url.pathname === '/api/prices') return json({ currency: 'CAD', prices: PRICES });
    if (req.method === 'GET' && url.pathname === '/api/config') {
      const publicKey = txt(env.TURNSTILE_SITE_KEY, 300);
      return json({
        environment: 'staging',
        submissions_enabled: submissionsEnabled(env),
        turnstile_site_key: publicKey,
        manager_enabled: Boolean(env.MANAGER_TOKEN),
        ai_model_connected: false,
        publishing_enabled: false,
      });
    }
    if (req.method === 'POST' && url.pathname === '/api/draft') {
      try {
        const preview = draftPreview(await parseBody(req));
        if (!preview) return json({ error: 'Business and goal are required. Do not include passwords, payment card numbers or private keys.' }, 400);
        return json(preview);
      } catch (e) { return json({ error: e.message }, e.status || 400); }
    }

    if (req.method === 'POST' && url.pathname === '/api/chat') { try { return json(chat(await parseBody(req))); } catch (e) { return json({ error: e.message }, e.status || 400); } }
    if (req.method === 'POST' && url.pathname === '/api/submit') return submit(req, env, fetch);
    if (url.pathname.startsWith('/api/manager/')) {
      if (!ownerAuthed(req, env)) return json({ error: 'Unauthorized' }, 401);
      if (req.method === 'GET' && url.pathname === '/api/manager/status') {
        return json({ service: 'MapleWeb AI Website Manager', prices: PRICES, publishing_enabled: false, automatic_customer_delivery: false, storage_configured: Boolean(env.DB) });
      }
      if (req.method === 'POST' && url.pathname === '/api/manager/assess') {
        try { return json(publishGate(await parseBody(req))); } catch (e) { return json({ error: e.message }, e.status || 400); }
      }
      if (req.method === 'GET' && url.pathname === '/api/manager/submissions') {
        if (!env.DB) return json({ error: 'Storage not configured' }, 503);
        try {
          const rows = await env.DB.prepare('SELECT id, created_at, name, email, status FROM submissions ORDER BY created_at DESC LIMIT 50').all();
          return json({ submissions: rows.results || [] });
        } catch { return json({ error: 'Storage unavailable' }, 503); }
      }
      if (req.method === 'DELETE' && url.pathname.startsWith('/api/manager/submissions/')) {
        if (!env.DB) return json({ error: 'Storage not configured' }, 503);
        const id = url.pathname.slice('/api/manager/submissions/'.length);
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))
          return json({ error: 'Invalid request ID' }, 400);
        if (req.headers.get('x-confirm-delete') !== 'DELETE_THIS_SUBMISSION') return json({ error: 'Deletion requires confirmation' }, 400);
        try {
          const response = await env.DB.prepare('DELETE FROM submissions WHERE id = ?').bind(id).run();
          if (!response?.success) return json({ error: 'Storage unavailable' }, 503);
          return json({ deleted: (response.meta?.changes || 0) > 0, reference: id });
        } catch { return json({ error: 'Storage unavailable' }, 503); }
      }
      if (req.method === 'POST' && url.pathname === '/api/manager/prune') {
        if (!env.DB) return json({ error: 'Storage not configured' }, 503);
        let data;
        try { data = await parseBody(req, 2048); } catch (e) { return json({ error: e.message }, e.status || 400); }
        if (data?.confirm !== 'DELETE_EXPIRED_SUBMISSIONS') return json({ error: 'Deletion requires confirmation' }, 400);
        const retention = Number(env.RETENTION_DAYS);
        if (!Number.isSafeInteger(retention) || retention < 1 || retention > 365)
          return json({ error: 'Retention policy not configured' }, 503);
        const cutoff = new Date(Date.now() - retention * 86_400_000).toISOString();
        const limitHour = Math.floor(Date.now() / 3_600_000) - 48;
        try {
          const deleted = await env.DB.prepare('DELETE FROM submissions WHERE created_at < ?').bind(cutoff).run();
          if (!deleted?.success) return json({ error: 'Storage unavailable' }, 503);
          await env.DB.prepare('DELETE FROM submission_rate_limits WHERE window_start < ?').bind(limitHour).run();
          return json({ deleted_expired: deleted.meta?.changes || 0, retention_days: retention });
        } catch { return json({ error: 'Storage unavailable' }, 503); }
      }
    }
    return json({ error: 'Not found' }, 404);
  }
};
export { PRICES, QUESTIONS, chat, draftPreview, publishGate, ownerAuthed, submit, parseBody, TURNSTILE_ACTION };
