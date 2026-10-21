// MAGMA CORE: a ring road on the floor of a live volcano's caldera. A lake of molten lava fills
// the middle, lava falls pour down the crater walls, ash plumes rise into a smoky red sky, and
// the road dives through two lava-tube tunnels and climbs a loop-the-loop on the north straight.
import * as THREE from 'three';
import { LAYOUTS, VOLCANO, LAYOUT_SCALE } from './layouts.js';
import { fbm, noise2, makeHeightFn, buildTerrain, mountainRing } from '../terrain.js';
import { rng, colored, instanced, scatter } from '../scenery.js';
import { addWorldDetail } from '../detail.js';
import { radialTexture } from '../textures.js';

const LAKE = { x: VOLCANO.lake.x * LAYOUT_SCALE, z: VOLCANO.lake.z * LAYOUT_SCALE, rx: VOLCANO.lake.rx * LAYOUT_SCALE, rz: VOLCANO.lake.rz * LAYOUT_SCALE };
const LAVA_Y = VOLCANO.roadY - 5.5;
const WALL = { rx: 1050, rz: 780 }; // the crater wall rises beyond this ellipse
const ENV = 0.8; // reflections (dimmed in the tunnels)
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lakeE = (x, z) => Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);

// Molten lava: drifting dark crust plates with glowing seams, brighter where it is molten.
// mode 0 = world-space pool (flows along uDir), 1 = a fall (flows down its uv.y)
function lavaMaterial({ scale = 0.02, flow = 0.6, dir = [1, 0.4], heat = 1, mode = 0 } = {}) {
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uScale: { value: scale }, uFlow: { value: flow }, uDir: { value: new THREE.Vector2(...dir) }, uHeat: { value: heat }, uMode: { value: mode },
    }]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uTime, uScale, uFlow, uHeat, uMode;
      uniform vec2 uDir;
      varying vec3 vWorld;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 1.7; a *= 0.5; } return v; }
      void main() {
        vec2 p = uMode > 0.5 ? vec2(vUv.x * 3.0, vUv.y * 9.0 - uTime * uFlow) : vWorld.xz * uScale + uDir * uTime * uFlow * 0.05;
        vec2 q = vec2(fbm(p + vec2(0.0, uTime * 0.04)), fbm(p + vec2(5.2, 1.3) - uTime * 0.03));
        float n = fbm(p + 2.2 * q);
        float seam = smoothstep(0.46, 0.5, n) * (1.0 - smoothstep(0.5, 0.56, n));
        float molten = smoothstep(0.5, 0.3, n);
        // kept low and red: ACES turns bright orange beige; only the seams run hot enough to bloom
        vec3 crust = vec3(0.07, 0.03, 0.022) * (0.6 + q.y);
        vec3 hot = mix(vec3(0.62, 0.07, 0.01), vec3(0.75, 0.2, 0.025), q.x) * uHeat;
        float k = clamp(molten, 0.0, 1.0);
        if (uMode > 0.5) k = clamp(k + 0.35, 0.0, 1.0); // falls run hotter
        vec3 col = mix(crust, hot, k) * (0.88 + 0.18 * sin(uTime * 1.4 + n * 14.0));
        col += vec3(1.0, 0.32, 0.04) * seam * 1.3 * uHeat;
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }
    `,
  });
}

// Dark rock with bright lava veins, for the tunnel walls (map) and their glow (emissive map).
function veinTextures() {
  const S = 512;
  const rock = document.createElement('canvas'), glow = document.createElement('canvas');
  rock.width = rock.height = glow.width = glow.height = S;
  const g = rock.getContext('2d'), e = glow.getContext('2d');
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = 22 + fbm(x / 40, y / 40, 4) * 40;
    const i = (y * S + x) * 4;
    img.data[i] = v + 6; img.data[i + 1] = v; img.data[i + 2] = v - 2; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  e.fillStyle = '#000';
  e.fillRect(0, 0, S, S);
  const rand = rng(57);
  const veins = [];
  for (let k = 0; k < 9; k++) {
    let x = rand() * S, y = rand() * S, a = rand() * Math.PI * 2;
    const pts = [[x, y]];
    for (let j = 0; j < 14; j++) { a += (rand() - 0.5) * 1.1; x += Math.cos(a) * 22; y += Math.sin(a) * 22; pts.push([x, y]); }
    veins.push(pts);
  }
  // the same veins on both: dark rock with orange lines, black with the glow
  for (const [ctx, color] of [[g, '#ff7a20'], [e, '#ffa040']]) {
    ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const pts of veins) { ctx.beginPath(); pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
  }
  const out = [rock, glow].map((c) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; });
  return { map: out[0], emissive: out[1] };
}

// Branching crack of glowing lava for the ground (alpha in the red channel's shape).
function crackTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rand = rng(11);
  g.lineCap = 'round';
  const branch = (x, y, a, len, w) => {
    if (w < 0.8 || len < 6) return;
    g.lineWidth = w;
    g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 6; j++) { a += (rand() - 0.5) * 0.8; x += Math.cos(a) * len / 6; y += Math.sin(a) * len / 6; g.lineTo(x, y); }
    g.stroke();
    branch(x, y, a + 0.6, len * 0.6, w * 0.65);
    branch(x, y, a - 0.6, len * 0.55, w * 0.6);
  };
  g.shadowColor = '#ff6a10'; g.shadowBlur = 10;
  g.strokeStyle = '#ffb060';
  branch(20, S / 2, 0, 150, 7);
  branch(S - 20, S / 2, Math.PI, 120, 5);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default {
  id: 'volcano',
  name: 'MAGMA CORE',
  tagline: 'Lava tubes and a loop inside a live volcano',
  weatherLabel: 'ERUPTING',
  layout: LAYOUTS.volcano,
  exposure: 1.12,
  envIntensity: ENV,
  bloom: { strength: 0.45, radius: 0.55, threshold: 0.95 },
  fog: { color: 0x3c1c12, density: 0.0008 },
  sky: {
    top: 0x1c0c0c, horizon: 0xd8582a, bottom: 0x3a1408,
    sunDir: new THREE.Vector3(0.32, 0.82, 0.3), sunColor: 0xff7a40, sunSize: 0.0018, sunIntensity: 2.2, glow: 0.6,
    clouds: 0.8, cloudColor: 0x3a2622, horizonSharp: 0.55,
  },
  sun: { color: 0xffb488, intensity: 3.0 },
  hemi: { sky: 0x8a5e52, ground: 0xff6a2a, intensity: 1.35 },
  smoke: [0.32, 0.28, 0.26],
  weather: { type: 'embers', count: 900, wind: [1.5, 0.6], color: 0xff7a2a },
  trackStyle: {
    road: { base: '#2c2826', line: '#ffb020', edge: '#ff6a1a', lanes: 2, roughness: 0.82, cracks: 1.6, patches: 1, wear: 0.45, aggregate: 1.15, seed: 141 }, // basalt asphalt
    kerb: ['#ff4a12', '#141010'],
    barrier: { type: 'wall', color: 0x2a2422, height: 1.0, glow: [0xff5a14, 0xff5a14], glowIntensity: 2.4 },
    embankment: 0x1e1a18,
    shoulder: 0x2a2220,
    shortcut: { color: 0x3a2a24, guide: 0xffa040, studs: 0xff6a20 },
    loop: { glow: 0xff7a1a, glowIntensity: 2.6, steel: 0x3a3a42, under: 0x202026 },
    accent: '#ff5a14',
  },

  build({ scene, track, index, density, envScene, loops = [], tunnels = [] }) {
    const rand = rng(909);
    const hw = track.halfWidth;

    // rock ridges running out from each tunnel to the crater wall: the road cuts through them
    const ridges = tunnels.map(([a, b]) => {
      const m = track.pointAt((a + b) / 2, 0);
      let ox = m.x - LAKE.x, oz = m.z - LAKE.z;
      const l = Math.hypot(ox, oz) || 1;
      ox /= l; oz /= l;
      return { x0: m.x - ox * 60, z0: m.z - oz * 60, ox, oz, len: 700 };
    });
    const ridgeH = (x, z) => {
      let h = 0;
      for (const r of ridges) {
        const t = Math.max(0, Math.min(r.len, (x - r.x0) * r.ox + (z - r.z0) * r.oz));
        const d = Math.hypot(x - (r.x0 + r.ox * t), z - (r.z0 + r.oz * t));
        h = Math.max(h, (48 + t * 0.12) * Math.exp(-((d / 130) ** 2)) * smooth(0, 60, t + 30));
      }
      return h;
    };
    const natural = (x, z) => {
      // caldera floor: rough old flows, sinking under the lava toward the lake
      let h = VOLCANO.roadY - 6 + fbm(x * 0.008, z * 0.008, 4) * 9;
      const e = lakeE(x, z);
      if (e < 1.3) h = (LAVA_Y - 6) + (h - (LAVA_Y - 6)) * smooth(0.94, 1.3, e);
      // the crater wall
      const rho = Math.hypot(x / WALL.rx, z / WALL.rz);
      if (rho > 0.95) h += Math.pow(rho - 0.95, 1.1) * 1500 * (0.7 + fbm(x * 0.003, z * 0.003, 4) * 0.6);
      return h + ridgeH(x, z);
    };
    const heightAt = makeHeightFn(index, natural, { hw, near: -1.2, blendStart: 12, blendEnd: 90 });

    const basalt = new THREE.Color(0x3a302c), ash = new THREE.Color(0x6a564c), scorch = new THREE.Color(0x7a3a22), cliff = new THREE.Color(0x4a3a34);
    scene.add(buildTerrain({
      size: 3000, res: 220, center: [0, 0], heightAt,
      colorAt: (c, x, y, z, ny) => {
        c.copy(basalt).lerp(ash, fbm(x * 0.01, z * 0.01, 3) * 0.8);
        const e = lakeE(x, z);
        if (e < 1.35) c.lerp(scorch, (1 - smooth(1.0, 1.35, e)) * 0.7); // baked red near the lava
        if (ny < 0.75) c.lerp(cliff, Math.min(1, (0.75 - ny) * 3));
      },
    }));
    scene.add(mountainRing({ inner: 1450, outer: 3600, peak: 380, snowLine: 9999, rock: 0x2a2220, grass: 0x3a2a24, seed: 21, baseY: 420 }));

    // the lava lake and its glow
    const animated = [];
    const lakeMat = lavaMaterial({ scale: 0.018, flow: 0.5, dir: [1, 0.3] });
    animated.push(lakeMat);
    const lake = new THREE.Mesh(new THREE.CircleGeometry(1, 96).rotateX(-Math.PI / 2), lakeMat);
    lake.scale.set(LAKE.rx * 1.25, 1, LAKE.rz * 1.25);
    lake.position.set(LAKE.x, LAVA_Y, LAKE.z);
    scene.add(lake);

    // lava falls down the crater wall, each ending in a pool
    const fallMat = lavaMaterial({ mode: 1, flow: 0.9, heat: 1.15 });
    animated.push(fallMat);
    for (const th of [-2.3, -1.1, 0.35, 1.5, 2.6]) {
      const dx = Math.cos(th) * WALL.rx, dz = Math.sin(th) * WALL.rz;
      const pos = [], uv = [], idx = [];
      const steps = 40;
      const along = [-Math.sin(th), Math.cos(th)];
      for (let i = 0; i <= steps; i++) {
        const rho = 1.3 - (i / steps) * 0.36; // from high up the wall down to its foot
        const cx = dx * rho, cz = dz * rho;
        const w = 9 + (i / steps) * 10;
        for (const sd of [-1, 1]) {
          const x = cx + along[0] * w * sd, z = cz + along[1] * w * sd;
          pos.push(x, heightAt(x, z) + 3, z);
          uv.push(sd < 0 ? 0 : 1, i / steps);
        }
        if (i < steps) { const p = i * 2; idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      const fall = new THREE.Mesh(g, fallMat);
      fall.material.side = THREE.DoubleSide;
      scene.add(fall);
      const px = dx * 0.93, pz = dz * 0.93;
      const pool = new THREE.Mesh(new THREE.CircleGeometry(34, 32).rotateX(-Math.PI / 2), lakeMat);
      pool.position.set(px, heightAt(px, pz) + 0.6, pz);
      if (index.nearest(px, pz, 3).dist > hw + 50) scene.add(pool);
    }

    // glowing cracks across the caldera floor (never on a road)
    const crackMat = new THREE.MeshBasicMaterial({ map: crackTexture(), color: new THREE.Color(0xff6a20).multiplyScalar(2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const cracks = scatter(Math.round(260 * density) + 40, rand, [-1000, 1000, -800, 800], (x, z) => {
      const d = index.nearest(x, z, 3).dist;
      if (d < hw + 14 || lakeE(x, z) < 1.05 || Math.hypot(x / WALL.rx, z / WALL.rz) > 0.97) return null;
      const s = 10 + rand() * 30, a = rand() * 6.28;
      // only where the ground is flat enough for a decal
      const y0 = heightAt(x, z), y1 = heightAt(x + Math.cos(a) * s * 0.5, z + Math.sin(a) * s * 0.5), y2 = heightAt(x - Math.cos(a) * s * 0.5, z - Math.sin(a) * s * 0.5);
      if (Math.abs(y1 - y0) > 1.2 || Math.abs(y2 - y0) > 1.2) return null;
      return { x, y: y0 + 0.25, z, ry: a, s };
    });
    scene.add(instanced(new THREE.PlaneGeometry(1, 0.5).rotateX(-Math.PI / 2), crackMat, cracks, { cast: false }));

    // basalt boulders and spires, obsidian shards near the lava
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
    const rocks = scatter(Math.round(420 * density) + 60, rand, [-1100, 1100, -850, 850], (x, z) => {
      const d = index.nearest(x, z, 3).dist;
      const spire = rand() < 0.25;
      const s = spire ? 3 + rand() * 4 : 1.5 + rand() * rand() * 9;
      if (d < hw + 8 + s * 1.5 || lakeE(x, z) < 1.02) return null;
      return { x, y: heightAt(x, z) - s * 0.3, z, rx: rand() * 0.4, ry: rand() * 6.28, sx: s, sy: spire ? s * (3 + rand() * 4) : s * (0.6 + rand() * 0.5), sz: s * (0.7 + rand() * 0.6) };
    });
    scene.add(instanced(colored(new THREE.IcosahedronGeometry(1, 1), 0x1a1614, 0x3a302c), rockMat, rocks, { receive: true }));
    const shards = scatter(Math.round(160 * density) + 20, rand, [-700, 700, -500, 500], (x, z) => {
      const e = lakeE(x, z);
      if (e < 1.0 || e > 1.4 || index.nearest(x, z, 3).dist < hw + 10) return null;
      const s = 0.8 + rand() * 2.2;
      return { x, y: heightAt(x, z) - 0.3, z, rx: (rand() - 0.5) * 0.7, ry: rand() * 6.28, rz: (rand() - 0.5) * 0.7, sx: s * 0.6, sy: s * 2.4, sz: s * 0.6 };
    });
    scene.add(instanced(new THREE.OctahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x0a0a10, roughness: 0.12, metalness: 0.4, flatShading: true }), shards));

    // the tunnels: lava tubes with glowing veins, lava gutters and lamps
    const vt = veinTextures();
    const innerMat = new THREE.MeshStandardMaterial({ map: vt.map, emissiveMap: vt.emissive, emissive: new THREE.Color(0xff7a2a), emissiveIntensity: 1.7, roughness: 0.9, side: THREE.DoubleSide });
    const outerMat = addWorldDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true, side: THREE.DoubleSide }), { fine: [0.25, 0.5], macro: [0.02, 0.3], rough: 0.1, triplanar: true });
    const gutterMat = lavaMaterial({ scale: 0.25, flow: 2.5, dir: [0.6, 1], heat: 1.2 });
    animated.push(gutterMat);
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd0a0).multiplyScalar(4) });
    const lamps = [];
    const N = 22;
    const innerAt = (k) => {
      const a = Math.PI * (1 - k / N), c = Math.cos(a), s = Math.abs(Math.sin(a));
      return [(hw + 3) * Math.sign(c) * Math.pow(Math.abs(c), 0.55), -1.6 + 12.6 * Math.pow(s, 0.7)];
    };
    const outerAt = (k) => {
      const a = Math.PI * (1 - k / N), c = Math.cos(a), s = Math.abs(Math.sin(a));
      return [62 * Math.sign(c) * Math.pow(Math.abs(c), 0.9), -7 + 34 * Math.pow(s, 1.25)];
    };
    const rockCol = new THREE.Color(), rockA = new THREE.Color(0x1e1816), rockB = new THREE.Color(0x3a2e2a);
    for (const [sa, sb] of tunnels) {
      const ia = Math.floor(sa / track.step), ib = Math.ceil(sb / track.step);
      const rows = [];
      for (let i = ia; i <= ib; i += 2) rows.push(((i % track.n) + track.n) % track.n);
      const inner = [], outer = [], inUv = [], outCol = [];
      rows.forEach((i, r) => {
        const x = track.x[i], y = track.y[i], z = track.z[i], rx = track.rx[i], rz = track.rz[i];
        for (let k = 0; k <= N; k++) {
          const [li, hi] = innerAt(k);
          const j = noise2(i * 0.15, k * 0.9) - 0.5;
          inner.push(x + rx * (li + j * 0.6 * Math.sign(li)), y + hi + j * 0.4, z + rz * (li + j * 0.6 * Math.sign(li)));
          inUv.push(k / N * 2.5, r * 2 * track.step / 16);
          const [lo, ho] = outerAt(k);
          const ox = x + rx * lo, oz = z + rz * lo;
          const bump = (fbm(ox * 0.03, oz * 0.03, 3) - 0.5) * 14;
          outer.push(ox + rx * bump * 0.3, y + ho + bump, oz + rz * bump * 0.3);
          rockCol.copy(rockA).lerp(rockB, fbm(ox * 0.02, oz * 0.02, 2));
          outCol.push(rockCol.r, rockCol.g, rockCol.b);
        }
        if (r % 6 === 3) lamps.push({ x, y: y + 10.4, z, ry: Math.atan2(track.tx[i], track.tz[i]) });
      });
      const strip = (pos, extra) => {
        const idx = [];
        for (let r = 0; r < rows.length - 1; r++) for (let k = 0; k < N; k++) {
          const a = r * (N + 1) + k, b = a + 1, c = a + N + 1, d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        for (const [k, v, n] of extra) g.setAttribute(k, new THREE.Float32BufferAttribute(v, n));
        g.setIndex(idx);
        g.computeVertexNormals();
        return g;
      };
      const tin = new THREE.Mesh(strip(inner, [['uv', inUv, 2]]), innerMat);
      tin.receiveShadow = true;
      const tout = new THREE.Mesh(strip(outer, [['color', outCol, 3]]), outerMat);
      tout.castShadow = true; tout.receiveShadow = true;
      scene.add(tin, tout);
      // portal faces: the ring between the tube and the outside of the rock at both ends
      for (const r of [0, rows.length - 1]) {
        const pos = [], col = [], idx = [];
        for (let k = 0; k <= N; k++) {
          const o = (r * (N + 1) + k) * 3;
          pos.push(inner[o], inner[o + 1], inner[o + 2], outer[o], outer[o + 1], outer[o + 2]);
          col.push(rockA.r, rockA.g, rockA.b, outCol[o], outCol[o + 1], outCol[o + 2]);
          if (k < N) { const p = k * 2; idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2); }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        const face = new THREE.Mesh(g, outerMat);
        face.castShadow = true;
        scene.add(face);
      }
      // lava gutters along both walls
      for (const sd of [-1, 1]) {
        const pos = [], uv = [], idx = [];
        const P = {};
        let n = 0;
        for (let s = sa; s <= sb; s += 2, n++) {
          for (const lat of [sd * (hw + 1.3), sd * (hw + 2.3)]) { track.pointAt(s, lat, P); pos.push(P.x, P.y + 0.03, P.z); uv.push(0, 0); }
          if (s + 2 <= sb) { const p = n * 2; idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2); }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setIndex(idx);
        const m = new THREE.Mesh(g, gutterMat);
        m.material.side = THREE.DoubleSide;
        scene.add(m);
      }
    }
    if (lamps.length) scene.add(instanced(new THREE.BoxGeometry(0.7, 0.25, 2.6), lampMat, lamps, { cast: false }));

    // ash plumes rising off the lake
    const plumeMat = new THREE.SpriteMaterial({ map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64), color: 0x3a302c, transparent: true, depthWrite: false, opacity: 0.5 });
    const puffs = [];
    for (const [px, pz] of [[LAKE.x - LAKE.rx * 0.35, LAKE.z + LAKE.rz * 0.1], [LAKE.x + LAKE.rx * 0.4, LAKE.z - LAKE.rz * 0.25]]) {
      for (let k = 0; k < 16; k++) {
        const sp = new THREE.Sprite(plumeMat.clone());
        sp.userData = { x: px, z: pz, t: k / 16, drift: (rand() - 0.5) * 30 };
        scene.add(sp);
        puffs.push(sp);
      }
    }

    // reflections: a red sky and glowing lava below
    const envLava = new THREE.Mesh(new THREE.CircleGeometry(300, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff4a10).multiplyScalar(0.8) }));
    envLava.position.y = -30;
    envScene.add(envLava);

    // in a tunnel the daylight fades out: lights and reflections dim while the camera is inside
    const lights = {};
    scene.traverse((o) => { if (o.isDirectionalLight) lights.sun = o; if (o.isHemisphereLight) lights.hemi = o; });
    const base = { sun: lights.sun ? lights.sun.intensity : 1, hemi: lights.hemi ? lights.hemi.intensity : 1, env: ENV };
    const proj = {};
    let dark = 0;
    const loop = loops[0];
    return {
      landmark: loop ? { s: [track.wrapS(loop.sB + 25)], range: 55 } : null, // coming out of the loop
      update(dt, time, camera) {
        for (const m of animated) m.uniforms.uTime.value = time;
        let inside = 0;
        if (camera && tunnels.length) {
          const c = camera.position;
          track.project(c.x, c.z, proj.idx ?? -1, proj);
          if (Math.abs(proj.lateral) < hw + 3 && c.y < proj.y + 11) {
            for (const [a, b] of tunnels) {
              const d = Math.min(track.deltaS(a, proj.s), track.deltaS(proj.s, b));
              if (d > -6) inside = Math.max(inside, smooth(-6, 22, d));
            }
          }
        }
        dark += (inside - dark) * Math.min(1, dt * 5);
        if (lights.sun) lights.sun.intensity = base.sun * (1 - 0.8 * dark);
        if (lights.hemi) lights.hemi.intensity = base.hemi * (1 - 0.4 * dark);
        scene.environmentIntensity = base.env * (1 - 0.6 * dark);
        for (const sp of puffs) {
          const u = sp.userData;
          const t = (u.t + time * 0.025) % 1;
          sp.position.set(u.x + u.drift * t + Math.sin(time * 0.2 + u.t * 9) * 8, LAVA_Y + 10 + t * 260, u.z + u.drift * 0.5 * t);
          const s = 40 + t * 150;
          sp.scale.set(s, s, 1);
          sp.material.opacity = 0.55 * Math.min(1, t * 6) * (1 - t);
        }
      },
    };
  },
};
