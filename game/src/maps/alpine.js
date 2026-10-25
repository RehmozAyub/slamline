// ALPINE PASS: bright mountain day, pine forests, snowy peaks and hot-air balloons.
// The road takes a ski jump over a ravine, runs through an avalanche gallery under the high
// peaks and corkscrews on a stone viaduct across a valley fed by a waterfall. Cloud banks
// cling to the mountainsides, a cable car climbs to the summit station and an eagle circles.
import * as THREE from 'three';
import { LAYOUTS } from './layouts.js';
import { fbm, noise2, makeHeightFn, buildTerrain, terrainLocal, mountainRing } from '../terrain.js';
import { rng, colored, merge, instanced, scatter } from '../scenery.js';
import { waterMaterial } from '../water.js';
import { radialTexture } from '../textures.js';
import { addWorldDetail } from '../detail.js';
import { TUNNEL_STYLES } from '../tunnel.js';
import { RoadHazards } from '../hazards.js';

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function natural(x, z) {
  const r = Math.hypot(x, z);
  const hills = fbm(x * 0.003 + 10, z * 0.003 - 4, 5) * 110 - 20;
  const ridges = Math.pow(1 - Math.abs(fbm(x * 0.0016, z * 0.0016, 4) * 2 - 1), 3) * 140;
  const edge = Math.pow(Math.max(0, (r - 650) / 700), 1.6) * 420;
  return hills + ridges * 0.6 + edge;
}

function pineGeometry() {
  const parts = [colored(new THREE.CylinderGeometry(0.22, 0.32, 2.4, 6).translate(0, 1.2, 0), 0x4a3422)];
  const tiers = [[3.2, 4.2, 2.0], [2.5, 3.6, 4.2], [1.7, 3.0, 6.2], [0.9, 2.4, 8.0]];
  for (const [r, h, y] of tiers) {
    parts.push(colored(new THREE.ConeGeometry(r, h, 8).translate(0, y + h / 2 - 0.6, 0), 0x1d3a22, 0x3a6a3a));
  }
  return merge(parts);
}

function balloon(color, rand) {
  const g = new THREE.Group();
  const env = new THREE.Mesh(new THREE.SphereGeometry(8, 20, 14), new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
  env.scale.y = 1.2;
  g.add(env);
  const band = new THREE.Mesh(new THREE.SphereGeometry(8.05, 20, 4, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.16), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }));
  band.scale.y = 1.2;
  g.add(band);
  const basket = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 2), new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 }));
  basket.position.y = -13;
  g.add(basket);
  g.userData.ph = rand() * 10;
  return g;
}

// A channel across the road in a local frame at `s`: u across the road (toward `up` side), a
// along it. Used for the ravine under the ski jump and the valley under the viaduct.
function frameAt(track, s, sign = 1) {
  const m = track.pointAt(track.wrapS(s), 0);
  const f = { x: m.x, z: m.z, y: m.y, dx: m.rx * sign, dz: m.rz * sign, tx: m.tx, tz: m.tz };
  f.local = (x, z) => ({ u: (x - f.x) * f.dx + (z - f.z) * f.dz, a: (x - f.x) * f.tx + (z - f.z) * f.tz });
  f.world = (u, a) => [f.x + f.dx * u + f.tx * a, f.z + f.dz * u + f.tz * a];
  return f;
}

// the ravine under the ski jump: straight cliff tops under the road (it ends cleanly at the
// edges), ragged and narrower away from it, a stream at the bottom
function ravineOf(track, jump) {
  const hw = track.halfWidth;
  const r = frameAt(track, jump.sLip + jump.gap / 2);
  Object.assign(r, { half: jump.gap / 2, len: 210, floor: r.y - 32 });
  r.width = (u, a) => r.half + smooth(hw + 16, hw + 46, Math.abs(u)) * ((noise2(u * 0.05, a > 0 ? 2.1 : 8.7) - 0.5) * 14 - 6);
  // the ravine winds away from the road (none under it)
  r.bend = (u) => (Math.sin(u * 0.016 + 0.7) * 26 + Math.sin(u * 0.041) * 8) * smooth(hw + 16, hw + 80, Math.abs(u));
  r.local = (x, z) => { const u = (x - r.x) * r.dx + (z - r.z) * r.dz; return { u, a: (x - r.x) * r.tx + (z - r.z) * r.tz - r.bend(u) }; };
  r.carve = (x, z, h) => {
    const { u, a } = r.local(x, z);
    if (Math.abs(u) > r.len) return h;
    const w = r.width(u, a), floor = r.floor + u * 0.03; // the stream runs down one way
    const carved = floor + (h - floor) * smooth(w - 3.5, w, Math.abs(a));
    return h + (Math.min(h, carved) - h) * smooth(r.len, r.len - 40, Math.abs(u));
  };
  r.inside = (x, z, m = 0) => { const { u, a } = r.local(x, z); return Math.abs(u) < r.len && Math.abs(a) < r.width(u, a) + m; };
  return r;
}

