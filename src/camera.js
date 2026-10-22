// Camera rig: chase / far chase / hood cams, cinematic crash cam, menu orbit, shake and speed FOV.
import * as THREE from 'three';
import { wrapAngle } from './trackMath.js';

const MODES = [
  { name: 'CHASE', dist: 6.6, height: 2.2, look: 1.15, fov: 62 },
  { name: 'FAR', dist: 9.8, height: 3.4, look: 1.3, fov: 60 },
  { name: 'HOOD', hood: true, fov: 72 },
];

export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.mode = 0;
    this.pos = new THREE.Vector3();
    this.look = new THREE.Vector3();
    this.heading = 0;
    this.shake = 0;
    this.fov = 62;
    this.crash = null;
    this.orbit = 0;
    this.tmp = new THREE.Vector3();
    this.snap = true;
    this.fovScale = 1; // < 1 for the very wide split-screen views
    this.up = new THREE.Vector3(0, 1, 0); // eases round with the car on a loop
    this.upTarget = new THREE.Vector3(0, 1, 0);
    this.tmpUp = new THREE.Vector3();
  }

  // camera "up": the car's up on a rail, the world's otherwise; on a wall-ride (a pose with a
  // roll) only part of the way, so the horizon stays readable
  easeUp(dt, P = null) {
    if (P) this.upTarget.set(P.ux, P.uy, P.uz); else this.upTarget.set(0, 1, 0);
    if (P && P.roll !== undefined) this.upTarget.lerp(this.tmpUp.set(0, 1, 0), 0.4).normalize();
    if (this.snap) this.up.copy(this.upTarget);
    this.up.lerp(this.upTarget, Math.min(1, dt * 9)).normalize();
    this.cam.up.copy(this.up);
  }

  cycle() {
    this.mode = (this.mode + 1) % MODES.length;
    this.snap = true;
    return MODES[this.mode].name;
  }

  addShake(a) { this.shake = Math.min(1.4, this.shake + a); }

  startCrashCam(target, duration, sideSign = 1) {
    this.crash = { target, t: 0, duration, angle: target.heading + (Math.PI / 2) * sideSign + 0.5 };
  }

  get inCrashCam() { return !!this.crash; }

  // Slow orbit around a car (menus). side (0-1): frame the car off to the right of the screen
  // (eased), for the car screen's panel on the left.
  updateOrbit(dt, car, time, side = 0) {
    this.orbit += dt * 0.22;
    this.orbitSide = (this.orbitSide ?? side) + (side - (this.orbitSide ?? side)) * Math.min(1, dt * 3);
    const a = car.heading + 2.3 + Math.sin(this.orbit) * 1.1;
    const r = 7.2 + Math.sin(this.orbit * 0.7) * 1.2 + this.orbitSide * 0.6;
    this.cam.position.set(car.x + Math.sin(a) * r, car.y + 1.7 + Math.sin(this.orbit * 0.5) * 0.5, car.z + Math.cos(a) * r);
    this.up.set(0, 1, 0);
    this.cam.up.set(0, 1, 0);
    // aim to the left of the car (screen right = (-fz, fx) for a camera looking along (fx, fz))
    const fx = car.x - this.cam.position.x, fz = car.z - this.cam.position.z, fl = Math.hypot(fx, fz) || 1;
    const k = this.orbitSide * r * 0.3;
    this.cam.lookAt(car.x + (fz / fl) * k, car.y + 0.7, car.z - (fx / fl) * k);
    this.cam.fov = 45;
    this.cam.updateProjectionMatrix();
    this.snap = true;
  }

  update(dt, realDt, car, { speedRatio, boost, time, driftDir }) {
    const cam = this.cam;
    this.shake *= Math.exp(-realDt * 5);
    let fovTarget;

    if (this.crash) {
      const c = this.crash;
      c.t += realDt;
      const t = c.target;
      const ty = t.wrecked ? t.wreckY : t.y + 0.6;
      c.angle += realDt * 0.35;
      const r = 10 + c.t * 1.5;
      this.tmp.set(t.x + Math.sin(c.angle) * r, ty + 2.5 + c.t * 0.6, t.z + Math.cos(c.angle) * r);
      if (c.t < 0.02) cam.position.copy(this.tmp);
      cam.position.lerp(this.tmp, Math.min(1, realDt * 4));
      this.easeUp(realDt);
      cam.lookAt(t.x, ty, t.z);
      fovTarget = 50;
      if (c.t >= c.duration) { this.crash = null; this.snap = true; }
    } else if (car.pose) {
      // on a rail or a wall-ride: ride behind the car and roll with it
      const m = MODES[this.mode], P = car.pose;
      this.heading = car.heading; // so the normal chase picks up smoothly at the exit
      if (m.hood) {
        this.pos.set(P.x + P.ux * 1.22 + P.tx * 0.4, P.y + P.uy * 1.22 + P.ty * 0.4, P.z + P.uz * 1.22 + P.tz * 0.4);
        this.look.set(P.x + P.tx * 30 + P.ux, P.y + P.ty * 30 + P.uy, P.z + P.tz * 30 + P.uz);
      } else {
        const dist = m.dist + speedRatio * 1.3 - boost * 0.6, h = m.height + speedRatio * 0.2;
        this.tmp.set(P.x - P.tx * dist + P.ux * h, P.y - P.ty * dist + P.uy * h, P.z - P.tz * dist + P.uz * h);
        if (this.snap) this.pos.copy(this.tmp);
        this.pos.lerp(this.tmp, Math.min(1, dt * 14));
        this.look.set(P.x + P.tx * 5 + P.ux * m.look, P.y + P.ty * 5 + P.uy * m.look, P.z + P.tz * 5 + P.uz * m.look);
      }
      this.snap = false;
      cam.position.copy(this.pos);
      const s = this.shake * 0.35 + boost * 0.03 + speedRatio * speedRatio * 0.012;
      cam.position.x += (Math.sin(time * 47) + Math.sin(time * 31)) * s * 0.5;
      cam.position.y += (Math.sin(time * 53) + Math.sin(time * 23)) * s * 0.5;
      this.easeUp(dt, P);
      cam.lookAt(this.look);
      fovTarget = m.fov + speedRatio * 15 + boost * 7 + 4;
    } else {
      const m = MODES[this.mode];
      // camera heading follows the car with a little lag, and leans into the velocity during drifts
      let target = car.heading;
      if (car.speed > 5) {
        const velH = Math.atan2(car.vx, car.vz);
        target = car.heading + wrapAngle(velH - car.heading) * 0.45;
      }
      if (this.snap) this.heading = target;
      this.heading += wrapAngle(target - this.heading) * Math.min(1, dt * (m.hood ? 20 : 6));
      const fx = Math.sin(this.heading), fz = Math.cos(this.heading);
      if (m.hood) {
        const hx = Math.sin(car.heading), hz = Math.cos(car.heading);
        this.pos.set(car.x + hx * 0.4, car.y + 1.22, car.z + hz * 0.4);
        this.look.set(car.x + hx * 30, car.y + 1.0 - car.pitch * 30, car.z + hz * 30);
        cam.position.copy(this.pos);
      } else {
        const dist = m.dist + speedRatio * 1.3 - boost * 0.6;
        this.tmp.set(car.x - fx * dist, car.y + m.height + speedRatio * 0.2, car.z - fz * dist);
        if (this.snap) this.pos.copy(this.tmp);
        this.pos.lerp(this.tmp, Math.min(1, dt * 14));
        this.pos.y = Math.max(this.pos.y, car.y + 1.0);
        this.look.set(car.x + fx * 5, car.y + m.look, car.z + fz * 5);
        cam.position.copy(this.pos);
      }
      this.snap = false;
      // shake
      const s = this.shake * 0.35 + boost * 0.03 + speedRatio * speedRatio * 0.012;
      cam.position.x += (Math.sin(time * 47) + Math.sin(time * 31)) * s * 0.5;
      cam.position.y += (Math.sin(time * 53) + Math.sin(time * 23)) * s * 0.5;
      this.easeUp(dt);
      cam.lookAt(this.look);
      if (!m.hood) cam.rotateZ((driftDir || 0) * 0.035 + car.bodyRoll * -0.4);
      fovTarget = m.fov + speedRatio * 15 + boost * 7;
    }
    this.fov += (fovTarget - this.fov) * Math.min(1, realDt * 4);
    cam.fov = this.fov * this.fovScale;
    cam.updateProjectionMatrix();
  }
}
