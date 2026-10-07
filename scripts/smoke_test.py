#!/usr/bin/env python3
"""Opens every page of the site in a real browser (Chromium) and checks that it works.

    pip install playwright && playwright install chromium     (once)
    python3 scripts/smoke_test.py

It serves the repository on a local port (answering unknown addresses with 404.html, like GitHub
Pages), then, for every page, in Water and in Fire, at desktop and at phone width, checks:
  - no script errors, no console errors or warnings, no failed requests
  - nothing sticks out sideways
  - the page has the theme it should and the theme switch is there
and, once, the things scripts do: the theme switch and its memory, ?calm and leaving it with a key,
the pop-ups' keyboard focus, the skip link, the Spanish 404 footer, and the copyright year.

It needs a browser, which scripts/check_site.py does not; GitHub runs both on every pull request.
"""
import datetime
import http.server
import os
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PAGES = ['/', '/career/', '/setup/', '/contact/', '/payment/', '/es/', '/es/career/', '/es/setup/',
         '/es/contact/', '/es/payment/', '/404.html', '/pay/', '/home/']
failures = []


def fail(where, message):
    failures.append(f'{where}: {message}')
    print(f'  FAIL {where}: {message}')


class Handler(http.server.SimpleHTTPRequestHandler):
    """Like GitHub Pages: folders serve their index.html, and anything unknown gets 404.html with a 404 status."""

    def log_message(self, *args):
        pass

    def send_head(self):
        path = self.translate_path(self.path)
        if not (os.path.exists(path) or os.path.exists(os.path.join(path, 'index.html'))):
            body = (ROOT / '404.html').read_bytes()
            self.send_response(404)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            import io
            return io.BytesIO(body)
        return super().send_head()


def serve():
    handler = lambda *a, **k: Handler(*a, directory=str(ROOT), **k)  # noqa: E731
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f'http://127.0.0.1:{server.server_address[1]}'


def new_page(browser, base, width, theme, problems):
    context = browser.new_context(viewport={'width': width, 'height': 800})
    # start the tab with this theme, once (so a later page can show whether the choice was remembered)
    context.add_init_script(
        f"try {{ if (!sessionStorage.getItem('seeded')) {{ sessionStorage.setItem('seeded', '1'); localStorage.setItem('luzian-theme', '{theme}'); }} }} catch (e) {{}}")
    page = context.new_page()
    page.on('pageerror', lambda e: problems.append(f'script error: {e}'))
    page.on('console', lambda m: problems.append(f'console {m.type}: {m.text[:140]}') if m.type in ('error', 'warning') else None)
    page.on('requestfailed', lambda r: problems.append(f'request failed: {r.url}'))
    page.on('response', lambda r: problems.append(f'HTTP {r.status}: {r.url}') if r.status >= 400 and not r.url.endswith('/404.html') and 'nope' not in r.url else None)
    return context, page


def wait_for_theme_animation(page, was):
    """After a click that changes the theme from `was`: wait for the change, then for its animation to be over.
    (While the animation plays the page underneath cannot be clicked, and the software-rendered browser
    used here and on GitHub draws slowly, so it can take a while.)"""
    page.wait_for_function("t => document.documentElement.dataset.theme !== t", arg=was, timeout=15000)
    try:
        page.wait_for_selector('.theme-rim', state='attached', timeout=5000)
    except Exception:
        pass
    page.wait_for_function(
        "!document.querySelector('.theme-rim') && !document.getAnimations().some(a => a.effect && a.effect.pseudoElement)",
        timeout=15000)


