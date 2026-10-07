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

The site has two looks, **Water** (default) and **Fire**, switched with the droplet | flame pill under the menu. Colours are CSS variables (`:root` for Water, `html[data-theme="fire"]` for Fire, both in `assets/style.css`); use `rgb(var(--accent) / 0.4)` and friends instead of hard-coded colours. `assets/theme.js` tints the white icons through an SVG colour filter built from `--icon` (no extra image files), and remembers the choice (and `?theme=fire` / `?theme=water` on any link sets it; `?reveal=ring` swaps the spreading circle for just the glowing ring); the water effect's palette is in `assets/water.js` (`THEMES`).

Fire also has its own effects (flickering firelight, heat haze, white-hot veins on the snake, a glow along the bottom, cinders instead of dust, sparks on click, flame-gradient titles); their strengths are the `FIRE` constants in `assets/water.js`, `--ember-glow` and `--heading-fire` in `assets/style.css`.
