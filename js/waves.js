// 06 — Cuve à ondes : équation d'onde 2D (d'Alembert), schéma explicite, bords absorbants.
// R = hauteur à l'instant t, G = hauteur à t − 1, B = intensité moyenne (u²) pour « l'écran ».
import { NEIGH_VS, QUAD_VS, GLSL_COMMON } from './gl.js';

const COMMON = `
uniform int uMode; uniform vec2 uGrid; uniform float uAspect;
float wall(vec2 uv) {
  if (uMode == 0) return 0.0;
  float bx = 0.30, th = 2.5 / uGrid.x;
  if (abs(uv.x - bx) > th) return 0.0;
  float y = uv.y, sw = (uMode == 2 ? 7.0 : 16.0) / uGrid.y, sep = 46.0 / uGrid.y;
  if (uMode == 2 && (abs(y - (0.5 - sep * 0.5)) < sw * 0.5 || abs(y - (0.5 + sep * 0.5)) < sw * 0.5)) return 0.0;
  if (uMode == 1 && abs(y - 0.5) < sw * 0.5) return 0.0;
  return 1.0;
}`;

const STEP = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv, vL, vR, vT, vB; out vec4 o;
uniform sampler2D uState; uniform float uC2, uPhase, uAmp; uniform vec4 uDrop; // x, y, rayon, force
${COMMON}
void main() {
  vec4 s = texture(uState, vUv);
  float u = s.r, up = s.g;
  float lap = texture(uState, vL).r + texture(uState, vR).r + texture(uState, vT).r + texture(uState, vB).r - 4.0 * u;
  float un = 2.0 * u - up + uC2 * lap;
  // Éponges sur les bords : on amortit pour imiter un bassin infini
  float e = min(min(vUv.x, 1.0 - vUv.x) * uAspect, min(vUv.y, 1.0 - vUv.y));
  float damp = 1.0 - 0.12 * smoothstep(0.06, 0.0, e);
  un *= damp; u *= mix(1.0, damp, 0.5);
  // Source : onde plane à gauche (montages à fentes)
  if (uMode > 0 && abs(vUv.x - 0.07) < 1.0 / uGrid.x) un += uAmp * sin(uPhase);
  // Goutte / source ponctuelle
  if (uDrop.z > 0.0) { vec2 d = vUv - uDrop.xy; d.x *= uAspect; un += uDrop.w * exp(-dot(d, d) / (uDrop.z * uDrop.z)); }
  if (wall(vUv) > 0.5) un = 0.0;
  float I = mix(s.b, un * un, 0.008);
  o = vec4(un, u, I, 1.0);
}`;

const SHOW = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform sampler2D uState; uniform vec2 uTexel;
${COMMON}
${GLSL_COMMON}
void main() {
  vec4 s = texture(uState, vUv);
  float u = s.r;
  float l = texture(uState, vUv - vec2(uTexel.x, 0)).r, r = texture(uState, vUv + vec2(uTexel.x, 0)).r;
  float b = texture(uState, vUv - vec2(0, uTexel.y)).r, t = texture(uState, vUv + vec2(0, uTexel.y)).r;
  vec3 n = normalize(vec3((l - r) * 3.0, (b - t) * 3.0, 1.0));
  vec3 L = normalize(vec3(-0.5, 0.6, 0.7));
  float spec = pow(max(dot(reflect(-L, n), vec3(0, 0, 1)), 0.0), 40.0);
  vec3 deep = vec3(0.01, 0.02, 0.06), pos = vec3(0.35, 0.95, 1.0), neg = vec3(0.35, 0.12, 0.7);
  // Exposition plus forte derrière la paroi : seule une petite part de l'énergie franchit les fentes
  float gain = (uMode > 0 && vUv.x < 0.3) ? 1.4 : (uMode > 0 ? 5.0 : 2.4);
  float a = clamp(u * gain, -1.0, 1.0);
  vec3 c = deep + (a > 0.0 ? pos : neg) * pow(abs(a), 0.8) * 0.9;
  c += spec * 0.6 * vec3(0.9, 0.95, 1.0);
  // Intensité moyenne : franges dorées, et « écran » photographique à droite
  float I = s.b;
  c += vec3(1.0, 0.75, 0.3) * clamp(sqrt(I) * gain * 1.5, 0.0, 1.0) * 0.2;
  if (uMode > 0 && vUv.x > 0.94) { float Is = texture(uState, vec2(0.9, vUv.y)).b; float g = clamp(sqrt(Is) * 34.0, 0.0, 1.25); c = vec3(0.015, 0.012, 0.02) + vec3(1.0, 0.8, 0.45) * g * g * 1.3; }
  if (wall(vUv) > 0.5) c = vec3(0.78, 0.8, 0.9);
  float vig = smoothstep(1.4, 0.4, length(vUv - 0.5) * 1.4);
  o = vec4(aces(c * 1.2) * (0.6 + 0.4 * vig), 1.0);
}`;

