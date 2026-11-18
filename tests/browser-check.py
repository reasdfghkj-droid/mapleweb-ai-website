from playwright.sync_api import sync_playwright
from pathlib import Path
files=[Path(__file__).parent.parent/'site/index.html',Path(__file__).parent.parent/'site/build-with-ai.html']
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox','--disable-dev-shm-usage'])
    for html in files:
        page=browser.new_page(viewport={"width":375,"height":812},device_scale_factor=1)
        errors=[]
        page.on('pageerror',lambda e: errors.append(str(e)))
        page.set_content(html.read_text(encoding='utf-8'),wait_until='load')
        text=page.locator('body').inner_text()
        assert 'Your Business Deserves a Website' in text
        assert '$500–$800' in text and '$4,500–$7,000' in text
        messages=page.locator('#log')
        assert 'What' in messages.inner_text()
        answers=['Café','Get new customers','3-5','Contact form','1500','Navy and cyan','Next month']
        for answer in answers:
            page.locator('#answer').fill(answer)
            page.locator('#send').click()
        assert 'Your plan is ready' in messages.inner_text()
        assert 'Navy and cyan' in messages.inner_text()
        assert page.locator('#answer').is_disabled()
        page.get_by_role('button',name='Preview a sample website').click()
        frame = page.locator('iframe[title="Sample website draft preview"]')
        assert frame.count() == 1
        assert frame.get_attribute('sandbox') == ''
        assert '<script>' not in frame.get_attribute('srcdoc')
        assert 'Welcome to Café' in frame.content_frame.locator('body').inner_text()
        assert 'Not a published website' in frame.content_frame.locator('body').inner_text()
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Horizontal overflow after preview'
        page.set_viewport_size({'width':320,'height':700})
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Horizontal overflow at 320px'
        page.locator('#restart').click()
        assert page.locator('#answer').is_enabled()
        # User-supplied HTML is shown as text, never executed as a script.
        page.locator('#answer').fill('password: secret-example-value')
        page.locator('#send').click()
        assert 'please do not share passwords' in messages.inner_text().lower()
        assert 'secret-example-value' not in messages.inner_text()
        page.locator('#answer').fill('<img src=x onerror=window.injected=1>')
        page.locator('#send').click()
        assert page.evaluate('window.injected === undefined')
        assert not errors,errors
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'Horizontal overflow on mobile'
        page.screenshot(path=str(html.parent.parent/'tests'/('mobile-homepage.png' if html.name == 'index.html' else 'mobile-chat.png')),full_page=True)
        print(html.name,'PASS, chat conversation, restart, mobile, no JS errors')
        page.close()
    browser.close()
