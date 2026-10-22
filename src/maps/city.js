// NEON CITY: night streets, glowing towers, neon signs and arches, wet reflective asphalt. The
// road spirals up a car park and jumps off its roof, curls up a neon half-pipe round the corner
// tower, and dives into a subway tunnel with a train running alongside. An elevated line runs
// over the east side, holo billboards flicker and steam rises from the manholes.
import * as THREE from 'three';
import { LAYOUTS } from './layouts.js';
import { rng, instanced } from '../scenery.js';
import { addWorldDetail } from '../detail.js';
import { windowTextures, neonSignTexture, radialTexture } from '../textures.js';
import { Train } from '../train.js';

const NEON = [0xff2d95, 0x19e3ff, 0xffd23f, 0x8a3cff, 0x3dff8a, 0xff6a2d];
const SIGNS = ['NEON', 'HOTEL', 'RAMEN', 'CLUB 88', 'ARCADE', 'TURBO', 'NITRO', 'KARAOKE', 'GARAGE', 'DINER', 'OPEN 24H', 'SUSHI'];
const HOLO = ['SLAMLINE', 'NITRO', 'TURBO', 'WRECK IT', 'BOOST', 'HYPERDRIVE'];

// Box with UVs scaled so a window tile covers 32 m x 64 m regardless of building size.
function buildingGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(0, h / 2, 0);
  const uv = g.attributes.uv;
  // face order: +x, -x, +y, -y, +z, -z (4 verts each)
  const dims = [[d, h], [d, h], [0, 0], [0, 0], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    const [fw, fh] = dims[f];
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      if (fw === 0) uv.setXY(i, 0.01, 0.01);
      else uv.setXY(i, uv.getX(i) * (fw / 32), uv.getY(i) * (fh / 64));
    }
  }
  return g;
}

