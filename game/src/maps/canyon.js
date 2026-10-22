// SCORCHED CANYON: desert highway through red mesas, cacti, power lines and blowing dust. The
// bridge over the river gorge is out (jump it), a bend runs through a slot canyon where the road
// curls up the rock (wall-ride), and an ore train shuttles over a level crossing to the mine.
// Sandstone arches span the road, dust devils wander the flats and vultures circle the gorge.
import * as THREE from 'three';
import { LAYOUTS } from './layouts.js';
import { fbm, noise2, makeHeightFn, buildTerrain, mountainRing } from '../terrain.js';
import { rng, colored, merge, instanced, scatter } from '../scenery.js';
import { waterMaterial } from '../water.js';
import { radialTexture } from '../textures.js';
import { Train } from '../train.js';

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const BANDS = [0xb4532e, 0xc86a3a, 0x9a4428, 0xd88a52, 0xa84a2c, 0xe0a070].map((h) => new THREE.Color(h));

function natural(x, z) {
  const dunes = Math.sin(x * 0.011 + Math.sin(z * 0.004) * 2) * 3 + fbm(x * 0.004, z * 0.004, 4) * 28;
  const r = Math.hypot(x, z);
  const edge = Math.pow(Math.max(0, (r - 900) / 600), 1.4) * 160;
  return dunes - 8 + edge;
}

// Banded sandstone butte: jittered cylinder with flat top, coloured in strata.
function mesaGeometry(seed) {
  const g = new THREE.CylinderGeometry(1, 1.22, 1, 11, 8);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + (noise2(Math.cos(a) * 2 + seed, y * 3 + Math.sin(a) * 2) - 0.5) * 0.35;
    if (Math.hypot(x, z) > 0.05) { p.setX(i, x * k); p.setZ(i, z * k); }
  }
  g.computeVertexNormals();
  const ng = g.toNonIndexed();
  const pos = ng.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    c.copy(BANDS[Math.floor(y * 7 + seed) % BANDS.length]);
    if (y > 0.98) c.setHex(0xc89060);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return ng;
}

function cactusGeometry() {
  const green = 0x3d6b3a, tip = 0x5f8f4a;
  const parts = [colored(new THREE.CylinderGeometry(0.32, 0.38, 6, 8).translate(0, 3, 0), green, tip)];
  for (const [sx, h, y] of [[1, 2.2, 2.6], [-1, 1.6, 3.4]]) {
    parts.push(colored(new THREE.CylinderGeometry(0.22, 0.22, 1.1, 7).rotateZ(Math.PI / 2).translate(sx * 0.8, y, 0), green));
    parts.push(colored(new THREE.CylinderGeometry(0.22, 0.24, h, 7).translate(sx * 1.3, y + h / 2, 0), green, tip));
  }
  return merge(parts);
}

