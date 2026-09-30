// 07 — Mandelbulb (White & Nylander, 2009) : z → zⁿ + c en coordonnées sphériques, rendu par « sphere tracing ».
import { QUAD_VS, GLSL_COMMON } from './gl.js';

const FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform vec2 uRes, uOff; uniform vec3 uCam, uRight, uUp, uFwd; uniform float uPower, uTime; uniform int uSteps;
${GLSL_COMMON}

float de(vec3 q, out vec4 trap) {
  vec3 p = q.xzy, z = p; float dr = 1.0, r = 0.0;
  trap = vec4(abs(z), dot(z, z));
  for (int i = 0; i < 9; i++) {
    r = length(z);
    if (r > 2.0) break;
    float th = acos(clamp(z.z / r, -1.0, 1.0)) * uPower, ph = atan(z.y, z.x) * uPower;
    dr = pow(r, uPower - 1.0) * uPower * dr + 1.0;
    z = pow(r, uPower) * vec3(sin(th) * cos(ph), sin(th) * sin(ph), cos(th)) + p;
    trap = min(trap, vec4(abs(z), dot(z, z)));
  }
  return 0.5 * log(r) * r / dr;
}
float map(vec3 p) { vec4 t; return de(p, t); }

vec3 normal(vec3 p, float e) {
  vec2 k = vec2(1, -1);
  return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) + k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
}

float shadow(vec3 ro, vec3 rd) {
  float res = 1.0, t = 0.01;
  for (int i = 0; i < 28; i++) {
    float h = map(ro + rd * t);
    res = min(res, 10.0 * h / t);
    t += clamp(h, 0.01, 0.2);
    if (res < 0.02 || t > 3.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

void main() {
  float asp = uRes.x / uRes.y;
  vec2 sc = (vUv * 2.0 - 1.0) * vec2(asp, 1.0) / min(asp, 1.0) + uOff;
  vec3 rd = normalize(uFwd * 1.9 + uRight * sc.x + uUp * sc.y), ro = uCam;
  // Fond : dégradé et poussière d'étoiles
  vec3 bg = mix(vec3(0.02, 0.01, 0.04), vec3(0.08, 0.03, 0.12), smoothstep(-0.6, 0.8, rd.y));
  bg += 0.8 * pow(hash12(floor((sc + 3.0) * 220.0)), 900.0);
  // Sphère englobante
  float b = dot(ro, rd), c = dot(ro, ro) - 1.35 * 1.35, disc = b * b - c;
  vec3 col = bg; float glow = 0.0;
  if (disc > 0.0) {
    float t = max(0.0, -b - sqrt(disc)), tmax = -b + sqrt(disc);
    float eps = 0.0; int i; bool hit = false; vec4 trap;
    for (i = 0; i < 200; i++) {
      if (i >= uSteps) break;
      vec3 p = ro + rd * t;
      float d = de(p, trap);
      eps = 0.0012 * t;
      glow += 0.012 / (1.0 + d * 60.0);
      if (d < eps) { hit = true; break; }
      t += d * 0.9;
      if (t > tmax) break;
    }
    if (hit) {
      vec3 p = ro + rd * t, n = normal(p, eps * 0.5);
      vec3 L1 = normalize(vec3(0.6, 0.7, -0.4)), L2 = normalize(vec3(-0.7, -0.2, 0.5));
      float dif = clamp(dot(n, L1), 0.0, 1.0) * shadow(p + n * 0.003, L1);
      float dif2 = clamp(dot(n, L2), 0.0, 1.0);
      float ao = clamp(1.0 - float(i) / float(uSteps) * 1.4, 0.0, 1.0);
      float rim = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 3.0);
      vec3 alb = cosPal(sqrt(trap.w) * 0.9 + trap.x * 0.4 + uTime * 0.02, vec3(0.5, 0.45, 0.5), vec3(0.5, 0.45, 0.45), vec3(1.0, 1.0, 1.0), vec3(0.0, 0.15, 0.3));
      alb = mix(alb, vec3(1.0, 0.85, 0.6), clamp(trap.z * 0.8, 0.0, 1.0) * 0.35);
      col = alb * (0.08 + 1.25 * dif * vec3(1.0, 0.92, 0.8) + 0.35 * dif2 * vec3(0.4, 0.55, 1.0)) * (0.35 + 0.65 * ao);
      col += rim * vec3(0.55, 0.4, 1.0) * 0.6 * ao;
      vec3 h = normalize(L1 - rd);
      col += pow(clamp(dot(n, h), 0.0, 1.0), 48.0) * dif * 0.6;
      col = mix(col, bg, smoothstep(2.0, 4.5, t) * 0.4);
    }
  }
  col += glow * vec3(0.6, 0.35, 1.0) * 0.35;
  col = aces(col * 1.15);
  float vig = smoothstep(1.5, 0.4, length(vUv - 0.5) * 1.5);
  o = vec4(pow(col, vec3(0.95)) * (0.6 + 0.4 * vig), 1.0);
}`;

export default function create(G, { params, coarse }) {
  const prog = G.program(QUAD_VS, FS);
  let W = 1, H = 1, t = 0, az = 0.8, el = 0.35, drag = false;
  const norm = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return {
    quality: coarse ? 0.75 : 1,
    resize(w, h) { W = w; H = h; },
    frame(dt) {
      t += dt;
      if (!drag) az += dt * 0.08;
      const D = 2.7 + 0.25 * Math.sin(t * 0.13);
      const cam = [D * Math.cos(el) * Math.cos(az), D * Math.sin(el), D * Math.cos(el) * Math.sin(az)];
      const fwd = norm(cam.map((x) => -x)), right = norm(cross(fwd, [0, 1, 0])), up = cross(right, fwd);
      const base = params.power ?? 8;
      const power = params.breathe ? base + 1.2 * Math.sin(t * 0.35) : base;
      const steps = coarse ? 110 : 150;
      prog.use().set({ uRes: [W, H], uOff: W / H < 1 ? [0, -0.5] : [-0.3 * Math.min(1, W / H / 1.6), 0], uCam: cam, uRight: right, uUp: up, uFwd: fwd, uPower: power, uTime: t, uSteps: steps });
      this.p = power;
      return G.draw(null, W, H) * 90;
    },
    pointer(e) {
      if (e.type === 'down') drag = true;
      if (e.type === 'up') drag = false;
      if (e.type === 'move' && e.down) { az += e.dx * 3.5; el = Math.max(-1.3, Math.min(1.3, el - e.dy * 3)); }
    },
    info() { return `puissance ${(this.p ?? 8).toFixed(2).replace('.', ',')}`; },
    destroy() {},
  };
}
