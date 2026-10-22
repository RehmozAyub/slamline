// Builds a map's static world: sky, lights, fog, environment map, track and scenery.
import * as THREE from 'three';
import { TrackPath } from './trackMath.js';
import { TrackIndex, CompositeIndex } from './terrain.js';
import { findShortcuts, shortcutsFromSpecs, ShortcutSet, SHORTCUT } from './shortcut.js';
import { LAYOUT_SCALE } from './maps/layouts.js';
import { layoutFeatures } from './features.js';
import { buildTunnels, tunnelShade } from './tunnel.js';

// The shortcut search takes about a second per track, so its result ({a, b, side} per shortcut)
// is kept in localStorage; it only changes if the search rules or layouts change.
const SC_KEY = 'slamline.shortcuts.' + JSON.stringify([SHORTCUT, LAYOUT_SCALE]).split('').reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7);
// avoid: main-road stretches no shortcut may touch (set pieces, tunnels); part of the cache key
function shortcutsFor(id, track, index, avoid = []) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SC_KEY) || '{}'); } catch { /* storage unavailable */ }
  if (avoid.length) id += ':' + avoid.map(([a, b]) => `${Math.round(a)}-${Math.round(b)}`).join(',');
  if (saved[id]) return shortcutsFromSpecs(track, saved[id]);
  const list = findShortcuts(track, index, 3, SHORTCUT, avoid);
  saved[id] = list.map(({ a, b, side }) => ({ a, b, side }));
  try { localStorage.setItem(SC_KEY, JSON.stringify(saved)); } catch { /* storage unavailable */ }
  return list;
}
import { createSky } from './sky.js';
import { buildTrackMeshes } from './trackMesh.js';
import { Weather } from './weather.js';
import { addWorldDetail } from './detail.js';

