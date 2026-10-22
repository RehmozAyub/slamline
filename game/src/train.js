// A train on its own line (pure logic, no three.js): a push-pull shuttle (a locomotive at each
// end) running back and forth along a polyline, easing to a stop and waiting at each end. Its
// position is a function of time (setTime), so every device shows it in the same place. Where
// the line crosses the road it is a level crossing: the train flattens anything in its way, and
// the race reads when it will be there (warning lights, AI braking).
export class Train {
  // points: [[x, z], ...] the line (world); cars: wagons between the two locomotives;
  // offset: seconds into the timetable at time 0
  constructor({ points, cars = 5, speed = 36, accel = 6, dwell = 3, carLen = 15, locoLen = 19, gap = 1.4, halfWidth = 1.7, offset = 0 }) {
    this.points = points;
    this.cum = [0];
    for (let i = 1; i < points.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    this.lineLength = this.cum[this.cum.length - 1];
    // units front to back: loco, wagons, loco
    this.units = [{ len: locoLen, kind: 'loco' }, ...Array.from({ length: cars }, () => ({ len: carLen, kind: 'wagon' })), { len: locoLen, kind: 'loco' }];
    this.length = this.units.reduce((a, u) => a + u.len, 0) + gap * (this.units.length - 1);
    this.gap = gap;
    this.halfWidth = halfWidth;
    this.speed = speed; this.accel = accel; this.dwell = dwell;
    this.offset = offset;
    // the train's middle runs between these two stops, one leg each way
    this.cMin = this.length / 2 + 4;
    this.cMax = this.lineLength - this.length / 2 - 4;
    const D = this.cMax - this.cMin, dAcc = (speed * speed) / (2 * accel);
    this.legTime = D > 2 * dAcc ? 2 * (speed / accel) + (D - 2 * dAcc) / speed : 2 * Math.sqrt(D / accel);
    this.cycle = 2 * (this.legTime + dwell);
    this.setTime(0);
  }

  // distance covered `tau` seconds into a leg (accelerate, cruise, brake)
  legDist(tau) {
    const D = this.cMax - this.cMin, a = this.accel, T = this.legTime;
    tau = Math.max(0, Math.min(T, tau));
    const vm = Math.min(this.speed, Math.sqrt(a * D)), tA = vm / a;
    if (tau < tA) return 0.5 * a * tau * tau;
    if (tau > T - tA) { const r = T - tau; return D - 0.5 * a * r * r; }
    return 0.5 * a * tA * tA + vm * (tau - tA);
  }

  setTime(time) {
    this.time = time;
    let t = (((time + this.offset) % this.cycle) + this.cycle) % this.cycle;
    const leg = this.legTime + this.dwell;
    this.dir = t < leg ? 1 : -1;
    if (t >= leg) t -= leg;
    const d = this.legDist(t);
    this.c = this.dir > 0 ? this.cMin + d : this.cMax - d;
    this.wait = t > this.legTime ? leg - t : 0;
    this.v = Math.abs(this.legDist(t + 0.05) - d) / 0.05;
  }

  update(dt) { this.setTime(this.time + dt); }

  // point and direction on the line at distance t: { x, z, dx, dz }
  at(t, out = {}) {
    const P = this.points, C = this.cum;
    t = Math.max(0, Math.min(this.lineLength, t));
    let i = 1;
    while (i < C.length - 1 && C[i] < t) i++;
    const f = (t - C[i - 1]) / Math.max(1e-6, C[i] - C[i - 1]);
    const dx = P[i][0] - P[i - 1][0], dz = P[i][1] - P[i - 1][1], l = Math.hypot(dx, dz) || 1;
    out.x = P[i - 1][0] + dx * f; out.z = P[i - 1][1] + dz * f;
    out.dx = dx / l; out.dz = dz / l;
    return out;
  }

  // distance along the line nearest to (x, z), and how far off the line it is
  project(x, z, out = {}) {
    const P = this.points;
    let best = Infinity;
    for (let i = 1; i < P.length; i++) {
      const ax = P[i - 1][0], az = P[i - 1][1], dx = P[i][0] - ax, dz = P[i][1] - az, l2 = dx * dx + dz * dz || 1;
      const f = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const d = Math.hypot(x - (ax + dx * f), z - (az + dz * f));
      if (d < best) { best = d; out.t = this.cum[i - 1] + f * Math.sqrt(l2); out.d = d; }
    }
    return out;
  }

  // [rear, front] distances along the line that the train covers now
  extent() { return [this.c - this.length / 2, this.c + this.length / 2]; }

  // is (x, z) inside the train (with `margin` metres extra all round)?
  hits(x, z, margin = 0, tmp = {}) {
    const p = this.project(x, z, tmp);
    if (p.d > this.halfWidth + margin) return false;
    const [a, b] = this.extent();
    return p.t > a - margin && p.t < b + margin;
  }

  // The train at a crossing at line distance tc, `w` metres either side, over the next
  // `horizon` seconds: { now (it's there), tIn, tOut (seconds until it gets there / clears it;
  // Infinity when it doesn't come) }.
  crossing(tc, w, out = {}, horizon = 12) {
    const sim = this.sim || (this.sim = Object.assign(Object.create(Train.prototype), this, { sim: null }));
    const over = (t) => { sim.setTime(this.time + t); const [a, b] = sim.extent(); return b > tc - w && a < tc + w; };
    out.now = over(0);
    out.tIn = out.now ? 0 : Infinity;
    out.tOut = Infinity;
    for (let t = 0.2; t <= horizon; t += 0.2) {
      const o = over(t);
      if (o && out.tIn === Infinity) out.tIn = t;
      if (!o && out.tIn !== Infinity) { out.tOut = t; break; }
    }
    return out;
  }

  // where each unit is now: [{ kind, x, z, heading, len, back }] (back: the rear locomotive,
  // which faces the other way)
  layout() {
    const out = [];
    let t = this.c + this.length / 2;
    const P = {};
    this.units.forEach((u, k) => {
      const mid = t - u.len / 2;
      this.at(mid, P);
      out.push({ kind: u.kind, x: P.x, z: P.z, heading: Math.atan2(P.dx, P.dz), len: u.len, back: k === this.units.length - 1 });
      t -= u.len + this.gap;
    });
    return out;
  }
}
