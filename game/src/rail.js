// Rails (pure logic, no three.js): set pieces that leave the flat road. The road physics is flat
// track space, so a rail is a 3D path laid over a stretch of the main road, from a flat lead-in
// (exactly on the road) through the set piece to a flat lead-out (or a launch into the air):
//   loop      - a loop-the-loop over a sideways jog in the road (its exit comes down to one side)
//   corkscrew - the road twists a full turn round its own line: up the side, over the top
//               upside down, down the other side (works on a gently curving road)
//   helix     - the road spirals up a tower (a car park) and runs off the top: the car flies
//               on down the road
//
// A car on a rail rides it: v.ride = { rail, u, lat, vF, t } (u = metres along the rail, lat =
// across it, vF = speed along it). Race progress keeps working: v.s is mapped from u onto the
// main road, and v.x / v.z stay on the main road's line in track space (so the minimap, AI
// traffic checks and race order see a car moving steadily along). Only the drawn car and the
// camera use the 3D pose (v.pose). Cars on a rail can't crash, collide or be hit.
import { BOOST_SPEED, BOOST_ACCEL } from './config.js';

export const RAIL = {
  lead: 12, // flat road at each end of the rail, laid exactly on the main road (m)
  gap: 8, // a loop leaves this far before the jog corner (the road is still dead straight)
  gravity: 13, // m/s^2 along the rail (arcade: a bit over half of real gravity)
  minSpeed: 34, // m/s: a rail always carries a car through
  steerRate: 7, // m/s across the rail at full steer
  sway: [0.2, 0.8], // a loop's sideways drift happens over this part of it
  step: 0.5, // rail sample spacing (m)
  carLen: 4.3, carWide: 2.1, // contact box between two cars on the rail
};

const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const smoother = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * x * (x * (x * 6 - 15) + 10); };

// Side view of a loop for a loop length of 1: curvature sin^2(pi t) (straight in and out,
// tightest at the top), turning a full circle. a = along the road, h = height, ang = climb angle.
const UNIT = (() => {
  const N = 1200, a = new Float64Array(N + 1), h = new Float64Array(N + 1), ang = new Float64Array(N + 1);
  let tot = 0;
  for (let i = 0; i < N; i++) tot += Math.sin(Math.PI * (i + 0.5) / N) ** 2 / N;
  const k0 = (2 * Math.PI) / tot;
  let th = 0, x = 0, y = 0;
  for (let i = 0; i < N; i++) {
    const ds = 1 / N, k = k0 * Math.sin(Math.PI * (i + 0.5) / N) ** 2;
    const mid = th + (k * ds) / 2;
    x += Math.cos(mid) * ds; y += Math.sin(mid) * ds;
    th += k * ds;
    a[i + 1] = x; h[i + 1] = y; ang[i + 1] = th;
  }
  return { N, a, h, ang, F: a[N], H: Math.max(...h) };
})();
export const LOOP_SHAPE = { footprint: UNIT.F, height: UNIT.H }; // per metre of loop length

