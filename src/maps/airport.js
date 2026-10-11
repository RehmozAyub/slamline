// SKYPORT: a race around a working airport. The long south straight is the runway (markings,
// edge and approach lights, jets climbing out overhead); a terminal with parked airliners, a
// control tower and hangars fill the infield. Shortcuts are taxiways behind boom barriers.
import * as THREE from 'three';
import { LAYOUTS } from './layouts.js';
import { rng, colored, merge, instanced } from '../scenery.js';
import { addWorldDetail } from '../detail.js';
import { windowTextures, textTexture } from '../textures.js';

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

  build({ scene, track, index, density, envScene }) {
    const rand = rng(909);
    const hw = track.halfWidth;
    const clear = (x, z, r) => index.nearest(x, z, 4).dist > hw + r;

    // grass with mown stripes, and concrete aprons
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), addWorldDetail(new THREE.MeshStandardMaterial({ color: 0x6a8a46, roughness: 1 }), { fine: [0.5, 0.35], macro: [0.01, 0.4], rough: 0 }));
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
      const p = track.pointAt(rwS0 + rwLen * u, 0);
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

    // a jet climbing out over the runway, again and again
    const flyer = new THREE.Group();
    flyer.add(new THREE.Mesh(bodyGeo, fuselage), new THREE.Mesh(tailGeo, new THREE.MeshStandardMaterial({ color: LIVERY[1], roughness: 0.4, side: THREE.DoubleSide })));
    flyer.rotation.order = 'YXZ'; // heading, then nose up
    scene.add(flyer);
    const r0 = track.pointAt(rwS0, 0), r1 = track.pointAt(rwS0 + rwLen, 0);
    const dirX = (r1.x - r0.x) / rwLen, dirZ = (r1.z - r0.z) / rwLen;

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

    return {
      landmark: { s: runwayS, range: 22 },
      update(dt, time) {
        // one take-off every 30 s: climbing out along the runway from its far end, low over it
        const t = (time % 30) / 30;
        const d = -200 + t * 3200;
        const climb = Math.max(0, d - rwLen * 0.35);
        flyer.position.set(r0.x + dirX * d, 18 + climb * 0.16, r0.z + dirZ * d);
        flyer.rotation.set(-0.16, Math.atan2(dirX, dirZ), 0);
        flyer.visible = t < 0.95;
        if (towerTop) towerTop.visible = Math.sin(time * 3) > 0;
      },
    };
  },
};