export function buildWorld(def, glRenderer, quality, { asphalt }) {
  const scene = new THREE.Scene();
  const track = new TrackPath(def.layout.points, { width: def.layout.width });
  // set pieces (features.js): rails (loops, corkscrews, helixes), jumps, wall-rides, tunnels
  const { rails, jumps, banks, tunnels, crossings, avoid } = layoutFeatures(track, def.layout);
  // (a jump's gap is no road: the terrain there is the map's own, a gorge or a cove)
  const mainIndex = new TrackIndex(track, 40, jumps.length ? (i) => !jumps.some((j) => j.inGap(i * track.step)) : null);
  const shortcuts = new ShortcutSet(track, shortcutsFor(def.id, track, mainIndex, avoid));
  // scenery and terrain keep clear of (and flatten along) every road
  const index = new CompositeIndex([mainIndex, ...shortcuts.list.map((sc) => new TrackIndex(sc.path, 30))]);
  scene.fog = new THREE.FogExp2(def.fog.color, def.fog.density);
  scene.background = new THREE.Color(def.fog.color);

  const sky = createSky(def.sky);
  scene.add(sky);

  const sunDir = def.sky.sunDir.clone().normalize();
  const sun = new THREE.DirectionalLight(def.sun.color, def.sun.intensity);
  sun.castShadow = quality.shadows;
  sun.shadow.mapSize.set(quality.shadow, quality.shadow);
  const sc = sun.shadow.camera;
  sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 10; sc.far = 700;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.06;
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(def.hemi.sky, def.hemi.ground, def.hemi.intensity);
  scene.add(hemi);

  const trackGroup = buildTrackMeshes(track, def.trackStyle, glRenderer.capabilities.getMaxAnisotropy(), asphalt, shortcuts, { rails, jumps, banks, crossings });
  scene.add(trackGroup);
  const tunnelGroup = tunnels.length ? buildTunnels(track, tunnels, def.tunnels || {}) : null;
  if (tunnelGroup) scene.add(tunnelGroup);

  const envScene = new THREE.Scene();
  envScene.add(createSky(def.sky, 400));
  const scenery = def.build({ scene, track, index, density: quality.density, envScene, sunDir, shortcut: shortcuts, rails, jumps, banks, tunnels, crossings }) || {};
  // rock-like scenery (flat-shaded vertex-coloured instances: rocks, mesas, ruins) gets stone grain
  const detailed = new Set();
  scene.traverse((o) => {
    const m = o.material;
    if (o.isInstancedMesh && m && m.isMeshStandardMaterial && m.flatShading && m.vertexColors && !m.onBeforeCompile.toString().includes('uGrain') && !detailed.has(m)) {
      detailed.add(m);
      addWorldDetail(m, { fine: [0.9, 0.4], macro: [0.05, 0.25], rough: 0.1, triplanar: true });
    }
  });

  const pmrem = new THREE.PMREMGenerator(glRenderer);
  const envRT = pmrem.fromScene(envScene, 0.04, 0.1, 1000);
  pmrem.dispose();
  scene.environment = envRT.texture;
  scene.environmentIntensity = def.envIntensity ?? 1;

  const weathers = def.weather ? [new Weather(scene, def.weather, 1)] : [];
  const weather = weathers[0] || null;
  const hemiBase = hemi.intensity, sunBase = sun.intensity, envBase = scene.environmentIntensity;
  let shade = 0; // 0 in daylight - 1 deep in a tunnel (eased)

  const snap = 1;
  const world = {
    def, scene, track, index, shortcuts, rails, jumps, banks, tunnels, crossings, sky,
    // trains running over level crossings: [{ train, s (main road), tc (along the line), w }]
    trains: scenery.trains || [], sun, hemi, weather, landmark: scenery.landmark || null,
    flash: 0,
    // split screen: a second weather box that only player 2's camera sees
    setViewCount(n) {
      while (def.weather && weathers.length < n) weathers.push(new Weather(scene, def.weather, weathers.length + 1));
    },
    updateView(i, dt, time, camera) {
      if (i > 0 && weathers[i]) weathers[i].update(dt, time, camera);
    },
    // before rendering a view: sky around its camera, shadows around its car
    prepareView(focus, camera) {
      sky.position.copy(camera.position);
      const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
      sun.position.set(fx + sunDir.x * 350, focus.y + sunDir.y * 350, fz + sunDir.z * 350);
      sun.target.position.set(fx, focus.y, fz);
      sun.target.updateMatrixWorld();
    },
    update(dt, time, focus, camera) {
      sky.position.copy(camera.position);
      sky.material.uniforms.uTime.value = time;
      if (weather) {
        weather.update(dt, time, camera);
        world.flash = weather.flash;
        sky.material.uniforms.uFlash.value = weather.flash;
      }
      // in a tunnel the daylight fades out: lights and reflections dim while the camera is inside
      if (tunnels.length) shade += (tunnelShade(track, tunnels, camera.position) - shade) * Math.min(1, dt * 5);
      hemi.intensity = (hemiBase + world.flash * 2.5) * (1 - 0.4 * shade);
      sun.intensity = sunBase * (1 - 0.8 * shade);
      scene.environmentIntensity = envBase * (1 - 0.6 * shade);
      const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
      sun.position.set(fx + sunDir.x * 350, focus.y + sunDir.y * 350, fz + sunDir.z * 350);
      sun.target.position.set(fx, focus.y, fz);
      if (scenery.update) scenery.update(dt, time, camera, focus);
      trackGroup.userData.update(time);
      if (tunnelGroup) tunnelGroup.userData.update(time);
    },
    setShadowQuality(q) {
      sun.castShadow = q.shadows;
      sun.shadow.mapSize.set(q.shadow, q.shadow);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    },
    dispose() {
      envRT.dispose();
      for (const wx of weathers) wx.dispose(scene);
      const seen = new Set();
      scene.traverse((o) => {
        if (o.geometry && !seen.has(o.geometry)) { seen.add(o.geometry); o.geometry.dispose(); }
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        for (const m of mats) {
          if (seen.has(m)) continue;
          seen.add(m);
          for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
          if (m.uniforms) for (const u of Object.values(m.uniforms)) if (u.value && u.value.isTexture) u.value.dispose();
          m.dispose();
        }
      });
    },
  };
  return world;
}
