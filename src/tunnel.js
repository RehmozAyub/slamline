// Tunnels over stretches of the main road, in a style per map:
//   lava    - a lava tube: arched rock with glowing veins, lava gutters, warm lamps (Magma Core)
//   seacave - a sea cave: a wide, rough vault of wet rock, glowing water in the gutters
//   subway  - a cut-and-cover tunnel: tiled box with strip lights, a concrete roof at street level
// Each is a shell along the road: the inside, the outside (a rock hull or a street-level slab)
// and a portal face at both ends. While the camera is inside, world.js dims the daylight
// (tunnelShade).
import * as THREE from 'three';
import { fbm, noise2 } from './terrain.js';
import { rng, instanced } from './scenery.js';
import { addWorldDetail } from './detail.js';
import { lavaMaterial, FLUID } from './lava.js';

export const TUNNEL_STYLES = {
  lava: { profile: 'arch', width: 3, height: 11, hull: 'mountain', hullH: 34, inner: 'veins', glow: 0xff7a2a, glowI: 1.7, gutter: 'lava', lamps: 'warm', rock: [0x1e1816, 0x3a2e2a] },
  seacave: { profile: 'cave', width: 6, height: 13, jitter: 1.6, hull: 'mountain', hullH: 30, inner: 'wetrock', glow: 0x2ae0d0, glowI: 1.4, gutter: 'glowWater', lamps: null, rock: [0x4a3a30, 0x7a6450] },
  subway: { profile: 'box', width: 3.5, height: 7, hull: 'slab', top: 0.3, inner: 'tiles', band: '#d0206a', gutter: null, lamps: 'strip', slab: 0x55565c },
};

// --- inner textures (canvas): a map and an emissive map --------------------------------------
function canvas(S = 512) { const c = document.createElement('canvas'); c.width = c.height = S; return c; }
function tex(c) { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; }

function noiseFill(g, S, base, amp, scale) {
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = fbm(x / scale, y / scale, 4) * amp;
    const i = (y * S + x) * 4;
    img.data[i] = base[0] + v; img.data[i + 1] = base[1] + v; img.data[i + 2] = base[2] + v; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

const innerTextures = {
  // dark rock with bright lava veins (the same veins glow)
  veins() {
    const S = 512, rock = canvas(S), glow = canvas(S);
    const g = rock.getContext('2d'), e = glow.getContext('2d');
    noiseFill(g, S, [28, 22, 20], 40, 40);
    e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
    const rand = rng(57), veins = [];
    for (let k = 0; k < 9; k++) {
      let x = rand() * S, y = rand() * S, a = rand() * Math.PI * 2;
      const pts = [[x, y]];
      for (let j = 0; j < 14; j++) { a += (rand() - 0.5) * 1.1; x += Math.cos(a) * 22; y += Math.sin(a) * 22; pts.push([x, y]); }
      veins.push(pts);
    }
    for (const [ctx, color] of [[g, '#ff7a20'], [e, '#ffa040']]) {
      ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const pts of veins) { ctx.beginPath(); pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
    }
    return { map: tex(rock), emissive: tex(glow) };
  },
  // wet sea rock with salt streaks and spots of glowing algae
  wetrock() {
    const S = 512, rock = canvas(S), glow = canvas(S);
    const g = rock.getContext('2d'), e = glow.getContext('2d');
    noiseFill(g, S, [52, 58, 62], 46, 30);
    const rand = rng(31);
    g.strokeStyle = 'rgba(230,235,225,0.18)'; g.lineWidth = 2;
    for (let k = 0; k < 40; k++) { const x = rand() * S; g.beginPath(); g.moveTo(x, rand() * S); g.lineTo(x + (rand() - 0.5) * 20, rand() * S); g.stroke(); }
    e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
    for (let k = 0; k < 26; k++) {
      const cx = rand() * S, cy = rand() * S;
      for (let j = 0; j < 14; j++) {
        const r = 1 + rand() * 3;
        e.fillStyle = `rgba(80,255,230,${0.5 + rand() * 0.5})`;
        e.beginPath(); e.arc(cx + (rand() - 0.5) * 40, cy + (rand() - 0.5) * 40, r, 0, Math.PI * 2); e.fill();
        g.fillStyle = 'rgba(60,200,190,0.8)';
        g.beginPath(); g.arc(cx, cy, r * 0.6, 0, Math.PI * 2); g.fill();
      }
    }
    return { map: tex(rock), emissive: tex(glow) };
  },
  // white wall tiles with a coloured band and grime
  tiles(style) {
    const S = 512, wall = canvas(S), glow = canvas(S);
    const g = wall.getContext('2d'), e = glow.getContext('2d');
    g.fillStyle = '#3a3a3c'; g.fillRect(0, 0, S, S);
    const rand = rng(11);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 8; x++) {
      const l = 200 + rand() * 30;
      g.fillStyle = y >= 7 && y <= 8 ? style.band : `rgb(${l},${l},${l - 8})`;
      g.fillRect(x * 64 + 2, y * 32 + 2, 60, 28);
    }
    const grime = g.createLinearGradient(0, S, 0, S * 0.55);
    grime.addColorStop(0, 'rgba(40,30,20,0.55)'); grime.addColorStop(1, 'rgba(40,30,20,0)');
    g.fillStyle = grime; g.fillRect(0, 0, S, S);
    e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
    e.fillStyle = style.band; e.globalAlpha = 0.35; e.fillRect(0, 7 * 32, S, 64);
    return { map: tex(wall), emissive: tex(glow) };
  },
};

