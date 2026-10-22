// Track centreline control points for each map (pure data, no three.js).

// Star-shaped loop: radius varies with a few harmonics, so it can never self-intersect.
function radial({ count, R, harmonics, sx = 1, sz = 1, elevation, rot = 0 }) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const th = (i / count) * Math.PI * 2;
    let r = 1;
    for (const [k, amp, ph] of harmonics) r += amp * Math.sin(k * th + ph);
    r *= R;
    const a = th + rot;
    pts.push([Math.cos(a) * r * sx, elevation(th), Math.sin(a) * r * sz]);
  }
  return pts;
}

// Polyline with every corner replaced by a circular fillet; straights get evenly spaced points.
function filleted(corners, radius, y = () => 0, spacing = 45) {
  const m = corners.length;
  const arcs = [];
  for (let i = 0; i < m; i++) {
    const A = corners[(i - 1 + m) % m], P = corners[i], B = corners[(i + 1) % m];
    let d1x = P[0] - A[0], d1z = P[1] - A[1];
    let d2x = B[0] - P[0], d2z = B[1] - P[1];
    const l1 = Math.hypot(d1x, d1z), l2 = Math.hypot(d2x, d2z);
    d1x /= l1; d1z /= l1; d2x /= l2; d2z /= l2;
    const turn = Math.atan2(d1x * d2z - d1z * d2x, d1x * d2x + d1z * d2z);
    const r = Array.isArray(radius) ? radius[i] : radius;
    const t = r * Math.tan(Math.abs(turn) / 2);
    const S = [P[0] - d1x * t, P[1] - d1z * t];
    // left normal of d1 is (-d1z, d1x); centre lies on the inside of the turn
    const side = Math.sign(turn);
    const C = [S[0] - d1z * r * side, S[1] + d1x * r * side];
    const a0 = Math.atan2(S[1] - C[1], S[0] - C[0]);
    const steps = Math.max(2, Math.ceil(Math.abs(turn) / (Math.PI / 10)));
    const pts = [];
    for (let k = 0; k <= steps; k++) {
      const a = a0 + turn * (k / steps);
      pts.push([C[0] + Math.cos(a) * r, C[1] + Math.sin(a) * r]);
    }
    arcs.push(pts);
  }
  const out = [];
  for (let i = 0; i < m; i++) {
    const arc = arcs[i];
    for (const p of arc) out.push(p);
    const end = arc[arc.length - 1], next = arcs[(i + 1) % m][0];
    const len = Math.hypot(next[0] - end[0], next[1] - end[1]);
    const k = Math.floor(len / spacing);
    for (let j = 1; j < k; j++) {
      const f = j / k;
      out.push([end[0] + (next[0] - end[0]) * f, end[1] + (next[1] - end[1]) * f]);
    }
  }
  return out.map(([x, z]) => [x, y(x, z), z]);
}

// Canals of CANAL QUARTER (design-size coordinates): lines z = const and x = const. The road
// rises over a humpback bridge wherever it crosses one.
export const CANALS = { z: [-210, 40, 250], x: [-260, 330], halfWidth: 11, hump: 2.6, ramp: 30 };
function canalHump(x, z) {
  let d = Infinity;
  for (const cz of CANALS.z) d = Math.min(d, Math.abs(z - cz));
  for (const cx of CANALS.x) d = Math.min(d, Math.abs(x - cx));
  const t = Math.max(0, 1 - d / CANALS.ramp);
  return 0.4 + CANALS.hump * t * t * (3 - 2 * t);
}

// Every layout is scaled up from its design size (longer laps, room for the shortcuts).
export const LAYOUT_SCALE = 1.2;

// NEON CITY's subway dive (design-size coordinates): along the west side (x = -420) the road
// ramps down from z = top to the tunnel floor `depth` metres below the street, runs flat under
// it between `flat`, and climbs back up by z = bottom.
export const CITY_SUBWAY = { x: -420, top: 170, flat: [92, -58], bottom: -136, depth: 9 };
function cityY(x, z) {
  const S = CITY_SUBWAY;
  if (Math.abs(x - S.x) > 40) return 0;
  const step = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  const down = step((S.top - z) / (S.top - S.flat[0])), up = step((z - S.bottom) / (S.flat[1] - S.bottom));
  return -S.depth * Math.min(down, up);
}

