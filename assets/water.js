// Water effect for the rotating ouroboros background (WebGL).
//
// The snake is drawn into a texture and a fragment shader bends it like light passing through
// water: a slow swell, soft shimmering light, and rings that spread out where the mouse moves
// or a finger touches the page. On top of that, "caustics" (the bright, drifting web of light you
// see on a pool floor) play across the snake, and a very faint, low-resolution copy of them lights
// the page behind it. The snake itself stays still, in the artwork's own position. If anything is
// unavailable (WebGL, reduced motion, a slow device), the plain CSS picture simply stays.
//
// The "Luzian" logo floats above the water. It is drawn crisp on a canvas of its own, with a soft
// shadow that falls on the water below and wobbles with the same waves and rings, a faint caustic
// light playing across the letters, and a small bob on the swell.
//
// Debugging: add ?water=off to a page's address to switch the effect off, or ?water=debug to
// expose window.__ouroWater (draw, ripple, dispose, and test helpers).
(function () {
  'use strict';

  const layer = document.querySelector('.ouro-bg-rotator');
  if (!layer) return;
  // The plain snake waits a little in case the effect takes over (see style.css); when it will not, show it now
  const plainLogoImage = document.querySelector('img.logo');
  const plainSnake = () => {
    layer.classList.add('water-off');
    if (plainLogoImage) plainLogoImage.classList.add('water-off');
  };
  if (/[?&]water=off\b/.test(location.search)) { plainSnake(); return; }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { plainSnake(); return; }

  // ?stats (assets/stats.js) shows how the effect is doing: how many frames, and how long each takes the CPU
  const telemetry = /[?&]stats\b/.test(location.search)
    ? (window.__ouroTelemetry = { frames: 0, drawMs: 0, drawMax: 0, state: () => ({ started, logo: logoOn, background: !!bg }) })
    : null;

  const PAD = 0.12;                    // room for the glow on each side, as a fraction of the layer
  const GLOW_BLUR = 70;                // canvas blur that matches the CSS drop-shadow(0 0 35px ...)
  const MAX_RIPPLES = 8;
  const FRAME_MS = 1000 / 30;          // 30 frames a second is plenty for slow water
  const MAX_DPR = 1.5;
  const MAX_TEXTURE = 2048;
  const TIME_WRAP = 600;               // keeps shader numbers small; all wave speeds repeat in this time
  const BG_SCALE = 0.35;               // the page background is drawn at this fraction of its size
  const BG_MAX_WIDTH = 720;            // ...and never wider than this many pixels
  const LOGO_PAD = 64;                 // room around the logo for its glow, in CSS pixels
  const LOGO_GLOW_BLUR = 28;           // canvas blur that matches the old CSS drop-shadow(0 0 14px ...)
  const LOGO_SHADOW_BLUR = 10;         // the shadow on the water is crisper than the glow

  // Strengths, chosen by trying them out. 1 is the neutral setting of each water dial.
  //   snake, background : caustics, 0 (off) to 1 (strong)
  //   swell*, shimmer   : the calm bending and soft light of the water on the snake
  //   ring*, trail      : rings from the pointer (trail 0 = rings only on a press or tap)
  const LEVELS = {
    snake: 1, background: 0.2,
    swellAmp: 0.55, swellSpeed: 1.2, shimmer: 3,
    ringAmp: 0.8, ringGlint: 1.4, ringSpeed: 1, ringLife: 1.3, trail: 1,
  };
  // The snake sits near the surface and the light; the background is the deep void. The same wave
  // field lights both, but up close it is finer, sharper and livelier, and far away it spreads
  // into bigger, softer, slower, bluer light.
  // The two themes (assets/theme.js). Same effects, different light:
  //   glow   : the halo round the snake      tint  : the faint light that fills the page
  //   absorb : what the water takes out of the light between the caustic lines (Water loses red first,
  //            so it goes blue; Fire loses blue and green first, so it goes red)
  //   body   : a tint on the snake's body    letters/halo/hi/shade : the logo's letters, halo, highlights, shadow
  const THEMES = {
    water: { glow: 'rgba(56, 189, 248, 0.35)', tint: [0.40, 0.72, 1.0], absorb: [0.44, 0.34, 0.22], body: [1.0, 1.0, 1.0], letters: [1.0, 1.0, 1.0], halo: [0.463, 0.780, 1.0], hi: [0.10, 0.28, 0.40], shade: [0.005, 0.02, 0.06], vein: [0, 0, 0], tintHot: [0.40, 0.72, 1.0] },
    fire: { glow: 'rgba(255, 70, 10, 0.5)', tint: [1.0, 0.34, 0.04], absorb: [0.12, 0.42, 0.58], body: [1.0, 0.44, 0.20], letters: [1.0, 0.84, 0.58], halo: [1.0, 0.34, 0.05], hi: [0.55, 0.20, 0.0], shade: [0.08, 0.01, 0.0], vein: [0.55, 0.38, 0.12], tintHot: [1.0, 0.72, 0.22] },
  };
  // Fire's extra effects. Water has none of them (they are 0 there, which leaves its pictures exactly as they were).
  //   flicker : how far the halo and the page's glow rise and fall, like firelight (0 = steady)
  //   haze    : heat shimmer: rising waves, stronger and faster water, and a faint wobble of the letters
  //   veins   : how white-hot the brightest points of the caustic web get on the snake
  const FIRE = { flicker: 0.4, haze: 0.75, veins: 1.4 };
  let palette = THEMES[document.documentElement.getAttribute('data-theme') === 'fire' ? 'fire' : 'water'];

  const SNAKE_FEEL = { size: 1.25, line: 0.08, gain: 2.3, rate: 1.25 };
  const BG_FEEL = { size: 0.6, line: 0.32, gain: 1.7, rate: 0.5 };   // softer lines: the void is out of focus
  // The logo is a rotational ambigram: turned half way round, in the plane of the page, it reads the
  // same. While the page is calm it does that, slowly, as if turning on the water: it lifts a little,
  // its shadow falls further and softens, and one soft ring spreads under it.
  // The clock decides when: every `interval` seconds of the wall clock (:00 and :30 for 30), so every
  // window or device showing the page turns its logo at the same moment, with nothing to talk to.
  // The orientation after the n-th tick is n mod 2, so they also all agree on which way up it is.
  // A click or tap makes it spin a full turn (it lands as it was, so it stays in step with the rest).
  //   duration : seconds for the half turn            interval : seconds between turns (on the clock)
  //   lift/scale : how far it rises (px) and grows      shadowExtra : extra fall of the shadow (px)
  //   ripple : strength of the ring it sends out      clickDuration : seconds for the full turn on a click
  const SPIN = { duration: 2.5, interval: 30, lift: 10, scale: 0.04, shadowExtra: 6, ripple: 1, clickDuration: 3.5 };
  // The logo floats above the water:
  //   shadow : how dark its shadow on the water is        shadowX/Y : how far the shadow falls (px)
  //   light  : caustic light reflected up onto the letters   bob     : how far it rises and falls on the swell (px)
  //   dip    : how far a passing ring lowers it (px)         glow    : its blue halo, and hoverGlow on hover
  const LOGO = { shadow: 1, shadowX: 0, shadowY: 60, light: 0.5, bob: 1.6, dip: 4, glow: 1, hoverGlow: 2 };

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

  // Shared by both pictures: the clock, rings from the pointer, and the caustic light web
  const COMMON = `
    #ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif

    uniform float u_time;
    uniform vec4 u_ripples[${MAX_RIPPLES}];   // x, y, start time, strength
    uniform float u_ringAmp;     // how far rings bend the picture
    uniform float u_ringGlint;   // how brightly ring crests catch the light
    uniform float u_ringSpeed;   // how fast rings spread
    uniform float u_ringLife;    // how long rings last
    uniform float u_causticTime; // the caustics' own clock (so changing their speed never jumps)

    // Rings spreading from where the pointer touched: bend the picture and let the crests catch light
    void rings(vec2 p, inout vec2 disp, inout float light) {
      for (int i = 0; i < ${MAX_RIPPLES}; i++) {
        vec4 r = u_ripples[i];
        float age = u_time - r.z;
        if (age > 0.0 && age < 5.5 * u_ringLife && r.w > 0.0) {
          vec2 dv = p - r.xy;
          float dist = length(dv);
          float x = dist - age * 0.16 * u_ringSpeed;           // the ring front travels outward
          float width = 0.018 + age * 0.014;                 // and widens as it goes
          float env = exp(-(x * x) / (width * width));
          float osc = cos(x * 70.0 / (1.0 + age * 0.5));
          float h = env * osc * r.w * exp(-age * 0.65 / u_ringLife) / (1.0 + dist * 2.5);
          disp  += (dv / max(dist, 0.0005)) * h * 0.045 * u_ringAmp;
          light += h * 0.7 * u_ringGlint;
        }
      }
    }

    // One wave of the water surface, adding its curvature to the running total h = (Hxx, Hxy, Hyy)
    void bend(vec2 k, float freq, float speed, float curve, vec2 p, float gain, inout vec3 h) {
      float s = -curve * gain * sin(freq * dot(k, p) + u_causticTime * speed);
      h += s * vec3(k.x * k.x, k.x * k.y, k.y * k.y);
    }

    // Caustics: light focuses into thin bright lines where the curved surface folds the rays
    // together, which is where the determinant of (1 + curvature) falls to zero. Slow on purpose.
    // scale: cell size (bigger = finer), line: how thick the bright lines are, gain: how folded the web is
    float caustic(vec2 p, float scale, float line, float gain) {
      vec2 q = p * scale;
      vec3 h = vec3(0.0);
      bend(vec2( 0.9689,  0.2474), 38.0, 0.46077, 0.42, q, gain, h);
      bend(vec2(-0.2588,  0.9659), 47.0, 0.56549, 0.40, q, gain, h);
      bend(vec2( 0.7071, -0.7071), 55.0, 0.71210, 0.36, q, gain, h);
      bend(vec2(-0.9397, -0.3420), 63.0, 0.82729, 0.32, q, gain, h);
      bend(vec2( 0.3420,  0.9397), 29.0, 0.37699, 0.46, q, gain, h);
      bend(vec2( 0.8192, -0.5736), 71.0, 0.94248, 0.28, q, gain, h);
      float det = (1.0 + h.x) * (1.0 + h.z) - h.y * h.y;
      float c = line / (abs(det) + line);
      return c * c;
    }`;

  // The calm swell, shared by the snake and the logo's shadow so they move with the same water
  const SWELL = `
    uniform float u_swellAmp;   // how far the calm swell bends things
    uniform float u_swellTime;  // the swell's own clock, so changing its speed never jumps
    uniform float u_shimmer;    // how much soft light the swell moves across things
    uniform float u_haze;       // Fire's heat shimmer: waves rising up the page (0 = none)

    // One travelling wave: bends the picture along its direction and adds a bit of shimmer
    void wave(vec2 k, float freq, float speed, float amp, vec2 p, inout vec2 disp, inout float light) {
      float ph = freq * dot(k, p) + u_swellTime * speed;
      disp  += k * (amp * u_swellAmp * cos(ph));
      light -= amp * freq * sin(ph) * 0.25 * u_shimmer;
    }

    // Four waves going different ways (speeds are whole multiples of 2*pi/600 so the motion
    // repeats cleanly when the clock wraps)
    void swell(vec2 p, inout vec2 disp, inout float light) {
      wave(vec2( 0.800,  0.600), 14.0, 0.70162, 0.0065, p, disp, light);
      wave(vec2(-0.500,  0.866), 23.0, 1.09956, 0.0046, p, disp, light);
      wave(vec2( 0.200, -0.980), 34.0, 1.49749, 0.0032, p, disp, light);
      wave(vec2(-0.900, -0.436), 47.0, 2.00013, 0.0021, p, disp, light);
      // heat haze: two fine waves whose crests travel up the page
      wave(vec2( 0.050,  0.999), 41.0, 2.39803, 0.0036 * u_haze, p, disp, light);
      wave(vec2(-0.120,  0.993), 66.0, 3.00562, 0.0022 * u_haze, p, disp, light);
    }`;

  const SNAKE_FRAGMENT = `${COMMON}${SWELL}
    varying vec2 v_uv;
    uniform sampler2D u_tex;
    uniform float u_caustic;    // 0..1
    uniform float u_cScale;     // caustic cell size (from the snake's depth feel and its dials)
    uniform float u_cLine;      // caustic line thickness
    uniform vec3 u_absorb;      // what is taken out of the light between the caustic lines (the theme)
    uniform vec3 u_body;        // a tint on the snake's body (the theme)
    uniform vec3 u_vein;        // white-hot light along the brightest caustic lines (Fire; zero in Water)

    void main() {
      vec2 p = v_uv;
      vec2 disp = vec2(0.0);
      float light = 0.0;

      swell(p, disp, light);
      rings(p, disp, light);

      // Look up the snake where the water bends the light
      vec4 col = texture2D(u_tex, p + disp);

      // The light web lies on the water surface, and the rings bend it too
      float web = caustic(p + disp * 2.0, u_cScale, u_cLine, ${SNAKE_FEEL.gain.toFixed(2)});

      // Lit like something in dark water: bright along the light web, and dimmer and bluer between
      // the lines (water takes out red first). The snake's body is already white, so the lines
      // stand out by the rest getting darker rather than by brightening further.
      vec3 lit = vec3(1.0) - u_caustic * u_absorb * (1.0 - web);
      gl_FragColor = vec4(min(col.rgb * (1.0 + light) * lit * u_body + u_vein * pow(web, 2.0) * col.a, vec3(1.0)), col.a);
    }`;

  const BACKGROUND_FRAGMENT = `${COMMON}
    varying vec2 v_uv;
    uniform vec2 u_size;       // the page in CSS pixels
    uniform float u_caustic;   // 0..1
    uniform float u_cScale;    // caustic cell size
    uniform float u_cLine;     // caustic line softness
    uniform vec3 u_tint;       // the colour of the light (the theme)
    uniform vec3 u_tintHot;    // ...and of its brightest lines (the same in Water)
    uniform float u_flicker;   // Fire's firelight: 1 is steady

    void main() {
      vec2 p = v_uv * u_size / 1000.0;      // same pixel scale on every screen
      vec2 disp = vec2(0.0);
      float light = 0.0;
      rings(p, disp, light);

      float web = caustic(p + disp * 1.5, u_cScale, u_cLine, ${BG_FEEL.gain.toFixed(2)});
      float depth = mix(1.0, 0.45, v_uv.y);   // a little brighter toward the top, like light from the surface
      float a = clamp(u_caustic * (0.45 * web * depth + 0.10 * max(light, 0.0)) * u_flicker, 0.0, 0.5);
      gl_FragColor = vec4((u_tint + (u_tintHot - u_tint) * (web * web)) * a, a);   // the colour of the light comes from the theme
    }`;

  // The logo: crisp letters above the water, with a halo, a shadow that falls on the water (bent by
  // the same swell and rings as the snake below) and caustic light from the water on the letters
  const LOGO_FRAGMENT = `${COMMON}${SWELL}
    varying vec2 v_uv;
    uniform sampler2D u_tex;      // the crisp letters
    uniform sampler2D u_soft;     // their silhouette, lightly blurred (for the shadow)
    uniform sampler2D u_halo;     // their silhouette, widely blurred (for the glow)
    uniform vec2 u_origin;        // where this canvas starts on the water (the snake canvas is 0..1)
    uniform vec2 u_span;          // how big this canvas is on the water
    uniform vec2 u_px;            // one CSS pixel, in this canvas's 0..1 units
    uniform vec2 u_lift;          // how far the letters are raised (px) and how far a ring lowers them (px)
    uniform vec3 u_shadowSet;     // shadow strength, and how far it falls right and down (px)
    uniform float u_light;        // caustic light on the letters
    uniform float u_glow;
    uniform float u_cScale;
    uniform float u_cLine;
    uniform vec2 u_canvasPx;      // this canvas, in CSS pixels
    uniform vec2 u_center;        // the middle of the artwork, in this canvas's 0..1 units (what it turns about)
    uniform vec3 u_turn;          // how far it has turned (radians), how much bigger it is, how high it is lifted (0..1)
    uniform vec2 u_live;          // top and bottom of the part of the canvas that is used while it is not turning
    uniform float u_hoverFall;    // how much further the shadow falls when it is lifted (px)
    uniform vec3 u_absorb;        // the theme's colours: what the water takes out of the light,
    uniform vec3 u_letters;       // a tint on the letters,
    uniform vec3 u_haloColor;     // the halo,
    uniform vec3 u_hi;            // the highlight on the light lines,
    uniform vec3 u_shade;         // and the shadow
    uniform float u_flicker;      // Fire's firelight on the halo: 1 is steady

    // Where in the artwork this spot comes from, once the artwork has been turned about its middle
    vec2 turned(vec2 uv) {
      vec2 p = (uv - u_center) * u_canvasPx;
      float c = cos(u_turn.x);
      float s = sin(u_turn.x);
      p = mat2(c, -s, s, c) * p / u_turn.y;
      return u_center + p / u_canvasPx;
    }

    void main() {
      // The canvas is tall enough for the logo to stand on its end; when it is not turning, the
      // extra room is empty, so skip it
      if (u_turn.z == 0.0 && (v_uv.y < u_live.x || v_uv.y > u_live.y)) {
        gl_FragColor = vec4(0.0);
        return;
      }
      vec2 w = u_origin + v_uv * u_span;               // this spot on the water

      // The water under the logo
      vec2 disp = vec2(0.0);
      float light = 0.0;
      swell(w, disp, light);
      rings(w, disp, light);

      // A ring passing under the middle of the logo lowers it a little
      vec2 d0 = vec2(0.0);
      float l0 = 0.0;
      rings(u_origin + u_center * u_span, d0, l0);
      float lift = u_lift.x - u_lift.y * l0;

      // Shadow: falls further the higher the logo rises, and is bent by the water it lands on
      vec2 fall = vec2(u_shadowSet.y, u_shadowSet.z + 0.5 * lift + u_hoverFall * u_turn.z) * u_px;
      vec2 sc = turned(v_uv - fall + 1.5 * disp / u_span);
      // Lifted higher, the shadow is softer and wider
      float sh = mix(texture2D(u_soft, sc).a, min(texture2D(u_halo, sc).a * 1.8, 1.0), 0.6 * u_turn.z) * u_shadowSet.x;
      vec4 col = vec4(u_shade * sh, sh);

      // Halo
      float g = texture2D(u_halo, turned(v_uv)).a * 0.25 * u_glow * u_flicker;
      col = vec4(u_haloColor * g, g) + col * (1.0 - g);

      // Letters, raised by the swell. Caustic light from the water below plays across them: the
      // same light web as under the snake, so it lines up, with the same dim-between-lines look,
      // plus a cool highlight on the lines.
      // Fire: heat shimmer ripples the letters a little (u_haze is 0 in Water)
      float wobble = u_haze * 0.0011 * sin(v_uv.y * 130.0 - u_swellTime * 3.2);
      vec4 L = texture2D(u_tex, turned(v_uv + vec2(wobble, lift * u_px.y)));
      if (L.a > 0.004) {                               // only where there are letters
        float web = caustic(w + disp * 2.0, u_cScale, u_cLine, ${SNAKE_FEEL.gain.toFixed(2)});
        vec3 rgb = L.rgb * u_letters * (vec3(1.0) - u_light * u_absorb * (1.0 - web));
        rgb += L.a * u_hi * u_light * web;
        rgb *= 1.0 + 0.5 * max(l0, 0.0);               // a passing ring catches a little glint
        L = vec4(min(rgb, vec3(L.a)), L.a);
      }
      gl_FragColor = L + col * (1.0 - L.a);
    }`;

  // ---------------------------------------------------------------------------------------------
  // WebGL helpers (any failure leaves the CSS version in place)
  // ---------------------------------------------------------------------------------------------
  function makeRenderer(canvas, fragmentSource, names) {
    const gl = canvas.getContext('webgl', {
      alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false,
    });
    if (!gl) return null;

    const compile = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn('Water effect shader failed:', gl.getShaderInfoLog(shader));
        return null;
      }
      return shader;
    };
    const vs = compile(gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl.FRAGMENT_SHADER, fragmentSource);
    if (!vs || !fs) return null;

    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('Water effect program failed:', gl.getProgramInfoLog(program));
      return null;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
    gl.clearColor(0, 0, 0, 0);

    const uniforms = {};
    names.forEach((name) => { uniforms[name] = gl.getUniformLocation(program, name); });
    return { gl, uniforms };
  }

  const snakeCanvas = document.createElement('canvas');
  snakeCanvas.className = 'ouro-water';
  snakeCanvas.setAttribute('aria-hidden', 'true');
  const RING_UNIFORMS = ['u_ringAmp', 'u_ringGlint', 'u_ringSpeed', 'u_ringLife'];
  const snake = makeRenderer(snakeCanvas, SNAKE_FRAGMENT,
    ['u_time', 'u_ripples', 'u_tex', 'u_caustic', 'u_swellAmp', 'u_swellTime', 'u_shimmer', 'u_haze', 'u_cScale', 'u_cLine', 'u_causticTime', 'u_absorb', 'u_body', 'u_vein', ...RING_UNIFORMS]);
  if (!snake) { plainSnake(); return; }
  snake.gl.uniform1i(snake.uniforms.u_tex, 0);

  // The page background is an extra, optional layer: if it cannot start, the snake still works
  const bgCanvas = document.createElement('canvas');
  bgCanvas.className = 'ouro-caustics';
  bgCanvas.setAttribute('aria-hidden', 'true');
  const bg = makeRenderer(bgCanvas, BACKGROUND_FRAGMENT, ['u_time', 'u_ripples', 'u_size', 'u_caustic', 'u_cScale', 'u_cLine', 'u_causticTime', 'u_tint', 'u_tintHot', 'u_flicker', ...RING_UNIFORMS]);

  // The logo is another optional layer: if it cannot start, the plain logo image stays as it is
  const logoImg = document.querySelector('img.logo');
  const logoCanvas = document.createElement('canvas');
  logoCanvas.className = 'ouro-logo-water';
  logoCanvas.setAttribute('aria-hidden', 'true');
  const logo = logoImg && logoImg.offsetParent ? makeRenderer(logoCanvas, LOGO_FRAGMENT,
    ['u_time', 'u_ripples', 'u_tex', 'u_soft', 'u_halo', 'u_origin', 'u_span', 'u_px', 'u_lift', 'u_shadowSet', 'u_light', 'u_glow',
      'u_cScale', 'u_cLine', 'u_causticTime', 'u_swellAmp', 'u_swellTime', 'u_shimmer', 'u_haze', 'u_flicker', 'u_canvasPx', 'u_center', 'u_turn', 'u_live',
      'u_hoverFall', 'u_absorb', 'u_letters', 'u_haloColor', 'u_hi', 'u_shade', ...RING_UNIFORMS]) : null;
  if (logo) {
    logo.gl.uniform1i(logo.uniforms.u_tex, 0);
    logo.gl.uniform1i(logo.uniforms.u_soft, 1);
    logo.gl.uniform1i(logo.uniforms.u_halo, 2);
  }
  const logoTextures = logo ? [0, 1, 2].map(() => logo.gl.createTexture()) : [];
  const logoBox = { padX: LOGO_PAD, padTop: LOGO_PAD, padBottom: LOGO_PAD, center: [0.5, 0.5], left: 0, top: 0, width: 0, height: 0, built: 0, builtAt: 0, ready: false };
  const canSpin = document.body.classList.contains('home');   // the half turn is for the home page
  // half: 0 as drawn, 1 turned round. tick: the last clock tick seen. flip: the tick being turned for.
  // click: when a click turn began. shift/hold: only for tests.
  const spin = { half: 0, tick: null, flip: null, click: null, shift: 0, hold: null };
  let logoOn = !!logo;        // switched off alone if the device struggles
  if (logoImg && !logo) logoImg.classList.add('water-off');   // no logo layer: the plain logo shows at once
  let logoHover = 0;          // 0..1, eased
  let logoHoverGoal = 0;

  const texture = snake.gl.createTexture();
  const ripplesSnake = new Float32Array(MAX_RIPPLES * 4);   // x, y (0..1 across the canvas), start (wrapped), strength
  const ripplesBg = new Float32Array(MAX_RIPPLES * 4);      // x, y (pixels / 1000), start (wrapped), strength
  const rippleStart = new Float64Array(MAX_RIPPLES);        // unwrapped start times, for expiry
  let nextRipple = 0;

  let running = false;
  let started = false;
  let rafId = 0;
  let lastDraw = 0;
  let slowFrames = 0;
  let measured = 0;
  let image = null;

  // The snake canvas is a little bigger than the layer so the glow is not cut off at the edges
  function sizeFor() {
    const css = layer.offsetWidth * (1 + 2 * PAD);
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    return Math.max(64, Math.min(MAX_TEXTURE, Math.round(css * dpr)));
  }

  function buildTexture() {
    const gl = snake.gl;
    const size = sizeFor();
    const art = size / (1 + 2 * PAD);
    const offset = (size - art) / 2;
    const scale = size / (layer.offsetWidth * (1 + 2 * PAD));   // canvas pixels per CSS pixel

    const flat = document.createElement('canvas');
    flat.width = flat.height = size;
    const ctx = flat.getContext('2d');
    ctx.shadowColor = palette.glow;
    ctx.shadowBlur = GLOW_BLUR * scale;
    ctx.drawImage(image, offset, offset, art, art);

    snakeCanvas.width = snakeCanvas.height = size;
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

  // Caustics are soft, so the background is drawn small and stretched by the browser
  function sizeBackground() {
    if (!bg) return;
    const w = Math.max(32, Math.min(BG_MAX_WIDTH, Math.round(window.innerWidth * BG_SCALE)));
    const h = Math.max(32, Math.round(w * window.innerHeight / window.innerWidth));
    bgCanvas.width = w;
    bgCanvas.height = h;
    bg.gl.viewport(0, 0, w, h);
  }

  // ---------------------------------------------------------------------------------------------
  // The logo: sits where the logo image is, and takes over its picture
  // ---------------------------------------------------------------------------------------------
  // Draws the logo art three ways (crisp, and two blurred silhouettes) into textures
  function buildLogoTextures(cssW, cssH, padX, padTop, padBottom) {
    const gl = logo.gl;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const cssFullW = cssW + 2 * padX;
    const cssFullH = cssH + padTop + padBottom;
    const W = Math.min(MAX_TEXTURE, Math.max(32, Math.round(cssFullW * dpr)));
    const H = Math.min(MAX_TEXTURE, Math.max(32, Math.round(cssFullH * dpr)));
    const sx = W / cssFullW;
    const sy = H / cssFullH;

    // The image box can be wider than the art (the page limits the logo's height); the art is
    // fitted inside it, centred, exactly like the image does
    const ratio = logoImg.naturalWidth / logoImg.naturalHeight;
    const artW = Math.min(cssW, cssH * ratio);
    const artH = artW / ratio;
    const artX = padX + (cssW - artW) / 2;
    const artY = padTop + (cssH - artH) / 2;

    const make = (blurCss) => {
      const flat = document.createElement('canvas');
      flat.width = W;
      flat.height = H;
      const ctx = flat.getContext('2d');
      if (blurCss > 0) {
        // Draw the art far off to the side and let only its blurred shadow land on the canvas
        ctx.shadowColor = '#000';
        ctx.shadowBlur = blurCss * sx;
        ctx.shadowOffsetX = W + 16;
        ctx.drawImage(logoImg, artX * sx - (W + 16), artY * sy, artW * sx, artH * sy);
      } else {
        ctx.drawImage(logoImg, artX * sx, artY * sy, artW * sx, artH * sy);
      }
      return flat;
    };
    const sources = [make(0), make(LOGO_SHADOW_BLUR), make(LOGO_GLOW_BLUR)];

    // The middle of the artwork (the box round its letters), which is what it turns about. For an
    // ambigram this is its point of symmetry, so a half turn lands exactly on the starting picture.
    const px = sources[0].getContext('2d').getImageData(0, 0, W, H).data;
    let x0 = W, x1 = -1, y0 = H, y1 = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (px[(y * W + x) * 4 + 3] > 40) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    logoBox.center = x1 >= 0 ? [(x0 + x1 + 1) / 2 / W, (y0 + y1 + 1) / 2 / H] : [0.5, 0.5];

    logoCanvas.width = W;
    logoCanvas.height = H;
    gl.viewport(0, 0, W, H);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    sources.forEach((source, i) => {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, logoTextures[i]);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    });
    logoBox.built = padX * 100000000 + cssW * 10000 + cssH;
    logoBox.builtPads = padTop * 10000 + padBottom;
    logoBox.builtAt = performance.now();
  }

  // Keeps the logo canvas exactly over the logo image (the image keeps its place in the page layout)
  function syncLogo(force) {
    if (!logo || !logoImg.complete || !logoImg.naturalWidth) return false;
    const w = logoImg.offsetWidth;
    const h = logoImg.offsetHeight;
    if (w < 8 || h < 8 || logoImg.offsetParent !== logoCanvas.parentNode) {
      logoBox.ready = false;
      logoCanvas.hidden = true;
      return false;
    }
    // Normally LOGO_PAD on every side; on a narrow screen the sides get only the room there is, so
    // the canvas never sticks out past the page
    const host = logoCanvas.parentNode;
    const padX = Math.max(24, Math.min(LOGO_PAD, logoImg.offsetLeft, host.clientWidth - logoImg.offsetLeft - w));
    // Above and below: room for the glow, and (on the home page) for the logo to stand on its end
    // while it turns; below also the shadow, which falls downward
    const turnRoom = canSpin ? Math.ceil(Math.max(0, (w * (1 + SPIN.scale) - h) / 2) + SPIN.lift + 4) : 0;
    const padTop = LOGO_PAD + turnRoom;
    const padBottom = LOGO_PAD + turnRoom + Math.max(0, LOGO.shadowY);
    if ((padX * 100000000 + w * 10000 + h !== logoBox.built || padTop * 10000 + padBottom !== logoBox.builtPads) &&
        (force || !logoBox.ready || performance.now() - logoBox.builtAt > 150)) {
      buildLogoTextures(w, h, padX, padTop, padBottom);
      logoBox.padX = padX;
      logoBox.padTop = padTop;
      logoBox.padBottom = padBottom;
    }
    logoBox.left = logoImg.offsetLeft - logoBox.padX;
    logoBox.top = logoImg.offsetTop - logoBox.padTop;
    logoBox.width = w + 2 * logoBox.padX;
    logoBox.height = h + logoBox.padTop + logoBox.padBottom;
    logoCanvas.style.left = logoBox.left + 'px';
    logoCanvas.style.top = logoBox.top + 'px';
    logoCanvas.style.width = logoBox.width + 'px';
    logoCanvas.style.height = logoBox.height + 'px';
    logoCanvas.style.transformOrigin = '50% ' + (logoBox.padTop + h / 2) + 'px';   // the hover growth is about the logo, not the canvas
    logoCanvas.hidden = false;
    logoBox.ready = true;
    return true;
  }

  function drawLogo(wrapped) {
    if (!logoBox.ready) return;
    const host = logoCanvas.parentNode.getBoundingClientRect();
    const view = logoCanvas.getBoundingClientRect();
    // The page may be scrolled so the logo is out of sight: nothing to draw then
    if (view.bottom < -50 || view.top > window.innerHeight + 50) return;
    const snakeRect = snakeCanvas.getBoundingClientRect();
    if (!snakeRect.width) return;
    const left = host.left + logoBox.left;
    const top = host.top + logoBox.top;
    const L = LOGO;

    logoHover += (logoHoverGoal - logoHover) * 0.15;
    const t = swellClock;
    const bob = L.bob * (0.62 * Math.sin(t * 0.70162) + 0.38 * Math.sin(t * 1.09956 + 1.3));

    const turning = spinState(performance.now());

    const g = logo.gl;
    const u = logo.uniforms;
    g.clear(g.COLOR_BUFFER_BIT);
    g.uniform1f(u.u_time, wrapped);
    g.uniform2f(u.u_origin, (left - snakeRect.left) / snakeRect.width, (top - snakeRect.top) / snakeRect.height);
    g.uniform2f(u.u_span, logoBox.width / snakeRect.width, logoBox.height / snakeRect.height);
    g.uniform2f(u.u_px, 1 / logoBox.width, 1 / logoBox.height);
    g.uniform2f(u.u_lift, bob + SPIN.lift * turning.raised, L.dip);
    g.uniform2f(u.u_canvasPx, logoBox.width, logoBox.height);
    g.uniform2f(u.u_center, logoBox.center[0], logoBox.center[1]);
    g.uniform3f(u.u_turn, turning.angle, 1 + SPIN.scale * turning.raised, turning.raised);
    g.uniform2f(u.u_live, (logoBox.padTop - LOGO_PAD) / logoBox.height, 1 - (logoBox.padBottom - LOGO_PAD - Math.max(0, L.shadowY)) / logoBox.height);
    g.uniform1f(u.u_hoverFall, SPIN.shadowExtra);
    g.uniform3f(u.u_shadowSet, L.shadow, L.shadowX, L.shadowY);
    g.uniform1f(u.u_light, L.light);
    g.uniform1f(u.u_glow, L.glow + (L.hoverGlow - L.glow) * logoHover);
    g.uniform1f(u.u_cScale, SNAKE_FEEL.size);
    g.uniform1f(u.u_cLine, SNAKE_FEEL.line);
    g.uniform1f(u.u_causticTime, snakeCausticClock);
    g.uniform3fv(u.u_absorb, palette.absorb);
    g.uniform3fv(u.u_letters, palette.letters);
    g.uniform3fv(u.u_haloColor, palette.halo);
    g.uniform3fv(u.u_hi, palette.hi);
    g.uniform3fv(u.u_shade, palette.shade);
    g.uniform1f(u.u_swellAmp, fx.swellAmp);
    g.uniform1f(u.u_haze, fx.haze);
    g.uniform1f(u.u_flicker, fx.flick);
    g.uniform1f(u.u_swellTime, swellClock);
    g.uniform1f(u.u_shimmer, LEVELS.shimmer);
    g.uniform1f(u.u_ringAmp, fx.ringAmp);
    g.uniform1f(u.u_ringGlint, LEVELS.ringGlint);
    g.uniform1f(u.u_ringSpeed, fx.ringSpeed);
    g.uniform1f(u.u_ringLife, LEVELS.ringLife);
    g.uniform4fv(u.u_ripples, ripplesSnake);
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
  }

  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);   // slow, then slow again

  // One soft ring spreads under the logo as it lifts off
  function pulseUnderLogo() {
    const r = logoImg.getBoundingClientRect();
    addRipple(r.left + r.width / 2, r.top + r.height / 2, SPIN.ripple);
  }

  // Where the logo is in its turning right now: its angle, and how far it is lifted (0..1)
  function spinState(perfNow) {
    const wall = Date.now() + spin.shift;
    const intervalMs = SPIN.interval * 1000;
    const durationMs = SPIN.duration * 1000;
    const k = Math.floor(wall / intervalMs);           // which tick of the clock we are in
    const visible = document.visibilityState === 'visible';
    const calm = canSpin && visible && document.body.classList.contains('calm');

    if (spin.tick === null) {
      spin.half = k % 2;                               // every window starts the way the clock says
      spin.tick = k;
    } else if (spin.tick !== k) {
      spin.tick = k;
      if (!visible) {
        spin.half = k % 2;                             // nobody is looking: catch up quietly
        spin.flip = null;
      } else if (calm && wall - k * intervalMs < durationMs && spin.half !== k % 2) {
        spin.flip = k;                                 // calm: turn, together with every other window
        pulseUnderLogo();
      }                                                // otherwise it sits this one out, and is in step again after
    }

    let p = 0;                                         // 0..1 through the half turn
    if (spin.flip !== null) {
      p = (wall - spin.flip * intervalMs) / durationMs;
      if (p >= 1) { spin.half = spin.flip % 2; spin.flip = null; p = 0; }
    }
    if (spin.hold !== null) p = spin.hold;

    let c = 0;                                         // 0..1 through a full turn started by a click
    if (spin.click !== null) {
      c = (perfNow - spin.click) / (SPIN.clickDuration * 1000);
      if (c >= 1) { spin.click = null; c = 0; }
    }
    return {
      angle: Math.PI * (spin.half + ease(p)) + 2 * Math.PI * ease(c),
      raised: Math.max(Math.sin(Math.PI * p), Math.sin(Math.PI * c)),
    };
  }

  // A click or tap on the logo: one full turn, landing as it was, so it stays in step with the clock
  function startClickSpin() {
    if (!canSpin || !logoOn || spin.click !== null) return;
    spin.click = performance.now();
    pulseUnderLogo();
  }

  // (in the calm view a click on the logo changes the theme instead: assets/effects.js)
  function onLogoPress() {
    if (!document.body.classList.contains('calm-show')) startClickSpin();
  }

  // Gives the plain logo image back (used when the logo layer fails or the device is slow)
  function dropLogo() {
    if (!logoOn) return;
    logoOn = false;
    logoImg.classList.remove('water-over');
    logoImg.classList.add('water-off');
    logoImg.removeEventListener('pointerenter', onLogoEnter);
    logoImg.removeEventListener('pointerleave', onLogoLeave);
    logoImg.removeEventListener('pointerdown', onLogoPress);
    logoCanvas.remove();
  }

  function onLogoEnter() { logoHoverGoal = 1; logoCanvas.classList.add('hover'); }
  function onLogoLeave() { logoHoverGoal = 0; logoCanvas.classList.remove('hover'); }

  // ---------------------------------------------------------------------------------------------
  // Drawing
  // ---------------------------------------------------------------------------------------------
  function expireRipples(seconds, life) {
    for (let i = 0; i < MAX_RIPPLES; i++) {
      if (seconds - rippleStart[i] > 5.5 * life) {
        ripplesSnake[i * 4 + 3] = 0;
        ripplesBg[i * 4 + 3] = 0;
      }
    }
  }

  // The swell runs on its own clock so changing its speed never makes the water jump
  let swellClock = 0;
  let swellLast = null;
  let snakeCausticClock = 0;
  let bgCausticClock = 0;

  // The water follows the real clock, so a refresh or another page picks the pattern up where it was
  // instead of starting over. Every wave speed is a whole multiple of 2*pi/TIME_WRAP (in clock units),
  // so the pattern closes seamlessly: the snake's caustics come round every 8 minutes of real time and
  // the background's every 20, both lining up with the clock. Tests switch this off (see reset()) to
  // start from zero.
  let followClock = true;
  const wallSeconds = () => (Date.now() + spin.shift) / 1000;

  // An irregular wobble between about -1 and 1: several sines that never line up, some of them
  // switching each other on and off, so the light seems to gust rather than pulse
  function flickerNoise(t) {
    return 0.45 * Math.sin(t * 5.3) + 0.30 * Math.sin(t * 8.9 + 1.3) * Math.sin(t * 1.7) + 0.25 * Math.sin(t * 13.7 + 0.4) * Math.sin(t * 0.9 + 2.0);
  }

  // What Fire adds this frame (all zero or neutral in Water)
  const fx = { haze: 0, flick: 1, swellAmp: 0, ringAmp: 0, ringSpeed: 1, vein: [0, 0, 0] };

  function draw(seconds) {
    const level = LEVELS;
    expireRipples(seconds, level.ringLife);
    const wrapped = seconds % TIME_WRAP;

    const fire = palette === THEMES.fire ? FIRE : null;
    fx.haze = fire ? fire.haze : 0;
    fx.flick = fire ? 1 + fire.flicker * flickerNoise(seconds) : 1;
    fx.swellAmp = level.swellAmp * (1 + 0.35 * fx.haze);
    fx.ringAmp = level.ringAmp * (1 + 0.35 * fx.haze);
    fx.ringSpeed = level.ringSpeed * (1 + 0.15 * fx.haze);
    fx.vein = fire ? palette.vein.map((c) => c * fire.veins) : palette.vein;

    // The caustics are a plain function of the real clock. The swell changes speed with the theme, so it
    // keeps its own running total, set from the real clock when the page starts and after a long pause
    // (a hidden tab), so it also picks up in the right place.
    const gap = swellLast === null ? Infinity : seconds - swellLast;
    const dt = gap === Infinity ? 0 : Math.max(0, Math.min(gap, 0.25));
    swellLast = seconds;
    const swellRate = level.swellSpeed * (1 + 0.5 * fx.haze);
    if (followClock) {
      const wall = wallSeconds();
      swellClock = gap > 2 ? (wall * swellRate) % TIME_WRAP : (swellClock + dt * swellRate) % TIME_WRAP;
      snakeCausticClock = (wall * SNAKE_FEEL.rate) % TIME_WRAP;
      bgCausticClock = (wall * BG_FEEL.rate) % TIME_WRAP;
    } else {
      swellClock = (swellClock + dt * swellRate) % TIME_WRAP;
      snakeCausticClock = (snakeCausticClock + dt * SNAKE_FEEL.rate) % TIME_WRAP;
      bgCausticClock = (bgCausticClock + dt * BG_FEEL.rate) % TIME_WRAP;
    }

    const gl = snake.gl;
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(snake.uniforms.u_time, wrapped);
    gl.uniform1f(snake.uniforms.u_caustic, level.snake);
    gl.uniform1f(snake.uniforms.u_cScale, SNAKE_FEEL.size);
    gl.uniform1f(snake.uniforms.u_cLine, SNAKE_FEEL.line);
    gl.uniform1f(snake.uniforms.u_causticTime, snakeCausticClock);
    gl.uniform3fv(snake.uniforms.u_absorb, palette.absorb);
    gl.uniform3fv(snake.uniforms.u_body, palette.body);
    gl.uniform1f(snake.uniforms.u_swellAmp, fx.swellAmp);
    gl.uniform1f(snake.uniforms.u_haze, fx.haze);
    gl.uniform3fv(snake.uniforms.u_vein, fx.vein);
    gl.uniform1f(snake.uniforms.u_swellTime, swellClock);
    gl.uniform1f(snake.uniforms.u_shimmer, level.shimmer);
    gl.uniform1f(snake.uniforms.u_ringAmp, fx.ringAmp);
    gl.uniform1f(snake.uniforms.u_ringGlint, level.ringGlint);
    gl.uniform1f(snake.uniforms.u_ringSpeed, fx.ringSpeed);
    gl.uniform1f(snake.uniforms.u_ringLife, level.ringLife);
    gl.uniform4fv(snake.uniforms.u_ripples, ripplesSnake);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // The page behind it (skipped entirely when it is switched off)
    if (bg) {
      const g = bg.gl;
      g.clear(g.COLOR_BUFFER_BIT);
      if (level.background > 0) {
        g.uniform1f(bg.uniforms.u_time, wrapped);
        g.uniform2f(bg.uniforms.u_size, window.innerWidth, window.innerHeight);
        g.uniform1f(bg.uniforms.u_caustic, level.background);
        g.uniform1f(bg.uniforms.u_cScale, BG_FEEL.size);
        g.uniform1f(bg.uniforms.u_cLine, BG_FEEL.line);
        g.uniform1f(bg.uniforms.u_causticTime, bgCausticClock);
        g.uniform3fv(bg.uniforms.u_tint, palette.tint);
        g.uniform3fv(bg.uniforms.u_tintHot, palette.tintHot);
        g.uniform1f(bg.uniforms.u_flicker, fx.flick);
        g.uniform1f(bg.uniforms.u_ringAmp, fx.ringAmp);
        g.uniform1f(bg.uniforms.u_ringGlint, level.ringGlint);
        g.uniform1f(bg.uniforms.u_ringSpeed, fx.ringSpeed);
        g.uniform1f(bg.uniforms.u_ringLife, level.ringLife);
        g.uniform4fv(bg.uniforms.u_ripples, ripplesBg);
        g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
      }
    }

    // The logo (the plain image underneath stays in place for layout and is hidden once this draws)
    if (logoOn) {
      try {
        if (syncLogo(false)) {
          drawLogo(wrapped);
          if (!logoImg.classList.contains('water-over')) {
            logoImg.classList.add('water-over');
            logoCanvas.classList.add('arriving');   // fades in, once
          }
        }
      } catch (error) {
        dropLogo();   // whatever went wrong, the plain logo image is still there
      }
    }
  }

  function addRipple(clientX, clientY, strength) {
    if (!started) return;
    const rect = snakeCanvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;
    // Far from the snake there is only the faint background to bend, so allow a wide margin
    const nearSnake = !(x < -0.25 || x > 1.25 || y < -0.25 || y > 1.25);
    if (!nearSnake && !bg) return;
    const now = performance.now() / 1000;
    const i = nextRipple;
    nextRipple = (nextRipple + 1) % MAX_RIPPLES;
    ripplesSnake[i * 4] = x;
    ripplesSnake[i * 4 + 1] = y;
    ripplesSnake[i * 4 + 2] = now % TIME_WRAP;
    ripplesSnake[i * 4 + 3] = nearSnake ? strength : 0;
    ripplesBg[i * 4] = clientX / 1000;
    ripplesBg[i * 4 + 1] = clientY / 1000;
    ripplesBg[i * 4 + 2] = now % TIME_WRAP;
    ripplesBg[i * 4 + 3] = strength;
    rippleStart[i] = now;
  }

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    if (now - lastDraw < FRAME_MS - 1) return;

    // If the device cannot keep up, give the page back to the plain CSS version
    if (lastDraw) {
      measured++;
      if (measured > 30 && measured <= 90 && now - lastDraw > 70) slowFrames++;
      if (measured === 90 && slowFrames > 30) {
        // First give the plain logo back and look again; only if it is still slow, drop the water altogether
        if (logoOn) { dropLogo(); measured = 30; slowFrames = 0; } else { dispose(); return; }
      }
    }
    lastDraw = now;
    if (telemetry) {
      const began = performance.now();
      draw(now / 1000);
      const took = performance.now() - began;
      telemetry.frames++;
      telemetry.drawMs += took;
      if (took > telemetry.drawMax) telemetry.drawMax = took;
    } else {
      draw(now / 1000);
    }
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
    window.removeEventListener('themechange', onTheme);
    layer.classList.remove('water-on');
    plainSnake();
    snakeCanvas.remove();
    bgCanvas.remove();
    dropLogo();
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
    if (LEVELS.trail > 0) addRipple(event.clientX, event.clientY, 0.45 * LEVELS.trail);
  }

  let resizeTimer = 0;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!started) return;
      buildTexture();
      sizeBackground();
      if (logo) syncLogo(true);
      draw(performance.now() / 1000);
    }, 150);
  }

  // The theme changed (assets/theme.js): new colours, and the snake's halo is drawn into its picture
  function onTheme(event) {
    palette = THEMES[event.detail && event.detail.theme] || THEMES.water;
    if (started) {
      buildTexture();
      draw(performance.now() / 1000);
    }
  }
  // Listen from the start: a switch made while the snake picture is still loading must not be missed
  window.addEventListener('themechange', onTheme);

  snakeCanvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); dispose(); });
  bgCanvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); dispose(); });
  logoCanvas.addEventListener('animationend', () => logoCanvas.classList.remove('arriving'));
  logoCanvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); dropLogo(); });

  // ---------------------------------------------------------------------------------------------
  // Go: load the art, draw one frame, then swap it in for the CSS background
  // ---------------------------------------------------------------------------------------------
  image = new Image();
  image.onload = () => {
    if (bg) layer.parentNode.insertBefore(bgCanvas, layer);   // behind the snake
    layer.appendChild(snakeCanvas);
    if (logoOn) {
      logoImg.offsetParent.appendChild(logoCanvas);
      logoImg.addEventListener('pointerenter', onLogoEnter);
      logoImg.addEventListener('pointerleave', onLogoLeave);
      logoImg.addEventListener('pointerdown', onLogoPress, { passive: true });
    }
    buildTexture();
    sizeBackground();
    draw(performance.now() / 1000);
    started = true;
    layer.classList.add('water-on');
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('resize', onResize);
    start();
  };
  image.onerror = plainSnake;   // keep the CSS version
  image.src = '/assets/bg_ouro.svg';

  if (/[?&]water=debug\b/.test(location.search)) {
    window.__ouroWater = {
      draw: (seconds) => draw(seconds),
      ripple: (x, y, strength) => addRipple(x, y, strength === undefined ? 1 : strength),
      stop: () => { running = false; cancelAnimationFrame(rafId); },
      activeRipples: () => { let n = 0; for (let i = 0; i < MAX_RIPPLES; i++) if (ripplesSnake[i * 4 + 3] > 0 || ripplesBg[i * 4 + 3] > 0) n++; return n; },
      // average milliseconds per frame (all pictures), including waiting for the GPU to finish
      cost: (frames) => {
        const probe = new Uint8Array(4);
        const t = performance.now();
        for (let i = 0; i < frames; i++) {
          draw(i * 0.033);
          snake.gl.readPixels(0, 0, 1, 1, snake.gl.RGBA, snake.gl.UNSIGNED_BYTE, probe);
          if (bg) bg.gl.readPixels(0, 0, 1, 1, bg.gl.RGBA, bg.gl.UNSIGNED_BYTE, probe);
          if (logo && logoBox.ready) logo.gl.readPixels(0, 0, 1, 1, logo.gl.RGBA, logo.gl.UNSIGNED_BYTE, probe);
        }
        return (performance.now() - t) / frames;
      },
      // stop following the real clock, forget the clocks and rings, so tests can compare two versions from the same starting point
      reset: () => { followClock = false; swellClock = 0; swellLast = null; snakeCausticClock = 0; bgCausticClock = 0; ripplesSnake.fill(0); ripplesBg.fill(0); },
      backgroundChecksum: (seconds) => {
        if (!bg) return 0;
        draw(seconds);
        const g = bg.gl; const w = bgCanvas.width; const h = bgCanvas.height;
        const px = new Uint8Array(w * h * 4); g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, px);
        let sum = 0; for (let i = 0; i < px.length; i += 4) sum += px[i] + 3 * px[i + 1] + 7 * px[i + 2] + 11 * px[i + 3];
        return sum;
      },
      // a number that changes whenever the snake canvas looks different (for tests)
      snakeChecksum: (seconds) => {
        draw(seconds);
        const g = snake.gl; const n = snakeCanvas.width;
        const px = new Uint8Array(n * n * 4); g.readPixels(0, 0, n, n, g.RGBA, g.UNSIGNED_BYTE, px);
        let sum = 0; for (let i = 0; i < px.length; i += 4) sum += px[i] + 3 * px[i + 1] + 7 * px[i + 2] + 11 * px[i + 3];
        return sum;
      },
      logoChecksum: (seconds) => {
        if (!logoBox.ready) return 0;
        draw(seconds);
        const g = logo.gl; const w = logoCanvas.width; const h = logoCanvas.height;
        const px = new Uint8Array(w * h * 4); g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, px);
        let sum = 0; for (let i = 0; i < px.length; i += 4) sum += px[i] + 3 * px[i + 1] + 7 * px[i + 2] + 11 * px[i + 3];
        return sum;
      },
      // hold the half turn at a point (0..1) for tests; null lets it run normally
      spinAt: (turn) => { spin.hold = turn; },
      spinNow: () => startClickSpin(),
      // the three water clocks, and whether they follow the real clock (for tests)
      clocks: () => ({ snake: snakeCausticClock, background: bgCausticClock, swell: swellClock, following: followClock }),
      // pretend the clock is this many milliseconds ahead (for tests)
      spinShift: (ms) => { spin.shift = ms; },
      // how far the logo is from looking the same after a half turn (share of its pixels that differ)
      ambigramError: () => {
        const W = logoCanvas.width; const H = logoCanvas.height;
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        // rebuild the crisp picture from the texture's source by drawing the image again
        const cx = logoBox.center[0] * W; const cy = logoBox.center[1] * H;
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        const w = logoImg.offsetWidth; const h = logoImg.offsetHeight;
        const sx = W / (w + 2 * logoBox.padX); const sy = H / (h + logoBox.padTop + logoBox.padBottom);
        const ratio = logoImg.naturalWidth / logoImg.naturalHeight;
        const artW = Math.min(w, h * ratio); const artH = artW / ratio;
        const ctx = c.getContext('2d');
        ctx.drawImage(logoImg, (logoBox.padX + (w - artW) / 2) * sx, (logoBox.padTop + (h - artH) / 2) * sy, artW * sx, artH * sy);
        const a = ctx.getImageData(0, 0, W, H).data;
        let diff = 0; let total = 0;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const i = (y * W + x) * 4 + 3;
            const rx = Math.round(2 * cx - x - 1); const ry = Math.round(2 * cy - y - 1);
            const j = rx >= 0 && rx < W && ry >= 0 && ry < H ? (ry * W + rx) * 4 + 3 : -1;
            const on = a[i] > 127; const back = j >= 0 && a[j] > 127;
            if (on || back) total++;
            if (on !== back) diff++;
          }
        }
        return total ? diff / total : 0;
      },
      logoInfo: () => (logo ? { ready: logoBox.ready, canvas: [logoCanvas.width, logoCanvas.height], box: Object.assign({}, logoBox), over: logoImg.classList.contains('water-over'), spinning: spin.flip !== null || spin.click !== null, flip: spin.flip, click: spin.click !== null, half: spin.half } : null),
      size: () => snakeCanvas.width,
      backgroundSize: () => (bg ? [bgCanvas.width, bgCanvas.height] : null),
      // largest background opacity currently drawn, read back from the GPU
      peakBackgroundAlpha: (seconds) => {
        if (!bg) return 0;
        draw(seconds === undefined ? 1 : seconds);
        const g = bg.gl; const w = bgCanvas.width; const h = bgCanvas.height;
        const px = new Uint8Array(w * h * 4); g.readPixels(0, 0, w, h, g.RGBA, g.UNSIGNED_BYTE, px);
        let peak = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > peak) peak = px[i];
        return peak / 255;
      },
      dispose,
    };
  }
})();
