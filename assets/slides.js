// Slides: Home and Career cut into full-screen slides (the layout is in assets/style.css, "Slides").
//
// The browser's own scroll snapping moves from slide to slide; this file adds what CSS cannot:
//  - the depth gauge on the right (a mark per slide, the bright one is where you are; click to go there)
//  - the text of a slide arriving with it, a line at a time, the first time it is reached
//  - the small logo in the menu once past the first slide (Home)
//  - how deep the visitor is: --depth on <html> (0 at the top, 1 at the last slide) for the veil that
//    darkens the water, and a "slidechange" event on window ({ index, count, depth }) that the water
//    effect answers with a ripple
// It only runs on a page with slides, when html.slides is set (assets/theme.js).
(function () {
  'use strict';

  const root = document.documentElement;
  if (!root.classList.contains('slides') || !document.querySelector('.slide')) return;

  const spanish = root.lang === 'es';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const RISE = '.slide-panel > :not(.sub-slide), .slide-panel > .sub-slide > *, .slide-intro header > *, .sub-slide > *';

  if (!reduceMotion.matches) root.classList.add('slides-anim');

  // A dimmer between the water and the page, darker the deeper you go (style.css: .depth-veil)
  const veil = document.createElement('div');
  veil.className = 'depth-veil';
  veil.setAttribute('aria-hidden', 'true');
  const page = document.querySelector('.page-bg');
  page.parentNode.insertBefore(veil, page);

  // ---- the slides on this screen ----------------------------------------------------------------
  // A slide is a .slide or .sub-slide that is a box of its own right now: on a phone the cards of a
  // shared slide become slides of their own (their .slide wrapper is display: contents)
  let units = [];
  function findUnits() {
    return [...document.querySelectorAll('.slide, .sub-slide')].filter((el) => {
      if (getComputedStyle(el).display === 'contents') return false;
      const outer = el.parentElement.closest('.slide, .sub-slide');
      return !outer || getComputedStyle(outer).display === 'contents';
    });
  }

  // What arrives, in order (--i staggers them): the lines of a card, or the cards of a shared slide
  function markRise(unit) {
    const items = [...unit.querySelectorAll(RISE)].filter((el) => el.closest('.slide-unit') === unit && !el.classList.contains('sub-slide'));
    items.forEach((el, i) => {
      el.classList.add('rise');
      el.style.setProperty('--i', String(Math.min(i, 6)));
    });
  }

  // ---- the depth gauge --------------------------------------------------------------------------
  const gauge = document.createElement('nav');
  gauge.className = 'depth-gauge';
  gauge.setAttribute('aria-label', spanish ? 'Secciones de la página' : 'Page sections');
  const list = document.createElement('ol');
  gauge.appendChild(list);
  document.body.appendChild(gauge);

  function goTo(i) {
    const unit = units[i];
    if (unit) unit.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
  }

  function buildGauge() {
    list.textContent = '';
    units.forEach((unit, i) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'gauge-step';
      const label = document.createElement('span');
      label.className = 'gauge-label';
      label.textContent = unit.dataset.title || String(i + 1);
      button.appendChild(label);
      button.addEventListener('click', () => goTo(i));
      item.appendChild(button);
      list.appendChild(item);
    });
  }

  // ---- the small logo in the menu (Home) ----------------------------------------------------------
  let navLogo = null;
  const pills = document.querySelector('.nav-pills');
  if (document.body.classList.contains('home') && pills) {
    const item = document.createElement('li');
    item.className = 'nav-logo-item';
    navLogo = document.createElement('a');
    navLogo.className = 'nav-logo';
    navLogo.href = '#';
    navLogo.setAttribute('aria-label', spanish ? 'Luzian, volver al inicio' : 'Luzian, back to the start');
    navLogo.innerHTML = '<img src="/assets/logo.svg" alt="" width="54" height="30">';
    navLogo.addEventListener('click', (event) => { event.preventDefault(); goTo(0); });
    item.appendChild(navLogo);
    pills.insertBefore(item, pills.firstChild);
  }

  // ---- where the visitor is ----------------------------------------------------------------------
  let current = -1;
  let flashTimer = 0;
  function update() {
    queued = false;
    // the slide that covers the middle of the screen
    const middle = window.innerHeight / 2;
    let index = 0;
    units.forEach((unit, i) => { if (unit.getBoundingClientRect().top <= middle) index = i; });
    if (index === current) return;
    const first = current === -1;
    current = index;
    const steps = list.querySelectorAll('.gauge-step');
    steps.forEach((step, i) => {
      step.setAttribute('aria-current', String(i === index));
      step.classList.remove('flash');
    });
    // the name of the new slide shows for a moment
    clearTimeout(flashTimer);
    if (!first && steps[index]) {
      steps[index].classList.add('flash');
      flashTimer = setTimeout(() => steps[index].classList.remove('flash'), 1400);
    }
    const depth = units.length > 1 ? index / (units.length - 1) : 0;
    root.style.setProperty('--depth', depth.toFixed(3));
    root.classList.toggle('past-hero', index > 0);
    if (navLogo) navLogo.tabIndex = index > 0 ? 0 : -1;
    window.dispatchEvent(new CustomEvent('slidechange', { detail: { index, count: units.length, depth, first } }));
  }
  let queued = false;
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };

  // The text of a slide arrives the first time a good part of it is on screen
  const arrival = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('arrived'); arrival.unobserve(entry.target); } });
    }, { threshold: 0.3 })
    : null;

  function setUp() {
    const found = findUnits();
    const same = found.length === units.length && found.every((u, i) => u === units[i]);
    // the footer shares the last screen with the last slide
    const footer = document.querySelector('footer');
    root.style.setProperty('--footer-h', `${footer ? footer.offsetHeight : 0}px`);
    if (same) { queue(); return; }
    units.forEach((u) => u.classList.remove('slide-unit', 'slide-last'));
    units = found;
    units.forEach((unit) => {
      unit.classList.add('slide-unit');
      markRise(unit);
      if (arrival && !unit.classList.contains('arrived')) arrival.observe(unit); else unit.classList.add('arrived');
    });
    if (units.length) units[units.length - 1].classList.add('slide-last');
    buildGauge();
    current = -1;
    queue();
  }

  setUp();
  window.addEventListener('scroll', queue, { passive: true });
  let resizeTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(setUp, 150); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(setUp);
})();