// --- cross-sections: k = 0..N from the left foot, over the top, to the right foot -----------
const N = 24;
function innerAt(st, hw, k) {
  const W = hw + st.width, H = st.height;
  if (st.profile === 'box') {
    // up the left wall, across the ceiling, down the right wall (by length)
    const wall = H + 1.2, per = 2 * wall + 2 * W, d = (k / N) * per;
    if (d < wall) return [-W, -1.2 + d];
    if (d < wall + 2 * W) return [-W + (d - wall), H];
    return [W, H - (d - wall - 2 * W)];
  }
  const a = Math.PI * (1 - k / N), c = Math.cos(a), s = Math.abs(Math.sin(a));
  return [W * Math.sign(c) * Math.pow(Math.abs(c), 0.55), -1.6 + (H + 1.6) * Math.pow(s, 0.7)];
}
function outerAt(st, hw, k, hTop) {
  if (st.hull === 'slab') {
    const W = hw + st.width + 3, top = hTop, wall = top + 3, per = 2 * wall + 2 * W, d = (k / N) * per;
    if (d < wall) return [-W, -3 + d];
    if (d < wall + 2 * W) return [-W + (d - wall), top];
    return [W, top - (d - wall - 2 * W)];
  }
  const a = Math.PI * (1 - k / N), c = Math.cos(a), s = Math.abs(Math.sin(a));
  return [62 * Math.sign(c) * Math.pow(Math.abs(c), 0.9), -7 + st.hullH * Math.pow(s, 1.25)];
}

