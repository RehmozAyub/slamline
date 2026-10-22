// A track's set pieces (pure logic, no three.js), listed in its layout as `features`:
//   { type: 'loop' | 'corkscrew' | 'helix', ... }  rails (rail.js)
//   { type: 'jump', at: [x, z], gap, ramp, h, launch, minSpeed }
//       a kicker ramp up to a lip at `at`, then `gap` metres with no road (a gorge, a cove).
//       Cars fly it; one that falls short drops in and comes back past the gap.
//   { type: 'bank', from: [x, z], to: [x, z], side, angle }
//       a wall-ride: across the road toward `side` (+1 right, -1 left) the surface curls up
//       into a half-pipe, `angle` (radians) steep at the wall. The physics stays flat track
//       space: only the drawn car, the camera and the road mesh curl.
//   { type: 'tunnel', from: [x, z], to: [x, z], style }  a covered stretch (tunnel.js)
//   { type: 'crossing', at: [x, z] }  a level crossing (the map runs a train over it: train.js)
import { Rail } from './rail.js';

const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const RAILS = ['loop', 'corkscrew', 'helix'];

export class Jump {
  constructor(track, spec) {
    this.track = track;
    this.spec = spec;
    this.sLip = track.project(spec.at[0], spec.at[1]).s;
    this.ramp = spec.ramp ?? 24;
    this.h = spec.h ?? 3.2;
    this.gap = spec.gap ?? 50;
    this.launch = spec.launch ?? 11; // vy at take-off (m/s)
    this.minSpeed = spec.minSpeed ?? 58; // the ramp brings anyone slower up to this (m/s)
    this.pit = spec.pit ?? 60; // how far below the road the gap goes (physics)
    this.sRamp = track.wrapS(this.sLip - this.ramp);
    this.sLand = track.wrapS(this.sLip + this.gap);
  }

  // metres from the foot of the ramp (negative before it)
  d(s) { return this.track.deltaS(this.sRamp, s); }
  onRamp(s) { const d = this.d(s); return d >= 0 && d < this.ramp; }
  inGap(s) { const d = this.d(s) - this.ramp; return d >= 0 && d < this.gap; }
  near(s, margin = 0) { const d = this.d(s); return d > -margin && d < this.ramp + this.gap + margin; }

  // extra height of the road at s: the kicker curls up to the lip, the gap drops into the pit
  lift(s) {
    const d = this.d(s);
    if (d < 0 || d >= this.ramp + this.gap) return 0;
    if (d < this.ramp) return this.h * Math.pow(d / this.ramp, 1.6);
    return -this.pit;
  }

  // the kicker's slope at s (rise per metre)
  slope(s) {
    const d = this.d(s);
    return d > 0 && d < this.ramp ? (1.6 * this.h * Math.pow(d / this.ramp, 0.6)) / this.ramp : 0;
  }
}

export class Bank {
  constructor(track, spec) {
    this.track = track;
    this.spec = spec;
    this.side = spec.side ?? 1;
    this.angle = spec.angle ?? 1.4;
    this.blend = spec.blend ?? 35; // metres to curl up and back down at each end
    this.s0 = track.project(spec.from[0], spec.from[1]).s;
    this.s1 = track.project(spec.to[0], spec.to[1]).s;
    this.span = track.deltaS(this.s0, this.s1);
    this.reach = track.halfWidth + 0.5; // the curl reaches `angle` at the wall
  }

  inSpan(s, margin = 0) { const d = this.track.deltaS(this.s0, s); return d > -margin && d < this.span + margin; }

  // how far the curl is formed at s (0 flat - 1 full)
  amount(s) {
    const d = this.track.deltaS(this.s0, s);
    if (d <= 0 || d >= this.span) return 0;
    return smooth(Math.min(d, this.span - d) / this.blend);
  }