// A holo billboard: big glowing text with scan lines, scrolled and pulsed in update()
function holoTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,0)'; g.fillRect(0, 0, 512, 256);
  g.font = 'italic 900 120px Bahnschrift, "Segoe UI", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 24;
  g.fillStyle = color;
  g.fillText(text, 256, 128, 480);
  g.globalCompositeOperation = 'destination-out';
  for (let y = 0; y < 256; y += 6) g.fillRect(0, y, 512, 2); // scan lines
  const t = new THREE.CanvasTexture(c);
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export default {
  id: 'city',
  name: 'NEON CITY',
  tagline: 'Midnight streets. Wet asphalt. Neon everywhere.',
  layout: LAYOUTS.city,
  exposure: 0.98,
  envIntensity: 1.0,
  bloom: { strength: 0.38, radius: 0.45, threshold: 1.05 },
  fog: { color: 0x150c26, density: 0.0016 },
  sky: {
    top: 0x03040c, horizon: 0x3a1548, bottom: 0x0a0812,
    sunDir: new THREE.Vector3(-0.4, 0.45, 0.6), sunColor: 0xcfe0ff, sunSize: 0.0009, sunIntensity: 10, glow: 0.25,
    stars: 1, horizonSharp: 0.35,
  },
  sun: { color: 0x8fa8ff, intensity: 0.9 },
  hemi: { sky: 0x6a5ab0, ground: 0x3a2040, intensity: 1.3 },
  smoke: [0.55, 0.5, 0.65],
  underglow: true,
  headlights: true,
  tunnels: { subway: { width: 9, band: '#ff2d95' } },
  trackStyle: {
    road: { base: '#222228', line: '#d8d8e0', edge: '#e0c040', lanes: 3, roughness: 0.55, metalness: 0.05, wet: true, envIntensity: 0.8, minRough: 0.2, wear: 1.3, oil: 6, patches: 3, seed: 33 }, // wet, worn city streets
    kerb: null,
    barrier: { type: 'wall', color: 0x5a5c66, height: 1.05, glow: [0xff2d95, 0x19e3ff], glowIntensity: 3 },
    embankment: null,
    shoulder: 0x2a2a30,
    shortcut: { color: 0x5e5e6c },
    rail: { glow: 0xff2d95, glowIntensity: 3.2, steel: 0x3a3c46, under: 0x16161c },
    accent: '#19e3ff',
  },

  build({ scene, track, index, density, envScene, shortcut, rails = [], banks = [], tunnels = [] }) {
    const gap = (s, side) => shortcut && shortcut.isGap(s, side);
    const rand = rng(7);
    const hw = track.halfWidth;
    const helix = rails.find((r) => r.kind === 'helix') || null;
    const bank = banks[0] || null;
    const subway = tunnels.find((t) => t.style === 'subway') || null;
    // where the road is below the street (the subway's ramps and tunnel)
    const below = (s) => track.y[Math.round(track.wrapS(s) / track.step) % track.n] < -0.4;
    // the corner tower the wall-ride curls round (inside the bend)
    let corner = null;
    if (bank) {
      const m = track.pointAt(bank.s0 + bank.span / 2, 0);
      const r = 1 / Math.max(1e-3, track.maxCurvatureAhead(bank.s0 + bank.span * 0.4, bank.span * 0.2));
      corner = { x: m.x - m.rx * bank.side * Math.min(r, 70), z: m.z - m.rz * bank.side * Math.min(r, 70) };
    }
    const carPark = helix ? { x: helix.centre[0], z: helix.centre[1], r: 46 } : null;
    // keep street furniture and towers off the set pieces (and out of the air off the roof jump)
    const flying = (r, s) => r.release && track.deltaS(r.s1, s) > 0 && track.deltaS(r.s1, s) < 170;
    const busy = (s) => rails.some((r) => r.inSpan(s, 30) || flying(r, s)) || (bank && bank.inSpan(s, 20)) || below(s);
    const clearOf = (x, z, m) => !(carPark && Math.hypot(x - carPark.x, z - carPark.z) < carPark.r + m) && !(corner && Math.hypot(x - corner.x, z - corner.z) < 38 + m);

    // the street: one big plane, with a hole where the road dips into the subway trench
    let trench = null;
    const shape = new THREE.Shape([[-3000, 3000], [3000, 3000], [3000, -3000], [-3000, -3000]].map(([x, y]) => new THREE.Vector2(x, y)));
    if (subway) {
      let s0 = subway.a, s1 = subway.b;
      while (below(s0 - 4)) s0 -= 4;
      while (below(s1 + 4)) s1 += 4;
      const edge = [], P = {};
      for (let s = s0 - 6; s <= s1 + 6; s += 4) { track.pointAt(s, -(hw + 2.6), P); edge.push(new THREE.Vector2(P.x, -P.z)); }
      for (let s = s1 + 6; s >= s0 - 6; s -= 4) { track.pointAt(s, hw + 2.6, P); edge.push(new THREE.Vector2(P.x, -P.z)); }
      shape.holes.push(new THREE.Path(edge));
      trench = [s0, s1];
    }
    const ground = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2), addWorldDetail(new THREE.MeshStandardMaterial({ color: 0x121218, roughness: 0.55, metalness: 0.3 }), { fine: [0.5, 0.5], macro: [0.02, 0.4], rough: 0.3 }));
    ground.position.y = -0.08;
    ground.receiveShadow = true;
    scene.add(ground);

    // towers
    const warm = windowTextures({ lit: ['#ffcf8a', '#ffe2b8', '#ffffff'], litChance: 0.4, seedValue: 3 });
    const cool = windowTextures({ lit: ['#8fd8ff', '#c8a8ff', '#ffffff'], litChance: 0.35, wall: '#141824', seedValue: 9 });
    const mats = [warm, cool].map((t) => new THREE.MeshStandardMaterial({
      map: t.map, emissiveMap: t.emissive, emissive: 0xffffff, emissiveIntensity: 1.1, roughness: 0.35, metalness: 0.5,
    }));
    const protos = [[30, 70, 30], [40, 120, 34], [24, 46, 24], [52, 36, 44], [22, 170, 22], [36, 90, 60]];
    const buckets = protos.map(() => [[], []]);
    const tops = [];
    const signSpots = [];
    const cell = 64;
    for (let gx = -1500; gx <= 1500; gx += cell) {
      for (let gz = -1300; gz <= 1300; gz += cell) {
        if (rand() < 0.12) continue;
        const pi = Math.floor(rand() * protos.length);
        const [w, h, d] = protos[pi];
        const x = gx + (rand() - 0.5) * 14, z = gz + (rand() - 0.5) * 14;
        const n = index.nearest(x, z, 3);
        const foot = Math.hypot(w, d) / 2;
        if (n.dist < hw + 10 + foot || !clearOf(x, z, foot)) continue;
        const centre = Math.hypot(x, z);
        const hs = (0.6 + rand() * 0.8) * (centre < 700 ? 1.3 : 0.8);
        const ry = (Math.floor(rand() * 4) * Math.PI) / 2;
        buckets[pi][rand() < 0.5 ? 0 : 1].push({ x, y: -0.1, z, ry, sx: 1, sy: hs, sz: 1 });
        if (h * hs > 90) tops.push({ x, y: h * hs + 1, z, s: 1 });
        if (n.dist < hw + 70 + foot && signSpots.length < 70 * density + 10) signSpots.push({ x, z, w, d, h: h * hs, ry, n });
      }
    }
    protos.forEach(([w, h, d], pi) => {
      const geo = buildingGeo(w, h, d);
      for (let m = 0; m < 2; m++) if (buckets[pi][m].length) scene.add(instanced(geo, mats[m], buckets[pi][m], { cast: false, receive: false }));
    });

    // blinking aircraft lights on the tallest towers
    const beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2020).multiplyScalar(6) });
    if (tops.length) scene.add(instanced(new THREE.SphereGeometry(0.9, 8, 6), beaconMat, tops, { cast: false }));

    // neon signs on facades facing the track
    const signMeshes = [];
    for (const sp of signSpots) {
      const text = SIGNS[Math.floor(rand() * SIGNS.length)];
      const col = NEON[Math.floor(rand() * NEON.length)];
      const tex = neonSignTexture(text, '#' + new THREE.Color(col).getHexString());
      const mat = new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0xffffff).multiplyScalar(2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const w = 16 + rand() * 10;
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.31), mat);
      // face the nearest track point
      const tx = track.x[sp.n.idx], tz = track.z[sp.n.idx];
      const ang = Math.atan2(tx - sp.x, tz - sp.z);
      const r = Math.max(sp.w, sp.d) / 2 + 0.8;
      sign.position.set(sp.x + Math.sin(ang) * r, 12 + rand() * Math.min(30, sp.h - 18), sp.z + Math.cos(ang) * r);
      sign.rotation.y = ang;
      sign.userData.flicker = rand() < 0.2;
      sign.userData.base = 2.2;
      signMeshes.push(sign);
      scene.add(sign);
    }

    // street lights + fake light pools on the wet road
    const poles = [], heads = [], pools = [];
    let side = 1;
    for (let s = 20; s < track.length; s += 38) {
      side = -side;
      if (gap(s, side) || busy(s)) continue;
      const p = track.pointAt(s, side * (hw + 2.2));
      poles.push({ x: p.x, y: 4.5, z: p.z, s: 1 });
      const arm = track.pointAt(s, side * (hw - 0.2));
      heads.push({ x: arm.x, y: 8.8, z: arm.z, ry: p.heading });
      const pool = track.pointAt(s, side * (hw - 2.5));
      pools.push({ x: pool.x, y: 0.05, z: pool.z, ry: p.heading });
    }
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2c33, roughness: 0.5, metalness: 0.7 });
    scene.add(instanced(new THREE.CylinderGeometry(0.15, 0.22, 9, 8), poleMat, poles));
    const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc48a).multiplyScalar(3.5) });
    scene.add(instanced(new THREE.BoxGeometry(4.8, 0.25, 0.6), headMat, heads, { cast: false }));
    const poolMat = new THREE.MeshBasicMaterial({ map: radialTexture('rgba(255,190,120,0.35)', 'rgba(255,160,90,0)'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const poolMesh = instanced(new THREE.PlaneGeometry(16, 22).rotateX(-Math.PI / 2), poolMat, pools, { cast: false });
    poolMesh.renderOrder = 1;
    scene.add(poolMesh);

    // neon arches over the road
    const arches = [], archS = [];
    for (let k = 0; k < 11; k++) {
      const s = (k + 0.5) * (track.length / 11);
      if (gap(s, 1) || gap(s, -1) || busy(s)) continue;
      archS.push(s);
      const p = track.pointAt(s, 0);
      const col = NEON[k % 2 ? 0 : 1];
      const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(5) });
      const g = new THREE.Group();
      const span = track.width + 3;
      const beam = new THREE.Mesh(new THREE.BoxGeometry(span, 0.35, 0.35), m);
      beam.position.y = 9;
      g.add(beam);
      for (const sx of [-1, 1]) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 9, 0.35), m);
        post.position.set((sx * span) / 2, 4.5, 0);
        g.add(post);
      }
      g.position.set(p.x, p.y, p.z);
      g.rotation.y = p.heading;
      g.userData.mat = m;
      g.userData.col = new THREE.Color(col);
      arches.push(g);
      scene.add(g);
    }

    const concrete = addWorldDetail(new THREE.MeshStandardMaterial({ color: 0x4a4a52, roughness: 0.85, side: THREE.DoubleSide }), { fine: [0.6, 0.4], macro: [0.03, 0.3], rough: 0.1, triplanar: true });
    const steel = new THREE.MeshStandardMaterial({ color: 0x2e3038, roughness: 0.45, metalness: 0.7 });
    const neonMat = (c, k = 3.2) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), side: THREE.DoubleSide });
    const ribbonAlong = (s0, s1, lat0, lat1, h0, h1, mat, stepS = 3) => {
      // a strip along the road between (lat0, h0) and (lat1, h1), heights above the road
      const pos = [], idx = [];
      let n = 0;
      const P = {};
      for (let s = s0; s <= s1 + 1e-6; s += stepS, n++) {
        for (const [lat, h] of [[lat0, h0], [lat1, h1]]) { track.pointAt(s, lat, P); pos.push(P.x, P.y + (typeof h === 'function' ? h(P.y) : h), P.z); }
        if (s + stepS <= s1 + 1e-6) { const p = n * 2; idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      scene.add(m);
      return m;
    };
    const trains = [];

    // --- the subway: trench walls down the ramps, pillars and a train beside the road ----------
    if (subway && trench) {
      const [s0, s1] = trench;
      // trench walls from the road up to the street, with a lit parapet
      const toStreet = (y) => -y + 0.9;
      for (const sd of [-1, 1]) {
        ribbonAlong(s0 - 6, subway.a + 2, sd * (hw + 2.4), sd * (hw + 2.4), -0.2, toStreet, concrete);
        ribbonAlong(subway.b - 2, s1 + 6, sd * (hw + 2.4), sd * (hw + 2.4), -0.2, toStreet, concrete);
        ribbonAlong(s0 - 6, subway.a + 2, sd * (hw + 2.4), sd * (hw + 2.9), toStreet, toStreet, neonMat(sd < 0 ? 0xff2d95 : 0x19e3ff, 2.4));
        ribbonAlong(subway.b - 2, s1 + 6, sd * (hw + 2.4), sd * (hw + 2.9), toStreet, toStreet, neonMat(sd < 0 ? 0xff2d95 : 0x19e3ff, 2.4));
      }
      // a row of pillars between the road and the train bay, a platform edge and the rails
      const pillars = [], P = {};
      for (let s = subway.a + 6; s < subway.b - 4; s += 9) { track.pointAt(s, hw + 3, P); pillars.push({ x: P.x, y: P.y, z: P.z, ry: P.heading }); }
      scene.add(instanced(new THREE.BoxGeometry(0.9, 7, 0.9).translate(0, 3.5, 0), concrete, pillars));
      ribbonAlong(subway.a + 2, subway.b - 2, hw + 6.5, hw + 6.5, 0.4, 0.4, steel, 2);
      ribbonAlong(subway.a + 2, subway.b - 2, hw + 8.0, hw + 8.0, 0.4, 0.4, steel, 2);
      const bayPts = [];
      for (let s = subway.a + 2; s <= subway.b - 2; s += 6) { track.pointAt(s, hw + 7.2, P); bayPts.push([P.x, P.z]); }
      const sub = new Train({ points: bayPts, cars: 2, speed: 22, accel: 4, dwell: 2, carLen: 16, locoLen: 16, offset: rand() * 20 });
      const carGeo = new THREE.BoxGeometry(3.0, 3.4, 15.6).translate(0, 2.2, 0);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd4, roughness: 0.35, metalness: 0.6, emissive: 0x101820 });
      const meshes = sub.units.map(() => {
        const m = new THREE.Mesh(carGeo, bodyMat);
        const win = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.8, 13), neonMat(0xfff2d0, 2.2));
        win.position.y = 2.8;
        m.add(win);
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.06, 0.18, 15.6), neonMat(0xff2d95, 3));
        stripe.position.y = 1.4;
        m.add(stripe);
        scene.add(m);
        return m;
      });
      trains.push({ train: sub, meshes, y: track.pointAt((subway.a + subway.b) / 2, 0).y + 0.4 });
    }

    // --- the car park round the helix: a lit concrete frame on pillars, a core and a P sign -----
    if (helix && carPark) {
      const g = new THREE.Group();
      const R = 38, n = 18;
      // nothing of the frame may stand in the road's way in or out (along the road line)
      const E = track.pointAt(helix.s0, 0);
      const inRoad = (lx, lz) => Math.abs((carPark.x + lx - E.x) * E.rx + (carPark.z + lz - E.z) * E.rz) < hw + 3;
      const pillars = [];
      for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2, x = Math.cos(a) * R, z = Math.sin(a) * R; if (!inRoad(x, z)) pillars.push({ x, y: 0, z }); }
      g.add(instanced(new THREE.BoxGeometry(1.4, helix.height + 2.5, 1.4).translate(0, (helix.height + 2.5) / 2, 0), concrete, pillars));
      // a floor ring halfway up and neon round each level
      const ring = new THREE.Mesh(new THREE.RingGeometry(35.6, 40, 72).rotateX(-Math.PI / 2), concrete);
      ring.position.y = helix.height / 2 - 0.4;
      g.add(ring);
      for (const [h, c] of [[helix.height / 2 - 0.5, 0x19e3ff], [helix.height + 3.2, 0xff2d95]]) {
        // the ring in arcs, broken where the road runs through
        let arc = [];
        const flush = () => { if (arc.length > 2) { const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arc), arc.length * 2, 0.16, 6, false), neonMat(c, 4)); tube.position.y = h; g.add(tube); } arc = []; };
        for (let k = 0; k <= 96; k++) {
          const a = (k / 96) * Math.PI * 2, x = Math.cos(a) * 40.1, z = Math.sin(a) * 40.1;
          if (inRoad(x, z)) flush(); else arc.push(new THREE.Vector3(x, 0, z));
        }
        flush();
      }
      const core = new THREE.Mesh(new THREE.CylinderGeometry(11, 11, helix.height + 6, 24), concrete);
      core.position.y = (helix.height + 6) / 2;
      g.add(core);
      const pTex = holoTexture('P', '#3fb8ff');
      for (let k = 0; k < 4; k++) {
        const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), new THREE.MeshBasicMaterial({ map: pTex, color: new THREE.Color(0xffffff).multiplyScalar(2.5), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
        const a = (k / 4) * Math.PI * 2;
        sign.position.set(Math.sin(a) * 11.2, helix.height + 2, Math.cos(a) * 11.2);
        sign.rotation.y = a;
        g.add(sign);
      }
      g.position.set(carPark.x, track.pointAt(helix.s0, 0).y, carPark.z);
      g.traverse((o) => { o.castShadow = true; o.receiveShadow = true; });
      scene.add(g);
      // a ROOF JUMP sign at the edge of the roof, facing the cars coming up
      const edge = helix.pose(helix.length - 1, 0);
      const jumpSign = new THREE.Mesh(new THREE.PlaneGeometry(14, 2.4), new THREE.MeshBasicMaterial({ map: holoTexture('ROOF JUMP', '#ffd23f'), color: new THREE.Color(0xffffff).multiplyScalar(2), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
      jumpSign.position.set(edge.x, edge.y + 5.5, edge.z);
      jumpSign.rotation.y = Math.atan2(edge.tx, edge.tz) + Math.PI;
      scene.add(jumpSign);
    }

    // --- the corner tower the wall-ride wraps round -----------------------------------------
    const holos = [];
    if (corner) {
      const tower = new THREE.Mesh(buildingGeo(44, 190, 44), mats[1]);
      tower.position.set(corner.x, -0.1, corner.z);
      scene.add(tower);
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        const strip = new THREE.Mesh(new THREE.BoxGeometry(0.6, 188, 0.6), neonMat(k % 2 ? 0x19e3ff : 0xff2d95, 4));
        strip.position.set(corner.x + Math.cos(a) * 31, 94, corner.z + Math.sin(a) * 31);
        scene.add(strip);
      }
      const tex = holoTexture('WALL RIDE', '#19e3ff');
      const m = new THREE.Mesh(new THREE.PlaneGeometry(40, 20), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0xffffff).multiplyScalar(2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const p = track.pointAt(bank.s0 - 30, 0);
      m.position.set(corner.x, 46, corner.z);
      m.rotation.y = Math.atan2(p.x - corner.x, p.z - corner.z);
      scene.add(m);
      holos.push({ mesh: m, tex, ph: 0 });
    }

    // --- an elevated line over the east side: portal frames, a deck, and a train on it ---------
    let el = null;
    {
      // the longest straight that's free of set pieces and shortcuts
      let best = null;
      for (let s = 0; s < track.length; s += 10) {
        let len = 0;
        while (len < 500 && track.maxCurvatureAhead(s + len, 10) < 0.002 && !busy(s + len) && !(shortcut && (shortcut.isGap(s + len, 1) || shortcut.isGap(s + len, -1)))) len += 10;
        if (!best || len > best.len) best = { s, len };
      }
      if (best) best = { s: best.s + 20, len: best.len - 40 }; // clear of the bends at both ends
      if (best && best.len > 160) {
        const H = 15, P = {};
        const frames = [];
        for (let s = best.s; s <= best.s + best.len; s += 32) {
          for (const sd of [-1, 1]) { track.pointAt(s, sd * (hw + 3), P); frames.push({ x: P.x, y: P.y, z: P.z, ry: P.heading }); }
        }
        scene.add(instanced(new THREE.BoxGeometry(1.2, H, 1.2).translate(0, H / 2, 0), steel, frames));
        for (let s = best.s; s <= best.s + best.len; s += 32) {
          const p = track.pointAt(s, 0);
          const beam = new THREE.Mesh(new THREE.BoxGeometry(track.width + 7, 1.2, 1.4), steel);
          beam.position.set(p.x, p.y + H - 0.6, p.z);
          beam.rotation.y = p.heading;
          beam.castShadow = true;
          scene.add(beam);
        }
        ribbonAlong(best.s - 4, best.s + best.len + 4, -4.5, 4.5, H, H, concrete, 4);
        ribbonAlong(best.s - 4, best.s + best.len + 4, -4.6, -4.4, H - 0.7, H - 0.7, neonMat(0x8a3cff, 4), 4);
        ribbonAlong(best.s - 4, best.s + best.len + 4, 4.4, 4.6, H - 0.7, H - 0.7, neonMat(0x8a3cff, 4), 4);
        const pts = [];
        for (let s = best.s; s <= best.s + best.len; s += 8) { track.pointAt(s, 0, P); pts.push([P.x, P.z]); }
        const tr = new Train({ points: pts, cars: 2, speed: 24, accel: 4, dwell: 3, carLen: 15, locoLen: 15, offset: rand() * 30 });
        const carGeo = new THREE.BoxGeometry(3.0, 3.2, 14.6).translate(0, H + 2, 0);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2a2a34, roughness: 0.4, metalness: 0.6 });
        const meshes = tr.units.map((u, i) => {
          const m = new THREE.Mesh(carGeo, bodyMat);
          const win = new THREE.Mesh(new THREE.BoxGeometry(3.05, 0.7, 12.6), neonMat(i % 2 ? 0x19e3ff : 0xffd23f, 2.6));
          win.position.y = H + 2.6;
          m.add(win);
          scene.add(m);
          return m;
        });
        el = { train: tr, meshes, y: track.pointAt(best.s, 0).y };
        trains.push(el);
      }
    }

    // --- holo billboards facing the road, and steam from the manholes ---------------------------
    const P2 = {};
    for (let k = 0; k < 6; k++) {
      const s = ((k + 0.25) / 6) * track.length;
      if (busy(s)) continue;
      const sd = k % 2 ? 1 : -1;
      track.pointAt(s, sd * (hw + 26), P2);
      if (!clearOf(P2.x, P2.z, 10) || index.nearest(P2.x, P2.z, 2).dist < hw + 18) continue;
      const col = '#' + new THREE.Color(NEON[k % NEON.length]).getHexString();
      const tex = holoTexture(HOLO[k % HOLO.length], col);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(30, 15), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(0xffffff).multiplyScalar(2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const back = track.pointAt(s - 80, 0);
      m.position.set(P2.x, 14, P2.z);
      m.rotation.y = Math.atan2(back.x - P2.x, back.z - P2.z);
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.8, 7, 0.8).translate(0, 3.5, 0), steel);
      pole.position.set(P2.x, 0, P2.z);
      scene.add(m, pole);
      holos.push({ mesh: m, tex, ph: k * 1.7 });
    }
    const steamTex = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 64);
    const vents = [];
    for (let s = 60; s < track.length; s += 210) {
      if (busy(s)) continue;
      const p = track.pointAt(s, (rand() < 0.5 ? -1 : 1) * (hw - 3));
      for (let k = 0; k < 7; k++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, color: 0x9a8ab0, transparent: true, opacity: 0.25, depthWrite: false }));
        sp.userData = { x: p.x, y: p.y, z: p.z, t: k / 7 };
        scene.add(sp);
        vents.push(sp);
      }
    }

    // env map: neon blocks around the horizon so paint and wet road reflect colour
    for (let i = 0; i < 18; i++) {
      const a = (i / 26) * Math.PI * 2;
      const col = NEON[i % NEON.length];
      const b = new THREE.Mesh(new THREE.BoxGeometry(18 + rand() * 20, 6 + rand() * 30, 4), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(0.9) }));
      b.position.set(Math.cos(a) * 150, 5 + rand() * 40, Math.sin(a) * 150);
      b.lookAt(0, b.position.y, 0);
      envScene.add(b);
    }
    for (let i = 0; i < 40; i++) {
      const a = rand() * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.BoxGeometry(30, 60 + rand() * 120, 30), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x1a1830).multiplyScalar(1) }));
      b.position.set(Math.cos(a) * 250, 0, Math.sin(a) * 250);
      envScene.add(b);
    }

    return {
      landmark: { s: archS, range: 14 },
      update(dt, time) {
        const blink = Math.sin(time * 3) > 0.6 ? 6 : 0.4;
        beaconMat.color.setRGB(blink, 0.12 * blink, 0.12 * blink);
        for (const s of signMeshes) {
          if (!s.userData.flicker) continue;
          const on = Math.sin(time * 23 + s.id) > -0.7 || Math.sin(time * 1.3 + s.id) > 0;
          s.material.color.setScalar(on ? s.userData.base : 0.3);
        }
        arches.forEach((g, i) => {
          const k = 3.5 + Math.sin(time * 2 + i) * 1.5;
          g.userData.mat.color.copy(g.userData.col).multiplyScalar(k);
        });
        for (const t of trains) {
          t.train.setTime(time);
          t.train.layout().forEach((u, i) => {
            t.meshes[i].position.set(u.x, t.y, u.z);
            t.meshes[i].rotation.y = u.heading;
          });
        }
        for (const h of holos) {
          h.tex.offset.y = (time * 0.15 + h.ph) % 1 * 0.03; // the scan lines crawl
          const glitch = Math.sin(time * 17 + h.ph * 5) > 0.97 ? 0.4 : 1;
          h.mesh.material.color.setScalar((1.8 + 0.4 * Math.sin(time * 2 + h.ph)) * glitch);
        }
        for (const sp of vents) {
          const u = sp.userData, t = (u.t + time * 0.18) % 1;
          sp.position.set(u.x + Math.sin(time + u.t * 7) * 0.6, u.y + 0.3 + t * 7, u.z);
          const s = 1.5 + t * 4.5;
          sp.scale.set(s, s, 1);
          sp.material.opacity = 0.28 * Math.min(1, t * 5) * (1 - t);
        }
      },
    };
  },
};
