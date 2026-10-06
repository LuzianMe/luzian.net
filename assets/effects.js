// Show clean URLs: turn an old "/contact/index.html" link into "/contact/" in the address bar
if (location.pathname.endsWith('/index.html')) {
  history.replaceState(null, '', location.pathname.slice(0, -'index.html'.length) + location.search + location.hash);
}

/* ==========================================================================
   Antigravity Visual Effects Engine: luzian.net
   - Spotlight Cursor Glow
   - 3D Interactive Card Tilt
   - Atmospheric Ambient Particle System
   - Calm mode: on the home page the menus and labels fade away when nothing moves (or at once, with ?calm)
   ========================================================================== */

(function () {
  'use strict';

  // Respect the OS "reduce motion" setting; skip mouse-only effects on touch screens
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasMouse = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  // 1. Mouse Spotlight Tracker
  let mouseX = window.innerWidth / 2;
  let mouseY = window.innerHeight / 2;
  let currentX = mouseX;
  let currentY = mouseY;

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  });

  function updateSpotlight() {
    // Smooth dampening / lerp
    currentX += (mouseX - currentX) * 0.12;
    currentY += (mouseY - currentY) * 0.12;

    document.documentElement.style.setProperty('--mouse-x', `${currentX.toFixed(1)}px`);
    document.documentElement.style.setProperty('--mouse-y', `${currentY.toFixed(1)}px`);

    requestAnimationFrame(updateSpotlight);
  }
  if (hasMouse && !reduceMotion) requestAnimationFrame(updateSpotlight);

  // 2. 3D Interactive Card Tilt on Hover
  function initCardTilt() {
    if (!hasMouse || reduceMotion) return;
    const cards = document.querySelectorAll('.grid-item');
    cards.forEach((card) => {
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const cardX = e.clientX - rect.left;
        const cardY = e.clientY - rect.top;

        // Normalized: -1 to +1 from center
        const normalX = (cardX / rect.width) * 2 - 1;
        const normalY = (cardY / rect.height) * 2 - 1;

        const rotateY = (normalX * 9).toFixed(2);
        const rotateX = (-normalY * 9).toFixed(2);

        card.style.transform = `perspective(800px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-4px) scale(1.03)`;
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
      });
    });
  }

  // 3. Lightweight Atmospheric Dust Particles
  function initParticleCanvas() {
    const canvas = document.getElementById('ambient-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let width, height;
    let particles = [];
    const PARTICLE_COUNT = 32;

    function resize() {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', () => {
      resize();
      if (reduceMotion) requestAnimationFrame(animate); // resizing clears the still canvas
    });

    class Particle {
      constructor() {
        this.reset();
        this.y = Math.random() * height; // initial random distribution
      }

      reset() {
        this.x = Math.random() * width;
        this.y = height + 10;
        this.size = Math.random() * 2 + 0.8;
        this.speedY = Math.random() * 0.35 + 0.15;
        this.speedX = (Math.random() - 0.5) * 0.25;
        this.opacity = Math.random() * 0.45 + 0.15;
        this.pulseSpeed = Math.random() * 0.02 + 0.01;
        this.pulse = Math.random() * Math.PI;
      }

      update() {
        this.y -= this.speedY;
        this.x += this.speedX;
        this.pulse += this.pulseSpeed;

        if (this.y < -10 || this.x < -10 || this.x > width + 10) {
          this.reset();
        }
      }

      draw() {
        const currentOpacity = this.opacity * (0.7 + 0.3 * Math.sin(this.pulse));
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(56, 189, 248, ${currentOpacity.toFixed(3)})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = 'rgba(56, 189, 248, 0.8)';
        ctx.fill();
      }
    }

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particles.push(new Particle());
    }

    function animate() {
      ctx.clearRect(0, 0, width, height);
      particles.forEach((p) => {
        if (!reduceMotion) p.update();
        p.draw();
      });
      // With reduced motion, draw the particles once as a still starfield
      if (!reduceMotion) requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  }

  // 4. Calm mode (home page only): after a few quiet seconds at the top of the page, the menu, the
  //    language switch and the labels fade out, leaving just the water, the snake and the logo.
  //    Any mouse movement, touch, key press or scroll brings them back.
  function initCalmMode() {
    if (!document.body.classList.contains('home')) return;
    const IDLE_MS = 8000;       // quiet time before the page goes calm
    const MOVE_PX = 4;          // ignore tiny mouse jitters
    const TOP_PX = 40;          // only when the page is at the top
    // luzian.net/?calm (the footer's "Calm mode" link): start calm at once and stay that way, so the page
    // can be left on a screen. Mouse moves, clicks, taps and scrolling do NOT end it (they just play with
    // the water); a key press does, or on a touch screen a touch held for a moment.
    const HOLD_MS = 800;        // how long a touch is held to leave the calm view
    const HOLD_SLOP_PX = 12;    // ...and how far the finger may wander meanwhile
    const MODIFIERS = ['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'OS', 'CapsLock', 'Fn', 'NumLock'];
    const showMode = /[?&]calm(?:&|=|$)/.test(location.search);
    let showing = showMode;
    let hint = null;
    let timer = 0;
    let holdTimer = 0;
    let holdX = 0;
    let holdY = 0;
    let lastX = null;
    let lastY = null;

    function calm() {
      if (window.scrollY < TOP_PX && document.visibilityState === 'visible') {
        document.body.classList.add('calm');
      }
    }

    function wake() {
      showing = false;
      clearTimeout(holdTimer);
      document.body.classList.remove('calm', 'calm-show');
      if (hint) { hint.remove(); hint = null; }
      clearTimeout(timer);
      timer = setTimeout(calm, IDLE_MS);
    }

    function startShow() {
      window.scrollTo(0, 0);
      document.body.classList.add('calm', 'calm-show');
      hint = document.createElement('p');
      hint.className = 'calm-hint';
      const touch = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
      const spanish = document.documentElement.lang === 'es';
      hint.textContent = touch
        ? (spanish ? 'Mantén pulsado para volver' : 'Touch and hold to return')
        : (spanish ? 'Pulsa una tecla para volver' : 'Press any key to return');
      document.body.appendChild(hint);
    }

    document.addEventListener('pointermove', (e) => {
      if (showing) return;
      if (lastX !== null && Math.abs(e.clientX - lastX) < MOVE_PX && Math.abs(e.clientY - lastY) < MOVE_PX) return;
      lastX = e.clientX;
      lastY = e.clientY;
      wake();
    }, { passive: true });
    ['pointerdown', 'wheel', 'touchstart'].forEach((type) => {
      document.addEventListener(type, () => { if (!showing) wake(); }, { passive: true });
    });
    window.addEventListener('scroll', () => { if (!showing) wake(); }, { passive: true });

    // A key press. In the calm view, a lone modifier or a shortcut (Alt+Tab, Ctrl+R, ...) does not count
    document.addEventListener('keydown', (e) => {
      if (showing && (e.ctrlKey || e.metaKey || e.altKey || MODIFIERS.indexOf(e.key) !== -1)) return;
      wake();
    });

    // In the calm view a touch held still for a moment leaves it (a plain tap or a swipe just plays)
    document.addEventListener('pointerdown', (e) => {
      if (!showing || e.pointerType === 'mouse') return;
      holdX = e.clientX;
      holdY = e.clientY;
      clearTimeout(holdTimer);
      holdTimer = setTimeout(wake, HOLD_MS);
    }, { passive: true });
    document.addEventListener('pointermove', (e) => {
      if (holdTimer && (Math.abs(e.clientX - holdX) > HOLD_SLOP_PX || Math.abs(e.clientY - holdY) > HOLD_SLOP_PX)) {
        clearTimeout(holdTimer);
        holdTimer = 0;
      }
    }, { passive: true });
    ['pointerup', 'pointercancel'].forEach((type) => {
      document.addEventListener(type, () => { clearTimeout(holdTimer); holdTimer = 0; }, { passive: true });
    });
    document.addEventListener('visibilitychange', () => { if (!showing) wake(); });
    if (showMode) startShow(); else wake();
  }

  // Initialize once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initCardTilt();
      initParticleCanvas();
      initCalmMode();
    });
  } else {
    initCardTilt();
    initParticleCanvas();
    initCalmMode();
  }
})();
