import * as THREE from 'three';
import { LEVELS } from './levels.js';
import { Car, CAR, buildCarMesh } from './car.js';
import { obbIntersects, pointObbDistance, cornersInside, angleDiff, axes } from './collision.js';

const PARKED_COLORS = [0x2a9d8f, 0xe9c46a, 0x264653, 0xf4a261, 0x8d99ae, 0xf1faee, 0x457b9d, 0x6d597a, 0x3a3a3a];
const ALIGN_TOLERANCE = 0.2; // radians (~11 degrees)
const STOP_SPEED = 0.25;
const HOLD_TIME = 1.0;

// ---------- Renderer & scene ----------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);

const hemi = new THREE.HemisphereLight(0xdfefff, 0x445533, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.6);
sun.position.set(18, 30, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 90 });
scene.add(sun);

const player = new Car();
scene.add(player.mesh);

let levelGroup = null;
let obstacles = [];
let targetMarker = null;
let targetArrow = null;

// ---------- Game state ----------
const state = {
  mode: 'menu', // 'menu' | 'playing' | 'complete'
  levelIndex: 0,
  time: 0,
  hits: 0,
  hitCooldown: 0,
  hold: 0,
  shake: 0,
  cameraMode: 'chase',
};

const storage = {
  load() {
    try {
      return JSON.parse(localStorage.getItem('parking-game-progress')) || {};
    } catch {
      return {};
    }
  },
  save(data) {
    try {
      localStorage.setItem('parking-game-progress', JSON.stringify(data));
    } catch {
      // Progress just won't persist (private mode, blocked storage, etc).
    }
  },
};
let progress = storage.load();

// ---------- Level building ----------
function box(w, h, d, color, opts = {}) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...opts }),
  );
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function groundStrip(group, x, z, heading, w, l, color = 0xf2f2f2, y = 0.012) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, l),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 }),
  );
  m.rotation.x = -Math.PI / 2;
  m.rotation.z = heading;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  group.add(m);
  return m;
}

function drawSpotLines(group, s) {
  const a = axes(s);
  const t = 0.12;
  if (s.lines === 'sides') {
    for (const side of [-1, 1]) {
      groundStrip(group, s.x + a.rx * s.hw * side, s.z + a.rz * s.hw * side, s.heading, t, s.hl * 2);
    }
  } else {
    for (const end of [-1, 1]) {
      groundStrip(group, s.x + a.fx * s.hl * end, s.z + a.fz * s.hl * end, s.heading, s.hw * 2, t);
    }
  }
}

function addObstacle(group, o, defaultColor = 0xb5b0a5) {
  const h = o.h ?? 1;
  const m = box(o.hw * 2, h, o.hl * 2, o.color ?? defaultColor);
  m.position.set(o.x, h / 2, o.z);
  m.rotation.y = o.heading;
  group.add(m);
  obstacles.push({ x: o.x, z: o.z, heading: o.heading, hw: o.hw, hl: o.hl });
}

function addTree(group, x, z, s) {
  const trunk = box(0.35 * s, 1.6 * s, 0.35 * s, 0x6b4f32);
  trunk.position.set(x, 0.8 * s, z);
  const crown = new THREE.Mesh(
    new THREE.ConeGeometry(1.5 * s, 3.2 * s, 7),
    new THREE.MeshStandardMaterial({ color: 0x2f6d3a, roughness: 0.9 }),
  );
  crown.position.set(x, 3 * s, z);
  crown.castShadow = true;
  group.add(trunk, crown);
}

