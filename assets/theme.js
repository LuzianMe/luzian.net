// Theme: Water (the default) or Fire.
//
// The page's colours live in CSS variables (assets/style.css); this script only sets
// <html data-theme="water|fire">, remembers the choice, and builds the little droplet | flame switch
// in the footer, next to the language switch. It is loaded in the <head>, so the right colours are there from the
// first paint. The choice is shared between open windows. Open any page with ?theme=fire (or
// ?theme=water) to switch it from a link. ?reveal=ring on any address swaps the page-wide circle for just
// the glowing ring (a fallback to try if the circle ever misbehaves on a device).
//
// Other scripts hear about a change through the "themechange" event on window (detail.theme).
(function () {
  'use strict';

  const KEY = 'luzian-theme';
  const root = document.documentElement;
  const BROWSER_COLORS = { water: '#0d111b', fire: '#0a0403' };   // the phone's address bar
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DURATION = 750;   // milliseconds for the circle to cross the page
  const SETTLE_MS = 40;   // a moment (two frames) between a tap and the start of the change

  function save(theme) {
    try { localStorage.setItem(KEY, theme); } catch (e) { /* private window: just not remembered */ }
  }

  function initial() {
    const fromLink = /[?&]theme=(water|fire)(?:&|#|$)/.exec(location.search);
    if (fromLink) { save(fromLink[1]); return fromLink[1]; }
    try { return localStorage.getItem(KEY) === 'fire' ? 'fire' : 'water'; } catch (e) { return 'water'; }
  }

  function current() {
    return root.getAttribute('data-theme') === 'fire' ? 'fire' : 'water';
  }

  function paintBrowserBar(theme) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', BROWSER_COLORS[theme]);
  }

  // The white icons are tinted with an SVG colour filter (no extra image files). Its matrix is built
  // from the theme's --icon colour, so changing that variable in the stylesheet re-colours them all.
  function buildIconFilter() {
    if (document.getElementById('icon-tint')) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    svg.innerHTML = '<filter id="icon-tint" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0"/></filter>';
    document.body.appendChild(svg);
    paintIcons();
  }

  function paintIcons() {
    const matrix = document.querySelector('#icon-tint feColorMatrix');
    if (!matrix) return;
    const rgb = getComputedStyle(root).getPropertyValue('--icon').trim().split(/\s+/).map(Number);
    if (rgb.length !== 3 || rgb.some(isNaN)) return;
    matrix.setAttribute('values', `${rgb[0] / 255} 0 0 0 0  0 ${rgb[1] / 255} 0 0 0  0 0 ${rgb[2] / 255} 0 0  0 0 0 1 0`);
  }

  // Everything that has to change when the theme changes
  function apply(theme) {
    root.setAttribute('data-theme', theme);
    paintBrowserBar(theme);
    paintIcons();
    document.querySelectorAll('[data-theme-set]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.getAttribute('data-theme-set') === theme));
    });
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: theme } }));
  }

  // Switch with a circle of the new theme spreading out, where the browser supports it.
  //
  // Two precautions for touch screens (a light tap showed the circle misplaced and cut short on one phone):
  //  - the change starts a moment after it was asked for, so a finger that is just lifting is not part of
  //    the moment the browser takes its picture of the page (SETTLE_MS);
  //  - ?reveal=ring on the page's address skips the browser's page-picture animation altogether: the
  //    theme changes at once and only the glowing ring spreads from the tap. It cannot misbehave.
  let pending = null;
  const ringOnly = /[?&]reveal=ring\b/.test(location.search);

  function change(theme, origin) {
    if (theme === current() || theme === pending) return;
    pending = theme;
    save(theme);

    // The circle spreads from where it was asked to: a point ({x, y}, e.g. where the screen was
    // tapped), the middle of an element (e.g. a switch), or the middle of the top edge
    let x = window.innerWidth / 2;
    let y = 0;
    if (origin && typeof origin.x === 'number' && typeof origin.y === 'number') {
      x = origin.x;
      y = origin.y;
    } else if (origin && origin.getBoundingClientRect) {
      const box = origin.getBoundingClientRect();
      x = box.left + box.width / 2;
      y = box.top + box.height / 2;
    }

    setTimeout(() => {
      pending = null;
      if (theme === current()) return;
      const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
      if (reduceMotion) { apply(theme); return; }
      if (ringOnly || !document.startViewTransition) {
        apply(theme);
        rim(x, y, radius);
        return;
      }
      const transition = document.startViewTransition(() => apply(theme));
      transition.ready.then(() => {
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: DURATION, easing: 'ease-out', pseudoElement: '::view-transition-new(root)' }
        );
        rim(x, y, radius);
      }).catch(() => { /* the theme has changed anyway */ });
    }, SETTLE_MS);
  }

  // A glowing rim on the front of the spreading circle, in the new theme's colour: an ember front
  // when the page catches fire. It grows in step with the circle (same length, same easing).
  // It is one element the size of the screen with a ring drawn by a gradient whose radius is
  // animated (--rim-r), centred on the point with plain coordinates: no huge element, no scaling.
  function rim(x, y, radius) {
    if (!window.CSS || typeof CSS.registerProperty !== 'function') return;   // the circle alone, then
    const ring = document.createElement('div');
    ring.className = 'theme-rim';
    ring.setAttribute('aria-hidden', 'true');
    ring.style.setProperty('--rim-x', `${x}px`);
    ring.style.setProperty('--rim-y', `${y}px`);
    document.body.appendChild(ring);
    const growing = ring.animate(
      [
        { '--rim-r': '0px', opacity: 1 },
        { '--rim-r': `${0.8 * radius}px`, opacity: 1, offset: 0.8 },
        { '--rim-r': `${radius}px`, opacity: 0 },
      ],
      { duration: DURATION, easing: 'ease-out', fill: 'forwards' }
    );
    growing.onfinish = () => ring.remove();
  }

  // The first paint already has the right colours
  root.setAttribute('data-theme', initial());
  paintBrowserBar(current());

  // Another open window changed the theme
  window.addEventListener('storage', (event) => {
    if (event.key === KEY) apply(event.newValue === 'fire' ? 'fire' : 'water');
  });

  // ---------------------------------------------------------------------------------------------
  // The switch: droplet | flame, in a row with the language switch
  // ---------------------------------------------------------------------------------------------
  const DROPLET = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M12 2.4C8.2 7 5.8 10.2 5.8 13.7a6.2 6.2 0 0 0 12.4 0C18.2 10.2 15.8 7 12 2.4z"/></svg>';
  const FLAME = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="M12.4 2c.5 3.3 2.3 4.9 4 6.8 1.7 1.9 3.1 3.7 3.1 6.4a7.5 7.5 0 0 1-15 0c0-2.7 1.3-4.6 2.8-6 .2 1.4.9 2.4 1.9 3C9.3 9.2 10.3 5 12.4 2zm-.4 11.2c-1.2 1.2-2 2.1-2 3.4a2 2 0 0 0 4 0c0-1.3-.8-2.2-2-3.4z" fill-rule="evenodd"/></svg>';

  // Fire only (the stylesheet shows it): a glow along the bottom of the page, like embers below the screen
  function buildGlow() {
    const glow = document.createElement('div');
    glow.className = 'ember-glow';
    glow.setAttribute('aria-hidden', 'true');
    document.body.insertBefore(glow, document.body.firstChild);   // first, so everything else is drawn over it
  }

  function build() {
    buildGlow();
    buildIconFilter();
    const spanish = root.lang === 'es';
    const group = document.createElement('div');
    group.className = 'theme-switch';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', spanish ? 'Tema' : 'Theme');
    [
      ['water', DROPLET, spanish ? 'Tema agua' : 'Water theme', spanish ? 'Agua' : 'Water'],
      ['fire', FLAME, spanish ? 'Tema fuego' : 'Fire theme', spanish ? 'Fuego' : 'Fire'],
    ].forEach(([theme, icon, label, title]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('data-theme-set', theme);
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(theme === current()));
      button.title = title;
      button.innerHTML = icon;
      button.addEventListener('click', () => change(theme, button));
      group.appendChild(button);
    });

    // The footer has a row for the switches (the language switch is already in it)
    const row = document.querySelector('.switch-row');
    if (!row) return;
    row.appendChild(group);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();

  // set(theme, origin): the new theme spreads out from origin, a point {x, y} or an element
  // (the middle of the top edge without one)
  window.luzianTheme = { get: current, set: (theme, origin) => change(theme === 'fire' ? 'fire' : 'water', origin || null) };
})();