// MAGMA CORE (design-size coordinates): a ring road round the lava lake on the caldera floor,
// two lava-tube tunnels and a loop-the-loop on the north straight. The loop needs a sideways
// jog in the road: its exit comes down LOOP_JOG.offset metres (world) to the right of its entry.
export const VOLCANO = {
  lake: { x: 0, z: -10, rx: 330, rz: 205 },
  tunnels: [[[529, 225], [545, 20]], [[-563, -105], [-561, 65]]], // [from, to] along the road
  roadY: 8,
};
export const LOOP_JOG = { along: 74, offset: 24 }; // world metres between the jog's two corners
const JOG = { x: 120, z: -330 }; // first corner of the jog (the road runs west here)
const jogTo = { x: JOG.x - LOOP_JOG.along / LAYOUT_SCALE, z: JOG.z - LOOP_JOG.offset / LAYOUT_SCALE };
function volcanoY(x, z) {
  // gentle rolls on the caldera floor, dead flat round the loop on the north straight
  const dx = Math.max(0, Math.abs(x - 60) - 140), dz = Math.max(0, Math.abs(z + 340) - 30);
  const w = Math.min(1, Math.hypot(dx, dz) / 120);
  return VOLCANO.roadY + (2.5 * Math.sin(x * 0.006 + 0.8) + 1.8 * Math.cos(z * 0.007)) * w;
}

