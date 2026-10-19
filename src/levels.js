// Level data. Coordinates are metres on the ground plane; heading 0 faces +z,
// heading PI/2 faces +x. A target's `dir` is 'any' (either way round) or
// 'forward' (the vehicle's nose must point along the target heading).
//
// Optional level fields:
//   vehicle    player vehicle type from vehicles.js (default 'sedan')
//   timeLimit  seconds before the level is failed
//   traffic    moving vehicles: { type, path: [[x, z], ...], speed, offset, loop }
//   tunnels    replace the east/west walls with tunnels traffic can drive through

const PI = Math.PI;
const SPOT_W = 2.7;
const SPOT_L = 5.5;

// A row of perpendicular bays. Every bay except the target (and any `empty`
// indices) gets a parked vehicle, cycling through `types`.
function row({ z, heading, x0, count, target = -1, empty = [], w = SPOT_W, l = SPOT_L, types = ['sedan', 'hatch'] }) {
  const spots = [];
  const parked = [];
  let targetSpot = null;
  for (let i = 0; i < count; i++) {
    const x = x0 + i * w;
    const spot = { x, z, heading, hw: w / 2, hl: l / 2, lines: 'sides' };
    spots.push(spot);
    if (i === target) targetSpot = spot;
    else if (!empty.includes(i)) {
      parked.push({
        x, z,
        heading: (i * 7) % 3 === 0 ? heading + PI : heading,
        type: types[(i * 5 + Math.round(z)) % types.length],
      });
    }
  }
  return { spots, parked, targetSpot };
}

function merge(...rows) {
  return {
    spots: rows.flatMap((r) => r.spots),
    parked: rows.flatMap((r) => r.parked),
  };
}

