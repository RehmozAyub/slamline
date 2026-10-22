// SUNSET COAST: golden-hour cliffs, palm trees, animated ocean, a lighthouse and sailboats.
// The road jumps a cove off the clifftop, dives into a sea cave where it meets the shore and
// corkscrews through a sea arch out on the headland, whose sides drop to the sea as cliffs.
// Surf rolls in on the beaches, gulls wheel overhead and the low sun throws shafts of light.
import * as THREE from 'three';
import { LAYOUTS, LAYOUT_SCALE } from './layouts.js';
import { fbm, noise2, buildTerrain, terrainSampler, terrainLocal, mountainRing } from '../terrain.js';
import { rng, colored, merge, instanced, scatter } from '../scenery.js';
import { waterMaterial, shoreMap } from '../water.js';
import { radialTexture } from '../textures.js';

const SEA = -1.2;
const shoreZ = (z) => z / LAYOUT_SCALE;
const shoreX = (z) => LAYOUT_SCALE * (430 + 70 * Math.sin(shoreZ(z) * 0.0042 + 0.6) + 30 * Math.sin(shoreZ(z) * 0.013));
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function natural(x, z) {
  const d = shoreX(z) - x; // + inland
  const inland = 6 + fbm(x * 0.0035 + 3, z * 0.0035) * 80 + Math.max(0, -x - 300) * 0.12;
  if (d < 0) return SEA - 3 + d * 0.06;
  const beach = Math.min(1, d / 50);
  return SEA - 2 + beach * 3 + Math.pow(Math.min(1, d / 260), 1.5) * inland;
}

// the ground: the natural coast raised to the road near it. Out at sea the road runs along a
// headland, and there the ground falls away to the sea floor in cliffs. Over the sea cave
// (s from a to b) the ground swells into a hill either side of the road
function roadsideHeight(track, index, hw, cave) {
  return (x, z) => {
    const n = index.nearest(x, z, 3);
    const nat = natural(x, z);
    if (!isFinite(n.dist)) return nat;
    const sea = smooth(SEA + 2, SEA - 6, nat);
    const k = smooth(hw + 14 - sea * 2, hw + 90 - sea * 52, n.dist);
    let h = (n.y - 1.2) * (1 - k) + nat * k;
    if (cave && n.dist > hw + 26) { // (clear of the cave's walls, even across a coarse cell)
      const s = n.idx * track.step, f = smooth(cave.a - 40, cave.a + 10, s) * smooth(cave.b + 40, cave.b - 10, s);
      if (f > 0) h += (Math.max(h, n.y + 12) - h) * f * smooth(hw + 26, hw + 46, n.dist) * smooth(130, 80, n.dist);
    }
    return h;
  };
}

// the cove under the cliff jump: a channel from the sea in under the gap, ending in a round
// head with a scrap of beach. Local frame: u from the gap's middle out toward the sea, a along
// the road (the gap's edges are at a = -half and +half). The cliff tops run straight across
// under the road and its embankments, so the road ends cleanly at the edge
function coveOf(track, jump) {
  const m = track.pointAt(track.wrapS(jump.sLip + jump.gap / 2), 0);
  const sd = natural(m.x + m.rx * 120, m.z + m.rz * 120) < natural(m.x - m.rx * 120, m.z - m.rz * 120) ? 1 : -1;
  const c = { x: m.x, z: m.z, y: m.y, dx: m.rx * sd, dz: m.rz * sd, tx: m.tx, tz: m.tz, half: jump.gap / 2, head: -26, len: 150, floor: SEA - 7 };
  c.local = (x, z) => ({ u: (x - c.x) * c.dx + (z - c.z) * c.dz, a: (x - c.x) * c.tx + (z - c.z) * c.tz });
  c.world = (u, a) => [c.x + c.dx * u + c.tx * a, c.z + c.dz * u + c.tz * a];
  // the cove's half-width at u (cliff top), ragged away from the road
  c.width = (u, a) => {
    let w = u < c.head ? Math.sqrt(Math.max(0, c.half * c.half - (u - c.head) ** 2)) : c.half + Math.min(30, Math.max(0, u - 28) * 0.3);
    if (w > 0) w += (noise2(u * 0.07, a > 0 ? 1.3 : 7.9) - 0.5) * 7 * smooth(28, 40, Math.abs(u));
    return w;
  };
  c.carve = (x, z, h) => {
    const { u, a } = c.local(x, z);
    if (u < c.head - c.half - 6 || u > c.len) return h;
    const w = c.width(u, a);
    const beach = smooth(c.head - c.half + 13, c.head - c.half + 3, u) * 8.4; // up out of the water at the head
    const floor = c.floor + beach;
    const carved = floor + (h - floor) * smooth(w - 3, w, Math.abs(a));
    return h + (Math.min(h, carved) - h) * smooth(c.len, c.len - 30, u);
  };
  c.inside = (x, z, margin = 0) => {
    const { u, a } = c.local(x, z);
    return u > c.head - c.half - margin && u < c.len && Math.abs(a) < c.width(u, a) + margin;
  };
  return c;
}

