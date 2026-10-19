import * as THREE from 'three';

// Vehicle definitions. Units are metres and seconds. `profile` is the side
// silhouette above the wheel arches (front to rear, as [z, y]); `glass` is the
// greenhouse shape; `axles` are the front/rear axle z positions.
export const VEHICLES = {
  sedan: {
    name: 'Sedan',
    hw: 0.9, hl: 2.1, axles: [1.3, -1.3], wheelRadius: 0.35, bottom: 0.28,
    maxSteer: 0.6, steerRate: 2.4, accel: 5, reverseAccel: 3.5, brake: 11, maxFwd: 10, maxRev: 4,
    profile: [[2.1, 0.28], [2.12, 0.68], [1.98, 0.84], [0.95, 0.95], [-1.55, 0.97], [-2.06, 0.92], [-2.1, 0.74], [-2.1, 0.28]],
    glass: [[0.95, 0.95], [0.25, 1.38], [-0.95, 1.38], [-1.55, 0.97]],
    glassWidth: 1.56, seat: [0.36, 1.24, -0.25], engine: 1,
  },
  hatch: {
    name: 'Hatchback',
    hw: 0.85, hl: 1.95, axles: [1.2, -1.2], wheelRadius: 0.33, bottom: 0.27,
    maxSteer: 0.62, steerRate: 2.6, accel: 5.2, reverseAccel: 3.5, brake: 11, maxFwd: 10, maxRev: 4,
    profile: [[1.95, 0.27], [1.97, 0.66], [1.82, 0.83], [0.9, 0.94], [-1.82, 0.98], [-1.95, 0.8], [-1.95, 0.27]],
    glass: [[0.9, 0.94], [0.2, 1.42], [-1.62, 1.42], [-1.82, 0.98]],
    glassWidth: 1.48, seat: [0.34, 1.26, -0.1], engine: 1.15,
  },
  suv: {
    name: 'SUV',
    hw: 1.0, hl: 2.45, axles: [1.5, -1.45], wheelRadius: 0.42, bottom: 0.38,
    maxSteer: 0.58, steerRate: 2.2, accel: 4.5, reverseAccel: 3.2, brake: 10, maxFwd: 9.5, maxRev: 4,
    profile: [[2.45, 0.38], [2.48, 0.95], [2.3, 1.12], [1.25, 1.2], [-2.35, 1.22], [-2.45, 1.1], [-2.45, 0.38]],
    glass: [[1.25, 1.2], [0.55, 1.82], [-2.15, 1.82], [-2.35, 1.22]],
    glassWidth: 1.78, seat: [0.4, 1.62, -0.15], engine: 0.85,
  },
  truck: {
    name: 'Box Truck',
    hw: 1.25, hl: 3.6, axles: [2.5, -1.9], wheelRadius: 0.5, bottom: 0.45,
    maxSteer: 0.55, steerRate: 1.8, accel: 3, reverseAccel: 2.4, brake: 8, maxFwd: 8, maxRev: 3.2,
    profile: [[3.6, 0.45], [3.63, 1.25], [3.45, 1.5], [1.8, 1.5], [1.8, 1.15], [-3.6, 1.15], [-3.6, 0.45]],
    glass: [[3.38, 1.5], [3.0, 2.3], [1.85, 2.3], [1.85, 1.5]],
    glassWidth: 2.2, seat: [0.55, 2.1, 2.55], engine: 0.6, chase: { back: 12, height: 7.5 },
    cargo: { z0: -3.6, z1: 1.7, y0: 1.15, y1: 3.3, color: 0xf2f2ee },
  },
};

for (const v of Object.values(VEHICLES)) v.wheelbase = v.axles[0] - v.axles[1];

const BEVEL = 0.04;

function sideShape(spec) {
  // Bottom edge runs rear to front with arches cut around each axle.
  const s = new THREE.Shape();
  const archR = spec.wheelRadius + 0.08;
  const y = spec.bottom;
  const rear = spec.profile[spec.profile.length - 1];
  s.moveTo(rear[0], rear[1]);
  for (const az of [...spec.axles].sort((a, b) => a - b)) {
    s.lineTo(az - archR, y);
    s.absarc(az, y, archR, Math.PI, 0, true);
  }
  for (const [z, py] of spec.profile) s.lineTo(z, py);
  return s;
}

function extrudeSide(shape, width) {
  const depth = Math.max(width - BEVEL * 2, 0.01);
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: BEVEL, bevelSize: BEVEL, bevelSegments: 2, curveSegments: 10,
  });
  // Shape x -> world z (length), shape y -> height, extrusion -> width.
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2);
  return g;
}

