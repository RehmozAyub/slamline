// NEBULA RING: an orbital speedway floating in space. A ringed gas giant fills the sky, the
// road hangs on glowing pylons over the void, asteroids drift past and the track threads
// through spinning stargates. A low-gravity gap lets cars float across, the road dives into a
// wormhole, and corkscrews as one strand of a glowing double helix through the great
// stargate. Nebulae glow in the dark, comets streak by and a wheel station turns overhead.
import * as THREE from 'three';
import { LAYOUTS } from './layouts.js';
import { fbm } from '../terrain.js';
import { rng, colored, instanced } from '../scenery.js';
import { radialTexture } from '../textures.js';

const smoother = (f) => f * f * f * (f * (f * 6 - 15) + 10); // as the corkscrew twists (rail.js)

// a nebula cloud: fbm wisps in two colours fading out to the edge
function nebulaTexture(rand, a, b) {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d'), img = g.createImageData(S, S), seed = rand() * 50;
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S - 0.5, v = y / S - 0.5, r = Math.hypot(u, v) * 2;
    const n = fbm(u * 3 + seed, v * 3 - seed, 5), m = fbm(u * 6 - seed, v * 6 + seed, 3);
    const k = Math.max(0, n - 0.35) * 2.4 * Math.max(0, 1 - r * r);
    const i = (y * S + x) * 4;
    img.data[i] = (ca.r + (cb.r - ca.r) * m) * 255 * k; img.data[i + 1] = (ca.g + (cb.g - ca.g) * m) * 255 * k; img.data[i + 2] = (ca.b + (cb.b - ca.b) * m) * 255 * k;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// swirling event horizon at a wormhole's mouths: additive, so cars see (and drive) through it
function horizonMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec2 vUv;
      void main() {
        vec2 p = vUv - 0.5; float r = length(p) * 2.0, a = atan(p.y, p.x);
        float arms = 0.5 + 0.5 * sin(a * 4.0 + r * 10.0 - uTime * 4.0);
        float k = smoothstep(1.0, 0.75, r) * (0.25 + 0.75 * arms) * (0.35 + 0.65 * r);
        gl_FragColor = vec4(mix(vec3(0.2, 0.6, 1.0), vec3(0.9, 0.3, 1.0), arms) * k * 0.9, 1.0);
      }`,
  });
}

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

  build({ scene, track, index, density, envScene, sunDir, jumps = [], rails = [], tunnels = [] }) {
    const rand = rng(4242);
    const hw = track.halfWidth, step = track.step;
    const jump = jumps[0] || null, screw = rails.find((r) => r.kind === 'corkscrew') || null, worm = tunnels.find((t) => t.style === 'wormhole') || null;
    // nothing hangs under the road where it isn't: the gap, the corkscrew (it has its own steel)
    const open = (sv) => !(jump && jump.inGap(sv)) && !(screw && track.deltaS(screw.sA, sv) >= 0 && track.deltaS(sv, screw.sB) >= 0);

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
      if (!open(s) || (jump && jump.near(s, 6))) continue;
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
    const deckOpen = deckPts.map((i) => open(i * step));
    const deck = new THREE.BufferGeometry();
    const dv = [];
    for (const i of deckPts) {
      const x = track.x[i], y = track.y[i], z = track.z[i], rx = track.rx[i], rz = track.rz[i];
      for (const sd of [-1, 1]) dv.push(x + rx * sd * (hw + 2.5), y - 0.4, z + rz * sd * (hw + 2.5), x + rx * sd * (hw + 1), y - 2.2, z + rz * sd * (hw + 1));
    }
    const idx = [];
    const m = deckPts.length;
    for (let k = 0; k < m; k++) {
      if (!deckOpen[k] || !deckOpen[(k + 1) % m]) continue;
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
    let greatGate = null;
    const gateMat = new THREE.MeshStandardMaterial({ color: 0x30344a, metalness: 0.8, roughness: 0.35 });
    for (let k = 0; k < 6; k++) {
      const s = (k + 0.35) * (track.length / 6);
      const p = track.pointAt(s, 0);
      if (index.nearest(p.x, p.z, 3).dist > 2) continue;
      // (none in the way of the set pieces)
      if ((jump && jump.near(s, 40)) || (screw && track.deltaS(screw.sA - 40, s) >= 0 && track.deltaS(s, screw.sB + 40) >= 0) || (worm && track.deltaS(worm.a - 40, s) >= 0 && track.deltaS(s, worm.b + 40) >= 0)) continue;
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

    const animated = [];

    // --- the DNA corkscrew: a second glowing strand twists opposite the road, rungs between,
    // and the great stargate round the middle of the twist ---------------------------------
    if (screw) {
      const r = screw.radius, dir = screw.spec.dir ?? 1, pts = [], rungs = [], P = {};
      const strandAt = (f, out) => {
        track.pointAt(track.wrapS(screw.s0 + screw.span * f), 0, P);
        const th = 2 * Math.PI * smoother(f), sn = Math.sin(th), cs = Math.cos(th);
        out.set(P.x - P.rx * dir * r * sn, P.y + r * (1 + cs), P.z - P.rz * dir * r * sn);
        return out;
      };
      for (let k = 0; k <= 120; k++) pts.push(strandAt(k / 120, new THREE.Vector3()));
      const strand = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.7, 8, false), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff4df0).multiplyScalar(2.2) }));
      scene.add(strand);
      // rungs from the strand in to the axis (the corkscrew's own spokes carry on to the road)
      const rungMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5ff0ff).multiplyScalar(1.8) });
      for (let k = 1; k < 14; k++) {
        const f = k / 14, a = strandAt(f, new THREE.Vector3());
        track.pointAt(track.wrapS(screw.s0 + screw.span * f), 0, P);
        const b = new THREE.Vector3(P.x, P.y + r, P.z);
        const len = a.distanceTo(b);
        const rung = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, len, 6), rungMat);
        rung.position.copy(a).add(b).multiplyScalar(0.5);
        rung.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        scene.add(rung);
        rungs.push(rung);
      }
      // the great stargate: a heavy ring round the twist's axis with chevrons
      const M = track.pointAt(track.wrapS(screw.s0 + screw.span / 2), 0);
      const gate = new THREE.Group();
      const R = r + 9;
      gate.add(new THREE.Mesh(new THREE.TorusGeometry(R, 2.2, 12, 64), new THREE.MeshStandardMaterial({ color: 0x3a3e56, metalness: 0.85, roughness: 0.3 })));
      const inner = new THREE.Mesh(new THREE.TorusGeometry(R - 2.2, 0.5, 8, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x19e3ff).multiplyScalar(2.6) }));
      gate.add(inner);
      const chevMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a2a).multiplyScalar(2.6) });
      for (let j = 0; j < 9; j++) {
        const a = (j / 9) * Math.PI * 2, c = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.2, 3), chevMat);
        c.position.set(Math.cos(a) * (R + 1.2), Math.sin(a) * (R + 1.2), 0);
        c.rotation.z = a - Math.PI / 2;
        gate.add(c);
      }
      gate.position.set(M.x, M.y + r, M.z);
      gate.rotation.y = M.heading;
      scene.add(gate);
      gateS.push(screw.s0 + screw.span / 2);
      greatGate = { gate, chevMat };
    }

    // --- the wormhole's mouths: swirling event horizons the road runs through --------------
    if (worm) {
      const hz = horizonMaterial();
      animated.push(hz);
      for (const sv of [worm.a - 1.5, worm.b + 1.5]) {
        const p = track.pointAt(track.wrapS(sv), 0);
        const disc = new THREE.Mesh(new THREE.CircleGeometry(22, 48), hz);
        disc.position.set(p.x, p.y + 6, p.z);
        disc.rotation.y = p.heading;
        scene.add(disc);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(19, 0.9, 10, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xa06aff).multiplyScalar(2.4) }));
        rim.position.copy(disc.position);
        rim.rotation.y = p.heading;
        scene.add(rim);
      }
    }

    // --- the low-gravity field over the gap: a faint column of light, motes drifting up ----
    let motes = null;
    if (jump) {
      const A = track.pointAt(jump.sLip, 0), B = track.pointAt(track.wrapS(jump.sLand), 0);
      const mx = (A.x + B.x) / 2, mz = (A.z + B.z) / 2, my = (A.y + B.y) / 2, len = Math.hypot(B.x - A.x, B.z - A.z);
      const field = new THREE.Mesh(new THREE.CylinderGeometry(hw + 8, hw + 8, len, 32, 1, true).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3a6aff, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      field.position.set(mx, my + 4, mz);
      field.rotation.y = Math.atan2(B.x - A.x, B.z - A.z);
      scene.add(field);
      for (const p of [A, B]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(hw + 8, 0.35, 6, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x5a9aff).multiplyScalar(2.2) }));
        ring.position.set(p.x, p.y + 4, p.z);
        ring.rotation.y = field.rotation.y;
        scene.add(ring);
      }
      const n = 260, base = new Float32Array(n * 4), pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const f = rand(), a = rand() * Math.PI * 2, rr = Math.sqrt(rand()) * (hw + 7);
        base[i * 4] = A.x + (B.x - A.x) * f + Math.cos(a) * rr * Math.cos(field.rotation.y);
        base[i * 4 + 1] = my - 30 + rand() * 50;
        base[i * 4 + 2] = A.z + (B.z - A.z) * f - Math.cos(a) * rr * Math.sin(field.rotation.y);
        base[i * 4 + 3] = rand() * 40;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 32), color: 0x8ab8ff, size: 1.1, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      pts.frustumCulled = false;
      scene.add(pts);
      motes = { base, pos, g, n, my };
    }

    // --- nebulae, comets, the wheel station, a few big tumbling rocks ----------------------
    const nebulae = [[0x6a2acf, 0x1aa8c8, -0.4, 0.35], [0xc82a7a, 0x4a2acf, 1.9, 0.22], [0x1a8a9a, 0x8a3ad8, 3.6, 0.5]];
    for (const [a, b, ang, el] of nebulae) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(3400, 3400), new THREE.MeshBasicMaterial({ map: nebulaTexture(rand, a, b), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      const d = 3900;
      m.position.set(Math.cos(ang) * Math.cos(el) * d, Math.sin(el) * d, Math.sin(ang) * Math.cos(el) * d);
      m.lookAt(0, 0, 0);
      m.renderOrder = -0.5;
      scene.add(m);
    }
    const comets = [];
    const headTex = radialTexture('rgba(255,255,255,1)', 'rgba(160,220,255,0)', 64);
    for (let k = 0; k < 3; k++) {
      const g = new THREE.Group();
      const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: headTex, color: 0xd8f0ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      head.scale.setScalar(36);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(14, 420, 12, 1, true).translate(0, -210, 0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x6ab8ff, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
      g.add(head, tail);
      scene.add(g);
      comets.push({ g, a: rand() * 6.28, tilt: 0.3 + rand() * 0.5, r: 2600 + rand() * 600, spd: 0.012 + rand() * 0.01, y: 500 + rand() * 900 });
    }
    // the station: a slowly turning wheel with spokes, a hub, solar wings and blinking lights
    const station = new THREE.Group();
    const hull = new THREE.MeshStandardMaterial({ color: 0xc8ccd8, metalness: 0.6, roughness: 0.4, fog: false });
    const wheel = new THREE.Group();
    wheel.add(new THREE.Mesh(new THREE.TorusGeometry(150, 9, 12, 96), hull));
    for (let k = 0; k < 6; k++) { const sp = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 150, 8).translate(0, 75, 0), hull); sp.rotation.z = (k / 6) * Math.PI * 2; wheel.add(sp); }
    const winMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe0a0).multiplyScalar(2), fog: false });
    for (let k = 0; k < 48; k++) { const a = (k / 48) * Math.PI * 2, w = new THREE.Mesh(new THREE.BoxGeometry(3, 2, 1), winMat); w.position.set(Math.cos(a) * 150, Math.sin(a) * 150, 9.2); w.rotation.z = a; wheel.add(w); }
    station.add(wheel);
    station.add(new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 60, 16).rotateX(Math.PI / 2), hull));
    for (const sd of [-1, 1]) { const panel = new THREE.Mesh(new THREE.BoxGeometry(150, 1, 40), new THREE.MeshStandardMaterial({ color: 0x1a2a6a, metalness: 0.5, roughness: 0.3, fog: false })); panel.position.set(0, 0, sd * 70); panel.rotation.x = Math.PI / 2; station.add(panel); }
    const blink = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3030).multiplyScalar(3), fog: false });
    for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6), blink); b.position.set(Math.cos(k * 1.57) * 160, Math.sin(k * 1.57) * 160, 0); wheel.add(b); }
    station.position.set(950, 420, 1050);
    station.lookAt(0, 100, 0);
    scene.add(station);
    const tumblers = [];
    for (let k = 0; k < 10; k++) {
      const a = rand() * 6.28, r = 300 + rand() * 500;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, y = 120 + rand() * 160;
      const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const k2 = 0.75 + rand() * 0.5; p.setXYZ(i, p.getX(i) * k2, p.getY(i) * k2, p.getZ(i) * k2); }
      g.computeVertexNormals();
      const m = new THREE.Mesh(colored(g, 0x4a4650, 0x7a7484), rockMat);
      m.scale.setScalar(12 + rand() * 18);
      m.position.set(x, y, z);
      m.userData = { w: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.3) };
      scene.add(m);
      tumblers.push(m);
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
        for (const m of animated) m.uniforms.uTime.value = time;
        if (greatGate) { greatGate.gate.rotation.z = time * 0.12; greatGate.chevMat.color.set(0xff8a2a).multiplyScalar(1.8 + Math.sin(time * 3) * 0.9); }
        if (motes) {
          for (let i = 0; i < motes.n; i++) {
            const ph = motes.base[i * 4 + 3], t = (time * 0.12 + ph) % 1;
            motes.pos[i * 3] = motes.base[i * 4] + Math.sin(time * 0.7 + ph) * 1.5;
            motes.pos[i * 3 + 1] = motes.base[i * 4 + 1] + t * 40;
            motes.pos[i * 3 + 2] = motes.base[i * 4 + 2] + Math.cos(time * 0.6 + ph) * 1.5;
          }
          motes.g.attributes.position.needsUpdate = true;
        }
        for (const c of comets) {
          const a = c.a + time * c.spd;
          c.g.position.set(Math.cos(a) * c.r, c.y + Math.sin(a * 2) * c.r * c.tilt * 0.3, Math.sin(a) * c.r);
          c.g.lookAt(Math.cos(a + 0.05) * c.r, c.y + Math.sin((a + 0.05) * 2) * c.r * c.tilt * 0.3, Math.sin(a + 0.05) * c.r);
        }
        station.children[0].rotation.z = time * 0.05;
        blink.color.set(0xff3030).multiplyScalar(Math.floor(time * 1.5) % 2 ? 3 : 0.4);
        for (const m of tumblers) { m.rotation.x += m.userData.w.x * dt; m.rotation.y += m.userData.w.y * dt; m.rotation.z += m.userData.w.z * dt; }
      },
    };
  },
};
