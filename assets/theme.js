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

  // Everything that has to change when the theme changes
  function apply(theme) {
    root.setAttribute('data-theme', theme);
    paintBrowserBar(theme);
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
        { duration: 750, easing: 'ease-out', pseudoElement: '::view-transition-new(root)' }
      );
    }).catch(() => { /* the theme has changed anyway */ });
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

  function build() {
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
