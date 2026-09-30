// 02 — Réaction-diffusion de Gray-Scott (Turing, 1952 ; Gray & Scott, 1984).
// U + 2V → 3V ; U est injecté au taux f, V disparaît au taux k + f. Du = 1, Dv = 0,5.
import { NEIGH_VS, QUAD_VS, GLSL_COMMON } from './gl.js';

const PRESETS = {
  coral:   { f: 0.0545, k: 0.062,  pal: 0 },
  maze:    { f: 0.029,  k: 0.057,  pal: 1 },
  mitosis: { f: 0.0367, k: 0.0649, pal: 2 },
  worms:   { f: 0.078,  k: 0.061,  pal: 3 },
  spots:   { f: 0.035,  k: 0.065,  pal: 4 },
  holes:   { f: 0.039,  k: 0.058,  pal: 5 },
};

const STEP = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv, vL, vR, vT, vB; out vec4 o;
uniform sampler2D uState; uniform vec2 uTexel; uniform float uF, uK;
uniform vec3 uBrush; // x, y, rayon (en uv, rayon <= 0 : aucun)
uniform float uAspect;
void main() {
  vec2 s = texture(uState, vUv).xy;
  vec2 lap = -s
    + 0.2 * (texture(uState, vL).xy + texture(uState, vR).xy + texture(uState, vT).xy + texture(uState, vB).xy)
    + 0.05 * (texture(uState, vUv + vec2(-uTexel.x, uTexel.y)).xy + texture(uState, vUv + uTexel).xy
            + texture(uState, vUv - uTexel).xy + texture(uState, vUv + vec2(uTexel.x, -uTexel.y)).xy);
  float u = s.x, v = s.y, uvv = u * v * v;
  u += 1.0 * lap.x - uvv + uF * (1.0 - u);
  v += 0.5 * lap.y + uvv - (uK + uF) * v;
  if (uBrush.z > 0.0) { vec2 d = vUv - uBrush.xy; d.x *= uAspect; if (length(d) < uBrush.z) { v = 0.9; u = 0.2; } }
  o = vec4(clamp(u, 0.0, 1.0), clamp(v, 0.0, 1.0), 0.0, 1.0);
}`;

const SEED = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o; uniform float uSeed, uAspect;
${GLSL_COMMON}
void main() {
  vec2 p = vUv * vec2(uAspect, 1.0) * 14.0;
  vec2 cell = floor(p), f = fract(p);
  float v = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = cell + vec2(i, j);
    vec2 h = hash22(c + uSeed);
    if (hash12(c * 1.7 + uSeed) > 0.62) continue;
    float r = 0.12 + 0.18 * h.y;
    v = max(v, smoothstep(r, r - 0.05, length(p - c - h)));
  }
  float ring = smoothstep(0.012, 0.0, abs(length((vUv - 0.5) * vec2(uAspect, 1.0)) - 0.2));
  v = max(v, ring);
  o = vec4(1.0 - v * 0.75, v * 0.5, 0.0, 1.0);
}`;

