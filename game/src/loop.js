// Loop-the-loop (pure logic, no three.js). The road physics is flat track space, so a loop is a
// rail laid over a short jog in the main road: the road runs into the loop, climbs, goes over
// the top upside down (drifting sideways so the way down clears the way up) and comes back to
// the ground where the road carries on, offset to one side.
//
// A car on the loop rides the rail: v.loop = { rail, u, lat, vF } (u = metres along the rail,
// lat = across it, vF = speed along it). Race progress keeps working: v.s is mapped from u onto
// the main road, and v.x / v.z stay on the main road's line in track space (so the minimap, AI
// traffic checks and race order see a car moving steadily along). Only the drawn car and the
// camera use the 3D pose (v.loopPose). Cars on the loop can't crash, collide or be hit.
import { BOOST_SPEED, BOOST_ACCEL } from './config.js';

export const LOOP = {
  lead: 12, // flat road at each end of the rail, laid exactly on the main road (m)
  gap: 8, // the loop leaves this far before the jog corner (the road is still dead straight)
  gravity: 13, // m/s^2 along the rail (arcade: a bit over half of real gravity)
  minSpeed: 34, // m/s: the loop always carries a car round
  steerRate: 7, // m/s across the rail at full steer
  sway: [0.2, 0.8], // the sideways drift happens over this part of the loop
  step: 0.5, // rail sample spacing (m)
  carLen: 4.3, carWide: 2.1, // contact box between two cars on the rail
};

const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

// Side view of the loop for a loop length of 1: curvature sin^2(pi t) (straight in and out,
// tightest at the top), turning a full circle. a = along the road, h = height.
const UNIT = (() => {
  const N = 1200, a = new Float64Array(N + 1), h = new Float64Array(N + 1);
  let tot = 0;
  for (let i = 0; i < N; i++) tot += Math.sin(Math.PI * (i + 0.5) / N) ** 2 / N;
  const k0 = (2 * Math.PI) / tot;
  let ang = 0, x = 0, y = 0;
  for (let i = 0; i < N; i++) {
    const ds = 1 / N, k = k0 * Math.sin(Math.PI * (i + 0.5) / N) ** 2;
    const mid = ang + (k * ds) / 2;
    x += Math.cos(mid) * ds; y += Math.sin(mid) * ds;
    ang += k * ds;
    a[i + 1] = x; h[i + 1] = y;
  }
  return { N, a, h, F: a[N], H: Math.max(...h) };
})();
export const LOOP_SHAPE = { footprint: UNIT.F, height: UNIT.H }; // per metre of loop length

