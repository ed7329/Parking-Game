import { VEHICLES, buildVehicleMesh } from './vehicles.js';

const ROLL = 1.2;
const DRAG = 0.5;
const HANDBRAKE = 16;

function approach(v, target, delta) {
  return v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);
}

// The player's vehicle: kinematic bicycle-model physics plus its mesh.
export class Car {
  constructor(type = 'sedan', color = 0xe63946) {
    this.setVehicle(type, color);
  }

  setVehicle(type, color = 0xe63946) {
    this.type = type;
    this.spec = VEHICLES[type];
    this.mesh = buildVehicleMesh(type, color, true);
    this.reset(0, 0, 0);
  }

  reset(x, z, heading) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.throttle = 0;
    this.gear = 'D';
    this.braking = false;
    this.wheelSpin = 0;
    this.syncMesh();
  }

  get box() {
    return { x: this.x, z: this.z, heading: this.heading, hw: this.spec.hw, hl: this.spec.hl };
  }

  // input: { steer: -1..1 (positive = left), throttle: -1..1, handbrake: bool }
  // collides(box) -> bool. Returns the impact speed if the vehicle hit something.
  step(dt, input, collides) {
    const spec = this.spec;
    this.steer = approach(this.steer, input.steer * spec.maxSteer, spec.steerRate * dt);
    this.throttle = 0;

    let v = this.speed;
    this.braking = false;
    if (input.handbrake) {
      v = approach(v, 0, HANDBRAKE * dt);
      this.braking = true;
    } else if (input.throttle > 0) {
      if (v < -0.05) {
        v = approach(v, 0, spec.brake * dt);
        this.braking = true;
      } else {
        this.gear = 'D';
        this.throttle = input.throttle;
        v = Math.min(v + spec.accel * input.throttle * dt, spec.maxFwd);
      }
    } else if (input.throttle < 0) {
      if (v > 0.05) {
        v = approach(v, 0, spec.brake * dt);
        this.braking = true;
      } else {
        this.gear = 'R';
        this.throttle = -input.throttle;
        v = Math.max(v + spec.reverseAccel * input.throttle * dt, -spec.maxRev);
      }
    } else {
      v = approach(v, 0, (ROLL + Math.abs(v) * DRAG) * dt);
    }

    // Kinematic bicycle model, pivoting around the rear axle.
    const rearOffset = spec.axles[1];
    const sin = Math.sin(this.heading);
    const cos = Math.cos(this.heading);
    const dist = v * dt;
    const rx = this.x + sin * (rearOffset + dist);
    const rz = this.z + cos * (rearOffset + dist);
    const heading = this.heading + (dist / spec.wheelbase) * Math.tan(this.steer);
    const next = {
      x: rx - Math.sin(heading) * rearOffset,
      z: rz - Math.cos(heading) * rearOffset,
      heading,
      hw: spec.hw,
      hl: spec.hl,
    };

    if (collides(next)) {
      this.speed = -v * 0.2;
      return Math.abs(v);
    }

    this.x = next.x;
    this.z = next.z;
    this.heading = heading;
    this.speed = v;
    this.wheelSpin += dist / spec.wheelRadius;
    return 0;
  }

  syncMesh() {
    const { frontPivots, spinners, tailMat, wheelSpin } = this.mesh.userData;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    for (const p of frontPivots) p.rotation.y = this.steer;
    for (const s of spinners) s.rotation.x = this.wheelSpin;
    if (wheelSpin) wheelSpin.rotation.z = -this.steer * 4;
    const reversing = this.gear === 'R' && !this.braking;
    tailMat.emissiveIntensity = this.braking ? 2.2 : reversing ? 1.2 : 0.3;
    tailMat.emissive.setHex(reversing ? 0xffffff : 0xff1010);
  }
}
