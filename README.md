# luzian.net
Personal website and contact information

## Working on the site

Pages are plain hand-written HTML, English in the top folders and Spanish under `es/`. The parts every page shares (head tags, link previews and language links, menu, footer, background layers, closing scripts) sit between `<!-- shared:NAME -->` markers and are written by one script, so they can't drift apart:

- `python3 scripts/sync_pages.py` rewrites the shared parts of every page and `sitemap.xml`. To change a shared part, edit it in that script (it knows both languages) and run it.
- `python3 scripts/sync_pages.py --bump` does the same with a new `?v=` cache tag. Run it after changing a script or the stylesheet.
- A new page: copy a similar one, keep the markers, add it to `PAGES` (and `SITEMAP`) in `scripts/sync_pages.py`, run the script.
- Page titles, descriptions, text and page-only scripts belong to the page itself.

## Checks

Two checks run on every pull request (workflow "Site checks"):

- `python3 scripts/check_site.py` (Python 3 only, a second): an old `?v=` tag, a broken link, a page missing its Spanish twin, a wrong canonical address, shared parts or the sitemap out of step, a missing `<h1>` or skip-link target, the wedding page without `noindex`, hard-coded theme colours, leftover test code.
- `python3 scripts/smoke_test.py` (needs `pip install playwright` and `playwright install chromium`; about a minute): opens every page in a real browser in both themes at desktop and phone width and fails on script errors, console warnings, failed requests or sideways overflow; then tries the theme switch, `?calm`, the pop-ups' keyboard focus, the skip link, the Spanish 404 and the copyright year.

Test pages used to tune the look go in `water-lab/` (git ignores it and the checker complains if one is left behind).

## Themes

The site has two looks, **Water** (default) and **Fire**, switched with the droplet | flame pill under the menu. Colours are CSS variables (`:root` for Water, `html[data-theme="fire"]` for Fire, both in `assets/style.css`); use `rgb(var(--accent) / 0.4)` and friends instead of hard-coded colours. `assets/theme.js` tints the white icons of the contact and payment pages through an SVG colour filter built from `--icon` (no extra image files), and remembers the choice (and `?theme=fire` / `?theme=water` on any link sets it; `?reveal=ring` swaps the spreading circle for just the glowing ring); the water effect's palette is in `assets/water.js` (`THEMES`).

Fonts are self-hosted (`assets/fonts`). The three used on every page are preloaded in the shared head (`PRELOAD_FONTS` in `scripts/sync_pages.py`), so they download alongside the stylesheet, and each font has a stand-in (`Saira Fallback` and friends in `assets/style.css`): Arial resized and re-spaced to the font's measured width and line height, so text barely moves when the real font arrives. If a font file or its text changes a lot, redo those numbers (they were measured on the site's own text, with kerning, against Arial).

The plain, still snake (`.ouro-bg-rotator::before`) is the picture for devices without the water effect (reduced motion, no WebGL, `?water=off`). While the effect is on its way it stays hidden, because the unshaded snake would flash for a moment before the effect takes over; `water.js` adds `water-off` to show it at once when the effect will not run, and it fades in by itself after 2.5 s as a safety net. The water snake fades in when it is ready.

The water's movement follows the real clock (`wallSeconds()` in `assets/water.js`), so a refresh or another page carries the pattern on instead of restarting it: the snake's caustics come round every 8 minutes and the background's every 20, in step with the clock. With `?water=debug`, `__ouroWater.reset()` stops following the clock and starts every clock at zero, which the checksum tests rely on.

Fire also has its own effects (flickering firelight, heat haze, white-hot veins on the snake, a glow along the bottom, cinders instead of dust, sparks on click, flame-gradient titles); their strengths are the `FIRE` constants in `assets/water.js`, `--ember-glow` and `--heading-fire` in `assets/style.css`.

## Measuring it

Add `?stats` to any address (for example `luzian.net/?calm&stats`) for a small readout in the bottom-left corner: the frames per second the browser really draws (and the lowest a second has been), the water effect's frames per second and the CPU time of one frame, whether the logo and background layers are running, and the battery charge now and since the page was opened. "Copy report" puts it all on the clipboard. `?water=off` switches the effect off, for a baseline to compare with. `?water=debug` exposes test hooks in the console.