// A ridge of rock along the road: rows along the road; across each row a cliff face rising from
// the road, a flat top, and a slope back down to the desert behind - pushed about into rough
// rock and coloured in sandstone bands. side: which side of the road.
function canyonWall(track, s0, s1, side, { off, height, seed }) {
  const pos = [], col = [], idx = [];
  const H = 7, K = H + 3, c = new THREE.Color();
  let rows = 0;
  for (let s = s0; s <= s1; s += 3, rows++) {
    const p = track.pointAt(s, 0);
    const fade = smooth(s0, s0 + 45, s) * smooth(s1, s1 - 45, s);
    const top = height * (0.6 + 0.4 * noise2(s * 0.02 + seed, seed)) * fade + 2;
    for (let k = 0; k <= K; k++) {
      // the face (k <= H), then the far edge of the top and the foot of the back slope
      let lat, h;
      if (k <= H) {
        const f = k / H;
        h = -2 + top * f;
        lat = off + (noise2(s * 0.08 + seed, k * 0.7) - 0.5) * 3 + f * f * 4; // leans out a little near the top
      } else if (k === H + 1) { h = top + 1 + noise2(s * 0.05, seed) * 3; lat = off + 16; }
      else if (k === H + 2) { h = top * 0.6; lat = off + 26 + top * 0.3; }
      else { h = -6; lat = off + 30 + top * 0.8; }
      pos.push(p.x + p.rx * side * lat, p.y + h, p.z + p.rz * side * lat);
      c.copy(BANDS[Math.floor((p.y + h) * 0.45 + seed) % BANDS.length]).multiplyScalar(0.85 + 0.25 * noise2(s * 0.1, k));
      col.push(c.r, c.g, c.b);
    }
  }
  for (let r = 0; r < rows - 1; r++) for (let k = 0; k < K; k++) {
    const a = r * (K + 1) + k, b = a + 1, cc = a + K + 1, d = cc + 1;
    idx.push(a, cc, b, b, cc, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Half ring of banded sandstone over the road
function archGeometry(r, tube, seed) {
  const g = new THREE.TorusGeometry(r, tube, 10, 28, Math.PI);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (noise2(x * 0.15 + seed, y * 0.15) - 0.5) * 0.25;
    p.setXYZ(i, x * k, y * k, z * (1 + (noise2(y * 0.2, seed) - 0.5) * 0.6));
  }
  g.computeVertexNormals();
  const ng = g.toNonIndexed();
  const pos = ng.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.copy(BANDS[Math.floor(pos.getY(i) * 0.35 + seed) % BANDS.length]);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  ng.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return ng;
}

function locoGeometry(len) {
  const parts = [
    colored(new THREE.BoxGeometry(3.0, 1.2, len).translate(0, 1.0, 0), 0x2a2a2e), // frame
    colored(new THREE.BoxGeometry(2.8, 2.6, len * 0.62).translate(0, 2.9, -len * 0.14), 0xf2b21a), // hood
    colored(new THREE.BoxGeometry(3.0, 3.4, len * 0.24).translate(0, 3.3, len * 0.33), 0xd8381e), // cab
    colored(new THREE.BoxGeometry(3.1, 0.35, len * 0.25).translate(0, 5.1, len * 0.33), 0x1a1a1e), // cab roof
    colored(new THREE.BoxGeometry(2.9, 0.5, len * 0.62).translate(0, 4.35, -len * 0.14), 0x3a3a40), // vents
  ];
  for (const z of [-len * 0.32, len * 0.32]) parts.push(colored(new THREE.BoxGeometry(2.6, 1.0, 3.2).translate(0, 0.5, z), 0x1a1a1e)); // bogies
  return merge(parts);
}

function hopperGeometry(len) {
  const parts = [
    colored(new THREE.BoxGeometry(2.9, 0.8, len).translate(0, 1.0, 0), 0x2a2a2e),
    colored(new THREE.CylinderGeometry(1.85, 1.2, 2.6, 4, 1).rotateY(Math.PI / 4).scale(1.1, 1, len / 3.6).translate(0, 2.7, 0), 0x8a3a22, 0xa04a2a),
    colored(new THREE.BoxGeometry(2.7, 0.6, len - 1.6).translate(0, 4.0, 0), 0x6a4a3a), // ore heaped on top
  ];
  for (const z of [-len * 0.35, len * 0.35]) parts.push(colored(new THREE.BoxGeometry(2.6, 1.0, 2.6).translate(0, 0.5, z), 0x1a1a1e));
  return merge(parts);
}

export default {
  id: 'canyon',
  name: 'SCORCHED CANYON',
  tagline: 'Desert highway through the red mesas',
  weatherLabel: 'DUST STORM',
  layout: LAYOUTS.canyon,
  exposure: 0.98,
  envIntensity: 1.0,
  bloom: { strength: 0.2, radius: 0.45, threshold: 1.15 },
  fog: { color: 0xd4a878, density: 0.00085 },
  sky: {
    top: 0x3a74c0, horizon: 0xecc294, bottom: 0xc8a070,
    sunDir: new THREE.Vector3(-0.35, 0.72, 0.42), sunColor: 0xfff0d0, sunSize: 0.0014, sunIntensity: 8, glow: 0.45,
    clouds: 0.18, cloudColor: 0xfff4e4, horizonSharp: 0.55,
  },
  sun: { color: 0xfff0d6, intensity: 3.8 },
  hemi: { sky: 0xa8c8f0, ground: 0xb07848, intensity: 1.0 },
  smoke: [0.86, 0.7, 0.5],
  weather: { type: 'dust', count: 1400, wind: [9, 3], color: 0xd8b080, spray: [0.85, 0.68, 0.46] },
  trackStyle: {
    road: { base: '#56504a', line: '#f2c21a', edge: '#e8e2d4', lanes: 2, roughness: 0.92, dust: true, cracks: 2.4, patches: 3, wear: 0.6, aggregate: 1.25, oil: 1, seed: 66 }, // baked and cracked
    kerb: null,
    barrier: { type: 'guardrail', color: 0x9a8f84, postColor: 0x6a5a48 },
    embankment: 0xc89060,
    shoulder: 0xb88a5a,
    shortcut: { color: 0xb08a5c },
    accent: '#ff8a00',
  },

  build({ scene, track, index, density, envScene, shortcut, sunDir, jumps = [], banks = [], crossings = [] }) {
    const rand = rng(313);
    const hw = track.halfWidth;
    const baseHeight = makeHeightFn(index, natural, { hw, near: -1.2, blendStart: 12, blendEnd: 90 });

    // the river gorge under the broken bridge: across the road at the jump, running out of the
    // crater to the north and ending in a box canyon in the infield
    const jump = jumps[0] || null;
    let gorge = null;
    if (jump) {
      const mid = track.pointAt(track.wrapS(jump.sLip + jump.gap / 2), 0);
      const roadY = track.pointAt(jump.sLip, 0).y;
      gorge = { x: mid.x, z: mid.z, dx: mid.rx, dz: mid.rz, tx: mid.tx, tz: mid.tz, floor: roadY - 34, water: roadY - 31, half: 24, top: 44, south: 300, north: 1800 };
    }
    // the ore line: in from the desert, over the crossing and into the mine in the infield
    const cross = crossings[0] || null;
    let line = null;
    if (cross) {
      const X = track.pointAt(cross.s, 0);
      line = { x: X.x, z: X.z, dx: X.rx, dz: X.rz, y: X.y, back: 900, ahead: 270 };
      line.points = [[X.x - X.rx * line.back, X.z - X.rz * line.back], [X.x, X.z], [X.x + X.rx * line.ahead, X.z + X.rz * line.ahead]];
    }
    const lineAt = (x, z) => { const t = (x - line.x) * line.dx + (z - line.z) * line.dz; return { t, d: Math.abs((x - line.x) * -line.dz + (z - line.z) * line.dx) }; };
    // rail bed: the dunes smoothed out under the line, level with the road at the crossing
    const bedY = (t) => {
      const px = line.x + line.dx * t, pz = line.z + line.dz * t;
      const k = smooth(60, 160, Math.abs(t));
      return line.y - 0.4 + (natural(px, pz) * 0.35 + 2 - (line.y - 0.4)) * k;
    };
    const carve = (x, z, h) => {
      if (gorge) {
        const t = (x - gorge.x) * gorge.dx + (z - gorge.z) * gorge.dz;
        const across = Math.abs((x - gorge.x) * gorge.tx + (z - gorge.z) * gorge.tz);
        const taper = smooth(gorge.south, gorge.south - 140, t) * smooth(-gorge.north - 1, -gorge.north + 200, t);
        if (taper > 0 && across < gorge.top) {
          const wall = smooth(gorge.half * taper, gorge.top * Math.max(0.3, taper), across + noise2(t * 0.03, 5) * 4);
          h = Math.min(h, gorge.floor + (h - gorge.floor) * wall + (1 - taper) * 30);
        }
      }
      if (line) {
        const { t, d } = lineAt(x, z);
        if (t > -line.back - 20 && t < line.ahead + 20 && d < 16) h += (bedY(t) - 0.6 - h) * smooth(16, 5, d);
      }
      return h;
    };
    const heightAt = (x, z) => carve(x, z, baseHeight(x, z));
    const inGorge = (x, z) => gorge && Math.abs((x - gorge.x) * gorge.tx + (z - gorge.z) * gorge.tz) < gorge.top + 6 && (x - gorge.x) * gorge.dx + (z - gorge.z) * gorge.dz < gorge.south;
    const nearLine = (x, z, m) => line && (() => { const { t, d } = lineAt(x, z); return d < m && t > -line.back - 10 && t < line.ahead + 30; })();
    // keep scenery off the set pieces
    const busy = (s) => jumps.some((j) => j.near(s, 90)) || banks.some((b) => b.inSpan(s, 50)) || crossings.some((c) => Math.abs(track.deltaS(s, c.s)) < 40);

    const sand = new THREE.Color(0xdcaa6c), sand2 = new THREE.Color(0xc4834a), rock = new THREE.Color(0xa0522d), wet = new THREE.Color(0x6a4a30);
    scene.add(buildTerrain({
      size: 3000, res: 240, center: [0, 0], heightAt,
      colorAt: (c, x, y, z, ny) => {
        c.copy(sand).lerp(sand2, fbm(x * 0.006, z * 0.006, 3));
        if (ny < 0.8) c.copy(BANDS[Math.floor(y * 0.45 + 40) % BANDS.length]).lerp(rock, 0.3);
        if (gorge && y < gorge.water + 4) c.lerp(wet, 0.7);
      },
    }));
    scene.add(mountainRing({ inner: 1500, outer: 3800, peak: 420, snowLine: 9999, rock: 0xa4583a, grass: 0xc8844e, seed: 8, baseY: -10 }));

    // mesas and spires, well away from the road
    const mesaGeos = [mesaGeometry(1), mesaGeometry(4), mesaGeometry(9)];
    const mesaMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    const buckets = [[], [], []];
    scatter(Math.round(60 * density) + 12, rand, [-1500, 1500, -1500, 1500], (x, z) => {
      const d = index.nearest(x, z, 4).dist;
      const spire = rand() < 0.3;
      const w = spire ? 8 + rand() * 10 : 40 + rand() * 90;
      if (d < hw + 30 + w * 1.3 || inGorge(x, z) || nearLine(x, z, w + 20)) return null;
      const t = { x, y: heightAt(x, z) - 4, z, ry: rand() * 6.28, sx: w, sz: w * (0.7 + rand() * 0.6), sy: spire ? 50 + rand() * 60 : 35 + rand() * 110 };
      buckets[Math.floor(rand() * 3)].push(t);
      return t;
    });
    buckets.forEach((b, i) => { if (b.length) scene.add(instanced(mesaGeos[i], mesaMat, b, { receive: true })); });

    // cacti and dry scrub
    const cacti = scatter(Math.round(320 * density), rand, [-1100, 1100, -1100, 1100], (x, z) => {
      const d = index.nearest(x, z, 3).dist;
      if (d < hw + 6 || d > hw + 180 || inGorge(x, z) || nearLine(x, z, 8)) return null;
      const s = 0.7 + rand() * 0.7;
      return { x, y: heightAt(x, z) - 0.2, z, ry: rand() * 6.28, s };
    });
    scene.add(instanced(cactusGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), cacti));
    const scrub = scatter(Math.round(500 * density), rand, [-1100, 1100, -1100, 1100], (x, z) => {
      if (index.nearest(x, z, 2).dist < hw + 5 || nearLine(x, z, 5)) return null;
      const s = 0.6 + rand() * 1.4;
      return { x, y: heightAt(x, z), z, ry: rand() * 6.28, sx: s * 1.4, sy: s * 0.6, sz: s * 1.4 };
    });
    scene.add(instanced(colored(new THREE.IcosahedronGeometry(1, 0), 0x7a6a3a, 0x9a8a50), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }), scrub, { cast: false }));

    // wooden power poles with sagging wires along one side
    const poles = [], wire = [];
    let prev = null;
    for (let s = 0; s < track.length; s += 55) {
      const p = track.pointAt(s, hw + 9);
      // none in the shortcut's fork, on its road, or at a set piece
      if ((shortcut && (shortcut.isGap(s, 1) || shortcut.near(p.x, p.z, 4))) || busy(s)) { prev = null; continue; }
      const top = { x: p.x, y: p.y + 9, z: p.z };
      poles.push({ x: p.x, y: p.y + 4.5, z: p.z, ry: p.heading });
      if (prev) {
        for (const off of [-1.1, 1.1]) {
          const ox = Math.cos(p.heading) * off, oz = -Math.sin(p.heading) * off;
          for (let k = 0; k < 6; k++) {
            const t0 = k / 6, t1 = (k + 1) / 6;
            const sag = (t) => -Math.sin(t * Math.PI) * 1.2;
            wire.push(prev.x + (top.x - prev.x) * t0 + ox, prev.y + (top.y - prev.y) * t0 + sag(t0) + 0.3, prev.z + (top.z - prev.z) * t0 + oz);
            wire.push(prev.x + (top.x - prev.x) * t1 + ox, prev.y + (top.y - prev.y) * t1 + sag(t1) + 0.3, prev.z + (top.z - prev.z) * t1 + oz);
          }
        }
      }
      prev = top;
    }
    const poleGeo = merge([colored(new THREE.CylinderGeometry(0.16, 0.2, 9, 6), 0x5a4230), colored(new THREE.BoxGeometry(2.8, 0.18, 0.18).translate(0, 4.1, 0), 0x5a4230)]);
    scene.add(instanced(poleGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), poles));
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wire, 3));
    scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x2a2420 })));

    // water tower landmark
    const tp = track.pointAt(track.length * 0.35, -(hw + 40));
    const tower = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.7, roughness: 0.45 });
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(6, 6, 7, 20), metal);
    tank.position.y = 22;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(6.3, 2.4, 20), metal);
    cap.position.y = 26.7;
    tower.add(tank, cap);
    for (const [lx, lz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 19, 6), metal);
      leg.position.set(lx, 9.5, lz);
      tower.add(leg);
    }
    tower.traverse((o) => { o.castShadow = true; });
    tower.position.set(tp.x, heightAt(tp.x, tp.z) - 0.5, tp.z);
    scene.add(tower);

    const animated = [];
    const concrete = new THREE.MeshStandardMaterial({ color: 0xb8aa98, roughness: 0.9 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x4a4a50, roughness: 0.5, metalness: 0.7 });

    // --- the broken bridge over the gorge ---------------------------------------------------
    if (jump && gorge) {
      const river = new THREE.Mesh(new THREE.PlaneGeometry(gorge.half * 2.2, gorge.north + gorge.south).rotateX(-Math.PI / 2),
        waterMaterial({ sunDir, deep: 0x1d4a52, shallow: 0x3f8478, skyTop: 0x3a74c0, skyHorizon: 0xecc294, sunColor: 0xfff0d0, spec: 8, ripple: 1.6 }));
      river.position.set(gorge.x + gorge.dx * (gorge.south - gorge.north) / 2, gorge.water, gorge.z + gorge.dz * (gorge.south - gorge.north) / 2);
      river.rotation.y = Math.atan2(gorge.dx, gorge.dz);
      scene.add(river);
      animated.push(river.material);
      // deck slabs under the road either side of the gap, on piers down into the gorge
      const deckRows = (s0, s1) => {
        const pos = [], idx = [];
        let n = 0;
        for (let s = s0; s <= s1 + 1e-6; s += 2, n++) {
          const p = track.pointAt(s, 0), up = jump.lift(s) > 0 ? jump.lift(s) : 0;
          for (const [lat, h] of [[-(hw + 1.3), -0.25], [-(hw + 1.3), -2.2], [hw + 1.3, -2.2], [hw + 1.3, -0.25]]) pos.push(p.x + p.rx * lat, p.y + up + h, p.z + p.rz * lat);
          if (s + 2 <= s1 + 1e-6) for (let k = 0; k < 3; k++) { const a = n * 4 + k, b = a + 1, c = a + 4, d = c + 1; idx.push(a, c, b, b, c, d); }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        const m = new THREE.Mesh(g, concrete);
        m.material.side = THREE.DoubleSide;
        m.castShadow = true; m.receiveShadow = true;
        scene.add(m);
      };
      const bridge = jump.spec.bridge ?? 55;
      deckRows(jump.sRamp - bridge, jump.sLip);
      deckRows(jump.sLand, jump.sLand + bridge);
      const piers = [];
      for (const [s0, s1] of [[jump.sRamp - bridge, jump.sLip - 6], [jump.sLand + 6, jump.sLand + bridge]]) {
        for (let s = s0 + 4; s <= s1; s += 18) {
          for (const lat of [-hw * 0.55, hw * 0.55]) {
            const p = track.pointAt(s, lat), top = p.y - 2.2 + Math.max(0, jump.lift(s));
            const bottom = heightAt(p.x, p.z) - 2;
            if (top - bottom > 1) piers.push({ x: p.x, y: bottom, z: p.z, ry: p.heading, sx: 2.2, sy: top - bottom, sz: 2.2 });
          }
        }
      }
      scene.add(instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), concrete, piers, { receive: true }));
      // rebar sticking out of the broken ends, and chunks of deck down in the river
      const rebar = [];
      for (const [s, h, dir] of [[jump.sLip, jump.h, 1], [jump.sLand, 0, -1]]) {
        const p = track.pointAt(s, 0);
        for (let k = 0; k < 18; k++) {
          const lat = (rand() - 0.5) * 2 * (hw + 0.8), len = 1.5 + rand() * 3.5;
          const q = track.pointAt(s + dir * len * 0.5, lat);
          rebar.push({ x: q.x, y: p.y + h - 0.4 - rand() * 1.4, z: q.z, ry: p.heading, rx: Math.PI / 2 + (rand() - 0.5) * 0.9 * dir, rz: (rand() - 0.5) * 0.6, sy: len });
        }
      }
      scene.add(instanced(new THREE.CylinderGeometry(0.05, 0.05, 1, 4), steelMat, rebar, { cast: false }));
      const rubble = [];
      for (let k = 0; k < 9; k++) {
        const t = (rand() - 0.5) * 50, a = (rand() - 0.5) * 30;
        const x = gorge.x + gorge.tx * a + gorge.dx * t, z = gorge.z + gorge.tz * a + gorge.dz * t;
        rubble.push({ x, y: gorge.water + 0.5, z, rx: rand() * 0.6, ry: rand() * 6, rz: rand() * 0.6, sx: 4 + rand() * 6, sy: 1.2 + rand(), sz: 3 + rand() * 5 });
      }
      scene.add(instanced(new THREE.BoxGeometry(1, 1, 1), concrete, rubble));
    }

    // --- the slot canyon round the wall-ride ---------------------------------------------------
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true, side: THREE.DoubleSide });
    for (const b of banks) {
      const s0 = b.s0 - 40, s1 = b.s0 + b.span + 40;
      for (const side of [-1, 1]) {
        const w = new THREE.Mesh(canyonWall(track, s0, s1, side, { off: hw + (side === b.side ? 4 : 5), height: 46, seed: side + 7 }), rockMat);
        w.castShadow = true; w.receiveShadow = true;
        scene.add(w);
      }
    }

    // --- the ore line: rails, the crossing, the train and the mine -----------------------------
    let trainEntry = null;
    const trainMeshes = [];
    const gateArms = [], lamps = [];
    let lampOn = null, lampOff = null;
    if (line) {
      const train = new Train({ points: line.points, cars: 6, speed: 34, accel: 5, dwell: 4, offset: rand() * 60 });
      const tc = line.back, w = hw + 3;
      trainEntry = { train, s: cross.s, tc, w };
      // gravel bed, sleepers and rails
      const sleepers = [], railPts = [[], []];
      const len = line.back + line.ahead;
      for (let t = -line.back; t <= line.ahead; t += 1.3) {
        const x = line.x + line.dx * t, z = line.z + line.dz * t, y = bedY(t);
        if (Math.abs(t) > w) sleepers.push({ x, y: y + 0.08, z, ry: Math.atan2(line.dx, line.dz) + Math.PI / 2 });
      }
      for (let t = -line.back; t <= line.ahead; t += 4) {
        for (const [k, sd] of [[0, -1], [1, 1]]) {
          const x = line.x + line.dx * t - line.dz * sd * 0.75, z = line.z + line.dz * t + line.dx * sd * 0.75;
          railPts[k].push(new THREE.Vector3(x, bedY(t) + 0.3 + (Math.abs(t) < hw + 6 ? 0.15 : 0), z)); // flush with the road across it
        }
      }
      scene.add(instanced(new THREE.BoxGeometry(2.6, 0.18, 0.28), new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 0.9 }), sleepers, { cast: false, receive: true }));
      for (const pts of railPts) {
        const curve = new THREE.CatmullRomCurve3(pts);
        scene.add(new THREE.Mesh(new THREE.TubeGeometry(curve, Math.round(len / 4), 0.08, 4, false), steelMat));
      }
      const bedPos = [], bedIdx = [];
      let n = 0;
      for (let t = -line.back; t <= line.ahead; t += 6, n++) {
        for (const sd of [-1, 1]) bedPos.push(line.x + line.dx * t - line.dz * sd * 2.4, bedY(t) + 0.02, line.z + line.dz * t + line.dx * sd * 2.4);
        if (t + 6 <= line.ahead) { const p = n * 2; bedIdx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2); }
      }
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(bedPos, 3));
      bg.setIndex(bedIdx);
      bg.computeVertexNormals();
      const bed = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ color: 0x7a6a5a, roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 }));
      bed.receiveShadow = true;
      scene.add(bed);
      // the train
      const locoGeo = locoGeometry(train.units[0].len), wagonGeo = hopperGeometry(train.units[1].len);
      const trainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 });
      for (const u of train.units) {
        const m = new THREE.Mesh(u.kind === 'loco' ? locoGeo : wagonGeo, trainMat);
        m.castShadow = true;
        if (u.kind === 'loco') {
          const head = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2c0).multiplyScalar(4) }));
          head.position.set(0, 4.2, u.len / 2 + 0.05);
          m.add(head);
        }
        scene.add(m);
        trainMeshes.push(m);
      }
      // crossing: lights on posts both sides, gate arms, crossbucks
      lampOn = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2010).multiplyScalar(5) });
      lampOff = new THREE.MeshBasicMaterial({ color: 0x401010 });
      const X = track.pointAt(cross.s, 0);
      for (const sd of [-1, 1]) {
        for (const along of [-1, 1]) {
          const p = track.pointAt(cross.s + along * (w + 3), sd * (hw + 2.5));
          const post = new THREE.Group();
          const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 4.6, 6), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.5 }));
          pole.position.y = 2.3;
          post.add(pole);
          // crossbuck and lights face the cars coming up to the crossing
          const head = new THREE.Group();
          const buck = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.35, 0.06), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 }));
          for (const r of [0.6, -0.6]) { const bk = buck.clone(); bk.position.y = 4.3; bk.rotation.z = r; head.add(bk); }
          for (const lx of [-0.45, 0.45]) {
            const lamp = new THREE.Mesh(new THREE.CircleGeometry(0.28, 12), lampOff);
            lamp.position.set(lx, 3.4, 0.16);
            head.add(lamp);
            lamps.push({ mesh: lamp, phase: lx > 0 ? 1 : 0 });
          }
          post.add(head);
          // the arm pivots at the post and swings down across the road's half
          const arm = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, hw + 1).translate(0, 0, (hw + 1) / 2), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }));
          arm.position.set(0, 1.4, 0);
          post.add(arm);
          gateArms.push(arm);
          post.position.set(p.x, p.y, p.z);
          post.rotation.y = X.heading + (sd * Math.PI) / 2; // the arm points out over the road
          head.rotation.y = X.heading + Math.PI - post.rotation.y;
          scene.add(post);
        }
      }
      // the mine: a loading shed over the end of the line, an ore heap and a buffer stop
      const end = { x: line.x + line.dx * line.ahead, z: line.z + line.dz * line.ahead };
      const shed = new THREE.Group();
      const roof = new THREE.Mesh(new THREE.BoxGeometry(14, 1, 40), new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.8, metalness: 0.3 }));
      roof.position.y = 9;
      shed.add(roof);
      for (const [px, pz] of [[-6, -18], [6, -18], [-6, 18], [6, 18], [-6, 0], [6, 0]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.6, 9, 0.6), steelMat);
        leg.position.set(px, 4.5, pz);
        shed.add(leg);
      }
      const heap = new THREE.Mesh(new THREE.ConeGeometry(14, 10, 10), new THREE.MeshStandardMaterial({ color: 0x5a3a2a, roughness: 1, flatShading: true }));
      heap.position.set(18, 5, 0);
      shed.add(heap);
      shed.traverse((o) => { o.castShadow = true; });
      shed.position.set(end.x - line.dx * 20, bedY(line.ahead), end.z - line.dz * 20);
      shed.rotation.y = Math.atan2(line.dx, line.dz);
      scene.add(shed);
    }

    // --- sandstone arches over the road ---------------------------------------------------------
    const archGeo = [archGeometry(hw + 9, 4.2, 3), archGeometry(hw + 11, 5, 11)];
    const archMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    let placed = 0;
    for (const f of [0.31, 0.5, 0.78, 0.9]) {
      if (placed >= 2) break;
      const s = track.length * f;
      if (busy(s) || (shortcut && (shortcut.isGap(s, 1) || shortcut.isGap(s, -1))) || track.maxCurvatureAhead(s - 20, 40) > 0.004) continue;
      const p = track.pointAt(s, 0);
      const a = new THREE.Mesh(archGeo[placed], archMat);
      a.position.set(p.x, p.y - 2, p.z);
      a.rotation.y = p.heading; // the arch's plane runs across the road
      a.castShadow = true; a.receiveShadow = true;
      scene.add(a);
      placed++;
    }

    // --- dust devils, tumbleweeds and vultures --------------------------------------------------
    const dustTex = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64);
    const devils = [];
    for (let k = 0; k < 3; k++) {
      const n = 70, pos = new Float32Array(n * 3);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: dustTex, color: 0xd8b080, size: 5, transparent: true, opacity: 0.35, depthWrite: false }));
      pts.frustumCulled = false;
      scene.add(pts);
      devils.push({ pts, pos, n, a: rand() * 6.28, r: 250 + rand() * 350, ph: rand() * 6.28 });
    }
    const weedGeo = new THREE.IcosahedronGeometry(1, 1);
    const wp = weedGeo.attributes.position;
    for (let i = 0; i < wp.count; i++) { const k = 0.7 + rand() * 0.5; wp.setXYZ(i, wp.getX(i) * k, wp.getY(i) * k, wp.getZ(i) * k); }
    weedGeo.computeVertexNormals();
    const weeds = new THREE.InstancedMesh(weedGeo, new THREE.MeshStandardMaterial({ color: 0x9a7a4a, roughness: 1, wireframe: true }), 26);
    weeds.frustumCulled = false;
    const weedState = Array.from({ length: 26 }, () => ({ x: (rand() - 0.5) * 1600, z: (rand() - 0.5) * 1600, s: 0.6 + rand() * 0.6, spin: 0, ph: rand() * 6 }));
    scene.add(weeds);
    const birdGeo = new THREE.BufferGeometry();
    birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.6, -2.2, 0.5, -0.3, 0, 0.1, -0.6, 0, 0, 0.6, 2.2, 0.5, -0.3, 0, 0.1, -0.6], 3));
    birdGeo.computeVertexNormals();
    const birds = new THREE.InstancedMesh(birdGeo, new THREE.MeshBasicMaterial({ color: 0x1a1210, side: THREE.DoubleSide }), 6);
    birds.frustumCulled = false;
    scene.add(birds);
    const centre = gorge ? { x: gorge.x - gorge.dx * 120, z: gorge.z - gorge.dz * 120 } : { x: 0, z: 0 };

    const envGround = new THREE.Mesh(new THREE.CircleGeometry(300, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xb07848 }));
    envGround.position.y = -6;
    envScene.add(envGround);

    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    const fc = {}, pj = {};
    return {
      landmark: { s: [track.length * 0.35], range: 70 }, // the water tower
      trains: trainEntry ? [trainEntry] : [],
      update(dt, time) {
        for (const mat of animated) mat.uniforms.uTime.value = time;
        if (trainEntry) {
          const tr = trainEntry.train;
          tr.setTime(time);
          tr.layout().forEach((u, i) => {
            const t = tr.project(u.x, u.z, pj).t - line.back;
            trainMeshes[i].position.set(u.x, bedY(t) + 0.3, u.z);
            trainMeshes[i].rotation.y = u.heading + (u.back ? Math.PI : 0);
          });
          // lights flash and the gates come down while a train is near the crossing
          tr.crossing(trainEntry.tc, trainEntry.w, fc, 8);
          const warn = fc.now || fc.tIn < 6;
          const blink = Math.floor(time * 2.5) % 2;
          for (const l of lamps) l.mesh.material = warn && blink === l.phase ? lampOn : lampOff;
          for (const arm of gateArms) arm.rotation.x += ((warn ? 0 : -Math.PI / 2.2) - arm.rotation.x) * Math.min(1, dt * 3);
        }
        devils.forEach((d) => {
          d.a += dt * 0.03;
          const cx = Math.cos(d.a) * d.r, cz = Math.sin(d.a * 0.7 + d.ph) * d.r;
          const base = heightAt(cx, cz);
          for (let i = 0; i < d.n; i++) {
            const f = i / d.n, ang = time * 3.5 + i * 0.9, rr = 2 + f * 9;
            d.pos[i * 3] = cx + Math.cos(ang) * rr;
            d.pos[i * 3 + 1] = base + f * 38;
            d.pos[i * 3 + 2] = cz + Math.sin(ang) * rr;
          }
          d.pts.geometry.attributes.position.needsUpdate = true;
        });
        weedState.forEach((w, i) => {
          w.x += dt * 9; w.z += dt * 3;
          if (w.x > 800) w.x -= 1600;
          if (w.z > 800) w.z -= 1600;
          w.spin += dt * 9 / w.s;
          const y = heightAt(w.x, w.z) + w.s + Math.abs(Math.sin(time * 2 + w.ph)) * 0.6;
          e.set(w.spin, 0, -w.spin * 0.3);
          m4.compose(v3.set(w.x, y, w.z), q.setFromEuler(e), one.clone().setScalar(w.s));
          weeds.setMatrixAt(i, m4);
        });
        weeds.instanceMatrix.needsUpdate = true;
        for (let i = 0; i < 6; i++) {
          const a = time * 0.12 + i * 1.05, r = 60 + (i % 3) * 25;
          const flap = Math.sin(time * 4 + i) * 0.3;
          e.set(flap * 0.3, -a, 0.35);
          m4.compose(v3.set(centre.x + Math.cos(a) * r, 120 + (i % 2) * 18, centre.z + Math.sin(a) * r), q.setFromEuler(e), one.clone().setScalar(1.6));
          birds.setMatrixAt(i, m4);
        }
        birds.instanceMatrix.needsUpdate = true;
      },
    };
  },
};
