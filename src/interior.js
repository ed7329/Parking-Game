import * as THREE from 'three';

// The player's cabin, shown in first-person view: dashboard with live gauges,
// steering wheel, seats, door panels, pillars and a rear-view mirror.
// Vehicle space: +z is forward, +x is the vehicle's left. `side` is +1 for a
// left-hand-drive driver seat and -1 for right-hand drive.

const mat = {
  dash: new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.85 }),
  panel: new THREE.MeshStandardMaterial({ color: 0x3b3f47, roughness: 0.8 }),
  seat: new THREE.MeshStandardMaterial({ color: 0x23252b, roughness: 0.95 }),
  stitch: new THREE.MeshStandardMaterial({ color: 0x55443a, roughness: 0.9 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xbfc4ca, metalness: 0.9, roughness: 0.25 }),
  headliner: new THREE.MeshStandardMaterial({ color: 0x8c8a86, emissive: 0x2e2d2b, roughness: 1, side: THREE.DoubleSide }),
  carpet: new THREE.MeshStandardMaterial({ color: 0x1b1c20, roughness: 1 }),
};

// Every player vehicle shares one mirror image; main.js renders into it.
export const mirrorTarget = new THREE.WebGLRenderTarget(512, 170);
mirrorTarget.texture.colorSpace = THREE.SRGBColorSpace;

function box(w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
}

// A thin bar between two points, used for the windscreen pillars.
function bar(a, b, thickness, material) {
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const m = new THREE.Mesh(new THREE.BoxGeometry(thickness, thickness, start.distanceTo(end)), material);
  m.position.copy(start).lerp(end, 0.5);
  m.lookAt(end);
  return m;
}

function makeGauges() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const ctx = canvas.getContext('2d');

  function dial(cx, value, label, max) {
    const cy = 104;
    const r = 78;
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#3a3f48';
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25);
    ctx.stroke();
    ctx.strokeStyle = '#d7dbe2';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI * 0.75 + (i / 8) * Math.PI * 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (r - 4), cy + Math.sin(a) * (r - 4));
      ctx.lineTo(cx + Math.cos(a) * (r - 16), cy + Math.sin(a) * (r - 16));
      ctx.stroke();
    }
    const a = Math.PI * 0.75 + Math.min(value / max, 1) * Math.PI * 1.5;
    ctx.strokeStyle = '#ff5a36';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * (r - 12), cy + Math.sin(a) * (r - 12));
    ctx.stroke();
    ctx.fillStyle = '#9aa3b2';
    ctx.font = '18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, cx, cy + 50);
  }

  let last = '';
  function update(kmh, rpm, gear, warning) {
    const key = `${Math.round(kmh)}|${rpm.toFixed(2)}|${gear}|${warning}`;
    if (key === last) return;
    last = key;
    ctx.fillStyle = '#0d0f13';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    dial(110, kmh, 'km/h', 60);
    dial(402, rpm * 7, 'rpm x1000', 7);
    ctx.textAlign = 'center';
    ctx.fillStyle = gear === 'R' ? '#ffffff' : '#6ee7a8';
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.fillText(gear, 256, 112);
    ctx.font = '22px system-ui, sans-serif';
    ctx.fillStyle = '#e8eaee';
    ctx.fillText(`${Math.round(kmh)}`, 256, 150);
    if (warning) {
      ctx.fillStyle = '#ff4d4d';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.fillText(warning, 256, 40);
    }
    texture.needsUpdate = true;
  }
  update(0, 0, 'D', '');
  return { texture, update };
}

