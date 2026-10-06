// Water effect for the rotating ouroboros background (WebGL).
//
// The snake is drawn into a texture and a fragment shader bends it like light passing through
// water: a slow swell, soft shimmering light, and rings that spread out where the mouse moves
// or a finger touches the page. The spin is the same 120-second turn as the CSS version and stays
// in sync across pages. If anything is unavailable (WebGL, reduced motion, a slow device), the
// plain CSS version simply stays.
//
// Debugging: add ?water=off to a page's address to switch the effect off, or ?water=debug to
// expose window.__ouroWater (draw, ripple, dispose).
(function () {
  'use strict';

  const layer = document.querySelector('.ouro-bg-rotator');
  if (!layer) return;
  if (/[?&]water=off\b/.test(location.search)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const SPIN_SECONDS = 120;            // must match the CSS spin
  const PAD = 0.12;                    // room for the glow on each side, as a fraction of the layer
  const GLOW_BLUR = 70;                // canvas blur that matches the CSS drop-shadow(0 0 35px ...)
  const GLOW_COLOR = 'rgba(56, 189, 248, 0.35)';
  const MAX_RIPPLES = 8;
  const FRAME_MS = 1000 / 30;          // 30 frames a second is plenty for slow water
  const MAX_DPR = 1.5;
  const MAX_TEXTURE = 2048;
  const TIME_WRAP = 600;               // keeps shader numbers small; all wave speeds repeat in this time

  // ---------------------------------------------------------------------------------------------
  // Shaders
  // ---------------------------------------------------------------------------------------------
  const VERTEX = `
    attribute vec2 a_pos;
    varying vec2 v_uv;
    void main() {
      v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);   // 0..1, y pointing down like the page
      gl_Position = vec4(a_pos, 0.0, 1.0);
    }`;

  const FRAGMENT = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif

    varying vec2 v_uv;
    uniform sampler2D u_tex;
    uniform float u_time;
    uniform float u_angle;
    uniform vec4 u_ripples[${MAX_RIPPLES}];   // x, y, start time, strength

    // One travelling wave: bends the picture along its direction and adds a bit of shimmer
    void wave(vec2 k, float freq, float speed, float amp, vec2 p, inout vec2 disp, inout float light) {
      float ph = freq * dot(k, p) + u_time * speed;
      disp  += k * (amp * cos(ph));
      light -= amp * freq * sin(ph) * 0.45;
    }

    void main() {
      vec2 p = v_uv;
      vec2 disp = vec2(0.0);
      float light = 0.0;

      // Calm swell: four waves going different ways (speeds are whole multiples of 2*pi/600
      // so the motion repeats cleanly when the clock wraps)
      wave(vec2( 0.800,  0.600), 14.0, 0.7016, 0.0065, p, disp, light);
      wave(vec2(-0.500,  0.866), 23.0, 1.1002, 0.0046, p, disp, light);
      wave(vec2( 0.200, -0.980), 34.0, 1.4975, 0.0032, p, disp, light);
      wave(vec2(-0.900, -0.436), 47.0, 2.0003, 0.0021, p, disp, light);

      // Rings from the pointer
      for (int i = 0; i < ${MAX_RIPPLES}; i++) {
        vec4 r = u_ripples[i];
        float age = u_time - r.z;
        if (age > 0.0 && age < 5.5 && r.w > 0.0) {
          vec2 dv = p - r.xy;
          float dist = length(dv);
          float x = dist - age * 0.16;                       // the ring front travels outward
          float width = 0.018 + age * 0.014;                 // and widens as it goes
          float env = exp(-(x * x) / (width * width));
          float osc = cos(x * 70.0 / (1.0 + age * 0.5));
          float h = env * osc * r.w * exp(-age * 0.65) / (1.0 + dist * 2.5);
          disp  += (dv / max(dist, 0.0005)) * h * 0.045;
          light += h * 0.7;
        }
      }

      // Look up the snake where the water bends the light, then undo the spin
      vec2 q = p + disp - 0.5;
      float c = cos(u_angle);
      float s = sin(u_angle);
      vec2 t = vec2(c * q.x + s * q.y, -s * q.x + c * q.y) + 0.5;
      vec4 col = texture2D(u_tex, t);
      gl_FragColor = vec4(min(col.rgb * (1.0 + light), vec3(1.0)), col.a);
    }`;

  // ---------------------------------------------------------------------------------------------
  // Setup (any failure leaves the CSS version in place)
  // ---------------------------------------------------------------------------------------------
  const canvas = document.createElement('canvas');
  canvas.className = 'ouro-water';
  canvas.setAttribute('aria-hidden', 'true');

  const gl = canvas.getContext('webgl', {
    alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
  });
  if (!gl) return;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.warn('Water effect shader failed:', gl.getShaderInfoLog(shader));
      return null;
    }
    return shader;
  }

  const vs = compile(gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl.FRAGMENT_SHADER, FRAGMENT);
  if (!vs || !fs) return;

  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('Water effect program failed:', gl.getProgramInfoLog(program));
    return;
  }
  gl.useProgram(program);

  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const uTime = gl.getUniformLocation(program, 'u_time');
  const uAngle = gl.getUniformLocation(program, 'u_angle');
  const uRipples = gl.getUniformLocation(program, 'u_ripples');
  gl.uniform1i(gl.getUniformLocation(program, 'u_tex'), 0);
  gl.clearColor(0, 0, 0, 0);

  const texture = gl.createTexture();
  const ripples = new Float32Array(MAX_RIPPLES * 4);   // x, y, start time (wrapped), strength
  const rippleStart = new Float64Array(MAX_RIPPLES);   // unwrapped start times, for expiry
  let nextRipple = 0;

  let running = false;
  let started = false;
  let rafId = 0;
  let lastDraw = 0;
  let slowFrames = 0;
  let measured = 0;
  let image = null;

  // The canvas is a little bigger than the layer so the glow is not cut off at the edges
  function sizeFor() {
    const css = layer.offsetWidth * (1 + 2 * PAD);
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    return Math.max(64, Math.min(MAX_TEXTURE, Math.round(css * dpr)));
  }

  function buildTexture() {
    const size = sizeFor();
    const art = size / (1 + 2 * PAD);
    const offset = (size - art) / 2;
    const scale = size / (layer.offsetWidth * (1 + 2 * PAD));   // canvas pixels per CSS pixel

    const flat = document.createElement('canvas');
    flat.width = flat.height = size;
    const ctx = flat.getContext('2d');
    ctx.shadowColor = GLOW_COLOR;
    ctx.shadowBlur = GLOW_BLUR * scale;
    ctx.drawImage(image, offset, offset, art, art);

    canvas.width = canvas.height = size;
    gl.viewport(0, 0, size, size);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, flat);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  // ---------------------------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------------------------
  function draw(seconds) {
    // Same turn as the CSS spin, from the wall clock so every page agrees
    const angle = ((Date.now() / 1000) % SPIN_SECONDS) / SPIN_SECONDS * Math.PI * 2;
    for (let i = 0; i < MAX_RIPPLES; i++) {
      if (seconds - rippleStart[i] > 5.5) ripples[i * 4 + 3] = 0;   // expired
    }
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uTime, seconds % TIME_WRAP);
    gl.uniform1f(uAngle, angle);
    gl.uniform4fv(uRipples, ripples);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function addRipple(clientX, clientY, strength) {
    if (!started) return;
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    if (x < -0.25 || x > 1.25 || y < -0.25 || y > 1.25) return;   // far from the snake: nothing to see
    const now = performance.now() / 1000;
    const i = nextRipple;
    nextRipple = (nextRipple + 1) % MAX_RIPPLES;
    ripples[i * 4] = x;
    ripples[i * 4 + 1] = y;
    ripples[i * 4 + 2] = now % TIME_WRAP;
    ripples[i * 4 + 3] = strength;
    rippleStart[i] = now;
  }

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    if (now - lastDraw < FRAME_MS - 1) return;

    // If the device cannot keep up, give the page back to the plain CSS version
    if (lastDraw) {
      measured++;
      if (measured > 30 && measured <= 90 && now - lastDraw > 70) slowFrames++;
      if (measured === 90 && slowFrames > 30) { dispose(); return; }
    }
    lastDraw = now;
    draw(now / 1000);
  }

  function start() {
    if (running) return;
    running = true;
    rafId = requestAnimationFrame(frame);
  }

  function dispose() {
    running = false;
    started = false;
    cancelAnimationFrame(rafId);
    window.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('resize', onResize);
    layer.classList.remove('water-on');
    canvas.remove();
  }

  // ---------------------------------------------------------------------------------------------
  // Pointer: a firm ripple on press or touch, a soft trail while the mouse moves
  // ---------------------------------------------------------------------------------------------
  let lastX = -1e9;
  let lastY = -1e9;
  let lastMoveTime = 0;

  function onDown(event) { addRipple(event.clientX, event.clientY, 1.0); }

  function onMove(event) {
    const now = performance.now();
    if (now - lastMoveTime < 110) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    if (dx * dx + dy * dy < 40 * 40) return;
    lastMoveTime = now;
    lastX = event.clientX;
    lastY = event.clientY;
    addRipple(event.clientX, event.clientY, 0.45);
  }

  let resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (started) { buildTexture(); draw(performance.now() / 1000); } }, 150);
  }

  canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); dispose(); });

  // ---------------------------------------------------------------------------------------------
  // Go: load the art, draw one frame, then swap it in for the CSS background
  // ---------------------------------------------------------------------------------------------
  image = new Image();
  image.onload = () => {
    layer.appendChild(canvas);
    buildTexture();
    draw(performance.now() / 1000);
    started = true;
    layer.classList.add('water-on');
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('resize', onResize);
    start();
  };
  image.onerror = () => { /* keep the CSS version */ };
  image.src = '/assets/bg_ouro.svg';

  if (/[?&]water=debug\b/.test(location.search)) {
    window.__ouroWater = {
      draw: (seconds) => draw(seconds),
      ripple: (x, y, strength) => addRipple(x, y, strength === undefined ? 1 : strength),
      stop: () => { running = false; cancelAnimationFrame(rafId); },
      activeRipples: () => { let n = 0; for (let i = 0; i < MAX_RIPPLES; i++) if (ripples[i * 4 + 3] > 0) n++; return n; },
      // average milliseconds per frame, including waiting for the GPU to finish
      cost: (frames) => {
        const probe = new Uint8Array(4);
        const t = performance.now();
        for (let i = 0; i < frames; i++) { draw(i * 0.033); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, probe); }
        return (performance.now() - t) / frames;
      },
      size: () => canvas.width,
      dispose,
    };
  }
})();