export function palmGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.16, 0.3, 9, 7, 8);
  const p = trunk.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + 4.5;
    p.setX(i, p.getX(i) + Math.pow(y / 9, 2) * 1.6);
    p.setY(i, y);
  }
  trunk.computeVertexNormals();
  parts.push(colored(trunk, 0x6b4e33, 0x8a6a45));
  for (let k = 0; k < 8; k++) {
    const leaf = new THREE.PlaneGeometry(1.1, 4.6, 1, 5);
    const lp = leaf.attributes.position;
    for (let i = 0; i < lp.count; i++) {
      const t = (lp.getY(i) + 2.3) / 4.6; // 0 at base, 1 at tip
      const w = Math.sin(t * Math.PI) * 0.9 + 0.1;
      lp.setX(i, lp.getX(i) * w);
      lp.setZ(i, -t * t * 1.8); // droop
      lp.setY(i, t * 4.6);
    }
    leaf.rotateX(-Math.PI / 2 + 0.35);
    leaf.rotateY((k / 8) * Math.PI * 2);
    leaf.translate(1.6, 9, 0);
    leaf.computeVertexNormals();
    parts.push(colored(leaf, 0x2f5a1c, 0x5f8f2a));
  }
  return merge(parts);
}

function houseGeometries() {
  const walls = colored(new THREE.BoxGeometry(8, 5, 7).translate(0, 2.5, 0), 0xf1e9dc);
  const roof = colored(new THREE.ConeGeometry(6.2, 2.6, 4).rotateY(Math.PI / 4).translate(0, 6.3, 0), 0xb4532e);
  return merge([walls, roof]);
}

// layered sea rock: warm sandstone bands, darker and wet toward the waterline
const ROCK = [0x8a6a52, 0xa8846a, 0x6e5444, 0x9a7a5e].map((h) => new THREE.Color(h));
const WET_ROCK = new THREE.Color(0x3e342e), GRASS_TOP = new THREE.Color(0x5f7a32);
function paintRock(geo, baseY, { grassAbove = Infinity } = {}) {
  const p = geo.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) + baseY;
    c.copy(ROCK[Math.floor(y * 0.35 + 40 + fbm(p.getX(i) * 0.05, p.getZ(i) * 0.05, 2) * 2) % ROCK.length]);
    c.lerp(WET_ROCK, smooth(SEA + 3, SEA, y) * 0.8);
    if (y > grassAbove) c.lerp(GRASS_TOP, 0.8);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// a natural arch over the road: big rough boulders heaped along a curve, legs `span` apart