// All the tunnels of a track. overrides: per-style settings from the map (def.tunnels).
// group.userData.update(time) animates the gutters.
export function buildTunnels(track, tunnels, overrides = {}) {
  const group = new THREE.Group();
  const animated = [];
  const hw = track.halfWidth;
  const made = {};
  const lamps = [];
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd0a0).multiplyScalar(4) });
  for (const t of tunnels) {
    const st = { ...TUNNEL_STYLES[t.style] || TUNNEL_STYLES.lava, ...(overrides[t.style] || {}) };
    if (!made[t.style]) {
      const tx = innerTextures[st.inner](st);
      const inner = new THREE.MeshStandardMaterial({ map: tx.map, emissiveMap: tx.emissive, emissive: new THREE.Color(st.glow ?? 0xffffff), emissiveIntensity: st.glowI ?? 1, roughness: st.inner === 'tiles' ? 0.35 : 0.85, side: THREE.DoubleSide });
      const outer = st.hull === 'slab'
        ? addWorldDetail(new THREE.MeshStandardMaterial({ color: st.slab, roughness: 0.9, side: THREE.DoubleSide }), { fine: [0.6, 0.4], macro: [0.03, 0.3], rough: 0.1, triplanar: true })
        : addWorldDetail(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, flatShading: true, side: THREE.DoubleSide }), { fine: [0.25, 0.5], macro: [0.02, 0.3], rough: 0.1, triplanar: true });
      let gutter = null;
      if (st.gutter) {
        gutter = lavaMaterial({ scale: 0.25, flow: 2.5, dir: [0.6, 1], heat: 1.2, colors: FLUID[st.gutter] });
        gutter.side = THREE.DoubleSide;
        animated.push(gutter);
      }
      made[t.style] = { inner, outer, gutter };
    }
    const { inner: innerMat, outer: outerMat, gutter: gutterMat } = made[t.style];
    const rockA = new THREE.Color(st.rock ? st.rock[0] : st.slab), rockB = new THREE.Color(st.rock ? st.rock[1] : st.slab), rc = new THREE.Color();
    const grass = st.grass ? new THREE.Color(st.grass) : null;
    const ia = Math.floor(t.a / track.step), ib = Math.ceil(t.b / track.step);
    const rows = [];
    for (let i = ia; i <= ib; i += 2) rows.push(((i % track.n) + track.n) % track.n);
    const inner = [], outer = [], inUv = [], outCol = [];
    rows.forEach((i, r) => {
      const x = track.x[i], y = track.y[i], z = track.z[i], rx = track.rx[i], rz = track.rz[i];
      let along = 0;
      for (let k = 0; k <= N; k++) {
        let [li, hi] = innerAt(st, hw, k);
        if (st.profile !== 'box') {
          const j = (noise2(i * 0.15, k * 0.9) - 0.5) * (st.jitter ?? 0.6);
          li += j * Math.sign(li); hi += j * 0.6;
        }
        inner.push(x + rx * li, y + hi, z + rz * li);
        if (k) { const [pl, ph] = innerAt(st, hw, k - 1); along += Math.hypot(li - pl, hi - ph); }
        inUv.push(st.profile === 'box' ? along / 8 : (k / N) * 2.5, (r * 2 * track.step) / (st.profile === 'box' ? 8 : 16));
        let [lo, ho] = outerAt(st, hw, k, (st.top ?? 0) - y);
        // a hill can sink toward its ends (swell) and be craggy (crag) instead of smooth
        if (st.swell) ho = -7 + (ho + 7) * (1 - st.swell * (1 - Math.sin((Math.PI * r) / (rows.length - 1))));
        const ox = x + rx * lo, oz = z + rz * lo;
        const bump = st.hull === 'slab' ? 0 : (fbm(ox * 0.03, oz * 0.03, 3) - 0.5) * 14 + (fbm(ox * 0.13, oz * 0.13, 2) - 0.5) * (st.crag ?? 0);
        outer.push(ox + rx * bump * 0.3, y + ho + bump, oz + rz * bump * 0.3);
        rc.copy(rockA).lerp(rockB, fbm(ox * 0.02, oz * 0.02, 2));
        if (grass) rc.lerp(grass, Math.min(1, Math.max(0, (Math.sin(Math.PI * (k / N)) - 0.72) / 0.18)) * 0.9); // grass over the top
        outCol.push(rc.r, rc.g, rc.b);
      }
      if (st.lamps === 'warm' && r % 6 === 3) lamps.push({ x, y: y + st.height - 0.6, z, ry: Math.atan2(track.tx[i], track.tz[i]) });
    });
    const strip = (pos, extra) => {
      const idx = [];
      for (let r = 0; r < rows.length - 1; r++) for (let k = 0; k < N; k++) {
        const a = r * (N + 1) + k, b = a + 1, c = a + N + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      for (const [k, v, n] of extra) g.setAttribute(k, new THREE.Float32BufferAttribute(v, n));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    const tin = new THREE.Mesh(strip(inner, [['uv', inUv, 2]]), innerMat);
    tin.receiveShadow = true;
    const tout = new THREE.Mesh(strip(outer, [['color', outCol, 3]]), outerMat);
    tout.castShadow = true; tout.receiveShadow = true;
    group.add(tin, tout);
    // portal faces: the ring between the inside and the outside at both ends
    for (const r of [0, rows.length - 1]) {
      const pos = [], col = [], idx = [];
      for (let k = 0; k <= N; k++) {
        const o = (r * (N + 1) + k) * 3;
        pos.push(inner[o], inner[o + 1], inner[o + 2], outer[o], outer[o + 1], outer[o + 2]);
        col.push(rockA.r, rockA.g, rockA.b, outCol[o], outCol[o + 1], outCol[o + 2]);
        if (k < N) { const p = k * 2; idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const face = new THREE.Mesh(g, outerMat);
      face.castShadow = true;
      group.add(face);
    }
    // glowing gutters along both walls, or strip lights along the ceiling
    const ribbon = (lat0, lat1, h, mat) => {
      const pos = [], uv = [], idx = [];
      const P = {};
      let n = 0;
      for (let s = t.a; s <= t.b; s += 2, n++) {
        for (const lat of [lat0, lat1]) { track.pointAt(s, lat, P); pos.push(P.x, P.y + h, P.z); uv.push(lat === lat0 ? 0 : 1, n * 0.08); }
        if (s + 2 <= t.b) { const p = n * 2; idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      group.add(new THREE.Mesh(g, mat));
    };
    if (gutterMat) for (const sd of [-1, 1]) ribbon(sd * (hw + 1.3), sd * (hw + 2.3), 0.03, gutterMat);
    if (st.lamps === 'strip') {
      const stripMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe8f4ff).multiplyScalar(3.2), side: THREE.DoubleSide });
      for (const lat of [-hw * 0.5, hw * 0.5]) ribbon(lat - 0.35, lat + 0.35, st.height - 0.05, stripMat);
    }
  }
  if (lamps.length) group.add(instanced(new THREE.BoxGeometry(0.7, 0.25, 2.6), lampMat, lamps, { cast: false }));
  group.userData.update = (time) => { for (const m of animated) m.uniforms.uTime.value = time; };
  return group;
}

// How far inside a tunnel the camera at `pos` is: 0 outside (or above) - 1 well inside
const hints = new WeakMap();
export function tunnelShade(track, tunnels, pos) {
  const q = hints.get(track) || {};
  track.project(pos.x, pos.z, q.idx ?? -1, q);
  hints.set(track, q);
  if (Math.abs(q.lateral) > track.halfWidth + 4 || pos.y > q.y + 12) return 0;
  let inside = 0;
  for (const t of tunnels) {
    const d = Math.min(track.deltaS(t.a, q.s), track.deltaS(q.s, t.b));
    if (d > -6) inside = Math.max(inside, Math.max(0, Math.min(1, (d + 6) / 28)));
  }
  return inside;
}
