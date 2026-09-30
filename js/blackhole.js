// 05 — Trou noir de Schwarzschild : lancer de rayons courbés (unités : rayon de Schwarzschild = 1).
// Trajectoire des photons : d²x/dλ² = −1,5 h² x / r⁵ (h = moment angulaire), disque d'accrétion de r = 3 à r = 11.
import { QUAD_VS, GLSL_COMMON } from './gl.js';

const FS = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o;
uniform vec2 uRes, uOff; uniform vec3 uCam, uRight, uUp, uFwd; uniform float uTime; uniform int uSteps;
${GLSL_COMMON}

vec3 stars(vec3 d) {
  vec3 c = vec3(0.0);
  float u = atan(d.z, d.x) / 6.28318 + 0.5, v = acos(clamp(d.y, -1.0, 1.0)) / 3.14159;
  for (int L = 0; L < 3; L++) {
    float sc = 90.0 + float(L) * 110.0;
    vec2 g = vec2(u * sc * 2.0, v * sc);
    vec2 id = floor(g), f = fract(g);
    vec2 h = hash22(id + float(L) * 17.0);
    float b = step(0.965, h.x);
    float dd = length(f - 0.2 - 0.6 * hash22(id * 3.1 + 1.7));
    float tw = 0.7 + 0.3 * sin(uTime * (1.0 + 3.0 * h.y) + h.x * 50.0);
    vec3 tint = mix(vec3(1.0, 0.8, 0.6), vec3(0.6, 0.8, 1.0), h.y);
    c += b * tint * smoothstep(0.08, 0.0, dd) * (0.6 + 1.6 * h.y) * tw;
  }
  // Voie lactée diffuse
  float band = exp(-pow((d.y - 0.25 * d.x) * 3.2, 2.0));
  float neb = fbm(d.xz * 3.5 + d.y * 2.0) * band;
  c += neb * mix(vec3(0.25, 0.12, 0.35), vec3(0.1, 0.25, 0.4), fbm(d.zx * 2.0 + 3.0)) * 0.55;
  return c;
}

vec3 blackbody(float t) { // t ~ 0..1.5 : rouge → orange → blanc → bleuté
  vec3 c = mix(vec3(1.0, 0.25, 0.04), vec3(1.0, 0.62, 0.25), smoothstep(0.1, 0.45, t));
  c = mix(c, vec3(1.0, 0.93, 0.8), smoothstep(0.45, 0.85, t));
  return mix(c, vec3(0.75, 0.85, 1.0), smoothstep(0.9, 1.5, t));
}

vec4 disk(vec3 q, vec3 rayDir) {
  float r = length(q.xz);
  if (r < 3.0 || r > 11.0) return vec4(0.0);
  float ang = atan(q.z, q.x);
  float omega = pow(r, -1.5) * 1.6;
  float a2 = ang + uTime * omega;
  float lr = log(r);
  float n = fbm(vec2(lr * 7.0, a2 * 3.0 / 3.14159 * 2.0)) * 0.7 + fbm(vec2(lr * 20.0, a2 * 8.0)) * 0.45;
  float rings = 0.65 + 0.35 * sin(lr * 42.0 + n * 6.0);
  // Profil de température d'un disque mince
  float temp = pow(3.0 / r, 0.75) * pow(max(1.0 - sqrt(3.0 / r), 0.0), 0.25) * 1.45;
  // Doppler relativiste (simplifié) + décalage gravitationnel
  vec3 vdir = normalize(vec3(-q.z, 0.0, q.x));
  float beta = sqrt(0.5 / r);
  float cosT = dot(vdir, -rayDir);
  float D = sqrt(1.0 - beta * beta) / (1.0 - beta * cosT);
  float g = sqrt(1.0 - 1.0 / r);
  float shift = D * g;
  vec3 col = blackbody(temp * shift * 0.95) * pow(shift, 3.5) * (0.25 + n * rings) * 1.15;
  float edge = smoothstep(3.0, 3.4, r) * smoothstep(11.0, 8.0, r);
  float a = clamp((0.55 + 0.6 * n) * edge, 0.0, 0.97);
  return vec4(col * edge, a);
}