function buildLevel(level) {
  if (levelGroup) {
    scene.remove(levelGroup);
    levelGroup.traverse((o) => {
      if ((o.isMesh || o.isLineSegments) && !o.userData.shared) {
        o.geometry.dispose();
        o.material.dispose();
      }
    });
  }
  levelGroup = new THREE.Group();
  obstacles = [];
  scene.add(levelGroup);

  const { w, d } = level.lot;
  scene.background = new THREE.Color(level.indoor ? 0x2b2e33 : 0x9fd3ff);
  scene.fog = new THREE.Fog(scene.background, 45, level.indoor ? 90 : 160);
  hemi.intensity = level.indoor ? 0.65 : 0.9;

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ color: level.indoor ? 0x50545a : 0x5d8f4c, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  levelGroup.add(ground);
  groundStrip(levelGroup, 0, 0, 0, w, d, level.indoor ? 0x5f636a : 0x3b3e44, 0.005);

  // Perimeter walls.
  const wallColor = level.indoor ? 0x8b9097 : 0xb5b0a5;
  const wallH = level.indoor ? 3.2 : 0.9;
  addObstacle(levelGroup, { x: 0, z: d / 2 + 0.25, heading: 0, hw: w / 2 + 0.5, hl: 0.25, h: wallH }, wallColor);
  addObstacle(levelGroup, { x: 0, z: -d / 2 - 0.25, heading: 0, hw: w / 2 + 0.5, hl: 0.25, h: wallH }, wallColor);
  addObstacle(levelGroup, { x: w / 2 + 0.25, z: 0, heading: 0, hw: 0.25, hl: d / 2, h: wallH }, wallColor);
  addObstacle(levelGroup, { x: -w / 2 - 0.25, z: 0, heading: 0, hw: 0.25, hl: d / 2, h: wallH }, wallColor);

  for (const s of level.spots ?? []) drawSpotLines(levelGroup, s);
  for (const wall of level.walls ?? []) addObstacle(levelGroup, wall);

  (level.parked ?? []).forEach((p, i) => {
    const color = PARKED_COLORS[(i * 5 + state.levelIndex * 3) % PARKED_COLORS.length];
    const mesh = buildCarMesh(color);
    mesh.traverse((o) => (o.userData.shared = true));
    mesh.position.set(p.x, 0, p.z);
    mesh.rotation.y = p.heading;
    levelGroup.add(mesh);
    obstacles.push({ x: p.x, z: p.z, heading: p.heading, hw: CAR.hw, hl: CAR.hl });
  });

  const coneMat = new THREE.MeshStandardMaterial({ color: 0xff6b1a, roughness: 0.6 });
  for (const c of level.cones ?? []) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.75, 12), coneMat);
    cone.position.set(c.x, 0.375, c.z);
    cone.castShadow = true;
    levelGroup.add(cone);
    obstacles.push({ x: c.x, z: c.z, heading: 0, hw: 0.25, hl: 0.25 });
  }

  if (!level.indoor) {
    for (let i = 0; i < 26; i++) {
      const ang = (i / 26) * Math.PI * 2;
      const r = Math.max(w, d) / 2 + 8 + ((i * 37) % 11);
      addTree(levelGroup, Math.cos(ang) * r, Math.sin(ang) * r, 0.8 + ((i * 13) % 5) * 0.12);
    }
  }

  // Target bay: a glowing pad plus an arrow when direction matters.
  const t = level.target;
  targetMarker = groundStrip(levelGroup, t.x, t.z, t.heading, t.hw * 2, t.hl * 2, 0xffd400, 0.015);
  targetMarker.material.dispose();
  targetMarker.material = new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.35, depthWrite: false });
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.PlaneGeometry(t.hw * 2, t.hl * 2)),
    new THREE.LineBasicMaterial({ color: 0xffffff }),
  );
  targetMarker.add(edges);

  targetArrow = null;
  if (t.dir === 'forward') {
    const shape = new THREE.Shape();
    shape.moveTo(0, 1.1);
    shape.lineTo(0.7, 0.1);
    shape.lineTo(0.25, 0.1);
    shape.lineTo(0.25, -1.0);
    shape.lineTo(-0.25, -1.0);
    shape.lineTo(-0.25, 0.1);
    shape.lineTo(-0.7, 0.1);
    targetArrow = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    // Laid flat, the shape's +y points along -z; turn it to face the target heading.
    targetArrow.rotation.set(-Math.PI / 2, t.heading + Math.PI, 0, 'YXZ');
    targetArrow.position.set(t.x, 0.02, t.z);
    levelGroup.add(targetArrow);
  }
}

// ---------- Input ----------
const keys = new Set();
const touch = { left: false, right: false, gas: false, brake: false };

