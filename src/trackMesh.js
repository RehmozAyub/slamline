// Builds the visible track from a TrackPath: road, kerbs, barriers (with optional neon strip),
// embankments, start line and gantry - plus the shortcut (its own dirt road and barriers, with
// gaps in the main barrier where it forks off and merges back) and the set pieces: rails (loop,
// corkscrew, helix ramp), jump kickers and gaps, and wall-ride half-pipes.
import * as THREE from 'three';
import { checkerTexture, kerbTexture, textTexture } from './textures.js';
import { addWorldDetail } from './detail.js';

// Ribbon along the track between two (lateral, height) profiles.
// closed: loop back to the start (main road); keep(i): leave out segments touching sample i;
// lift(i): extra height at sample i (a jump's kicker).
function ribbon(track, a, b, { vScale = 1 / 40, uFrom = 0, uTo = 1, yOff = 0, closed = true, keep = null, lift = null } = {}) {
  const n = track.n;
  const last = closed ? n : n - 1;
  const pos = new Float32Array((last + 1) * 2 * 3);
  const uv = new Float32Array((last + 1) * 2 * 2);
  const idx = [];
  for (let i = 0; i <= last; i++) {
    const k = i % n;
    const s = i * track.step;
    for (let j = 0; j < 2; j++) {
      const [lat, h] = j === 0 ? a : b;
      const o = (i * 2 + j) * 3;
      pos[o] = track.x[k] + track.rx[k] * lat;
      pos[o + 1] = track.y[k] + h + yOff + (lift ? lift(k) : 0);
      pos[o + 2] = track.z[k] + track.rz[k] * lat;
      uv[(i * 2 + j) * 2] = j === 0 ? uFrom : uTo;
      uv[(i * 2 + j) * 2 + 1] = s * vScale;
    }
    if (i < last && (!keep || (keep(k) && keep((i + 1) % n)))) {
      const p = i * 2;
      idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function fixWinding(g, wantUp) {
  // make sure the ribbon faces the intended way (up for road, inward for walls)
  const n = g.attributes.normal;
  let sum = 0;
  for (let i = 0; i < n.count; i++) sum += n.getY(i);
  if ((sum < 0) === wantUp) {
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    g.computeVertexNormals();
  }
  return g;
}

// asphalt: { map, normalMap, roughnessMap } from getAsphalt()
// shortcuts: ShortcutSet (or null); set pieces (features.js): the main road isn't drawn under a
// rail, across a jump's gap or along a wall-ride (that has its own curled road)
export function buildTrackMeshes(track, style, maxAniso, asphalt, shortcuts = null, { rails = [], jumps = [], banks = [], crossings = [] } = {}) {
  const group = new THREE.Group();
  const hw = track.halfWidth;
  const at_ = (i) => i * track.step;
  const open = rails.length || jumps.length || banks.length
    ? (i) => !rails.some((r) => r.inSpan(at_(i))) && !jumps.some((j) => j.inGap(at_(i))) && !banks.some((b) => b.inSpan(at_(i)))
    : null;
  const lift = jumps.length ? (i) => jumps.reduce((a, j) => a + Math.max(0, j.lift(at_(i))), 0) : null;
  // per side: which main-road samples keep their roadside (no gap for the shortcut, no set piece)
  const sideKeep = (side) => {
    const sc = shortcuts ? shortcuts.mainKeep(side) : null;
    return sc && open ? (i) => sc(i) && open(i) : sc || open;
  };

  // Road: procedural asphalt (albedo + normal + roughness) plus world-space grit and tone variation
  const at = asphalt;
  for (const t of [at.map, at.normalMap, at.roughnessMap]) t.anisotropy = maxAniso;
  const roadMat = new THREE.MeshStandardMaterial({
    map: at.map,
    normalMap: at.normalMap,
    normalScale: new THREE.Vector2(1, 1).multiplyScalar(style.road.normalScale ?? (style.road.wet ? 0.4 : 0.7)),
    roughnessMap: at.roughnessMap,
    roughness: 1,
    metalness: style.road.metalness ?? 0.0,
    envMapIntensity: style.road.envIntensity ?? 1,
  });
  addWorldDetail(roadMat, { fine: [1.4, 0.14], macro: [0.011, 0.26], rough: 0.12, minRough: style.road.minRough ?? 0.02, sunSpec: style.road.sunSpec ?? 0.3 });
  const road = new THREE.Mesh(fixWinding(ribbon(track, [-hw, 0], [hw, 0], { vScale: 1 / 40, keep: open, lift }), true), roadMat);
  road.receiveShadow = true;
  group.add(road);
  for (const r of rails) group.add(buildRail(r, style, roadMat));
  for (const j of jumps) group.add(buildJump(j, style));

  // Shoulders just outside the road, under the barrier
  // gravel shoulders
  const shoulderMat = addWorldDetail(new THREE.MeshStandardMaterial({ color: style.shoulder ?? 0x3a3835, roughness: 0.95 }), { fine: [2.2, 0.7], macro: [0.05, 0.35], rough: 0.1 });
  for (const side of [-1, 1]) {
    const a = [side * hw, -0.01], b = [side * (hw + 2.2), -0.05];
    const g = fixWinding(ribbon(track, side < 0 ? b : a, side < 0 ? a : b, { keep: sideKeep(side), lift }), true);
    const m = new THREE.Mesh(g, shoulderMat);
    m.receiveShadow = true;
    group.add(m);
  }

  // Kerbs
  if (style.kerb) {
    const kt = kerbTexture(style.kerb[0], style.kerb[1]);
    const kMat = new THREE.MeshStandardMaterial({ map: kt, roughness: 0.6 });
    for (const side of [-1, 1]) {
      const a = [side * (hw - 1.1), 0.03], b = [side * (hw + 0.2), 0.08];
      const g = fixWinding(ribbon(track, side < 0 ? b : a, side < 0 ? a : b, { vScale: 1 / 6, keep: sideKeep(side), lift }), true);
      const m = new THREE.Mesh(g, kMat);
      m.receiveShadow = true;
      group.add(m);
    }
  }

  // Embankment down to the terrain (not under a jump's bridge decks)
  const decks = jumps.filter((j) => j.spec.bridge);
  // ...and where a railway crosses the road there is no embankment or barrier either
  const crossing = (i) => crossings.some((c) => Math.abs(track.deltaS(c.s, at_(i))) < hw + 4);
  const barrierKeep = (side) => {
    const k = sideKeep(side);
    return crossings.length ? (i) => (!k || k(i)) && !crossing(i) : k;
  };
  const embKeep = (side) => {
    const k = barrierKeep(side);
    return decks.length ? (i) => (!k || k(i)) && !decks.some((j) => j.near(at_(i), j.spec.bridge)) : k;
  };
  if (style.embankment) {
    const eMat = addWorldDetail(new THREE.MeshStandardMaterial({ color: style.embankment, roughness: 1 }), { fine: [0.45, 0.45], macro: [0.03, 0.35], rough: 0 });
    for (const side of [-1, 1]) {
      const a = [side * (hw + 2.2), -0.05], b = [side * (hw + 14), -7];
      const g = fixWinding(ribbon(track, side < 0 ? b : a, side < 0 ? a : b, { keep: embKeep(side), lift }), true);
      const m = new THREE.Mesh(g, eMat);
      m.receiveShadow = true;
      group.add(m);
    }
  }

  // Barriers
  addBarriers(group, track, style.barrier, hw + 0.5, barrierKeep, true, lift);
  for (const b of banks) group.add(buildBank(b, style, roadMat, shoulderMat));

  // shortcuts; their entrance arrows pulse (world.update calls group.userData.update)
  const pulses = [];
  if (shortcuts) for (const sc of shortcuts.list) { const g = buildShortcut(sc, style); pulses.push(...g.userData.pulses); group.add(g); }
  group.userData.update = (time) => {
    for (const p of pulses) {
      const o = (((time * 1.1 - p.k * 0.22) % 1) + 1) % 1; // a wave running toward the shortcut
      p.mat.opacity = p.base * (0.28 + 0.72 * Math.exp(-o * 4.5));
    }
  };

  // Start / finish
  const p0 = track.pointAt(0, 0);
  const head = p0.heading;
  const check = new THREE.Mesh(new THREE.PlaneGeometry(track.width, 3), new THREE.MeshStandardMaterial({ map: checkerTexture(16, 2), roughness: 0.7 }));
  check.rotation.order = 'YXZ';
  check.rotation.set(-Math.PI / 2, head, 0);
  check.position.set(p0.x, p0.y + 0.04, p0.z);
  check.receiveShadow = true;
  group.add(check);

  const gantry = new THREE.Group();
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1a1c22, roughness: 0.4, metalness: 0.7 });
  for (const side of [-1, 1]) {
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.8, 8.5, 0.8), pillarMat);
    pil.position.set(side * (hw + 1.6), 4.25, 0);
    pil.castShadow = true;
    gantry.add(pil);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(track.width + 4, 1.8, 0.8), pillarMat);
  beam.position.y = 8.2;
  beam.castShadow = true;
  gantry.add(beam);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(track.width * 0.8, 1.5),
    new THREE.MeshBasicMaterial({ map: textTexture('SLAMLINE', { accent: style.accent ?? '#ff2d55' }), toneMapped: false }),
  );
  sign.position.set(0, 8.2, -0.41);
  sign.rotation.y = Math.PI;
  gantry.add(sign);
  const sign2 = sign.clone();
  sign2.position.z = 0.41;
  sign2.rotation.y = 0;
  gantry.add(sign2);
  // light bar
  const bar = new THREE.Mesh(new THREE.BoxGeometry(track.width + 3.8, 0.12, 0.9), new THREE.MeshBasicMaterial({ color: new THREE.Color(style.accent ?? '#ff2d55').multiplyScalar(5) }));
  bar.position.y = 7.25;
  gantry.add(bar);
  gantry.position.set(p0.x, p0.y, p0.z);
  gantry.rotation.y = head;
  group.add(gantry);

  return group;
}

