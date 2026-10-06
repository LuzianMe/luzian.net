// Theme: Water (the default) or Fire.
//
// The page's colours live in CSS variables (assets/style.css); this script only sets
// <html data-theme="water|fire">, remembers the choice, and builds the little droplet | flame switch
// next to the language switch. It is loaded in the <head>, so the right colours are there from the
// first paint. The choice is shared between open windows. Open any page with ?theme=fire (or
// ?theme=water) to switch it from a link.
//
// Other scripts hear about a change through the "themechange" event on window (detail.theme).
(function () {
  'use strict';

  const KEY = 'luzian-theme';
  const root = document.documentElement;
  const BROWSER_COLORS = { water: '#0d111b', fire: '#0a0403' };   // the phone's address bar
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DURATION = 750;   // milliseconds for the circle to cross the page

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

  // Switch with a circle of the new theme spreading out from the switch, where the browser supports it
  function change(theme, origin) {
    if (theme === current()) return;
    save(theme);
    if (!document.startViewTransition || reduceMotion) { apply(theme); return; }

    const box = origin ? origin.getBoundingClientRect() : null;
    const x = box ? box.left + box.width / 2 : window.innerWidth / 2;
    const y = box ? box.top + box.height / 2 : 0;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const transition = document.startViewTransition(() => apply(theme));
    transition.ready.then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: DURATION, easing: 'ease-out', pseudoElement: '::view-transition-new(root)' }
      );
      rim(x, y, radius);
    }).catch(() => { /* the theme has changed anyway */ });
  }

  // A glowing rim on the front of the spreading circle, in the new theme's colour: an ember front
  // when the page catches fire. It grows in step with the circle (same length, same easing).
  function rim(x, y, radius) {
    const ring = document.createElement('div');
    ring.className = 'theme-rim';
    ring.setAttribute('aria-hidden', 'true');
    ring.style.cssText = `left:${x - radius}px;top:${y - radius}px;width:${2 * radius}px;height:${2 * radius}px;`;
    document.body.appendChild(ring);
    const growing = ring.animate(
      [
        { transform: 'scale(0)', opacity: 1 },
        { transform: 'scale(0.8)', opacity: 1, offset: 0.8 },
        { transform: 'scale(1)', opacity: 0 },
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

    // A row that holds the language switch and this one side by side
    const row = document.createElement('div');
    row.className = 'switch-row';
    const language = document.querySelector('.lang-switch');
    if (language) {
      language.parentNode.insertBefore(row, language);
      row.appendChild(language);
    } else {
      const nav = document.querySelector('.nav-container');
      if (!nav) return;
      nav.insertAdjacentElement('afterend', row);
    }
    row.appendChild(group);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();

  window.luzianTheme = { get: current, set: (theme) => change(theme === 'fire' ? 'fire' : 'water', null) };
})();
