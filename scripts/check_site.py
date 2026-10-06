#!/usr/bin/env python3
"""Checks for luzian.net: catches the slips that are easy to make on a hand-edited, two-language site.

Run it from anywhere:   python3 scripts/check_site.py
It needs nothing but Python 3, prints every problem it finds, and exits with 1 if there is any.

What it checks
  - every page uses the same ?v= cache-busting tag (bump it in all pages whenever a script or the style changes)
  - every link, image, script, stylesheet and font a page uses exists
  - every English page has its Spanish twin, and the language links point at each other
  - canonical and og:url match the page's own address; og:image exists
  - Spanish pages do not link to English pages (and the other way round), except the language switch
  - pages with the ouroboros background load water.js
  - no leftover test pages or temporary hooks
The wedding/ folder is an archive and is left alone.
"""
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
SITE = 'https://luzian.net'
SKIP_DIRS = {'wedding', 'water-lab', '.git', '.github', 'scripts', 'node_modules'}   # water-lab: reported on its own below
# Pages that are only a redirect or have no Spanish twin on purpose
NO_TWIN = {'404.html', 'home/index.html'}
LEFTOVERS = re.compile(r'TEMPORARY|LAB HOOK|__ouroWaterLevels|__ouroLogoLevels|__ouroSpinLevels|water-lab|Water lab|Logo lab|Spin lab')

errors = []


def error(where, message):
    errors.append(f'{where}: {message}')


