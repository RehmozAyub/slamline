// SKYPORT: a race around a working airport. The long south straight is the runway (markings,
// edge and approach lights, jets climbing out overhead); a terminal with parked airliners, a
// control tower and hangars fill the infield. Shortcuts are taxiways behind boom barriers.
// The race bursts out of a maintenance hangar onto the runway, where a jet on the parallel
// runway starts its take-off run beside you (sit in its blast for a boost), jumps the cargo
// dock off the runway's end and ducks under a taxiway bridge as a jet rolls across it.
import * as THREE from 'three';
import { LAYOUTS } from './layouts.js';
import { rng, colored, merge, instanced } from '../scenery.js';
import { addWorldDetail } from '../detail.js';
import { windowTextures, textTexture, radialTexture } from '../textures.js';
import { TUNNEL_STYLES } from '../tunnel.js';

const CONTAINER = [0xc83a2a, 0x2a6ab0, 0x3a8a4a, 0xe8a020, 0x8a8e94, 0x6a3a8a, 0xd86a20];

const LIVERY = [0xd01828, 0x1a4ab0, 0x0a8a5a, 0xff8a00, 0x5a2ab0, 0x18a8d8, 0x222428];

// an airliner pointing along +z, wheels on y = 0: [white body parts, tail/livery parts]
function airlinerGeos() {
  const body = [], tail = [];
  const L = 38, R = 2.1;
  body.push(new THREE.CylinderGeometry(R, R, L * 0.72, 16).rotateX(Math.PI / 2).translate(0, 3.6, 0));
  body.push(new THREE.SphereGeometry(R, 16, 10).scale(1, 0.9, 1.7).translate(0, 3.5, L * 0.36));
  body.push(new THREE.ConeGeometry(R, L * 0.28, 16).rotateX(-Math.PI / 2).scale(1, 0.8, 1).translate(0, 4.1, -L * 0.5));
  // swept wings and tailplane
  const wing = (span, root, tip, sweep, y, z) => {
    const sh = new THREE.Shape([new THREE.Vector2(0, root / 2), new THREE.Vector2(span, root / 2 - sweep), new THREE.Vector2(span, root / 2 - sweep - tip), new THREE.Vector2(0, -root / 2)]);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.35, bevelEnabled: false });
    g.rotateX(Math.PI / 2);
    const r = g.clone().scale(-1, 1, 1);
    return [g.translate(0, y, z), r.translate(0, y, z)];
  };
  body.push(...wing(17, 8, 2.4, 7, 2.8, 2));
  tail.push(...wing(6.5, 4, 1.6, 3.2, 4.6, -16.5));
  // engines under the wings
  for (const sx of [-1, 1]) body.push(new THREE.CylinderGeometry(1.15, 1.0, 4.4, 12).rotateX(Math.PI / 2).translate(sx * 6.2, 1.9, 3.6));
  // the fin
  const fin = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(6.5, 0), new THREE.Vector2(9.5, 7.5), new THREE.Vector2(6.5, 7.5)]);
  tail.push(new THREE.ExtrudeGeometry(fin, { depth: 0.4, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(0.2, 5.2, -19.5));
  // cockpit windows
  tail.push(new THREE.BoxGeometry(2.2, 0.5, 0.8).translate(0, 4.6, L * 0.38));
  const clean = (list) => merge(list.map((g) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (!['position', 'normal'].includes(k)) n.deleteAttribute(k); n.computeVertexNormals(); return n; }));
  return [clean(body), clean(tail)];
}

function hangarGeo() {
  const parts = [colored(new THREE.CylinderGeometry(28, 28, 70, 24, 1, false, -Math.PI / 2, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).scale(1, 0.55, 1).translate(0, 0, 0), 0x9aa0a8, 0xc8ccd2)];
  parts.push(colored(new THREE.BoxGeometry(54, 13, 1).translate(0, 6.5, 35.2), 0x3a3e46));
  return merge(parts);
}