// the valley under the viaduct: a broad U across the road, its walls meeting the road at the
// bridge's ends; on the mountain side it ends in the cliff the waterfall drops off
function valleyOf(track, rail, bridge) {
  const mid = track.pointAt(track.wrapS(rail.s0 + rail.span / 2), 0);
  const up = natural(mid.x + mid.rx * 400, mid.z + mid.rz * 400) > natural(mid.x - mid.rx * 400, mid.z - mid.rz * 400) ? 1 : -1;
  const v = frameAt(track, rail.s0 + rail.span / 2, up);
  const ya = track.pointAt(bridge.a, 0).y, yb = track.pointAt(bridge.b, 0).y;
  const half = track.deltaS(bridge.a, bridge.b) / 2;
  Object.assign(v, { half, floor: v.y - 34, head: 290, slope: (yb - ya) / (2 * half) });
  v.carve = (x, z, h) => {
    const { u, a } = v.local(x, z);
    if (u > v.head + 12 || u < -620 || Math.abs(a) > v.half + 40) return h;
    const rim = v.y + a * v.slope + 1; // level with the road
    const carved = v.floor + (rim - v.floor) * smooth(v.half - 50, v.half - 3, Math.abs(a)); // steep sides, a wide floor
    const k = smooth(v.head + 10, v.head - 2, u) * smooth(-620, -460, u);
    return h + (Math.min(h, carved) - h) * k;
  };
  v.inside = (x, z, m = 0) => { const { u, a } = v.local(x, z); return u < v.head + m && u > -460 && Math.abs(a) < v.half - 10 + m; };
  return v;
}

