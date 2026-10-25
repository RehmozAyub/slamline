// Smashable props at the road's edges (cones, crates, barrels, market carts, snowmen ...), in
// little clusters round the lap. A car going through one sends it flying: a small boost for a
// player, barely a dent in anyone's speed. They come back a while later. Each map has its own
// set (THEMES); everything here is cosmetic plus that boost, so online each device smashes its
// own copies.
import * as THREE from 'three';
import { colored, merge } from './scenery.js';


// prop geometries, standing on y = 0, about a metre across; vertex colours
const PROPS = {
  cone: () => merge([colored(new THREE.ConeGeometry(0.32, 0.9, 10).translate(0, 0.5, 0), 0xff6a10), colored(new THREE.CylinderGeometry(0.21, 0.25, 0.14, 10).translate(0, 0.5, 0), 0xf4f4f4), colored(new THREE.BoxGeometry(0.62, 0.06, 0.62).translate(0, 0.03, 0), 0x222222)]),
  crate: (c = 0xa8743a) => merge([colored(new THREE.BoxGeometry(1.1, 1.1, 1.1).translate(0, 0.55, 0), c), colored(new THREE.BoxGeometry(1.14, 0.16, 1.14).translate(0, 0.98, 0), 0x6a4422), colored(new THREE.BoxGeometry(1.14, 0.16, 1.14).translate(0, 0.12, 0), 0x6a4422)]),
  barrel: (c = 0xc83a2a) => merge([colored(new THREE.CylinderGeometry(0.42, 0.42, 1.2, 12).translate(0, 0.6, 0), c), colored(new THREE.CylinderGeometry(0.44, 0.44, 0.08, 12).translate(0, 0.3, 0), 0x2a2a2a), colored(new THREE.CylinderGeometry(0.44, 0.44, 0.08, 12).translate(0, 0.9, 0), 0x2a2a2a)]),
  bin: () => merge([colored(new THREE.CylinderGeometry(0.36, 0.3, 1.0, 10).translate(0, 0.5, 0), 0x2a6a3a), colored(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 10).translate(0, 1.04, 0), 0x1a3a22)]),
  waterbox: () => merge([colored(new THREE.BoxGeometry(1.6, 0.8, 0.5).translate(0, 0.4, 0), 0xe8e8e8), colored(new THREE.BoxGeometry(1.62, 0.18, 0.52).translate(0, 0.62, 0), 0xd8202a)]),
  hay: () => colored(new THREE.CylinderGeometry(0.6, 0.6, 1.2, 12).rotateZ(Math.PI / 2).translate(0, 0.6, 0), 0xd8b050, 0xe8c870),
  snowman: () => merge([colored(new THREE.SphereGeometry(0.55, 10, 8).translate(0, 0.5, 0), 0xf4f8ff), colored(new THREE.SphereGeometry(0.38, 10, 8).translate(0, 1.2, 0), 0xf4f8ff), colored(new THREE.ConeGeometry(0.07, 0.35, 6).rotateX(Math.PI / 2).translate(0, 1.22, 0.45), 0xff7a10), colored(new THREE.CylinderGeometry(0.24, 0.26, 0.3, 10).translate(0, 1.66, 0), 0x1a1a1a)]),
  urn: () => colored(new THREE.LatheGeometry([[0, 0], [0.32, 0.02], [0.46, 0.35], [0.4, 0.8], [0.22, 1.0], [0.26, 1.1]].map(([x, y]) => new THREE.Vector2(x, y)), 10), 0xa85a32, 0xc87a4a),
  cart: () => merge([
    colored(new THREE.BoxGeometry(1.5, 0.5, 0.9).translate(0, 0.7, 0), 0x6a3a22),
    colored(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 10).rotateZ(Math.PI / 2).translate(0.8, 0.32, 0), 0x2a2a2a),
    colored(new THREE.CylinderGeometry(0.32, 0.32, 0.08, 10).rotateZ(Math.PI / 2).translate(-0.8, 0.32, 0), 0x2a2a2a),
    colored(new THREE.IcosahedronGeometry(0.42, 0).scale(1.6, 0.6, 1).translate(0, 1.15, 0), 0x3a7a2a),
    colored(new THREE.IcosahedronGeometry(0.2, 0).translate(-0.4, 1.4, 0.1), 0xe0303a), colored(new THREE.IcosahedronGeometry(0.2, 0).translate(0.3, 1.38, -0.1), 0xf0c020), colored(new THREE.IcosahedronGeometry(0.2, 0).translate(0, 1.45, 0.2), 0xf060a0),
  ]),
  pod: () => merge([colored(new THREE.CylinderGeometry(0.45, 0.45, 1.1, 12).translate(0, 0.55, 0), 0x3a4058), colored(new THREE.CylinderGeometry(0.47, 0.47, 0.12, 12).translate(0, 0.75, 0), 0x19e3ff)]),
  luggage: () => merge([colored(new THREE.BoxGeometry(0.75, 0.55, 0.35).translate(0, 0.3, 0), 0x2a4ab0), colored(new THREE.BoxGeometry(0.62, 0.45, 0.3).translate(0.1, 0.8, 0), 0xd8202a), colored(new THREE.BoxGeometry(0.3, 0.06, 0.06).translate(0, 1.07, 0), 0x1a1a1a)]),
};

// which props each map leaves by its roads
const THEMES = {
  coast: ['barrel', 'crate', 'cone'], city: ['cone', 'bin', 'waterbox'], alpine: ['hay', 'cone', 'crate'],
  snow: ['snowman', 'cone'], canyon: ['barrel', 'crate'], jungle: ['urn', 'crate'], canal: ['cart', 'crate'],
  space: ['pod', 'crate'], airport: ['cone', 'luggage', 'waterbox'], volcano: ['barrel', 'crate'],
};