window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === 'KeyC') toggleCamera();
  if (e.code === 'KeyR' && state.mode === 'playing') startLevel(state.levelIndex);
  if (e.code === 'Escape') showMenu();
  if (e.code === 'Enter' && state.mode === 'complete') nextLevel();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

function readInput() {
  const left = keys.has('KeyA') || keys.has('ArrowLeft') || touch.left;
  const right = keys.has('KeyD') || keys.has('ArrowRight') || touch.right;
  const gas = keys.has('KeyW') || keys.has('ArrowUp') || touch.gas;
  const brake = keys.has('KeyS') || keys.has('ArrowDown') || touch.brake;
  return {
    steer: (left ? 1 : 0) - (right ? 1 : 0),
    throttle: (gas ? 1 : 0) - (brake ? 1 : 0),
    handbrake: keys.has('Space'),
  };
}

for (const btn of document.querySelectorAll('[data-touch]')) {
  const key = btn.dataset.touch;
  const set = (v) => (e) => {
    e.preventDefault();
    touch[key] = v;
    btn.classList.toggle('active', v);
  };
  btn.addEventListener('pointerdown', set(true));
  btn.addEventListener('pointerup', set(false));
  btn.addEventListener('pointercancel', set(false));
  btn.addEventListener('pointerleave', set(false));
}

// ---------- HUD & screens ----------
const $ = (id) => document.getElementById(id);
const hud = {
  level: $('hud-level'),
  time: $('hud-time'),
  par: $('hud-par'),
  hits: $('hud-hits'),
  speed: $('hud-speed'),
  gear: $('hud-gear'),
  status: $('hud-status'),
  progress: $('hud-progress'),
  front: $('sensor-front'),
  rear: $('sensor-rear'),
  toast: $('toast'),
};
const overlay = $('overlay');

$('btn-camera').addEventListener('click', toggleCamera);
$('btn-restart').addEventListener('click', () => startLevel(state.levelIndex));
$('btn-menu').addEventListener('click', showMenu);

function toggleCamera() {
  state.cameraMode = state.cameraMode === 'chase' ? 'top' : 'chase';
}

let toastTimer = 0;
function toast(text, seconds = 1.6) {
  hud.toast.textContent = text;
  hud.toast.classList.add('show');
  toastTimer = seconds;
}

function stars(n) {
  return '★'.repeat(n) + '☆'.repeat(3 - n);
}

function isUnlocked(i) {
  return i === 0 || (progress[i - 1]?.stars ?? 0) > 0;
}

function showMenu() {
  state.mode = 'menu';
  document.body.classList.remove('playing');
  const cards = LEVELS.map((lvl, i) => {
    const best = progress[i];
    const locked = !isUnlocked(i);
    return `<button class="level-card" data-level="${i}" ${locked ? 'disabled' : ''}>
      <span class="num">${i + 1}</span>
      <span class="name">${lvl.name}</span>
      <span class="stars">${locked ? '🔒' : stars(best?.stars ?? 0)}</span>
      ${best ? `<span class="best">Best ${best.time.toFixed(1)}s</span>` : ''}
    </button>`;
  }).join('');
  overlay.innerHTML = `<div class="card">
    <h1>Park It!</h1>
    <p class="sub">Steer into the glowing bay, line up, and come to a stop.</p>
    <div class="levels">${cards}</div>
    <div class="controls-help">
      <div><kbd>W</kbd><kbd>S</kbd> / <kbd>↑</kbd><kbd>↓</kbd> drive · brake · reverse</div>
      <div><kbd>A</kbd><kbd>D</kbd> / <kbd>←</kbd><kbd>→</kbd> steer</div>
      <div><kbd>Space</kbd> handbrake · <kbd>C</kbd> camera · <kbd>R</kbd> restart · <kbd>Esc</kbd> menu</div>
    </div>
  </div>`;
  overlay.classList.add('show');
  overlay.querySelectorAll('[data-level]').forEach((b) =>
    b.addEventListener('click', () => startLevel(Number(b.dataset.level))),
  );
}