// Barriers along both sides of a path. keepFor(side) -> null (all) or a sample filter.
// lift(i): extra height at sample i (a jump's kicker)
function addBarriers(group, track, bs, wallOff, keepFor, closed, lift = null) {
  const opt = (side, extra = {}) => ({ closed, keep: keepFor(side), lift, ...extra });
  if (bs.type === 'wall') {
    const wMat = addWorldDetail(new THREE.MeshStandardMaterial({ color: bs.color, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide }), { fine: [1.2, 0.35], macro: [0.04, 0.25], rough: 0.2, triplanar: true });
    for (const side of [-1, 1]) {
      // inner face, top, outer face
      const inner = ribbon(track, [side * wallOff, 0], [side * wallOff, bs.height], opt(side));
      const top = ribbon(track, [side * wallOff, bs.height], [side * (wallOff + 0.6), bs.height], opt(side));
      const outer = ribbon(track, [side * (wallOff + 0.6), bs.height], [side * (wallOff + 0.6), -4], opt(side));
      for (const g of [inner, top, outer]) {
        const m = new THREE.Mesh(g, wMat);
        m.castShadow = true;
        m.receiveShadow = true;
        group.add(m);
      }
    }
  } else {
    // guardrail: metal band on posts
    const railMat = new THREE.MeshStandardMaterial({ color: bs.color, roughness: 0.6, metalness: 0.45, envMapIntensity: 0.6, side: THREE.DoubleSide });
    const postMat = new THREE.MeshStandardMaterial({ color: bs.postColor ?? 0x555555, roughness: 0.7, metalness: 0.4 });
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(ribbon(track, [side * wallOff, 0.45], [side * wallOff, 0.95], opt(side)), railMat);
      m.castShadow = true;
      group.add(m);
    }
    const every = Math.max(1, Math.round(4 / track.step));
    const count = Math.ceil(track.n / every) * 2;
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 1.0, 0.14), postMat, count);
    const mtx = new THREE.Matrix4();
    let c = 0;
    for (let i = 0; i < track.n; i += every) {
      for (const side of [-1, 1]) {
        const keep = keepFor(side);
        if (keep && !keep(i)) continue;
        mtx.makeTranslation(track.x[i] + track.rx[i] * side * (wallOff + 0.12), track.y[i] + 0.5 + (lift ? lift(i) : 0), track.z[i] + track.rz[i] * side * (wallOff + 0.12));
        posts.setMatrixAt(c++, mtx);
      }
    }
    posts.count = c;
    posts.castShadow = true;
    group.add(posts);
  }

  // Glowing strip along the barrier top (neon / reflectors)
  if (bs.glow) {
    for (const side of [-1, 1]) {
      const h = bs.type === 'wall' ? bs.height + 0.02 : 1.0;
      const g = ribbon(track, [side * (wallOff + 0.05), h], [side * (wallOff + 0.05), h + 0.12], opt(side));
      const col = new THREE.Color(side < 0 ? bs.glow[0] : bs.glow[1] ?? bs.glow[0]);
      group.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: col.multiplyScalar(bs.glowIntensity ?? 4), side: THREE.DoubleSide, toneMapped: true })));
    }
  }
}