// Points around a rounded rectangle, anticlockwise when seen from above.
function roundedRect(x0, x1, z0, z1, r) {
  const pts = [];
  const corners = [[x1 - r, z0 + r, -PI / 2], [x1 - r, z1 - r, 0], [x0 + r, z1 - r, PI / 2], [x0 + r, z0 + r, PI]];
  for (const [cx, cz, a0] of corners) {
    for (let k = 0; k <= 3; k++) {
      const a = a0 + (k / 3) * (PI / 2);
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  }
  return pts;
}

// Sideways cars forming a barrier across the lot.
function barrier(z, xs) {
  return xs.map((x, i) => ({ x, z, heading: i % 2 ? PI / 2 : -PI / 2, type: i % 3 ? 'sedan' : 'suv' }));
}

function level1() {
  const r = row({ z: 10, heading: 0, x0: -8.1, count: 7, target: 3 });
  return {
    name: 'First Spot',
    hint: 'Drive straight ahead and stop inside the glowing bay.',
    lot: { w: 30, d: 40 },
    start: { x: 0, z: -12, heading: 0 },
    par: 20,
    target: { ...r.targetSpot, dir: 'any' },
    ...merge(r),
  };
}

function level2() {
  const top = row({ z: 8, heading: 0, x0: -13.5, count: 11, target: 7, empty: [2] });
  const bottom = row({ z: -12, heading: PI, x0: -13.5, count: 11 });
  return {
    name: 'Turn In',
    hint: 'Swing wide, then turn into the bay on your right.',
    lot: { w: 40, d: 40 },
    start: { x: -14, z: -4, heading: PI / 2 },
    par: 30,
    target: { ...top.targetSpot, dir: 'any' },
    ...merge(top, bottom),
  };
}

function level3() {
  const top = row({ z: 8, heading: PI, x0: -13.5, count: 11, target: 6 });
  const bottom = row({ z: -14, heading: PI, x0: -13.5, count: 11 });
  return {
    name: 'Back It In',
    hint: 'Reverse into the bay so you finish nose-out (follow the arrow).',
    lot: { w: 40, d: 40 },
    start: { x: 10, z: -3, heading: -PI / 2 },
    par: 40,
    target: { ...top.targetSpot, dir: 'forward' },
    ...merge(top, bottom),
  };
}

const CURB_XS = [-18.6, -12.4, -6.2, 6.2, 12.4, 18.6];

function curbside() {
  return {
    lot: { w: 44, d: 24 },
    start: { x: -15, z: 0.9, heading: PI / 2 },
    target: { x: 0, z: 4.45, heading: PI / 2, hw: 1.25, hl: 3.2, dir: 'forward' },
    spots: CURB_XS.map((x) => ({ x, z: 4.45, heading: PI / 2, hw: 1.25, hl: 3.0, lines: 'ends' })),
    parked: [
      ...CURB_XS.map((x, i) => ({ x, z: 4.45, heading: PI / 2, type: i % 3 === 1 ? 'hatch' : 'sedan' })),
      ...[-14, -8, 2, 9, 15].map((x, i) => ({ x, z: -8.6, heading: -PI / 2, type: i % 2 ? 'suv' : 'sedan' })),
    ],
    walls: [
      { x: 0, z: 5.95, heading: 0, hw: 22, hl: 0.25, h: 0.25, color: 0xc9c4b8 },
      { x: 0, z: -10, heading: 0, hw: 22, hl: 0.25, h: 0.25, color: 0xc9c4b8 },
    ],
  };
}

function level4() {
  return {
    name: 'Parallel Park',
    hint: 'Pull past the gap, then reverse in alongside the curb.',
    par: 45,
    ...curbside(),
  };
}

function level5() {
  const top = row({ z: 7.25, heading: 0, x0: -12.15, count: 10 });
  const bottom = row({ z: -7.25, heading: PI, x0: -12.15, count: 10, target: 7 });
  const pillars = [];
  for (const x of [-8.1, 0, 8.1]) {
    for (const z of [-4.9, 4.9]) pillars.push({ x, z, heading: 0, hw: 0.3, hl: 0.3, h: 3.2, color: 0x9a9fa6 });
  }
  return {
    name: 'Tight Garage',
    hint: 'Weave past the cones and squeeze in beside the pillar.',
    lot: { w: 36, d: 30 },
    start: { x: -13, z: 0, heading: PI / 2 },
    par: 50,
    target: { ...bottom.targetSpot, dir: 'any' },
    ...merge(top, bottom),
    walls: pillars,
    cones: [{ x: -9, z: 1.6 }, { x: -5, z: -1.6 }, { x: -1, z: 1.6 }, { x: 3, z: -1.6 }],
    indoor: true,
  };
}

function level6() {
  const top = row({ z: 8, heading: 0, x0: -13.5, count: 11, target: 4, types: ['sedan', 'hatch', 'suv'] });
  const bottom = row({ z: -12, heading: PI, x0: -13.5, count: 11, types: ['sedan', 'hatch', 'suv'] });
  const loop = roundedRect(-16.5, 16.5, -6.3, 2.3, 3);
  return {
    name: 'Rush Hour',
    hint: 'Traffic is circling the lot. Time your turn into the bay.',
    lot: { w: 40, d: 40 },
    start: { x: -11, z: -2, heading: PI / 2 },
    par: 35,
    target: { ...top.targetSpot, dir: 'any' },
    ...merge(top, bottom),
    traffic: [
      { type: 'suv', color: 0x1d3557, path: loop, speed: 5, offset: 0.1 },
      { type: 'hatch', color: 0xffb703, path: loop, speed: 5, offset: 0.6 },
    ],
  };
}

function level7() {
  const types = ['suv', 'sedan', 'suv'];
  const top = row({ z: 8.5, heading: 0, x0: -14.5, count: 11, target: 6, w: 2.9, l: 6, types });
  const bottom = row({ z: -12.5, heading: PI, x0: -14.5, count: 11, w: 2.9, l: 6, types });
  return {
    name: 'SUV Squeeze',
    hint: 'Bigger car, same-sized gaps. Take it slow.',
    vehicle: 'suv',
    lot: { w: 40, d: 42 },
    start: { x: -14, z: -3, heading: PI / 2 },
    par: 35,
    target: { ...top.targetSpot, dir: 'any' },
    ...merge(top, bottom),
  };
}

function level8() {
  const xs = [-16, -10, -4, 2, 8, 14];
  const spots = xs.map((x) => ({ x, z: 18.3, heading: PI, hw: 2, hl: 4.6, lines: 'sides' }));
  const parked = xs
    .filter((_, i) => i !== 1 && i !== 3)
    .map((x) => ({ x, z: 18.4, heading: PI, type: 'truck' }));
  const vans = row({ z: -17, heading: 0, x0: -16.2, count: 13, types: ['suv', 'sedan', 'hatch'] });
  return {
    name: 'Loading Dock',
    hint: 'Back the truck into the dock. You need to finish facing out.',
    vehicle: 'truck',
    lot: { w: 50, d: 46 },
    wallHeight: 1.4,
    start: { x: -14, z: -4, heading: PI / 2 },
    par: 60,
    target: { ...spots[3], dir: 'forward' },
    spots: [...spots, ...vans.spots],
    parked: [...parked, ...vans.parked],
  };
}

function level9() {
  const r = row({ z: 24, heading: 0, x0: -8.1, count: 7, target: 5 });
  return {
    name: 'Beat the Clock',
    hint: 'Weave through the gaps and park before the timer runs out!',
    lot: { w: 30, d: 60 },
    start: { x: 0, z: -26, heading: 0 },
    par: 22,
    timeLimit: 32,
    target: { ...r.targetSpot, dir: 'any' },
    spots: r.spots,
    parked: [...r.parked, ...barrier(-10, [-12.6, -8, -3.4, 1.2, 12.6]), ...barrier(6, [-12.6, -1.2, 3.4, 8, 12.6])],
    cones: [{ x: -5, z: -18 }, { x: 5, z: -2 }, { x: -6, z: 13 }, { x: 3, z: 15 }],
  };
}

function level10() {
  return {
    name: 'City Street',
    hint: 'Parallel park on a busy street. Traffic will wait for you, but the clock won\'t.',
    par: 50,
    timeLimit: 80,
    tunnels: true,
    ...curbside(),
    traffic: [
      { type: 'sedan', color: 0x3a86ff, path: [[-36, 0.9], [36, 0.9]], loop: false, speed: 6, offset: 0.8 },
      { type: 'truck', color: 0x2b9348, path: [[36, -5.6], [-36, -5.6]], loop: false, speed: 5, offset: 0.15 },
      { type: 'suv', color: 0x9d0208, path: [[36, -5.6], [-36, -5.6]], loop: false, speed: 6, offset: 0.65 },
    ],
  };
}

export const LEVELS = [level1(), level2(), level3(), level4(), level5(), level6(), level7(), level8(), level9(), level10()];