function startLevel(i) {
  const level = LEVELS[i];
  state.levelIndex = i;
  state.mode = 'playing';
  state.time = 0;
  state.hits = 0;
  state.hitCooldown = 0;
  state.hold = 0;
  buildLevel(level);
  player.reset(level.start.x, level.start.z, level.start.heading);
  snapCamera();
  overlay.classList.remove('show');
  document.body.classList.add('playing');
  hud.level.textContent = `${i + 1}. ${level.name}`;
  hud.par.textContent = `${level.par}s`;
  toast(level.hint, 4);
}

function nextLevel() {
  if (state.levelIndex + 1 < LEVELS.length) startLevel(state.levelIndex + 1);
  else showMenu();
}

function completeLevel() {
  const level = LEVELS[state.levelIndex];
  state.mode = 'complete';
  let earned = 3;
  if (state.time > level.par) earned--;
  if (state.hits > 0) earned--;
  if (state.hits > 2) earned--;
  earned = Math.max(1, earned);

  const prev = progress[state.levelIndex];
  const isRecord = !prev || earned > prev.stars || (earned === prev.stars && state.time < prev.time);
  if (isRecord) {
    progress[state.levelIndex] = { stars: earned, time: state.time };
    storage.save(progress);
  }

  const last = state.levelIndex + 1 >= LEVELS.length;
  overlay.innerHTML = `<div class="card">
    <h2>${last ? 'All levels parked!' : 'Parked!'}</h2>
    <div class="big-stars">${stars(earned)}</div>
    <div class="results">
      <div><span>Time</span><b>${state.time.toFixed(1)}s</b> <small>par ${level.par}s</small></div>
      <div><span>Bumps</span><b>${state.hits}</b></div>
    </div>
    ${isRecord && prev ? '<p class="record">New best!</p>' : ''}
    <div class="actions">
      <button id="ov-retry" class="secondary">Retry</button>
      <button id="ov-next">${last ? 'Menu' : 'Next level'}</button>
    </div>
  </div>`;
  overlay.classList.add('show');
  $('ov-retry').addEventListener('click', () => startLevel(state.levelIndex));
  $('ov-next').addEventListener('click', nextLevel);
}

// ---------- Simulation ----------
function collides(b) {
  for (const o of obstacles) {
    if (Math.abs(o.x - b.x) > o.hw + o.hl + 3 && Math.abs(o.z - b.z) > o.hw + o.hl + 3) continue;
    if (obbIntersects(b, o)) return true;
  }
  return false;
}

// Distance from the front or rear bumper to the nearest obstacle.
function sensorDistance(end) {
  const b = player.box;
  const a = axes(b);
  const l = CAR.hl * end;
  const points = [-1, 0, 1].map((w) => ({
    x: b.x + a.fx * l + a.rx * CAR.hw * w,
    z: b.z + a.fz * l + a.rz * CAR.hw * w,
  }));
  let min = Infinity;
  for (const o of obstacles) {
    for (const p of points) min = Math.min(min, pointObbDistance(o, p.x, p.z));
  }
  return min;
}

function renderSensor(el, dist) {
  const level = dist < 0.35 ? 4 : dist < 0.8 ? 3 : dist < 1.4 ? 2 : dist < 2.2 ? 1 : 0;
  el.dataset.level = level;
}