const geoCache = new Map();
function geometriesFor(type) {
  if (geoCache.has(type)) return geoCache.get(type);
  const spec = VEHICLES[type];
  const glassShape = new THREE.Shape(spec.glass.map(([z, y]) => new THREE.Vector2(z, y)));
  const roofZ0 = spec.glass[2][0];
  const roofZ1 = spec.glass[1][0];
  const g = {
    body: extrudeSide(sideShape(spec), spec.hw * 2),
    glass: extrudeSide(glassShape, spec.glassWidth),
    roof: new THREE.BoxGeometry(spec.glassWidth - 0.04, 0.07, roofZ1 - roofZ0 + 0.05),
    roofPos: [0, spec.glass[1][1] + 0.03, (roofZ0 + roofZ1) / 2],
    tyre: new THREE.CylinderGeometry(spec.wheelRadius, spec.wheelRadius, 0.3, 20),
    hub: new THREE.CylinderGeometry(spec.wheelRadius * 0.55, spec.wheelRadius * 0.55, 0.32, 8),
    light: new THREE.BoxGeometry(0.4, 0.13, 0.06),
    grille: new THREE.BoxGeometry(spec.hw * 0.9, 0.18, 0.05),
    plate: new THREE.BoxGeometry(0.5, 0.12, 0.03),
    mirror: new THREE.BoxGeometry(0.16, 0.1, 0.07),
  };
  if (spec.cargo) {
    const c = spec.cargo;
    g.cargo = new THREE.BoxGeometry(spec.hw * 2 - 0.05, c.y1 - c.y0, c.z1 - c.z0);
  }
  geoCache.set(type, g);
  return g;
}

const mat = {
  glass: new THREE.MeshStandardMaterial({ color: 0x1b2633, metalness: 0.7, roughness: 0.12 }),
  tyre: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.9 }),
  hub: new THREE.MeshStandardMaterial({ color: 0xc4c8ce, metalness: 0.85, roughness: 0.3 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x1e2024, roughness: 0.6 }),
  plate: new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.5 }),
  head: new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: 0.6 }),
  tail: new THREE.MeshStandardMaterial({ color: 0x8a0000, emissive: 0x300000 }),
};

const paintCache = new Map();
function paint(color) {
  if (!paintCache.has(color)) {
    paintCache.set(color, new THREE.MeshStandardMaterial({ color, metalness: 0.45, roughness: 0.35 }));
  }
  return paintCache.get(color);
}

function part(geometry, material, x, y, z) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Builds a vehicle facing +z. Geometry and most materials are shared, so many
// parked vehicles stay cheap. The player's vehicle gets its own tail-light
// material (for brake lights) and a steering wheel for first-person view.
export function buildVehicleMesh(type, color, isPlayer = false) {
  const spec = VEHICLES[type];
  const geo = geometriesFor(type);
  const p = paint(color);
  const g = new THREE.Group();
  const cabinParts = [];

  g.add(part(geo.body, p, 0, 0, 0));
  const glass = part(geo.glass, mat.glass, 0, 0, 0);
  const roof = part(geo.roof, p, ...geo.roofPos);
  g.add(glass, roof);
  cabinParts.push(glass, roof);

  if (geo.cargo) {
    const c = spec.cargo;
    g.add(part(geo.cargo, paint(c.color), 0, (c.y0 + c.y1) / 2, (c.z0 + c.z1) / 2));
  }

  // Front end: grille, plate, headlights. Rear: plate, tail lights.
  const front = spec.profile[0][0];
  const rear = spec.profile[spec.profile.length - 1][0];
  const lightY = spec.profile[1][1] - 0.12;
  g.add(part(geo.grille, mat.trim, 0, lightY - 0.05, front + 0.03));
  g.add(part(geo.plate, mat.plate, 0, spec.bottom + 0.14, front + 0.04));
  g.add(part(geo.plate, mat.plate, 0, spec.bottom + 0.14, rear - 0.04));

  const tailMat = isPlayer ? mat.tail.clone() : mat.tail;
  for (const sx of [-1, 1]) {
    g.add(part(geo.light, mat.head, sx * (spec.hw - 0.3), lightY, front + 0.02));
    g.add(part(geo.light, tailMat, sx * (spec.hw - 0.3), spec.cargo ? 0.85 : lightY, rear - 0.02));
    const mirror = part(geo.mirror, p, sx * (spec.hw + 0.08), spec.glass[0][1] + 0.12, spec.glass[0][0] - 0.15);
    g.add(mirror);
  }

  const frontPivots = [];
  const spinners = [];
  const wheelX = spec.hw - 0.17;
  for (const az of spec.axles) {
    for (const sx of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(sx * wheelX, spec.wheelRadius, az);
      const spinner = new THREE.Group();
      const tyre = part(geo.tyre, mat.tyre, 0, 0, 0);
      tyre.rotation.z = Math.PI / 2;
      const hub = part(geo.hub, mat.hub, 0, 0, 0);
      hub.rotation.z = Math.PI / 2;
      spinner.add(tyre, hub);
      pivot.add(spinner);
      g.add(pivot);
      spinners.push(spinner);
      if (az === spec.axles[0]) frontPivots.push(pivot);
    }
  }

  // Dashboard and steering wheel, only shown in first-person view.
  let interior = null;
  let wheelSpin = null;
  if (isPlayer) {
    const [sx, sy, sz] = spec.seat;
    const [gz, gy] = spec.glass[0];
    interior = new THREE.Group();
    interior.visible = false;
    const dash = part(new THREE.BoxGeometry(spec.glassWidth, 0.14, 0.7), mat.trim, 0, gy + 0.05, gz - 0.25);
    const steering = new THREE.Group();
    steering.position.set(sx, sy - 0.32, sz + 0.5);
    steering.rotation.x = -0.5;
    wheelSpin = new THREE.Group();
    wheelSpin.add(
      new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.022, 8, 28), mat.trim),
      new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.02), mat.trim),
    );
    steering.add(wheelSpin);
    interior.add(dash, steering);
    g.add(interior);
  }

  g.userData = { frontPivots, spinners, tailMat, cabinParts, interior, wheelSpin };
  return g;
}
