// CANAL QUARTER: an old canal town at golden hour. Tall narrow gabled houses lean over the
// street, the road humps over bridges where it crosses a canal, bikes everywhere, a windmill.
import * as THREE from 'three';
import { LAYOUTS, CANALS, LAYOUT_SCALE } from './layouts.js';
import { rng, colored, merge, instanced } from '../scenery.js';
import { addWorldDetail } from '../detail.js';
import { waterMaterial } from '../water.js';
import { windowTextures } from '../textures.js';

const BRICK = [0x5a2e22, 0x7a3424, 0x3a2a24, 0x2c3a30, 0xd8ccb0, 0x46505a, 0x8a5a2a, 0x6a2a2a, 0xe8e0cc, 0x24282e];
const WATER_Y = -0.06;

// canal lines in world coordinates
const CZ = CANALS.z.map((v) => v * LAYOUT_SCALE), CX = CANALS.x.map((v) => v * LAYOUT_SCALE);
const CHW = CANALS.halfWidth * LAYOUT_SCALE;
function canalDist(x, z) {
  let d = Infinity;
  for (const c of CZ) d = Math.min(d, Math.abs(z - c));
  for (const c of CX) d = Math.min(d, Math.abs(x - c));
  return d;
}

// A narrow canal house: brick body with tall windows (UVs scaled so a window tile is 2.4 x 3.2 m)
// and a gable on top facing the street. Local x = frontage, z = depth, y = up.
function houseGeo(w, h, d, gable) {
  const body = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
  const uv = body.attributes.uv;
  const dims = [[d, h], [d, h], [0, 0], [0, 0], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [fw, fh] = dims[f];
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      if (fw === 0) uv.setXY(i, 0.01, 0.01);
      else uv.setXY(i, uv.getX(i) * (fw / 2.4), uv.getY(i) * (fh / 3.2));
    }
  }
  const gh = w * (gable === 'step' ? 0.7 : 0.9);
  let shape;
  if (gable === 'step') { // stepped gable
    const s = w / 6;
    shape = new THREE.Shape([[-w / 2, 0], [w / 2, 0], [w / 2, gh * 0.3], [w / 2 - s, gh * 0.3], [w / 2 - s, gh * 0.6], [w / 2 - 2 * s, gh * 0.6], [w / 2 - 2 * s, gh], [-w / 2 + 2 * s, gh], [-w / 2 + 2 * s, gh * 0.6], [-w / 2 + s, gh * 0.6], [-w / 2 + s, gh * 0.3], [-w / 2, gh * 0.3]].map(([x, y]) => new THREE.Vector2(x, y)));
  } else if (gable === 'bell') { // bell gable: curved shoulders
    shape = new THREE.Shape();
    shape.moveTo(-w / 2, 0); shape.lineTo(w / 2, 0);
    shape.quadraticCurveTo(w / 2, gh * 0.55, w / 4, gh * 0.7);
    shape.lineTo(w / 8, gh); shape.lineTo(-w / 8, gh); shape.lineTo(-w / 4, gh * 0.7);
    shape.quadraticCurveTo(-w / 2, gh * 0.55, -w / 2, 0);
  } else { // plain spout gable
    shape = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, gh)]);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, h, -d / 2);
  const guv = g.attributes.uv;
  for (let i = 0; i < guv.count; i++) guv.setXY(i, 0.01, 0.01); // plain wall colour (no windows)
  const parts = [body, g].map((p) => { const n = p.index ? p.toNonIndexed() : p; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); return n; });
  return merge(parts.map((p) => { p.computeVertexNormals(); return p; }));
}

function treeGeo() {
  const parts = [colored(new THREE.CylinderGeometry(0.3, 0.45, 6, 6).translate(0, 3, 0), 0x3a2e24)];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    const r = k === 0 ? 0 : 1.8;
    parts.push(colored(new THREE.IcosahedronGeometry(2.4, 1).scale(1, 0.85, 1).translate(Math.cos(a) * r * (k ? 1 : 0), 7 + (k % 2), Math.sin(a) * r * (k ? 1 : 0)), 0x3c6a2c, 0x7a9a3a));
  }
  return merge(parts);
}

