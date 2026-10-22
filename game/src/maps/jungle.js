// MONSOON JUNGLE: thunderstorm over a rainforest valley, flooded river, temple ruins.
// The road runs through a stepped temple behind a curtain of falling water, jumps the flooded
// river where the old stone bridge washed out and corkscrews through a gate guarded by two
// stone idols. Glyphs glow on the ruins, fireflies drift by the road and vines hang everywhere.
import * as THREE from 'three';
import { LAYOUTS } from './layouts.js';
import { fbm, noise2, makeHeightFn, buildTerrain, terrainLocal, mountainRing } from '../terrain.js';
import { rng, colored, merge, instanced, scatter } from '../scenery.js';
import { waterMaterial } from '../water.js';
import { radialTexture } from '../textures.js';
import { TUNNEL_STYLES } from '../tunnel.js';
import { palmGeometry } from './coast.js';

const WATER_Y = -2;
const riverZ = (x) => 260 * Math.sin(x * 0.0032 + 0.8) + 60 * Math.sin(x * 0.011);
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function natural(x, z) {
  const hills = fbm(x * 0.003 + 2, z * 0.003 - 6, 5) * 90 - 5;
  const r = Math.hypot(x, z);
  const edge = Math.pow(Math.max(0, (r - 700) / 650), 1.5) * 300;
  const dr = Math.abs(z - riverZ(x));
  const channel = Math.min(1, dr / 90);
  return (hills + edge) * (0.25 + 0.75 * channel * channel) - 9 * (1 - channel);
}

function broadleafTree(rand) {
  const parts = [colored(new THREE.CylinderGeometry(0.35, 0.6, 9, 7).translate(0, 4.5, 0), 0x4a3a2a, 0x5a4a34)];
  const greens = [0x1f4a1c, 0x2a5a22, 0x335f26];
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + rand();
    const r = k === 0 ? 0 : 2.4;
    const blob = new THREE.IcosahedronGeometry(2.6 + rand() * 1.4, 1);
    blob.scale(1, 0.7, 1);
    blob.translate(Math.cos(a) * r, 9.5 + rand() * 2.5, Math.sin(a) * r);
    parts.push(colored(blob, greens[k % 3], 0x4a7a30));
  }
  return merge(parts);
}

function templeGeometry() {
  const parts = [];
  for (let i = 0; i < 6; i++) {
    const w = 34 - i * 5;
    parts.push(colored(new THREE.BoxGeometry(w, 4, w).translate(0, 2 + i * 4, 0), i % 2 ? 0x6f7060 : 0x62645a, 0x4f6a3a));
  }
  parts.push(colored(new THREE.BoxGeometry(6, 5, 6).translate(0, 26.5, 0), 0x55574e));
  parts.push(colored(new THREE.BoxGeometry(4, 24, 3).translate(0, 12, 17), 0x5a5c52));
  return merge(parts);
}

