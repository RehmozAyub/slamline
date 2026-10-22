// CANAL QUARTER: an old canal town at golden hour. Tall narrow gabled houses lean over the
// street, the road humps over bridges where it crosses a canal, bikes everywhere, a windmill.
// One drawbridge has been left raised (jump it), the road ducks through a brick passage under
// the old weigh house and runs down the glass-roofed market hall between the stalls. Barges
// work the canals, flower boxes hang under the windows and lamps glow along the quays.
import * as THREE from 'three';
import { LAYOUTS, CANALS, LAYOUT_SCALE } from './layouts.js';
import { rng, colored, merge, instanced } from '../scenery.js';
import { addWorldDetail } from '../detail.js';
import { waterMaterial } from '../water.js';
import { windowTextures, radialTexture } from '../textures.js';
import { TUNNEL_STYLES } from '../tunnel.js';

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

// a working barge: long, low (it fits under the bridges), a wheelhouse at the stern
function bargeGeo(color) {
  return merge([
    colored(new THREE.BoxGeometry(4.4, 1.1, 22).translate(0, 0.35, 0), color),
    colored(new THREE.BoxGeometry(4.0, 0.5, 14).translate(0, 1.05, 2), 0x3a3a34),
    colored(new THREE.BoxGeometry(3.2, 1.4, 3.4).translate(0, 1.6, -8.6), 0xe8e0d0),
    colored(new THREE.BoxGeometry(3.4, 0.2, 3.6).translate(0, 2.4, -8.6), 0x2a2a2a),
  ]);
}