export class LoopRail {
  // spec: { from: [x, z], to: [x, z] } - the two corners of the jog in the main road (world)
  constructor(track, spec, R = LOOP) {
    this.track = track;
    this.R = R;
    const lead = R.lead;
    const sJ1 = track.project(spec.from[0], spec.from[1]).s, sJ2 = track.project(spec.to[0], spec.to[1]).s;
    this.s0 = track.wrapS(sJ1 - R.gap); // loop starts (end of the lead-in)
    this.s1 = track.wrapS(sJ2 + R.gap); // loop ends (start of the lead-out)
    this.sA = track.wrapS(this.s0 - lead); // rail starts
    this.sB = track.wrapS(this.s1 + lead); // rail ends
    this.span = track.deltaS(this.s0, this.s1); // main road the loop stands in for
    const P0 = track.pointAt(this.s0, 0), P1 = track.pointAt(this.s1, 0);
    const T0 = [P0.tx, 0, P0.tz], R0 = [P0.rx, 0, P0.rz];
    const d = [P1.x - P0.x, P1.y - P0.y, P1.z - P0.z];
    this.along = d[0] * T0[0] + d[2] * T0[2];
    this.offset = d[0] * R0[0] + d[2] * R0[2];
    this.loopLen = this.along / UNIT.F; // side-view length of the loop
    this.height = this.loopLen * UNIT.H;
    this.exitTurn = Math.atan2(P0.tx * P1.tz - P0.tz * P1.tx, P0.tx * P1.tx + P0.tz * P1.tz); // ~0

    // raw centreline: lead-in on the road, the loop, lead-out on the road
    const raw = [];
    const P = {};
    for (let u = 0; u < lead; u += 0.5) { track.pointAt(this.sA + u, 0, P); raw.push([P.x, P.y, P.z]); }
    const [w0, w1] = R.sway;
    for (let i = 0; i <= UNIT.N; i += 2) {
      const t = i / UNIT.N, a = UNIT.a[i] * this.loopLen, h = UNIT.h[i] * this.loopLen, g = smooth((t - w0) / (w1 - w0));
      raw.push([P0.x + T0[0] * a + R0[0] * this.offset * g, P0.y + h + d[1] * t, P0.z + T0[2] * a + R0[2] * this.offset * g]);
    }
    for (let u = 0.5; u <= lead + 1e-6; u += 0.5) { track.pointAt(this.s1 + u, 0, P); raw.push([P.x, P.y, P.z]); }
    const cum = [0];
    for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1], raw[i][2] - raw[i - 1][2]));
    this.length = cum[cum.length - 1];
    this.loopArc = this.length - 2 * lead; // the climbing, upside-down part, along the rail
    const n = this.n = Math.round(this.length / R.step) + 1;
    this.step = this.length / (n - 1);
    for (const k of ['x', 'y', 'z', 'tx', 'ty', 'tz', 'ux', 'uy', 'uz', 'bx', 'by', 'bz']) this[k] = new Float32Array(n);
    let r = 0;
    for (let i = 0; i < n; i++) {
      const s = i * this.step;
      while (r < raw.length - 2 && cum[r + 1] < s) r++;
      const f = Math.min(1, (s - cum[r]) / Math.max(1e-6, cum[r + 1] - cum[r]));
      this.x[i] = raw[r][0] + (raw[r + 1][0] - raw[r][0]) * f;
      this.y[i] = raw[r][1] + (raw[r + 1][1] - raw[r][1]) * f;
      this.z[i] = raw[r][2] + (raw[r + 1][2] - raw[r][2]) * f;
    }
    // frame: tangent T, right B (the road's right, square to T), up U = B x T (toward the
    // loop's middle at the top)
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let tx = this.x[b] - this.x[a], ty = this.y[b] - this.y[a], tz = this.z[b] - this.z[a];
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      const u = i * this.step;
      // on the leads the road's own right; on the loop the entry's right, eased to the exit's
      let rx, rz;
      if (u <= lead || u >= this.length - lead) { track.pointAt(this.sOf(u), 0, P); rx = P.rx; rz = P.rz; }
      else { track.pointAt(u - lead < this.loopArc / 2 ? this.s0 : this.s1, 0, P); rx = P.rx; rz = P.rz; }
      let bx = rx, by = 0, bz = rz;
      const dot = bx * tx + by * ty + bz * tz;
      bx -= dot * tx; by -= dot * ty; bz -= dot * tz;
      const bl = Math.hypot(bx, by, bz) || 1;
      bx /= bl; by /= bl; bz /= bl;
      this.tx[i] = tx; this.ty[i] = ty; this.tz[i] = tz;
      this.bx[i] = bx; this.by[i] = by; this.bz[i] = bz;
      this.ux[i] = by * tz - bz * ty; this.uy[i] = bz * tx - bx * tz; this.uz[i] = bx * ty - by * tx;
    }
  }

  // main-road s for a distance u along the rail (1:1 on the leads, compressed over the loop)
  sOf(u) {
    const L = this.R.lead, t = this.track;
    if (u <= L) return t.wrapS(this.sA + u);
    if (u >= this.length - L) return t.wrapS(this.s1 + (u - (this.length - L)));
    return t.wrapS(this.s0 + ((u - L) / this.loopArc) * this.span);
  }

  // inverse of sOf for a main-road s inside the rail's stretch
  uOf(s) {
    const L = this.R.lead, d = this.track.deltaS(this.sA, s);
    if (d <= L) return Math.max(0, d);
    const e = this.track.deltaS(this.s0, s);
    if (e < this.span) return L + (e / this.span) * this.loopArc;
    return Math.min(this.length, this.length - L + this.track.deltaS(this.s1, s));
  }

  // where s lies: 'lead-in', 'loop', 'lead-out' or null (not on the rail's stretch)
  zone(s) {
    const t = this.track, d = t.deltaS(this.sA, s), tot = t.deltaS(this.sA, this.sB);
    if (d < 0 || d > tot) return null;
    if (d < this.R.lead) return 'lead-in';
    if (d > tot - this.R.lead) return 'lead-out';
    return 'loop';
  }

  // the stretch of main road the loop replaces (no road, barriers or pickups drawn there)
  inLoop(s, margin = 0) {
    const d = this.track.deltaS(this.s0, s);
    return d > -margin && d < this.span + margin;
  }

  // 3D pose on the rail at (u, lat). Writes x, y, z and the frame (t = forward, u = up,
  // b = right) into `out` and returns it.
  pose(u, lat = 0, out = {}) {
    const f = Math.max(0, Math.min(this.n - 1.0001, u / this.step));
    const i = Math.floor(f), k = f - i, j = i + 1;
    const L = (arr) => arr[i] + (arr[j] - arr[i]) * k;
    const nrm = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
    [out.tx, out.ty, out.tz] = nrm(L(this.tx), L(this.ty), L(this.tz));
    [out.ux, out.uy, out.uz] = nrm(L(this.ux), L(this.uy), L(this.uz));
    [out.bx, out.by, out.bz] = nrm(L(this.bx), L(this.by), L(this.bz));
    out.x = L(this.x) + out.bx * lat;
    out.y = L(this.y) + out.by * lat;
    out.z = L(this.z) + out.bz * lat;
    return out;
  }

  // zero the main road's curvature under the loop: the jog is never driven, so the AI and the
  // drive assist must not brake for it
  flattenCurvature() {
    const t = this.track;
    for (let i = 0; i < t.n; i++) if (this.zone(i * t.step)) t.curv[i] = 0;
  }
}