// standing in the sea, kept out of `clear` (the corkscrew's reach: |x| < clear[0], y < clear[1]).
// Local frame: x across the road, y up from the road, z along it
function archGeometry(span, crown, foot, clear, rand) {
  const curve = new THREE.CatmullRomCurve3([
    [-span / 2 - 6, -foot], [-span / 2, crown * 0.4], [-span / 2 + 8, crown * 0.86], [0, crown], [span / 2 - 8, crown * 0.86], [span / 2, crown * 0.4], [span / 2 + 6, -foot],
  ].map(([x, y]) => new THREE.Vector3(x, y, 0)));
  const parts = [], q = new THREE.Quaternion(), e = new THREE.Euler(), m = new THREE.Matrix4(), v = new THREE.Vector3();
  const N = 26;
  for (let i = 0; i <= N; i++) {
    const t = i / N, c = curve.getPointAt(t), leg = 1 - Math.sin(t * Math.PI);
    let r = (8 + leg * 6) * (0.85 + rand() * 0.3);
    // distance from the centre to the corkscrew's box: the boulder may not reach into it
    const dx = Math.max(0, Math.abs(c.x) - clear[0]), dy = Math.max(0, c.y - clear[1]);
    if (dx === 0 && dy === 0) continue;
    r = Math.min(r, Math.hypot(dx, dy) - 1);
    if (r < 3) continue;
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position, seed = rand() * 50;
    for (let k = 0; k < p.count; k++) {
      v.set(p.getX(k), p.getY(k), p.getZ(k));
      v.multiplyScalar(0.8 + noise2(v.x * 1.3 + seed, v.y * 1.3 + v.z) * 0.45);
      p.setXYZ(k, v.x, v.y, v.z);
    }
    e.set(rand() * 6.28, rand() * 6.28, rand() * 6.28);
    m.compose(c.clone().setZ((rand() - 0.5) * 6), q.setFromEuler(e), v.set(r * (0.95 + rand() * 0.1), r * (0.85 + rand() * 0.25), r * (1.3 + rand() * 0.4)));
    parts.push(g.applyMatrix4(m));
  }
  const g = merge(parts.map((x) => x.toNonIndexed()));
  g.computeVertexNormals();
  return g;
}

function seaStack(h, r, rand) {
  const g = new THREE.CylinderGeometry(r * (0.55 + rand() * 0.25), r, h, 7, 8).translate(0, h / 2, 0).toNonIndexed();
  const p = g.attributes.position, seed = rand() * 50;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (noise2(x * 0.3 + seed, y * 0.12 + z * 0.3) - 0.5) * 0.6 - smooth(h * 0.75, h, y) * 0.25;
    p.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
  return g;
}

// gulls: two-part wings in a shallow M, flapped by scaling the instance's height
function gullGeometry() {
  const g = new THREE.BufferGeometry();
  const v = [];
  for (const sd of [-1, 1]) {
    v.push(0, 0, 0.45, sd * 0.9, 0.22, 0.05, 0, 0, -0.35); // inner wing
    v.push(sd * 0.9, 0.22, 0.05, sd * 2.1, -0.12, -0.3, sd * 0.9, 0.22, -0.25); // outer wing
  }
  v.push(0, 0, 0.9, 0.18, 0, -0.6, -0.18, 0, -0.6); // body
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

// the lighthouse's beams: long cones, bright at the lamp and fading out along their length
function beamMaterial(color) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) } },
    vertexShader: /* glsl */ `
      varying float vAlong; varying vec3 vN; varying vec3 vView;
      void main() {
        vAlong = length(position) / 150.0;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; varying float vAlong; varying vec3 vN; varying vec3 vView;
      void main() {
        float edge = abs(dot(normalize(vN), normalize(vView)));
        gl_FragColor = vec4(uColor * pow(1.0 - clamp(vAlong, 0.0, 1.0), 2.2) * 0.32 * edge, 1.0);
      }`,
  });
}

