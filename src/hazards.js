// Things a map drops onto the road mid-race: boulders from a rockfall, drifts of snow off an
// avalanche. A map spawns them (when a car wrecks nearby, as the leader comes up to a spot ...);
// the race (session.js) reads \`list\`: a boulder wrecks a car that hits it fast, a drift bogs
// a car down, and the AI steers round both. Each has a short life, then crumbles or melts.
import * as THREE from 'three';
import { colored } from './scenery.js';

export const HAZARD = {
  rock: { r: 1.7, life: 18, fall: 1.1 },
  snow: { r: 2.6, life: 26, grow: 0.8 },
};

export class RoadHazards {
  constructor(scene, track) {
    this.scene = scene;
    this.track = track;
    this.list = []; // live: { kind, s, lat, x, y, z, r, active, t, life, mesh }
    this.rockGeo = colored(new THREE.DodecahedronGeometry(1, 0), 0x8a5a3a, 0xb07a52);
    this.rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    this.snowGeo = new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    this.snowMat = new THREE.MeshStandardMaterial({ color: 0xf4f8ff, roughness: 0.9 });
  }

  // a boulder dropping out of the sky at (s, lat) from \`from\` (a point up on the cliff); a drift
  // of snow growing out of the road
  spawn(kind, s, lat, from = null) {
    const H = HAZARD[kind], p = this.track.pointAt(this.track.wrapS(s), lat);
    const mesh = new THREE.Mesh(kind === 'rock' ? this.rockGeo : this.snowGeo, kind === 'rock' ? this.rockMat : this.snowMat);
    mesh.castShadow = true;
    mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    if (kind === 'snow') mesh.rotation.set(0, Math.random() * 3, 0);
    this.scene.add(mesh);
    const h = { kind, s: this.track.wrapS(s), lat, x: p.x, y: p.y, z: p.z, r: H.r * (0.85 + Math.random() * 0.3), active: false, t: 0, life: H.life, mesh, from };
    this.list.push(h);
    this.pose(h);
    return h;
  }

  pose(h) {
    const m = h.mesh;
    if (h.kind === 'rock') {
      const f = Math.min(1, h.t / HAZARD.rock.fall), from = h.from || { x: h.x, y: h.y + 30, z: h.z };
      m.position.set(from.x + (h.x - from.x) * f, from.y + (h.y + h.r * 0.7 - from.y) * f * f, from.z + (h.z - from.z) * f);
      const end = Math.max(0, h.t - (h.life - 1.5)) / 1.5; // crumbles away at the end
      m.scale.setScalar(h.r * (1 - end * 0.9));
      if (f < 1) m.rotation.x += 0.15;
    } else {
      const grow = Math.min(1, h.t / HAZARD.snow.grow), melt = Math.max(0, h.t - (h.life - 3)) / 3;
      m.position.set(h.x, h.y - 0.05, h.z);
      m.scale.set(h.r, h.r * 0.45 * grow * (1 - melt), h.r);
    }
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const h = this.list[i];
      h.t += dt;
      h.active = h.kind === 'rock' ? h.t > HAZARD.rock.fall && h.t < h.life - 1 : h.t > HAZARD.snow.grow * 0.6 && h.t < h.life - 2;
      this.pose(h);
      if (h.t > h.life) { this.scene.remove(h.mesh); this.list.splice(i, 1); }
    }
  }

  // any still on the road (or falling) within \`span\` of s
  near(s, span) { return this.list.some((h) => Math.abs(this.track.deltaS(h.s, s)) < span); }
}
