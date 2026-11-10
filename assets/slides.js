// Slides: Home and Career cut into full-screen slides (the layout is in assets/style.css, "Slides").
//
// The browser's own scroll snapping moves from slide to slide; this file adds what CSS cannot:
//  - the depth gauge on the right (a mark per slide, the bright one is where you are; click to go there)
//  - the text of a slide arriving with it, a line at a time, the first time it is reached
//  - how deep the visitor is: --depth on <html> (0 at the top, 1 at the last slide) for the veil that
//    darkens the water, and a "slidechange" event on window ({ index, count, depth }) for the water's depth
//  - the moment the page starts to move after resting, a "slidemove" event ({ direction }) that the water
//    answers at once with a wave from that side
// It only runs on a page with slides, when html.slides is set (assets/theme.js).
(function () {
  'use strict';

  const root = document.documentElement;
  if (!root.classList.contains('slides') || !document.querySelector('.slide')) return;

  const spanish = root.lang === 'es';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const RISE = '.slide-panel > :not(.sub-slide), .slide-panel > .sub-slide > *, .slide-intro header > *, .sub-slide > *';

  if (!reduceMotion.matches) root.classList.add('slides-anim');

  // the walking body on Setup holds still for visitors who asked for less motion
  if (reduceMotion.matches) document.querySelectorAll('.art-body svg').forEach((svg) => svg.pauseAnimations());

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

  // ---- the years ruler (Career, Experience) -------------------------------------------------------
  // Drawn from the list beside it: each role's data-span ("2016-2022", "2022-" for still going) and
  // data-short label, and data-mark for a role held within another. Runs to the current year.
  function drawRuler(svg, list) {
    const NS = 'http://www.w3.org/2000/svg';
    const now = new Date().getFullYear() + 1;
    const roles = [...list.querySelectorAll('li[data-span]')].map((li) => {
      const [from, to] = li.dataset.span.split('-');
      return { from: Number(from), to: to ? Number(to) : now, name: li.dataset.short || '' };
    }).sort((a, b) => a.from - b.from);
    const marks = [...list.querySelectorAll('li[data-mark]')].map((li) => Number(li.dataset.mark));
    if (!roles.length) return;
    const first = roles[0].from;
    const y = (year) => 20 + (year - first) * (500 / (now - first));
    const add = (tag, attrs, text) => {
      const el = document.createElementNS(NS, tag);
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      if (text) el.textContent = text;
      svg.appendChild(el);
      return el;
    };
    add('line', { class: 'art-axis', x1: 150, y1: y(first), x2: 150, y2: y(now) });
    for (let year = first; year <= now; year++) {
      add('line', { class: 'art-tick', x1: year % 2 ? 142 : 136, y1: y(year), x2: 150, y2: y(year) });
      if (year % 2 === 0) add('text', { class: 'art-muted', x: 128, y: y(year) + 5, 'text-anchor': 'end' }, String(year));
    }
    roles.forEach((role, i) => {
      const top = y(role.from) + 2;
      const height = Math.max(8, y(role.to) - y(role.from) - 4);
      add('rect', { class: 'art-span', x: 156, y: top, width: 12, height, rx: 6, style: `--d:${i};--o:${(0.35 + 0.65 * (i + 1) / roles.length).toFixed(2)}` });
      add('text', { class: 'art-label', x: 182, y: top + height / 2 + 5, style: `--d:${i + 2}` }, role.name);
    });
    marks.forEach((year) => add('circle', { class: 'art-dot', cx: 162, cy: y(year), r: 5, style: `--d:${roles.length + 2}` }));
  }
  document.querySelectorAll('.art-ruler svg').forEach((svg) => {
    const list = svg.closest('.slide-panel').querySelector('.gear-list');
    if (list) drawRuler(svg, list);
  });

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
    const direction = index > current ? 1 : -1;
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
    window.dispatchEvent(new CustomEvent('slidechange', { detail: { index, count: units.length, depth, first, direction } }));
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

  // The first movement after the page has rested: tell the water which way, straight away (before the
  // new slide has even arrived). The page counts as resting again after a short quiet spell.
  let restY = window.scrollY;
  let moving = false;
  let restTimer = 0;
  function onMove() {
    const y = window.scrollY;
    if (!moving && Math.abs(y - restY) >= 1) {
      moving = true;
      window.dispatchEvent(new CustomEvent('slidemove', { detail: { direction: y > restY ? 1 : -1 } }));
    }
    clearTimeout(restTimer);
    restTimer = setTimeout(() => { moving = false; restY = window.scrollY; }, 180);
  }

  setUp();
  window.addEventListener('scroll', queue, { passive: true });
  window.addEventListener('scroll', onMove, { passive: true });
  let resizeTimer = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(setUp, 150); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(setUp);

  // A link to a slide (/setup/#homelab, from Home): the browser jumps there before the slides are laid
  // out, and the snapping can pull the page back to the top, so once the layout has settled, go again
  function goToLinked() {
    const id = decodeURIComponent(location.hash.slice(1));
    const target = id && document.getElementById(id);
    const unit = target && units.find((u) => u === target || u.contains(target) || target.contains(u));
    // instant: a smooth scroll down through every slide can be cut short on the way
    if (unit && Math.abs(unit.getBoundingClientRect().top) > 2) unit.scrollIntoView({ behavior: 'instant', block: 'start' });
  }
  // (tried again once the page has loaded, as long as the visitor has not started moving it themselves)
  if (location.hash) {
    let touched = false;
    const mine = () => { touched = true; };
    ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((type) => window.addEventListener(type, mine, { once: true, passive: true }));
    const go = () => { if (!touched) goToLinked(); };
    const settled = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    settled.then(() => requestAnimationFrame(go));
    const later = () => setTimeout(go, 400);
    if (document.readyState === 'complete') later(); else window.addEventListener('load', later, { once: true });
    // the browser repeats its own jump (to the card, not its slide) late in loading: put it right again
    const until = Date.now() + 4000;
    window.addEventListener('scrollend', () => { if (Date.now() < until) go(); });
  }
  window.addEventListener('hashchange', goToLinked);
})();