export default {
  id: 'coast',
  name: 'SUNSET COAST',
  tagline: 'Golden-hour cliffs above the ocean',
  layout: LAYOUTS.coast,
  exposure: 0.97,
  envIntensity: 1.0,
  bloom: { strength: 0.24, radius: 0.45, threshold: 1.15 },
  fog: { color: 0xc98a66, density: 0.0005 },
  sky: {
    top: 0x28305e, horizon: 0xf09050, bottom: 0x6a4a5a,
    sunDir: new THREE.Vector3(0.82, 0.07, -0.35), sunColor: 0xffb060, sunSize: 0.0016, sunIntensity: 4.5, glow: 0.5,
    clouds: 0.45, cloudColor: 0xff9f7a, horizonSharp: 0.55, rays: 0.22,
  },
  sun: { color: 0xffb070, intensity: 3.6 },
  hemi: { sky: 0x9fb0ff, ground: 0x6a4030, intensity: 0.9 },
  smoke: [0.85, 0.78, 0.72],
  tunnels: { seacave: { rock: [0x5a4a3c, 0x8e6e54], grass: 0x6f8a3a, crag: 9 } },
  trackStyle: {
    road: { base: '#4a4a50', line: '#f2f2f2', edge: '#f2f2f2', lanes: 3, roughness: 0.86, cracks: 0.8, patches: 2, aggregate: 1.15, seed: 21 }, // sun-bleached
    kerb: ['#d01818', '#f2f2f2'],
    barrier: { type: 'guardrail', color: 0xd8dde4 },
    embankment: 0x7a6a4a,
    shoulder: 0x5a5046,
    shortcut: { color: 0x8f7a5e },
    accent: '#ff5a2d',
    rail: { glow: 0xff7a3a, glowIntensity: 3, steel: 0xe8e2da, under: 0x3a3436 },
  },

  build({ scene, track, index, density, envScene, sunDir, jumps = [], rails = [], tunnels = [] }) {
    const rand = rng(42);
    const hw = track.halfWidth, step = track.step;
    const cave = tunnels[0] || null, screw = rails.find((r) => r.kind === 'corkscrew') || null;
    const baseHeight = roadsideHeight(track, index, hw, cave);
    const jump = jumps[0] || null;
    const cove = jump ? coveOf(track, jump) : null;
    const heightAt = (x, z) => (cove ? cove.carve(x, z, baseHeight(x, z)) : baseHeight(x, z));

    // keep scenery off the set pieces: the cove, the cave's hill, the corkscrew and the jump
    const busy = (x, z, margin = 0) => {
      if (cove && cove.inside(x, z, 10 + margin)) return true;
      const n = index.nearest(x, z, 3);
      if (!isFinite(n.dist)) return false;
      const s = n.idx * step;
      if (cave && track.deltaS(cave.a - 30, s) >= 0 && track.deltaS(s, cave.b + 30) >= 0 && n.dist < 80 + margin) return true;
      if (screw && track.deltaS(screw.sA - 20, s) >= 0 && track.deltaS(s, screw.sB + 20) >= 0 && n.dist < 50 + margin) return true;
      return !!jump && jump.near(s, 40) && n.dist < hw + 14 + margin;
    };

    const sand = new THREE.Color(0xd9bd88), grass = new THREE.Color(0x6f8a3a), dry = new THREE.Color(0xa99a55), rock = new THREE.Color(0x8a7058), rockLight = new THREE.Color(0xb08c6a), wet = new THREE.Color(0x8a7550);
    const rc = new THREE.Color();
    const colorAt = (c, x, y, z, ny) => {
      if (y < SEA + 0.4) c.copy(wet);
      else if (y < SEA + 2.2) c.copy(sand);
      else {
        c.copy(grass).lerp(dry, fbm(x * 0.01, z * 0.01, 3));
        if (y < SEA + 4) c.lerp(sand, 1 - (y - SEA - 2.2) / 1.8);
      }
      if (ny < 0.82) {
        rc.copy(rock).lerp(rockLight, 0.5 + 0.5 * Math.sin(y * 0.8 + fbm(x * 0.02, z * 0.02, 2) * 5));
        c.lerp(rc, Math.min(1, (0.82 - ny) * 5));
      }
    };
    const terrain = buildTerrain({ size: 2800, res: 220, center: [60, 0], heightAt, colorAt });
    scene.add(terrain);
    // the ground as drawn, for the surf (the cove's patch where there is one)
    const coarse = terrainSampler(terrain);
    let fine = () => null;
    // the cove's cliffs in finer detail: a patch over it (2 m cells, lined up with the cove), the
    // coarse ground sunk out of sight underneath a cell in from the patch's edge
    if (cove) {
      const u0 = cove.head - cove.half - 6, u1 = cove.len;
      const [px, pz] = cove.world((u0 + u1) / 2, 0), w = 128, d = u1 - u0;
      const patch = buildTerrain({ size: [w, d], res: [w / 2, Math.round(d / 2)], center: [px, pz], angle: Math.atan2(cove.dx, cove.dz), heightAt, colorAt, material: terrain.material });
      scene.add(patch);
      fine = terrainSampler(patch);
      const p = terrain.geometry.attributes.position, cell = 2800 / 220;
      for (let i = 0; i < p.count; i++) if (terrainLocal(patch, p.getX(i), p.getZ(i)).inset > cell * 0.9) p.setY(i, Math.min(p.getY(i), SEA - 16));
      terrain.geometry.computeVertexNormals();
    }

    const ringMat = mountainRing({ inner: 1500, outer: 3400, peak: 380, snowLine: 9999, rock: 0x8a6a5a, grass: 0x5f6a3a, seed: 4, baseY: -30 });
    scene.add(ringMat);

    // the ocean, turquoise over the shallows with surf along the shore
    const shore = shoreMap((x, z) => fine(x, z) ?? coarse(x, z) ?? natural(x, z), [280, -1400, 900, 1400], SEA, 4);
    const ocean = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000, 1, 1).rotateX(-Math.PI / 2), waterMaterial({ sunDir, spec: 10, shore, lagoon: 0x3aa8a0, foam: 0xfff0e2 }));
    ocean.position.y = SEA;
    scene.add(ocean);

    // palms along the road and on the beach
    const palms = scatter(Math.round(520 * density), rand, [-900, 900, -900, 900], (x, z) => {
      const n = index.nearest(x, z, 2);
      if (n.dist < hw + 5 || (n.dist > hw + 60 && rand() < 0.75) || busy(x, z)) return null;
      const y = heightAt(x, z);
      if (y < SEA + 1.2) return null;
      return { x, y: y - 0.2, z, ry: rand() * Math.PI * 2, s: 0.8 + rand() * 0.6, rz: (rand() - 0.5) * 0.15 };
    });
    const leafMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    scene.add(instanced(palmGeometry(), leafMat, palms));

    // rocks along the waterline (the beaches, the headland's cliffs, the cove)
    const rocks = scatter(Math.round(220 * density), rand, [250, 900, -900, 900], (x, z) => {
      const y = heightAt(x, z);
      if (y < SEA - 3 || y > SEA + 1.5 || index.nearest(x, z, 2).dist < hw + 6) return null;
      return { x, y: y - 0.4, z, rx: rand() * 3, ry: rand() * 3, s: 1.2 + rand() * 4 };
    }, Math.round(220 * density) * 60);
    scene.add(instanced(colored(new THREE.DodecahedronGeometry(1, 0), 0x7d6b5c), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), rocks));

    // villas on the hills
    const villas = scatter(Math.round(70 * density), rand, [-1100, 300, -1000, 1000], (x, z) => {
      const n = index.nearest(x, z, 3);
      if (n.dist < hw + 30 || busy(x, z, 10)) return null;
      const y = heightAt(x, z);
      if (y < SEA + 5) return null;
      return { x, y: y - 0.5, z, ry: rand() * Math.PI, s: 0.8 + rand() * 0.6 };
    });
    scene.add(instanced(houseGeometries(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), villas, { receive: true }));

    const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true });

    // --- the sea arch over the corkscrew, and sea stacks off the headland -----------------
    let archAt = null;
    if (screw) {
      const P = track.pointAt(track.wrapS(screw.s0 + screw.span / 2), 0);
      const foot = P.y + 14;
      const arch = new THREE.Mesh(paintRock(archGeometry(64, 40, foot, [screw.radius + 5, 2 * screw.radius + 6], rand), P.y, { grassAbove: P.y + 45 }), rockMat);
      arch.position.set(P.x, P.y, P.z);
      arch.rotation.y = P.heading;
      arch.castShadow = arch.receiveShadow = true;
      scene.add(arch);
      archAt = { x: P.x, y: P.y + 42, z: P.z };
    }
    const stacks = [];
    for (let k = 0; k < 160 && stacks.length < 9; k++) {
      const s = track.wrapS(3300 + rand() * 700), sd = rand() < 0.5 ? -1 : 1;
      const p = track.pointAt(s, sd * (hw + 55 + rand() * 120));
      if (heightAt(p.x, p.z) > SEA - 4 || busy(p.x, p.z, 10) || stacks.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 45)) continue;
      if (archAt && Math.hypot(archAt.x - p.x, archAt.z - p.z) < 70) continue;
      const h = 18 + rand() * 30, r = 5 + rand() * 6, y0 = heightAt(p.x, p.z) - 2;
      stacks.push({ x: p.x, z: p.z, geo: paintRock(seaStack(h, r, rand).translate(p.x, y0, p.z), 0, { grassAbove: y0 + h - 2.5 }) });
    }
    if (stacks.length) {
      const m = new THREE.Mesh(merge(stacks.map((q) => q.geo)), rockMat);
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
    }
    // boulders fallen into the cove
    if (cove) {
      const fallen = [];
      for (let k = 0; k < 40 && fallen.length < 14; k++) {
        const u = cove.head - 6 + rand() * 120, sd = rand() < 0.5 ? -1 : 1;
        const a = sd * (cove.width(u, sd) - 2 - rand() * 4);
        const [x, z] = cove.world(u, a);
        if (Math.abs(u) < 14) continue; // none right under the flight
        fallen.push({ x, y: SEA - 1, z, rx: rand() * 3, ry: rand() * 3, s: 1.5 + rand() * 3 });
      }
      scene.add(instanced(colored(new THREE.DodecahedronGeometry(1, 0), 0x6e5a4a), rockMat, fallen));
    }

    // --- the lighthouse on the headland's tip, beams sweeping -----------------------------
    let tip = 0;
    for (let s = 0; s < track.length; s += 10) if (track.pointAt(s, 0).x > track.pointAt(tip, 0).x) tip = s;
    const outer = track.pointAt(tip, 0).rx > 0 ? 1 : -1;
    const lp = track.pointAt(tip, outer * (hw + 16));
    const beams = [];
    {
      const lh = new THREE.Group();
      const y0 = heightAt(lp.x, lp.z) - 0.5;
      const white = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6 });
      const red = new THREE.MeshStandardMaterial({ color: 0xc0282a, roughness: 0.6 });
      const base = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 6, 12, 16), new THREE.MeshStandardMaterial({ color: 0x9a8a78, roughness: 0.85 }));
      base.position.y = -4.5; // a stone plinth, down into the cliff
      lh.add(base);
      for (let i = 0; i < 5; i++) {
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(2.6 - i * 0.3, 2.9 - i * 0.3, 5, 16), i % 2 ? red : white);
        seg.position.y = 2.5 + i * 5;
        seg.castShadow = true;
        lh.add(seg);
      }
      const gallery = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.4, 16), new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.5, metalness: 0.6 }));
      gallery.position.y = 25.1;
      lh.add(gallery);
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 2.4, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff0c0).multiplyScalar(8) }));
      lamp.position.y = 26.4;
      lh.add(lamp);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.4, 12), red);
      cap.position.y = 28.8;
      lh.add(cap);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture('rgba(255,240,200,1)', 'rgba(255,200,120,0)', 64), color: 0xfff0c8, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.8 }));
      halo.scale.setScalar(16);
      halo.position.y = 26.4;
      lh.add(halo);
      const beamGeo = new THREE.ConeGeometry(9, 150, 24, 1, true).translate(0, -75, 0).rotateZ(Math.PI / 2);
      const beamMat = beamMaterial(0xfff0c8);
      for (const turn of [0, Math.PI]) {
        const holder = new THREE.Group();
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.rotation.y = turn;
        beam.rotation.z = -0.06; // tipped down a little toward the sea
        holder.add(beam);
        holder.position.y = 26.4;
        lh.add(holder);
        beams.push(holder);
      }
      lh.position.set(lp.x, y0, lp.z);
      scene.add(lh);
    }
    const landmark = { s: [tip], range: 80 }; // the lighthouse

    // sailboats
    const boats = [];
    const hullMat = new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.5 });
    const sailMat = new THREE.MeshStandardMaterial({ color: 0xfff6ea, roughness: 0.8, side: THREE.DoubleSide });
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.2, 8), hullMat);
      hull.position.y = 0.4;
      b.add(hull);
      const sailShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(0, 11), new THREE.Vector2(4.5, 0)]);
      const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), sailMat);
      sail.rotation.y = Math.PI / 2;
      sail.position.set(0, 1.2, -1.5);
      b.add(sail);
      const z = -1200 + rand() * 2400;
      b.position.set(shoreX(z) + 250 + rand() * 900, SEA, z);
      b.rotation.y = rand() * Math.PI * 2;
      b.userData.ph = rand() * 10;
      boats.push(b);
      scene.add(b);
    }

    // gulls wheeling over the cove, the arch and the lighthouse
    const flocks = [];
    if (cove) { const [x, z] = cove.world(40, 0); flocks.push({ x, z, y: cove.y + 22, r: 45 }); }
    if (archAt) flocks.push({ x: archAt.x, z: archAt.z, y: archAt.y + 14, r: 60 });
    flocks.push({ x: lp.x, z: lp.z, y: heightAt(lp.x, lp.z) + 42, r: 38 });
    const gullsPer = 5, gullCount = flocks.length * gullsPer;
    const gulls = new THREE.InstancedMesh(gullGeometry(), new THREE.MeshBasicMaterial({ color: 0xe8ded6, side: THREE.DoubleSide }), gullCount);
    gulls.frustumCulled = false;
    scene.add(gulls);
    const gullState = Array.from({ length: gullCount }, (_, i) => ({ f: flocks[Math.floor(i / gullsPer)], ph: rand() * 6.28, rr: 0.6 + rand() * 0.6, dy: rand() * 14, spd: (0.25 + rand() * 0.2) * (rand() < 0.3 ? -1 : 1), fl: 6 + rand() * 3 }));

    // environment: warm ground bounce for reflections
    const envGround = new THREE.Mesh(new THREE.CircleGeometry(300, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x3a2a24 }));
    envGround.position.y = -8;
    envScene.add(envGround);

    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), sc = new THREE.Vector3();
    return {
      landmark,
      update(dt, time) {
        ocean.material.uniforms.uTime.value = time;
        for (const b of beams) b.rotation.y = time * 0.7;
        for (const b of boats) {
          b.position.y = SEA + Math.sin(time * 0.9 + b.userData.ph) * 0.25;
          b.rotation.z = Math.sin(time * 0.7 + b.userData.ph) * 0.05;
        }
        gullState.forEach((g, i) => {
          const a = time * g.spd + g.ph, r = g.f.r * g.rr;
          const flap = Math.sin(time * g.fl + g.ph);
          // glide most of the time, a burst of flapping now and then
          const glide = smooth(0.2, 0.6, Math.sin(time * 0.4 + g.ph * 3));
          e.set(0, -a - (g.spd > 0 ? 0 : Math.PI), (g.spd > 0 ? 0.3 : -0.3));
          m4.compose(v3.set(g.f.x + Math.cos(a) * r, g.f.y + g.dy + Math.sin(time * 0.5 + g.ph) * 3, g.f.z + Math.sin(a) * r), q.setFromEuler(e), sc.set(1.4, 1.4 * (flap + (0.35 - flap) * glide), 1.4));
          gulls.setMatrixAt(i, m4);
        });
        gulls.instanceMatrix.needsUpdate = true;
      },
    };
  },
};
