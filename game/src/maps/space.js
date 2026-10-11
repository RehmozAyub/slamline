// NEBULA RING: an orbital speedway floating in space. A ringed gas giant fills the sky, the
// road hangs on glowing pylons over the void, asteroids drift past and the track threads
// through spinning stargates.
import * as THREE from 'three';
import { LAYOUTS } from './layouts.js';
import { rng, colored, instanced } from '../scenery.js';

// banded gas giant texture
function planetTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const bands = ['#c8875a', '#e8c49a', '#a05a3a', '#f0d8b0', '#b8704a', '#d8a878', '#8a4a32', '#ecd0a4'];
  let y = 0;
  const rand = rng(77);
  while (y < 256) {
    const h = 6 + rand() * 22;
    g.fillStyle = bands[Math.floor(rand() * bands.length)];
    g.fillRect(0, y, 512, h + 1);
    y += h;
  }
  // soft swirls
  for (let i = 0; i < 60; i++) {
    g.fillStyle = `rgba(255,240,220,${0.05 + rand() * 0.08})`;
    g.beginPath();
    g.ellipse(rand() * 512, rand() * 256, 20 + rand() * 60, 2 + rand() * 5, 0, 0, Math.PI * 2);
    g.fill();
  }
  // the great storm
  g.fillStyle = 'rgba(170,70,40,0.75)';
  g.beginPath(); g.ellipse(340, 160, 26, 11, 0, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// planetary ring: concentric translucent bands (u runs across the ring)
function ringTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 4;
  const g = c.getContext('2d');
  const rand = rng(91);
  for (let x = 0; x < 512; x++) {
    const a = Math.max(0, 0.15 + 0.55 * Math.sin(x * 0.05) * Math.sin(x * 0.013 + 1) + rand() * 0.3) * (x > 30 && x < 490 ? 1 : 0.2);
    g.fillStyle = `rgba(230,205,170,${Math.min(0.85, a)})`;
    g.fillRect(x, 0, 1, 4);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function ringGeometry(inner, outer, segs = 128) {
  const g = new THREE.RingGeometry(inner, outer, segs, 1);
  // RingGeometry's UVs are planar; map u across the ring instead
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    uv.setXY(i, (r - inner) / (outer - inner), 0.5);
  }
  return g;
}

export default {
  id: 'space',
  name: 'NEBULA RING',
  tagline: 'Orbital speedway above a ringed gas giant',
  weatherLabel: 'ZERO ATMOSPHERE',
  layout: LAYOUTS.space,
  exposure: 1.0,
  envIntensity: 0.9,
  bloom: { strength: 0.35, radius: 0.5, threshold: 1.0 },
  fog: { color: 0x07081a, density: 0.0007 },
  sky: {
    top: 0x010208, horizon: 0x1c1040, bottom: 0x05030e,
    sunDir: new THREE.Vector3(0.55, 0.32, -0.5), sunColor: 0xf4f6ff, sunSize: 0.0009, sunIntensity: 9, glow: 0.35,
    stars: 1.6, clouds: 0.55, cloudColor: 0x7a3ac8, horizonSharp: 0.3,
  },
  sun: { color: 0xf0f2ff, intensity: 2.8 },
  hemi: { sky: 0x4a5aa8, ground: 0x1a0c2a, intensity: 0.75 },
  smoke: [0.6, 0.66, 0.85],
  underglow: true,
  headlights: true,
  trackStyle: {
    road: { base: '#1c1f2a', line: '#5ff0ff', edge: '#ff4df0', lanes: 3, roughness: 0.5, metalness: 0.25, cracks: 0.2, patches: 0, seed: 99 }, // alloy deck
    kerb: ['#19e3ff', '#101420'],
    barrier: { type: 'wall', color: 0x2a2e3e, height: 1.0, glow: [0x19e3ff, 0xff4df0], glowIntensity: 3 },
    embankment: 0x101218,
    shoulder: 0x14161e,
    shortcut: { color: 0x2c3248, guide: 0x5ff0ff },
    accent: '#8a6aff',
  },

  build({ scene, track, index, density, envScene, sunDir }) {
    const rand = rng(4242);
    const hw = track.halfWidth;

    // the gas giant and its ring, far away (no fog: always crisp)
    const planet = new THREE.Mesh(new THREE.SphereGeometry(1300, 64, 32), new THREE.MeshStandardMaterial({ map: planetTexture(), roughness: 1, fog: false }));
    planet.position.set(-2600, 500, 3000);
    planet.rotation.set(0.3, 0, 0.25);
    scene.add(planet);
    const ring = new THREE.Mesh(ringGeometry(1650, 2600), new THREE.MeshBasicMaterial({ map: ringTexture(), transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false }));
    ring.position.copy(planet.position);
    ring.rotation.set(-Math.PI / 2 + 0.3, 0, 0.25);
    scene.add(ring);
    // a small moon
    const moon = new THREE.Mesh(new THREE.SphereGeometry(160, 32, 16), new THREE.MeshStandardMaterial({ color: 0x9a9aa8, roughness: 1, fog: false }));
    moon.position.set(2200, 900, -2400);
    scene.add(moon);

    // pylons holding the road up, dropping into the void, with glowing rings
    const pylons = [], glows = [];
    for (let s = 0; s < track.length; s += 55) {
      for (const side of [-1, 1]) {
        const p = track.pointAt(s, side * (hw + 1.5));
        pylons.push({ x: p.x, y: p.y - 0.5, z: p.z, s: 1 });
        glows.push({ x: p.x, y: p.y - 18, z: p.z, s: 1 });
      }
    }
    const pylonGeo = new THREE.CylinderGeometry(0.5, 0.9, 260, 6).translate(0, -130, 0);
    scene.add(instanced(pylonGeo, new THREE.MeshStandardMaterial({ color: 0x2a2e3e, metalness: 0.7, roughness: 0.4 }), pylons, { cast: false }));
    scene.add(instanced(new THREE.TorusGeometry(1.2, 0.18, 6, 16).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x19e3ff).multiplyScalar(2) }), glows, { cast: false }));
    // the deck: a dark slab under the road so it isn't paper-thin from the side
    const deckPts = [];
    for (let i = 0; i < track.n; i += 2) deckPts.push(i);
    const deck = new THREE.BufferGeometry();
    const dv = [];
    for (const i of deckPts) {
      const x = track.x[i], y = track.y[i], z = track.z[i], rx = track.rx[i], rz = track.rz[i];
      for (const sd of [-1, 1]) dv.push(x + rx * sd * (hw + 2.5), y - 0.4, z + rz * sd * (hw + 2.5), x + rx * sd * (hw + 1), y - 2.2, z + rz * sd * (hw + 1));
    }
    const idx = [];
    const m = deckPts.length;
    for (let k = 0; k < m; k++) {
      const a = k * 4, b = ((k + 1) % m) * 4;
      // left side wall, right side wall, underside
      idx.push(a, a + 1, b, b, a + 1, b + 1, a + 2, b + 2, a + 3, b + 2, b + 3, a + 3, a + 1, a + 3, b + 1, b + 1, a + 3, b + 3);
    }
    deck.setAttribute('position', new THREE.Float32BufferAttribute(dv, 3));
    deck.setIndex(idx);
    deck.computeVertexNormals();
    scene.add(new THREE.Mesh(deck, new THREE.MeshStandardMaterial({ color: 0x1a1d28, metalness: 0.6, roughness: 0.45, side: THREE.DoubleSide })));

    // asteroids drifting around (never through the road)
    const rocks = [];
    const tries = Math.round(700 * density);
    for (let k = 0; k < tries * 3 && rocks.length < tries; k++) {
      const a = rand() * Math.PI * 2, r = 250 + rand() * 1300;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = -120 + rand() * 320;
      const n = index.nearest(x, z, 4);
      const s = 2 + rand() * rand() * 22;
      if (n.dist < hw + 20 + s && Math.abs(y - n.y) < 40 + s) continue;
      rocks.push({ x, y, z, rx: rand() * 6, ry: rand() * 6, rz: rand() * 6, sx: s, sy: s * (0.6 + rand() * 0.5), sz: s * (0.7 + rand() * 0.6) });
    }
    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true });
    const rockMesh = instanced(colored(new THREE.IcosahedronGeometry(1, 1), 0x4a4650, 0x7a7484), rockMat, rocks);
    scene.add(rockMesh);

    // stargates the road threads through (the signature landmark), slowly spinning
    const gates = [], gateS = [];
    const gateMat = new THREE.MeshStandardMaterial({ color: 0x30344a, metalness: 0.8, roughness: 0.35 });
    for (let k = 0; k < 6; k++) {
      const s = (k + 0.35) * (track.length / 6);
      const p = track.pointAt(s, 0);
      if (index.nearest(p.x, p.z, 3).dist > 2) continue;
      gateS.push(s);
      const g = new THREE.Group();
      const spin = new THREE.Group();
      const R = hw + 9;
      spin.add(new THREE.Mesh(new THREE.TorusGeometry(R, 1.4, 10, 48), gateMat));
      const lightMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(k % 2 ? 0xff4df0 : 0x19e3ff).multiplyScalar(3) });
      for (let j = 0; j < 12; j++) {
        const a = (j / 12) * Math.PI * 2;
        const l = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 3.4), lightMat);
        l.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
        spin.add(l);
      }
      g.add(spin);
      g.position.set(p.x, p.y + 1.5, p.z);
      g.rotation.y = p.heading;
      g.userData = { spin, dir: k % 2 ? 1 : -1, mat: lightMat, base: lightMat.color.clone() };
      gates.push(g);
      scene.add(g);
    }

    // reflections: the planet's glow and the nebula
    const envPlanet = new THREE.Mesh(new THREE.SphereGeometry(80, 24, 12), new THREE.MeshBasicMaterial({ color: 0xc8875a }));
    envPlanet.position.set(-200, 40, 230);
    envScene.add(envPlanet);
    for (let i = 0; i < 10; i++) {
      const a = rand() * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.SphereGeometry(40 + rand() * 40, 12, 8), new THREE.MeshBasicMaterial({ color: i % 2 ? 0x3a1a6a : 0x102a5a }));
      b.position.set(Math.cos(a) * 300, 60 + rand() * 120, Math.sin(a) * 300);
      envScene.add(b);
    }

    return {
      landmark: { s: gateS, range: 18 },
      update(dt, time) {
        gates.forEach((g, i) => {
          g.userData.spin.rotation.z = time * 0.25 * g.userData.dir;
          g.userData.mat.color.copy(g.userData.base).multiplyScalar(0.7 + 0.3 * Math.sin(time * 2 + i));
        });
        planet.rotation.y = time * 0.003;
      },
    };
  },
};
