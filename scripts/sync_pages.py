#!/usr/bin/env python3
"""Keeps the parts every page shares in step, in English and Spanish.

Each page marks its shared parts with comments:

    <!-- shared:head -->      icons, link previews, language links, stylesheet, theme script
    <!-- shared:layers -->    the background layers (snake, particles, spotlight)
    <!-- shared:nav -->       skip link, menu
    <!-- shared:footer -->    language switch (and the theme switch, added by theme.js), copyright, footer links
    <!-- shared:scripts -->   the scripts every page loads at the end
    <!-- /shared:NAME -->     ends a part

Everything between a pair of markers is written by this script; everything else (titles, text,
page scripts) belongs to the page. To change a shared part, edit it here and run the script.

    python3 scripts/sync_pages.py           rewrite the shared parts of every page, and sitemap.xml
    python3 scripts/sync_pages.py --bump    the same, with a new ?v= cache tag (after changing a script or the stylesheet)
    python3 scripts/sync_pages.py --check   only report what is out of step (scripts/check_site.py does this too)
"""
import datetime
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = 'https://luzian.net'
PRELOAD_FONTS = ('saira-400-600', 'orbitron-500-700', 'chakra-petch-600')   # on every page, above the fold

# Every page this script looks after: file -> (language, which page it is)
PAGES = {
    'index.html': ('en', 'home'),
    'career/index.html': ('en', 'career'),
    'setup/index.html': ('en', 'setup'),
    'contact/index.html': ('en', 'contact'),
    'payment/index.html': ('en', 'payment'),
    '404.html': ('en', '404'),
    'es/index.html': ('es', 'home'),
    'es/career/index.html': ('es', 'career'),
    'es/setup/index.html': ('es', 'setup'),
    'es/contact/index.html': ('es', 'contact'),
    'es/payment/index.html': ('es', 'payment'),
}

# Pages listed in sitemap.xml (each with its twin in the other language)
SITEMAP = ['index.html', 'career/index.html', 'setup/index.html', 'contact/index.html', 'payment/index.html']

TEXT = {
    'en': {
        'nav_label': 'Main Navigation', 'nav': ['Home', 'Career', 'Contact'],
        'language': 'Language', 'other_title': 'Ver en español',
        'rights': 'All rights reserved.', 'payments': 'Payments', 'calm': 'Calm mode',
        'image_alt': 'Luzian logo over a glowing ouroboros', 'locale': 'en_US',
        'skip': 'Skip to content',
    },
    'es': {
        'nav_label': 'Navegación principal', 'nav': ['Inicio', 'Trayectoria', 'Contacto'],
        'language': 'Idioma', 'other_title': 'View in English',
        'rights': 'Todos los derechos reservados.', 'payments': 'Pagos', 'calm': 'Modo tranquilo',
        'image_alt': 'Logotipo de Luzian sobre un ouroboros luminoso', 'locale': 'es_MX',
        'skip': 'Saltar al contenido',
    },
}
NAV_KEYS = ['home', 'career', 'contact']
NAV_PATHS = ['', 'career/', 'contact/']
COPYRIGHT_YEAR = '2026'   # the pages update it to the current year when they load


def prefix(lang):
    return '/es/' if lang == 'es' else '/'


def address(lang, key):
    """The site address of a page: ('es', 'career') -> /es/career/"""
    return prefix(lang) + ('' if key == 'home' else key + '/')


def other(lang):
    return 'en' if lang == 'es' else 'es'


# ---------------------------------------------------------------------------------------------
# The shared parts. Each returns a list of (depth, line).
# ---------------------------------------------------------------------------------------------
def part_head(lang, key, tag):
    t = TEXT[lang]
    lines = [
        '<link rel="icon" href="/assets/ouro.ico" type="image/x-icon">',
        '<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">',
        '<meta name="theme-color" content="#0d111b">',
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
        f'<meta property="og:image" content="{SITE}/assets/og-image.png">',
        '<meta property="og:image:width" content="1200">',
        '<meta property="og:image:height" content="630">',
        f'<meta property="og:image:alt" content="{t["image_alt"]}">',
        '<meta property="og:site_name" content="Luzian">',
        '<meta property="og:type" content="website">',
        '<meta name="twitter:card" content="summary_large_image">',
    ]
    if key == '404':
        lines += [f'<meta property="og:url" content="{SITE}/">']
    else:
        url = SITE + address(lang, key)
        lines += [
            f'<meta property="og:url" content="{url}">',
            f'<link rel="canonical" href="{url}">',
            f'<meta property="og:locale" content="{t["locale"]}">',
            f'<meta property="og:locale:alternate" content="{TEXT[other(lang)]["locale"]}">',
            f'<link rel="alternate" hreflang="en" href="{SITE}{address("en", key)}">',
            f'<link rel="alternate" hreflang="es" href="{SITE}{address("es", key)}">',
            f'<link rel="alternate" hreflang="x-default" href="{SITE}{address("en", key)}">',
        ]
    lines += [
        # the fonts every page uses, fetched in parallel with the stylesheet instead of after it
        *(f'<link rel="preload" href="/assets/fonts/{name}.woff2" as="font" type="font/woff2" crossorigin>' for name in PRELOAD_FONTS),
        f'<link rel="stylesheet" href="/assets/style.css?v={tag}">',
        f'<script src="/assets/theme.js?v={tag}"></script>',
    ]
    return [(0, line) for line in lines]