// The shortcut: a narrow dirt (or style-coloured) road with shoulders, embankments, barriers
// and a sign at the fork.
function buildShortcut(sc, style) {
  const group = new THREE.Group();
  const path = sc.path, shw = path.halfWidth;
  const cfg = style.shortcut || {};
  const keepFor = (side) => { const g = sc.pathGap[side < 0 ? 0 : 1]; return (j) => !g[j]; };
  // drawn behind the main road where the two overlap at the fork and the merge
  const dirt = addWorldDetail(new THREE.MeshStandardMaterial({ color: cfg.color ?? 0x6e5a44, roughness: 1, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 }), { fine: [1.8, 0.55], macro: [0.03, 0.35], rough: 0.05 });
  const road = new THREE.Mesh(fixWinding(ribbon(path, [-shw, -0.03], [shw, -0.03], { closed: false }), true), dirt);
  road.receiveShadow = true;
  group.add(road);
  if (cfg.taxiway) {
    // a taxiway: smooth tarmac with a yellow centre line
    const lineMat = new THREE.MeshStandardMaterial({ color: 0xffc400, emissive: 0x3a2a00, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    group.add(new THREE.Mesh(fixWinding(ribbon(path, [-0.16, -0.02], [0.16, -0.02], { closed: false }), true), lineMat));
  } else {
    // wheel ruts
    const rut = new THREE.MeshStandardMaterial({ color: new THREE.Color(cfg.color ?? 0x6e5a44).multiplyScalar(0.6), roughness: 1, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    for (const lat of [-2.2, 2.2]) {
      const m = new THREE.Mesh(fixWinding(ribbon(path, [lat - 0.45, -0.02], [lat + 0.45, -0.02], { closed: false }), true), rut);
      m.receiveShadow = true;
      group.add(m);
    }
  }
  const shoulderMat = addWorldDetail(new THREE.MeshStandardMaterial({ color: style.shoulder ?? 0x3a3835, roughness: 0.95 }), { fine: [2.2, 0.7], macro: [0.05, 0.35], rough: 0.1 });
  const eMat = addWorldDetail(new THREE.MeshStandardMaterial({ color: style.embankment ?? 0x4a4a40, roughness: 1 }), { fine: [0.45, 0.45], macro: [0.03, 0.35], rough: 0 });
  for (const side of [-1, 1]) {
    const keep = keepFor(side);
    const a = [side * shw, -0.04], b = [side * (shw + 2), -0.07];
    group.add(new THREE.Mesh(fixWinding(ribbon(path, side < 0 ? b : a, side < 0 ? a : b, { closed: false, keep }), true), shoulderMat));
    const c = [side * (shw + 2), -0.07], d = [side * (shw + 12), -6];
    const e = new THREE.Mesh(fixWinding(ribbon(path, side < 0 ? d : c, side < 0 ? c : d, { closed: false, keep }), true), eMat);
    e.receiveShadow = true;
    group.add(e);
  }
  addBarriers(group, path, style.barrier, shw + 0.5, keepFor, false);
  group.userData.pulses = entranceGuides(group, sc, style);
  edgeReflectors(group, sc, cfg.studs);

  for (const r of sc.ramps) { group.add(rampMesh(path, r, shw)); group.add(rampGuides(path, r, shw, style)); }
  if (sc.fence) return group; // hidden shortcuts: no sign, a fence across the way in instead

  // sign at the fork
  const u = Math.min(path.length * 0.3, sc.overlapIn + 10);
  const p = path.pointAt(u, -sc.side * (shw + 1.8));
  const sign = new THREE.Group();
  const board = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.05), new THREE.MeshBasicMaterial({ map: textTexture(cfg.sign || 'SHORTCUT ›', { accent: style.accent ?? '#ff2d55', bg: cfg.signBg || '#0b0b10', fg: cfg.signFg || '#ffffff', stripes: !cfg.signBg, font: 'italic 900 140px Bahnschrift, "Segoe UI", sans-serif' }), toneMapped: false, side: THREE.DoubleSide }));
  board.position.y = 2.4;
  sign.add(board);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.6, metalness: 0.5 });
  for (const sx of [-1.7, 1.7]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 0.12), postMat);
    post.position.set(sx, 1.2, -0.05);
    sign.add(post);
  }
  sign.position.set(p.x, p.y, p.z);
  // face back toward oncoming cars on the main road
  const back = sc.track.pointAt(sc.a - 60, 0);
  sign.rotation.y = Math.atan2(back.x - p.x, back.z - p.z);
  group.add(sign);
  return group;
}

