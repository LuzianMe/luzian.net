// Swipe between the menu's pages on a phone: Home, Career and Contact, in the menu's order. A swipe to the
// left goes to the next page, to the right the one before; past either end the page only gives a little
// nudge. The page follows the finger a little while it moves, so it is clear something will happen.
//
// The pages are separate documents, so the slide is the browser's view transition between pages
// (@view-transition in assets/style.css, "Swiping between pages"): the content slides across while the
// menu and the background stay where they are. Browsers without it just open the page. The direction is
// passed to the new page in sessionStorage; any other way of arriving (a menu link, Back) skips the
// transition, so nothing else changes.
//
// Only on touch screens, never with reduced motion. A swipe that starts at the very edge of the screen is
// left alone (phones use those for Back), as is one that is more up-and-down than sideways, one on a form
// field, or one on something that scrolls sideways itself. It is loaded in the <head>, so the new page can
// set up the slide before it is first drawn.
(function () {
  'use strict';

  const KEY = 'luzian-swipe';
  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const EDGE = 24;          // px at each side of the screen left to the phone's own gestures
  const DECIDE = 10;        // px the finger moves before deciding between sideways and up-and-down
  const SIDEWAYS = 1.4;     // how much more sideways than up-and-down a swipe must be
  const FAR = 0.25;         // a swipe this share of the screen's width goes to the next page...
  const FLICK = 0.45;       // ...and so does a shorter (50px or more), quick one, in px per millisecond
  const FOLLOW = 0.3;       // how far the page follows the finger, as a share of the finger's travel
  const FOLLOW_MAX = 56;    // px

  const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY)); } catch (e) { return null; } };
  const forget = () => { try { sessionStorage.removeItem(KEY); } catch (e) { /* nothing kept */ } };
  const tidy = () => root.classList.remove('swiping', 'swipe-in', 'swipe-next', 'swipe-prev');

  // ---- the new page: slide in if a swipe brought us here, otherwise no transition at all ------------
  window.addEventListener('pagereveal', (event) => {
    const swipe = read();
    forget();
    if (!event.viewTransition) return;
    if (!swipe || swipe.to !== location.pathname || Date.now() - swipe.at > 4000) {
      event.viewTransition.skipTransition();
      return;
    }
    root.classList.add('swiping', 'swipe-in', swipe.dir > 0 ? 'swipe-next' : 'swipe-prev');
    event.viewTransition.finished.finally(tidy);
  });

  // ---- the page being left: the same rule ----------------------------------------------------------
  let leaving = 0;
  window.addEventListener('pageswap', (event) => {
    if (event.viewTransition && !leaving) event.viewTransition.skipTransition();
  });

  // Back to a page kept in memory: as it was before the swipe
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    leaving = 0;
    tidy();
    follow(0, false);
    const named = document.querySelector('[data-swipe-out]');
    if (named) { named.style.viewTransitionName = ''; named.removeAttribute('data-swipe-out'); }
  });

  if (reduceMotion || !window.matchMedia('(hover: none) and (pointer: coarse)').matches) return;

  // The menu's pages, and which one this is (none on the other pages: no swiping there)
  let pages = [];
  let here = -1;
  function findPages() {
    pages = [...document.querySelectorAll('.nav-pills a.nav-pill')].map((a) => new URL(a.href).pathname);
    here = pages.indexOf(location.pathname);
  }

  // What moves with the finger: everything on the page but the menu (moving the menu's parent would
  // unpin the menu, which is fixed to the screen)
  const movers = () => document.querySelectorAll('.page-bg > :not(.nav-container, .skip-link)');
  // (while it is moved, nothing may stick out at the side: a phone would zoom out to show it, which
  // also stops the slide)
  function follow(x, animate) {
    if (x) root.classList.add('swipe-moving');
    else if (!animate) root.classList.remove('swipe-moving');
    else setTimeout(() => { if (!start) root.classList.remove('swipe-moving'); }, 320);
    movers().forEach((el) => {
      el.style.transition = animate ? 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)' : 'none';
      el.style.transform = x ? `translateX(${x.toFixed(1)}px)` : '';
    });
  }

  // Something under the finger that scrolls sideways itself, or takes typing
  function ownsSideways(el) {
    for (; el && el !== document.body; el = el.parentElement) {
      if (el.matches('input, textarea, select, [contenteditable]')) return true;
      if (el.scrollWidth > el.clientWidth + 1) {
        const overflow = getComputedStyle(el).overflowX;
        if (overflow === 'auto' || overflow === 'scroll') return true;
      }
    }
    return false;
  }

  let start = null;
  let sideways = null;   // null until decided, then true or false
  let dx = 0;

  function onStart(event) {
    start = null;
    if (leaving || event.touches.length !== 1 || here < 0) return;
    const t = event.touches[0];
    if (t.clientX < EDGE || t.clientX > window.innerWidth - EDGE) return;
    if (ownsSideways(event.target)) return;
    start = { x: t.clientX, y: t.clientY, time: event.timeStamp };
    sideways = null;
    dx = 0;
  }

  function onMove(event) {
    if (!start) return;
    if (event.touches.length !== 1) { cancel(); return; }
    const t = event.touches[0];
    dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (sideways === null) {
      if (Math.abs(dx) < DECIDE && Math.abs(dy) < DECIDE) return;
      sideways = Math.abs(dx) > SIDEWAYS * Math.abs(dy);
      if (!sideways) { start = null; return; }
    }
    if (event.cancelable) event.preventDefault();   // a sideways swipe does not scroll the page as well
    // past either end it moves less, like something at its limit
    const end = (dx < 0 && here === pages.length - 1) || (dx > 0 && here === 0);
    const shift = Math.sign(dx) * Math.min(FOLLOW_MAX, Math.abs(dx) * FOLLOW * (end ? 0.4 : 1));
    follow(shift, false);
  }

  function cancel() {
    start = null;
    follow(0, true);
  }

  function onEnd(event) {
    if (!start || !sideways) { start = null; return; }
    const speed = Math.abs(dx) / Math.max(1, event.timeStamp - start.time);
    const far = Math.abs(dx) > FAR * window.innerWidth || (Math.abs(dx) > 50 && speed > FLICK);
    const dir = dx < 0 ? 1 : -1;
    const to = here + dir;
    if (!far || to < 0 || to >= pages.length) { cancel(); return; }
    start = null;
    leaving = dir;
    // What slides out: the slide on screen (the browser loses a page picture taken far down a long
    // page), or the whole page in the plain layout
    const middle = window.innerHeight / 2;
    const unit = [...document.querySelectorAll('.slide-unit')].find((u) => {
      const box = u.getBoundingClientRect();
      return box.top <= middle && box.bottom > middle;
    });
    const out = unit || document.querySelector('.page-bg');
    out.style.viewTransitionName = 'swipe-page';
    out.setAttribute('data-swipe-out', '');
    root.classList.add('swiping', dir > 0 ? 'swipe-next' : 'swipe-prev');
    try { sessionStorage.setItem(KEY, JSON.stringify({ to: pages[to], dir, at: Date.now() })); } catch (e) { /* it opens without the slide */ }
    location.href = pages[to];
  }

  function wire() {
    findPages();
    if (here < 0) return;
    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', cancel, { passive: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
})();
