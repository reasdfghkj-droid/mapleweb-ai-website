"""Local UI integration test with synthetic fetch and Turnstile; no network or real data."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
MOCK_API = r'''
window.__submissionRequests = [];
window.fetch = async function(url, options) {
  if (url === '/api/config') return {ok:true, json:async () => ({
    environment:'staging', submissions_enabled:true,
    turnstile_site_key:'synthetic-public-key', publishing_enabled:false,
    ai_model_connected:false
  })};
  if (url === '/api/submit') {
    window.__submissionRequests.push(JSON.parse(options.body));
    return {ok:false, json:async () => ({error:'Security check failed'})};
  }
  throw new Error('Unexpected request: ' + url);
};
const oldAppend = document.head.appendChild.bind(document.head);
document.head.appendChild = function(node) {
  if (node.tagName === 'SCRIPT' && node.src.includes('/turnstile/v0/api.js')) {
    window.__turnstileAction = null;
    window.__turnstileResetCount = 0;
    window.turnstile = {
      render(target, options) {
        window.__turnstileAction = options.action;
        window.__turnstileCallback = options.callback;
        options.callback('synthetic-test-token-1');
        return 'test-widget';
      },
      reset(id) {
        if (id !== 'test-widget') throw new Error('Wrong widget reset');
        window.__turnstileResetCount++;
        window.__turnstileCallback('synthetic-test-token-2');
      }
    };
    queueMicrotask(() => node.onload());
    return node;
  }
  return oldAppend(node);
};
'''

with sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox', '--disable-dev-shm-usage'])
    for name in ['index.html', 'build-with-ai.html']:
        page = browser.new_page(viewport={'width': 375, 'height': 812})
        page.set_default_timeout(6000)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        html = (ROOT / 'public' / name).read_text(encoding='utf-8')
        assert html.count('<script>') == 1
        html = html.replace('<script>', '<script>' + MOCK_API + '</script><script>', 1)
        page.set_content(html, wait_until='load')
        for answer in ['Cafe', 'Find customers', '3', 'Contact form', '1400', 'Blue', 'Next month']:
            page.locator('#answer').fill(answer)
            page.locator('#send').click()
        button = page.get_by_role('button', name='Send website request')
        button.wait_for(state='visible')
        assert page.evaluate('window.__turnstileAction') == 'mapleweb_submit'
        page.get_by_label('Your name').fill('Synthetic Customer')
        page.get_by_label('Email for follow-up').fill('synthetic@example.invalid')
        assert page.locator('input[type=checkbox]').evaluate('(e)=>e.getBoundingClientRect().width') >= 18
        page.locator('input[type=checkbox]').check()
        button.click()
        page.wait_for_function('window.__turnstileResetCount === 1')
        assert page.evaluate('window.__submissionRequests.length') == 1
        assert 'Security check failed' in page.locator('#log').inner_text()
        assert button.is_enabled(), 'Customer must be able to retry after CAPTCHA reset'
        button.click()
        page.wait_for_function('window.__turnstileResetCount === 2')
        assert page.evaluate('window.__submissionRequests.length') == 2
        assert not errors, errors
        print(name, 'PASS synthetic security action, failed submission and retry; no external requests')
        page.close()
    browser.close()