// Ramp texture: wooden planks with a hazard band at the lip.
let rampTex = null;
function rampTexture() {
  if (rampTex) return rampTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 16; i++) {
    const l = 92 + ((i * 37) % 23);
    g.fillStyle = `rgb(${l + 40},${l + 10},${l - 30})`;
    g.fillRect(0, i * 16, 256, 15);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(0, i * 16 + 15, 256, 1);
  }
  // hazard stripes at the lip end (v = 1 at the top of the canvas)
  for (let x = -64; x < 256; x += 32) {
    g.fillStyle = '#f2c21a';
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 16, 0); g.lineTo(x + 48, 36); g.lineTo(x + 32, 36); g.closePath(); g.fill();
  }
  g.fillStyle = 'rgba(0,0,0,0.85)';
  g.fillRect(0, 36, 256, 4);
  // two big chevrons on the deck pointing up to the lip
  for (const y0 of [90, 170]) {
    g.beginPath();
    g.moveTo(128, y0 - 36); g.lineTo(208, y0 + 20); g.lineTo(176, y0 + 20); g.lineTo(128, y0 - 14); g.lineTo(80, y0 + 20); g.lineTo(48, y0 + 20); g.closePath();
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fill();
    g.save(); g.translate(0, -4);
    g.beginPath();
    g.moveTo(128, y0 - 36); g.lineTo(208, y0 + 20); g.lineTo(176, y0 + 20); g.lineTo(128, y0 - 14); g.lineTo(80, y0 + 20); g.lineTo(48, y0 + 20); g.closePath();
    g.fillStyle = '#ffd400'; g.fill();
    g.restore();
  }
  rampTex = new THREE.CanvasTexture(c);
  rampTex.colorSpace = THREE.SRGBColorSpace;
  return rampTex;
}

// A kicker on the shortcut: a sloped deck rising to height r.h, ending in a vertical drop.
// Half ramps cover one side of the road (r.half = -1 / +1).
function rampMesh(path, r, shw) {
  const lat0 = r.half > 0 ? -0.3 : -shw, lat1 = r.half < 0 ? 0.3 : shw;
  const pos = [], uv = [], idx = [];
  const n = Math.max(4, Math.ceil(r.len / 0.5));
  const P = {};
  const vert = (u, lat, h, uu, vv) => { path.pointAt(u, lat, P); pos.push(P.x, P.y + h - 0.02, P.z); uv.push(uu, vv); return pos.length / 3 - 1; };
  // deck
  for (let i = 0; i <= n; i++) {
    const k = i / n, u = r.u0 + r.len * k, h = r.h * k;
    vert(u, lat0, h, 0, k); vert(u, lat1, h, 1, k);
    if (i < n) { const p = i * 2; idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2); }
  }
  // lip face and the two sides
  const end = r.u0 + r.len;
  const a = vert(end, lat0, r.h, 0, 0.9), b = vert(end, lat1, r.h, 1, 0.9), c = vert(end, lat1, 0, 1, 0.6), d = vert(end, lat0, 0, 0, 0.6);
  idx.push(a, c, b, a, d, c);
  for (const lat of [lat0, lat1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= n; i++) {
      const k = i / n, u = r.u0 + r.len * k;
      vert(u, lat, r.h * k, k, 0.5); vert(u, lat, 0, k, 0.4);
      if (i < n) { const p = base + i * 2; idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: rampTexture(), roughness: 0.85, side: THREE.DoubleSide }));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

// Leading up to a ramp: glowing chevrons on the road and a JUMP board on each side.
let chevTex = null;
function chevronTexture() {
  if (chevTex) return chevTex;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.beginPath();
  g.moveTo(64, 10); g.lineTo(122, 70); g.lineTo(96, 70); g.lineTo(64, 38); g.lineTo(32, 70); g.lineTo(6, 70); g.closePath();
  g.fillStyle = '#fff';
  g.fill();
  chevTex = new THREE.CanvasTexture(c);
  return chevTex;
}

function rampGuides(path, r, shw, style) {
  const group = new THREE.Group();
  const lane = r.half ? r.half * shw * 0.45 : 0; // centre of the ramp across the road
  const mat = new THREE.MeshBasicMaterial({ map: chevronTexture(), color: new THREE.Color(0xffd400).multiplyScalar(0.9), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const geo = new THREE.PlaneGeometry(r.half ? 3.2 : 5, r.half ? 3.2 : 5).rotateX(-Math.PI / 2);
  for (const back of [34, 24, 14]) {
    const p = path.pointAt(r.u0 - back, lane);
    const m = new THREE.Mesh(geo, mat);
    m.position.set(p.x, p.y + 0.04, p.z);
    m.rotation.y = p.heading + Math.PI; // texture "up" points along the road
    m.renderOrder = 2;
    group.add(m);
  }
  const board = new THREE.MeshBasicMaterial({ map: textTexture('▲ JUMP ▲', { accent: style.accent ?? '#ff2d55', bg: '#ffd400', fg: '#111111', font: 'italic 900 150px Bahnschrift, "Segoe UI", sans-serif' }), toneMapped: false, side: THREE.DoubleSide });
  const postMat = new THREE.MeshStandardMaterial({ color: 0x222226, roughness: 0.6, metalness: 0.5 });
  const sides = r.half ? [r.half] : [-1, 1];
  for (const sd of sides) {
    const p = path.pointAt(r.u0 - 22, sd * (shw + 1.6));
    const sign = new THREE.Group();
    const b = new THREE.Mesh(new THREE.PlaneGeometry(3, 0.75), board);
    b.position.y = 1.9;
    sign.add(b);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.9, 0.1), postMat);
    post.position.y = 0.95;
    sign.add(post);
    sign.position.set(p.x, p.y, p.z);
    const back = path.pointAt(r.u0 - 60, 0);
    sign.rotation.y = Math.atan2(back.x - p.x, back.z - p.z);
    group.add(sign);
  }
  return group;
}