def sweep(browser, base):
    for width in (1024, 375):
        for theme in ('water', 'fire'):
            for path in PAGES:
                where = f'{theme} {width}px {path}'
                problems = []
                context, page = new_page(browser, base, width, theme, problems)
                page.goto(base + path, wait_until='networkidle')
                page.wait_for_timeout(700)
                if path in ('/pay/', '/home/'):
                    # redirect pages: they must have sent the visitor on (to the payments or contact page)
                    destination = page.url.split(base)[-1]
                    if destination.strip('/') in ('pay', 'home'):
                        problems.append(f'the redirect did not happen (still at {destination})')
                if path != '/404.html':
                    problems = [p for p in problems if 'HTTP 404' not in p]
                overflow = page.evaluate('document.documentElement.scrollWidth - window.innerWidth')
                if overflow > 0:
                    problems.append(f'sticks out sideways by {overflow}px')
                if path not in ('/pay/', '/home/'):
                    if page.evaluate("document.documentElement.getAttribute('data-theme')") != theme:
                        problems.append('wrong theme')
                    if not page.query_selector('footer .theme-switch'):
                        problems.append('no theme switch in the footer')
                    if path != '/404.html' and not page.query_selector('footer .lang-switch'):
                        problems.append('no language switch in the footer')
                    if page.evaluate("document.querySelectorAll('h1').length") != 1:
                        problems.append('does not have exactly one h1')
                for p in problems:
                    fail(where, p)
                context.close()
    print('sweep done')


