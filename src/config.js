// Car specs, paint colours, quality presets.

// Car balance: every car spends a points budget (1-10 per trait) on SPEED, ACCEL, HANDLING and
// STRENGTH (weight in collisions). The physics numbers are derived from the points, so equal
// points means an equally quick car. Most cars sit on the base budget; a couple have one point more.
export const CAR_BUDGET = 24;
export function carPhysics({ speed, accel, handling, strength }) {
  return {
    topSpeed: 72 + speed * 1.6, // m/s
    accel: 7.4 + accel * 1.6,
    grip: 4.8 + handling * 0.52,
    turn: 1.52 + handling * 0.145,
    mass: 0.62 + strength * 0.1,
  };
}

const CAR_DEFS = [
  { id: 'viper', name: 'VIPER', desc: 'Wedge supercar. Explosive launch.', style: 'wedge', points: { speed: 6, accel: 9, handling: 6, strength: 3 } },
  { id: 'bolt', name: 'BOLT', desc: 'Chrome-trimmed grand tourer. Stable at speed.', style: 'gt', points: { speed: 8, accel: 5, handling: 6, strength: 5 } },
  { id: 'raptor', name: 'RAPTOR', desc: 'Compact hot hatch. Razor handling.', style: 'hatch', points: { speed: 5, accel: 7, handling: 9, strength: 3 } },
  { id: 'titan', name: 'TITAN', desc: 'Muscle brute. Wins every shoving match.', style: 'muscle', points: { speed: 7, accel: 6, handling: 5, strength: 7 } },
  { id: 'phantom', name: 'PHANTOM', desc: 'Hypercar. Blistering top end, light on its feet.', style: 'hyper', points: { speed: 9, accel: 7, handling: 6, strength: 3 } },
  { id: 'rogue', name: 'ROGUE', desc: 'Lifted rally hatch. Loves to slide.', style: 'rally', points: { speed: 6, accel: 7, handling: 7, strength: 4 } },
  { id: 'jetstream', name: 'JETSTREAM', desc: 'Fighter-jet styling. Owns the long straights.', style: 'jet', points: { speed: 9, accel: 6, handling: 5, strength: 4 } },
  { id: 'pulsar', name: 'PULSAR', desc: 'Starfighter on wheels. Glides through fast bends.', style: 'star', points: { speed: 7, accel: 7, handling: 7, strength: 3 } },
];

export const CARS = CAR_DEFS.map((d) => {
  const p = d.points;
  return {
    ...d, ...carPhysics(p),
    total: p.speed + p.accel + p.handling + p.strength,
    stats: { speed: p.speed / 10, accel: p.accel / 10, handling: p.handling / 10, strength: p.strength / 10 },
  };
});

export const PAINTS = [
  { name: 'Inferno', hex: 0xd4101e },
  { name: 'Blaze', hex: 0xff6a00 },
  { name: 'Solar', hex: 0xffc400 },
  { name: 'Venom', hex: 0x2ee86a },
  { name: 'Cyan', hex: 0x00b8ff },
  { name: 'Ultra', hex: 0x6a2cff },
  { name: 'Pearl', hex: 0xeef0f2 },
  { name: 'Carbon', hex: 0x16181c },
  // earned paints: lifetime takedowns or stars
  { name: 'Sunburst', hex: 0xffb000, unlock: { takedowns: 10 } },
  { name: 'Toxic', hex: 0x9dff00, unlock: { takedowns: 25 } },
  { name: 'Sakura', hex: 0xff8fc4, unlock: { takedowns: 40 } },
  { name: 'Midnight', hex: 0x1b2d7a, unlock: { takedowns: 60 } },
  { name: 'Copper', hex: 0xb5652b, unlock: { takedowns: 80 }, finish: 'metal' },
  { name: 'Glacier', hex: 0x8fe3ff, unlock: { takedowns: 100 } },
  { name: 'Chrome', hex: 0xd9dee6, unlock: { stars: 6 }, finish: 'chrome' },
  { name: 'Gold', hex: 0xd4a32a, unlock: { stars: 12 }, finish: 'chrome' },
];
export const BASE_PAINTS = PAINTS.filter((p) => !p.unlock).length; // AI rivals only use these

export const AI_NAMES = ['VORTEX', 'KAZE', 'NOVA', 'RAZOR', 'HAVOC', 'STRYKER', 'ONYX', 'BLITZ', 'VIXEN', 'DIESEL', 'COMET', 'RIPTIDE'];
// some rivals drive a set way (about one AI in six of each, whatever the field size; session.js):
//   bully - rams you whenever it gets the chance; sneak - takes every shortcut;
//   clean - never makes contact if it can steer clear (the rest are all-rounders)
export const AI_STYLES = ['bully', 'sneak', 'clean'];