class Page(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links = []        # (tag, attribute, value, attrs)
        self.meta = {}         # property/name -> content
        self.canonical = None
        self.alternates = {}   # hreflang -> href
        self.lang = None
        self.refresh = False
        self.has_rotator = False
        self.body_class = ''

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'html':
            self.lang = a.get('lang')
        if tag == 'body':
            self.body_class = a.get('class', '')
        if tag == 'meta':
            key = a.get('property') or a.get('name') or a.get('http-equiv')
            if key:
                self.meta[key.lower()] = a.get('content', '')
            if (a.get('http-equiv') or '').lower() == 'refresh':
                self.refresh = True
        if tag == 'link':
            rel = (a.get('rel') or '').lower()
            if rel == 'canonical':
                self.canonical = a.get('href')
            if rel == 'alternate' and a.get('hreflang'):
                self.alternates[a['hreflang']] = a.get('href')
        if 'ouro-bg-rotator' in (a.get('class') or ''):
            self.has_rotator = True
        for attribute in ('href', 'src', 'data-es-href'):
            if attribute in a and a[attribute] is not None:
                self.links.append((tag, attribute, a[attribute], a))


def is_external(value):
    return bool(re.match(r'^(?:[a-z][a-z0-9+.-]*:|//|#)', value, re.I))


def resolve(page_path, value):
    """The file a link on this page points to, or None if it is not a local link."""
    if not value or is_external(value):
        return None
    path = urlparse(value).path
    if not path:
        return None
    if path.startswith('/'):
        return (ROOT / path.lstrip('/')).resolve()
    return (page_path.parent / path).resolve()


def exists(target):
    return target.is_file() or (target.is_dir() and (target / 'index.html').is_file())


def url_to_local(url):
    """https://luzian.net/es/career/ -> the folder or file it is served from."""
    if not url or not url.startswith(SITE):
        return None
    return resolve(ROOT / 'index.html', url[len(SITE):] or '/')


def page_url(rel):
    """The address a page is served at: career/index.html -> https://luzian.net/career/"""
    parts = rel.parts[:-1]
    return SITE + '/' + ''.join(p + '/' for p in parts)


def main():
    pages = sorted(p for p in ROOT.rglob('*.html') if not (set(p.relative_to(ROOT).parts) & SKIP_DIRS))
    parsed = {}
    for path in pages:
        parser = Page()
        parser.feed(path.read_text(encoding='utf-8'))
        parsed[path.relative_to(ROOT)] = (path, parser)

    # 1. One cache-busting tag everywhere
    tags = {}
    for rel, (path, page) in parsed.items():
        for tag, attribute, value, _ in page.links:
            m = re.search(r'[?&]v=([0-9a-z]+)', value)
            if m and not is_external(value):
                tags.setdefault(m.group(1), set()).add(str(rel))
    if len(tags) > 1:
        newest = max(tags)
        for tag, where in sorted(tags.items()):
            if tag != newest:
                error('cache tag', f'?v={tag} is still used in {", ".join(sorted(where))} (newest is ?v={newest})')

    for rel, (path, page) in parsed.items():
        name = str(rel)
        in_spanish = rel.parts[0] == 'es'

        # 2. Every local link, image, script and stylesheet exists
        for tag, attribute, value, attrs in page.links:
            target = resolve(path, value)
            if target is not None and not exists(target):
                error(name, f'<{tag} {attribute}="{value}"> points to nothing')

            # 5. Spanish and English stay apart (the language switch is the one way across)
            if tag == 'a' and attribute == 'href' and value.startswith('/') and 'data-lang' not in attrs:
                site_path = urlparse(value).path
                if name == '404.html':
                    continue
                if in_spanish and not site_path.startswith(('/es/', '/assets/', '/wedding/')) and site_path != '/es':
                    error(name, f'Spanish page links to the English page {value}')
                if not in_spanish and site_path.startswith('/es/'):
                    error(name, f'English page links to the Spanish page {value}')

        # 3. Every page with a twin: the Spanish page exists and the language links agree
        public = not page.refresh and name not in NO_TWIN
        if public:
            expected_lang = 'es' if in_spanish else 'en'
            if page.lang != expected_lang:
                error(name, f'<html lang="{page.lang}"> should be "{expected_lang}"')
            if not in_spanish:
                twin = Path('es') / rel
                if twin not in parsed:
                    error(name, f'has no Spanish twin ({twin})')
            else:
                twin = Path(*rel.parts[1:])
                if twin not in parsed:
                    error(name, f'has no English twin ({twin})')

            for lang, href in page.alternates.items():
                target = url_to_local(href)
                if target is None or not exists(target):
                    error(name, f'hreflang="{lang}" points to {href}, which does not exist')
            other = 'en' if in_spanish else 'es'
            mine = 'es' if in_spanish else 'en'
            if page.alternates.get(mine) != page_url(rel):
                error(name, f'hreflang="{mine}" should be {page_url(rel)}, it is {page.alternates.get(mine)}')
            back = page.alternates.get(other)
            if back is None:
                error(name, f'no hreflang="{other}" link')
            else:
                back_rel = url_to_local(back)
                if back_rel is not None:
                    back_page = parsed.get((back_rel / 'index.html').relative_to(ROOT)) if back_rel.is_dir() else None
                    if back_page and back_page[1].alternates.get(mine) != page_url(rel):
                        error(name, f'{back} does not link back to this page with hreflang="{mine}"')

            # 4. The page's own address, and its link-preview picture
            expected = page_url(rel)
            if page.canonical != expected:
                error(name, f'canonical is {page.canonical}, should be {expected}')
            if page.meta.get('og:url') != expected:
                error(name, f'og:url is {page.meta.get("og:url")}, should be {expected}')
            image = page.meta.get('og:image')
            target = url_to_local(image)
            if target is None or not exists(target):
                error(name, f'og:image {image} does not exist')

        # 6. The water effect needs its script
        if page.has_rotator and not any('water.js' in v for _, _, v, _ in page.links):
            error(name, 'has the ouroboros background but does not load water.js')

    # 7. Stylesheets and scripts: files they name exist
    for path in sorted((ROOT / 'assets').rglob('*')):
        if path.suffix not in ('.css', '.js'):
            continue
        text = path.read_text(encoding='utf-8')
        rel = path.relative_to(ROOT)
        for m in re.finditer(r'url\(\s*[\'"]?([^\'")]+)', text):
            ref = m.group(1)
            if is_external(ref):
                continue
            target = resolve(path, ref)
            if target is not None and not exists(target):
                error(str(rel), f'url({ref}) points to nothing')
        if path.suffix == '.js':
            for m in re.finditer(r'[\'"`](/assets/[A-Za-z0-9_./-]+)[\'"`]', text):
                target = resolve(path, m.group(1))
                if target is not None and not exists(target):
                    error(str(rel), f'{m.group(1)} points to nothing')

    # 8. Nothing temporary left behind
    if (ROOT / 'water-lab').exists():
        error('water-lab/', 'the test page is still there')
    for path in sorted(list((ROOT / 'assets').rglob('*.js')) + list((ROOT / 'assets').rglob('*.css')) + [p for p in ROOT.rglob('*.html') if not (set(p.relative_to(ROOT).parts) & SKIP_DIRS)]):
        for number, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
            if LEFTOVERS.search(line):
                error(f'{path.relative_to(ROOT)}:{number}', f'leftover test code: {line.strip()[:80]}')

    if errors:
        print(f'{len(errors)} problem(s) found:\n')
        for e in errors:
            print(' -', e)
        return 1
    print(f'OK: {len(parsed)} pages checked, no problems.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