function bikeGeo() {
  const parts = [];
  for (const z of [-0.55, 0.55]) parts.push(colored(new THREE.TorusGeometry(0.34, 0.03, 4, 14).rotateY(Math.PI / 2).translate(0, 0.36, z), 0x111111));
  parts.push(colored(new THREE.BoxGeometry(0.04, 0.04, 1.1).translate(0, 0.62, 0), 0x2a2a2e));
  parts.push(colored(new THREE.BoxGeometry(0.04, 0.4, 0.04).translate(0, 0.62, 0.45), 0x2a2a2e));
  parts.push(colored(new THREE.BoxGeometry(0.5, 0.03, 0.03).translate(0, 0.84, 0.45), 0x2a2a2e));
  parts.push(colored(new THREE.BoxGeometry(0.18, 0.05, 0.25).translate(0, 0.84, -0.3), 0x1a1a1a));
  return merge(parts);
}

function boatGeo() {
  const parts = [
    colored(new THREE.BoxGeometry(4.2, 1.2, 16).translate(0, 0.4, 0), 0x2a3a4a),
    colored(new THREE.BoxGeometry(3.6, 2.2, 10).translate(0, 2.1, -1), 0xd8c8a0),
    colored(new THREE.BoxGeometry(3.9, 0.2, 10.4).translate(0, 3.3, -1), 0x3a2a24),
  ];
  return merge(parts);
}

function windmill() {
  const g = new THREE.Group();
  const tower = new THREE.Mesh(colored(new THREE.CylinderGeometry(4, 7, 22, 8).translate(0, 11, 0), 0x3a4a3a, 0x5a6a4a), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
  const cap = new THREE.Mesh(colored(new THREE.ConeGeometry(5, 6, 8).translate(0, 25, 0), 0x2a2a2a), tower.material);
  g.add(tower, cap);
  const hub = new THREE.Group();
  hub.position.set(0, 21, 5.5);
  const sailMat = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.8, side: THREE.DoubleSide });
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Group();
    arm.rotation.z = (k * Math.PI) / 2;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 15, 0.4).translate(0, 7.5, 0), tower.material);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(3, 11).translate(1.8, 8.5, 0.25), sailMat);
    arm.add(beam, sail);
    hub.add(arm);
  }
  g.add(hub);
  g.userData.hub = hub;
  return g;
}

