# luzian.net
Personal website and contact information

## Checks

`python3 scripts/check_site.py` catches the slips that are easy to make on a hand-edited, two-language site: an old `?v=` cache tag left on one page, a broken link, a page missing its Spanish twin, a wrong canonical address, a leftover test page. It needs only Python 3. The same check runs on every pull request (see the "Site checks" workflow).

When a script or the stylesheet changes, bump the `?v=` tag in every page (except `wedding/`) and run the check.
