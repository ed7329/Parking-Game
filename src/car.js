import * as THREE from 'three';

// Tuning for the player's car. Units are metres and seconds.
export const CAR = {
  hw: 0.9,
  hl: 2.1,
  wheelbase: 2.6,
  wheelRadius: 0.35,
  maxSteer: 0.6,
  steerRate: 2.4,
  accel: 5,
  reverseAccel: 3.5,
  brake: 11,
  handbrake: 16,
  maxFwd: 10,
  maxRev: 4,
  roll: 1.2,
  drag: 0.5,
};

const geo = {
  body: new THREE.BoxGeometry(1.8, 0.55, 4.2),
  cabin: new THREE.BoxGeometry(1.55, 0.5, 2.1),
  roof: new THREE.BoxGeometry(1.6, 0.08, 1.9),
  bumper: new THREE.BoxGeometry(1.84, 0.22, 0.2),
  wheel: new THREE.CylinderGeometry(CAR.wheelRadius, CAR.wheelRadius, 0.28, 18),
  hub: new THREE.CylinderGeometry(0.18, 0.18, 0.3, 10),
  light: new THREE.BoxGeometry(0.42, 0.14, 0.06),
};

const mat = {
  glass: new THREE.MeshStandardMaterial({ color: 0x1d2733, metalness: 0.6, roughness: 0.15 }),
  tyre: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }),
  hub: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.8, roughness: 0.3 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.7 }),
  head: new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff2c0, emissiveIntensity: 0.6 }),
  tail: new THREE.MeshStandardMaterial({ color: 0x8a0000, emissive: 0x300000 }),
};

const paintCache = new Map();
function paint(color) {
  if (!paintCache.has(color)) {
    paintCache.set(color, new THREE.MeshStandardMaterial({ color, metalness: 0.35, roughness: 0.45 }));
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

// Builds a low-poly car facing +z. The player's car gets its own tail-light
// material so brake lights can glow without affecting parked cars.
export function buildCarMesh(color, isPlayer = false) {
  const g = new THREE.Group();
  const p = paint(color);
  g.add(part(geo.body, p, 0, 0.62, 0));
  g.add(part(geo.cabin, mat.glass, 0, 1.13, -0.25));
  g.add(part(geo.roof, p, 0, 1.42, -0.25));
  g.add(part(geo.bumper, mat.trim, 0, 0.45, 2.12));
  g.add(part(geo.bumper, mat.trim, 0, 0.45, -2.12));

  const tailMat = isPlayer
    ? new THREE.MeshStandardMaterial({ color: 0x8a0000, emissive: 0xff1010, emissiveIntensity: 0.3 })
    : mat.tail;
  for (const sx of [-0.6, 0.6]) {
    g.add(part(geo.light, mat.head, sx, 0.72, 2.1));
    g.add(part(geo.light, tailMat, sx, 0.72, -2.1));
  }

  const frontPivots = [];
  const spinners = [];
  for (const [sx, sz] of [[-0.86, 1.3], [0.86, 1.3], [-0.86, -1.3], [0.86, -1.3]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx, CAR.wheelRadius, sz);
    const spinner = new THREE.Group();
    const tyre = part(geo.wheel, mat.tyre, 0, 0, 0);
    tyre.rotation.z = Math.PI / 2;
    const hub = part(geo.hub, mat.hub, 0, 0, 0);
    hub.rotation.z = Math.PI / 2;
    spinner.add(tyre, hub);
    pivot.add(spinner);
    g.add(pivot);
    spinners.push(spinner);
    if (sz > 0) frontPivots.push(pivot);
  }

  g.userData = { frontPivots, spinners, tailMat };
  return g;
}

function approach(v, target, delta) {
  return v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);
}

export class Car {
  constructor(color = 0xe63946) {
    this.mesh = buildCarMesh(color, true);
    this.reset(0, 0, 0);
  }

  reset(x, z, heading) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.gear = 'D';
    this.braking = false;
    this.wheelSpin = 0;
    this.syncMesh();
  }

  get box() {
    return { x: this.x, z: this.z, heading: this.heading, hw: CAR.hw, hl: CAR.hl };
  }

  // input: { steer: -1..1 (positive = left), throttle: -1..1, handbrake: bool }
  // collides(box) -> bool. Returns the impact speed if the car hit something.
  step(dt, input, collides) {
    const steerTarget = input.steer * CAR.maxSteer;
    this.steer = approach(this.steer, steerTarget, CAR.steerRate * dt);

    let v = this.speed;
    this.braking = false;
    if (input.handbrake) {
      v = approach(v, 0, CAR.handbrake * dt);
      this.braking = true;
    } else if (input.throttle > 0) {
      if (v < -0.05) {
        v = approach(v, 0, CAR.brake * dt);
        this.braking = true;
      } else {
        this.gear = 'D';
        v = Math.min(v + CAR.accel * input.throttle * dt, CAR.maxFwd);
      }
    } else if (input.throttle < 0) {
      if (v > 0.05) {
        v = approach(v, 0, CAR.brake * dt);
        this.braking = true;
      } else {
        this.gear = 'R';
        v = Math.max(v + CAR.reverseAccel * input.throttle * dt, -CAR.maxRev);
      }
    } else {
      v = approach(v, 0, (CAR.roll + Math.abs(v) * CAR.drag) * dt);
    }

    // Kinematic bicycle model, pivoting around the rear axle.
    const half = CAR.wheelbase / 2;
    const dist = v * dt;
    const rx = this.x - Math.sin(this.heading) * half + Math.sin(this.heading) * dist;
    const rz = this.z - Math.cos(this.heading) * half + Math.cos(this.heading) * dist;
    const heading = this.heading + (dist / CAR.wheelbase) * Math.tan(this.steer);
    const next = {
      x: rx + Math.sin(heading) * half,
      z: rz + Math.cos(heading) * half,
      heading,
      hw: CAR.hw,
      hl: CAR.hl,
    };

    if (collides(next)) {
      this.speed = -v * 0.2;
      return Math.abs(v);
    }

    this.x = next.x;
    this.z = next.z;
    this.heading = heading;
    this.speed = v;
    this.wheelSpin += dist / CAR.wheelRadius;
    return 0;
  }

  syncMesh() {
    const { frontPivots, spinners, tailMat } = this.mesh.userData;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    for (const p of frontPivots) p.rotation.y = this.steer;
    for (const s of spinners) s.rotation.x = this.wheelSpin;
    tailMat.emissiveIntensity = this.braking ? 2.2 : this.gear === 'R' ? 1.2 : 0.3;
    tailMat.emissive.setHex(this.gear === 'R' && !this.braking ? 0xffffff : 0xff1010);
  }
}