// Into a shortcut: glowing arrows hovering over the way in, plus chevrons on the road, all
// pulsing in a wave that runs into the shortcut. Easy to spot on a dark map, quiet on a bright one.
let arrowTex = null;
function arrowTexture() {
  if (arrowTex) return arrowTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 192;
  const g = c.getContext('2d');
  const chev = (y0) => {
    g.beginPath();
    g.moveTo(128, y0); g.lineTo(220, y0 + 70); g.lineTo(178, y0 + 70); g.lineTo(128, y0 + 32); g.lineTo(78, y0 + 70); g.lineTo(36, y0 + 70); g.closePath();
  };
  // soft halo, then a bright core
  g.shadowColor = 'rgba(255,255,255,0.9)';
  g.shadowBlur = 22;
  g.fillStyle = 'rgba(255,255,255,0.55)';
  for (const y0 of [24, 92]) { chev(y0); g.fill(); }
  g.shadowBlur = 0;
  g.fillStyle = '#ffffff';
  for (const y0 of [24, 92]) { chev(y0); g.fill(); }
  arrowTex = new THREE.CanvasTexture(c);
  arrowTex.colorSpace = THREE.SRGBColorSpace;
  return arrowTex;
}

function entranceGuides(group, sc, style) {
  const path = sc.path, track = sc.track;
  const pulses = [];
  const col = new THREE.Color(style.shortcut?.guide ?? 0xffd23f);
  const q = {};
  const surfaceY = (p) => {
    // where the two roads overlap use whichever surface is on top
    track.project(p.x, p.z, -1, q);
    return Math.abs(q.lateral) < track.halfWidth ? Math.max(p.y, track.pointAt(q.s, q.lateral).y) : p.y;
  };
  // chevrons on the road
  const floorGeo = new THREE.PlaneGeometry(5.2, 5.2).rotateX(-Math.PI / 2);
  [-30, -20, -10].map((d) => sc.overlapIn + d).filter((u) => u > 3).forEach((u, k) => {
    const p = path.pointAt(u, 0);
    const mat = new THREE.MeshBasicMaterial({ map: chevronTexture(), color: col, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const m = new THREE.Mesh(floorGeo, mat);
    m.position.set(p.x, surfaceY(p) + 0.05, p.z);
    m.rotation.y = p.heading + Math.PI; // texture "up" points along the shortcut
    m.renderOrder = 2;
    group.add(m);
    pulses.push({ mat, k, base: 0.8 });
  });
  // glowing chevrons hovering over the fork (high enough to drive under), facing the cars coming
  // up the main road and pointing into the shortcut
  const face = track.pointAt(sc.a, 0).heading + Math.PI;
  const boardGeo = new THREE.PlaneGeometry(2.6, 2.1).rotateZ(-sc.side * Math.PI / 2);
  for (let k = 0; k < 3; k++) {
    const u = sc.overlapIn * (0.45 + k * 0.22);
    const p = path.pointAt(u, 0);
    const mat = new THREE.MeshBasicMaterial({ map: arrowTexture(), color: col, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const m = new THREE.Mesh(boardGeo, mat);
    m.position.set(p.x, surfaceY(p) + 3.1, p.z);
    m.rotation.y = face;
    m.renderOrder = 3;
    group.add(m);
    pulses.push({ mat, k: k + 2, base: 0.8 });
  }
  return pulses;
}

// Small amber reflector studs along both edges of a shortcut so its line shows up at night.
function edgeReflectors(group, sc, color = 0xffa820) {
  const path = sc.path, shw = path.halfWidth;
  const studs = [];
  for (let u = sc.overlapIn + 4; u < path.length - sc.overlapOut - 4; u += 9) {
    for (const sd of [-1, 1]) {
      const p = path.pointAt(u, sd * (shw - 0.35));
      studs.push(p);
    }
  }
  if (!studs.length) return;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.1, 0.32), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.3) }), studs.length);
  const m = new THREE.Matrix4();
  studs.forEach((p, i) => { m.makeRotationY(p.heading); m.setPosition(p.x, p.y + 0.03, p.z); mesh.setMatrixAt(i, m); });
  group.add(mesh);
}