const LAYOUTS_BASE = {
  coast: {
    width: 20,
    points: radial({
      count: 36,
      R: 400,
      sx: 1.25,
      sz: 1.0,
      harmonics: [[2, 0.14, 0.4], [3, 0.1, 1.9], [4, 0.05, 2.6], [5, 0.05, 0.2], [7, 0.025, 1.3]],
      elevation: (th) => 14 + 9 * Math.sin(2 * th + 1.2) + 5 * Math.sin(3 * th + 0.3),
    }),
    // the cliff jump over a cove, the sea cave where the road meets the shore, the corkscrew
    // through a sea arch out on the headland
    features: [
      { type: 'jump', at: [474.8, 196.8], gap: 50, ramp: 26, h: 3.6, launch: 11, minSpeed: 60, sign: 'CLIFF JUMP' },
      { type: 'tunnel', from: [311.2, -235.4], to: [404.6, -180.9], style: 'seacave' },
      { type: 'corkscrew', from: [468.3, -141.5], to: [548.8, -82.5], radius: 11 },
    ],
  },
  city: {
    width: 20,
    points: filleted(
      [
        [-420, -260], [140, -260], [140, -110], [430, -110], [430, 300],
        [70, 300], [70, 130], [-190, 130], [-190, 300], [-420, 300],
      ],
      [60, 42, 42, 60, 55, 42, 42, 42, 42, 60],
      cityY,
      15,
    ),
    // the car-park helix with its roof jump, the neon wall-ride, the subway under the west side
    features: [
      { type: 'helix', at: [-245.9, -260], radius: 24, turns: 2, rise: 14, side: -1, run: 40, launch: 4 },
      { type: 'bank', from: [331.9, -110.1], to: [430.1, -11.5], side: -1, angle: 1.4, look: { glow: 0x19e3ff, glowIntensity: 3.4, wall: 0x2a2c36, back: 0x1a1a22 } },
      { type: 'tunnel', from: [-420, CITY_SUBWAY.flat[0]], to: [-420, CITY_SUBWAY.flat[1]], style: 'subway' },
    ],
  },
  alpine: {
    width: 18,
    points: radial({
      count: 40,
      R: 380,
      sx: 1.0,
      sz: 1.2,
      harmonics: [[2, 0.18, 2.1], [3, 0.13, 0.2], [4, 0.07, 1.1], [6, 0.045, 0.5], [8, 0.02, 2.0]],
      elevation: (th) => 30 + 20 * Math.sin(th + 0.5) + 7 * Math.sin(3 * th + 1),
    }),
    // the ski jump over a ravine, the avalanche gallery round the high bend (the mountain on the
    // left), the corkscrew on the viaduct across the waterfall valley
    features: [
      { type: 'jump', at: [256.8, 286.5], gap: 55, ramp: 30, h: 4.2, launch: 12, minSpeed: 60, sign: 'SKI JUMP' },
      { type: 'tunnel', from: [-214.4, 414.2], to: [-329.4, 377.6], style: 'gallery', side: -1 },
      { type: 'corkscrew', from: [339.7, -172.3], to: [415, -106.8], radius: 11 },
      { type: 'bridge', from: [304.5, -218.2], to: [453.5, -63.3] },
    ],
  },
  snow: {
    width: 18,
    points: radial({
      count: 40,
      R: 370,
      sx: 1.12,
      sz: 1.0,
      harmonics: [[2, 0.16, 1.0], [3, 0.12, 2.4], [5, 0.05, 0.8], [7, 0.025, 0.2]],
      elevation: (th) => 42 + 18 * Math.sin(th + 2) + 8 * Math.sin(2 * th + 0.4),
    }),
  },
  canyon: {
    width: 20,
    points: filleted(
      [[-640, -200], [180, -330], [640, -110], [580, 270], [150, 170], [-100, 390], [-580, 300]],
      [130, 115, 105, 95, 85, 95, 120],
      (x, z) => 10 + 7 * Math.sin(x * 0.004) + 5 * Math.cos(z * 0.005),
      50,
    ),
    // the broken bridge over the river gorge, the slot-canyon wall-ride, the ore line's crossing
    features: [
      { type: 'jump', at: [-186.4, -271.9], gap: 52, ramp: 26, h: 3.6, launch: 11, minSpeed: 60, bridge: 55, sign: 'BRIDGE OUT' },
      { type: 'bank', from: [561.6, -147.9], to: [626.5, -21.8], side: -1, angle: 1.35, look: { wall: 0xa85a36, back: 0x8a4a2c, glow: 0xffb050, strips: false } },
      { type: 'crossing', at: [329.9, 211.8] },
    ],
  },
  jungle: {
    width: 18,
    points: radial({
      count: 44,
      R: 350,
      sx: 1.0,
      sz: 1.25,
      harmonics: [[2, 0.2, 0.3], [3, 0.1, 1.2], [4, 0.07, 2.2], [6, 0.035, 1.0], [9, 0.012, 0.4]],
      elevation: (th) => 20 + 10 * Math.sin(2 * th) + 6 * Math.sin(3 * th + 1),
    }),
  },
  // CANAL QUARTER: a ring of streets through the old town; humpback bridges where it crosses
  // a canal (design-size coordinates: see CANALS)
  canal: {
    width: 18,
    points: filleted(
      [[-470, -190], [-170, -330], [230, -310], [500, -130], [520, 170], [290, 320], [110, 170], [-90, 320], [-430, 250]],
      [95, 85, 85, 95, 95, 70, 55, 70, 95],
      (x, z) => canalHump(x, z),
      18,
    ),
  },
  // NEBULA RING: an orbital speedway floating high above nothing, with big climbs and drops
  space: {
    width: 20,
    points: radial({
      count: 40,
      R: 390,
      sx: 1.18,
      sz: 1.0,
      harmonics: [[2, 0.12, 2.6], [3, 0.14, 0.9], [4, 0.06, 0.1], [5, 0.04, 1.7], [7, 0.02, 2.9]],
      elevation: (th) => 60 + 14 * Math.sin(2 * th + 0.7) + 7 * Math.sin(3 * th + 2.1) + 3 * Math.sin(5 * th),
    }),
  },
  // SKYPORT: around an airport; the long south straight is the runway
  airport: {
    width: 20,
    points: filleted(
      [[-690, -240], [690, -240], [730, -30], [470, 150], [260, 60], [60, 250], [-300, 250], [-430, 90], [-650, 120]],
      [120, 105, 110, 95, 70, 80, 90, 70, 110],
      () => 0.6,
    ),
  },
  // MAGMA CORE: round the lava lake; dense points on the straights keep the loop's jog crisp
  volcano: {
    width: 20,
    points: filleted(
      // north-east, north-west and south the road swings out round rock outcrops (shortcuts cut them)
      [[520, 285], [560, -120], [600, -310], [440, -430], [300, -330], [JOG.x, JOG.z], [jogTo.x, jogTo.z], [-250, -350], [-400, -450], [-565, -330],
        [-560, 160], [-430, 300], [-250, 330], [-130, 460], [110, 460], [220, 325]],
      [100, 90, 70, 70, 70, 3, 3, 70, 60, 70, 80, 90, 70, 70, 70, 70],
      volcanoY,
      10,
    ),
    features: [
      { type: 'loop', from: [JOG.x, JOG.z], to: [jogTo.x, jogTo.z] },
      ...VOLCANO.tunnels.map(([from, to]) => ({ type: 'tunnel', from, to, style: 'lava' })),
    ],
  },
};

const scaleXZ = ([x, z]) => [x * LAYOUT_SCALE, z * LAYOUT_SCALE];
// a set piece's positions (from / to / at) scaled like the points
const scaleFeature = (f) => { const g = { ...f }; for (const k of ['from', 'to', 'at']) if (f[k]) g[k] = scaleXZ(f[k]); return g; };
export const LAYOUTS = Object.fromEntries(Object.entries(LAYOUTS_BASE).map(([id, l]) => [
  id, {
    ...l,
    points: l.points.map(([x, y, z]) => [x * LAYOUT_SCALE, y, z * LAYOUT_SCALE]),
    ...(l.features ? { features: l.features.map(scaleFeature) } : {}),
  },
]));