// a band of glowing glyphs (emissive canvas) for friezes and the ruins
function glyphTexture(rand) {
  const W = 512, H = 64, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#6dffa8'; g.lineWidth = 3;
  for (let x = 32; x < W; x += 64) {
    const k = Math.floor(rand() * 4), cy = 32;
    g.beginPath();
    if (k === 0) { g.arc(x, cy, 16, 0, Math.PI * 2); g.moveTo(x + 6, cy); g.arc(x, cy, 6, 0, Math.PI * 2); }
    else if (k === 1) { for (let j = -1; j <= 1; j++) { g.moveTo(x - 18, cy + j * 10); g.lineTo(x + 18, cy + j * 10); } }
    else if (k === 2) { g.ellipse(x, cy, 20, 11, 0, 0, Math.PI * 2); g.moveTo(x + 5, cy); g.arc(x, cy, 5, 0, Math.PI * 2); }
    else { g.moveTo(x - 18, cy + 16); g.lineTo(x - 18, cy + 5); g.lineTo(x - 6, cy + 5); g.lineTo(x - 6, cy - 6); g.lineTo(x + 6, cy - 6); g.lineTo(x + 6, cy - 16); g.lineTo(x + 18, cy - 16); }
    g.stroke();
  }
  g.strokeRect(3, 3, W - 6, H - 6);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// water falling (the curtain) or rushing along (the rapids): streaks over a tint
function streamMaterial({ tint, foam, along = false, speed = 2.6, opacity = 0.9 }) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uTint: { value: new THREE.Color(tint) }, uFoam: { value: new THREE.Color(foam) } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform vec3 uTint, uFoam; varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
      void main() {
        vec2 p = ${along ? 'vec2(vUv.x * 26.0, vUv.y * 34.0 - uTime * ' + speed.toFixed(2) + ' * 3.0)' : 'vec2(vUv.x * 30.0, vUv.y * 4.0 + uTime * ' + speed.toFixed(2) + ')'};
        float streak = noise(p) * 0.6 + noise(p * vec2(2.1, 2.3) + 7.0) * 0.4;
        float edge = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
        float f = smoothstep(${along ? '0.62, 0.92' : '0.5, 0.85'}, streak);
        gl_FragColor = vec4(mix(uTint, uFoam, f), (${opacity.toFixed(2)} * (0.55 + 0.45 * streak)) * edge);
      }`,
  });
}

export default {
  id: 'jungle',
  name: 'MONSOON JUNGLE',
  tagline: 'Thunderstorm over the rainforest valley',
  weatherLabel: 'THUNDERSTORM',
  layout: LAYOUTS.jungle,
  exposure: 1.1,
  envIntensity: 0.8,
  bloom: { strength: 0.3, radius: 0.5, threshold: 1.05 },
  fog: { color: 0x3c4640, density: 0.0024 },
  sky: {
    top: 0x161c20, horizon: 0x46524c, bottom: 0x283028,
    sunDir: new THREE.Vector3(0.3, 0.5, -0.4), sunColor: 0x8090a0, sunSize: 0.004, sunIntensity: 0, glow: 0,
    clouds: 1.0, cloudColor: 0x2c3434, horizonSharp: 0.45,
  },
  sun: { color: 0xb0c0cc, intensity: 0.9 },
  hemi: { sky: 0x8a9aa4, ground: 0x2a3a22, intensity: 1.3 },
  smoke: [0.7, 0.74, 0.76],
  headlights: true,
  weather: { type: 'rain', count: 3200, wind: [3, 1], color: 0xa8b8c8, lightning: true, spray: [0.72, 0.76, 0.8] },
  trackStyle: {
    road: { base: '#2a2c2e', line: '#e0e0d8', edge: '#e0e0d8', lanes: 2, roughness: 0.45, wet: true, envIntensity: 1.0, minRough: 0.22, cracks: 1.5, patches: 2, seed: 77 }, // rain-soaked
    kerb: ['#e0c020', '#1a1a1a'],
    barrier: { type: 'wall', color: 0x5a5c52, height: 0.9, glow: [0xffd23f, 0xffd23f], glowIntensity: 1.2 },
    embankment: 0x3a4a2a,
    shoulder: 0x3a3a30,
    shortcut: { color: 0x4d3b28 },
    accent: '#3dff8a',
    rail: { glow: 0x3dff8a, glowIntensity: 2.6, steel: 0x5a5c52, under: 0x2a2c26 },
  },

  build({ scene, track, index, density, envScene, sunDir, jumps = [], rails = [], tunnels = [] }) {
    const rand = rng(555);
    const hw = track.halfWidth, step = track.step;
    const baseHeight = makeHeightFn(index, natural, { hw, near: -1.3, blendStart: 12, blendEnd: 100 });
    const jump = jumps[0] || null, temple = tunnels.find((t) => t.style === 'temple') || null;
    const screw = rails.find((r) => r.kind === 'corkscrew') || null;

    // the river gorge under the washed-out bridge: across the road at the gap, along the river
    let gorge = null;
    if (jump) {
      const m = track.pointAt(track.wrapS(jump.sLip + jump.gap / 2), 0);
      gorge = { x: m.x, z: m.z, y: m.y, dx: m.rx, dz: m.rz, tx: m.tx, tz: m.tz, half: jump.gap / 2, len: 150, floor: WATER_Y - 5 };
      gorge.local = (x, z) => ({ u: (x - gorge.x) * gorge.dx + (z - gorge.z) * gorge.dz, a: (x - gorge.x) * gorge.tx + (z - gorge.z) * gorge.tz });
      gorge.world = (u, a) => [gorge.x + gorge.dx * u + gorge.tx * a, gorge.z + gorge.dz * u + gorge.tz * a];
      gorge.width = (u, a) => gorge.half + smooth(hw + 16, hw + 50, Math.abs(u)) * ((noise2(u * 0.05, a > 0 ? 4.1 : 9.3) - 0.5) * 12 + 6);
    }
    const heightAt = (x, z) => {
      const h = baseHeight(x, z);
      if (!gorge) return h;
      const { u, a } = gorge.local(x, z);
      if (Math.abs(u) > gorge.len) return h;
      const w = gorge.width(u, a);
      const carved = gorge.floor + (h - gorge.floor) * smooth(w - 3, w, Math.abs(a));
      return h + (Math.min(h, carved) - h) * smooth(gorge.len, gorge.len - 40, Math.abs(u));
    };
    const inGorge = (x, z, m = 0) => { if (!gorge) return false; const { u, a } = gorge.local(x, z); return Math.abs(u) < gorge.len && Math.abs(a) < gorge.width(u, a) + m; };
    // keep the forest off the temple, out of the gorge and clear of the idols' gate
    const T = TUNNEL_STYLES.temple;
    const busy = (x, z, m = 0) => {
      if (inGorge(x, z, 6 + m)) return true;
      const n = index.nearest(x, z, 2);
      if (!isFinite(n.dist)) return false;
      const s = n.idx * step;
      if (temple && track.deltaS(temple.a - 12, s) >= 0 && track.deltaS(s, temple.b + 12) >= 0 && n.dist < 64 + m) return true;
      return !!screw && track.deltaS(screw.sA - 10, s) >= 0 && track.deltaS(s, screw.sB + 10) >= 0 && n.dist < 40 + m;
    };

    const moss = new THREE.Color(0x2f5a24), lush = new THREE.Color(0x44782c), mud = new THREE.Color(0x4a3e2c), rock = new THREE.Color(0x55574c);
    const colorAt = (c, x, y, z, ny) => {
      c.copy(moss).lerp(lush, fbm(x * 0.009, z * 0.009, 3));
      if (y < WATER_Y + 2.5) c.lerp(mud, Math.min(1, (WATER_Y + 2.5 - y) / 2));
      if (ny < 0.75) c.lerp(rock, Math.min(1, (0.75 - ny) * 4));
    };
    const terrain = buildTerrain({ size: 3000, res: 230, center: [0, 0], heightAt, colorAt });
    scene.add(terrain);
    // the gorge's walls in finer detail: a patch lined up with it, the coarse ground sunk below
    if (gorge) {
      const w = 2 * (gorge.half + 26), d = 2 * gorge.len;
      const patch = buildTerrain({ size: [w, d], res: [w / 2, d / 2], center: [gorge.x, gorge.z], angle: Math.atan2(gorge.dx, gorge.dz), heightAt, colorAt, material: terrain.material });
      scene.add(patch);
      const p = terrain.geometry.attributes.position, cell = 3000 / 230;
      for (let i = 0; i < p.count; i++) if (terrainLocal(patch, p.getX(i), p.getZ(i)).inset > cell * 0.9) p.setY(i, Math.min(p.getY(i), gorge.floor - 10));
      terrain.geometry.computeVertexNormals();
    }
    scene.add(mountainRing({ inner: 1450, outer: 3800, peak: 520, snowLine: 9999, rock: 0x3c463a, grass: 0x2a4a24, seed: 31, baseY: 0 }));

    const water = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), waterMaterial({
      sunDir, deep: 0x1c2a1c, shallow: 0x3a4a32, skyTop: 0x1c2226, skyHorizon: 0x4a5650, sunColor: 0x8090a0, spec: 0, ripple: 1.5, rain: 1,
    }));
    water.position.y = WATER_Y;
    scene.add(water);
    const animated = [water.material];

    // rainforest
    const treeGeos = [broadleafTree(rand), broadleafTree(rand)];
    const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
    const tb = [[], []];
    scatter(Math.round(1400 * density), rand, [-1250, 1250, -1250, 1250], (x, z) => {
      const d = index.nearest(x, z, 3).dist;
      if (d < hw + 8 || busy(x, z)) return null;
      const y = heightAt(x, z);
      if (y < WATER_Y + 1.5) return null;
      if (d > hw + 90 && rand() < 0.5) return null;
      const s = 0.8 + rand() * 0.7;
      const t = { x, y: y - 0.5, z, ry: rand() * 6.28, s, sy: s * (0.9 + rand() * 0.5) };
      tb[Math.floor(rand() * 2)].push(t);
      return t;
    });
    tb.forEach((b, i) => { if (b.length) scene.add(instanced(treeGeos[i], treeMat, b)); });
    const palms = scatter(Math.round(260 * density), rand, [-1000, 1000, -1000, 1000], (x, z) => {
      const d = index.nearest(x, z, 2).dist;
      if (d < hw + 5 || d > hw + 45 || busy(x, z)) return null;
      const y = heightAt(x, z);
      return y > WATER_Y + 1 ? { x, y: y - 0.2, z, ry: rand() * 6.28, s: 0.7 + rand() * 0.5 } : null;
    });
    scene.add(instanced(palmGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide }), palms));

    // ferns / undergrowth
    const ferns = scatter(Math.round(900 * density), rand, [-1000, 1000, -1000, 1000], (x, z) => {
      const d = index.nearest(x, z, 2).dist;
      if (d < hw + 3.5 || d > hw + 70 || busy(x, z, -20)) return null;
      const y = heightAt(x, z);
      if (y < WATER_Y + 1) return null;
      const s = 0.6 + rand() * 1.2;
      return { x, y: y, z, ry: rand() * 6.28, sx: s * 1.6, sy: s * 0.8, sz: s * 1.6 };
    });
    scene.add(instanced(colored(new THREE.IcosahedronGeometry(1, 0), 0x2a5a20, 0x4a8a30), treeMat, ferns, { cast: false }));

    const glyphMat = new THREE.MeshBasicMaterial({ map: glyphTexture(rand), color: new THREE.Color(0xffffff).multiplyScalar(1.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const vineGeo = merge([colored(new THREE.CylinderGeometry(0.12, 0.08, 1, 5).translate(0, -0.5, 0), 0x2a4a1c), colored(new THREE.IcosahedronGeometry(0.5, 0).scale(1.4, 0.6, 1.4).translate(0, -0.6, 0), 0x3a6a26)]);
    const vineMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    const vines = []; // { x, y (top), z, len }
    const addVine = (x, y, z, len) => vines.push({ x, y, z, ry: rand() * 6.28, sx: 1, sy: len, sz: 1, rx: (rand() - 0.5) * 0.12 });

    // temple ruins in the forest, glyphs glowing round their bases
    const temples = scatter(3, rand, [-1000, 1000, -1000, 1000], (x, z) => {
      const d = index.nearest(x, z, 4).dist;
      if (d < hw + 70 || d > 400 || busy(x, z, 30)) return null;
      const y = heightAt(x, z);
      return y > WATER_Y + 2 ? { x, y: y - 2, z, ry: rand() * 6.28, s: 0.9 + rand() * 0.5 } : null;
    }, 4000);
    scene.add(instanced(templeGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true }), temples, { receive: true }));
    for (const t of temples) {
      for (let k = 0; k < 4; k++) {
        const a = t.ry + (k * Math.PI) / 2, r = 17.05 * t.s;
        const p = new THREE.Mesh(new THREE.PlaneGeometry(30 * t.s, 3.6 * t.s), glyphMat);
        p.position.set(t.x + Math.sin(a) * r, t.y + 2 + 2 * t.s, t.z + Math.cos(a) * r);
        p.rotation.y = a;
        scene.add(p);
        for (let v = 0; v < 5; v++) addVine(t.x + Math.sin(a) * r + Math.cos(a) * (rand() - 0.5) * 28 * t.s, t.y + 8 * t.s, t.z + Math.cos(a) * r - Math.sin(a) * (rand() - 0.5) * 28 * t.s, 3 + rand() * 5);
      }
    }

    // broken pillars by the road, a glowing band round some
    const pillars = scatter(Math.round(40 * density) + 6, rand, [-1000, 1000, -1000, 1000], (x, z) => {
      const d = index.nearest(x, z, 2).dist;
      if (d < hw + 5 || d > hw + 25 || busy(x, z)) return null;
      return { x, y: heightAt(x, z) - 0.3, z, ry: rand() * 6.28, sx: 1, sy: 0.4 + rand() * 1.2, sz: 1, rz: (rand() - 0.5) * 0.3 };
    });
    const stoneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    scene.add(instanced(colored(new THREE.CylinderGeometry(0.9, 1.0, 6, 8).translate(0, 3, 0), 0x6a6c60, 0x4a6a3a), stoneMat, pillars));
    const bands = pillars.filter(() => rand() < 0.5).map((p) => ({ x: p.x, y: p.y + 1.5 * p.sy, z: p.z, ry: p.ry, rz: p.rz }));
    scene.add(instanced(new THREE.CylinderGeometry(1.0, 1.04, 0.5, 8, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3dff8a).multiplyScalar(1.6) }), bands, { cast: false }));

    const stone = new THREE.MeshStandardMaterial({ color: 0x6a6c60, roughness: 0.95, flatShading: true });

    // --- the temple: a waterfall over its door, glyph friezes, torches, vines ---------------
    if (temple) {
      const W = hw + T.width, H = T.height;
      const curtain = streamMaterial({ tint: 0x7a9a90, foam: 0xe8f4f0, speed: 2.4, opacity: 0.7 });
      animated.push(curtain);
      const mist = radialTexture('rgba(220,240,235,0.7)', 'rgba(220,240,235,0)', 64);
      const spray = [];
      for (const [s, dir] of [[temple.a, -1], [temple.b, 1]]) {
        const P = track.pointAt(track.wrapS(s + dir * 2.6), 0);
        // friezes across the facade: over the door and on two terraces above it
        for (const [y, w] of [[H + 3.2, W * 2.4], [18, 66], [26, 44]]) {
          const fr = new THREE.Mesh(new THREE.PlaneGeometry(w, 3.2), glyphMat);
          fr.position.set(P.x, P.y + y, P.z);
          fr.rotation.y = P.heading;
          scene.add(fr);
        }
        // torches either side of the door
        for (const sd of [-1, 1]) {
          const q = track.pointAt(track.wrapS(s + dir * 1.5), sd * (W + 2.5));
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 3.4, 6).translate(0, 1.7, 0), stone);
          post.position.set(q.x, q.y, q.z);
          scene.add(post);
          const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,200,90,1)', 'rgba(255,90,20,0)', 64), color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
          flame.position.set(q.x, q.y + 4, q.z);
          flame.scale.setScalar(3);
          flame.userData.ph = rand() * 6;
          scene.add(flame);
          spray.push({ sprite: flame, flame: true });
        }
        for (let k = 0; k < 8; k++) {
          const q = track.pointAt(track.wrapS(s + dir * (2 + rand() * 2)), (rand() - 0.5) * 2.4 * W);
          addVine(q.x, q.y + H + 6 + rand() * 8, q.z, 3 + rand() * 6);
        }
        if (dir > 0) continue;
        // water pouring off the terrace over the entrance: drive through it
        const fall = new THREE.Mesh(new THREE.PlaneGeometry(W * 2 + 2, H + 6, 1, 6), curtain);
        fall.position.set(P.x - P.tx * 1.2, P.y + (H + 6) / 2 - 0.4, P.z - P.tz * 1.2);
        fall.rotation.y = P.heading;
        scene.add(fall);
        for (let k = 0; k < 7; k++) {
          const q = track.pointAt(track.wrapS(s - 2 - rand() * 3), (rand() - 0.5) * 2 * W);
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: mist, transparent: true, opacity: 0.5, depthWrite: false }));
          sp.position.set(q.x, q.y + 1 + rand() * 2, q.z);
          sp.scale.setScalar(6 + rand() * 5);
          sp.userData.ph = rand() * 6;
          scene.add(sp);
          spray.push({ sprite: sp });
        }
      }
      // vines down the terraces along its sides
      for (let s = temple.a + 6; s < temple.b - 4; s += 9) for (const sd of [-1, 1]) {
        const [lat, top] = [[36, 22], [47, 14], [25, 30]][Math.floor(rand() * 3)];
        const q = track.pointAt(track.wrapS(s), sd * lat);
        addVine(q.x, q.y + top, q.z, 3 + rand() * 6);
      }
      temple.spray = spray;
    }

    // --- the washed-out bridge: stone decks to the broken ends, piers, the span in the river --
    if (jump && gorge) {
      const bridge = jump.spec.bridge ?? 40;
      const deckRows = (s0, s1) => {
        const pos = [], idx = [];
        let n = 0;
        for (let s = s0; s <= s1 + 1e-6; s += 2, n++) {
          const p = track.pointAt(track.wrapS(s), 0), up = jump.lift(s) > 0 ? jump.lift(s) : 0;
          for (const [lat, h] of [[-(hw + 1.3), -0.25], [-(hw + 1.3), -2.4], [hw + 1.3, -2.4], [hw + 1.3, -0.25]]) pos.push(p.x + p.rx * lat, p.y + up + h, p.z + p.rz * lat);
          if (s + 2 <= s1 + 1e-6) for (let k = 0; k < 3; k++) { const a = n * 4 + k, b = a + 1, c = a + 4, d = c + 1; idx.push(a, c, b, b, c, d); }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x6a6c60, roughness: 0.95, side: THREE.DoubleSide }));
        m.castShadow = m.receiveShadow = true;
        scene.add(m);
      };
      deckRows(jump.sRamp - bridge, jump.sLip);
      deckRows(jump.sLand, jump.sLand + bridge);
      const piers = [];
      for (const [s0, s1] of [[jump.sRamp - bridge, jump.sLip - 4], [jump.sLand + 4, jump.sLand + bridge]]) {
        for (let s = s0 + 4; s <= s1; s += 16) {
          const p = track.pointAt(track.wrapS(s), 0), top = p.y - 2.3 + Math.max(0, jump.lift(s));
          const bottom = Math.min(heightAt(p.x, p.z), WATER_Y) - 2;
          if (top - bottom > 1) piers.push({ x: p.x, y: bottom, z: p.z, ry: p.heading, sx: track.width * 0.8, sy: top - bottom, sz: 3.2 });
        }
      }
      scene.add(instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), stone, piers, { receive: true }));
      // jagged blocks at the broken ends, the fallen span and its pier down in the flood
      const blocks = [];
      for (const [s, h, dir] of [[jump.sLip, jump.h, 1], [jump.sLand, 0, -1]]) {
        const p = track.pointAt(track.wrapS(s), 0);
        for (let k = 0; k < 12; k++) {
          const lat = (rand() - 0.5) * 2 * (hw + 0.8), q = track.pointAt(track.wrapS(s + dir * (0.6 + rand() * 1.6)), lat);
          blocks.push({ x: q.x, y: p.y + h - 1.6 - rand() * 2.2, z: q.z, ry: p.heading + (rand() - 0.5) * 0.6, rx: (rand() - 0.5) * 0.6, sx: 1.2 + rand() * 1.6, sy: 0.9 + rand() * 1.4, sz: 1 + rand() * 1.8 });
        }
      }
      for (let k = 0; k < 10; k++) {
        const [x, z] = gorge.world((rand() - 0.5) * 60, (rand() - 0.5) * 34);
        blocks.push({ x, y: WATER_Y - 0.4, z, rx: rand(), ry: rand() * 6, rz: rand(), sx: 2 + rand() * 3, sy: 1.2 + rand() * 1.5, sz: 2 + rand() * 3 });
      }
      scene.add(instanced(new THREE.BoxGeometry(1, 1, 1), stone, blocks));
      const mid = track.pointAt(track.wrapS(jump.sLip + jump.gap / 2), 0);
      const span = new THREE.Mesh(new THREE.BoxGeometry(track.width + 2.6, 2.2, 22), stone);
      span.position.set(mid.x + mid.rx * 6, WATER_Y + 0.6, mid.z + mid.rz * 6);
      span.rotation.set(0.32, mid.heading + 0.25, 0.12, 'YXZ');
      span.castShadow = true;
      scene.add(span);
      const fallen = new THREE.Mesh(new THREE.BoxGeometry(track.width * 0.8, 3.2, 14), stone);
      fallen.position.set(mid.x - mid.rx * 14 + mid.tx * 8, WATER_Y + 0.4, mid.z - mid.rz * 14 + mid.tz * 8);
      fallen.rotation.set(Math.PI / 2 - 0.2, mid.heading + 1.1, 0, 'YXZ');
      scene.add(fallen);
      // the flood racing through the gorge
      const rapids = new THREE.Mesh(new THREE.PlaneGeometry(gorge.half * 2 - 2, gorge.len * 2, 1, 1).rotateX(-Math.PI / 2), streamMaterial({ tint: 0x4a4a32, foam: 0xd8dcc8, along: true, speed: 2.2, opacity: 0.85 }));
      rapids.position.set(gorge.x, WATER_Y + 0.12, gorge.z);
      rapids.rotation.y = Math.atan2(gorge.dx, gorge.dz);
      scene.add(rapids);
      animated.push(rapids.material);
    }

    // --- the idols' gate over the corkscrew: two stone guardians with glowing eyes -----------
    let eyes = null;
    if (screw) {
      const P = track.pointAt(track.wrapS(screw.s0 + screw.span / 2), 0);
      const gate = new THREE.Group();
      const blockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
      const parts = [];
      for (const sd of [-1, 1]) {
        for (let k = 0; k < 7; k++) {
          const w = 9 - (k % 2) * 0.8;
          parts.push(colored(new THREE.BoxGeometry(w, 4.6, w).translate(sd * 26 + (rand() - 0.5) * 0.6, 2.3 + k * 4.6, (rand() - 0.5) * 0.6), k % 2 ? 0x62645a : 0x6f7062, 0x4f6a3a));
        }
        // the guardian's head on top: brow, nose, mouth
        parts.push(colored(new THREE.BoxGeometry(11, 13, 10).translate(sd * 26, 38.7, 0), 0x6a6c5e));
        parts.push(colored(new THREE.BoxGeometry(12, 2, 11).translate(sd * 26, 42.6, 0.4), 0x55574c));
        parts.push(colored(new THREE.BoxGeometry(2.2, 4, 2).translate(sd * 26, 38.4, -5.6), 0x5a5c50));
        parts.push(colored(new THREE.BoxGeometry(6, 1.6, 1).translate(sd * 26, 34.6, -5.2), 0x22241e));
        parts.push(colored(new THREE.BoxGeometry(14, 3, 12).translate(sd * 26, 46.2, 0), 0x55574c)); // headdress
      }
      parts.push(colored(new THREE.BoxGeometry(66, 6, 9).translate(0, 50.7, 0), 0x62645a, 0x4a6a3a)); // lintel
      const gm = new THREE.Mesh(merge(parts), blockMat);
      gm.castShadow = gm.receiveShadow = true;
      gate.add(gm);
      const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x3dff8a).multiplyScalar(2.6) });
      const eyeList = [];
      for (const sd of [-1, 1]) for (const e of [-2.4, 2.4]) eyeList.push({ x: sd * 26 + e, y: 40.6, z: -5.05 });
      eyes = instanced(new THREE.BoxGeometry(1.8, 1, 0.3), eyeMat, eyeList, { cast: false });
      gate.add(eyes);
      for (const sd of [-1, 1]) {
        const band = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 26), glyphMat);
        band.position.set(sd * (26 - 4.7 * sd), 16, 0);
        band.rotation.y = (sd * Math.PI) / 2;
        gate.add(band);
      }
      const frieze = new THREE.Mesh(new THREE.PlaneGeometry(60, 4), glyphMat);
      frieze.position.set(0, 50.7, -4.6);
      gate.add(frieze);
      gate.position.set(P.x, P.y - 0.6, P.z);
      gate.rotation.y = P.heading; // the guardians face the oncoming cars
      scene.add(gate);
      // vines off the lintel
      for (let k = 0; k < 16; k++) {
        const lx = (rand() - 0.5) * 60, lz = (rand() - 0.5) * 8;
        const c = Math.cos(gate.rotation.y), s = Math.sin(gate.rotation.y);
        addVine(P.x + lx * c + lz * s, P.y + 47.5, P.z - lx * s + lz * c, 4 + rand() * 9);
      }
    }
    scene.add(instanced(vineGeo, vineMat, vines, { cast: false }));

    // --- fireflies drifting by the road -----------------------------------------------------
    const nF = Math.round(420 * Math.max(0.5, density));
    const fBase = new Float32Array(nF * 4), fPos = new Float32Array(nF * 3);
    for (let i = 0; i < nF; i++) {
      const s = rand() * track.length, lat = (rand() < 0.5 ? -1 : 1) * (hw + 3 + rand() * 30);
      const p = track.pointAt(s, lat);
      fBase[i * 4] = p.x; fBase[i * 4 + 1] = heightAt(p.x, p.z) + 1 + rand() * 5; fBase[i * 4 + 2] = p.z; fBase[i * 4 + 3] = rand() * 100;
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(fPos, 3));
    const flies = new THREE.Points(fg, new THREE.PointsMaterial({ map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 32), color: 0xc8ff5a, size: 0.9, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    flies.frustumCulled = false;
    scene.add(flies);

    const envGround = new THREE.Mesh(new THREE.CircleGeometry(300, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1e2a1c }));
    envGround.position.y = -6;
    envScene.add(envGround);

    // signature spots: where the road crosses the river
    const cross = [];
    for (let i = 0; i < track.n; i++) {
      const d = Math.abs(track.z[i] - riverZ(track.x[i]));
      const dp = Math.abs(track.z[(i - 1 + track.n) % track.n] - riverZ(track.x[(i - 1 + track.n) % track.n]));
      const dn = Math.abs(track.z[(i + 1) % track.n] - riverZ(track.x[(i + 1) % track.n]));
      if (d < 20 && d <= dp && d <= dn) cross.push(i * track.step);
    }
    return {
      landmark: { s: cross, range: 45 },
      update(dt, time) {
        for (const m of animated) m.uniforms.uTime.value = time;
        for (let i = 0; i < nF; i++) {
          const ph = fBase[i * 4 + 3];
          fPos[i * 3] = fBase[i * 4] + Math.sin(time * 0.6 + ph) * 2.2;
          fPos[i * 3 + 1] = fBase[i * 4 + 1] + Math.sin(time * 0.9 + ph * 1.7) * 0.8;
          fPos[i * 3 + 2] = fBase[i * 4 + 2] + Math.cos(time * 0.5 + ph * 0.7) * 2.2;
        }
        fg.attributes.position.needsUpdate = true;
        flies.material.opacity = 0.7 + 0.3 * Math.sin(time * 2.3);
        if (temple && temple.spray) for (const p of temple.spray) {
          if (p.flame) p.sprite.scale.setScalar(2.6 + Math.sin(time * 13 + p.sprite.userData.ph) * 0.4);
          else p.sprite.material.opacity = 0.35 + 0.2 * Math.sin(time * 1.4 + p.sprite.userData.ph);
        }
        if (eyes) eyes.material.color.set(0x3dff8a).multiplyScalar(2.2 + Math.sin(time * 1.6) * 0.8);
      },
    };
  },
};
