// Animated water surface (sum-of-waves normals, fresnel sky reflection, sun glint, scene fog).
// With a shore map (shoreMap below) it also turns turquoise over the shallows and breaks into
// surf rolling in on the beaches and round the rocks.
import * as THREE from 'three';

// Bake the ground height round a coast into a texture for waterMaterial's `shore`: heightAt is
// sampled every `cell` metres over box [x0, z0, x1, z1] and stored relative to the water level
// `level` (R: -8 m ... +8 m). Returns { map, box } ready to pass as `shore`.
export function shoreMap(heightAt, [x0, z0, x1, z1], level, cell = 4) {
  const w = Math.ceil((x1 - x0) / cell) + 1, h = Math.ceil((z1 - z0) / cell) + 1;
  const data = new Uint8Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const y = heightAt(x0 + i * cell, z0 + j * cell) - level;
      const k = (j * w + i) * 4;
      data[k] = Math.round(Math.max(0, Math.min(1, (y + 8) / 16)) * 255);
      data[k + 3] = 255;
    }
  }
  const map = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  map.magFilter = map.minFilter = THREE.LinearFilter;
  map.needsUpdate = true;
  return { map, box: [x0, z0, (w - 1) * cell, (h - 1) * cell] };
}

export function waterMaterial({
  sunDir, deep = 0x0b2a44, shallow = 0x1f6a7a, skyTop = 0x3a2c6a, skyHorizon = 0xffa060,
  sunColor = 0xffc080, spec = 14, ripple = 1, rain = 0, shore = null, lagoon = 0x2fb8b0, foam = 0xfff2e4,
}) {
  return new THREE.ShaderMaterial({
    fog: true,
    defines: shore ? { SHORE: 1 } : {},
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 },
      uSunDir: { value: sunDir.clone().normalize() },
      uDeep: { value: new THREE.Color(deep) },
      uShallow: { value: new THREE.Color(shallow) },
      uSkyTop: { value: new THREE.Color(skyTop) },
      uSkyHorizon: { value: new THREE.Color(skyHorizon) },
      uSunColor: { value: new THREE.Color(sunColor) },
      uSpec: { value: spec },
      uRipple: { value: ripple },
      uRain: { value: rain },
      uShore: { value: shore ? shore.map : null },
      uShoreBox: { value: shore ? new THREE.Vector4(shore.box[0], shore.box[1], 1 / shore.box[2], 1 / shore.box[3]) : new THREE.Vector4() },
      uLagoon: { value: new THREE.Color(lagoon) },
      uFoam: { value: new THREE.Color(foam) },
    }]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uTime, uSpec, uRipple, uRain;
      uniform vec3 uSunDir, uDeep, uShallow, uSkyTop, uSkyHorizon, uSunColor, uLagoon, uFoam;
      uniform sampler2D uShore;
      uniform vec4 uShoreBox;
      varying vec3 vWorld;
      vec2 wave(vec2 p, vec2 dir, float freq, float speed, float amp) {
        float ph = dot(p, dir) * freq + uTime * speed;
        return dir * cos(ph) * freq * amp;
      }
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      void main() {
        vec2 p = vWorld.xz;
        vec2 g = wave(p, normalize(vec2(1.0, 0.3)), 0.06, 1.1, 0.5)
               + wave(p, normalize(vec2(0.7, -0.7)), 0.11, 1.7, 0.25)
               + wave(p, normalize(vec2(-0.2, 1.0)), 0.23, 2.3, 0.12)
               + wave(p, normalize(vec2(0.9, 0.9)), 0.51, 3.1, 0.05) * uRipple
               + wave(p, normalize(vec2(-0.8, 0.4)), 1.13, 4.3, 0.02) * uRipple;
        if (uRain > 0.0) {
          // rain rings
          vec2 cell = floor(p * 0.8);
          vec2 f = fract(p * 0.8) - 0.5;
          float t = fract(uTime * 0.9 + hash(cell));
          float d = length(f);
          float ring = sin((d - t * 0.5) * 60.0) * smoothstep(0.5 * t + 0.06, 0.5 * t, d) * (1.0 - t);
          g += normalize(f + 1e-4) * ring * 0.25 * uRain;
        }
        vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
        vec3 v = normalize(cameraPosition - vWorld);
        vec3 r = reflect(-v, n);
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
        vec3 sky = mix(uSkyHorizon, uSkyTop, pow(clamp(r.y, 0.0, 1.0), 0.5));
        vec3 water = mix(uDeep, uShallow, 0.3 + 0.2 * n.x);
        #ifdef SHORE
          // depth of the water here, from the baked ground height (deep outside the map)
          vec2 suv = (p - uShoreBox.xy) * uShoreBox.zw;
          float depth = 8.0;
          if (suv.x > 0.0 && suv.x < 1.0 && suv.y > 0.0 && suv.y < 1.0) depth = 8.0 - texture2D(uShore, suv).r * 16.0;
          water = mix(water, uLagoon, smoothstep(6.0, 0.5, depth) * 0.8);
        #endif
        vec3 col = mix(water, sky, fres);
        float sd = max(dot(r, uSunDir), 0.0);
        col += uSunColor * (pow(sd, 350.0) * uSpec + pow(sd, 30.0) * 0.3);
        #ifdef SHORE
          // surf: lines of foam rolling in over the shallows, a ragged white edge at the waterline
          float br = vnoise(p * 0.045) * 5.0;
          float roll = smoothstep(0.62, 1.0, sin(depth * 1.7 + uTime * 1.9 + br));
          float lace = vnoise(p * 0.22 + vec2(uTime * 0.35, -uTime * 0.2));
          float surf = roll * smoothstep(3.2, 0.6, depth) * smoothstep(0.25, 0.65, lace);
          surf += smoothstep(0.9, 0.05, depth) * (0.55 + 0.45 * lace);
          col = mix(col, uFoam * (0.75 + 0.35 * max(uSunDir.y, 0.0)), clamp(surf, 0.0, 1.0) * 0.9);
        #endif
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }
    `,
  });
}
