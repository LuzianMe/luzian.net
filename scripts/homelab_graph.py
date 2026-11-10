#!/usr/bin/env python3
"""Refresh the notes graph on the Setup page's Homelab slide.

Films the graph view of the homelab notes (http://home.lan/notes/myco/graph.html, only reachable at
home) as it replays its history, and writes the three files the slide uses:

  assets/homelab-graph.webp        the finished graph, 960 px square (the still everyone sees first)
  assets/homelab-graph-phone.webp  the same, 600 px, for phones
  assets/homelab-graph.mp4         about 8 s of the graph growing, silent, faded in and out so it loops

Needs Playwright with Chromium and ffmpeg:
  ~/.venvs/playwright/bin/python scripts/homelab_graph.py

Node names are left out (they name devices at home) and so are the graph page's panels. The film runs on
a controlled clock, so every frame is a full screenshot exactly 1/30 s apart, whatever the machine.
Afterwards update the numbers in the slide's text (notes, links, changes) if they moved, and run
python3 scripts/sync_pages.py --bump.
"""
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

URL = 'http://home.lan/notes/myco/graph.html?theme=dark'
ROOT = Path(__file__).resolve().parent.parent
FPS = 30
SPEED = '0.28'        # the graph's own replay speed that makes the growth last about 6 s here
HOLD_S = 1.8          # then the finished graph, before the loop starts again
MAX_S = 20
BG = '0x0a0f0d'       # the graph page's background, for the padding and the fades

NO_LABELS = """
(() => {
  const P = CanvasRenderingContext2D.prototype, f = P.fillText, s = P.strokeText;
  const skip = c => /12px system-ui/.test(c.font);
  P.fillText = function () { if (!skip(this)) return f.apply(this, arguments); };
  P.strokeText = function () { if (!skip(this)) return s.apply(this, arguments); };
})();
"""
HIDE_UI = '#left, #tools, #panel, #empty { display: none !important; }'


def film(frames):
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=['--use-gl=swiftshader', '--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width': 1200, 'height': 900})
        context.add_init_script(NO_LABELS)
        page = context.new_page()
        page.clock.install()
        page.goto(URL, wait_until='networkidle')
        page.add_style_tag(content=HIDE_UI)
        page.clock.run_for(4000)
        page.evaluate("s => { const sel = document.getElementById('speed'); sel.add(new Option(s + 'x', s)); sel.value = s; }", SPEED)
        page.evaluate("document.getElementById('play').click()")
        n, done_at = 0, None
        while n < MAX_S * FPS:
            page.clock.run_for(1000 / FPS)
            page.screenshot(path=str(frames / f'{n:04d}.png'))
            n += 1
            if done_at is None and n > FPS and page.inner_text('#play').strip() == 'Replay':
                done_at = n
            if done_at is not None and n - done_at >= HOLD_S * FPS:
                break
        browser.close()
    return n


def crop_box(frames):
    """A square around everything the graph covers in any frame (it moves as it grows)"""
    from PIL import Image, ImageChops
    files = sorted(frames.glob('*.png'))
    seen = None
    for f in files[::5] + [files[-1]]:
        lit = Image.open(f).convert('L').point(lambda v: 255 if v > 60 else 0)
        seen = lit if seen is None else ImageChops.lighter(seen, lit)
    left, top, right, bottom = seen.getbbox()
    width, height = Image.open(files[0]).size
    side = min(max(right - left, bottom - top) + 40, width, height)
    x = min(max((left + right) // 2 - side // 2, 0), width - side)
    y = min(max((top + bottom) // 2 - side // 2, 0), height - side)
    return side, x, y


def ffmpeg(*args):
    subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], check=True)


def main():
    if not shutil.which('ffmpeg'):
        sys.exit('ffmpeg is needed')
    with tempfile.TemporaryDirectory() as tmp:
        frames = Path(tmp)
        count = film(frames)
        side, x, y = crop_box(frames)
        pad = side * 80 // 900
        square = f'crop={side}:{side}:{x}:{y},pad={side + 2 * pad}:{side + 2 * pad}:{pad}:{pad}:color={BG}'
        last = frames / f'{count - 1:04d}.png'
        ffmpeg('-i', str(last), '-vf', f'{square},scale=960:960:flags=lanczos', '-c:v', 'libwebp', '-quality', '82',
               str(ROOT / 'assets/homelab-graph.webp'))
        ffmpeg('-i', str(last), '-vf', f'{square},scale=600:600:flags=lanczos', '-c:v', 'libwebp', '-quality', '80',
               str(ROOT / 'assets/homelab-graph-phone.webp'))
        seconds = count / FPS
        fades = f'fade=t=in:st=0:d=0.35:color={BG},fade=t=out:st={seconds - 0.42:.2f}:d=0.4:color={BG}'
        ffmpeg('-framerate', str(FPS), '-i', str(frames / '%04d.png'),
               '-vf', f'{square},scale=720:720:flags=lanczos,{fades},format=yuv420p',
               '-c:v', 'libx264', '-crf', '26', '-preset', 'slow', '-profile:v', 'high', '-movflags', '+faststart', '-an',
               str(ROOT / 'assets/homelab-graph.mp4'))
    for name in ('homelab-graph.webp', 'homelab-graph-phone.webp', 'homelab-graph.mp4'):
        print(f'{name}: {(ROOT / "assets" / name).stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