export default {
  id: 'canal',
  name: 'CANAL QUARTER',
  tagline: 'Gabled houses, humpback bridges, bikes everywhere',
  weatherLabel: 'GOLDEN HOUR',
  layout: LAYOUTS.canal,
  exposure: 1.0,
  envIntensity: 1.0,
  bloom: { strength: 0.22, radius: 0.45, threshold: 1.1 },
  fog: { color: 0xc8b8a8, density: 0.0016 },
  sky: {
    top: 0x4a6a9a, horizon: 0xf2c08a, bottom: 0x6a5a50,
    sunDir: new THREE.Vector3(-0.6, 0.16, 0.55), sunColor: 0xffc890, sunSize: 0.0016, sunIntensity: 3.5, glow: 0.45,
    clouds: 0.45, cloudColor: 0xffe0c8, horizonSharp: 0.4,
  },
  sun: { color: 0xffd0a0, intensity: 2.6 },
  hemi: { sky: 0xb8c8e8, ground: 0x6a4a3a, intensity: 1.1 },
  smoke: [0.75, 0.72, 0.7],
  trackStyle: {
    road: { base: '#3e3e44', line: '#f0f0f0', edge: '#f0f0f0', lanes: 2, roughness: 0.82, cracks: 1.0, patches: 3, seed: 88 }, // old town asphalt
    kerb: ['#c0402a', '#e8e4dc'],
    barrier: { type: 'guardrail', color: 0x22262a },
    embankment: null,
    shoulder: 0x8a3a2a, // red bike lanes
    shortcut: { color: 0x7a6656, guide: 0xffd23f },
    accent: '#ff8a3d',
  },

  build({ scene, track, index, density, envScene, sunDir }) {
    const rand = rng(1234);
    const hw = track.halfWidth;

    // cobbled ground
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), addWorldDetail(new THREE.MeshStandardMaterial({ color: 0x6a6258, roughness: 0.95 }), { fine: [0.7, 0.35], macro: [0.02, 0.35], rough: 0.05 }));
    ground.position.y = -0.1;
    ground.receiveShadow = true;
    scene.add(ground);

    // canals: water strips with stone quays
    const water = waterMaterial({ sunDir, deep: 0x1c2a2c, shallow: 0x3a5048, skyTop: 0x4a6a9a, skyHorizon: 0xf2c08a, sunColor: 0xffc890, spec: 8, ripple: 0.6 });
    const quayMat = new THREE.MeshStandardMaterial({ color: 0x8a8070, roughness: 0.9 });
    const span = 3200;
    const addCanal = (alongX, c) => {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(alongX ? span : CHW * 2, alongX ? CHW * 2 : span).rotateX(-Math.PI / 2), water);
      w.position.set(alongX ? 0 : c, WATER_Y, alongX ? c : 0);
      w.renderOrder = -1;
      scene.add(w);
      for (const sd of [-1, 1]) {
        const q = new THREE.Mesh(new THREE.BoxGeometry(alongX ? span : 1.2, 0.5, alongX ? 1.2 : span), quayMat);
        q.position.set(alongX ? 0 : c + sd * (CHW + 0.6), 0.1, alongX ? c + sd * (CHW + 0.6) : 0);
        q.receiveShadow = true;
        scene.add(q);
      }
    };
    for (const c of CZ) addCanal(true, c);
    for (const c of CX) addCanal(false, c);

    // bridges: brick decks under the road where it crosses a canal (signature landmark)
    const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x7a3a2a, roughness: 0.9 });
    const crossings = [];
    let prev = canalDist(track.x[0], track.z[0]);
    for (let i = 1; i <= track.n; i++) {
      const j = i % track.n;
      const d = canalDist(track.x[j], track.z[j]);
      const dn = canalDist(track.x[(j + 1) % track.n], track.z[(j + 1) % track.n]);
      if (d < CHW && d <= prev && d <= dn) crossings.push(j);
      prev = d;
    }
    for (const j of crossings) {
      const p = track.pointAt(j * track.step, 0);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(track.width + 3, Math.max(0.6, p.y + 0.2), CHW * 2 + 10), bridgeMat);
      deck.position.set(p.x, (p.y - 0.25) / 2 - 0.05, p.z);
      deck.rotation.y = p.heading;
      deck.receiveShadow = true;
      scene.add(deck);
    }

    // canal houses lining the streets
    const winTex = windowTextures({ cols: 1, rows: 1, wall: '#ffffff', lit: ['#ffd9a0', '#fff0c8'], litChance: 0.35, frame: '#f4f1e8', seedValue: 21 });
    const houseMat = new THREE.MeshStandardMaterial({ map: winTex.map, emissiveMap: winTex.emissive, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.85 });
    const protos = [];
    for (const gable of ['step', 'bell', 'spout']) for (const [w, h] of [[6, 12], [7, 15], [5.5, 17]]) protos.push({ gable, w, h, d: 12, list: [] });
    const homes = [];
    for (const side of [-1, 1]) {
      let s = 0;
      while (s < track.length) {
        const pr = protos[Math.floor(rand() * protos.length)];
        const setback = hw + 4.5 + pr.d / 2;
        const p = track.pointAt(track.wrapS(s + pr.w / 2), side * setback);
        s += pr.w + 0.15;
        if (canalDist(p.x, p.z) < CHW + pr.d / 2 + 3) continue; // the quay
        if (index.nearest(p.x, p.z, 3).dist < setback - 0.5) continue; // another road (a bend, a shortcut) runs here
        if (homes.some((o) => (o.x - p.x) ** 2 + (o.z - p.z) ** 2 < 25)) continue;
        homes.push(p);
        pr.list.push({ x: p.x, y: -0.1, z: p.z, ry: p.heading + Math.PI / 2, sy: 0.85 + rand() * 0.35, color: BRICK[Math.floor(rand() * BRICK.length)] });
      }
    }
    // a second row behind, so the town doesn't end after one house
    for (const side of [-1, 1]) {
      for (let s = 0; s < track.length; s += 9 + rand() * 6) {
        const pr = protos[Math.floor(rand() * protos.length)];
        const p = track.pointAt(s, side * (hw + 4.5 + 12 + 6 + pr.d / 2 + rand() * 6));
        if (canalDist(p.x, p.z) < CHW + pr.d / 2 + 3) continue;
        if (index.nearest(p.x, p.z, 3).dist < hw + 4.5 + pr.d / 2 + 12) continue;
        pr.list.push({ x: p.x, y: -0.1, z: p.z, ry: p.heading + Math.PI / 2 + (rand() - 0.5) * 0.2, sy: 0.9 + rand() * 0.5, color: BRICK[Math.floor(rand() * BRICK.length)] });
      }
    }
    for (const pr of protos) if (pr.list.length) scene.add(instanced(houseGeo(pr.w, pr.h, pr.d, pr.gable), houseMat, pr.list, { cast: true, receive: true }));

    // trees along the quays, bikes parked by the road, houseboats
    const vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
    const trees = [], bikes = [], boats = [];
    for (const c of CZ) for (let x = -1500; x < 1500; x += 16 + rand() * 10) for (const sd of [-1, 1]) {
      const z = c + sd * (CHW + 3);
      if (index.nearest(x, z, 2).dist > hw + 6) trees.push({ x, y: -0.1, z, ry: rand() * 6.28, s: 0.8 + rand() * 0.4 });
    }
    for (const c of CX) for (let z = -1500; z < 1500; z += 16 + rand() * 10) for (const sd of [-1, 1]) {
      const x = c + sd * (CHW + 3);
      if (index.nearest(x, z, 2).dist > hw + 6) trees.push({ x, y: -0.1, z, ry: rand() * 6.28, s: 0.8 + rand() * 0.4 });
    }
    for (let s = 0; s < track.length; s += 7 + rand() * 9) {
      const side = rand() < 0.5 ? -1 : 1;
      const p = track.pointAt(s, side * (hw + 3.2));
      if (index.nearest(p.x, p.z, 2).dist < hw + 2.5 || canalDist(p.x, p.z) < CHW + 2) continue;
      for (let k = 0; k < 1 + Math.floor(rand() * 4); k++) bikes.push({ x: p.x + Math.sin(p.heading) * k * 0.7, y: -0.1, z: p.z + Math.cos(p.heading) * k * 0.7, ry: p.heading + Math.PI / 2 + (rand() - 0.5) * 0.3 });
    }
    for (const c of CZ) for (let x = -1400; x < 1400; x += 60 + rand() * 90) {
      if (index.nearest(x, c, 2).dist < hw + 30) continue;
      boats.push({ x, y: WATER_Y - 0.4, z: c + (rand() < 0.5 ? -1 : 1) * (CHW - 3), ry: Math.PI / 2 });
    }
    scene.add(instanced(treeGeo(), vc, trees));
    scene.add(instanced(bikeGeo(), vc, bikes, { cast: false }));
    if (boats.length) scene.add(instanced(boatGeo(), vc, boats));

    // windmills on the edge of town
    const mills = [];
    for (const [x, z] of [[-900, -650], [950, 620], [-1050, 520]]) {
      if (index.nearest(x, z, 4).dist < 80) continue;
      const m = windmill();
      m.position.set(x, -0.1, z);
      m.rotation.y = Math.atan2(-x, -z);
      scene.add(m);
      mills.push(m);
    }

    // reflections: warm brick and sky
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.BoxGeometry(30, 30 + rand() * 30, 10), new THREE.MeshBasicMaterial({ color: BRICK[i % BRICK.length] }));
      b.position.set(Math.cos(a) * 200, 10, Math.sin(a) * 200);
      b.lookAt(0, 10, 0);
      envScene.add(b);
    }

    return {
      landmark: { s: crossings.map((j) => j * track.step), range: 30 },
      update(dt, time) {
        water.uniforms.uTime.value = time;
        for (const m of mills) m.userData.hub.rotation.z = time * 0.6;
      },
    };
  },
};