// --- set pieces ---------------------------------------------------------------------
// A ribbon along a rail between two (lateral, height) profiles, height along the rail's up.
// Faces the side (B - A) x forward, so list the profiles accordingly.
function railRibbon(rail, us, a, b, vOf = (u) => u / 40, [uFrom, uTo] = [0, 1]) {
  const pos = [], uv = [], idx = [];
  const P = {};
  us.forEach((u, i) => {
    rail.pose(u, 0, P);
    for (const [lat, h] of [a, b]) pos.push(P.x + P.bx * lat + P.ux * h, P.y + P.by * lat + P.uy * h, P.z + P.bz * lat + P.uz * h);
    uv.push(uFrom, vOf(u), uTo, vOf(u));
    if (i < us.length - 1) { const p = i * 2; idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// matrix placing an object on the rail at (u, lat, h): x = left, y = up, z = forward (like a car)
function railMatrix(rail, u, lat, h, m = new THREE.Matrix4(), P = {}) {
  rail.pose(u, lat, P);
  m.makeBasis(new THREE.Vector3(-P.bx, -P.by, -P.bz), new THREE.Vector3(P.ux, P.uy, P.uz), new THREE.Vector3(P.tx, P.ty, P.tz));
  m.setPosition(P.x + P.ux * h, P.y + P.uy * h, P.z + P.uz * h);
  return m;
}

// the road's asphalt, sampled triplanar (for road surfaces that tip up: rails, wall-rides)
function tippedRoad(roadMat, style) {
  const mat = new THREE.MeshStandardMaterial({
    map: roadMat.map, normalMap: roadMat.normalMap, normalScale: roadMat.normalScale, roughnessMap: roadMat.roughnessMap,
    roughness: 1, metalness: roadMat.metalness, envMapIntensity: roadMat.envMapIntensity,
  });
  return addWorldDetail(mat, { fine: [1.4, 0.14], macro: [0.011, 0.26], rough: 0.12, triplanar: true, minRough: style.road.minRough ?? 0.02, sunSpec: style.road.sunSpec ?? 0.3 });
}

// Approach to a set piece: glowing chevrons on the road and a gantry with a sign
function approachSign(track, s, text, style, steel) {
  const group = new THREE.Group();
  const hw = track.halfWidth;
  const cMat = new THREE.MeshBasicMaterial({ map: chevronTexture(), color: new THREE.Color(0xffd400).multiplyScalar(1.1), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  const cGeo = new THREE.PlaneGeometry(6, 6).rotateX(-Math.PI / 2);
  for (const back of [46, 32, 18, 4]) {
    for (const lat of [-hw * 0.5, hw * 0.5]) {
      const p = track.pointAt(s - back, lat);
      const c = new THREE.Mesh(cGeo, cMat);
      c.position.set(p.x, p.y + 0.04, p.z);
      c.rotation.y = p.heading + Math.PI;
      c.renderOrder = 2;
      group.add(c);
    }
  }
  if (!text) return group;
  const g = new THREE.Group();
  const gp = track.pointAt(s - 30, 0);
  for (const sd of [-1, 1]) {
    const pil = new THREE.Mesh(new THREE.BoxGeometry(0.9, 9, 0.9), steel);
    pil.position.set(sd * (hw + 1.6), 4.5, 0);
    pil.castShadow = true;
    g.add(pil);
  }
  const board = new THREE.Mesh(new THREE.PlaneGeometry(track.width * 0.8, 2.2), new THREE.MeshBasicMaterial({ map: textTexture(`▲  ${text}  ▲`, { accent: style.accent ?? '#ff2d55', bg: '#ffd400', fg: '#111111' }), toneMapped: false, side: THREE.DoubleSide }));
  board.position.set(0, 8.2, 0);
  board.rotation.y = Math.PI;
  g.add(board);
  const bar = new THREE.Mesh(new THREE.BoxGeometry(track.width + 4, 0.5, 0.6), steel);
  bar.position.y = 9.5;
  g.add(bar);
  g.position.set(gp.x, gp.y, gp.z);
  g.rotation.y = gp.heading;
  group.add(g);
  return group;
}

// A rail (rail.js): road, walls with a glowing rim, a slab underneath, edge lights, and the steel
// that holds it up - columns under the low parts, plus towers and a beam over a loop's top or a
// spine through a corkscrew. A helix gets only its road (the map builds its tower round it). It
// joins the main road exactly where that stops.
function buildRail(rail, style, roadMat) {
  const group = new THREE.Group();
  const track = rail.track, hw = track.halfWidth, step = track.step, lead = rail.R.lead;
  const u0 = rail.uOf(Math.floor(rail.s0 / step) * step);
  const u1 = rail.release ? rail.length : rail.uOf(Math.ceil(rail.s1 / step) * step);
  const us = [];
  for (let u = u0; u < u1; u += 1) us.push(u);
  us.push(u1);
  // asphalt texture runs on without a seam into the main road at both ends
  const mid = rail.midArc, extra = 40 * Math.round((mid - rail.span) / 40), k = (rail.span + extra) / mid;
  const vOf = (u) => (u <= lead ? rail.sA + u : u >= lead + mid ? rail.s1 + extra + u - (lead + mid) : rail.s0 + (u - lead) * k) / 40;
  const look = style.rail || style.loop || {};

  const road = new THREE.Mesh(railRibbon(rail, us, [-hw, 0], [hw, 0], vOf), tippedRoad(roadMat, style));
  road.receiveShadow = true;
  group.add(road);

  const bs = style.barrier || {};
  const wallMat = addWorldDetail(new THREE.MeshStandardMaterial({ color: bs.color ?? 0x2a2a2e, roughness: 0.7, metalness: 0.2, side: THREE.DoubleSide }), { fine: [1.2, 0.35], macro: [0.04, 0.25], rough: 0.2, triplanar: true });
  const slabMat = new THREE.MeshStandardMaterial({ color: look.under ?? 0x1c1d22, roughness: 0.55, metalness: 0.6, side: THREE.DoubleSide });
  const w0 = hw, w1 = hw + 0.5, w2 = hw + 1.1, top = 1.1, under = -1.2;
  const add = (g, m, cast = true) => { const o = new THREE.Mesh(g, m); o.castShadow = cast; o.receiveShadow = true; group.add(o); return o; };
  for (const sd of [-1, 1]) {
    const f = (a, b) => (sd > 0 ? [a, b] : [b, a]); // keep every face pointing the same way round
    add(railRibbon(rail, us, ...f([sd * w0, 0], [sd * w1, 0])), slabMat, false); // rim up to the wall
    add(railRibbon(rail, us, ...f([sd * w1, top], [sd * w1, 0])), wallMat); // inner face
    add(railRibbon(rail, us, ...f([sd * w2, top], [sd * w1, top])), wallMat); // top
    add(railRibbon(rail, us, ...f([sd * w2, under], [sd * w2, top])), wallMat); // outer face
  }
  add(railRibbon(rail, us, [w2, under], [-w2, under]), slabMat); // underside

  // glowing rim on both wall tops and a band down each outer face: from afar a ring of light
  const glow = new THREE.Color(look.glow ?? (bs.glow ? bs.glow[0] : 0xff6a1a)).multiplyScalar(look.glowIntensity ?? 4);
  const glowMat = new THREE.MeshBasicMaterial({ color: glow, side: THREE.DoubleSide });
  for (const sd of [-1, 1]) {
    const f = (a, b) => (sd > 0 ? [a, b] : [b, a]);
    add(railRibbon(rail, us, ...f([sd * (w2 - 0.1), top + 0.02], [sd * (w1 + 0.1), top + 0.02])), glowMat, false);
    add(railRibbon(rail, us, ...f([sd * (w2 + 0.02), under * 0.25 - 0.15], [sd * (w2 + 0.02), under * 0.25 + 0.15])), glowMat, false);
  }

  // edge lights every few metres (a sense of speed going round)
  const studs = [];
  for (let u = Math.max(u0, lead); u < Math.min(u1, lead + mid); u += 5) for (const sd of [-1, 1]) studs.push([u, sd * (hw - 0.35)]);
  const m = new THREE.Matrix4();
  if (studs.length) {
    const lights = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.08, 1.2), new THREE.MeshBasicMaterial({ color: glow.clone().multiplyScalar(0.6) }), studs.length);
    studs.forEach(([u, lat], i) => lights.setMatrixAt(i, railMatrix(rail, u, lat, 0.03, m)));
    group.add(lights);
  }

  const steel = new THREE.MeshStandardMaterial({ color: look.steel ?? 0x3a3a40, roughness: 0.5, metalness: 0.7 });
  const P = {};
  const ground = track.pointAt(rail.s0, 0).y;
  if (rail.kind !== 'helix') {
    // columns from the ground up to the low parts (where the slab faces down)
    const cols = [];
    for (let u = lead + 6; u < lead + mid - 6; u += 9) {
      rail.pose(u, 0, P);
      if (P.uy < 0.35) continue;
      const bx = P.x - P.ux * 1.2, by = P.y - P.uy * 1.2, bz = P.z - P.uz * 1.2;
      if (by - ground < 1.5) continue;
      for (const sd of [-1, 1]) {
        const x = bx + P.bx * sd * (hw - 2), z = bz + P.bz * sd * (hw - 2);
        cols.push({ x, z, y0: ground - 1, y1: by + P.by * sd * (hw - 2) });
      }
    }
    if (cols.length) {
      const colMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), steel, cols.length);
      cols.forEach((c, i) => { m.makeScale(0.9, c.y1 - c.y0, 0.9); m.setPosition(c.x, c.y0, c.z); colMesh.setMatrixAt(i, m); });
      colMesh.castShadow = true;
      group.add(colMesh);
    }
  }
  const beamBetween = (a, b, size) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    const bm = new THREE.Mesh(new THREE.BoxGeometry(size, size, len), steel);
    bm.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    bm.lookAt(b.x, b.y, b.z);
    bm.castShadow = true;
    group.add(bm);
  };
  if (rail.kind === 'loop') {
    // two towers and a beam over the top, struts down to the loop
    const uTop = lead + mid / 2;
    rail.pose(uTop, 0, P);
    const T0 = track.pointAt(rail.s0, 0);
    const beamY = P.y + 1.2 + 4;
    const left = rail.pose(uTop, -(w2 + 7)), right = rail.pose(uTop, w2 + 7);
    for (const q of [left, right]) {
      const tower = new THREE.Mesh(new THREE.BoxGeometry(2.4, beamY - ground + 1.2, 2.4), steel);
      tower.position.set(q.x, (ground + beamY) / 2, q.z);
      tower.rotation.y = T0.heading;
      tower.castShadow = true;
      group.add(tower);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.6, 2.6), glowMat);
      lamp.position.set(q.x, beamY + 0.8, q.z);
      lamp.rotation.y = T0.heading;
      group.add(lamp);
    }
    beamBetween({ x: left.x, y: beamY, z: left.z }, { x: right.x, y: beamY, z: right.z }, 1.8);
    for (const sd of [-0.6, 0.6]) {
      const q = rail.pose(uTop, sd * hw);
      beamBetween({ x: q.x, y: q.y + 1.2, z: q.z }, { x: q.x, y: beamY, z: q.z }, 0.7);
    }
  } else if (rail.kind === 'corkscrew') {
    // a steel spine along the twist's axis with spokes out to the road, on legs at both ends
    const Q = {};
    const axis = (u) => { rail.pose(u, 0, Q); return { x: Q.x + Q.ux * (rail.radius + 1.2), y: Q.y + Q.uy * (rail.radius + 1.2), z: Q.z + Q.uz * (rail.radius + 1.2) }; };
    const a0 = axis(lead + 2), a1 = axis(lead + mid - 2);
    beamBetween(a0, a1, 1.6);
    for (let u = lead + 8; u < lead + mid - 6; u += 10) {
      rail.pose(u, 0, Q);
      const under = { x: Q.x - Q.ux * 1.2, y: Q.y - Q.uy * 1.2, z: Q.z - Q.uz * 1.2 };
      const ax = axis(u);
      // the spoke runs from the axis out through the road to the slab's underside
      beamBetween(ax, { x: under.x - (ax.x - under.x) * 0.06, y: under.y - (ax.y - under.y) * 0.06, z: under.z - (ax.z - under.z) * 0.06 }, 0.55);
    }
    for (const a of [a0, a1]) {
      for (const sd of [-1, 1]) {
        const p = track.pointAt(rail.sOf(a === a0 ? lead + 2 : lead + mid - 2), sd * (hw + 3));
        beamBetween({ x: p.x, y: p.y - 1, z: p.z }, a, 1.1);
      }
    }
  }
  const label = { loop: 'LOOP', corkscrew: 'CORKSCREW' }[rail.kind];
  group.add(approachSign(track, rail.sA + lead, label, style, steel));
  return group;
}