  // cross-section at (s, lat): { off: world offset across the road, h: height, a: roll }
  profile(s, lat, out = {}) {
    const w = lat * this.side;
    const k = (this.angle * this.amount(s)) / this.reach;
    if (w <= 0 || k < 1e-5) { out.off = lat; out.h = 0; out.a = 0; return out; }
    const a = k * w;
    out.off = (Math.sin(a) / k) * this.side;
    out.h = (1 - Math.cos(a)) / k;
    out.a = a;
    return out;
  }

  // drawn pose of a car at (s, lat) heading `heading` on the curl: x, y, z and the frame
  // (t forward, u up, b right), like Rail.pose. Returns null where the road is flat.
  pose(s, lat, heading, out = {}) {
    const pr = this.profile(s, lat, this.tmp || (this.tmp = {}));
    if (pr.a < 0.02) return null;
    const P = this.track.pointAt(s, 0, this.tp || (this.tp = {}));
    const sd = this.side, ca = Math.cos(pr.a), sa = Math.sin(pr.a);
    out.x = P.x + P.rx * pr.off; out.y = P.y + pr.h; out.z = P.z + P.rz * pr.off;
    // up: tipped toward the middle of the road; forward: the car's heading laid on the surface
    out.ux = -P.rx * sd * sa; out.uy = ca; out.uz = -P.rz * sd * sa;
    let tx = Math.sin(heading), ty = 0, tz = Math.cos(heading);
    const d = tx * out.ux + ty * out.uy + tz * out.uz;
    tx -= d * out.ux; ty -= d * out.uy; tz -= d * out.uz;
    const tl = Math.hypot(tx, ty, tz) || 1;
    out.tx = tx / tl; out.ty = ty / tl; out.tz = tz / tl;
    out.bx = out.ty * out.uz - out.tz * out.uy; out.by = out.tz * out.ux - out.tx * out.uz; out.bz = out.tx * out.uy - out.ty * out.ux;
    out.roll = pr.a;
    return out;
  }

  // the AI may carry more speed round a wall-ride (it can lean on the wall)
  relaxCurvature() {
    const t = this.track;
    for (let i = 0; i < t.n; i++) if (this.inSpan(i * t.step)) t.curv[i] *= 1 - 0.4 * this.amount(i * t.step);
  }
}

// A layout's set pieces on its track: { rails, jumps, banks, tunnels ({ a, b, style }),
// crossings ({ s }), avoid }
// (avoid: main-road stretches no shortcut may touch)
export function layoutFeatures(track, layout) {
  const list = layout.features || [];
  const rails = list.filter((f) => RAILS.includes(f.type)).map((f) => new Rail(track, f));
  const jumps = list.filter((f) => f.type === 'jump').map((f) => new Jump(track, f));
  const banks = list.filter((f) => f.type === 'bank').map((f) => new Bank(track, f));
  const tunnels = list.filter((f) => f.type === 'tunnel').map((f) => {
    const [a, b] = [track.project(f.from[0], f.from[1]).s, track.project(f.to[0], f.to[1]).s].sort((p, q) => p - q);
    return { a, b, style: f.style || 'rock', spec: f };
  });
  const crossings = list.filter((f) => f.type === 'crossing').map((f) => ({ s: track.project(f.at[0], f.at[1]).s, spec: f }));
  for (const r of rails) r.flattenCurvature();
  for (const b of banks) b.relaxCurvature();
  const avoid = [
    ...rails.map((r) => [r.sA - 90, r.sB + 70]),
    ...jumps.map((j) => [j.sRamp - 80, j.sLand + 80]),
    ...banks.map((b) => [b.s0 - 40, b.s1 + 40]),
    ...tunnels.map((t) => [t.a - 60, t.b + 60]),
    ...crossings.map((c) => [c.s - 70, c.s + 70]),
  ];
  return { rails, jumps, banks, tunnels, crossings, avoid };
}

// the jump whose ramp or gap is at s (with `margin` metres either side), or null
export function jumpAt(jumps, s, margin = 0) {
  for (const j of jumps) if (j.near(s, margin)) return j;
  return null;
}

// the bank curling the road at s, or null
export function bankAt(banks, s) {
  for (const b of banks) if (b.inSpan(s)) return b;
  return null;
}
