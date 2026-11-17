// The graph of my homelab notes, live: Setup's Homelab slide and its own page (/setup/homelab/).
//
// The graph is notes-graph/graph.html, a public copy of the notes built with Myco Notes by
// scripts/homelab_graph.py (only the labels I approved, no note names). It is shown in an <iframe>, in the
// colours of the site's theme (Water: Deep sea, Fire: Amber terminal), and follows the theme switch.
//  - data-notes-graph="preview" (the slide): it only turns by itself and takes no touch or wheel, so the page
//    keeps its scrolling and swiping. It is made when the slide comes near and paused while off screen. The
//    still picture under it stays until the graph says it is drawn, and for good with reduced motion, data
//    saver or no JavaScript.
//  - data-notes-graph="full" (the page): the whole graph, to turn and zoom.
(function () {
  'use strict';

  const SRC = '/notes-graph/graph.html';
  const THEMES = { water: 'deepsea', fire: 'amber' };
  const root = document.documentElement;
  const theme = () => THEMES[root.getAttribute('data-theme')] || THEMES.water;
  const boxes = [...document.querySelectorAll('[data-notes-graph]')];
  if (!boxes.length) return;

  const frames = [];
  const tell = (frame, message) => { if (frame.contentWindow) frame.contentWindow.postMessage(message, location.origin); };

  function start(box) {
    const preview = box.dataset.notesGraph === 'preview';
    const frame = document.createElement('iframe');
    frame.className = 'notes-graph-frame';
    frame.src = `${SRC}?theme=${theme()}${preview ? '&interactive=0' : ''}`;
    frame.title = root.lang === 'es' ? 'Mis notas del homelab como una red' : 'My homelab notes as a network';
    if (preview) {
      // the still's description already says what it shows; the moving copy is decoration
      frame.tabIndex = -1;
      frame.setAttribute('aria-hidden', 'true');
    }
    box.appendChild(frame);
    frames.push(frame);
    return frame;
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin || !event.data) return;
    const frame = frames.find((f) => f.contentWindow === event.source);
    if (!frame) return;
    if (event.data.type === 'myco-ready') frame.parentElement.classList.add('live');
    if (event.data.type === 'myco-error') frame.parentElement.classList.remove('live');
  });

  window.addEventListener('themechange', () => frames.forEach((frame) => tell(frame, { type: 'myco-theme', theme: theme() })));

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = navigator.connection && navigator.connection.saveData;

  boxes.forEach((box) => {
    if (box.dataset.notesGraph === 'full') {
      start(box);
      return;
    }
    if (reduceMotion || saveData || !('IntersectionObserver' in window)) return;
    let frame = null;
    // made a screen ahead, so it is drawn by the time the slide arrives
    const near = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      near.disconnect();
      frame = start(box);
    }, { rootMargin: '100% 0px' });
    near.observe(box);
    // and resting while it is off screen (the graph also rests by itself in a hidden tab)
    new IntersectionObserver(([entry]) => {
      if (frame) tell(frame, { type: entry.isIntersecting ? 'myco-resume' : 'myco-pause' });
    }).observe(box);
  });
})();