def part_layers(lang, key, tag):
    return [
        (0, '<!-- Ambient Visual Background Layers -->'),
        (0, '<div class="ouro-bg-rotator" aria-hidden="true"></div>'),
        (0, '<canvas id="ambient-canvas" aria-hidden="true"></canvas>'),
        (0, '<div class="spotlight-overlay" aria-hidden="true"></div>'),
    ]


def part_nav(lang, key, tag):
    t = TEXT[lang]
    lines = [(0, f'<a class="skip-link" href="#main">{t["skip"]}</a>'),
             (0, f'<nav class="nav-container" aria-label="{t["nav_label"]}">'), (1, '<ul class="nav-pills">')]
    for i, nav_key in enumerate(NAV_KEYS):
        href = prefix(lang) + NAV_PATHS[i]
        if key == '404':
            # One 404 page serves both languages; its script switches to Spanish under /es/
            es = TEXT['es']['nav'][i]
            lines.append((2, f'<li><a href="{href}" class="nav-pill" data-es="{es}" data-es-href="/es/{NAV_PATHS[i]}">{t["nav"][i]}</a></li>'))
        elif nav_key == key:
            lines.append((2, f'<li><a href="{href}" class="nav-pill active">{t["nav"][i]}</a></li>'))
        else:
            lines.append((2, f'<li><a href="{href}" class="nav-pill">{t["nav"][i]}</a></li>'))
    lines += [(1, '</ul>'), (0, '</nav>')]
    return lines


def footer_line(lang, key):
    t = TEXT[lang]
    sep = '<span class="footer-sep" aria-hidden="true">&middot;</span> '
    links = []
    if key != 'payment':
        links.append(f'{sep}<a href="{prefix(lang)}payment/">{t["payments"]}</a>')
    links.append(f'{sep}<a href="{prefix(lang)}?calm">{t["calm"]}</a>')
    return (f'&copy; <span class="current-year">{COPYRIGHT_YEAR}</span> Luzian. {t["rights"]} '
            f'<span class="footer-links">{" ".join(links)}</span>')


def switch_row(lang, key):
    """The language switch (the theme switch is added next to it by assets/theme.js)."""
    t = TEXT[lang]
    lines = [(1, '<div class="switch-row">')]
    if key != '404':
        twin = address(other(lang), key)
        o = other(lang)
        here = f'<span class="lang-current" aria-current="true">{lang.upper()}</span>'
        there = f'<a href="{twin}" hreflang="{o}" lang="{o}" title="{t["other_title"]}" data-lang="{o}">{o.upper()}</a>'
        pair = here + there if lang == 'en' else there + here
        lines.append((2, f'<div class="lang-switch" role="group" aria-label="{t["language"]}">{pair}</div>'))
    lines.append((1, '</div>'))
    return lines


def part_footer(lang, key, tag):
    if key == '404':
        return [
            (0, '<footer>'),
            *switch_row(lang, key),
            (1, f'<p data-footer="en">{footer_line("en", key)}</p>'),
            (1, f'<p data-footer="es" lang="es" hidden>{footer_line("es", key)}</p>'),
            (0, '</footer>'),
        ]
    return [(0, '<footer>'), *switch_row(lang, key), (1, f'<p>{footer_line(lang, key)}</p>'), (0, '</footer>')]


def part_scripts(lang, key, tag):
    return [(0, f'<script src="/assets/{name}.js?v={tag}"></script>') for name in ('effects', 'water', 'lang')]


PARTS = {
    'head': part_head,
    'layers': part_layers,
    'nav': part_nav,
    'footer': part_footer,
    'scripts': part_scripts,
}

REGION = re.compile(r'^([ \t]*)<!-- shared:(\w+) -->\n.*?^[ \t]*<!-- /shared:\2 -->[ \t]*$', re.S | re.M)