// A jump (features.js): chevrons up the kicker, JUMP boards, hazard stripes along the lip and
// the cut faces of the road at both sides of the gap (the map builds what lies below)
function buildJump(j, style) {
  const group = new THREE.Group();
  const track = j.track, hw = track.halfWidth;
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.5, metalness: 0.7 });
  group.add(approachSign(track, j.sRamp + 6, j.spec.sign === false ? null : j.spec.sign || 'JUMP', style, steel));
  // the faces where the road stops and starts again: a deck's thickness, striped at the lip
  const stripe = new THREE.MeshBasicMaterial({ map: rampTexture(), toneMapped: true });
  const deck = new THREE.MeshStandardMaterial({ color: j.spec.deck ?? 0x2e2c2a, roughness: 0.85 });
  for (const [s, h, mat, face] of [[j.sLip, j.h, stripe, 1], [j.sLand, 0, deck, -1]]) {
    const p = track.pointAt(s, 0);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(track.width + 4.4, 2.4, 0.6), [deck, deck, deck, deck, face > 0 ? mat : deck, face < 0 ? mat : deck]);
    slab.position.set(p.x, p.y + h - 1.2, p.z);
    slab.rotation.y = p.heading;
    slab.castShadow = true;
    group.add(slab);
  }
  // a thin lit edge along the lip
  const lp = track.pointAt(j.sLip, 0);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(track.width, 0.12, 0.3), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd400).multiplyScalar(2.5) }));
  edge.position.set(lp.x, lp.y + j.h + 0.06, lp.z);
  edge.rotation.y = lp.heading;
  group.add(edge);
  return group;
}