export default function create(G, { params, coarse }) {
  const step = G.program(NEIGH_VS, STEP), show = G.program(QUAD_VS, SHOW);
  let W = 1, H = 1, st = null, phase = 0, drop = null, rain = 0, holding = null, warm = 0;
  const C2 = 0.42;

  function alloc() {
    G.free(st);
    const side = coarse ? 440 : 720, a = W / H;
    const [w, h] = a >= 1 ? [side, Math.round(side / a)] : [Math.round(side * a), side];
    st = G.pingpong(w, h, G.F4, { filter: 'linear' });
    clear();
  }
  function clear() {
    const { gl } = G;
    for (const tg of [st.read, st.write]) { gl.bindFramebuffer(gl.FRAMEBUFFER, tg.fbo); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
    phase = 0; warm = 900;
  }

  return {
    quality: 1,
    resize(w, h) { W = w; H = h; if (!st || Math.abs(st.w / st.h - w / h) > 0.03) alloc(); },
    frame(dt) {
      let px = 0;
      const mode = +(params.mode ?? 2), wl = params.wl ?? 14;
      const omega = (2 * Math.PI * Math.sqrt(C2)) / wl;
      let steps = coarse ? 3 : 4;
      if (warm > 0) { const k = Math.min(warm, 90); steps += k; warm -= k; }
      // Bassin libre : quelques gouttes de pluie
      if (mode === 0 && !holding && (rain -= dt) < 0) { rain = 0.5 + Math.random() * 1.3; drop = [Math.random() * 0.8 + 0.1, Math.random() * 0.8 + 0.1, 0.012, 1.4]; }
      step.use().set({ uTexel: st.texel, uC2: C2, uMode: mode, uGrid: [st.w, st.h], uAspect: st.w / st.h, uAmp: 0.022 });
      for (let i = 0; i < steps; i++) {
        phase += omega;
        let d = [0, 0, -1, 0];
        if (holding) d = [holding[0], holding[1], 0.008, 0.9 * Math.sin(phase * 1.0)];
        else if (drop && i === 0) { d = drop; drop = null; }
        step.set({ uState: st.read, uPhase: phase, uDrop: d });
        px += G.draw(st.write); st.swap();
      }
      show.use().set({ uState: st.read, uTexel: st.texel, uMode: mode, uGrid: [st.w, st.h], uAspect: st.w / st.h });
      px += G.draw(null, W, H);
      return px;
    },
    pointer(e) {
      if (e.type === 'tap') { drop = [e.x, e.y, 0.012, 1.6]; return; }
      if (e.type === 'up') { holding = null; return; }
      if ((e.type === 'down' || e.type === 'move') && e.down) holding = [e.x, e.y];
    },
    param(k) { if (k === 'mode') clear(); },
    info() { return `grille ${st.w}×${st.h} · ${coarse ? 3 : 4} pas/image`; },
    destroy() {},
  };
}
