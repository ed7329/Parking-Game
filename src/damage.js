// Crumples the player's bodywork around an impact point.
// `contact` is in vehicle space ({ x, z }, +z forward, +x left) and `normal`
// points out of the vehicle at that spot; vertices nearby are pushed inward.

const MAX_DENT = 0.38;

// Stable pseudo-random value per position, so duplicate vertices of the same
// corner (the mesh is not indexed) always move together.
function hash(x, y, z) {
  const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return h - Math.floor(h);
}

export function dent(meshes, contact, normal, strength) {
  const radius = 0.5 + strength * 2.2;
  for (const mesh of meshes) {
    const pos = mesh.geometry.attributes.position;
    if (!mesh.userData.orig) mesh.userData.orig = Float32Array.from(pos.array);
    const orig = mesh.userData.orig;
    const ox = mesh.position.x;
    const oy = mesh.position.y;
    const oz = mesh.position.z;
    let moved = false;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + ox;
      const y = pos.getY(i) + oy;
      const z = pos.getZ(i) + oz;
      const d = Math.hypot(x - contact.x, z - contact.z);
      if (d >= radius) continue;
      // Strongest at bumper height, fading towards the roof.
      const heightFade = Math.max(0.25, 1 - Math.abs(y - 0.6) / 1.6);
      const f = (1 - d / radius) ** 2 * strength * heightFade * (0.7 + hash(x, y, z) * 0.6);
      let nx = pos.getX(i) - normal.x * f;
      let ny = pos.getY(i) - f * 0.12;
      let nz = pos.getZ(i) - normal.z * f;
      // Cap how far any vertex can move from its undamaged position.
      const dx = nx - orig[i * 3];
      const dy = ny - orig[i * 3 + 1];
      const dz = nz - orig[i * 3 + 2];
      const len = Math.hypot(dx, dy, dz);
      if (len > MAX_DENT) {
        const k = MAX_DENT / len;
        nx = orig[i * 3] + dx * k;
        ny = orig[i * 3 + 1] + dy * k;
        nz = orig[i * 3 + 2] + dz * k;
      }
      pos.setXYZ(i, nx, ny, nz);
      moved = true;
    }
    if (moved) {
      pos.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    }
  }
}
