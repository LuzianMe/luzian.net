#!/usr/bin/env python3
"""Refresh the graph of my homelab notes on the site (Setup's Homelab slide and /setup/homelab/).

Run it at home before publishing; the graph is a copy of the notes, so it goes stale as they grow:

  ~/.venvs/playwright/bin/python scripts/homelab_graph.py

It does four things, and stops at the first problem without touching the site:
  1. builds the public graph with Myco Notes (only the labels approved in ~/homelab/myco-notes/public-labels.json,
     no note names, paths, titles or commit subjects), into a temporary folder;
  2. checks it: nothing from the notes may be in it but the approved labels (see check() below);
  3. moves it to notes-graph/graph.html and films a still of it in each theme (Deep sea for Water, Amber
     terminal for Fire): assets/homelab-graph-{water,fire}.webp (960 px) and -phone.webp (600 px), shown
     until the live graph is drawn, and for good with reduced motion, data saver or no JavaScript;
  4. writes the new counts (notes, links, changes) into the Setup pages and the graph pages, both languages.

Never add labels here: the approved list is kept with the notes, and changes to it are mine to make.
Needs Playwright with Chromium, and Pillow.
"""
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HOME = Path.home() / 'homelab'
KIT = HOME / 'myco-notes'
LABELS = KIT / 'public-labels.json'
OUT = ROOT / 'notes-graph' / 'graph.html'
TITLE = 'Homelab'
PAGES = ['setup/index.html', 'es/setup/index.html', 'setup/homelab/index.html', 'es/setup/homelab/index.html']
THEMES = {'water': 'deepsea', 'fire': 'amber'}

# Words that must never be in the public graph (addresses, providers, places, people)
FORBIDDEN = ['.lan', '192.168', 'duckdns', 'proton', 'vpn', 'nord', 'wireguard', 'tailscale', 'mexic', 'parents', 'luzian']
IP = re.compile(r'\b\d{1,3}(?:\.\d{1,3}){3}\b')
NODE_KEYS = {'id', 'g', 'hub', 'hist', 'in', 'out', 'b', 'l', 'name'}
COMMIT_KEYS = {'t', 'n', 'a'}
GROUP_ID = re.compile(r'^(start|plans|reviews|logs|archive|docs|inbox|sources|verify|g\d+)$')


def run(*args, cwd=None):
    return subprocess.run(args, cwd=cwd, capture_output=True, text=True, check=True).stdout


def data_of(page):
    return json.loads(re.search(r'<script id="data" type="application/json">(.*?)</script>', page, re.S).group(1))


def approved():
    raw = json.loads(LABELS.read_text(encoding='utf-8'))
    values = raw.values() if isinstance(raw, dict) else raw
    return {v for v in values if isinstance(v, str)}


def private_strings():
    """Everything from the notes that must not appear: file names, paths, titles, the last 50 commit subjects."""
    found = set()
    for rel in run('git', '-C', str(HOME), 'ls-files', '*.md').split():
        path = Path(rel)
        found |= {rel, path.name, path.stem}
        text = (HOME / rel).read_text(encoding='utf-8', errors='ignore')
        m = re.search(r'^title:\s*(.+)$', text, re.M) or re.search(r'^#\s+(.+)$', text, re.M)
        if m:
            found.add(m.group(1).strip().strip('"'))
    found |= set(re.findall(r'`([^`]+\.md)`', run(str(KIT / 'tools' / 'index'), cwd=HOME)))
    found |= {s for s in run('git', '-C', str(HOME), 'log', '--format=%s', '-50').splitlines() if s.strip()}
    return {s for s in found if len(s) >= 4}


