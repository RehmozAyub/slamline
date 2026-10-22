// Glowing fluid surface: drifting dark plates with bright seams, brighter where it runs hot.
// Molten lava by default; other colours make glowing water (sea caves, ice melt).
// mode 0 = world-space pool (flows along `dir`), 1 = a fall or channel (flows down its uv.y)
import * as THREE from 'three';

export const FLUID = {
  lava: { crust: [0.07, 0.03, 0.022], hot: [0.62, 0.07, 0.01], hot2: [0.75, 0.2, 0.025], seam: [1.0, 0.32, 0.04] },
  // bioluminescent sea water: deep teal with cyan glints
  glowWater: { crust: [0.01, 0.05, 0.07], hot: [0.02, 0.28, 0.3], hot2: [0.05, 0.42, 0.38], seam: [0.25, 0.95, 0.9] },
};

export function lavaMaterial({ scale = 0.02, flow = 0.6, dir = [1, 0.4], heat = 1, mode = 0, colors = FLUID.lava } = {}) {
  const v3 = (a) => new THREE.Vector3(...a);
  return new THREE.ShaderMaterial({
    fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uScale: { value: scale }, uFlow: { value: flow }, uDir: { value: new THREE.Vector2(...dir) }, uHeat: { value: heat }, uMode: { value: mode },
      uCrust: { value: v3(colors.crust) }, uHot: { value: v3(colors.hot) }, uHot2: { value: v3(colors.hot2) }, uSeam: { value: v3(colors.seam) },
    }]),
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec3 vWorld;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uTime, uScale, uFlow, uHeat, uMode;
      uniform vec2 uDir;
      uniform vec3 uCrust, uHot, uHot2, uSeam;
      varying vec3 vWorld;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 1.7; a *= 0.5; } return v; }
      void main() {
        vec2 p = uMode > 0.5 ? vec2(vUv.x * 3.0, vUv.y * 9.0 - uTime * uFlow) : vWorld.xz * uScale + uDir * uTime * uFlow * 0.05;
        vec2 q = vec2(fbm(p + vec2(0.0, uTime * 0.04)), fbm(p + vec2(5.2, 1.3) - uTime * 0.03));
        float n = fbm(p + 2.2 * q);
        float seam = smoothstep(0.46, 0.5, n) * (1.0 - smoothstep(0.5, 0.56, n));
        float molten = smoothstep(0.5, 0.3, n);
        // kept low: ACES turns bright saturated colour pale; only the seams run hot enough to bloom
        vec3 crust = uCrust * (0.6 + q.y);
        vec3 hot = mix(uHot, uHot2, q.x) * uHeat;
        float k = clamp(molten, 0.0, 1.0);
        if (uMode > 0.5) k = clamp(k + 0.35, 0.0, 1.0); // falls run hotter
        vec3 col = mix(crust, hot, k) * (0.88 + 0.18 * sin(uTime * 1.4 + n * 14.0));
        col += uSeam * seam * 1.3 * uHeat;
        gl_FragColor = vec4(col, 1.0);
        #include <fog_fragment>
      }
    `,
  });
}
