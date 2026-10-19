import { VEHICLES, buildVehicleMesh } from './vehicles.js';
import { dent } from './damage.js';
import { setLever } from './interior.js';

const ROLL = 1.2;
const DRAG = 0.5;
const HANDBRAKE = 16;

// Manual gearbox, as fractions of the vehicle's top speed and acceleration.
// Gears 2 and up stall if you let the speed drop below their minimum.
const GEARS = {
  1: { top: 0.32, torque: 1.25, min: 0 },
  2: { top: 0.55, torque: 1.0, min: 0.12 },
  3: { top: 0.78, torque: 0.75, min: 0.3 },
  4: { top: 1.0, torque: 0.55, min: 0.48 },
  5: { top: 1.25, torque: 0.42, min: 0.65 },
};
const GEAR_ORDER = ['R', 'N', '1', '2', '3', '4', '5'];
const ENGINE_BRAKE = 1.5;

function approach(v, target, delta) {
  return v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);
}

// The player's vehicle: kinematic bicycle-model physics plus its mesh.
export class Car {
  constructor(type = 'sedan', color = 0xe63946) {
    this.manual = false;
    this.side = -1;
    this.setVehicle(type, color);
  }

  // side: -1 right-hand drive, +1 left-hand drive.
  setVehicle(type, color = 0xe63946, side = this.side) {
    this.type = type;
    this.side = side;
    this.spec = VEHICLES[type];
    this.mesh = buildVehicleMesh(type, this.spec.playerColor ?? color, true, side);
    this.reset(0, 0, 0);
  }

  reset(x, z, heading) {
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.throttle = 0;
    this.rpm = 0;
    this.gear = this.manual ? 'N' : 'D';
    this.stalled = false;
    this.restartTimer = 0;
    this.braking = false;
    this.wheelSpin = 0;
    this.events = [];
    this.syncMesh();
  }

  get box() {
    return { x: this.x, z: this.z, heading: this.heading, hw: this.spec.hw, hl: this.spec.hl };
  }

  get engineRunning() {
    return !this.stalled;
  }

  // Manual gearbox: dir +1 shifts up, -1 down. Bad shifts grind and are refused.
  shift(dir) {
    if (!this.manual) return;
    const i = GEAR_ORDER.indexOf(this.gear) + dir;
    if (i < 0 || i >= GEAR_ORDER.length) return;
    const next = GEAR_ORDER[i];
    const v = this.speed;
    const top = this.spec.maxFwd;
    if (next === 'R' && v > 0.5) {
      this.events.push({ type: 'grind', text: 'Grind! Stop before selecting reverse' });
      return;
    }
    if (GEARS[next] && v < -0.5) {
      this.events.push({ type: 'grind', text: 'Grind! Stop before selecting a forward gear' });
      return;
    }
    if (GEARS[next] && dir < 0 && v > GEARS[next].top * top + 0.8) {
      this.events.push({ type: 'grind', text: 'Too fast to drop to that gear' });
      return;
    }
    this.gear = next;
    if (this.stalled && (next === 'N' || next === '1')) {
      this.stalled = false;
      this.events.push({ type: 'restart', text: 'Engine restarted' });
    }
  }

  // input: { steer: -1..1 (positive = left), throttle: -1..1, handbrake: bool }
  // collides(box) -> bool. Returns the impact speed if the vehicle hit something.
  step(dt, input, collides) {
    const spec = this.spec;
    this.steer = approach(this.steer, input.steer * spec.maxSteer, spec.steerRate * dt);
    const v = this.manual ? this.manualSpeed(dt, input) : this.autoSpeed(dt, input);

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

  autoSpeed(dt, input) {
    const spec = this.spec;
    let v = this.speed;
    this.throttle = 0;
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
    this.rpm = Math.min(1, 0.15 + Math.abs(v) / spec.maxFwd * 0.7 + this.throttle * 0.15);
    return v;
  }

  // Manual: W only drives in the selected gear, S only brakes.
  manualSpeed(dt, input) {
    const spec = this.spec;
    let v = this.speed;
    const gas = !this.stalled && input.throttle > 0 ? input.throttle : 0;
    this.throttle = gas;
    this.braking = input.handbrake || input.throttle < 0;

    const drag = (ROLL + Math.abs(v) * DRAG) * dt;
    const gear = GEARS[this.gear];
    if (gear && !this.stalled) {
      const top = gear.top * spec.maxFwd;
      if (gas) v = v < top ? Math.min(v + spec.accel * gear.torque * gas * dt, top) : approach(v, top, drag * 3);
      else v = approach(v, 0, drag + ENGINE_BRAKE * gear.torque * dt);
      this.rpm = Math.min(1.05, Math.max(0.12, v / top));
    } else if (this.gear === 'R' && !this.stalled) {
      if (gas) v = Math.max(v - spec.reverseAccel * gas * dt, -spec.maxRev);
      else v = approach(v, 0, drag + ENGINE_BRAKE * dt);
      this.rpm = Math.max(0.12, -v / spec.maxRev);
    } else {
      v = approach(v, 0, drag);
      this.rpm = this.stalled ? 0 : 0.12 + gas * 0.85;
    }
    if (input.handbrake) v = approach(v, 0, HANDBRAKE * dt);
    else if (input.throttle < 0) v = approach(v, 0, spec.brake * dt);

    // Lugging a high gear at low speed stalls the engine.
    if (gear && !this.stalled && v < gear.min * spec.maxFwd) {
      this.stalled = true;
      this.rpm = 0;
      this.events.push({ type: 'stall', text: `Stalled in ${this.gear}! Shift to N or 1 to restart` });
    }
    return v;
  }

  // Dents the bodywork. `contact` and `normal` are in vehicle space.
  damage(contact, normal, impact) {
    const { deformables, lights, brokenMat } = this.mesh.userData;
    const strength = Math.min(0.32, 0.04 + impact * 0.045);
    dent(deformables, contact, normal, strength);
    if (impact < 1.2) return;
    // Break the nearest light on the side that was hit.
    for (const light of lights) {
      const p = light.position;
      if (Math.sign(p.z) === Math.sign(normal.z || contact.z) && Math.hypot(p.x - contact.x, p.z - contact.z) < 1.4) {
        light.material = brokenMat;
      }
    }
  }

  syncMesh() {
    const { frontPivots, spinners, tailMat, interior } = this.mesh.userData;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    for (const p of frontPivots) p.rotation.y = this.steer;
    for (const s of spinners) s.rotation.x = this.wheelSpin;
    if (interior?.visible) {
      const { wheelSpin, gauges, lever } = interior.userData;
      wheelSpin.rotation.z = -this.steer * 4;
      gauges.update(Math.abs(this.speed) * 3.6, this.rpm, this.gear, this.stalled ? 'STALLED' : '');
      setLever(lever, this.gear, this.side);
    }
    const reversing = this.gear === 'R' && !this.braking;
    tailMat.emissiveIntensity = this.braking ? 2.2 : reversing ? 1.2 : 0.3;
    tailMat.emissive.setHex(reversing ? 0xffffff : 0xff1010);
  }
}