void main() {
  float asp = uRes.x / uRes.y;
  vec2 sc = (vUv * 2.0 - 1.0) * vec2(asp, 1.0) / min(asp, 1.0) + uOff;
  vec3 v = normalize(uFwd * 1.6 + uRight * sc.x + uUp * sc.y);
  vec3 p = uCam;
  vec3 hv = cross(p, v); float h2 = dot(hv, hv);
  vec3 col = vec3(0.0); float alpha = 0.0; bool done = false;
  float minR = 100.0;
  for (int i = 0; i < 300; i++) {
    if (i >= uSteps) break;
    float r = length(p);
    minR = min(minR, r);
    float dt = clamp(0.045 * r * r, 0.012, 0.9);
    vec3 acc = -1.5 * h2 * p / pow(r, 5.0);
    v += acc * dt;
    vec3 pn = p + v * dt;
    if (p.y * pn.y < 0.0) {
      vec3 q = mix(p, pn, p.y / (p.y - pn.y));
      vec4 dc = disk(q, normalize(v));
      col += (1.0 - alpha) * dc.a * dc.rgb;
      alpha += (1.0 - alpha) * dc.a;
      if (alpha > 0.985) { done = true; break; }
    }
    if (length(pn) < 1.0) { done = true; break; }
    if (length(pn) > 40.0 && dot(pn, v) > 0.0) break;
    p = pn;
  }
  if (!done) col += (1.0 - alpha) * stars(normalize(v));
  // Halo discret près de la sphère des photons (r = 1,5)
  if (!done) col += vec3(1.0, 0.55, 0.25) * 0.08 * smoothstep(2.6, 1.5, minR) * (1.0 - alpha);
  col = aces(col * 0.95);
  float vig = smoothstep(1.5, 0.4, length(vUv - 0.5) * 1.5);
  o = vec4(pow(col, vec3(0.95)) * (0.55 + 0.45 * vig), 1.0);
}`;

export default function create(G, { params, coarse }) {
  const prog = G.program(QUAD_VS, FS);
  let W = 1, H = 1, t = 0, az = 0.6, userEl = null, drag = false;
  const norm = (a) => { const l = Math.hypot(...a); return a.map((x) => x / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return {
    quality: coarse ? 0.8 : 1,
    resize(w, h) { W = w; H = h; },
    frame(dt) {
      t += dt;
      if (params.spin !== false && !drag) az += dt * 0.05;
      const el = (userEl ?? (params.tilt ?? 10)) * Math.PI / 180, D = 17;
      const cam = [D * Math.cos(el) * Math.cos(az), D * Math.sin(el), D * Math.cos(el) * Math.sin(az)];
      const fwd = norm(cam.map((x) => -x)), right = norm(cross(fwd, [0, 1, 0])), up = cross(right, fwd);
      prog.use().set({ uRes: [W, H], uOff: W / H < 1 ? [0, -0.45] : [-0.28 * Math.min(1, W / H / 1.6), 0], uCam: cam, uRight: right, uUp: up, uFwd: fwd, uTime: t, uSteps: coarse ? 170 : 240 });
      return G.draw(null, W, H) * 120;
    },
    pointer(e) {
      if (e.type === 'down') drag = true;
      if (e.type === 'up') drag = false;
      if (e.type === 'move' && e.down) { az += e.dx * 3; userEl = Math.max(-60, Math.min(60, (userEl ?? (params.tilt ?? 10)) - e.dy * 90)); }
    },
    param(k) { if (k === 'tilt') userEl = null; },
    info() { return 'jusqu’à ' + (coarse ? 170 : 240) + ' pas par rayon'; },
    destroy() {},
  };
}