const SHOW = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform sampler2D uState; uniform vec2 uTexel; uniform int uPal; uniform float uTime;
${GLSL_COMMON}
vec3 pal(float t) {
  if (uPal == 0) return cosPal(t, vec3(.5,.5,.5), vec3(.5,.5,.5), vec3(1.,1.,1.), vec3(.0,.10,.20));
  if (uPal == 1) return cosPal(t, vec3(.5,.5,.5), vec3(.5,.5,.5), vec3(1.,1.,.5), vec3(.8,.9,.3));
  if (uPal == 2) return cosPal(t, vec3(.5,.5,.5), vec3(.5,.5,.5), vec3(1.,.7,.4), vec3(.0,.15,.20));
  if (uPal == 3) return cosPal(t, vec3(.8,.5,.4), vec3(.2,.4,.2), vec3(2.,1.,1.), vec3(.0,.25,.25));
  if (uPal == 4) return cosPal(t, vec3(.5,.5,.5), vec3(.5,.5,.5), vec3(2.,1.,0.), vec3(.5,.20,.25));
  return cosPal(t, vec3(.5,.5,.5), vec3(.5,.5,.5), vec3(1.,1.,1.), vec3(.3,.20,.20));
}
void main() {
  float v = texture(uState, vUv).y;
  float l = texture(uState, vUv - vec2(uTexel.x, 0)).y, r = texture(uState, vUv + vec2(uTexel.x, 0)).y;
  float b = texture(uState, vUv - vec2(0, uTexel.y)).y, t = texture(uState, vUv + vec2(0, uTexel.y)).y;
  vec3 n = normalize(vec3((l - r) * 6.0, (b - t) * 6.0, 1.0));
  vec3 L = normalize(vec3(-0.4, 0.6, 0.8));
  float diff = clamp(dot(n, L), 0.0, 1.0), spec = pow(clamp(dot(reflect(-L, n), vec3(0, 0, 1)), 0.0, 1.0), 24.0);
  float m = smoothstep(0.05, 0.42, v);
  vec3 base = pal(0.15 + m * 0.7 + 0.03 * sin(uTime * 0.2));
  vec3 bg = vec3(0.012, 0.01, 0.02) + 0.03 * pal(0.9);
  vec3 c = mix(bg, base * (0.35 + 0.8 * diff), m) + spec * 0.5 * m;
  float vig = smoothstep(1.3, 0.3, length(vUv - 0.5) * 1.5);
  o = vec4(pow(c * (0.35 + 0.65 * vig), vec3(0.95)), 1.0);
}`;

export default function create(G, { params, coarse }) {
  const step = G.program(NEIGH_VS, STEP), seed = G.program(QUAD_VS, SEED), show = G.program(QUAD_VS, SHOW);
  let W = 1, H = 1, st = null, brush = null, t = 0, warm = 0;
  const fmt = G.F2;

  function seedState() {
    seed.use().set({ uSeed: Math.random() * 100, uAspect: st.w / st.h });
    G.draw(st.read); G.draw(st.write);
    warm = 240;
  }
  function alloc() {
    G.free(st);
    const side = coarse ? 560 : 820, a = W / H;
    const [w, h] = a >= 1 ? [side, Math.round(side / a)] : [Math.round(side * a), side];
    st = G.pingpong(w, h, fmt, { filter: 'linear', wrap: 'repeat' });
    seedState();
  }

  return {
    quality: 1,
    resize(w, h) { W = w; H = h; if (!st || Math.abs(st.w / st.h - w / h) > 0.03) alloc(); },
    frame(dt) {
      t += dt;
      const p = PRESETS[params.preset] || PRESETS.coral;
      let px = 0;
      let iters = coarse ? 10 : 16;
      if (warm > 0) { iters += Math.min(warm, 60); warm -= Math.min(warm, 60); }
      step.use().set({ uTexel: st.texel, uF: p.f, uK: p.k, uAspect: st.w / st.h });
      for (let i = 0; i < iters; i++) {
        step.set({ uState: st.read, uBrush: brush && i === 0 ? brush : [0, 0, -1] });
        px += G.draw(st.write); st.swap();
      }
      if (brush && !brush.hold) brush = null;
      show.use().set({ uState: st.read, uTexel: st.texel, uPal: p.pal, uTime: t });
      px += G.draw(null, W, H);
      return px;
    },
    pointer(e) {
      if (e.type === 'tap' || (e.type === 'move' && e.down) || (e.type === 'down' && !e.touch)) brush = [e.x, e.y, 0.018];
    },
    param(k) { if (k === 'preset') seedState(); },
    act(a) { if (a === 'seed') seedState(); },
    info() { return `grille ${st.w}×${st.h} · ${coarse ? 10 : 16} pas/image`; },
    destroy() {},
  };
}