export function buildInterior(spec, side) {
  const g = new THREE.Group();
  const [seatX, eyeY, seatZ] = spec.seat;
  const driverX = Math.abs(seatX) * side;
  const [gz, beltY] = spec.glass[0];
  const [roofFrontZ, roofY] = spec.glass[1];
  const rearZ = spec.glass[3][0];
  const halfW = spec.glassWidth / 2 - 0.04;
  const innerW = spec.hw - 0.1;
  const dashBack = gz - 0.6;
  // The body is a solid shell up to the beltline, so the cabin is built on
  // top of it: a carpeted deck at the beltline with everything sitting on it.
  const bodyTop = Math.max(beltY, ...spec.profile.filter(([z]) => z >= rearZ && z <= gz).map(([, y]) => y));
  const deck = bodyTop + 0.05; // clear of the body's 4cm bevel

  const carpet = new THREE.Mesh(new THREE.PlaneGeometry(innerW * 2, gz - rearZ), mat.carpet);
  carpet.rotation.x = -Math.PI / 2;
  carpet.position.set(0, deck, (gz + rearZ) / 2);
  g.add(carpet);

  // Dashboard, instrument hood and live gauges in front of the driver.
  g.add(box(innerW * 2, 0.12, 0.6, mat.dash, 0, deck + 0.06, gz - 0.3));
  g.add(box(0.5, 0.05, 0.16, mat.dash, driverX, deck + 0.15, dashBack + 0.1));
  const gauges = makeGauges();
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(0.4, 0.15),
    new THREE.MeshBasicMaterial({ map: gauges.texture }),
  );
  face.position.set(driverX, deck + 0.06, dashBack - 0.005);
  face.rotation.set(-0.25, Math.PI, 0, 'YXZ');
  g.add(face);

  // Steering column and wheel.
  const { ahead, drop } = spec.steering ?? { ahead: 0.5, drop: 0.32 };
  const wheelZ = Math.min(seatZ + ahead, dashBack - 0.08);
  const steering = new THREE.Group();
  steering.position.set(driverX, Math.max(eyeY - drop - 0.1, deck + 0.03), wheelZ);
  steering.rotation.x = -0.55;
  const wheelSpin = new THREE.Group();
  wheelSpin.add(new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.022, 10, 32), mat.seat));
  for (const a of [0, Math.PI, (3 * Math.PI) / 2]) {
    const spoke = box(0.16, 0.03, 0.02, mat.dash, Math.cos(a) * 0.08, Math.sin(a) * 0.08, 0);
    spoke.rotation.z = a;
    wheelSpin.add(spoke);
  }
  wheelSpin.add(box(0.09, 0.09, 0.04, mat.dash, 0, 0, 0.01));
  steering.add(wheelSpin);
  // Column runs forward and down into the dash (in the wheel's tilted frame).
  const columnDir = new THREE.Vector3(0, -0.82, 0.57).normalize();
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.3, 10), mat.dash);
  column.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), columnDir);
  column.position.copy(columnDir).multiplyScalar(0.16);
  steering.add(column);
  g.add(steering);

  // Centre console with a gear lever that moves with the selected gear.
  const consoleLen = Math.max(dashBack - (seatZ - 0.3), 0.4);
  g.add(box(0.22, 0.1, consoleLen, mat.panel, 0, deck + 0.05, dashBack - consoleLen / 2));
  const lever = new THREE.Group();
  lever.position.set(-side * 0.02, deck + 0.1, seatZ + 0.1);
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 8), mat.chrome);
  stick.position.y = 0.03;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 8), mat.dash);
  knob.position.y = 0.07;
  lever.add(stick, knob);
  g.add(lever);

  // Seats for driver and passenger (mostly seen out of the corner of your eye).
  const cushionY = Math.max(eyeY - 0.68, deck + 0.06);
  for (const x of [driverX, -driverX]) {
    g.add(box(0.48, 0.12, 0.5, mat.seat, x, cushionY, seatZ - 0.02));
    const back = box(0.48, 0.6, 0.12, mat.seat, x, cushionY + 0.33, seatZ - 0.3);
    back.rotation.x = -0.15;
    g.add(back);
    g.add(box(0.26, 0.15, 0.1, mat.seat, x, cushionY + 0.72, seatZ - 0.36));
  }

  // Door tops with arm rests, then the window frames (pillars and header).
  const doorLen = gz - 0.2 - rearZ;
  for (const sx of [-1, 1]) {
    const x = sx * innerW;
    g.add(box(0.1, 0.07, doorLen, mat.panel, x, deck + 0.035, rearZ + doorLen / 2));
    g.add(box(0.08, 0.05, 0.4, mat.dash, x - sx * 0.04, deck + 0.09, seatZ));
    g.add(bar([sx * halfW, beltY, gz - 0.02], [sx * halfW, roofY - 0.02, roofFrontZ], 0.06, mat.dash));
    g.add(box(0.06, roofY - beltY, 0.1, mat.dash, sx * halfW, (roofY + beltY) / 2, seatZ - 0.55));
    g.add(bar([sx * halfW, beltY, rearZ + 0.02], [sx * halfW, roofY - 0.02, spec.glass[2][0]], 0.08, mat.dash));
  }
  g.add(box(halfW * 2, 0.05, 0.08, mat.dash, 0, roofY - 0.04, roofFrontZ - 0.02));
  const liner = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, roofFrontZ - spec.glass[2][0]), mat.headliner);
  liner.rotation.x = Math.PI / 2;
  liner.position.set(0, roofY - 0.02, (roofFrontZ + spec.glass[2][0]) / 2);
  g.add(liner);

  // Rear-view mirror hanging from the windscreen header. Its image is drawn
  // from a camera looking backwards, with UVs flipped so it reads like a mirror.
  const mirrorZ = roofFrontZ - 0.08;
  const mirrorY = roofY - 0.12;
  g.add(box(0.025, 0.07, 0.025, mat.dash, 0, roofY - 0.06, mirrorZ + 0.02));
  g.add(box(0.23, 0.08, 0.03, mat.dash, 0, mirrorY, mirrorZ + 0.02));
  const mirrorGeo = new THREE.PlaneGeometry(0.21, 0.064);
  const uv = mirrorGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
  const mirror = new THREE.Mesh(mirrorGeo, new THREE.MeshBasicMaterial({ map: mirrorTarget.texture }));
  mirror.position.set(0, mirrorY, mirrorZ);
  // Face back towards the driver, angled slightly towards their seat.
  mirror.rotation.y = Math.PI - side * 0.25;
  g.add(mirror);

  g.userData = {
    wheelSpin,
    gauges,
    lever,
    eye: new THREE.Vector3(driverX, eyeY, seatZ),
    mirrorPos: new THREE.Vector3(0, mirrorY, mirrorZ),
  };
  return g;
}

// Moves the gear lever to a rough H-pattern position.
const LEVER = { R: [-0.06, -0.06], N: [0, 0], D: [0, -0.06], 1: [-0.06, 0.06], 2: [-0.06, -0.06], 3: [0, 0.06], 4: [0, -0.06], 5: [0.06, 0.06] };
export function setLever(lever, gear, side) {
  const [x, z] = LEVER[gear] ?? [0, 0];
  lever.children.forEach((c) => c.position.set(x * -side, c.position.y, z));
}