function update(dt) {
  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) hud.toast.classList.remove('show');
  }
  if (state.mode !== 'playing') {
    player.braking = false;
    player.syncMesh();
    return;
  }

  state.time += dt;
  state.hitCooldown -= dt;
  const input = readInput();

  // Fixed substeps keep collisions solid at low frame rates.
  const steps = Math.ceil(dt / (1 / 120));
  for (let i = 0; i < steps; i++) {
    const impact = player.step(dt / steps, input, collides);
    if (impact > 0.4 && state.hitCooldown <= 0) {
      state.hits++;
      state.hitCooldown = 0.6;
      state.shake = Math.min(0.4, impact * 0.08);
      toast(impact > 3 ? 'Crunch! 💥' : 'Bump!', 0.9);
    }
  }
  player.syncMesh();

  // Parking check.
  const level = LEVELS[state.levelIndex];
  const t = level.target;
  const inside = cornersInside(player.box, t);
  const diff = Math.abs(angleDiff(player.heading, t.heading));
  const aligned = t.dir === 'forward' ? diff < ALIGN_TOLERANCE : Math.min(diff, Math.PI - diff) < ALIGN_TOLERANCE;
  const stopped = Math.abs(player.speed) < STOP_SPEED;

  if (inside && aligned && stopped) state.hold += dt;
  else state.hold = 0;

  const color = inside && aligned ? 0x2bd96b : inside ? 0xff9f1c : 0xffd400;
  targetMarker.material.color.setHex(color);
  targetMarker.material.opacity = 0.3 + Math.sin(state.time * 4) * 0.08;

  let status = '';
  if (inside && aligned) status = stopped ? 'Hold still…' : 'Now stop!';
  else if (inside && t.dir === 'forward' && Math.min(diff, Math.PI - diff) < ALIGN_TOLERANCE) status = 'Wrong way round — follow the arrow';
  else if (inside) status = 'Straighten up';
  else if (obbIntersects(player.box, t)) status = 'Get fully inside the bay';
  hud.status.textContent = status;
  hud.progress.style.width = `${Math.min(state.hold / HOLD_TIME, 1) * 100}%`;

  if (state.hold >= HOLD_TIME) completeLevel();

  hud.time.textContent = `${state.time.toFixed(1)}s`;
  hud.time.classList.toggle('over', state.time > level.par);
  hud.hits.textContent = state.hits;
  hud.speed.textContent = Math.round(Math.abs(player.speed) * 3.6);
  hud.gear.textContent = player.gear;
  hud.gear.classList.toggle('reverse', player.gear === 'R');
  renderSensor(hud.front, sensorDistance(1));
  renderSensor(hud.rear, sensorDistance(-1));
}

// ---------- Camera ----------
const camTarget = new THREE.Vector3();
const camLook = new THREE.Vector3();

function desiredCamera() {
  const sx = Math.sin(player.heading);
  const sz = Math.cos(player.heading);
  if (state.cameraMode === 'top') {
    camTarget.set(player.x, 30, player.z - 4);
    camLook.set(player.x, 0, player.z);
  } else {
    camTarget.set(player.x - sx * 8.5, 4.6, player.z - sz * 8.5);
    camLook.set(player.x + sx * 2.5, 0.8, player.z + sz * 2.5);
  }
  // Keep the camera inside the lot so tall walls never block the view.
  // When clamped, lift the camera so it still looks over the car.
  const { w, d } = LEVELS[state.levelIndex].lot;
  const cx = THREE.MathUtils.clamp(camTarget.x, -w / 2 + 0.6, w / 2 - 0.6);
  const cz = THREE.MathUtils.clamp(camTarget.z, -d / 2 + 0.6, d / 2 - 0.6);
  camTarget.y += Math.hypot(cx - camTarget.x, cz - camTarget.z) * 0.6;
  camTarget.x = cx;
  camTarget.z = cz;
}

function snapCamera() {
  desiredCamera();
  camera.position.copy(camTarget);
  camera.lookAt(camLook);
}

const smoothLook = new THREE.Vector3();
function updateCamera(dt) {
  desiredCamera();
  const k = 1 - Math.exp(-dt * 4);
  camera.position.lerp(camTarget, k);
  smoothLook.lerp(camLook, 1 - Math.exp(-dt * 8));
  camera.lookAt(smoothLook);
  if (state.shake > 0) {
    camera.position.x += (Math.random() - 0.5) * state.shake;
    camera.position.y += (Math.random() - 0.5) * state.shake;
    state.shake = Math.max(0, state.shake - dt);
  }
  // Keep shadows crisp around the player.
  sun.position.set(player.x + 18, 30, player.z + 12);
  sun.target.position.set(player.x, 0, player.z);
  sun.target.updateMatrixWorld();
}

// ---------- Main loop ----------
function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 75 : 60;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  update(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// Show the first level behind the menu so the title screen isn't empty.
buildLevel(LEVELS[0]);
player.reset(LEVELS[0].start.x, LEVELS[0].start.z, LEVELS[0].start.heading);
snapCamera();
smoothLook.copy(camLook);
showMenu();
requestAnimationFrame(frame);

// Exposed for debugging and automated tests.
window.__game = { state, player, LEVELS, startLevel, collides, cornersInside };
