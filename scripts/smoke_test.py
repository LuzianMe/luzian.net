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
                    if not page.query_selector('.theme-switch'):
                        problems.append('no theme switch')
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
    page.wait_for_timeout(500)
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
    page.mouse.move(500, 400)
    page.mouse.click(500, 400)
    page.mouse.wheel(0, 300)
    page.wait_for_timeout(300)
    if not page.evaluate("document.body.classList.contains('calm-show')"):
        fail('calm view', 'a mouse move, click or the wheel ended the calm view')
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