export class Rail {
  // spec.type 'loop':      { from: [x, z], to: [x, z] } the two corners of the jog (world)
  // spec.type 'corkscrew': { from, to, radius = 11, dir = 1 } start and end of the twist
  // spec.type 'helix':     { at: [x, z], radius = 24, turns = 2, rise = 12, side = 1, run = 40,
  //                          launch = 6 } spirals up beside the road from `at`, then runs `run`
  //                          metres along the road on top and launches (vy m/s) off the end
  constructor(track, spec, R = RAIL) {
    this.track = track;
    this.R = R;
    this.kind = spec.type;
    this.spec = spec;
    const lead = R.lead;
    const proj = (p) => track.project(p[0], p[1]).s;
    if (this.kind === 'loop') { this.s0 = track.wrapS(proj(spec.from) - R.gap); this.s1 = track.wrapS(proj(spec.to) + R.gap); }
    else if (this.kind === 'corkscrew') { this.s0 = proj(spec.from); this.s1 = proj(spec.to); }
    else { this.s0 = proj(spec.at); this.s1 = track.wrapS(this.s0 + (spec.run ?? 40)); }
    this.release = this.kind === 'helix' ? { launch: spec.launch ?? 6 } : null; // flies off the end
    this.sA = track.wrapS(this.s0 - lead); // rail starts
    this.sB = this.release ? this.s1 : track.wrapS(this.s1 + lead); // rail ends
    this.leadOut = this.release ? 0 : lead;
    this.span = track.deltaS(this.s0, this.s1); // main road the set piece stands in for

    // raw centreline with an "up" hint per point: lead-in on the road, the set piece, lead-out
    const raw = [], ups = [];
    const P = {};
    for (let u = 0; u < lead; u += 0.5) { track.pointAt(this.sA + u, 0, P); raw.push([P.x, P.y, P.z]); ups.push([0, 1, 0]); }
    this[this.kind](raw, ups, spec);
    for (let u = 0.5; u <= this.leadOut + 1e-6; u += 0.5) { track.pointAt(this.s1 + u, 0, P); raw.push([P.x, P.y, P.z]); ups.push([0, 1, 0]); }

    const cum = [0];
    for (let i = 1; i < raw.length; i++) cum.push(cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1], raw[i][2] - raw[i - 1][2]));
    this.length = cum[cum.length - 1];
    this.midArc = this.length - lead - this.leadOut; // the set piece itself, along the rail
    const n = this.n = Math.round(this.length / R.step) + 1;
    this.step = this.length / (n - 1);
    for (const k of ['x', 'y', 'z', 'tx', 'ty', 'tz', 'ux', 'uy', 'uz', 'bx', 'by', 'bz']) this[k] = new Float32Array(n);
    const hint = [];
    let r = 0;
    for (let i = 0; i < n; i++) {
      const s = i * this.step;
      while (r < raw.length - 2 && cum[r + 1] < s) r++;
      const f = Math.min(1, (s - cum[r]) / Math.max(1e-6, cum[r + 1] - cum[r]));
      for (const [k, c] of [['x', 0], ['y', 1], ['z', 2]]) this[k][i] = raw[r][c] + (raw[r + 1][c] - raw[r][c]) * f;
      hint.push([0, 1, 2].map((c) => ups[r][c] + (ups[r + 1][c] - ups[r][c]) * f));
    }
    // frame: tangent T, up U (the hint made square to T), right B = T x U
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let tx = this.x[b] - this.x[a], ty = this.y[b] - this.y[a], tz = this.z[b] - this.z[a];
      const tl = Math.hypot(tx, ty, tz) || 1;
      tx /= tl; ty /= tl; tz /= tl;
      let [ux, uy, uz] = hint[i];
      const d = ux * tx + uy * ty + uz * tz;
      ux -= d * tx; uy -= d * ty; uz -= d * tz;
      const ul = Math.hypot(ux, uy, uz) || 1;
      ux /= ul; uy /= ul; uz /= ul;
      this.tx[i] = tx; this.ty[i] = ty; this.tz[i] = tz;
      this.ux[i] = ux; this.uy[i] = uy; this.uz[i] = uz;
      this.bx[i] = ty * uz - tz * uy; this.by[i] = tz * ux - tx * uz; this.bz[i] = tx * uy - ty * ux;
    }
  }

  // --- the set pieces: push centreline points and up hints for the middle part ---------------
  loop(raw, ups) {
    const track = this.track;
    const P0 = track.pointAt(this.s0, 0), P1 = track.pointAt(this.s1, 0);
    const T0 = [P0.tx, 0, P0.tz], R0 = [P0.rx, 0, P0.rz];
    const d = [P1.x - P0.x, P1.y - P0.y, P1.z - P0.z];
    this.along = d[0] * T0[0] + d[2] * T0[2];
    this.offset = d[0] * R0[0] + d[2] * R0[2];
    const len = this.along / UNIT.F; // side-view length of the loop
    this.height = len * UNIT.H;
    this.exitTurn = Math.atan2(P0.tx * P1.tz - P0.tz * P1.tx, P0.tx * P1.tx + P0.tz * P1.tz); // ~0
    const [w0, w1] = this.R.sway;
    for (let i = 0; i <= UNIT.N; i += 2) {
      const t = i / UNIT.N, a = UNIT.a[i] * len, h = UNIT.h[i] * len, g = smooth((t - w0) / (w1 - w0)), ang = UNIT.ang[i];
      raw.push([P0.x + T0[0] * a + R0[0] * this.offset * g, P0.y + h + d[1] * t, P0.z + T0[2] * a + R0[2] * this.offset * g]);
      ups.push([-Math.sin(ang) * T0[0], Math.cos(ang), -Math.sin(ang) * T0[2]]); // toward the loop's middle
    }
  }

  corkscrew(raw, ups, spec) {
    const track = this.track, r = spec.radius ?? 11, dir = spec.dir ?? 1;
    this.radius = r;
    this.height = 2 * r;
    const P = {};
    const steps = Math.max(80, Math.round(this.span / 0.6));
    for (let k = 0; k <= steps; k++) {
      const f = k / steps, th = 2 * Math.PI * smoother(f);
      track.pointAt(this.s0 + this.span * f, 0, P);
      const sn = Math.sin(th), cs = Math.cos(th);
      raw.push([P.x + P.rx * dir * r * sn, P.y + r * (1 - cs), P.z + P.rz * dir * r * sn]);
      ups.push([-P.rx * dir * sn, cs, -P.rz * dir * sn]); // toward the twist's axis
    }
  }

  helix(raw, ups, spec) {
    const track = this.track, R = spec.radius ?? 24, turns = spec.turns ?? 2, rise = spec.rise ?? 12, side = spec.side ?? 1;
    const P0 = track.pointAt(this.s0, 0);
    const T0 = [P0.tx, P0.tz], R0 = [P0.rx * side, P0.rz * side];
    this.centre = [P0.x + R0[0] * R, P0.z + R0[1] * R];
    this.radius = R;
    this.height = rise;
    const bank = 0.16; // leaning in a little toward the middle
    const total = turns * 2 * Math.PI, steps = Math.round(turns * 160);
    for (let k = 0; k <= steps; k++) {
      const ph = (k / steps) * total, f = k / steps;
      // round the centre, tangent to the road at the start; height eases in and out
      const ox = -Math.cos(ph) * R, oz = Math.sin(ph) * R;
      // climbs steadily, levelling off at both ends
      raw.push([this.centre[0] + R0[0] * ox + T0[0] * oz, P0.y + rise * (f - Math.sin(2 * Math.PI * f) / (2 * Math.PI)), this.centre[1] + R0[1] * ox + T0[1] * oz]);
      const inx = Math.cos(ph) * R0[0] - Math.sin(ph) * T0[0], inz = Math.cos(ph) * R0[1] - Math.sin(ph) * T0[1]; // toward the centre
      ups.push([inx * bank, 1, inz * bank]);
    }
    // then straight on along the road on top, to the edge
    const P = {};
    for (let u = 1; u <= this.span; u += 1) { track.pointAt(this.s0 + u, 0, P); raw.push([P.x, P0.y + rise + (P.y - P0.y), P.z]); ups.push([0, 1, 0]); }
  }

  // main-road s for a distance u along the rail (1:1 on the leads, compressed over the set piece)
  sOf(u) {
    const L = this.R.lead, t = this.track;
    if (u <= L) return t.wrapS(this.sA + u);
    if (u >= L + this.midArc) return t.wrapS(this.s1 + (u - L - this.midArc));
    return t.wrapS(this.s0 + ((u - L) / this.midArc) * this.span);
  }

  // inverse of sOf for a main-road s inside the rail's stretch
  uOf(s) {
    const L = this.R.lead, d = this.track.deltaS(this.sA, s);
    if (d <= L) return Math.max(0, d);
    const e = this.track.deltaS(this.s0, s);
    if (e < this.span) return L + (e / this.span) * this.midArc;
    return Math.min(this.length, L + this.midArc + this.track.deltaS(this.s1, s));
  }

  // where s lies: 'lead-in', 'ride' (the set piece), 'lead-out' or null (not on the rail)
  zone(s) {
    const t = this.track, d = t.deltaS(this.sA, s), tot = t.deltaS(this.sA, this.sB);
    if (d < 0 || d > tot) return null;
    if (d < this.R.lead) return 'lead-in';
    if (this.leadOut && d > tot - this.leadOut) return 'lead-out';
    return 'ride';
  }

  // the stretch of main road the set piece stands in for (no road, barriers or pickups there)
  inSpan(s, margin = 0) {
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

  // zero the main road's curvature under the set piece: that stretch is never driven, so the
  // AI and the drive assist must not brake for it
  flattenCurvature() {
    const t = this.track;
    for (let i = 0; i < t.n; i++) if (this.zone(i * t.step)) t.curv[i] = 0;
  }
}