# ---------------------------------------------------------------------------------------------
# Cache tag, sitemap, and writing the pages
# ---------------------------------------------------------------------------------------------
TAG = re.compile(r'\?v=([0-9]{8}[a-z]+)')


def all_html():
    return sorted(p for p in ROOT.rglob('*.html')
                  if not ({'wedding', 'water-lab', '.git', 'node_modules'} & set(p.relative_to(ROOT).parts)))


def current_tag():
    tags = set()
    for path in all_html():
        tags.update(TAG.findall(path.read_text(encoding='utf-8')))
    if not tags:
        return datetime.date.today().strftime('%Y%m%d') + 'a'
    return max(tags, key=lambda t: (t[:8], len(t), t))


def next_tag(tag):
    today = datetime.date.today().strftime('%Y%m%d')
    if today > tag[:8]:
        return today + 'a'
    letters = tag[8:]
    if letters[-1] != 'z':
        return tag[:8] + letters[:-1] + chr(ord(letters[-1]) + 1)
    return tag + 'a'


def sitemap():
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<!-- Written by scripts/sync_pages.py: every page in both languages, with its twin -->',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">']
    for page in SITEMAP:
        key = PAGES[page][1]
        for lang in ('en', 'es'):
            lines.append('  <url>')
            lines.append(f'    <loc>{SITE}{address(lang, key)}</loc>')
            for alt in ('en', 'es'):
                lines.append(f'    <xhtml:link rel="alternate" hreflang="{alt}" href="{SITE}{address(alt, key)}"/>')
            lines.append(f'    <xhtml:link rel="alternate" hreflang="x-default" href="{SITE}{address("en", key)}"/>')
            lines.append('  </url>')
    lines.append('</urlset>')
    return '\n'.join(lines) + '\n'


def render(page, text, tag):
    """The page with its shared parts written out, and a list of problems (missing or unknown parts)."""
    lang, key = PAGES[page]
    unit = '\t' if re.search(r'^\t', text, re.M) else '  '
    found = set()
    problems = []

    def fill(match):
        indent, name = match.group(1), match.group(2)
        if name not in PARTS:
            problems.append(f'unknown shared part "{name}"')
            return match.group(0)
        found.add(name)
        body = '\n'.join(indent + unit * depth + line for depth, line in PARTS[name](lang, key, tag))
        return f'{indent}<!-- shared:{name} -->\n{body}\n{indent}<!-- /shared:{name} -->'

    out = REGION.sub(fill, text)
    for name in PARTS:
        if name not in found:
            problems.append(f'has no <!-- shared:{name} --> part')
    if bump_to:
        out = TAG.sub(f'?v={tag}', out)
    return out, problems


bump_to = None


def run(write):
    """Rewrite (or, with write=False, only compare) every page and the sitemap. Returns problems."""
    tag = bump_to or current_tag()
    problems = []
    for page in PAGES:
        path = ROOT / page
        if not path.exists():
            problems.append(f'{page}: missing')
            continue
        text = path.read_text(encoding='utf-8')
        out, page_problems = render(page, text, tag)
        problems += [f'{page}: {p}' for p in page_problems]
        if out != text:
            if write:
                path.write_text(out, encoding='utf-8')
                print(f'updated {page}')
            else:
                problems.append(f'{page}: shared parts are out of step (run python3 scripts/sync_pages.py)')
    if bump_to and write:
        # pages this script does not manage (redirects) may also carry the tag
        for path in all_html():
            rel = str(path.relative_to(ROOT))
            if rel in PAGES:
                continue
            text = path.read_text(encoding='utf-8')
            out = TAG.sub(f'?v={tag}', text)
            if out != text:
                path.write_text(out, encoding='utf-8')
                print(f'updated {rel}')
    map_path = ROOT / 'sitemap.xml'
    expected = sitemap()
    if not map_path.exists() or map_path.read_text(encoding='utf-8') != expected:
        if write:
            map_path.write_text(expected, encoding='utf-8')
            print('updated sitemap.xml')
        else:
            problems.append('sitemap.xml is out of step (run python3 scripts/sync_pages.py)')
    return problems


def check():
    """For scripts/check_site.py: the problems, without changing anything."""
    return run(write=False)


if __name__ == '__main__':
    if '--bump' in sys.argv:
        bump_to = next_tag(current_tag())
        print(f'cache tag ?v={bump_to}')
    problems = run(write='--check' not in sys.argv)
    for p in problems:
        print(' -', p)
    sys.exit(1 if problems else 0)
