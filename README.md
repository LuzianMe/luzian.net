# luzian.net
Personal website and contact information

## Checks

`python3 scripts/check_site.py` catches the slips that are easy to make on a hand-edited, two-language site: an old `?v=` cache tag left on one page, a broken link, a page missing its Spanish twin, a wrong canonical address, a leftover test page. It needs only Python 3. The same check runs on every pull request (see the "Site checks" workflow).

When a script or the stylesheet changes, bump the `?v=` tag in every page (except `wedding/`) and run the check.

## Themes

The site has two looks, **Water** (default) and **Fire**, switched with the droplet | flame pill under the menu. Colours are CSS variables (`:root` for Water, `html[data-theme="fire"]` for Fire, both in `assets/style.css`); use `rgb(var(--accent) / 0.4)` and friends instead of hard-coded colours. `assets/theme.js` remembers the choice (and `?theme=fire` / `?theme=water` on any link sets it); the water effect's palette is in `assets/water.js` (`THEMES`).