export const SMASH = { reach: 1.7, respawn: 30, flight: 2.4, slow: 0.985, gap: [70, 140] };

export class Smashables {
  // keep(s): may props stand at main-road s? (not on set pieces, the grid, or a shortcut's fork)
  constructor(scene, track, mapId, keep, rand) {
    this.track = track;
    const kinds = THEMES[mapId] || ['cone', 'crate'];
    const hw = track.halfWidth;
    this.items = []; // { kind, x, y, z, s, ry, state: 0 standing | 1 flying | 2 gone, t, vx, vy, vz, wx, wz, rx, rz }
    for (let s = 60 + rand() * 40; s < track.length - 120; s += SMASH.gap[0] + rand() * (SMASH.gap[1] - SMASH.gap[0])) {
      if (!keep(s)) continue;
      const side = rand() < 0.5 ? -1 : 1, kind = kinds[Math.floor(rand() * kinds.length)], n = 3 + Math.floor(rand() * 4);
      for (let k = 0; k < n; k++) {
        const sk = s + k * (1.6 + rand() * 1.2), lat = side * (hw - 0.9 - (k % 2) * 1.2 - rand() * 0.4);
        if (!keep(sk)) continue;
        const p = track.pointAt(track.wrapS(sk), lat);
        this.items.push({ kind, x: p.x, y: p.y, z: p.z, s: track.wrapS(sk), ry: rand() * 6.28, state: 0, t: 0, home: { x: p.x, y: p.y, z: p.z } });
      }
    }
    this.items.sort((a, b) => a.s - b.s);
    this.meshes = {};
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
    for (const kind of kinds) {
      const list = this.items.filter((it) => it.kind === kind);
      if (!list.length) continue;
      const mesh = new THREE.InstancedMesh(PROPS[kind](), mat, list.length);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      list.forEach((it, i) => { it.mesh = mesh; it.i = i; });
      scene.add(mesh);
      this.meshes[kind] = mesh;
    }
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.v = new THREE.Vector3(); this.one = new THREE.Vector3(1, 1, 1); this.zero = new THREE.Vector3(0, 0, 0);
    for (const it of this.items) this.place(it);
    for (const mesh of Object.values(this.meshes)) mesh.instanceMatrix.needsUpdate = true;
  }

  place(it) {
    this.e.set(it.rx || 0, it.ry, it.rz || 0);
    this.m.compose(this.v.set(it.x, it.y, it.z), this.q.setFromEuler(this.e), it.state === 2 ? this.zero : this.one);
    it.mesh.setMatrixAt(it.i, this.m);
  }

  // props near main-road s (binary search on the sorted list)
  near(s, span, out) {
    out.length = 0;
    const L = this.track.length, items = this.items;
    for (const c of [s, s - L, s + L]) {
      let lo = 0, hi = items.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (items[mid].s < c - span) lo = mid + 1; else hi = mid; }
      for (let i = lo; i < items.length && items[i].s <= c + span; i++) out.push(items[i]);
    }
    return out;
  }

  // cars drive through the standing props; onSmash(car, item) for each one sent flying
  update(dt, cars, onSmash) {
    const tmp = this.tmp || (this.tmp = []);
    for (const c of cars) {
      const v = c.vehicle;
      if (v.wrecked || v.ride || v.onSC) continue;
      const vy = v.air ? v.airY : v.y;
      for (const it of this.near(v.s, 4, tmp)) {
        if (it.state !== 0) continue;
        const dx = it.x - v.x, dz = it.z - v.z;
        if (dx * dx + dz * dz > SMASH.reach * SMASH.reach || vy > it.y + 1.6) continue;
        // off it goes: thrown ahead and up off the car, tumbling
        const sp = v.speed;
        it.state = 1; it.t = 0;
        it.vx = v.vx * 0.7 + dx * 3; it.vz = v.vz * 0.7 + dz * 3; it.vy = 5 + sp * 0.12;
        it.wx = (Math.random() - 0.5) * 14; it.wz = (Math.random() - 0.5) * 14;
        if (!c.remote) { v.vx *= SMASH.slow; v.vz *= SMASH.slow; }
        onSmash(c, it);
      }
    }
    let dirty = false;
    for (const it of this.items) {
      if (it.state === 0) continue;
      it.t += dt;
      if (it.state === 1) {
        it.vy -= 22 * dt;
        it.x += it.vx * dt; it.y += it.vy * dt; it.z += it.vz * dt;
        it.rx = (it.rx || 0) + it.wx * dt; it.rz = (it.rz || 0) + it.wz * dt;
        it.vx *= 1 - dt * 0.6; it.vz *= 1 - dt * 0.6;
        // bounce and skid along the ground, then it's gone (it comes back later)
        if (it.y < it.home.y && it.vy < 0) { it.y = it.home.y; it.vy *= -0.3; it.vx *= 0.6; it.vz *= 0.6; it.wx *= 0.5; it.wz *= 0.5; }
        if (it.t > SMASH.flight) { it.state = 2; }
        this.place(it);
        dirty = true;
      } else if (it.t > SMASH.respawn) {
        // back where it stood (rising out of the ground over a moment would just look odd)
        Object.assign(it, { ...it.home, state: 0, t: 0, rx: 0, rz: 0 });
        this.place(it);
        dirty = true;
      }
    }
    if (dirty) for (const mesh of Object.values(this.meshes)) mesh.instanceMatrix.needsUpdate = true;
  }
}

