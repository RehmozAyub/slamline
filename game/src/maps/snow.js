// WHITEOUT SUMMIT: snowfall at dusk, snowy peaks, frosted pines, frozen lake, warm road lamps.
// The road corkscrews through a tube of ice, slides across a frozen tarn on glassy ice between
// snowbanks and curls up a bobsleigh wall. Aurora ripples over the peaks, blue ice caves glow
// in the slopes, a waterfall hangs frozen on a cliff and snowcats groom the pistes.
import * as THREE from 'three';
import { LAYOUTS } from './layouts.js';
import { fbm, noise2, makeHeightFn, buildTerrain, mountainRing } from '../terrain.js';
import { rng, colored, merge, instanced, scatter } from '../scenery.js';
import { radialTexture } from '../textures.js';

const LAKE_Y = 8;

function natural(x, z) {
  const r = Math.hypot(x, z);
  const hills = fbm(x * 0.0028 - 7, z * 0.0028 + 3, 5) * 120 - 10;
  const ridges = Math.pow(1 - Math.abs(fbm(x * 0.0017 + 5, z * 0.0017, 4) * 2 - 1), 3) * 160;
  const edge = Math.pow(Math.max(0, (r - 620) / 650), 1.5) * 460;
  const basin = -90 * Math.exp(-(x * x + z * z) / (190 * 190));
  return hills + ridges * 0.55 + edge + basin;
}

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// lake ice: pale blue with darker depths, white cracks and frozen bubbles
function iceTexture() {
  const S = 1024, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const ax = (x / S) * Math.PI * 2, ay = (y / S) * Math.PI * 2;
    const v = fbm(Math.cos(ax) * 2 + 5, Math.sin(ax) * 2 + Math.cos(ay) * 2 + Math.sin(ay), 4);
    const i = (y * S + x) * 4;
    img.data[i] = 150 + v * 70; img.data[i + 1] = 188 + v * 50; img.data[i + 2] = 214 + v * 30; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const crack = (x, y, a, len, w) => {
    g.lineWidth = w;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < len; k++) {
      a += (rand() - 0.5) * 0.9; x += Math.cos(a) * 9; y += Math.sin(a) * 9;
      g.lineTo(x, y);
      if (rand() < 0.08 && w > 0.8) { g.stroke(); crack(x, y, a + (rand() - 0.5) * 2.4, len * 0.4, w * 0.6); g.lineWidth = w; g.beginPath(); g.moveTo(x, y); }
    }
    g.stroke();
  };
  g.strokeStyle = 'rgba(240,250,255,0.75)';
  for (let k = 0; k < 16; k++) crack(rand() * S, rand() * S, rand() * 6.28, 30 + rand() * 40, 1.6 + rand());
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (let k = 0; k < 300; k++) { g.beginPath(); g.arc(rand() * S, rand() * S, 1 + rand() * 2.5, 0, 6.28); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// aurora curtains: vertical streaks rippling along a band, green into violet at the top
function auroraMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec2 vUv;
      float hash(float p) { return fract(sin(p * 127.1) * 43758.5453); }
      float noise(float x) { float i = floor(x), f = fract(x); return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f)); }
      void main() {
        float x = vUv.x * 40.0;
        float wave = noise(x * 0.35 + uTime * 0.12) * 0.6 + noise(x * 1.7 - uTime * 0.3) * 0.4;
        float rays = 0.55 + 0.45 * noise(x * 6.0 + uTime * 0.5);
        float lower = 0.18 + 0.25 * noise(x * 0.5 + 3.0 + uTime * 0.07);
        float body = smoothstep(lower, lower + 0.08, vUv.y) * pow(1.0 - vUv.y, 1.6);
        float edges = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
        vec3 col = mix(vec3(0.15, 1.0, 0.55), vec3(0.65, 0.3, 1.0), smoothstep(0.35, 0.95, vUv.y));
        gl_FragColor = vec4(col * body * rays * wave * edges * 3.2, 1.0);
      }`,
  });
}

function snowPine() {
  const parts = [colored(new THREE.CylinderGeometry(0.22, 0.32, 2.4, 6).translate(0, 1.2, 0), 0x3a2a1c)];
  const tiers = [[3.2, 4.2, 2.0], [2.5, 3.6, 4.2], [1.7, 3.0, 6.2], [0.9, 2.4, 8.0]];
  for (const [r, h, y] of tiers) parts.push(colored(new THREE.ConeGeometry(r, h, 8).translate(0, y + h / 2 - 0.6, 0), 0x1a3326, 0xeef3f8));
  return merge(parts);
}

export default {
  id: 'snow',
  name: 'WHITEOUT SUMMIT',
  tagline: 'Blizzard over the high pass at dusk',
  weatherLabel: 'SNOWFALL',
  layout: LAYOUTS.snow,
  exposure: 1.0,
  envIntensity: 0.9,
  bloom: { strength: 0.24, radius: 0.45, threshold: 1.15 },
  fog: { color: 0xaeb8c8, density: 0.0021 },
  sky: {
    top: 0x4a566c, horizon: 0xaab4c4, bottom: 0xc8d0da,
    sunDir: new THREE.Vector3(-0.5, 0.18, -0.6), sunColor: 0xffc890, sunSize: 0.0018, sunIntensity: 2.5, glow: 0.2,
    clouds: 1.0, cloudColor: 0xb8c0cc, horizonSharp: 0.5,
  },
  sun: { color: 0xffd8b0, intensity: 1.3 },
  hemi: { sky: 0xd8e2f0, ground: 0x8a94a4, intensity: 1.5 },
  smoke: [0.96, 0.97, 1.0],
  weather: { type: 'snow', count: 6000, wind: [2.5, 0.8], color: 0xffffff, spray: [0.97, 0.98, 1.0] },
  trackStyle: {
    road: { base: '#3e4148', line: '#dfe3ea', edge: '#dfe3ea', lanes: 2, roughness: 0.6, snowEdges: true, wet: true, envIntensity: 1.0, minRough: 0.3, sunSpec: 0.12, cracks: 1.2, seed: 55 }, // slushy
    kerb: null,
    barrier: { type: 'guardrail', color: 0xb8bec8, glow: [0xff3a1a, 0xff3a1a], glowIntensity: 1.6 },
    embankment: 0xe6ebf2,
    shoulder: 0xd8dee8,
    shortcut: { color: 0x9aa3b0 },
    accent: '#7ac8ff',
  },

  build({ scene, track, index, density, envScene, sunDir, shortcut, rails = [], ice = [] }) {
    const gap = (s, side) => shortcut && shortcut.isGap(s, side);
    const rand = rng(77);
    const hw = track.halfWidth, step = track.step;
    const baseHeight = makeHeightFn(index, natural, { hw, near: -1.3, blendStart: 12, blendEnd: 110 });
    // the frozen tarn the road crosses: an oval of ice either side of it, with a shore rising
    // round it (the ice follows the road's own height, which barely changes along there)
    const tarn = ice[0] || null;
    const lake = tarn ? { a: tarn.a - 14, b: tarn.b + 14 } : null;
    if (lake) {
      lake.mid = (lake.a + lake.b) / 2; lake.half = (lake.b - lake.a) / 2;
      lake.width = (s) => { const f = (s - lake.mid) / lake.half; return f * f >= 1 ? 0 : 78 * Math.sqrt(1 - f * f) * (0.86 + 0.14 * Math.sin(s * 0.031)); };
      // a box round it, to skip the second road lookup everywhere else
      lake.box = [Infinity, Infinity, -Infinity, -Infinity];
      for (let sv = lake.a; sv <= lake.b; sv += 10) { const p = track.pointAt(sv, 0); lake.box = [Math.min(lake.box[0], p.x), Math.min(lake.box[1], p.z), Math.max(lake.box[2], p.x), Math.max(lake.box[3], p.z)]; }
      lake.box = [lake.box[0] - 150, lake.box[1] - 150, lake.box[2] + 150, lake.box[3] + 150];
    }
    const nearLake = (x, z) => lake && x > lake.box[0] && z > lake.box[1] && x < lake.box[2] && z < lake.box[3];
    const heightAt = (x, z) => {
      const h = baseHeight(x, z);
      if (!nearLake(x, z)) return h;
      const n = index.nearest(x, z, 3);
      if (!isFinite(n.dist)) return h;
      const sn = n.idx * step;
      if (sn < lake.a - 30 || sn > lake.b + 30) return h;
      const w = lake.width(Math.max(lake.a, Math.min(lake.b, sn))), d = n.dist + Math.max(0, lake.a - sn, sn - lake.b);
      if (d < w) return n.y - 2.2;
      return h + (n.y - 0.25 - h) * smooth(w + 34, w, d);
    };
    const inLake = (x, z, m = 0) => {
      if (!nearLake(x, z)) return false;
      const n = index.nearest(x, z, 3);
      if (!isFinite(n.dist)) return false;
      const sn = n.idx * step;
      return sn > lake.a - m && sn < lake.b + m && n.dist < lake.width(Math.max(lake.a, Math.min(lake.b, sn))) + m;
    };

    const snow = new THREE.Color(0xeef2f8), shade = new THREE.Color(0xc4cedc), rock = new THREE.Color(0x4e5058), iceTint = new THREE.Color(0xa8c4dc);
    scene.add(buildTerrain({
      size: 3000, res: 230, center: [0, 0], heightAt,
      colorAt: (c, x, y, z, ny) => {
        c.copy(snow).lerp(shade, fbm(x * 0.01, z * 0.01, 3) * 0.6);
        if (ny < 0.72) c.lerp(rock, Math.min(1, (0.72 - ny) * 4.5));
        if (y < LAKE_Y + 1.5) c.lerp(iceTint, 0.5);
      },
    }));
    scene.add(mountainRing({ inner: 1450, outer: 3900, peak: 850, snowLine: 60, rock: 0x5a5c66, snow: 0xf0f4fa, grass: 0xdfe6ee, seed: 21, baseY: 60 }));

    // frozen lake in the basin inside the loop
    const basin = new THREE.Mesh(new THREE.CircleGeometry(420, 64).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xbfd6ea, roughness: 0.12, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 }));
    basin.position.y = LAKE_Y;
    basin.receiveShadow = true;
    scene.add(basin);

    // frosted pine forest
    const pines = scatter(Math.round(1800 * density), rand, [-1300, 1300, -1300, 1300], (x, z) => {
      const n = index.nearest(x, z, 3);
      if (n.dist < hw + 7 || inLake(x, z, 12)) return null;
      const y = heightAt(x, z);
      if (y < LAKE_Y + 2 || y > 210) return null;
      if (fbm(x * 0.006 + 30, z * 0.006, 3) < 0.42) return null;
      const s = 0.8 + rand() * 0.9;
      return { x, y: y - 0.3, z, ry: rand() * 6.28, s, sy: s * (0.85 + rand() * 0.4) };
    });
    scene.add(instanced(snowPine(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true }), pines));

    // snow-capped boulders
    const rocks = scatter(Math.round(200 * density), rand, [-1300, 1300, -1300, 1300], (x, z) => {
      if (index.nearest(x, z, 2).dist < hw + 6 || inLake(x, z, 4)) return null;
      return { x, y: heightAt(x, z) - 0.6, z, rx: rand() * 3, ry: rand() * 3, s: 1 + rand() * 3.5 };
    });
    scene.add(instanced(colored(new THREE.DodecahedronGeometry(1, 0), 0x5a5c64, 0xf0f4fa), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), rocks));

    // orange snow poles along both edges + warm sodium lamps
    const poles = [], lamps = [], heads = [], pools = [];
    for (let s = 0; s < track.length; s += 22) {
      for (const side of [-1, 1]) {
        if (gap(s, side)) continue;
        const p = track.pointAt(s, side * (hw + 1.6));
        poles.push({ x: p.x, y: p.y + 0.9, z: p.z });
      }
    }
    for (let s = 30, side = 1; s < track.length; s += 70, side = -side) {
      if (gap(s, side)) continue;
      const p = track.pointAt(s, side * (hw + 2.4));
      lamps.push({ x: p.x, y: p.y + 4.5, z: p.z });
      const a = track.pointAt(s, side * (hw - 0.4));
      heads.push({ x: a.x, y: p.y + 8.8, z: a.z, ry: p.heading });
      const b = track.pointAt(s, side * (hw - 2.5));
      pools.push({ x: b.x, y: b.y + 0.07, z: b.z, ry: p.heading });
    }
    const poleGeo = merge([colored(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 5), 0xff5a10), colored(new THREE.CylinderGeometry(0.052, 0.052, 0.3, 5).translate(0, 0.55, 0), 0x111111)]);
    scene.add(instanced(poleGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), poles, { cast: false }));
    scene.add(instanced(new THREE.CylinderGeometry(0.15, 0.22, 9, 8), new THREE.MeshStandardMaterial({ color: 0x3a3c42, metalness: 0.7, roughness: 0.5 }), lamps));
    scene.add(instanced(new THREE.BoxGeometry(4.8, 0.25, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa850).multiplyScalar(3.5) }), heads, { cast: false }));
    const pool = instanced(new THREE.PlaneGeometry(9, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,170,90,0.32)', 'rgba(255,150,80,0)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), pools, { cast: false });
    pool.renderOrder = 1;
    scene.add(pool);

    // cabins with glowing windows
    const cabinGeo = merge([
      colored(new THREE.BoxGeometry(9, 5, 7).translate(0, 2.5, 0), 0x6a4630),
      colored(new THREE.CylinderGeometry(0.01, 6.5, 3.6, 4, 1).rotateY(Math.PI / 4).scale(1.25, 1, 1).translate(0, 6.8, 0), 0xf2f5fa),
    ]);
    const cabins = scatter(Math.round(26 * density) + 4, rand, [-900, 900, -900, 900], (x, z) => {
      const d = index.nearest(x, z, 3).dist;
      if (d < hw + 25 || d > hw + 150 || inLake(x, z, 20)) return null;
      const y = heightAt(x, z);
      return y > LAKE_Y + 3 && y < 170 ? { x, y: y - 0.4, z, ry: rand() * 6.28 } : null;
    });
    scene.add(instanced(cabinGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), cabins, { receive: true }));
    const win = [];
    for (const c of cabins) for (const k of [-1, 1]) {
      win.push({ x: c.x + Math.cos(c.ry) * 2.2 * k + Math.sin(c.ry) * 3.52, y: c.y + 2.6, z: c.z - Math.sin(c.ry) * 2.2 * k + Math.cos(c.ry) * 3.52, ry: c.ry });
    }
    scene.add(instanced(new THREE.BoxGeometry(1.6, 1.3, 0.1), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb060).multiplyScalar(3) }), win, { cast: false }));

    const animated = [];
    const iceMat = new THREE.MeshStandardMaterial({ color: 0xd8ecfa, emissive: 0x1a3a52, emissiveIntensity: 0.6, roughness: 0.18, metalness: 0.05, transparent: true, opacity: 0.88 });

    // --- the frozen tarn: glassy ice over the lake and the road, snowbanks along the edges ---
    if (lake) {
      const tex = iceTexture();
      const lakeMat = new THREE.MeshPhysicalMaterial({ map: tex, color: 0xe6f2fb, roughness: 0.1, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.06, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const pos = [], uv = [], idx = [], P = {}, C = 26;
      let rows = 0;
      for (let sv = lake.a; sv <= lake.b + 1e-6; sv += 4, rows++) {
        const w = Math.max(hw + 3, lake.width(sv)) + 8;
        for (let k = 0; k <= C; k++) {
          const lat = -w + (2 * w * k) / C;
          track.pointAt(track.wrapS(sv), lat, P);
          const y = track.pointAt(track.wrapS(sv), 0).y + 0.03;
          pos.push(P.x, y, P.z); uv.push(lat / 36, sv / 36);
        }
      }
      for (let r = 0; r < rows - 1; r++) for (let k = 0; k < C; k++) {
        const a = r * (C + 1) + k, b = a + 1, c = a + C + 1, d = c + 1;
        idx.push(a, b, c, b, d, c);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const sheet = new THREE.Mesh(g, lakeMat);
      sheet.receiveShadow = true;
      scene.add(sheet);
      // snowbanks where the guardrails would be
      const prof = [[0, 0], [0.5, 0.8], [1.4, 1.15], [2.4, 0.9], [3.4, 0.2], [4, -0.3]];
      const snowMat = new THREE.MeshStandardMaterial({ color: 0xf2f6fb, roughness: 0.92 });
      for (const sd of [-1, 1]) {
        const bp = [], bi = [];
        let n = 0;
        for (let sv = tarn.a - 6; sv <= tarn.b + 6; sv += 3, n++) {
          const taper = smooth(tarn.a - 6, tarn.a + 6, sv) * smooth(tarn.b + 6, tarn.b - 6, sv);
          for (const [o, h] of prof) { track.pointAt(track.wrapS(sv), sd * (hw + 0.3 + o), P); bp.push(P.x, P.y + h * (0.3 + 0.7 * taper), P.z); }
          if (n) for (let k = 0; k < prof.length - 1; k++) {
            const a = (n - 1) * prof.length + k, b = a + 1, c = a + prof.length, d = c + 1;
            if (sd > 0) bi.push(a, c, b, b, c, d); else bi.push(a, b, c, b, d, c);
          }
        }
        const bg = new THREE.BufferGeometry();
        bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
        bg.setIndex(bi);
        bg.computeVertexNormals();
        const bank = new THREE.Mesh(bg, snowMat);
        bank.receiveShadow = bank.castShadow = true;
        scene.add(bank);
      }
    }

    // --- the ice tube round the corkscrew: frosted glass, glowing ribs, icicles at the ends --
    const screw = rails.find((r) => r.kind === 'corkscrew');
    if (screw) {
      const r = screw.radius, R = r + 4.5, pts = [];
      for (let sv = screw.s0; sv <= screw.s0 + screw.span + 1e-6; sv += 4) { const p = track.pointAt(track.wrapS(sv), 0); pts.push(new THREE.Vector3(p.x, p.y + r, p.z)); }
      const axis = new THREE.CatmullRomCurve3(pts);
      const tubeMat = new THREE.MeshStandardMaterial({ color: 0xbfe4ff, emissive: 0x2a6a9a, emissiveIntensity: 0.35, roughness: 0.15, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false });
      const tube = new THREE.Mesh(new THREE.TubeGeometry(axis, 60, R, 28, false), tubeMat);
      tube.renderOrder = 3;
      scene.add(tube);
      const ribMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7ad8ff).multiplyScalar(2.2) });
      const ribGeo = new THREE.TorusGeometry(R, 0.35, 6, 48);
      const up = new THREE.Vector3(0, 0, 1);
      for (let f = 0; f <= 1.0001; f += 1 / 9) {
        const p = axis.getPointAt(Math.min(1, f)), t = axis.getTangentAt(Math.min(1, f));
        const rib = new THREE.Mesh(ribGeo, ribMat);
        rib.position.copy(p);
        rib.quaternion.setFromUnitVectors(up, t);
        scene.add(rib);
      }
      // icicles hanging round the top of both mouths
      const icicles = [];
      for (const f of [0, 1]) {
        const p = axis.getPointAt(f), t = axis.getTangentAt(f);
        const side = new THREE.Vector3(-t.z, 0, t.x).normalize();
        for (let k = 0; k < 16; k++) {
          const a = Math.PI * (0.12 + 0.76 * (k / 15));
          icicles.push({ x: p.x + side.x * Math.cos(a) * R, y: p.y + Math.sin(a) * R - 1.2, z: p.z + side.z * Math.cos(a) * R, sx: 0.6, sy: 0.8 + rand() * 1.6, sz: 0.6, rx: Math.PI });
        }
      }
      scene.add(instanced(new THREE.ConeGeometry(0.6, 3, 5), iceMat, icicles, { cast: false }));
    }

    // --- aurora over the peaks -------------------------------------------------------------
    const aurora = auroraMaterial();
    animated.push(aurora);
    for (let k = 0; k < 3; k++) {
      const a0 = -0.6 + k * 1.9 + rand() * 0.4, span = 1.1 + rand() * 0.5, rad = 1150 + k * 120;
      const g = new THREE.PlaneGeometry(1, 1, 80, 1), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i) + 0.5, v = p.getY(i) + 0.5, a = a0 + u * span, wob = Math.sin(u * 9 + k) * 60;
        p.setXYZ(i, Math.cos(a) * (rad + wob), 470 + v * 620, Math.sin(a) * (rad + wob));
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, aurora);
      m.frustumCulled = false;
      m.renderOrder = -0.5;
      scene.add(m);
    }

    // --- blue ice caves in the slopes, and a waterfall frozen on a cliff -------------------
    const outerSide = (sv) => { const a = track.pointAt(sv, 60), b = track.pointAt(sv, -60); return Math.hypot(a.x, a.z) > Math.hypot(b.x, b.z) ? 1 : -1; };
    const caveGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2a8cff).multiplyScalar(1.6), side: THREE.DoubleSide });
    const caveDark = new THREE.MeshBasicMaterial({ color: 0x06142a, side: THREE.DoubleSide });
    for (const frac of [0.08, 0.36, 0.62]) {
      const sv = track.length * frac, sd = outerSide(sv);
      const p = track.pointAt(sv, sd * (hw + 62));
      if (inLake(p.x, p.z, 30) || (shortcut && shortcut.near(p.x, p.z, 30))) continue;
      const g = new THREE.Group();
      const mouth = new THREE.Mesh(new THREE.CircleGeometry(8, 24, 0, Math.PI), caveDark);
      const inner = new THREE.Mesh(new THREE.CircleGeometry(5.2, 20, 0, Math.PI), caveGlow);
      inner.position.z = 0.1;
      const rim = new THREE.Mesh(new THREE.TorusGeometry(8.6, 2.4, 8, 24, Math.PI), iceMat);
      g.add(mouth, inner, rim);
      const drips = [];
      for (let k = 0; k < 12; k++) { const a = Math.PI * (0.1 + 0.8 * (k / 11)); drips.push({ x: Math.cos(a) * 8.6, y: Math.sin(a) * 8.6 - 2.4, z: 1.6, sx: 0.5, sy: 0.7 + rand() * 1.4, sz: 0.5, rx: Math.PI }); }
      g.add(instanced(new THREE.ConeGeometry(0.6, 3, 5), iceMat, drips, { cast: false }));
      const toRoad = track.pointAt(sv, 0);
      g.position.set(p.x, heightAt(p.x, p.z) - 1.5, p.z);
      g.rotation.y = Math.atan2(toRoad.x - p.x, toRoad.z - p.z);
      scene.add(g);
    }
    {
      // the cliff: the steepest rise within reach of the road, facing it
      let best = null;
      for (let k = 0; k < 60; k++) {
        const sv = rand() * track.length, sd = outerSide(sv), d = hw + 80 + rand() * 70;
        const p = track.pointAt(sv, sd * d), q = track.pointAt(sv, sd * (d + 20));
        if (inLake(p.x, p.z, 40) || (shortcut && shortcut.near(p.x, p.z, 40))) continue;
        const rise = heightAt(q.x, q.z) - heightAt(p.x, p.z);
        if (!best || rise > best.rise) best = { p, q, rise, sv };
      }
      if (best && best.rise > 8) {
        const { p, q } = best, y0 = heightAt(p.x, p.z) - 1, y1 = heightAt(q.x, q.z) + 1;
        const parts = [];
        for (let k = 0; k < 18; k++) {
          const f = k / 17, blob = new THREE.IcosahedronGeometry(1, 1);
          const w = 5 + Math.sin(f * 9) * 1.5 + (1 - f) * 3;
          blob.scale(w, (y1 - y0) / 12, w * 0.6);
          blob.translate(p.x + (q.x - p.x) * f * 0.9 + (rand() - 0.5) * 2, y0 + (y1 - y0) * f, p.z + (q.z - p.z) * f * 0.9 + (rand() - 0.5) * 2);
          parts.push(blob);
        }
        const frozen = new THREE.Mesh(merge(parts), new THREE.MeshStandardMaterial({ color: 0xd4ecff, emissive: 0x3a7ab0, emissiveIntensity: 0.35, roughness: 0.12, flatShading: true }));
        frozen.castShadow = true;
        scene.add(frozen);
        const drips = [];
        for (let k = 0; k < 24; k++) {
          const f = rand();
          drips.push({ x: p.x + (q.x - p.x) * f * 0.9 + (rand() - 0.5) * 12, y: y0 + (y1 - y0) * f - 1, z: p.z + (q.z - p.z) * f * 0.9 + (rand() - 0.5) * 8, sx: 0.8, sy: 1 + rand() * 2.5, sz: 0.8, rx: Math.PI });
        }
        scene.add(instanced(new THREE.ConeGeometry(0.6, 3, 5), iceMat, drips, { cast: false }));
      }
    }

    // --- snowcats grooming the slopes, beacons turning -------------------------------------
    const cats = [];
    const catGeo = merge([
      colored(new THREE.BoxGeometry(3.4, 1.6, 5.2).translate(0, 1.6, 0), 0xd8202a),
      colored(new THREE.BoxGeometry(3.0, 1.6, 2.4).translate(0, 3.2, -0.6), 0xd8202a),
      colored(new THREE.BoxGeometry(3.05, 0.9, 2.45).translate(0, 3.3, -0.6), 0x2a3a4a),
      colored(new THREE.BoxGeometry(1.1, 1.3, 6.0).translate(-1.75, 0.65, 0), 0x1a1a1e),
      colored(new THREE.BoxGeometry(1.1, 1.3, 6.0).translate(1.75, 0.65, 0), 0x1a1a1e),
      colored(new THREE.BoxGeometry(5.2, 1.2, 0.4).translate(0, 0.8, 3.4), 0x9a9ea6),
    ]);
    const catMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
    const beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa020).multiplyScalar(3) });
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2d8).multiplyScalar(3) });
    for (let k = 0; k < 3; k++) {
      const sv = track.length * (0.2 + k * 0.29), sd = -outerSide(sv);
      const c = track.pointAt(sv, sd * (hw + 150));
      if (inLake(c.x, c.z, 60)) continue;
      const g = new THREE.Group();
      g.add(new THREE.Mesh(catGeo, catMat));
      const beacon = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.5), beaconMat);
      beacon.position.set(0, 4.3, -0.6);
      const lamps = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 0.1), lampMat);
      lamps.position.set(0, 3.6, 0.62);
      g.add(beacon, lamps);
      g.traverse((o) => { o.castShadow = true; });
      scene.add(g);
      cats.push({ g, beacon, x: c.x, z: c.z, r: 45 + rand() * 25, ph: rand() * 6.28, spd: 0.05 + rand() * 0.03 });
    }

    const envGround = new THREE.Mesh(new THREE.CircleGeometry(300, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xc8d0dc }));
    envGround.position.y = -6;
    envScene.add(envGround);
    // signature spot: the stretch of road closest to the frozen lake
    let lakeS = 0, lakeD = Infinity;
    for (let i = 0; i < track.n; i++) { const d = Math.hypot(track.x[i], track.z[i]); if (d < lakeD) { lakeD = d; lakeS = i * track.step; } }
    return {
      landmark: { s: [lakeS, ...(tarn ? [(tarn.a + tarn.b) / 2] : [])], range: 80 },
      update(dt, time) {
        for (const m of animated) m.uniforms.uTime.value = time;
        for (const c of cats) {
          const a = time * c.spd + c.ph, x = c.x + Math.cos(a) * c.r, z = c.z + Math.sin(a) * c.r;
          c.g.position.set(x, heightAt(x, z) - 0.2, z);
          c.g.rotation.y = -a;
          c.beacon.visible = Math.floor(time * 3) % 2 === 0;
        }
      },
    };
  },
};
