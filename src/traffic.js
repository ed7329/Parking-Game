import * as THREE from 'three';
import { VEHICLES, buildVehicleMesh } from './vehicles.js';
import { obbIntersects } from './collision.js';

const ACCEL = 4;
const BRAKE = 12;
const LOOK_AHEAD = 2.5;
const HONK_AFTER = 2.5;

// An AI vehicle that drives along a spline. Looping paths go round forever;
// open paths respawn at their start (hide the ends inside a tunnel).
export class TrafficCar {
  constructor({ type = 'sedan', color = 0x8d99ae, path, speed = 5, offset = 0, loop = true }) {
    this.spec = VEHICLES[type];
    this.curve = new THREE.CatmullRomCurve3(
      path.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      loop,
      'centripetal',
    );
    this.length = this.curve.getLength();
    this.loop = loop;
    this.cruise = speed;
    this.speed = speed;
    this.u = offset;
    this.blocked = 0;
    this.wheelSpin = 0;
    this.mesh = buildVehicleMesh(type, color);
    this.pose = this.poseAt(this.u);
    this.syncMesh();
  }

  poseAt(u) {
    const p = this.curve.getPointAt(u);
    const t = this.curve.getTangentAt(u);
    return { x: p.x, z: p.z, heading: Math.atan2(t.x, t.z), hw: this.spec.hw, hl: this.spec.hl };
  }

  get box() {
    return this.pose;
  }

  aheadBox() {
    const { x, z, heading, hw, hl } = this.pose;
    const d = hl + LOOK_AHEAD;
    return { x: x + Math.sin(heading) * d, z: z + Math.cos(heading) * d, heading, hw: hw + 0.2, hl: LOOK_AHEAD };
  }

  // Returns true when the driver loses patience and honks at the player.
  update(dt, playerBox, traffic) {
    const ahead = this.aheadBox();
    const playerAhead = obbIntersects(ahead, playerBox);
    const blocked = playerAhead || traffic.some((o) => o !== this && obbIntersects(ahead, o.box));
    const target = blocked ? 0 : this.cruise;
    this.speed = this.speed < target
      ? Math.min(this.speed + ACCEL * dt, target)
      : Math.max(this.speed - BRAKE * dt, target);

    if (this.speed > 0) {
      let u = this.u + (this.speed * dt) / this.length;
      if (u >= 1) u = this.loop ? u - 1 : 0;
      const next = this.poseAt(u);
      // Never drive into the player, even if they cut in from the side.
      if (obbIntersects(next, playerBox)) {
        this.speed = 0;
      } else {
        const moved = Math.hypot(next.x - this.pose.x, next.z - this.pose.z);
        this.wheelSpin += moved / this.spec.wheelRadius;
        this.u = u;
        this.pose = next;
      }
    }
    this.syncMesh();

    this.blocked = playerAhead && this.speed < 0.1 ? this.blocked + dt : 0;
    if (this.blocked > HONK_AFTER) {
      this.blocked = -2;
      return true;
    }
    return false;
  }

  syncMesh() {
    this.mesh.position.set(this.pose.x, 0, this.pose.z);
    this.mesh.rotation.y = this.pose.heading;
    for (const s of this.mesh.userData.spinners) s.rotation.x = this.wheelSpin;
  }
}