// runway paint (white on transparent): threshold bars and the runway number
function runwayTexture(num) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(240,240,240,0.92)';
  for (let k = 0; k < 8; k++) if (k !== 3 && k !== 4) g.fillRect(12 + k * 30, 0, 18, 220);
  g.font = 'bold 170px "Arial Narrow", Bahnschrift, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(num, 128, 380);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export default {
  id: 'airport',
  name: 'SKYPORT',
  tagline: 'Runways, taxiways and jets taking off overhead',
  weatherLabel: 'CLEAR SKIES',
  layout: LAYOUTS.airport,
  exposure: 1.0,
  envIntensity: 1.0,
  bloom: { strength: 0.2, radius: 0.45, threshold: 1.15 },
  fog: { color: 0xc4d4e4, density: 0.0011 },
  sky: {
    top: 0x3a7ad0, horizon: 0xcfe0f0, bottom: 0x8a9aa4,
    sunDir: new THREE.Vector3(0.4, 0.62, 0.45), sunColor: 0xfff6e8, sunSize: 0.0012, sunIntensity: 12, glow: 0.5,
    clouds: 0.35, cloudColor: 0xffffff, horizonSharp: 0.5,
  },
  sun: { color: 0xfff2e0, intensity: 3.2 },
  hemi: { sky: 0xbcd4f0, ground: 0x6a7a5a, intensity: 1.2 },
  smoke: [0.8, 0.8, 0.82],
  trackStyle: {
    road: { base: '#3c3e44', line: '#f4f4f4', edge: '#f4f4f4', lanes: 2, roughness: 0.84, cracks: 0.6, patches: 2, seed: 61 }, // grooved runway asphalt
    kerb: null,
    barrier: { type: 'wall', color: 0xc8c8c0, height: 0.9 },
    embankment: null,
    shoulder: 0x6a6a68,
    shortcut: { color: 0x34363c, taxiway: true, studs: 0x2a6aff, sign: 'TAXIWAY B ›', signBg: '#111111', signFg: '#ffd400', fence: 'boom', guide: 0xffd23f },
    accent: '#ffd400',
  },

  build({ scene, track, index, density, envScene, shortcut, jumps = [], tunnels = [] }) {
    const rand = rng(909);
    const hw = track.halfWidth;
    const clear = (x, z, r) => index.nearest(x, z, 4).dist > hw + r;
    const jump = jumps[0] || null, hangar = tunnels.find((t) => t.style === 'hangar') || null;

    // the cargo dock under the jump's gap: a sunken bay (a hole in the ground) full of containers
    let dock = null;
    if (jump) {
      const m = track.pointAt(track.wrapS(jump.sLip + jump.gap / 2), 0);
      dock = { x: m.x, z: m.z, y: m.y, tx: m.tx, tz: m.tz, rx: m.rx, rz: m.rz, heading: m.heading, half: jump.gap / 2, wide: 46, depth: 12 };
      dock.at = (a, u) => [dock.x + dock.tx * a + dock.rx * u, dock.z + dock.tz * a + dock.rz * u];
    }
    // grass with mown stripes (round the dock's hole), and concrete aprons
    let groundGeo = new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2);
    if (dock) {
      const sh = new THREE.Shape([[-3000, -3000], [3000, -3000], [3000, 3000], [-3000, 3000]].map(([x, y]) => new THREE.Vector2(x, y)));
      // (the shape is drawn in x, -z: rotateX(-90deg) turns its y into -z)
      sh.holes.push(new THREE.Path([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, u]) => { const [x, z] = dock.at(a * dock.half, u * dock.wide); return new THREE.Vector2(x, -z); })));
      groundGeo = new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2);
    }
    const ground = new THREE.Mesh(groundGeo, addWorldDetail(new THREE.MeshStandardMaterial({ color: 0x6a8a46, roughness: 1 }), { fine: [0.5, 0.35], macro: [0.01, 0.4], rough: 0 }));
    ground.position.y = -0.1;
    ground.receiveShadow = true;
    scene.add(ground);
    const apronMat = addWorldDetail(new THREE.MeshStandardMaterial({ color: 0x8a8c90, roughness: 0.9 }), { fine: [0.8, 0.2], macro: [0.03, 0.2], rough: 0.05 });

    // the runway: the longest straight stretch of the track
    let best = { len: 0, i0: 0 };
    for (let i = 0, run = 0; i < track.n * 2; i++) {
      const j = i % track.n;
      if (Math.abs(track.curv[j]) < 0.0009) { run++; if (run > best.len) best = { len: run, i0: (i - run + 1 + track.n * 2) % track.n }; } else run = 0;
      if (run >= track.n) break;
    }
    const rwS0 = best.i0 * track.step, rwLen = best.len * track.step;
    const runwayS = [];
    for (let s = 60; s < rwLen - 60; s += 40) runwayS.push(track.wrapS(rwS0 + s));

    // runway paint at both ends
    for (const [u, num, flip] of [[0.03, '09', 0], [0.97, '27', Math.PI]]) {
      let sp = rwS0 + rwLen * u;
      if (jump && jump.near(sp, 20)) sp = jump.sRamp - 30; // (not over the dock)
      const p = track.pointAt(sp, 0);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(track.width * 0.82, track.width * 1.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: runwayTexture(num), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
      m.position.set(p.x, p.y + 0.03, p.z);
      m.rotation.y = p.heading + Math.PI + flip;
      m.renderOrder = 2;
      scene.add(m);
    }

    // edge lights: white along the runway, blue taxiway lights elsewhere
    const white = [], blue = [];
    for (let s = 0; s < track.length; s += 24) {
      const onRunway = track.deltaS(rwS0, s) >= 0 && track.deltaS(rwS0, s) <= rwLen;
      if (jump && jump.near(s, 3)) continue;
      for (const sd of [-1, 1]) {
        const p = track.pointAt(s, sd * (hw + 1.4));
        if (index.nearest(p.x, p.z, 2).dist < hw + 0.5) continue;
        (onRunway ? white : blue).push({ x: p.x, y: p.y + 0.25, z: p.z });
      }
    }
    const lightGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.5, 8);
    scene.add(instanced(lightGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff4d8).multiplyScalar(2.2) }), white, { cast: false }));
    scene.add(instanced(lightGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x2a6aff).multiplyScalar(2.2) }), blue, { cast: false }));

    // approach lights beyond both ends of the runway
    const appr = [], poles = [];
    for (const [end, dir] of [[rwS0, -1], [rwS0 + rwLen, 1]]) {
      const p = track.pointAt(end, 0);
      const fx = Math.sin(p.heading) * dir, fz = Math.cos(p.heading) * dir;
      for (let k = 2; k < 14; k++) {
        const x = p.x + fx * k * 30, z = p.z + fz * k * 30;
        if (!clear(x, z, 6)) continue;
        for (let w = -2; w <= 2; w++) {
          const lx = x + Math.cos(p.heading) * w * 2.2, lz = z - Math.sin(p.heading) * w * 2.2;
          appr.push({ x: lx, y: 2.6, z: lz });
        }
        poles.push({ x, y: 1.25, z, s: 1 });
      }
    }
    scene.add(instanced(new THREE.SphereGeometry(0.35, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3a2a).multiplyScalar(2.6) }), appr, { cast: false }));
    const rabbit = [];
    const strobeTex = radialTexture('rgba(255,255,255,1)', 'rgba(200,220,255,0)', 32);
    for (const [end, dir] of [[rwS0, -1], [rwS0 + rwLen, 1]]) {
      const p = track.pointAt(end, 0), row = [];
      for (let k = 13; k >= 2; k--) {
        const x = p.x + Math.sin(p.heading) * dir * k * 30, z = p.z + Math.cos(p.heading) * dir * k * 30;
        if (!clear(x, z, 6)) continue;
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: strobeTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        sp.position.set(x, 3.4, z);
        sp.scale.setScalar(7);
        scene.add(sp);
        row.push(sp);
      }
      rabbit.push(row);
    }
    scene.add(instanced(new THREE.BoxGeometry(0.2, 2.5, 0.2), new THREE.MeshStandardMaterial({ color: 0x5a5a5a }), poles, { cast: false }));

    // terminal in the infield (only if the infield really is clear there)
    const win = windowTextures({ cols: 6, rows: 3, wall: '#c8ccd2', lit: ['#bfe0ff', '#ffffff'], litChance: 0.2, frame: '#5a6068', seedValue: 5 });
    const glassMat = new THREE.MeshStandardMaterial({ map: win.map, roughness: 0.2, metalness: 0.6 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xe8eaee, roughness: 0.5, metalness: 0.3 });
    const termC = { x: -120, z: -10 }, termL = 340;
    const parked = [];
    if ([-1, 0, 1].every((k) => clear(termC.x + (k * termL) / 2, termC.z, 80))) {
      const body = new THREE.BoxGeometry(termL, 18, 30);
      const uv = body.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (termL / 30), uv.getY(i) * 2);
      win.map.wrapS = win.map.wrapT = THREE.RepeatWrapping;
      const term = new THREE.Mesh(body, glassMat);
      term.position.set(termC.x, 9, termC.z);
      term.castShadow = term.receiveShadow = true;
      scene.add(term);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, termL + 20, 24, 1, false, -0.9, 1.8).rotateZ(Math.PI / 2), roofMat);
      roof.scale.set(1, 0.35, 1);
      roof.position.set(termC.x, 14, termC.z);
      scene.add(roof);
      const apron = new THREE.Mesh(new THREE.PlaneGeometry(termL + 120, 150).rotateX(-Math.PI / 2), apronMat);
      apron.position.set(termC.x, -0.06, termC.z - 80);
      apron.receiveShadow = true;
      scene.add(apron);
      // jet bridges and airliners parked at the gates
      const bridges = [];
      for (let k = 0; k < 6; k++) {
        const gx = termC.x - termL / 2 + 30 + k * ((termL - 60) / 5);
        bridges.push({ x: gx, y: 5.5, z: termC.z - 15 - 9, s: 1 });
        parked.push({ x: gx - 8, y: 0, z: termC.z - 15 - 34, ry: 0, color: LIVERY[k % LIVERY.length] });
      }
      scene.add(instanced(new THREE.BoxGeometry(3.4, 3.2, 18), new THREE.MeshStandardMaterial({ color: 0xb0b4ba, metalness: 0.4, roughness: 0.4 }), bridges));
    }

    // control tower
    const tower = { x: 260, z: -150 };
    let towerTop = null;
    if (clear(tower.x, tower.z, 40)) {
      const conc = new THREE.MeshStandardMaterial({ color: 0xd8d8d2, roughness: 0.8 });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(4, 5.5, 52, 16).translate(0, 26, 0), conc);
      const cab = new THREE.Mesh(new THREE.CylinderGeometry(9, 7, 7, 16).translate(0, 56, 0), new THREE.MeshStandardMaterial({ color: 0x1a2a3a, metalness: 0.8, roughness: 0.1 }));
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(10, 10, 1.2, 16).translate(0, 60, 0), conc);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 10, 6).translate(0, 66, 0), conc);
      for (const m of [shaft, cab, lid, mast]) { m.position.set(tower.x, 0, tower.z); m.castShadow = true; scene.add(m); }
      towerTop = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff2020).multiplyScalar(5) }));
      towerTop.position.set(tower.x, 71.5, tower.z);
      scene.add(towerTop);
    }

    // hangars and more parked jets around the outside
    const hangars = [];
    for (let k = 0; k < 5; k++) {
      const x = -420 + k * 190, z = 470 + (k % 2) * 25;
      if (clear(x, z, 60)) {
        hangars.push({ x, y: 0, z, ry: Math.PI, s: 1 });
        if (rand() < 0.7 && clear(x, z - 70, 30)) parked.push({ x, y: 0, z: z - 70, ry: Math.PI, color: LIVERY[Math.floor(rand() * LIVERY.length)] });
      }
    }
    if (hangars.length) scene.add(instanced(hangarGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 }), hangars, { receive: true }));
    const [bodyGeo, tailGeo] = airlinerGeos();
    const fuselage = new THREE.MeshStandardMaterial({ color: 0xf2f4f6, roughness: 0.35, metalness: 0.2, side: THREE.DoubleSide });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, side: THREE.DoubleSide });
    if (parked.length) {
      scene.add(instanced(bodyGeo, fuselage, parked.map(({ color, ...p }) => p))); // white bodies; the livery colour is the tail's
      scene.add(instanced(tailGeo, tailMat, parked));
    }

    const r0 = track.pointAt(rwS0, 0), r1 = track.pointAt(rwS0 + rwLen, 0);
    const dirX = (r1.x - r0.x) / rwLen, dirZ = (r1.z - r0.z) / rwLen;
    const jetOf = (color) => {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(bodyGeo, fuselage), new THREE.Mesh(tailGeo, new THREE.MeshStandardMaterial({ color, roughness: 0.4, side: THREE.DoubleSide })));
      g.rotation.order = 'YXZ'; // heading, then nose up
      g.traverse((o) => { o.castShadow = true; });
      return g;
    };

    // --- the parallel runway and the jet on its take-off run: hot blast behind it ----------
    // (outside the track, beside the race's runway; the jet holds a way down it, rolls as a
    // car comes past and accelerates hard: it overtakes the car and lifts off down the runway)
    const out = Math.hypot(track.pointAt(rwS0 + rwLen / 2, 40).x, track.pointAt(rwS0 + rwLen / 2, 40).z) > Math.hypot(track.pointAt(rwS0 + rwLen / 2, -40).x, track.pointAt(rwS0 + rwLen / 2, -40).z) ? 1 : -1;
    const lane = out * 33, holdD = (hangar ? track.deltaS(rwS0, hangar.b) : 0) + 140;
    const stripEnd = jump ? Math.min(rwLen + 60, track.deltaS(rwS0, jump.sRamp) - 6) : rwLen + 60; // (it stops short of the dock)
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(44, stripEnd - holdD + 60).rotateX(-Math.PI / 2), apronMat);
    {
      const c = track.pointAt(rwS0 + (holdD - 60 + stripEnd) / 2, lane);
      strip.position.set(c.x, -0.05, c.z);
      strip.rotation.y = Math.atan2(dirX, dirZ);
      strip.receiveShadow = true;
      scene.add(strip);
      const dashes = [];
      for (let d = holdD; d < stripEnd - 10; d += 30) { const p = track.pointAt(rwS0 + d, lane); dashes.push({ x: p.x, y: -0.02, z: p.z, ry: p.heading }); }
      scene.add(instanced(new THREE.PlaneGeometry(0.5, 14).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf0f0f0 }), dashes, { cast: false }));
    }
    const jet = jetOf(LIVERY[1]);
    scene.add(jet);
    const plumeMat = new THREE.MeshBasicMaterial({ color: 0xffc890, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
    const plumes = [-6.2, 6.2].map((x) => { const m = new THREE.Mesh(new THREE.ConeGeometry(1.1, 10, 12, 1, true).translate(0, -5, 0).rotateX(Math.PI / 2), plumeMat); m.position.set(x, 1.9, 1.4); jet.add(m); return m; });
    const J = { state: 'hold', d: holdD, v: 0, y: 0, t: 0 };
    const blast = { active: false, x: 0, y: 0, z: 0, dx: dirX, dz: dirZ };
    const dustN = 160, dustPos = new Float32Array(dustN * 3), dustAge = new Float32Array(dustN).fill(9);
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dust = new THREE.Points(dg, new THREE.PointsMaterial({ map: radialTexture('rgba(255,255,255,0.8)', 'rgba(255,255,255,0)', 32), color: 0xd8d4c8, size: 6, transparent: true, opacity: 0.45, depthWrite: false }));
    dust.frustumCulled = false;
    scene.add(dust);
    let dustK = 0;
    const tmpQ = {};

    // --- the maintenance hangar: open doors, an arched roof, jets in for service ------------
    if (hangar) {
      const T = TUNNEL_STYLES.hangar, W = hw + T.width + 3, len = track.deltaS(hangar.a, hangar.b);
      const mid = track.pointAt(track.wrapS((hangar.a + hangar.b) / 2), 0);
      const shell = new THREE.MeshStandardMaterial({ color: 0xa8aeb6, roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide });
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(W, W, len, 32, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).scale(1, 0.32, 1), shell);
      roof.position.set(mid.x, mid.y + T.top - 0.6, mid.z);
      roof.rotation.y = mid.heading;
      scene.add(roof);
      for (const [sv, dir] of [[hangar.a, -1], [hangar.b, 1]]) {
        const p = track.pointAt(track.wrapS(sv + dir * 1.2), 0);
        // the big doors, slid open to either side of the opening
        for (const sd of [-1, 1]) {
          const q = track.pointAt(track.wrapS(sv + dir * 1.2), sd * (W - 6));
          const door = new THREE.Mesh(new THREE.BoxGeometry(12, T.top - 1, 0.6).translate(0, (T.top - 1) / 2, 0), new THREE.MeshStandardMaterial({ color: 0x5a6270, roughness: 0.5, metalness: 0.5 }));
          door.position.set(q.x, q.y - 0.6, q.z);
          door.rotation.y = p.heading;
          scene.add(door);
        }
        if (dir < 0) {
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(30, 3.4), new THREE.MeshBasicMaterial({ map: textTexture('SKYPORT  MAINTENANCE', { bg: '#1a2a4a', fg: '#ffffff', stripes: false }), side: THREE.DoubleSide }));
          sign.position.set(p.x, p.y + T.top - 2.6, p.z);
          sign.rotation.y = p.heading + Math.PI; // facing the cars coming in
          scene.add(sign);
        }
      }
      // two business jets inside (scaled-down airliners), noses in toward the walls
      const inside = [];
      for (const [f, sd] of [[0.3, -1], [0.7, 1]]) {
        const p = track.pointAt(track.wrapS(hangar.a + len * f), sd * (hw + 14));
        const j = jetOf(LIVERY[Math.floor(rand() * LIVERY.length)]);
        j.scale.setScalar(0.42);
        j.position.set(p.x, p.y - 0.6, p.z);
        j.rotation.y = p.heading + sd * Math.PI / 2;
        scene.add(j);
        inside.push(j);
      }
      // tool carts and stairs along the walls
      const carts = [];
      for (let k = 0; k < 10; k++) {
        const sd = rand() < 0.5 ? -1 : 1, p = track.pointAt(track.wrapS(hangar.a + 6 + rand() * (len - 12)), sd * (W - 4 - rand() * 3));
        carts.push({ x: p.x, y: p.y - 0.6, z: p.z, ry: p.heading + rand(), sx: 1.4 + rand(), sy: 1 + rand() * 1.6, sz: 1.2 + rand() });
      }
      scene.add(instanced(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0xd8202a, roughness: 0.6 }), carts));
    }

    // --- the cargo dock: a sunken bay of stacked containers, a gantry crane over the gap -----
    if (dock) {
      const conc = new THREE.MeshStandardMaterial({ color: 0x9a9890, roughness: 0.9, side: THREE.DoubleSide });
      const D = dock.depth, y0 = -0.1;
      const wall = (a0, u0, a1, u1) => {
        const [x0, z0] = dock.at(a0, u0), [x1, z1] = dock.at(a1, u1);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([x0, y0, z0, x1, y0, z1, x0, y0 - D, z0, x1, y0 - D, z1], 3));
        g.setIndex([0, 2, 1, 1, 2, 3]);
        g.computeVertexNormals();
        scene.add(new THREE.Mesh(g, conc));
      };
      const H = dock.half, Wd = dock.wide;
      wall(-H, -Wd, H, -Wd); wall(H, -Wd, H, Wd); wall(H, Wd, -H, Wd); wall(-H, Wd, -H, -Wd);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, Wd * 2).rotateX(-Math.PI / 2), conc);
      floor.position.set(dock.x, y0 - D, dock.z);
      floor.rotation.y = dock.heading;
      scene.add(floor);
      // containers stacked in rows across the bay (tops well below the road)
      const boxes = CONTAINER.map(() => []);
      for (let u = -Wd + 5; u < Wd - 4; u += 6.6) for (let a = -H + 4; a < H - 3; a += 2.7) {
        const n = 1 + Math.floor(rand() * 3);
        for (let k = 0; k < n; k++) {
          const [x, z] = dock.at(a, u);
          boxes[Math.floor(rand() * CONTAINER.length)].push({ x, y: y0 - D + 1.3 + k * 2.6, z, ry: dock.heading + Math.PI / 2 });
        }
      }
      const boxGeo = new THREE.BoxGeometry(6.06, 2.59, 2.44);
      boxes.forEach((list, k) => { if (list.length) scene.add(instanced(boxGeo, new THREE.MeshStandardMaterial({ color: CONTAINER[k], roughness: 0.7, metalness: 0.3 }), list, { receive: true })); });
      // the gantry crane straddling the road over the dock, high over the flight path (its
      // outer legs just past the road, clear of the jet climbing out beside it)
      const yellow = new THREE.MeshStandardMaterial({ color: 0xf0b020, roughness: 0.5, metalness: 0.4 });
      const legU = [-out * (Wd + 3), out * (hw + 5)];
      for (const lu of legU) for (const a of [-H + 3, H - 3]) {
        const [x, z] = dock.at(a, lu);
        const leg = new THREE.Mesh(new THREE.BoxGeometry(1.6, 26, 1.6).translate(0, 13, 0), yellow);
        leg.position.set(x, y0, z);
        scene.add(leg);
      }
      for (const a of [-H + 3, H - 3]) {
        const [x0, z0] = dock.at(a, legU[0]), [x1, z1] = dock.at(a, legU[1]);
        const beam = new THREE.Mesh(new THREE.BoxGeometry(2, 2.4, Math.hypot(x1 - x0, z1 - z0)), yellow);
        beam.position.set((x0 + x1) / 2, y0 + 26, (z0 + z1) / 2);
        beam.rotation.y = Math.atan2(x1 - x0, z1 - z0);
        scene.add(beam);
      }
      const trolley = new THREE.Mesh(new THREE.BoxGeometry(H * 2 - 4, 3, 5), yellow);
      const [tx, tz] = dock.at(0, -out * Wd * 0.45);
      trolley.position.set(tx, y0 + 24.5, tz);
      trolley.rotation.y = dock.heading;
      scene.add(trolley);
      // a freighter parked by the dock, nose open
      const fr = jetOf(0xf2f4f6);
      const [fx, fz] = dock.at(0, -(Wd + 50) * out);
      fr.scale.setScalar(1.25);
      fr.position.set(fx, 0, fz);
      fr.rotation.y = dock.heading + Math.PI / 2;
      scene.add(fr);
    }

    // --- the taxiway bridge over the road, a jet rolling across it now and then -------------
    let taxi = null;
    {
      let bs = null;
      for (const sv of [2680, 2700, 2660, 3000]) {
        const p = track.pointAt(track.wrapS(sv), 0);
        let ok = true;
        // the ramps must not come down on another stretch of road or a taxiway
        for (let u = -150; u <= 150; u += 10) {
          const x = p.x + p.rx * u, z = p.z + p.rz * u, n = index.nearest(x, z, 2);
          if ((isFinite(n.dist) && Math.abs(track.deltaS(n.idx * track.step, sv)) > 120 && n.dist < hw + 25) || (shortcut && shortcut.near(x, z, 15))) ok = false;
        }
        if (ok) { bs = sv; break; }
      }
      if (bs !== null) {
        const p = track.pointAt(track.wrapS(bs), 0), deckY = 11, half = 26;
        const conc = new THREE.MeshStandardMaterial({ color: 0xb8b8b2, roughness: 0.85 });
        const at = (a, u) => [p.x + p.tx * a + p.rx * u, p.z + p.tz * a + p.rz * u];
        // the deck over the road and ramps down either side
        const prof = [[-150, 0], [-60, deckY], [60, deckY], [150, 0]];
        const pos = [], idx = [];
        prof.forEach(([u, y], k) => {
          for (const a of [-half, half]) { const [x, z] = at(a, u); pos.push(x, y + 0.2, z); }
          if (k) { const b = (k - 1) * 2; idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
        });
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setIndex(idx);
        g.computeVertexNormals();
        const deck = new THREE.Mesh(g, apronMat);
        deck.material = apronMat.clone();
        deck.material.side = THREE.DoubleSide;
        deck.receiveShadow = true;
        scene.add(deck);
        // its edges: concrete side walls, and piers either side of the road
        for (const a of [-half, half]) {
          const wp = [], wi = [];
          prof.forEach(([u, y], k) => {
            const [x, z] = at(a, u); wp.push(x, y + 1.2, z, x, y - 1.6, z);
            if (k) { const b = (k - 1) * 2; wi.push(b, b + 2, b + 1, b + 1, b + 2, b + 3); }
          });
          const wg = new THREE.BufferGeometry();
          wg.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3));
          wg.setIndex(wi);
          wg.computeVertexNormals();
          const wm = new THREE.Mesh(wg, conc);
          wm.material = conc.clone(); wm.material.side = THREE.DoubleSide;
          scene.add(wm);
        }
        for (const u of [-(hw + 4), hw + 4, -40, 40]) for (const a of [-half + 3, 0, half - 3]) {
          const [x, z] = at(a, u);
          const yTop = Math.abs(u) <= 60 ? deckY : 0;
          const pier = new THREE.Mesh(new THREE.BoxGeometry(2.4, yTop, 2.4).translate(0, yTop / 2, 0), conc);
          pier.position.set(x, -0.1, z);
          scene.add(pier);
        }
        const line = [];
        for (let u = -140; u <= 140; u += 8) { const [x, z] = at(0, u); line.push({ x, y: (Math.abs(u) <= 60 ? deckY : deckY * (1 - (Math.abs(u) - 60) / 90)) + 0.25, z, ry: p.heading + Math.PI / 2 }); }
        scene.add(instanced(new THREE.PlaneGeometry(0.4, 4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd400 }), line, { cast: false }));
        const tj = jetOf(LIVERY[3]);
        scene.add(tj);
        taxi = { jet: tj, at, deckY, heading: p.heading };
      }
    }

    // --- baggage trains on the apron, a radar turning by the tower --------------------------
    const tugs = [];
    if (parked.length >= 6) {
      const cartGeo = merge([colored(new THREE.BoxGeometry(1.8, 0.5, 3).translate(0, 0.6, 0), 0x5a5e66), colored(new THREE.BoxGeometry(1.6, 1.2, 2.4).translate(0, 1.45, 0), 0xc8a060)]);
      const tugGeo = merge([colored(new THREE.BoxGeometry(1.9, 1.2, 2.6).translate(0, 0.8, 0), 0xf0c020), colored(new THREE.BoxGeometry(1.6, 0.9, 1.2).translate(0, 1.8, -0.4), 0x2a3a4a)]);
      const vmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 });
      for (let k = 0; k < 3; k++) {
        const g = new THREE.Group(), parts = [new THREE.Mesh(tugGeo, vmat)];
        for (let c = 1; c <= 4; c++) { const m = new THREE.Mesh(cartGeo, vmat); parts.push(m); }
        parts.forEach((m) => g.add(m));
        scene.add(g);
        tugs.push({ parts, ph: k / 3 });
      }
    }
    let radar = null;
    {
      const rx = 260 + 45, rz = -150 + 30;
      if (clear(rx, rz, 25)) {
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1, 14, 8).translate(0, 7, 0), new THREE.MeshStandardMaterial({ color: 0xd8d8d2, roughness: 0.7 }));
        mast.position.set(rx, 0, rz);
        scene.add(mast);
        radar = new THREE.Group();
        const dish = new THREE.Mesh(new THREE.BoxGeometry(9, 2.6, 0.4), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5, metalness: 0.3 }));
        dish.rotation.x = -0.25;
        radar.add(dish);
        radar.position.set(rx, 15.5, rz);
        scene.add(radar);
      }
    }

    // windsocks and a few taxiway signs by the road
    const sockMat = new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.7 });
    for (const s of [rwS0 + rwLen * 0.2, rwS0 + rwLen * 0.8]) {
      const p = track.pointAt(s, -(hw + 30));
      if (!clear(p.x, p.z, 8)) continue;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 6).translate(0, 3, 0), new THREE.MeshStandardMaterial({ color: 0xdddddd }));
      const sock = new THREE.Mesh(new THREE.ConeGeometry(0.7, 4, 10, 1, true).rotateZ(Math.PI / 2).translate(2, 5.8, 0), sockMat);
      pole.position.set(p.x, 0, p.z); sock.position.set(p.x, 0, p.z);
      sock.rotation.y = 0.6;
      scene.add(pole, sock);
    }
    const signText = ['A ›', '‹ B', 'C2', 'RWY 09-27', '‹ GATES', 'D ›', 'HOLD'];
    for (let k = 0; k < 10; k++) {
      const s = rand() * track.length;
      const p = track.pointAt(s, (rand() < 0.5 ? -1 : 1) * (hw + 4));
      if (!clear(p.x, p.z, 3)) continue;
      const board = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.9), new THREE.MeshBasicMaterial({ map: textTexture(signText[k % signText.length], { bg: '#111111', fg: '#ffd400', stripes: false }), side: THREE.DoubleSide }));
      board.position.set(p.x, 1.1, p.z);
      board.rotation.y = p.heading + Math.PI / 2;
      scene.add(board);
    }

    // reflections
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.BoxGeometry(40, 14 + rand() * 20, 10), new THREE.MeshBasicMaterial({ color: i % 3 ? 0xc8ccd2 : 0x8a9a6a }));
      b.position.set(Math.cos(a) * 220, 5, Math.sin(a) * 220);
      b.lookAt(0, 5, 0);
      envScene.add(b);
    }

    const liftD = Math.min(rwLen - 120, holdD + 900);
    return {
      landmark: { s: runwayS, range: 22 },
      blasts: [blast],
      update(dt, time, camera, focus) {
        // the take-off run: holding until a car comes by on the runway, then away down it
        // (a new race starts the clock again: the jet goes back to its holding point)
        if (time < (J.last ?? 0)) { J.state = 'hold'; J.d = holdD; J.v = 0; J.y = 0; }
        J.last = time;
        if (J.state === 'hold' && focus) {
          track.project(focus.x, focus.z, tmpQ.idx ?? -1, tmpQ);
          const ds = track.deltaS(rwS0, tmpQ.s);
          if (ds > holdD - 60 && ds < holdD - 10 && Math.abs(tmpQ.lateral) < hw + 4) { J.state = 'roll'; J.v = 0; J.d = holdD; J.y = 0; J.t = 0; }
        }
        if (J.state !== 'hold') {
          J.t += dt;
          J.v = Math.min(125, J.v + 12 * dt);
          J.d += J.v * dt;
          J.y = Math.max(0, J.d - liftD) * 0.1;
          if (J.t > 40) { J.state = 'hold'; J.d = holdD; J.v = 0; J.y = 0; }
        }
        const jp = track.pointAt(track.wrapS(rwS0 + Math.min(J.d, rwLen)), lane);
        const past = Math.max(0, J.d - rwLen);
        jet.position.set(jp.x + dirX * past, J.y, jp.z + dirZ * past);
        jet.rotation.set(J.y > 0 ? -0.14 : 0, Math.atan2(dirX, dirZ), 0);
        jet.visible = J.y < 600;
        const thrust = J.state === 'hold' ? 0.35 : 1;
        for (const m of plumes) m.scale.set(1, 1, 0.6 + thrust * (1.4 + Math.sin(time * 40) * 0.1));
        plumeMat.opacity = 0.18 + thrust * 0.22;
        blast.active = J.state !== 'hold' && J.v > 25 && J.y < 22;
        blast.x = jet.position.x; blast.z = jet.position.z; blast.y = J.y;
        // dust blown up off the runway behind it
        for (let i = 0; i < dustN; i++) {
          dustAge[i] += dt;
          if (dustAge[i] > 2.2 && blast.active && J.y < 6 && (dustK = (dustK + 1) % 7) === 0) {
            dustAge[i] = 0;
            dustPos[i * 3] = jet.position.x - dirX * 14 + (rand() - 0.5) * 24; dustPos[i * 3 + 1] = 0.5; dustPos[i * 3 + 2] = jet.position.z - dirZ * 14 + (rand() - 0.5) * 24;
          }
          if (dustAge[i] < 2.2) { dustPos[i * 3] -= dirX * 30 * dt; dustPos[i * 3 + 1] += 3 * dt; dustPos[i * 3 + 2] -= dirZ * 30 * dt; } else dustPos[i * 3 + 1] = -50;
        }
        dg.attributes.position.needsUpdate = true;
        // the rabbit: a strobe running in toward each threshold, twice a second
        rabbit.forEach((row) => { const k = Math.floor(time * 2 * row.length) % row.length; row.forEach((sp, i) => { sp.visible = i === k; }); });
        if (taxi) {
          const t = (time % 36) / 36, u = -160 + t * 320;
          const y = Math.abs(u) <= 60 ? taxi.deckY : Math.max(0, taxi.deckY * (1 - (Math.abs(u) - 60) / 90));
          const [x, z] = taxi.at(0, u);
          taxi.jet.position.set(x, y + 0.2, z);
          taxi.jet.rotation.set(0, taxi.heading - Math.PI / 2, 0);
        }
        for (const tg of tugs) {
          // a loop round the apron in front of the gates
          tg.parts.forEach((m, c) => {
            const f = ((time * 0.012 + tg.ph - c * 0.006) % 1 + 1) % 1, a = f * Math.PI * 2;
            const x = termC.x + Math.cos(a) * (termL / 2 + 10), z = termC.z - 60 + Math.sin(a) * 22;
            m.position.set(x, 0, z);
            m.rotation.y = Math.atan2(-Math.sin(a) * (termL / 2 + 10), Math.cos(a) * 22);
          });
        }
        if (radar) radar.rotation.y = time * 1.4;
        if (towerTop) towerTop.visible = Math.sin(time * 3) > 0;
      },
    };
  },
};