// A wall-ride (features.js): the road curls up into a half-pipe on one side. Built as a grid
// across the road, with a lip wall and its glow on the curl, the normal barrier on the flat
// side, the curl's back down to the ground and glowing strips along the curve.
function buildBank(b, style, roadMat, shoulderMat) {
  const group = new THREE.Group();
  const track = b.track, hw = track.halfWidth, sd = b.side;
  const i0 = Math.floor(b.s0 / track.step), i1 = Math.ceil((b.s0 + b.span) / track.step);
  const rows = [];
  for (let i = i0; i <= i1; i++) rows.push(i);
  const pr = {};
  // a point on (or `h` metres off) the curled surface at sample i, across-road position lat
  const point = (i, lat, h = 0) => {
    const k = ((i % track.n) + track.n) % track.n, s = i * track.step;
    b.profile(s, lat, pr);
    const rx = track.rx[k], rz = track.rz[k];
    const ux = -rx * sd * Math.sin(pr.a), uy = Math.cos(pr.a), uz = -rz * sd * Math.sin(pr.a);
    return [track.x[k] + rx * pr.off + ux * h, track.y[k] + pr.h + uy * h, track.z[k] + rz * pr.off + uz * h];
  };
  // grid between two across-road positions (cols columns); flip: face up when lat0 < lat1
  const grid = (lat0, lat1, cols, h, mat, { uv = null, flip = false } = {}) => {
    const pos = [], uvs = [], idx = [];
    rows.forEach((i, r) => {
      for (let c = 0; c <= cols; c++) {
        const lat = lat0 + ((lat1 - lat0) * c) / cols;
        pos.push(...point(i, lat, typeof h === 'function' ? h(c) : h));
        uvs.push(...(uv ? uv(c, i) : [c / cols, (i * track.step) / 40]));
      }
      if (r < rows.length - 1) for (let c = 0; c < cols; c++) {
        const a = r * (cols + 1) + c, b2 = a + 1, cc = a + cols + 1, d = cc + 1;
        if (flip) idx.push(a, b2, cc, b2, d, cc); else idx.push(a, cc, b2, b2, cc, d);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mat);
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const roadUv = (c, i) => [c / 24, (i * track.step) / 40];
  const surf = tippedRoad(roadMat, style);
  surf.side = THREE.DoubleSide;
  grid(-hw, hw, 24, 0, surf, { uv: roadUv, flip: true });
  // shoulder strips: the flat side as usual, the curl side runs on up to the lip
  grid(-sd * (hw + 2.2), -sd * hw, 2, -0.03, shoulderMat, { flip: sd > 0 });
  grid(sd * hw, sd * (hw + 0.5), 2, -0.01, shoulderMat, { flip: sd > 0 });
  const bs = style.barrier || {};
  const look = b.spec.look || {};
  const wallMat = addWorldDetail(new THREE.MeshStandardMaterial({ color: look.wall ?? bs.color ?? 0x5a5c66, roughness: 0.75, metalness: 0.1, side: THREE.DoubleSide }), { fine: [1.2, 0.35], macro: [0.04, 0.25], rough: 0.2, triplanar: true });
  const glow = new THREE.Color(look.glow ?? (bs.glow ? bs.glow[sd < 0 ? 0 : 1] ?? bs.glow[0] : 0xffd23f)).multiplyScalar(look.glowIntensity ?? 3.2);
  const glowMat = new THREE.MeshBasicMaterial({ color: glow, side: THREE.DoubleSide });
  // the lip wall on the curl (standing off the surface) and the flat side's wall
  const wallOn = (lat, hgt, back) => {
    grid(lat, lat, 1, (c) => c * hgt, wallMat);
    grid(lat, lat + 0.6 * Math.sign(lat), 1, hgt, wallMat);
    if (back !== null) grid(lat + 0.6 * Math.sign(lat), lat + 0.6 * Math.sign(lat), 1, (c) => (c ? back : hgt), wallMat);
  };
  wallOn(sd * (hw + 0.5), 1.1, null);
  wallOn(-sd * (hw + 0.5), bs.height ?? 1.05, -4);
  grid(sd * (hw + 0.55), sd * (hw + 1.05), 1, 1.12, glowMat);
  // the back of the curl, from the lip down to the ground
  {
    const pos = [], idx = [];
    rows.forEach((i, r) => {
      const top = point(i, sd * (hw + 1.1), 1.1);
      const k = ((i % track.n) + track.n) % track.n;
      pos.push(...top, top[0], track.y[k] - 3, top[2]);
      if (r < rows.length - 1) { const p = r * 2; idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2); }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const back = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: look.back ?? 0x2a2a30, roughness: 0.85, side: THREE.DoubleSide }));
    back.castShadow = true;
    group.add(back);
  }
  // glowing strips along the curve (a tube of light) - three lines up the half-pipe
  if (look.strips !== false) {
    const stripMat = new THREE.MeshBasicMaterial({ color: glow.clone().multiplyScalar(0.8), side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    for (const f of [0.45, 0.68, 0.88]) {
      const lat = sd * hw * f;
      grid(lat - sd * 0.18, lat + sd * 0.18, 1, 0.02, stripMat, { flip: sd > 0 });
    }
  }
  return group;
}