// cars per race (players + AI), chosen in Settings (online: by the host in the lobby)
export const CAR_COUNT = { min: 2, max: 12, def: 8 };
export const clampCars = (n) => Math.max(CAR_COUNT.min, Math.min(CAR_COUNT.max, Math.round(Number(n) || CAR_COUNT.def)));

// Device: phones and tablets get touch controls, phone graphics presets and no split screen.
const UA = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
export const IS_APP = /SlamlineAndroid/.test(UA); // the Android app (android/)
export const IS_MOBILE = IS_APP || /Android|iPhone|iPad|iPod|Mobile/i.test(UA)
  || (/Macintosh/.test(UA) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1); // iPadOS

const DESKTOP_QUALITY = {
  low: { label: 'LOW', pixelRatio: 0.75, shadow: 1024, bloom: true, blurSamples: 6, density: 0.45, shadows: true },
  medium: { label: 'MEDIUM', pixelRatio: 1.0, shadow: 2048, bloom: true, blurSamples: 8, density: 0.75, shadows: true },
  high: { label: 'HIGH', pixelRatio: 1.5, shadow: 2048, bloom: true, blurSamples: 12, density: 1.0, shadows: true },
};
// phones run out of fill rate first: render resolution and post-fx samples come down before scenery
const MOBILE_QUALITY = {
  low: { label: 'LOW', pixelRatio: 0.9, shadow: 1024, bloom: false, blurSamples: 4, density: 0.4, shadows: false },
  medium: { label: 'MEDIUM', pixelRatio: 1.25, shadow: 1024, bloom: true, blurSamples: 6, density: 0.6, shadows: true },
  high: { label: 'HIGH', pixelRatio: 1.75, shadow: 2048, bloom: true, blurSamples: 8, density: 0.85, shadows: true },
};
export const QUALITY = IS_MOBILE ? MOBILE_QUALITY : DESKTOP_QUALITY;
export const QUALITY_ORDER = ['low', 'medium', 'high'];
export const QUALITY_CHOICES = ['auto', ...QUALITY_ORDER]; // the GRAPHICS setting

// GRAPHICS AUTO: the starting level for this device, from the GPU name. The game then steps it
// down when the frame rate stays low and back up after a smooth race.
export function autoQuality(gpu = '', mobile = IS_MOBILE) {
  if (!mobile) return 'high';
  const g = gpu.toLowerCase();
  const num = (re) => { const m = g.match(re); return m ? Number(m[1]) : 0; };
  if (num(/adreno[^0-9]*(\d{3})/) >= 730 || num(/mali-g(\d{3})/) >= 715 || /immortalis|xclipse|apple/.test(g)) return 'medium';
  return 'low';
}

export const STEERING = ['slider', 'buttons', 'tilt']; // touch steering modes
export const STEERING_LABEL = { slider: 'THUMB SLIDER', buttons: '◀ ▶ BUTTONS', tilt: 'TILT' };

export const LAPS = 3;
export const AI_COUNT = 7;
export const BOOST_SPEED = 1.32;
export const BOOST_ACCEL = 1.7;

const SETTINGS_KEY = 'slamline.settings';

// Saves from before the rename used 'apexrush.' keys: carry the settings over once, drop the rest.
function migrateStorage() {
  try {
    const old = localStorage.getItem('apexrush.settings');
    if (old !== null && localStorage.getItem(SETTINGS_KEY) === null) localStorage.setItem(SETTINGS_KEY, old);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith('apexrush.')) localStorage.removeItem(k);
    }
  } catch { /* storage unavailable */ }
}

export function loadSettings() {
  const def = { quality: 'auto', autoQ: null, steering: 'slider', vibration: true, motionBlur: true, mirror: true, master: 0.8, music: 0.55, assist: true, assist2: true, cars: 8, bestLaps: {}, progress: { stars: {}, signatures: {}, totalTakedowns: 0 } };
  migrateStorage();
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    const p = s.progress || {};
    return { ...def, ...s, bestLaps: { ...(s.bestLaps || {}) }, progress: { stars: { ...(p.stars || {}) }, signatures: { ...(p.signatures || {}) }, totalTakedowns: p.totalTakedowns || 0 } };
  } catch {
    return def;
  }
}

export function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