// a market stall: counter, goods and a striped awning
function stallGeo(awning, rand) {
  const parts = [
    colored(new THREE.BoxGeometry(4, 1, 1.8).translate(0, 0.5, 0), 0x6a4a30),
    colored(new THREE.BoxGeometry(0.1, 2.6, 0.1).translate(-1.9, 1.3, -0.8), 0x3a2a20),
    colored(new THREE.BoxGeometry(0.1, 2.6, 0.1).translate(1.9, 1.3, -0.8), 0x3a2a20),
  ];
  for (let k = 0; k < 4; k++) parts.push(colored(new THREE.BoxGeometry(0.8, 0.35, 0.6).translate(-1.4 + k * 0.95, 1.18, 0.2), [0xd83a2a, 0xf0c020, 0x5aa83a, 0xe87a20][Math.floor(rand() * 4)]));
  for (let k = 0; k < 6; k++) {
    const stripe = new THREE.PlaneGeometry(4.2 / 6, 2.4).rotateX(-Math.PI / 2 + 0.45).translate(-2.1 + (k + 0.5) * (4.2 / 6), 2.7, -0.2);
    parts.push(colored(stripe, k % 2 ? awning : 0xf4f0e8));
  }
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

  build({ scene, track, index, density, envScene, sunDir, jumps = [], tunnels = [] }) {
    const rand = rng(1234);
    const hw = track.halfWidth, step = track.step;
    const jump = jumps[0] || null;
    const passage = tunnels.find((t) => t.style === 'brick') || null, hall = tunnels.find((t) => t.style === 'arcade') || null;
    const within = (t, sv, m) => t && track.deltaS(t.a - m, sv) >= 0 && track.deltaS(sv, t.b + m) >= 0;

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
    const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x7a3a2a, roughness: 0.9, side: THREE.DoubleSide });
    const crossings = [];
    let prev = canalDist(track.x[0], track.z[0]);
    for (let i = 1; i <= track.n; i++) {
      const j = i % track.n;
      const d = canalDist(track.x[j], track.z[j]);
      const dn = canalDist(track.x[(j + 1) % track.n], track.z[(j + 1) % track.n]);
      if (d < CHW && d <= prev && d <= dn && !(jump && jump.near(j * step, 30))) crossings.push(j);
      prev = d;
    }
    // Each bridge is two brick side walls that follow the road's arch (tops just under the road
    // edge, bottoms in the water) plus the arch's underside, so nothing pokes up through the
    // road at either end of the hump.
    for (const j of crossings) {
      const half = Math.ceil((CHW + 9) / track.step);
      const v = [], idx = [];
      const W = hw + 1.6;
      for (let k = -half; k <= half; k++) {
        const i = (j + k + track.n) % track.n;
        const x = track.x[i], y = track.y[i], z = track.z[i], rx = track.rx[i], rz = track.rz[i];
        const top = y - 0.12, bot = WATER_Y - 0.5;
        for (const sd of [-1, 1]) v.push(x + rx * sd * W, top, z + rz * sd * W, x + rx * sd * W, bot, z + rz * sd * W);
      }
      for (let k = 0; k < 2 * half; k++) {
        const a = k * 4, b = (k + 1) * 4;
        idx.push(a, b, a + 1, a + 1, b, b + 1); // left wall
        idx.push(a + 2, a + 3, b + 2, b + 2, a + 3, b + 3); // right wall
        idx.push(a, a + 2, b, b, a + 2, b + 2); // underside of the arch (just below the road)
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const deck = new THREE.Mesh(g, bridgeMat);
      deck.receiveShadow = true;
      scene.add(deck);
    }

    // canal houses lining the streets
    const winTex = windowTextures({ cols: 1, rows: 1, wall: '#ffffff', lit: ['#ffd9a0', '#fff0c8'], litChance: 0.35, frame: '#f4f1e8', seedValue: 21 });
    const houseMat = new THREE.MeshStandardMaterial({ map: winTex.map, emissiveMap: winTex.emissive, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.85 });
    const protos = [];
    for (const gable of ['step', 'bell', 'spout']) for (const [w, h] of [[6, 12], [7, 15], [5.5, 17]]) protos.push({ gable, w, h, d: 12, list: [] });
    const homes = [], flowers = [];
    const FLOWERS = [0xe0303a, 0xf060a0, 0xf0c020, 0xf4f0f0, 0xb040c0];
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
        const sv = track.wrapS(s - pr.w / 2);
        if (within(passage, sv, 4) || within(hall, sv, 2)) continue;
        homes.push(p);
        const sy = 0.85 + rand() * 0.35;
        pr.list.push({ x: p.x, y: -0.1, z: p.z, ry: p.heading + Math.PI / 2, sy, color: BRICK[Math.floor(rand() * BRICK.length)] });
        if (rand() < 0.7) for (const fl of [1, 2]) {
          const out = pr.d / 2 + 0.3;
          flowers.push({ x: p.x - p.rx * side * out, y: 3.2 * fl * sy - 0.2, z: p.z - p.rz * side * out, ry: p.heading + Math.PI / 2, sx: pr.w * 0.7, color: FLOWERS[Math.floor(rand() * FLOWERS.length)] });
        }
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
    // flower boxes: a green box of leaves topped with blooms
    const flowerGeo = merge([colored(new THREE.BoxGeometry(1, 0.35, 0.45), 0x3a5a2a), colored(new THREE.BoxGeometry(0.96, 0.22, 0.4).translate(0, 0.26, 0), 0xffffff)]);
    if (flowers.length) scene.add(instanced(flowerGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), flowers, { cast: false }));

    const Tb = TUNNEL_STYLES.brick, Ta = TUNNEL_STYLES.arcade;
    // --- the weigh house over the passage: gabled wings either side, the vault through it ---
    if (passage) {
      // a row of tall gabled fronts either side, as tall as the vault's roof
      const W = hw + Tb.width + 3, gables = ['step', 'bell', 'step'];
      const fronts = gables.map((g) => ({ geo: houseGeo(10.5, Tb.top - 0.4, 11, g), list: [] }));
      for (let sv = passage.a - 2; sv < passage.b + 2; sv += 10.6) for (const sd of [-1, 1]) {
        const p = track.pointAt(track.wrapS(sv + 5.3), sd * (W + 5.5));
        fronts[Math.floor(rand() * 3)].list.push({ x: p.x, y: -0.1, z: p.z, ry: p.heading + Math.PI / 2, color: [0x7a3424, 0x5a2e22, 0x6a2a2a][Math.floor(rand() * 3)] });
      }
      for (const fr of fronts) if (fr.list.length) scene.add(instanced(fr.geo, houseMat, fr.list, { cast: true, receive: true }));
      // stone dressing round both mouths and a clock over the entrance
      const stone = new THREE.MeshStandardMaterial({ color: 0xd8ccb0, roughness: 0.85 });
      for (const sv of [passage.a, passage.b]) {
        const p = track.pointAt(track.wrapS(sv), 0);
        for (const sd of [-1, 1]) {
          const q = track.pointAt(track.wrapS(sv), sd * (hw + Tb.width + 0.6));
          const jamb = new THREE.Mesh(new THREE.BoxGeometry(1.4, Tb.height + 1, 1.2).translate(0, (Tb.height + 1) / 2, 0), stone);
          jamb.position.set(q.x, q.y - 0.5, q.z);
          jamb.rotation.y = p.heading;
          scene.add(jamb);
        }
        const lintel = new THREE.Mesh(new THREE.BoxGeometry(2 * (hw + Tb.width) + 3, 1.6, 1.2), stone);
        lintel.position.set(p.x, p.y + Tb.height + 1.3, p.z);
        lintel.rotation.y = p.heading;
        scene.add(lintel);
      }
      const ent = track.pointAt(track.wrapS(passage.a - 2.5), 0);
      const clock = new THREE.Group();
      clock.add(new THREE.Mesh(new THREE.CircleGeometry(1.8, 24), new THREE.MeshBasicMaterial({ color: 0xe8dcc0 })));
      const rim = new THREE.Mesh(new THREE.RingGeometry(1.8, 2.2, 24), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.6 }));
      const hands = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 1.4).translate(0, 0.6, 0.02), new THREE.MeshBasicMaterial({ color: 0x1a1a1a }));
      const hand2 = hands.clone();
      hand2.rotation.z = 2.2;
      clock.add(rim, hands, hand2);
      clock.position.set(ent.x, ent.y + 13.5, ent.z);
      clock.rotation.y = ent.heading + Math.PI;
      scene.add(clock);
    }

    // --- the market hall: stalls outside the columns, strings of lights under the roof -----
    if (hall) {
      const W = hw + Ta.width;
      const awnings = [0xd83a2a, 0x2a6ad8, 0x2a9a4a, 0xe8a020];
      const lists = awnings.map(() => []);
      for (let sv = hall.a + 4; sv < hall.b - 3; sv += 6.5) for (const sd of [-1, 1]) {
        const p = track.pointAt(track.wrapS(sv), sd * (W + 3));
        lists[Math.floor(rand() * 4)].push({ x: p.x, y: p.y - 0.4, z: p.z, ry: p.heading + (sd > 0 ? Math.PI / 2 : -Math.PI / 2) }); // facing the road
      }
      awnings.forEach((a, k) => { if (lists[k].length) scene.add(instanced(stallGeo(a, rand), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }), lists[k])); });
      const bulbs = [];
      for (let sv = hall.a + 3; sv < hall.b - 2; sv += Ta.pillars) {
        for (let k = 0; k <= 16; k++) {
          const f = k / 16, lat = -W + 2 * W * f;
          const p = track.pointAt(track.wrapS(sv), lat);
          bulbs.push({ x: p.x, y: p.y + Ta.height - 3.6 - Math.sin(f * Math.PI) * 1.6 + 1.2, z: p.z });
        }
      }
      scene.add(instanced(new THREE.SphereGeometry(0.16, 6, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd890).multiplyScalar(3) }), bulbs, { cast: false }));
    }

    // --- the drawbridge, left raised: its leaf is the ramp, balance beams and chains over it --
    let warn = null;
    if (jump) {
      const white = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.7 });
      const beam = (a, b, size, mat = white) => {
        const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
        const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, len), mat);
        m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
        m.lookAt(b.x, b.y, b.z);
        m.castShadow = true;
        scene.add(m);
      };
      const at = (sv, lat, up = 0) => { const p = track.pointAt(track.wrapS(sv), lat); return { x: p.x, y: p.y + Math.max(0, jump.lift(sv)) + up, z: p.z }; };
      // railings along the raised leaf
      for (const sd of [-1, 1]) {
        const lat = sd * (hw + 0.9);
        for (let sv = jump.sRamp; sv < jump.sLip; sv += 2) beam(at(sv, lat, 0), at(sv, lat, 1.2), 0.12);
        beam(at(jump.sRamp, lat, 1.2), at(jump.sLip, lat, 1.2), 0.16);
      }
      // the portal at the hinge, the balance beams tilted up with the leaf, chains to its tip
      const hinge = jump.sRamp + 3, rise = jump.h / jump.ramp;
      for (const sd of [-1, 1]) {
        const lat = sd * (hw + 2.2), foot = at(hinge, lat), top = { ...foot, y: foot.y + 11 };
        beam(foot, top, 0.9);
        const front = at(jump.sLip - 1, lat), back = at(hinge - 14, lat);
        const fy = top.y + (jump.sLip - 1 - hinge) * rise * 0.9, by = top.y - 14 * rise * 0.9;
        beam({ ...back, y: by }, { ...front, y: fy }, 0.7);
        beam({ ...front, y: fy }, at(jump.sLip - 0.5, sd * (hw + 0.6), 0.3), 0.08, new THREE.MeshStandardMaterial({ color: 0x2a2a2a, metalness: 0.7, roughness: 0.4 }));
        const cw = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 2.4), new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.6, metalness: 0.4 }));
        cw.position.set(back.x, by - 1.6, back.z);
        scene.add(cw);
      }
      beam(at(hinge, -(hw + 2.2), 11), at(hinge, hw + 2.2, 11), 0.8);
      // red warning lamps on the portal, flashing
      warn = [];
      for (const sd of [-1, 1]) {
        const p = at(hinge - 0.5, sd * (hw + 2.2), 8);
        const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,60,40,1)', 'rgba(255,0,0,0)', 32), color: 0xff4030, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        lamp.position.set(p.x, p.y, p.z);
        lamp.scale.setScalar(2.6);
        scene.add(lamp);
        warn.push(lamp);
      }
      // the bridge keeper's hut on the quay
      const hp = at(jump.sRamp + 6, -(hw + 6.5));
      const hut = new THREE.Mesh(houseGeo(3.4, 3.2, 3.4, 'spout'), houseMat);
      hut.position.set(hp.x, -0.1, hp.z);
      hut.rotation.y = track.pointAt(track.wrapS(jump.sRamp + 6), 0).heading;
      scene.add(hut);
    }

    // --- lamps along the quays ---------------------------------------------------------------
    const lamps = [], heads = [], glows = [];
    const lampAt = (x, z) => {
      if (index.nearest(x, z, 2).dist < hw + 6) return;
      lamps.push({ x, y: -0.1, z }); heads.push({ x, y: 4.3, z }); glows.push({ x, y: 4.3, z });
    };
    for (const c of CZ) for (let x = -1400; x < 1400; x += 34) for (const sd of [-1, 1]) lampAt(x, c + sd * (CHW + 1.6));
    for (const c of CX) for (let z = -1400; z < 1400; z += 34) for (const sd of [-1, 1]) lampAt(c + sd * (CHW + 1.6), z);
    scene.add(instanced(new THREE.CylinderGeometry(0.08, 0.12, 4.2, 6).translate(0, 2.1, 0), new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.5, metalness: 0.6 }), lamps, { cast: false }));
    scene.add(instanced(new THREE.BoxGeometry(0.5, 0.6, 0.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc880).multiplyScalar(2.4) }), heads, { cast: false }));
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.Float32BufferAttribute(glows.flatMap((g) => [g.x, g.y, g.z]), 3));
    scene.add(new THREE.Points(gg, new THREE.PointsMaterial({ map: radialTexture('rgba(255,200,120,0.7)', 'rgba(255,160,80,0)', 32), size: 3.2, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));

    // --- barges working the canals, to and fro between the bridges ------------------------
    const barges = [];
    const runs = [];
    for (const [alongX, list] of [[true, CZ], [false, CX]]) for (const c of list) {
      // where roads cross this canal (bridges): the barge works the stretches between them
      const cuts = [-1300, 1300];
      for (let i = 0; i < track.n; i += 2) {
        const x = track.x[i], z = track.z[i];
        if (alongX ? Math.abs(z - c) < CHW + 2 : Math.abs(x - c) < CHW + 2) cuts.push(alongX ? x : z);
      }
      cuts.sort((a, b) => a - b);
      for (let k = 0; k < cuts.length - 1; k++) if (cuts[k + 1] - cuts[k] > 180) runs.push({ alongX, c, a: cuts[k] + 40, b: cuts[k + 1] - 40 });
    }
    runs.sort(() => rand() - 0.5);
    const bargeCols = [0x2a3a5a, 0x5a2a24, 0x2a4a34, 0x3a3a3e];
    runs.slice(0, 6).forEach((r, k) => {
      const m = new THREE.Mesh(bargeGeo(bargeCols[k % 4]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
      m.castShadow = true;
      scene.add(m);
      barges.push({ m, ...r, ph: rand() * 10, lane: (rand() < 0.5 ? -1 : 1) * (CHW * 0.4) });
    });

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
      landmark: { s: [...crossings.map((j) => j * track.step), ...(jump ? [jump.sLip] : [])], range: 30 },
      update(dt, time) {
        water.uniforms.uTime.value = time;
        for (const m of mills) m.userData.hub.rotation.z = time * 0.6;
        if (warn) for (const l of warn) l.visible = Math.floor(time * 2) % 2 === 0;
        for (const b of barges) {
          // a slow shuttle: 3.5 m/s along the stretch and back, turning at the ends
          const L = b.b - b.a, period = (2 * L) / 3.5, t = ((time + b.ph * period) % period + period) % period;
          const fwd = t < period / 2, u = fwd ? (t / (period / 2)) * L : L - ((t - period / 2) / (period / 2)) * L;
          const pos = b.a + u, lane = fwd ? b.lane : -b.lane;
          if (b.alongX) b.m.position.set(pos, WATER_Y - 0.25, b.c + lane); else b.m.position.set(b.c + lane, WATER_Y - 0.25, pos);
          b.m.rotation.y = b.alongX ? (fwd ? Math.PI / 2 : -Math.PI / 2) : (fwd ? 0 : Math.PI);
        }
      },
    };
  },
};
