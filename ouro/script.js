import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const canvas = document.getElementById('ouro-canvas');
const hint = document.getElementById('ouro-hint');
const vrButton = document.getElementById('enter-vr');
const arButton = document.getElementById('enter-ar');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------
// Renderer, scene, camera
// ---------------------------------------------------------------------------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
} catch (err) {
  hint.textContent = "Your browser can't show 3D graphics here, sorry.";
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.xr.enabled = true;

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.05, 200);
camera.position.set(0, 0, 4.2);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.autoRotate = !reducedMotion;
controls.autoRotateSpeed = 1.2;

// Blue rim lights, matching the site's glow
scene.add(new THREE.AmbientLight(0x9fb4d0, 0.4));
const key = new THREE.DirectionalLight(0xffffff, 1.4);
key.position.set(2, 3, 4);
scene.add(key);
for (const [x, y, z] of [[-3, 1, -2], [3, -1, -2]]) {
  const rim = new THREE.PointLight(0x38bdf8, 18, 12);
  rim.position.set(x, y, z);
  scene.add(rim);
}

// Starfield on a distant shell, so it also surrounds you in VR
const starCount = 1500;
const starPositions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i++) {
  const v = new THREE.Vector3().randomDirection().multiplyScalar(30 + Math.random() * 30);
  starPositions.set([v.x, v.y, v.z], i * 3);
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({
  color: 0x76c7ff, size: 0.12, transparent: true, opacity: 0.8,
}));
scene.add(stars);

// ---------------------------------------------------------------------------
// The ouroboros: extrude each SVG shape into 3D
// ---------------------------------------------------------------------------
// The site's SVG has white "over" segments and grey "under" segments of the knot.
// Sinking the grey ones back gives the over/under weave real depth.
const bodyMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xe2e8f0, metalness: 0.35, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.25,
});
const underMaterial = new THREE.MeshPhysicalMaterial({
  color: 0x8193ab, metalness: 0.3, roughness: 0.5,
});

const pivot = new THREE.Group(); // what we rotate / place in XR
scene.add(pivot);

async function buildOuroboros() {
  const svg = await new SVGLoader().loadAsync('/assets/bg_ouro.svg');
  const model = new THREE.Group();

  for (const path of svg.paths) {
    const isUnder = path.color.getHexString() !== 'ffffff';
    const geometry = new THREE.ExtrudeGeometry(SVGLoader.createShapes(path), {
      depth: 50,
      curveSegments: 10,
      bevelEnabled: true,
      bevelThickness: 6,
      bevelSize: 3,
      bevelSegments: 3,
    });
    const mesh = new THREE.Mesh(geometry, isUnder ? underMaterial : bodyMaterial);
    mesh.position.z = isUnder ? -14 : 0;
    model.add(mesh);
  }

  // SVG's y axis points down; flip it, then center and scale to ~2.4 units wide
  model.scale.y = -1;
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = 2.4 / Math.max(size.x, size.y);
  model.position.copy(center).multiplyScalar(-scale);
  model.scale.set(scale, -scale, scale);
  pivot.add(model);
}

// ---------------------------------------------------------------------------
// WebXR: VR (fully immersive) and AR (in your room, on passthrough headsets)
// ---------------------------------------------------------------------------
let spinBoost = 0;

for (const index of [0, 1]) {
  // Pull a trigger to give it a spin
  renderer.xr.getController(index).addEventListener('selectstart', () => { spinBoost = 5; });
  scene.add(renderer.xr.getController(index));
}

async function startXR(mode) {
  try {
    const session = await navigator.xr.requestSession(mode, { optionalFeatures: ['local-floor'] });
    const hasFloor = !session.enabledFeatures || session.enabledFeatures.includes('local-floor');
    renderer.xr.setReferenceSpaceType(hasFloor ? 'local-floor' : 'local');
    await renderer.xr.setSession(session);

    // About 0.6 m wide, floating at chest height a metre in front of you
    pivot.position.set(0, hasFloor ? 1.35 : -0.2, -1.1);
    pivot.scale.setScalar(0.25);
    stars.visible = mode === 'immersive-vr';
    scene.background = mode === 'immersive-vr' ? new THREE.Color(0x05070d) : null;

    session.addEventListener('end', () => {
      pivot.position.set(0, 0, 0);
      pivot.scale.setScalar(1);
      pivot.rotation.set(0, 0, 0);
      stars.visible = true;
      scene.background = null;
    });
  } catch (err) {
    hint.textContent = `Couldn't start ${mode === 'immersive-vr' ? 'VR' : 'AR'}: ${err.message}`;
  }
}

async function offerXR() {
  if (!navigator.xr || !window.isSecureContext) return;
  const [vr, ar] = await Promise.all([
    navigator.xr.isSessionSupported('immersive-vr').catch(() => false),
    navigator.xr.isSessionSupported('immersive-ar').catch(() => false),
  ]);
  vrButton.hidden = !vr;
  arButton.hidden = !ar;
}

vrButton.addEventListener('click', () => startXR('immersive-vr'));
arButton.addEventListener('click', () => startXR('immersive-ar'));

// ---------------------------------------------------------------------------
// Loop and resize
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => {
  const dt = clock.getDelta();
  stars.rotation.y += dt * 0.01;

  if (renderer.xr.isPresenting) {
    pivot.rotation.y += dt * (reducedMotion ? 0 : 0.4) + dt * spinBoost;
    spinBoost *= 0.97;
  } else {
    controls.update();
  }
  renderer.render(scene, camera);
});

// Back the camera off far enough that the ~2.4-unit model fits the screen with room for the UI
function fitCamera() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  const halfV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const halfH = halfV * camera.aspect;
  const distance = Math.max(1.2 / 0.8 / halfH, 1.2 / 0.62 / halfV);
  camera.position.setLength(distance);
  controls.minDistance = distance * 0.5;
  controls.maxDistance = distance * 2;
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  fitCamera();
});
fitCamera();

buildOuroboros()
  .then(() => {
    const touch = window.matchMedia('(pointer: coarse)').matches;
    hint.textContent = touch ? 'Drag to rotate · pinch to zoom' : 'Drag to rotate · scroll to zoom';
  })
  .catch(() => { hint.textContent = "Couldn't load the ouroboros model."; });
offerXR();
