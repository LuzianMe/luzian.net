// Show clean URLs: turn an old "/contact/index.html" link into "/contact/" in the address bar
if (location.pathname.endsWith('/index.html')) {
  history.replaceState(null, '', location.pathname.slice(0, -'index.html'.length) + location.search + location.hash);
}

/* ==========================================================================
   Antigravity Visual Effects Engine: luzian.net
   - Spotlight Cursor Glow
   - 3D Interactive Card Tilt
   - Atmospheric Ambient Particle System
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

  // Initialize once DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initCardTilt();
      initParticleCanvas();
    });
  } else {
    initCardTilt();
    initParticleCanvas();
  }
})();