// A layout's loops and tunnels on its track: { loops (LoopRail list), tunnels ([s from, s to]),
// avoid (main-road stretches no shortcut may touch) }
export function layoutFeatures(track, layout) {
  const loops = (layout.loops || []).map((spec) => new LoopRail(track, spec));
  for (const r of loops) r.flattenCurvature();
  const tunnels = (layout.tunnels || []).map(([a, b]) => [track.project(a[0], a[1]).s, track.project(b[0], b[1]).s].sort((p, q) => p - q));
  const avoid = [...loops.map((r) => [r.sA - 90, r.sB + 70]), ...tunnels.map(([a, b]) => [a - 60, b + 60])];
  return { loops, tunnels, avoid };
}

// Put a car on a rail if it is driving into either end of it. Returns true when it got on.
// tmp: scratch projection object
export function tryEnterLoop(v, rails, track, tmp = {}) {
  if (v.loop || v.wrecked || v.air || v.onSC || !rails.length) return false;
  const p = track.pointAt(v.s, 0, tmp);
  const along = v.vx * p.tx + v.vz * p.tz;
  for (const rail of rails) {
    const zone = rail.zone(v.s);
    if (!zone) continue;
    let u;
    if (zone === 'lead-in' && along > 0) u = rail.uOf(v.s);
    else if (zone === 'lead-out' && along < 0) u = rail.uOf(v.s);
    else if (zone === 'loop') u = rail.uOf(v.s); // got there some other way: put it on the rail
    else continue;
    v.loop = { rail, u, lat: Math.max(-rail.track.halfWidth + 1.1, Math.min(rail.track.halfWidth - 1.1, v.lateral)), vF: zone === 'loop' ? Math.max(LOOP.minSpeed, along) : along, t: 0 };
    v.loopPose = rail.pose(u, v.loop.lat, v.loopPose || {});
    v.drifting = false; v.yawRate = 0; v.slip = 0; v.air = false; v.trick = null;
    return true;
  }
  return false;
}

