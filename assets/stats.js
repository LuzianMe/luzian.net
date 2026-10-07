// Live numbers for checking how heavy the page is. Add ?stats to any address (for example
// luzian.net/?calm&stats) to see a small readout in the bottom-left corner:
//
//   page    how many frames a second the browser really draws, and the lowest a second has been
//   water   how many frames a second the water effect draws, and the CPU time of one (the
//           graphics chip's own time is not visible to a web page: if "page" drops, that is it)
//   battery the charge now, and since the page was opened (a quick way to compare a theme with
//           another, or with ?water=off, over a few minutes)
//
// "Copy report" puts all of it on the clipboard as text to paste into a message.
// This file is only loaded when ?stats is in the address (see effects.js).
(function () {
  'use strict';

  const OPENED = performance.now();
  const telemetry = window.__ouroTelemetry || null;       // counters kept by water.js when ?stats is on
  const root = document.documentElement;

  // ---- numbers ---------------------------------------------------------------------------------
  const page = { frames: 0, last: 0, long: 0, worst: 0, fps: 0, minFps: null, windowFrames: 0, windowStart: 0, totalFrames: 0, totalTime: 0 };
  const water = { fps: 0, drawMs: 0, windowFrames: 0, windowDraw: 0, lastFrames: 0, lastDraw: 0 };
  const battery = { start: null, now: null, charging: null };

  function onFrame(now) {
    requestAnimationFrame(onFrame);
    if (document.hidden) { page.last = 0; page.windowStart = 0; return; }
    if (page.last) {
      const gap = now - page.last;
      page.totalFrames++;
      page.totalTime += gap;
      if (gap > 50) page.long++;
      if (gap > page.worst) page.worst = gap;
    }
    page.last = now;
    if (!page.windowStart) { page.windowStart = now; page.windowFrames = 0; }
    page.windowFrames++;
    if (now - page.windowStart >= 1000) {
      page.fps = page.windowFrames * 1000 / (now - page.windowStart);
      // the first seconds are loading; do not count them as the lowest
      if (now - OPENED > 3000 && (page.minFps === null || page.fps < page.minFps)) page.minFps = page.fps;
      page.windowStart = now;
      page.windowFrames = 0;
    }
  }

  function readWater(elapsed) {
    if (!telemetry) return;
    const frames = telemetry.frames - water.lastFrames;
    const draw = telemetry.drawMs - water.lastDraw;
    water.fps = frames * 1000 / elapsed;
    water.drawMs = frames ? draw / frames : 0;
    water.lastFrames = telemetry.frames;
    water.lastDraw = telemetry.drawMs;
  }

  if (navigator.getBattery) {
    navigator.getBattery().then((b) => {
      battery.start = Math.round(b.level * 100);
      const update = () => { battery.now = Math.round(b.level * 100); battery.charging = b.charging; };
      update();
      b.addEventListener('levelchange', update);
      b.addEventListener('chargingchange', update);
    }).catch(() => { /* not available: the readout just says so */ });
  }

  // ---- text ------------------------------------------------------------------------------------
  const f1 = (n) => (Number.isFinite(n) ? n.toFixed(1) : '–');
  const mmss = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  function lines() {
    const out = [];
    out.push(`page   ${f1(page.fps)} fps   lowest ${page.minFps === null ? '–' : f1(page.minFps)}   slow frames ${page.long}`);
    if (telemetry) {
      const s = telemetry.state();
      out.push(`water  ${f1(water.fps)} fps   draw ${f1(water.drawMs)} ms (worst ${f1(telemetry.drawMax)})`);
      out.push(`effect ${s.started ? 'on' : 'OFF'}   logo ${s.logo ? 'on' : 'off'}   background ${s.background ? 'on' : 'off'}`);
    } else {
      out.push('water  not running (reduced motion, no WebGL, ?water=off, or the page dropped it)');
    }
    if (battery.start === null) out.push('battery not available in this browser');
    else out.push(`battery ${battery.now}%  (${battery.now - battery.start >= 0 ? '+' : '−'}${Math.abs(battery.now - battery.start)} since opened)${battery.charging ? '  charging' : ''}`);
    out.push(`${mmss(performance.now() - OPENED)}   ${root.dataset.theme}   dpr ${f1(window.devicePixelRatio)}   ${window.innerWidth}×${window.innerHeight}`);
    return out;
  }

  function report() {
    return ['luzian.net stats', `address ${location.pathname}${location.search}`, ...lines(), `slow frames: ${page.long}, worst frame ${f1(page.worst)} ms`, navigator.userAgent].join('\n');
  }

  // ---- the readout -----------------------------------------------------------------------------
  function build() {
    const style = document.createElement('style');
    style.textContent = `
      #stats-overlay { position: fixed; left: 8px; bottom: 8px; z-index: 100001; max-width: calc(100vw - 16px); box-sizing: border-box;
        padding: 6px 8px 7px; border-radius: 8px; background: rgba(0, 0, 0, 0.72); color: #e8f1ff;
        font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
      #stats-overlay pre { margin: 0; white-space: pre-wrap; font: inherit; pointer-events: none; }
      #stats-overlay button { margin-top: 5px; padding: 3px 8px; border-radius: 999px; border: 1px solid rgba(255,255,255,.4);
        background: rgba(255,255,255,.12); color: inherit; font: inherit; cursor: pointer; }`;
    document.head.appendChild(style);

    const box = document.createElement('div');
    box.id = 'stats-overlay';
    const text = document.createElement('pre');
    text.setAttribute('aria-hidden', 'true');
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Copy report';
    box.append(text, button);
    document.body.appendChild(box);
    // taps on the readout are not taps on the page (no ripples, sparks or calm-view exit)
    ['pointerdown', 'pointerup', 'pointermove', 'click'].forEach((type) => box.addEventListener(type, (e) => e.stopPropagation()));

    button.addEventListener('click', () => {
      const done = () => { button.textContent = 'Copied'; setTimeout(() => { button.textContent = 'Copy report'; }, 1500); };
      const fallback = () => {
        const area = document.createElement('textarea');
        area.value = report();
        area.style.cssText = 'position:fixed;top:-9999px';
        document.body.appendChild(area);
        area.select();
        try { document.execCommand('copy'); done(); } catch (e) { button.textContent = 'Could not copy'; }
        area.remove();
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(report()).then(done, fallback);
      else fallback();
    });

    let last = performance.now();
    setInterval(() => {
      const now = performance.now();
      readWater(now - last);
      last = now;
      text.textContent = lines().join('\n');
    }, 500);
  }

  requestAnimationFrame(onFrame);
  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})();
