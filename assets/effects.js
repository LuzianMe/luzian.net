// Show clean URLs: turn an old "/contact/index.html" link into "/contact/" in the address bar
if (location.pathname.endsWith('/index.html')) {
  history.replaceState(null, '', location.pathname.slice(0, -'index.html'.length) + location.search + location.hash);
}

// The copyright year in the footer (pages are written with a fixed year; this keeps it current)
document.querySelectorAll('.current-year').forEach((el) => { el.textContent = new Date().getFullYear(); });

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

  let spotlightRunning = false;

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    // Only run while the glow is still catching up with the mouse (an idle page does no work)
    if (hasMouse && !reduceMotion && !spotlightRunning) {
      spotlightRunning = true;
      requestAnimationFrame(updateSpotlight);
    }
  });

  function updateSpotlight() {
    // Smooth dampening / lerp
    currentX += (mouseX - currentX) * 0.12;
    currentY += (mouseY - currentY) * 0.12;

    document.documentElement.style.setProperty('--mouse-x', `${currentX.toFixed(1)}px`);
    document.documentElement.style.setProperty('--mouse-y', `${currentY.toFixed(1)}px`);

    if (Math.abs(mouseX - currentX) < 0.3 && Math.abs(mouseY - currentY) < 0.3) {
      spotlightRunning = false;   // arrived: stop until the mouse moves again
      return;
    }
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

  // 3. Lightweight Atmospheric Particles: blue dust in Water, cinders in Fire
  function initParticleCanvas() {
    const canvas = document.getElementById('ambient-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let width, height;
    let particles = [];
    let fire = document.documentElement.getAttribute('data-theme') === 'fire';
    const PARTICLE_COUNT = 32;
    const CINDER_COUNT = 46;

    // The dust takes the theme's colour (Water: blue specks)
    let tint = '56, 189, 248';
    function readTint() {
      const value = getComputedStyle(document.documentElement).getPropertyValue('--particle').trim();
      if (value) tint = value.split(/\s+/).join(', ');
    }
    readTint();

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
        ctx.fillStyle = `rgba(${tint}, ${currentOpacity.toFixed(3)})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = `rgba(${tint}, 0.8)`;
        ctx.fill();
      }
    }

    // Fire: a cinder is thrown up hot, flickers and now and then flares, cools from yellow through
    // orange to deep red, goes dark, and ends up sinking slowly like ash.
    const mix = (from, to, t) => from + (to - from) * t;

    // The colour of something glowing at this heat (1 = white-hot yellow ... 0 = out)
    function glowColor(heat) {
      if (heat > 0.6) {            // white-hot yellow to orange
        const t = (heat - 0.6) / 0.4;
        return [255, mix(120, 225, t), mix(24, 120, t * t)];
      }
      if (heat > 0.2) {            // orange to deep red
        const t = (heat - 0.2) / 0.4;
        return [mix(150, 255, t), mix(22, 120, t), mix(8, 24, t)];
      }
      const t = heat / 0.2;        // red to dark: out
      return [mix(60, 150, t), mix(10, 22, t), mix(6, 8, t)];
    }

    class Cinder {
      constructor(initial) {
        this.reset(initial);
      }

      reset(initial) {
        this.life = 5 + Math.random() * 7;                  // seconds from hot to out
        this.age = initial ? Math.random() * this.life : 0;
        this.x = Math.random() * width;
        this.y = initial ? Math.random() * height : height * (0.5 + Math.random() * 0.55);
        this.size = Math.random() * 1.7 + 0.8;
        this.rise = Math.random() * 0.55 + 0.35;            // pixels a frame (at 60 fps) while hot
        this.sway = (Math.random() - 0.5) * 0.3;
        this.phase = Math.random() * Math.PI * 2;
        this.flicker = 5 + Math.random() * 9;               // radians a second
        this.spark = 0;                                     // a sudden flare, 0..1
      }

      heat() {
        return Math.max(0, 1 - this.age / this.life);
      }

      update(dt) {
        const step = dt * 60;
        this.age += dt;
        const heat = this.heat();
        // Hot, it rises; cold, it is heavier than the air and sinks
        this.y += (-this.rise * heat * heat + 0.3 * (1 - heat) * (1 - heat)) * step;
        this.x += (this.sway + Math.sin(this.age * 1.4 + this.phase) * 0.22) * step;
        if (Math.random() < 0.012 * step) this.spark = 1;
        this.spark *= Math.pow(0.9, step);
        if (this.age > this.life || this.y > height + 12 || this.y < -12 || this.x < -12 || this.x > width + 12) {
          this.reset(false);
        }
      }

      draw() {
        const heat = this.heat();
        const [r, g, b] = glowColor(heat);
        const flicker = 0.55 + 0.45 * Math.sin(this.age * this.flicker + this.phase);
        let alpha = (0.25 + 0.75 * Math.min(1, heat * 1.6)) * flicker + this.spark * 0.9;
        alpha *= Math.min(1, heat / 0.18);                   // fades out as it goes dark
        alpha = Math.min(1, alpha) * 0.9;
        if (alpha < 0.02) return;
        const color = `${r.toFixed(0)}, ${g.toFixed(0)}, ${b.toFixed(0)}`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size * (1 + 0.6 * this.spark), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color}, ${alpha.toFixed(3)})`;
        ctx.shadowBlur = 5 + 12 * this.spark + 8 * heat;
        ctx.shadowColor = `rgba(${color}, ${Math.min(1, alpha * 1.3).toFixed(3)})`;
        ctx.fill();
      }
    }

    // A burst of sparks thrown out where the page is clicked or tapped (Fire only)
    class Spark {
      constructor(x, y) {
        const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.15;   // mostly upward, in a fan
        const speed = 70 + Math.random() * 230;                                // pixels a second
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = 0.9 + Math.random() * 1.4;
        this.age = 0;
        this.size = Math.random() * 1.4 + 0.8;
      }

      update(dt) {
        this.age += dt;
        this.vy += 150 * dt;                     // gravity pulls it back down
        this.vx *= Math.max(0, 1 - 1.3 * dt);    // and the air slows it
        this.x += this.vx * dt;
        this.y += this.vy * dt;
      }

      draw() {
        const heat = Math.max(0, 1 - this.age / this.life);
        const [r, g, b] = glowColor(heat);
        const alpha = Math.min(1, heat * 1.8) * 0.95;
        if (alpha < 0.02) return;
        const color = `${r.toFixed(0)}, ${g.toFixed(0)}, ${b.toFixed(0)}`;
        // a short streak along the way it is moving
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x - this.vx * 0.035, this.y - this.vy * 0.035);
        ctx.lineCap = 'round';
        ctx.lineWidth = this.size * (0.6 + heat);
        ctx.strokeStyle = `rgba(${color}, ${alpha.toFixed(3)})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = `rgba(${color}, ${alpha.toFixed(3)})`;
        ctx.stroke();
      }
    }

    let sparks = [];
    function burst(x, y) {
      if (!fire || reduceMotion) return;
      for (let i = 0; i < 12; i++) sparks.push(new Spark(x, y));
      if (sparks.length > 90) sparks.splice(0, sparks.length - 90);
    }
    document.addEventListener('pointerdown', (event) => burst(event.clientX, event.clientY), { passive: true });

    function populate() {
      particles = [];
      const count = fire ? CINDER_COUNT : PARTICLE_COUNT;
      for (let i = 0; i < count; i++) {
        particles.push(fire ? new Cinder(true) : new Particle());
      }
    }
    populate();

    window.addEventListener('themechange', (event) => {
      fire = event.detail.theme === 'fire';
      sparks = [];
      readTint();
      populate();
      if (reduceMotion) requestAnimationFrame(animate);
    });

    // Thirty frames a second is plenty for drifting specks (and half the work of sixty)
    const FRAME_MS = 1000 / 30;
    let last = 0;
    function animate(timestamp) {
      const now = timestamp || performance.now();
      if (!reduceMotion && last && now - last < FRAME_MS - 2) {
        requestAnimationFrame(animate);
        return;
      }
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
      last = now;
      ctx.clearRect(0, 0, width, height);
      particles.forEach((p) => {
        if (!reduceMotion) p.update(dt);
        p.draw();
      });
      if (sparks.length) {
        sparks.forEach((spark) => { spark.update(dt); spark.draw(); });
        sparks = sparks.filter((spark) => spark.age < spark.life);
      }
      // With reduced motion, draw the particles once as a still starfield
      if (!reduceMotion) requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);

    // ?water=debug: let tests move the particles on by hand (a hidden browser tab draws no frames)
    if (/[?&]water=debug\b/.test(location.search)) {
      window.__ouroParticles = {
        step: (seconds) => {
          for (let t = 0; t < seconds; t += 1 / 30) particles.forEach((p) => p.update(1 / 30));
          ctx.clearRect(0, 0, width, height);
          particles.forEach((p) => p.draw());
        },
        burst,
        sparkCount: () => sparks.length,
        // [hot, mid, dark, out] counts of cinders, to see the life cycle at work
        counts: () => {
          const c = [0, 0, 0, 0];
          particles.forEach((p) => { if (p.heat) { const h = p.heat(); c[h > 0.6 ? 0 : h > 0.2 ? 1 : h > 0.05 ? 2 : 3]++; } });
          return c;
        },
      };
    }
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
      const theme = touch
        ? (spanish ? 'Toca el logo para cambiar el tema' : 'Tap the logo to change the theme')
        : (spanish ? 'Haz clic en el logo para cambiar el tema' : 'Click the logo to change the theme');
      const leave = touch
        ? (spanish ? 'mantén pulsado para volver' : 'touch and hold to return')
        : (spanish ? 'pulsa una tecla para volver' : 'press any key to return');
      hint.textContent = `${theme} · ${leave}`;
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

    // In the calm view (not the ordinary idle calm) the logo is the theme switch, since the menus are away
    // The change starts when the tap is finished (the finger or button is up): doing it while the finger
    // was still landing or lifting made the animation misplaced on one phone.
    const logo = document.querySelector('img.logo');
    if (logo) {
      let tap = null;
      logo.addEventListener('pointerdown', (event) => {
        if (showing) tap = { id: event.pointerId, x: event.clientX, y: event.clientY };
      }, { passive: true });
      const finish = (event) => {
        if (!tap || event.pointerId !== tap.id) return;
        const start = tap;
        tap = null;
        const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
        if (event.type === 'pointercancel' || moved > 24 || !showing || !window.luzianTheme) return;   // a swipe is not a tap
        // the new theme spreads out from the very spot that was tapped
        window.luzianTheme.set(window.luzianTheme.get() === 'fire' ? 'water' : 'fire', { x: start.x, y: start.y });
      };
      document.addEventListener('pointerup', finish, { passive: true });
      document.addEventListener('pointercancel', finish, { passive: true });
    }

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
