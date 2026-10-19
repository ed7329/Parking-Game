// 2D oriented-bounding-box helpers on the ground (x/z) plane.
// A box is { x, z, heading, hw, hl }: hl is the half-length along the heading
// direction (sin h, cos h), hw is the half-width along the right axis (cos h, -sin h).

export function axes(b) {
  const s = Math.sin(b.heading);
  const c = Math.cos(b.heading);
  return { fx: s, fz: c, rx: c, rz: -s };
}

export function obbCorners(b) {
  const a = axes(b);
  return [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([sl, sw]) => ({
    x: b.x + a.fx * b.hl * sl + a.rx * b.hw * sw,
    z: b.z + a.fz * b.hl * sl + a.rz * b.hw * sw,
  }));
}

function project(b, a, nx, nz) {
  const c = b.x * nx + b.z * nz;
  const r = b.hl * Math.abs(a.fx * nx + a.fz * nz) + b.hw * Math.abs(a.rx * nx + a.rz * nz);
  return [c - r, c + r];
}

// Separating axis test.
export function obbIntersects(A, B) {
  const a = axes(A);
  const b = axes(B);
  const tests = [[a.fx, a.fz], [a.rx, a.rz], [b.fx, b.fz], [b.rx, b.rz]];
  for (const [nx, nz] of tests) {
    const [a0, a1] = project(A, a, nx, nz);
    const [b0, b1] = project(B, b, nx, nz);
    if (a1 < b0 || b1 < a0) return false;
  }
  return true;
}

export function toLocal(b, x, z) {
  const a = axes(b);
  const dx = x - b.x;
  const dz = z - b.z;
  return { l: dx * a.fx + dz * a.fz, w: dx * a.rx + dz * a.rz };
}

export function pointObbDistance(b, x, z) {
  const p = toLocal(b, x, z);
  const dl = Math.max(Math.abs(p.l) - b.hl, 0);
  const dw = Math.max(Math.abs(p.w) - b.hw, 0);
  return Math.hypot(dl, dw);
}

export function cornersInside(inner, outer) {
  return obbCorners(inner).every((c) => {
    const p = toLocal(outer, c.x, c.z);
    return Math.abs(p.l) <= outer.hl && Math.abs(p.w) <= outer.hw;
  });
}

// Signed difference a - b wrapped to (-PI, PI].
export function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}