// Put a car on a rail if it is driving into either end of it. Returns true when it got on.
// tmp: scratch projection object
export function tryEnterRail(v, rails, track, tmp = {}) {
  if (v.ride || v.wrecked || v.air || v.onSC || !rails.length) return false;
  const p = track.pointAt(v.s, 0, tmp);
  const along = v.vx * p.tx + v.vz * p.tz;
  for (const rail of rails) {
    const zone = rail.zone(v.s);
    if (!zone) continue;
    let u;
    if (zone === 'lead-in' && along > 0) u = rail.uOf(v.s);
    else if (zone === 'lead-out' && along < 0) u = rail.uOf(v.s);
    else if (zone === 'ride' && !rail.release) u = rail.uOf(v.s); // got there some other way: put it on the rail
    else continue;
    v.ride = { rail, u, lat: Math.max(-rail.track.halfWidth + 1.1, Math.min(rail.track.halfWidth - 1.1, v.lateral)), vF: zone === 'ride' ? Math.max(RAIL.minSpeed, along) : along, t: 0 };
    v.pose = rail.pose(u, v.ride.lat, v.pose || {});
    v.drifting = false; v.yawRate = 0; v.slip = 0; v.air = false; v.trick = null;
    return true;
  }
  return false;
}

// One physics step on the rail with controls c (throttle, brake, boost, steer). Writes the
// car's track-space state and its 3D pose. When the car rolls off either end it is put back on
// the main road: returns 'done' (came out forwards), 'back', 'air' (launched off the end of a
// helix: v.air is set and the car flies on) or null.
export function railStep(v, c, dt, mul = 1, steerable = true) {
  const L = v.ride, rail = L.rail, track = rail.track, sp = v.spec, R = rail.R;
  const top = sp.topSpeed * mul * (c.boost ? BOOST_SPEED : 1);
  const acc = sp.accel * mul * (c.boost ? BOOST_ACCEL : 1);
  let vF = L.vF;
  if (c.throttle > 0 && vF < top) vF += acc * c.throttle * Math.max(0.08, 1 - Math.pow(Math.max(vF, 0) / top, 2)) * dt;
  else if (vF > top) vF -= (vF - top) * 1.2 * dt;
  if (c.brake > 0 && vF > 0) vF -= 20 * c.brake * dt;
  const pose = v.pose || (v.pose = {});
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
    out = L.u < 0 ? 'back' : rail.release ? 'air' : 'done';
    v.s = track.wrapS(out === 'back' ? rail.sA + L.u : rail.sB + (L.u - rail.length));
    v.ride = null;
  } else v.s = rail.sOf(L.u);
  const p = track.pointAt(v.s, L.lat);
  v.x = p.x; v.z = p.z; v.y = p.y; v.roadY = p.y;
  v.idx = p.idx;
  v.lateral = L.lat;
  v.heading = p.heading;
  v.vx = Math.sin(p.heading) * vF; v.vz = Math.cos(p.heading) * vF;
  if (out === 'air') {
    // off the end: fly on down the road (shortcut.js airStep lands the car)
    v.air = true;
    v.airY = pose.y;
    v.vy = vF * pose.ty + rail.release.launch;
    v.airTime = 0; v.trick = null; v.trickKind = 'spin';
    v.lastGround = p.y; v.vyGround = 0;
    v.y = pose.y;
    v.pose = null;
  } else if (out) { v.lastGround = p.y; v.vyGround = 0; v.pose = null; }
  else rail.pose(L.u, L.lat, pose);
  return out;
}

// Cars on the same rail don't pass through each other: the one behind bumps into the one
// ahead (and side by side they push apart). No crashes on a rail.
export function railContacts(vehicles, R = RAIL) {
  for (let i = 0; i < vehicles.length; i++) {
    const A = vehicles[i];
    if (!A.ride) continue;
    for (let j = i + 1; j < vehicles.length; j++) {
      const B = vehicles[j];
      if (!B.ride || B.ride.rail !== A.ride.rail) continue;
      const du = B.ride.u - A.ride.u, dl = B.ride.lat - A.ride.lat;
      const pu = R.carLen - Math.abs(du), pl = R.carWide - Math.abs(dl);
      if (pu <= 0 || pl <= 0) continue;
      if (pl < pu * 0.6) {
        const s = Math.sign(dl) || 1;
        A.ride.lat -= (s * pl) / 2; B.ride.lat += (s * pl) / 2;
      } else {
        const [back, front] = du > 0 ? [A, B] : [B, A];
        back.ride.u -= pu / 2; front.ride.u += pu / 2;
        if (back.ride.vF > front.ride.vF) { const m = (back.ride.vF + front.ride.vF) / 2; back.ride.vF = m - 1; front.ride.vF = m + 1; }
      }
    }
  }
}