// falling water: streaks running down a plane, foaming at the bottom
function fallsMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
      void main() {
        float streak = noise(vec2(vUv.x * 28.0, vUv.y * 3.0 + uTime * 2.6)) * 0.6 + noise(vec2(vUv.x * 61.0, vUv.y * 7.0 + uTime * 4.1)) * 0.4;
        float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
        float foam = smoothstep(0.18, 0.0, vUv.y);
        float a = (0.45 + 0.55 * streak) * edge;
        vec3 col = mix(vec3(0.62, 0.78, 0.86), vec3(1.0), smoothstep(0.45, 0.9, streak) + foam);
        gl_FragColor = vec4(col, clamp(a + foam * edge, 0.0, 0.92));
      }`,
  });
}

// soft cloud banks: an fbm alpha texture that drifts
function cloudTexture(rand) {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S), seed = rand() * 100;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    // tileable: sample the noise on a torus
    const ax = (x / S) * Math.PI * 2, ay = (y / S) * Math.PI * 2;
    const v = fbm(Math.cos(ax) * 1.6 + seed, Math.sin(ax) * 1.6 + Math.cos(ay) * 1.6 + Math.sin(ay) * 0.7, 4);
    const a = Math.max(0, Math.min(1, (v - 0.42) / 0.22));
    const i = (y * S + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(a * 255); img.data[i + 3] = 255; // (an alphaMap reads green)
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function birdGeometry() {
  const g = new THREE.BufferGeometry();
  const v = [];
  for (const sd of [-1, 1]) {
    v.push(0, 0, 0.5, sd * 1.1, 0.12, 0.1, 0, 0, -0.45);
    v.push(sd * 1.1, 0.12, 0.1, sd * 2.6, 0.05, -0.2, sd * 1.1, 0.12, -0.4);
  }
  v.push(0, 0, 1.0, 0.25, 0, -0.9, -0.25, 0, -0.9);
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

export default {
  id: 'alpine',
  name: 'ALPINE PASS',
  tagline: 'Mountain switchbacks under a clear sky',
  layout: LAYOUTS.alpine,
  exposure: 0.95,
  envIntensity: 1.0,
  bloom: { strength: 0.2, radius: 0.45, threshold: 1.15 },
  fog: { color: 0xbcd2e8, density: 0.00045 },
  sky: {
    top: 0x1f5fcf, horizon: 0xcfe4f7, bottom: 0x8aa0b0,
    sunDir: new THREE.Vector3(0.45, 0.62, 0.35), sunColor: 0xfff4de, sunSize: 0.0012, sunIntensity: 14, glow: 0.7,
    clouds: 0.75, cloudColor: 0xffffff, horizonSharp: 0.6,
  },
  sun: { color: 0xfff1dc, intensity: 3.4 },
  hemi: { sky: 0xb8d4ff, ground: 0x4a5a3a, intensity: 1.0 },
  smoke: [0.9, 0.9, 0.92],
  tunnels: { gallery: { slab: 0xb0aca2, roof: 0xf4f7fb } },
  trackStyle: {
    road: { base: '#3c3d42', line: '#f5c400', edge: '#f2f2f2', lanes: 2, roughness: 0.86, dash: false, cracks: 1.6, patches: 3, seed: 44 }, // old mountain road
    kerb: null,
    barrier: { type: 'guardrail', color: 0xc8ccd2, glow: [0xff8a00, 0xff8a00], glowIntensity: 1.4 },
    embankment: 0x4f6a36,
    shoulder: 0x55524a,
    shortcut: { color: 0x6a6356 },
    accent: '#2d8cff',
    rail: { glow: 0x2d8cff, glowIntensity: 3, steel: 0x8f96a0, under: 0x3a3c42, foot: 46 },
  },

  build({ scene, track, index, density, envScene, sunDir, jumps = [], rails = [], tunnels = [], bridges = [] }) {
    const rand = rng(99);
    const hw = track.halfWidth, step = track.step;
    const baseHeight = makeHeightFn(index, natural, { hw, near: -1.3, blendStart: 12, blendEnd: 110 });
    const jump = jumps[0] || null, gal = tunnels.find((t) => t.style === 'gallery') || null;
    const screw = rails.find((r) => r.kind === 'corkscrew') || null, bridge = bridges[0] || null;
    const ravine = jump ? ravineOf(track, jump) : null;
    const valley = screw && bridge ? valleyOf(track, screw, bridge) : null;
    const G = TUNNEL_STYLES.gallery, galW = hw + G.width, galTop = G.height + 1;
    const galSide = gal ? gal.spec.side ?? -1 : -1;

    // the hillside over the gallery: up from behind its roof on the mountain's side (a box
    // round it saves the second road lookup everywhere else)
    let galBox = null;
    if (gal) {
      galBox = [Infinity, Infinity, -Infinity, -Infinity];
      for (let sv = gal.a - 30; sv <= gal.b + 30; sv += 10) { const p = track.pointAt(track.wrapS(sv), 0); galBox = [Math.min(galBox[0], p.x), Math.min(galBox[1], p.z), Math.max(galBox[2], p.x), Math.max(galBox[3], p.z)]; }
      galBox = [galBox[0] - 180, galBox[1] - 180, galBox[2] + 180, galBox[3] + 180];
    }
    const hillside = (x, z, h) => {
      if (x < galBox[0] || z < galBox[1] || x > galBox[2] || z > galBox[3]) return h;
      const n = index.nearest(x, z, 2);
      if (!isFinite(n.dist) || n.dist < 15) return h;
      const s = n.idx * step;
      const f = smooth(gal.a - 30, gal.a + 6, s) * smooth(gal.b + 30, gal.b - 6, s);
      if (f <= 0) return h;
      const lat = (x - track.x[n.idx]) * track.rx[n.idx] + (z - track.z[n.idx]) * track.rz[n.idx];
      if (lat * galSide <= 0) return h;
      const hill = n.y - 1.3 + smooth(16, 28, n.dist) * (galTop + 1.8) + Math.max(0, n.dist - 28) * 0.62;
      return h + (Math.max(h, hill) - h) * f * smooth(170, 120, n.dist);
    };
    const heightAt = (x, z) => {
      let h = baseHeight(x, z);
      if (gal) h = hillside(x, z, h);
      if (ravine) h = ravine.carve(x, z, h);
      if (valley) h = valley.carve(x, z, h);
      return h;
    };
    // the avalanche chute: a tongue of snow down the mountain onto the gallery's roof
    const chute = gal ? (() => {
      const s = track.wrapS((gal.a + gal.b) / 2), p = track.pointAt(s, 0);
      const ox = p.rx * galSide, oz = p.rz * galSide;
      return { x: p.x, z: p.z, y: p.y, ox, oz, tx: p.tx, tz: p.tz, s };
    })() : null;
    const inChute = (x, z) => {
      if (!chute) return 0;
      const u = (x - chute.x) * chute.ox + (z - chute.z) * chute.oz, a = Math.abs((x - chute.x) * chute.tx + (z - chute.z) * chute.tz);
      if (u < galW) return 0;
      const w = 22 + u * 0.12 + (noise2(u * 0.04, 3.3) - 0.5) * 14;
      return smooth(w + 6, w - 4, a) * smooth(330, 260, u);
    };

    const busy = (x, z, m = 0) => (ravine && ravine.inside(x, z, 12 + m)) || (valley && valley.inside(x, z, m)) || (inChute(x, z) > 0.2);

    const grass = new THREE.Color(0x4f7a34), meadow = new THREE.Color(0x7a9a3e), rock = new THREE.Color(0x7a746c), snow = new THREE.Color(0xf2f5fa), dirt = new THREE.Color(0x6a5a40);
    const colorAt = (c, x, y, z, ny) => {
      c.copy(grass).lerp(meadow, fbm(x * 0.008, z * 0.008, 3));
      if (ny < 0.85) c.lerp(dirt, Math.min(1, (0.85 - ny) * 4));
      if (ny < 0.72) c.lerp(rock, Math.min(1, (0.72 - ny) * 5));
      const snowLine = 170 + (fbm(x * 0.01, z * 0.01, 2) - 0.5) * 60;
      if (y > snowLine) c.lerp(snow, Math.min(1, (y - snowLine) / 25) * (ny > 0.6 ? 1 : 0.5));
      const ch = inChute(x, z);
      if (ch > 0) c.lerp(snow, ch * 0.95);
    };
    const terrain = buildTerrain({ size: 3000, res: 230, center: [0, 0], heightAt, colorAt });
    scene.add(terrain);
    // the ravine's walls in finer detail (a patch lined up with it; the coarse ground sunk below)
    if (ravine) {
      const w = 2 * (ravine.half + 50), d = 2 * ravine.len;
      const patch = buildTerrain({ size: [w, d], res: [w / 2, d / 2], center: [ravine.x, ravine.z], angle: Math.atan2(ravine.dx, ravine.dz), heightAt, colorAt, material: terrain.material });
      scene.add(patch);
      const p = terrain.geometry.attributes.position, cell = 3000 / 230;
      for (let i = 0; i < p.count; i++) if (terrainLocal(patch, p.getX(i), p.getZ(i)).inset > cell * 0.9) p.setY(i, Math.min(p.getY(i), ravine.floor - 12));
      terrain.geometry.computeVertexNormals();
    }
    scene.add(mountainRing({ inner: 1450, outer: 3900, peak: 800, snowLine: 320, rock: 0x6d6a72, grass: 0x40603a, seed: 12, baseY: 40 }));

    // pine forest
    const pines = scatter(Math.round(2000 * density), rand, [-1300, 1300, -1300, 1300], (x, z) => {
      const n = index.nearest(x, z, 3);
      if (n.dist < hw + 7 || busy(x, z)) return null;
      const y = heightAt(x, z);
      if (y > 175) return null;
      // forest clumping
      if (fbm(x * 0.006 + 50, z * 0.006, 3) < 0.45) return null;
      const s = 0.8 + rand() * 0.9;
      return { x, y: y - 0.3, z, ry: rand() * 6.28, s, sy: s * (0.85 + rand() * 0.4) };
    });
    const pineMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
    scene.add(instanced(pineGeometry(), pineMat, pines));

    // boulders
    const rocks = scatter(Math.round(220 * density), rand, [-1300, 1300, -1300, 1300], (x, z) => {
      if (index.nearest(x, z, 2).dist < hw + 6 || busy(x, z, -10)) return null;
      return { x, y: heightAt(x, z) - 0.6, z, rx: rand() * 3, ry: rand() * 3, s: 1 + rand() * 3.5 };
    });
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    scene.add(instanced(colored(new THREE.DodecahedronGeometry(1, 0), 0x8a857c), rockMat, rocks));

    // chalets, with balconies and flower boxes
    const chaletGeo = merge([
      colored(new THREE.BoxGeometry(9, 5, 7).translate(0, 2.5, 0), 0x7a5234),
      colored(new THREE.BoxGeometry(9.4, 1.4, 7.4).translate(0, 0.7, 0), 0xd8d2c4),
      colored(new THREE.BoxGeometry(9.6, 0.25, 1.6).translate(0, 3.1, 4.3), 0x5a3a24),
      colored(new THREE.BoxGeometry(9.2, 0.45, 0.4).translate(0, 3.5, 5.0), 0xd83a3a),
      colored(new THREE.CylinderGeometry(0.01, 6.5, 3.6, 4, 1).rotateY(Math.PI / 4).scale(1.25, 1, 1).translate(0, 6.8, 0), 0x3a2a24),
    ]);
    const chalets = scatter(Math.round(30 * density), rand, [-900, 900, -900, 900], (x, z) => {
      const d = index.nearest(x, z, 3).dist;
      if (d < hw + 25 || d > hw + 140 || busy(x, z, 10)) return null;
      const y = heightAt(x, z);
      return y < 150 ? { x, y: y - 0.4, z, ry: rand() * 6.28 } : null;
    });
    scene.add(instanced(chaletGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), chalets, { receive: true }));

    // hot-air balloons
    const balloons = [];
    const cols = [0xff3b3b, 0xffb000, 0x2d8cff, 0x2ee86a, 0xb04dff];
    for (let i = 0; i < 6; i++) {
      const b = balloon(cols[i % cols.length], rand);
      const a = rand() * Math.PI * 2, r = 250 + rand() * 600;
      b.position.set(Math.cos(a) * r, 160 + rand() * 120, Math.sin(a) * r);
      b.userData.base = b.position.y;
      balloons.push(b);
      scene.add(b);
    }

    const animated = [], animatedMist = [], landmarkS = [];
    const stone = addWorldDetail(new THREE.MeshStandardMaterial({ color: 0xa49c8e, roughness: 0.92 }), { fine: [0.5, 0.4], macro: [0.03, 0.3], rough: 0.1, triplanar: true });
    const water = (w, d) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), waterMaterial({ sunDir, deep: 0x1f5a6a, shallow: 0x4aa0a8, skyTop: 0x1f5fcf, skyHorizon: 0xcfe4f7, sunColor: 0xfff4de, spec: 6, ripple: 2 }));
      animated.push(m.material);
      return m;
    };

    // --- the ski jump: flags up the in-run, a judges' tower, the stream in the ravine ---------
    if (jump && ravine) {
      const flagGeo = merge([colored(new THREE.CylinderGeometry(0.08, 0.08, 7, 5).translate(0, 3.5, 0), 0xdddddd), colored(new THREE.PlaneGeometry(2.2, 1.3).translate(1.1, 6.2, 0), 0xffffff)]);
      const flagCols = [0xd8202a, 0x2d8cff, 0xffd400, 0x2ee86a];
      for (let k = 0; k < 4; k++) {
        const list = [];
        for (let s = jump.sRamp - 30 + k * 8; s < jump.sLip; s += 32) for (const sd of [-1, 1]) {
          const p = track.pointAt(s, sd * (hw + 3));
          list.push({ x: p.x, y: p.y + jump.lift(s) - 0.4, z: p.z, ry: p.heading + Math.PI / 2 });
        }
        scene.add(instanced(flagGeo, new THREE.MeshStandardMaterial({ color: flagCols[k], roughness: 0.7, side: THREE.DoubleSide }), list, { cast: false }));
      }
      const tp = track.pointAt(jump.sLand + 30, -(hw + 16));
      const tower = new THREE.Group();
      const wood = new THREE.MeshStandardMaterial({ color: 0x7a5234, roughness: 0.85 });
      for (const [lx, lz] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 12, 0.5), wood); leg.position.set(lx, 6, lz); tower.add(leg); }
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(6, 3.4, 6), wood);
      cabin.position.y = 13.7;
      const glass = new THREE.Mesh(new THREE.BoxGeometry(6.1, 1.4, 6.1), new THREE.MeshStandardMaterial({ color: 0x9ac8ff, roughness: 0.1, metalness: 0.6 }));
      glass.position.y = 14.2;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(5.2, 2.4, 4).rotateY(Math.PI / 4), new THREE.MeshStandardMaterial({ color: 0xc83030, roughness: 0.7 }));
      roof.position.y = 16.6;
      tower.add(cabin, glass, roof);
      tower.traverse((o) => { o.castShadow = true; });
      tower.position.set(tp.x, heightAt(tp.x, tp.z) - 0.3, tp.z);
      tower.rotation.y = tp.heading;
      scene.add(tower);
      // the stream winding along the ravine's floor, boulders strewn in it
      const pos = [], idx = [];
      for (let u = -ravine.len + 20, k = 0; u <= ravine.len - 20; u += 6, k++) {
        for (const a of [-6, 6]) { const [x, z] = ravine.world(u, a + ravine.bend(u)); pos.push(x, ravine.floor + u * 0.03 + 1.1, z); }
        if (k) { const p = (k - 1) * 2; idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3); }
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      sg.setIndex(idx);
      sg.computeVertexNormals();
      const stream = new THREE.Mesh(sg, water(1, 1).material);
      scene.add(stream);
      const strewn = [];
      for (let k = 0; k < 40; k++) {
        const u = (rand() - 0.5) * 2 * (ravine.len - 30), a = ravine.bend(u) + (rand() - 0.5) * 2 * (ravine.width(u, 1) - 4);
        if (Math.abs(u) < hw + 6) continue;
        const [x, z] = ravine.world(u, a);
        strewn.push({ x, y: ravine.floor + u * 0.03 + 0.5, z, rx: rand() * 3, ry: rand() * 3, s: 1.5 + rand() * 3.5 });
      }
      scene.add(instanced(colored(new THREE.DodecahedronGeometry(1, 0), 0x8a857c), rockMat, strewn));
    }

    // --- the valley: waterfall at its head, a stream, the stone viaduct ---------------------
    if (valley && screw && bridge) {
      // from the lip of the cliff out over its foot (clear of the slope), into a pool
      const [hx, hz] = valley.world(valley.head + 16, 0);
      const top = heightAt(hx, hz), drop = top - valley.floor, uTop = valley.head + 12, uFoot = valley.head - 16;
      const len = Math.hypot(drop, uTop - uFoot);
      const [fx, fz] = valley.world((uTop + uFoot) / 2, 0);
      const falls = new THREE.Mesh(new THREE.PlaneGeometry(16, len, 1, 8), fallsMaterial());
      falls.position.set(fx, valley.floor + drop / 2 + 1, fz);
      falls.rotation.order = 'YXZ';
      falls.rotation.y = Math.atan2(valley.dx, valley.dz);
      falls.rotation.x = Math.atan2(uTop - uFoot, drop); // top leaning back onto the cliff's lip
      scene.add(falls);
      animated.push(falls.material);
      const mistTex = radialTexture('rgba(255,255,255,0.8)', 'rgba(255,255,255,0)', 64);
      const mist = [];
      for (let k = 0; k < 7; k++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mistTex, color: 0xeef6ff, transparent: true, opacity: 0.5, depthWrite: false }));
        const [mx, mz] = valley.world(valley.head - 6 - rand() * 14, (rand() - 0.5) * 18);
        sp.position.set(mx, valley.floor + 2 + rand() * 6, mz);
        sp.scale.setScalar(14 + rand() * 10);
        sp.userData.ph = rand() * 6;
        mist.push(sp);
        scene.add(sp);
      }
      const stream = water(16, valley.head + 300);
      const [sx, sz] = valley.world((valley.head - 300) / 2, 0);
      stream.position.set(sx, valley.floor + 0.6, sz);
      stream.rotation.y = Math.atan2(valley.dx, valley.dz);
      scene.add(stream);

      // the viaduct: stone piers and arches under the road on both sides of the corkscrew
      const spans = [];
      const addSpans = (s0, s1) => {
        const n = Math.max(1, Math.round(track.deltaS(s0, s1) / 22));
        for (let k = 0; k < n; k++) spans.push([track.wrapS(s0 + (track.deltaS(s0, s1) * k) / n), track.wrapS(s0 + (track.deltaS(s0, s1) * (k + 1)) / n)]);
      };
      addSpans(bridge.a, screw.sA - 1);
      addSpans(screw.sB + 1, bridge.b);
      const depth = track.width + 2.4;
      for (const [s0, s1] of spans) {
        const A = track.pointAt(s0, 0), B = track.pointAt(s1, 0);
        const L = Math.hypot(B.x - A.x, B.z - A.z);
        const gA = Math.min(heightAt(A.x, A.z), A.y - 2), gB = Math.min(heightAt(B.x, B.z), B.y - 2);
        const low = Math.min(gA, gB) - 3, tA = A.y - 0.35 - low, tB = B.y - 0.35 - low;
        const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(L, 0), new THREE.Vector2(L, tB), new THREE.Vector2(0, tA)]);
        // the arch: piers 3.5 m thick, a round head with a spandrel above it
        const r = (L - 3.5) / 2, spring = Math.min(tA, tB) - 2.2 - r;
        if (spring > 3) {
          const hole = new THREE.Path();
          hole.moveTo(1.75, 0); hole.lineTo(L - 1.75, 0); hole.lineTo(L - 1.75, spring);
          hole.absarc(L / 2, spring, r, 0, Math.PI, false);
          hole.lineTo(1.75, 0);
          shape.holes.push(hole);
        }
        const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false }).translate(0, 0, -depth / 2);
        const m = new THREE.Mesh(g, stone);
        m.position.set(A.x, low, A.z);
        m.rotation.y = Math.atan2(B.x - A.x, B.z - A.z) - Math.PI / 2;
        m.castShadow = m.receiveShadow = true;
        scene.add(m);
      }
      // the corkscrew's legs and columns stand on stone footings in the stream bed
      const foot = [];
      for (const u of [screw.R.lead + 2, screw.R.lead + screw.midArc - 2]) for (const sd of [-1, 1]) {
        const p = track.pointAt(screw.sOf(u), sd * (hw + 3));
        foot.push({ x: p.x, y: heightAt(p.x, p.z) - 1, z: p.z, ry: p.heading });
      }
      scene.add(instanced(new THREE.BoxGeometry(5, 4, 5).translate(0, 2, 0), stone, foot));
      landmarkS.push(screw.s0 + screw.span / 2);

      for (const sp of mist) animatedMist.push(sp);
    }

    // --- the avalanche gallery: snow pouring down the chute and off its roof now and then ---
    let avalanche = null;
    if (gal && chute) {
      const n = 900, pos = new Float32Array(n * 3), seeds = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { seeds[i * 3] = rand(); seeds[i * 3 + 1] = rand() - 0.5; seeds[i * 3 + 2] = rand(); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64), color: 0xdfe8f4, size: 8, transparent: true, opacity: 0.85, depthWrite: false }));
      pts.frustumCulled = false;
      pts.visible = false;
      scene.add(pts);
      // the path: down the chute from high up, over the roof, off the open side's edge
      const path = [];
      for (let u = 300; u >= galW + 3; u -= 12) path.push([u, heightAt(chute.x + chute.ox * u, chute.z + chute.oz * u) + 1.5]);
      path.push([0, chute.y + galTop + 0.8], [-(galW + 2), chute.y + galTop + 0.4], [-(galW + 9), chute.y - 2], [-(galW + 20), chute.y - 14]);
      avalanche = { pts, pos, seeds, n, path, t0: -99, last: 0, want: false, spilled: true };
    }
    // a wreck near the gallery (or just time) brings the avalanche down, and it spills drifts of
    // snow across the road past the gallery's far end
    const hazards = new RoadHazards(scene, track);
    const onWreck = (sv) => { if (avalanche && gal && Math.abs(track.deltaS(sv, (gal.a + gal.b) / 2)) < 320) avalanche.want = true; };
    // --- cloud banks on the mountainsides --------------------------------------------------
    const ctex = cloudTexture(rand);
    const clouds = [];
    for (const [y, rep, op] of [[168, 5, 0.6], [190, 4, 0.42]]) {
      const t = ctex.clone();
      t.needsUpdate = true;
      t.repeat.set(rep, rep);
      const m = new THREE.Mesh(new THREE.RingGeometry(700, 1500, 96, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: null, alphaMap: t, color: 0xf6f9ff, transparent: true, opacity: op, depthWrite: false, side: THREE.DoubleSide }));
      m.position.y = y;
      m.renderOrder = 2;
      scene.add(m);
      clouds.push(t);
    }

    // --- the cable car: up from the infield to a summit station on the rim ----------------
    let cable = null;
    {
      let best = null;
      for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2, A = [Math.cos(a) * 240, Math.sin(a) * 240];
        if (index.nearest(A[0], A[1], 3).dist < hw + 40) continue;
        const B = [Math.cos(a) * 1080, Math.sin(a) * 1080];
        const hB = heightAt(B[0], B[1]);
        let clear = true;
        for (let f = 0.1; f < 1; f += 0.05) {
          const x = A[0] + (B[0] - A[0]) * f, z = A[1] + (B[1] - A[1]) * f;
          if (busy(x, z, 20) || (gal && index.nearest(x, z, 2).dist < 30 && track.deltaS(gal.a - 40, index.nearest(x, z, 2).idx * step) >= 0 && track.deltaS(index.nearest(x, z, 2).idx * step, gal.b + 40) >= 0)) { clear = false; break; }
        }
        if (clear && (!best || hB > best.hB)) best = { A, B, hB };
      }
      if (best) {
        const { A, B } = best;
        const towers = [], line = [];
        const N = 6;
        for (let k = 0; k <= N; k++) {
          const f = k / N, x = A[0] + (B[0] - A[0]) * f, z = A[1] + (B[1] - A[1]) * f;
          let ok = index.nearest(x, z, 2).dist > hw + 8;
          const y = heightAt(x, z) + (k === 0 || k === N ? 9 : 26);
          if (!ok && k > 0 && k < N) continue;
          towers.push({ x, y, z, end: k === 0 || k === N });
        }
        const head = Math.atan2(B[0] - A[0], B[1] - A[1]);
        const towerGeo = merge([colored(new THREE.BoxGeometry(1.4, 1, 1.4).translate(0, -0.5, 0), 0x6a6e76), colored(new THREE.BoxGeometry(9, 0.8, 0.8), 0x6a6e76)]);
        const steelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.6 });
        const tw = [];
        for (const t of towers) {
          const g = t.y - heightAt(t.x, t.z);
          if (t.end) {
            const st = new THREE.Mesh(new THREE.BoxGeometry(14, 10, 12), new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.8 }));
            st.position.set(t.x, t.y - 4, t.z);
            st.rotation.y = head;
            st.castShadow = true;
            scene.add(st);
          } else tw.push({ x: t.x, y: t.y, z: t.z, ry: head + Math.PI / 2, sx: 1, sy: g, sz: 1 });
        }
        // tower legs (a box scaled to the tower's height) with the crossbar at the top
        const legs = new THREE.InstancedMesh(towerGeo, steelMat, tw.length);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
        tw.forEach((t, i) => {
          // the leg scales with the height; keep the crossbar's size by building it apart
          m.compose(new THREE.Vector3(t.x, t.y, t.z), q.setFromEuler(e.set(0, t.ry, 0)), new THREE.Vector3(1, 1, 1));
          legs.setMatrixAt(i, m);
        });
        scene.add(legs);
        const legList = tw.map((t) => ({ x: t.x, y: t.y - t.sy / 2, z: t.z, ry: t.ry, sx: 1, sy: t.sy, sz: 1 }));
        scene.add(instanced(new THREE.BoxGeometry(1.4, 1, 1.4), new THREE.MeshStandardMaterial({ color: 0x6a6e76, roughness: 0.5, metalness: 0.6 }), legList));
        // two cables either side, sagging between towers
        const cables = [-3.6, 3.6].map((off) => {
          const pts = [];
          const ox = Math.cos(head) * off, oz = -Math.sin(head) * off;
          for (let k = 0; k < towers.length - 1; k++) {
            const a = towers[k], b = towers[k + 1];
            for (let j = 0; j < 12; j++) {
              const f = j / 12;
              pts.push(new THREE.Vector3(a.x + (b.x - a.x) * f + ox, a.y + (b.y - a.y) * f - Math.sin(f * Math.PI) * 6, a.z + (b.z - a.z) * f + oz));
            }
          }
          const last = towers[towers.length - 1];
          pts.push(new THREE.Vector3(last.x + ox, last.y, last.z + oz));
          return new THREE.CatmullRomCurve3(pts);
        });
        for (const c of cables) scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(c.getPoints(400)), new THREE.LineBasicMaterial({ color: 0x2a2a2e })));
        const cabinGeo = merge([
          colored(new THREE.BoxGeometry(3.4, 3, 4.2).translate(0, -4.5, 0), 0xd8202a),
          colored(new THREE.BoxGeometry(3.5, 1.2, 4.3).translate(0, -4.2, 0), 0x9ac8ff),
          colored(new THREE.CylinderGeometry(0.08, 0.08, 3, 4).translate(0, -1.5, 0), 0x2a2a2e),
        ]);
        const cabins = new THREE.InstancedMesh(cabinGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }), 4);
        cabins.frustumCulled = false;
        cabins.castShadow = true;
        scene.add(cabins);
        cable = { cables, cabins, head };
      }
    }

    // an eagle circling over the valley
    const eagle = new THREE.Mesh(birdGeometry(), new THREE.MeshBasicMaterial({ color: 0x3a2a1c, side: THREE.DoubleSide }));
    eagle.frustumCulled = false;
    scene.add(eagle);
    const eagleAt = valley ? valley.world(80, 0) : [0, 0];
    const eagleY = (valley ? valley.y : 60) + 90;

    // env: green ground so car paint reflects a landscape
    const envGround = new THREE.Mesh(new THREE.CircleGeometry(300, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3a5230 }));
    envGround.position.y = -6;
    envScene.add(envGround);

    // signature spots: the steepest downhill run and the viaduct
    let dropI = 0;
    for (let i = 0; i < track.n; i++) if (track.grade[i] < track.grade[dropI]) dropI = i;
    const v3 = new THREE.Vector3(), m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
    return {
      landmark: { s: [dropI * track.step, ...landmarkS], range: 60 },
      obstacles: hazards.list,
      onWreck,
      update(dt, time) {
        for (const m of animated) m.uniforms.uTime.value = time;
        for (const b of balloons) {
          b.position.y = b.userData.base + Math.sin(time * 0.2 + b.userData.ph) * 6;
          b.rotation.y += dt * 0.05;
        }
        for (const sp of animatedMist) sp.material.opacity = 0.35 + 0.2 * Math.sin(time * 0.8 + sp.userData.ph);
        clouds.forEach((t, i) => { t.offset.x = time * 0.0025 * (i ? -1 : 1); t.offset.y = time * 0.0012; });
        if (cable) {
          for (let k = 0; k < 4; k++) {
            const dir = k % 2 ? -1 : 1, c = cable.cables[k % 2];
            const f = ((time * 0.012 + k * 0.25) % 1 + 1) % 1, u = dir > 0 ? f : 1 - f;
            c.getPointAt(u, v3);
            m4.compose(v3, q4.setFromEuler(e4.set(0, cable.head, Math.sin(time * 1.3 + k) * 0.03)), one);
            cable.cabins.setMatrixAt(k, m4);
          }
          cable.cabins.instanceMatrix.needsUpdate = true;
        }
        const ea = time * 0.09;
        eagle.position.set(eagleAt[0] + Math.cos(ea) * 140, eagleY + Math.sin(time * 0.3) * 8, eagleAt[1] + Math.sin(ea) * 140);
        eagle.rotation.set(0, -ea, 0.35);
        eagle.scale.set(2.2, 2.2 * (0.3 + 0.7 * Math.max(0, Math.sin(time * 2.2)) * smooth(0.6, 1, Math.sin(time * 0.25))), 2.2);
        hazards.update(dt);
        if (avalanche) {
          // 9 s of snow pouring down: after a wreck nearby, or every 70 s anyway
          const A = avalanche;
          if (time < A.t0) { A.t0 = -99; A.last = time; } // a new race
          if ((A.want || time - A.last > 70) && time - A.t0 > 9) { A.t0 = time; A.last = time; A.want = false; A.spilled = false; }
          const ph = (time - A.t0) / 9;
          if (!A.spilled && ph > 0.55) {
            A.spilled = true;
            for (let k = 0; k < 3; k++) hazards.spawn('snow', gal.b + 8 + k * 13 + rand() * 6, (rand() - 0.5) * 2 * (hw - 2.5));
          }
          A.pts.visible = ph >= 0 && ph < 1;
          if (A.pts.visible) {
            const P = A.path;
            for (let i = 0; i < A.n; i++) {
              const t = (ph * 1.6 - A.seeds[i * 3] * 0.6);
              if (t < 0 || t > 1) { A.pos[i * 3 + 1] = -999; continue; }
              const f = t * (P.length - 1), k = Math.min(P.length - 2, Math.floor(f)), w = f - k;
              const u = P[k][0] + (P[k + 1][0] - P[k][0]) * w, y = P[k][1] + (P[k + 1][1] - P[k][1]) * w;
              const across = A.seeds[i * 3 + 1] * (26 + Math.max(0, u) * 0.1);
              A.pos[i * 3] = chute.x + chute.ox * u + chute.tx * across;
              A.pos[i * 3 + 1] = y + A.seeds[i * 3 + 2] * 3 + Math.sin(time * 6 + i) * 0.4;
              A.pos[i * 3 + 2] = chute.z + chute.oz * u + chute.tz * across;
            }
            A.pts.geometry.attributes.position.needsUpdate = true;
          }
        }
      },
    };
  },
};