// One physics step on the rail with controls c (throttle, brake, boost, steer). Writes the
// car's track-space state and its 3D pose. When the car rolls off either end it is put back on
// the main road: returns 'done' (came out of the loop forwards), 'back' or null.
export function loopStep(v, c, dt, mul = 1, steerable = true) {
  const L = v.loop, rail = L.rail, track = rail.track, sp = v.spec, R = rail.R;
  const top = sp.topSpeed * mul * (c.boost ? BOOST_SPEED : 1);
  const acc = sp.accel * mul * (c.boost ? BOOST_ACCEL : 1);
  let vF = L.vF;
  if (c.throttle > 0 && vF < top) vF += acc * c.throttle * Math.max(0.08, 1 - Math.pow(Math.max(vF, 0) / top, 2)) * dt;
  else if (vF > top) vF -= (vF - top) * 1.2 * dt;
  if (c.brake > 0 && vF > 0) vF -= 20 * c.brake * dt;
  const pose = v.loopPose || (v.loopPose = {});
  rail.pose(L.u, L.lat, pose);
  vF -= R.gravity * pose.ty * dt;
  if (vF >= 0 && L.u > R.lead * 0.5 && L.u < rail.length - R.lead * 0.5) vF = Math.max(vF, R.minSpeed);
  L.vF = vF;
  const hw = track.halfWidth - 1.1;
  if (steerable) L.lat = Math.max(-hw, Math.min(hw, L.lat + (c.steer || 0) * R.steerRate * dt));
  L.u += vF * dt;
  L.t += dt;
  v.boosting = !!c.boost;
  v.braking = c.brake > 0 && vF > 0;
  v.throttle = c.throttle;
  v.steer += ((steerable ? c.steer || 0 : 0) - v.steer) * Math.min(1, dt * 7);
  v.vF = vF; v.vR = 0; v.slip = 0; v.yawRate = 0; v.drifting = false; v.scraping = 0; v.touching = false;
  v.bodyPitch *= Math.exp(-dt * 6); v.bodyRoll *= Math.exp(-dt * 6);
  v.pitch = 0; v.roll = 0;
  v.wheelSpin += (vF / 0.36) * dt;
  let out = null;
  if (L.u >= rail.length || L.u < 0) {
    // back on the main road: just past the end of the rail (or before its start, rolling back)
    out = L.u >= rail.length ? 'done' : 'back';
    v.s = track.wrapS(out === 'done' ? rail.sB + (L.u - rail.length) : rail.sA + L.u);
    v.loop = null;
    v.loopPose = null;
  } else v.s = rail.sOf(L.u);
  const p = track.pointAt(v.s, out ? L.lat : L.lat);
  v.x = p.x; v.z = p.z; v.y = p.y; v.roadY = p.y;
  v.idx = p.idx;
  v.lateral = L.lat;
  v.heading = p.heading;
  v.vx = Math.sin(p.heading) * vF; v.vz = Math.cos(p.heading) * vF;
  if (out) { v.lastGround = p.y; v.vyGround = 0; }
  else rail.pose(L.u, L.lat, pose);
  return out;
}

// Cars on the same rail don't pass through each other: the one behind bumps into the one
// ahead (and side by side they push apart). No crashes on the loop.
export function loopContacts(vehicles, R = LOOP) {
  for (let i = 0; i < vehicles.length; i++) {
    const A = vehicles[i];
    if (!A.loop) continue;
    for (let j = i + 1; j < vehicles.length; j++) {
      const B = vehicles[j];
      if (!B.loop || B.loop.rail !== A.loop.rail) continue;
      const du = B.loop.u - A.loop.u, dl = B.loop.lat - A.loop.lat;
      const pu = R.carLen - Math.abs(du), pl = R.carWide - Math.abs(dl);
      if (pu <= 0 || pl <= 0) continue;
      if (pl < pu * 0.6) {
        const s = Math.sign(dl) || 1;
        A.loop.lat -= (s * pl) / 2; B.loop.lat += (s * pl) / 2;
      } else {
        const [back, front] = du > 0 ? [A, B] : [B, A];
        back.loop.u -= pu / 2; front.loop.u += pu / 2;
        if (back.loop.vF > front.loop.vF) { const m = (back.loop.vF + front.loop.vF) / 2; back.loop.vF = m - 1; front.loop.vF = m + 1; }
      }
    }
  }
}