def check(page):
    """The problems with a built graph (an empty list when it is safe to publish)."""
    problems = []
    low = page.lower()
    data = data_of(page)
    labels = approved()
    allowed = {x.lower() for x in labels | {TITLE}}
    data_text = json.dumps(data).lower()
    for s in private_strings():
        sl = s.lower()
        if sl in allowed:
            continue   # an approved label that happens to equal a note's name ("Runbook")
        # short plain words ("network") also turn up in the page's own code: those count only inside the data
        if any(c in sl for c in '-/ .') or len(sl) > 12:
            if sl in low:
                problems.append(f'contains a note name, path, title or commit subject: {s!r}')
        elif f'"{sl}"' in data_text:
            problems.append(f'the data contains {s!r}')
    for word in FORBIDDEN:
        if word in low:
            problems.append(f'contains {word!r}')
    problems += [f'contains an address: {m}' for m in IP.findall(page)]
    if data.get('title') != TITLE:
        problems.append(f'title is {data.get("title")!r}')
    names = {n['name'] for n in data['nodes'] if n.get('name')}
    problems += [f'label not in the approved list: {n!r}' for n in sorted(names - labels)]
    keys = {k for n in data['nodes'] for k in n} - NODE_KEYS
    if keys:
        problems.append(f'notes carry more than they should: {sorted(keys)}')
    keys = {k for c in data['commits'] for k in c} - COMMIT_KEYS
    if keys:
        problems.append(f'commits carry more than they should: {sorted(keys)}')
    problems += [f'group id {g.get("id")!r} is not a generic one' for g in data['groups'] if not GROUP_ID.match(str(g.get('id')))]
    problems += [f'group carries {sorted(set(g) - {"id"})}' for g in data['groups'] if set(g) - {'id'}]
    return problems


def build():
    with tempfile.TemporaryDirectory() as tmp:
        report = run(sys.executable, str(KIT / 'tools' / 'build-notes-map.py'), '--root', str(HOME), '--public',
                     '--labels', str(LABELS), '--title', TITLE, '--out', tmp).strip()
        print(report)
        m = re.search(r'(\d+) notes \((\d+) labelled\), (\d+) links, (\d+) commits', report)
        if not m:
            sys.exit('could not read the counts from the build')
        page = (Path(tmp) / 'graph.html').read_text(encoding='utf-8')
    problems = check(page)
    if problems:
        print('\nNOT published, the graph is not safe:')
        for p in problems:
            print(' -', p)
        sys.exit(1)
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(page, encoding='utf-8')
    return {'notes': m.group(1), 'labelled': m.group(2), 'links': m.group(3), 'changes': m.group(4)}


def film():
    """A still of the graph in each theme, on black (the site lightens it onto the page), cropped square around the network."""
    from PIL import Image
    from playwright.sync_api import sync_playwright
    with tempfile.TemporaryDirectory() as tmp, sync_playwright() as pw:
        browser = pw.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
        for theme, graph_theme in THEMES.items():
            page = browser.new_page(viewport={'width': 1100, 'height': 1100})
            page.emulate_media(reduced_motion='no-preference')
            page.goto(f'{OUT.as_uri()}?theme={graph_theme}&interactive=0')
            page.add_style_tag(content='html, body { background: #000 !important; }')
            page.wait_for_timeout(7000)   # settled, and a few labels showing
            shot = Path(tmp) / f'{theme}.png'
            page.screenshot(path=str(shot))
            page.close()
            img = Image.open(shot).convert('RGB')
            box = img.convert('L').point(lambda v: 255 if v > 40 else 0).getbbox()
            left, top, right, bottom = box
            side = min(max(right - left, bottom - top) + 80, img.width, img.height)
            x = min(max((left + right) // 2 - side // 2, 0), img.width - side)
            y = min(max((top + bottom) // 2 - side // 2, 0), img.height - side)
            square = img.crop((x, y, x + side, y + side))
            for suffix, size, quality in (('', 960, 82), ('-phone', 600, 80)):
                out = ROOT / 'assets' / f'homelab-graph-{theme}{suffix}.webp'
                square.resize((size, size), Image.LANCZOS).save(out, 'WEBP', quality=quality, method=6)
                print(f'{out.relative_to(ROOT)}: {out.stat().st_size // 1024} KB')
        browser.close()


def write_counts(counts):
    for rel in PAGES:
        path = ROOT / rel
        text = path.read_text(encoding='utf-8')
        new = re.sub(r'(<span data-graph-count="(\w+)">)\d+(</span>)', lambda m: m.group(1) + counts[m.group(2)] + m.group(3), text)
        if new != text:
            path.write_text(new, encoding='utf-8')
            print(f'updated the counts in {rel}')


def main():
    if not LABELS.exists():
        sys.exit(f'{LABELS} not found: this only runs at home, next to the notes')
    counts = build()
    film()
    write_counts(counts)
    print(f'\nnotes-graph/graph.html: {OUT.stat().st_size // 1024} KB, checked. Look at it, then commit and publish.')


if __name__ == '__main__':
    main()