def behaviours(browser, base):
    year = str(datetime.date.today().year)

    # --- theme switch, its memory, and ?theme=
    problems = []
    context, page = new_page(browser, base, 1024, 'water', problems)
    page.goto(base + '/contact/', wait_until='networkidle')
    page.click('[data-theme-set="fire"]')
    wait_for_theme_animation(page, 'water')
    if page.evaluate("document.documentElement.dataset.theme") != 'fire':
        fail('theme switch', 'the flame button did not switch to Fire')
    if page.evaluate("getComputedStyle(document.querySelector('.grid-icon')).filter").count('icon-tint') != 1:
        fail('theme switch', 'icons are not tinted in Fire')
    page.goto(base + '/career/', wait_until='networkidle')
    if page.evaluate("document.documentElement.dataset.theme") != 'fire':
        fail('theme switch', 'the choice was not remembered on the next page')
    page.goto(base + '/career/?theme=water', wait_until='networkidle')
    if page.evaluate("document.documentElement.dataset.theme") != 'water':
        fail('theme switch', '?theme=water did not apply')
    for p in problems:
        fail('theme switch', p)
    context.close()

    # --- calm view: ?calm, mouse and click do not end it, a key does
    problems = []
    context, page = new_page(browser, base, 1024, 'water', problems)
    page.goto(base + '/?calm', wait_until='networkidle')
    page.wait_for_timeout(500)
    if not page.evaluate("document.body.classList.contains('calm-show')"):
        fail('calm view', '?calm did not start the calm view')
    page.mouse.move(300, 300)
    page.mouse.move(120, 600)
    page.mouse.click(120, 600)   # a click away from the logo
    page.mouse.wheel(0, 300)
    page.wait_for_timeout(300)
    if not page.evaluate("document.body.classList.contains('calm-show')"):
        fail('calm view', 'a mouse move, click or the wheel ended the calm view')
    # in the calm view the logo is the theme switch (and a click on it does not end the view)
    before = page.evaluate("document.documentElement.dataset.theme")
    box = page.evaluate("(r => [r.left + r.width * 0.2, r.top + r.height * 0.3])(document.querySelector('img.logo').getBoundingClientRect())")
    page.mouse.click(box[0], box[1])
    try:
        page.wait_for_function("!!document.querySelector('.theme-rim')", timeout=15000)
        rim = page.evaluate("(el => [parseFloat(el.style.getPropertyValue('--rim-x')), parseFloat(el.style.getPropertyValue('--rim-y'))])(document.querySelector('.theme-rim'))")
        if abs(rim[0] - box[0]) > 2 or abs(rim[1] - box[1]) > 2:
            fail('calm view', f'the theme change did not start where the logo was clicked (clicked {box}, started {rim})')
        # the spreading circle is described in percentages of the page picture (a circle in pixels was drawn
        # at the wrong scale on one phone) and is centred where the click was
        clip = page.evaluate("(a => a ? a.effect.getKeyframes().map(k => k.clipPath) : null)(document.getAnimations().find(a => a.effect && a.effect.pseudoElement === '::view-transition-new(root)'))")
        if not clip:
            fail('calm view', 'the circle animation was not found')
        else:
            import re as _re
            m = _re.match(r'circle\(([\d.]+)% at ([\d.]+)% ([\d.]+)%\)', clip[-1] or '')
            size = page.evaluate("[window.innerWidth, window.innerHeight]")
            if not m:
                fail('calm view', f'the circle is not in percentages: {clip}')
            elif abs(float(m.group(2)) / 100 * size[0] - box[0]) > 2 or abs(float(m.group(3)) / 100 * size[1] - box[1]) > 2:
                fail('calm view', f'the circle is not centred on the click: {clip} for a click at {box} on {size}')
    except Exception:
        fail('calm view', 'no glowing rim appeared when the theme changed')
    wait_for_theme_animation(page, before)
    after = page.evaluate("document.documentElement.dataset.theme")
    if after == before:
        fail('calm view', 'clicking the logo did not change the theme')
    if not page.evaluate("document.body.classList.contains('calm-show')"):
        fail('calm view', 'clicking the logo ended the calm view')
    page.click('img.logo')
    wait_for_theme_animation(page, after)
    if page.evaluate("document.documentElement.dataset.theme") != before:
        fail('calm view', 'clicking the logo again did not change the theme back')
    # the change happens when the finger or button is released, not when it lands; a swipe is not a tap
    now = page.evaluate("document.documentElement.dataset.theme")
    page.mouse.move(box[0], box[1])
    page.mouse.down()
    page.wait_for_timeout(400)
    if page.evaluate("document.documentElement.dataset.theme") != now:
        fail('calm view', 'the theme changed before the button was released')
    page.mouse.up()
    wait_for_theme_animation(page, now)
    now = page.evaluate("document.documentElement.dataset.theme")
    page.mouse.move(box[0], box[1])
    page.mouse.down()
    page.mouse.move(box[0] + 90, box[1] + 10, steps=4)
    page.mouse.up()
    page.wait_for_timeout(600)
    if page.evaluate("document.documentElement.dataset.theme") != now:
        fail('calm view', 'a swipe over the logo changed the theme')
    page.keyboard.press('Shift')
    if not page.evaluate("document.body.classList.contains('calm-show')"):
        fail('calm view', 'a lone Shift ended the calm view')
    page.keyboard.press('a')
    page.wait_for_timeout(200)
    if page.evaluate("document.body.classList.contains('calm-show')"):
        fail('calm view', 'a key press did not end the calm view')
    for p in problems:
        fail('calm view', p)
    context.close()

    # --- ?reveal=ring: no page-picture animation at all, just the glowing ring from the tap
    problems = []
    context, page = new_page(browser, base, 1024, 'water', problems)
    page.goto(base + '/?calm&reveal=ring', wait_until='networkidle')
    page.wait_for_timeout(500)
    box = page.evaluate("(r => [r.left + r.width * 0.7, r.top + r.height * 0.6])(document.querySelector('img.logo').getBoundingClientRect())")
    page.mouse.click(box[0], box[1])
    page.wait_for_function("document.documentElement.dataset.theme === 'fire'", timeout=5000)
    rim = page.evaluate("(el => el && [parseFloat(el.style.getPropertyValue('--rim-x')), parseFloat(el.style.getPropertyValue('--rim-y'))])(document.querySelector('.theme-rim'))")
    if not rim or abs(rim[0] - box[0]) > 2 or abs(rim[1] - box[1]) > 2:
        fail('?reveal=ring', f'the ring did not start at the tap (tapped {box}, ring {rim})')
    if page.evaluate("document.getAnimations().some(a => a.effect && a.effect.pseudoElement)"):
        fail('?reveal=ring', 'the page-picture animation ran anyway')
    for p in problems:
        fail('?reveal=ring', p)
    context.close()

    # --- ?stats: the readout appears, shows numbers, and tapping it does not touch the page
    problems = []
    context, page = new_page(browser, base, 375, 'water', problems)
    # the water script is delayed on purpose: the readout must still find it (it can load after the readout does)
    def slow_water(route):
        import time
        time.sleep(1.0)
        route.continue_()
    page.route('**/assets/water.js*', slow_water)
    page.goto(base + '/?calm&stats', wait_until='networkidle')
    page.wait_for_timeout(2500)
    text = page.inner_text('#stats-overlay pre') if page.query_selector('#stats-overlay') else ''
    if 'water  not running' in text:
        fail('?stats', 'the readout missed the water effect when its script loaded late')
    if 'page' not in text or 'fps' not in text or 'battery' not in text:
        fail('?stats', f'the readout is missing or incomplete: {text!r}')
    if not page.query_selector('#stats-overlay button'):
        fail('?stats', 'no Copy report button')
    else:
        page.click('#stats-overlay button')
        page.wait_for_timeout(300)
        if not page.evaluate("document.body.classList.contains('calm-show')"):
            fail('?stats', 'tapping the readout ended the calm view')
    for p in problems:
        fail('?stats', p)
    context.close()

    # --- Contact and Payment are rows inside cards, like Setup (and keep their working parts)
    for path, selector, count in (('/contact/', '.link-row', 8), ('/es/contact/', '.link-row', 8), ('/payment/', '.pay-item', 4), ('/es/payment/', '.pay-item', 4)):
        problems = []
        context, page = new_page(browser, base, 1024, 'water', problems)
        page.on('dialog', lambda d: d.dismiss())
        page.goto(base + path, wait_until='networkidle')
        found = page.evaluate(f"document.querySelectorAll('{selector}').length")
        if found != count:
            fail(f'rows {path}', f'expected {count} rows, found {found}')
        if page.evaluate("document.querySelectorAll('main .grid-item').length"):
            fail(f'rows {path}', 'still has old tiles')
        if 'payment' in path and page.evaluate("document.querySelectorAll('.pay-btn[data-copy]').length") != 4:
            fail(f'rows {path}', 'the copy buttons are missing')
        if 'payment' in path:
            # the copy buttons are icons; a click shows a check mark, then the icon comes back
            context.grant_permissions(['clipboard-read', 'clipboard-write'])
            if page.evaluate("document.querySelectorAll('.pay-btn[data-copy] svg').length") != 4:
                fail(f'rows {path}', 'the copy buttons should hold an icon')
            page.click('.pay-btn[data-copy]')
            page.wait_for_timeout(400)
            if page.evaluate("document.querySelector('.pay-btn[data-copy] svg path').getAttribute('d')") != 'M5 12.5l4.5 4.5L19 7.5':
                fail(f'rows {path}', 'no check mark after copying')
            page.wait_for_timeout(2300)
            if page.evaluate("document.querySelector('.pay-btn[data-copy] svg rect') === null"):
                fail(f'rows {path}', 'the copy icon did not come back')
            if page.evaluate("document.getElementById('live-status') && document.getElementById('live-status').textContent === ''"):
                fail(f'rows {path}', 'the copy was not announced')
            # the buttons stay to the right of the name, even on a phone
            page.set_viewport_size({'width': 360, 'height': 800})
            page.wait_for_timeout(200)
            layout = page.evaluate("(() => { const li = document.querySelector('.pay-item'); const t = li.querySelector('.row-text').getBoundingClientRect(); const a = li.querySelector('.pay-actions').getBoundingClientRect(); return [a.left >= t.right - 1, Math.abs((a.top + a.height / 2) - (t.top + t.height / 2)) < 20]; })()")
            if not (layout[0] and layout[1]):
                fail(f'rows {path}', 'on a phone the payment buttons are not beside the name')
        if 'contact' in path:
            lists = page.evaluate("[...document.querySelectorAll('.link-list')].map(ul => [...ul.querySelectorAll('.gear-name')].map(n => n.textContent))")
            online = [n for n in lists[0]]
            if not (len(lists) == 2 and len(online) == 4 and len(lists[1]) == 4):
                fail(f'rows {path}', f'unexpected lists {lists}')
            if page.evaluate("!document.querySelector('#share-trigger').closest('.link-list').isSameNode(document.querySelectorAll('.link-list')[0]) || !document.querySelector('a[href*=\"discordapp\"]').closest('.link-list').isSameNode(document.querySelectorAll('.link-list')[1])"):
                fail(f'rows {path}', 'Share belongs in the first card and Discord in the second')
            context.grant_permissions(['clipboard-read', 'clipboard-write'])
            if not page.evaluate("!!document.querySelector('#copyEmail .row-pill svg')"):
                fail(f'rows {path}', 'the email copy pill should be an icon')
            page.click('#copyEmail')
            page.wait_for_timeout(400)
            if page.evaluate("document.querySelector('#copyEmail .row-pill svg path').getAttribute('d')") != 'M5 12.5l4.5 4.5L19 7.5':
                fail(f'rows {path}', 'no check mark after copying the email')
            page.wait_for_timeout(2300)
            if page.evaluate("document.querySelector('#copyEmail .row-pill svg rect') === null"):
                fail(f'rows {path}', 'the email copy icon did not come back')
        for p in problems:
            if 'prompt' not in p:
                fail(f'rows {path}', p)
        context.close()

    # --- pop-ups: focus moves in, stays in, and comes back; Escape closes
    for path, opener, modal in (('/contact/', '#share-trigger', '#share-modal'), ('/payment/', '#zelle-trigger', '#zelle-modal'),
                                ('/es/payment/', '#zelle-trigger', '#zelle-modal')):
        problems = []
        context, page = new_page(browser, base, 1024, 'water', problems)
        page.goto(base + path, wait_until='networkidle')
        page.focus(opener)
        page.keyboard.press('Enter')
        page.wait_for_timeout(300)
        inside = page.evaluate(f"document.querySelector('{modal}').contains(document.activeElement)")
        if not inside:
            fail(f'pop-up {path}', 'focus did not move into the pop-up')
        for _ in range(6):
            page.keyboard.press('Tab')
        if not page.evaluate(f"document.querySelector('{modal}').contains(document.activeElement)"):
            fail(f'pop-up {path}', 'Tab left the pop-up')
        page.keyboard.press('Escape')
        page.wait_for_timeout(200)
        if page.evaluate(f"getComputedStyle(document.querySelector('{modal}')).display") != 'none':
            fail(f'pop-up {path}', 'Escape did not close it')
        if page.evaluate("document.activeElement && document.activeElement.matches('%s')" % opener) is not True:
            fail(f'pop-up {path}', 'focus did not return to the button that opened it')
        for p in problems:
            fail(f'pop-up {path}', p)
        context.close()

    # --- skip link and the copyright year
    problems = []
    context, page = new_page(browser, base, 1024, 'water', problems)
    page.goto(base + '/career/', wait_until='networkidle')
    page.keyboard.press('Tab')
    if not page.evaluate("document.activeElement && document.activeElement.classList.contains('skip-link')"):
        fail('skip link', 'is not the first thing Tab reaches')
    if page.evaluate("document.querySelector('.skip-link').getBoundingClientRect().top") < 0:
        fail('skip link', 'does not become visible when it has focus')
    page.keyboard.press('Enter')
    page.wait_for_timeout(200)
    if page.evaluate("document.activeElement && document.activeElement.id") != 'main':
        fail('skip link', 'did not move focus to the main content')
    if year not in page.inner_text('footer'):
        fail('footer', f'does not show the year {year}')
    context.close()

    # --- the Spanish 404
    problems = []
    context, page = new_page(browser, base, 1024, 'water', problems)
    page.goto(base + '/es/nope', wait_until='networkidle')
    visible = page.evaluate("[...document.querySelectorAll('footer p')].filter(p => !p.hidden).map(p => p.innerText).join(' ')")
    if 'Todos los derechos reservados' not in visible or 'Modo tranquilo' not in visible:
        fail('404 (Spanish)', f'the footer is not in Spanish: {visible!r}')
    context.close()
    page_en = browser.new_context().new_page()
    page_en.goto(base + '/nope', wait_until='networkidle')
    visible = page_en.evaluate("[...document.querySelectorAll('footer p')].filter(p => !p.hidden).map(p => p.innerText).join(' ')")
    if 'All rights reserved' not in visible:
        fail('404 (English)', f'the footer is not in English: {visible!r}')

    # --- search files
    for name in ('/robots.txt', '/sitemap.xml'):
        context = browser.new_context()
        response = context.new_page().goto(base + name)
        if response.status != 200:
            fail(name, f'answers {response.status}')
        context.close()
    print('behaviours done')


def main():
    server, base = serve()
    with sync_playwright() as p:
        # Software WebGL, so the water effect also runs on a computer without a graphics card (such as GitHub's)
        browser = p.chromium.launch(args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
        sweep(browser, base)
        behaviours(browser, base)
        browser.close()
    server.shutdown()
    if failures:
        print(f'\n{len(failures)} problem(s) found')
        return 1
    print('OK: every page works in both themes at desktop and phone width, and the behaviours pass')
    return 0


if __name__ == '__main__':
    sys.exit(main())
