// MAGMA CORE: a ring road on the floor of a live volcano's caldera. A lake of molten lava fills
// the middle, lava falls pour down the crater walls, ash plumes rise into a smoky red sky, and
// the road dives through two lava-tube tunnels and climbs a loop-the-loop on the north straight.
import * as THREE from 'three';
import { LAYOUTS, VOLCANO, LAYOUT_SCALE } from './layouts.js';
import { fbm, makeHeightFn, buildTerrain, mountainRing } from '../terrain.js';
import { rng, colored, instanced, scatter } from '../scenery.js';
import { lavaMaterial } from '../lava.js';
import { radialTexture } from '../textures.js';

const LAKE = { x: VOLCANO.lake.x * LAYOUT_SCALE, z: VOLCANO.lake.z * LAYOUT_SCALE, rx: VOLCANO.lake.rx * LAYOUT_SCALE, rz: VOLCANO.lake.rz * LAYOUT_SCALE };
const LAVA_Y = VOLCANO.roadY - 5.5;
const WALL = { rx: 1050, rz: 780 }; // the crater wall rises beyond this ellipse
const ENV = 0.8; // reflections
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lakeE = (x, z) => Math.hypot((x - LAKE.x) / LAKE.rx, (z - LAKE.z) / LAKE.rz);

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
  tunnels: { lava: {} },
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

  build({ scene, track, index, density, envScene, rails = [], tunnels = [] }) {
    const rand = rng(909);
    const hw = track.halfWidth;

    // rock ridges running out from each tunnel to the crater wall: the road cuts through them
    const ridges = tunnels.map(({ a, b }) => {
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

    const loop = rails.find((r) => r.kind === 'loop');
    return {
      landmark: loop ? { s: [track.wrapS(loop.sB + 25)], range: 55 } : null, // coming out of the loop
      update(dt, time) {
        for (const m of animated) m.uniforms.uTime.value = time;
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
