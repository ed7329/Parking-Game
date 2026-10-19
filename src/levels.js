// Level data. Coordinates are metres on the ground plane; heading 0 faces +z,
// heading PI/2 faces +x. A target's `dir` is 'any' (either way round) or
// 'forward' (the car's nose must point along the target heading).

const PI = Math.PI;
const SPOT_W = 2.7;
const SPOT_L = 5.5;

// A row of perpendicular bays. Every bay except the target (and any `empty`
// indices) gets a parked car.
function row({ z, heading, x0, count, target = -1, empty = [] }) {
  const spots = [];
  const parked = [];
  let targetSpot = null;
  for (let i = 0; i < count; i++) {
    const x = x0 + i * SPOT_W;
    const spot = { x, z, heading, hw: SPOT_W / 2, hl: SPOT_L / 2, lines: 'sides' };
    spots.push(spot);
    if (i === target) targetSpot = spot;
    else if (!empty.includes(i)) parked.push({ x, z, heading: (i * 7) % 3 === 0 ? heading + PI : heading });
  }
  return { spots, parked, targetSpot };
}

function merge(...rows) {
  return {
    spots: rows.flatMap((r) => r.spots),
    parked: rows.flatMap((r) => r.parked),
  };
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

function level4() {
  const curbXs = [-18.6, -12.4, -6.2, 6.2, 12.4, 18.6];
  const parked = curbXs.map((x) => ({ x, z: 4.45, heading: PI / 2 }));
  const farSide = [-14, -8, 2, 9, 15].map((x) => ({ x, z: -8.6, heading: -PI / 2 }));
  const spots = curbXs.map((x) => ({ x, z: 4.45, heading: PI / 2, hw: 1.25, hl: 3.0, lines: 'ends' }));
  return {
    name: 'Parallel Park',
    hint: 'Pull past the gap, then reverse in alongside the curb.',
    lot: { w: 44, d: 24 },
    start: { x: -15, z: 0.5, heading: PI / 2 },
    par: 45,
    target: { x: 0, z: 4.45, heading: PI / 2, hw: 1.25, hl: 3.2, dir: 'forward' },
    spots,
    parked: [...parked, ...farSide],
    walls: [
      { x: 0, z: 5.95, heading: 0, hw: 22, hl: 0.25, h: 0.25, color: 0xc9c4b8 },
      { x: 0, z: -10, heading: 0, hw: 22, hl: 0.25, h: 0.25, color: 0xc9c4b8 },
    ],
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

export const LEVELS = [level1(), level2(), level3(), level4(), level5()];
