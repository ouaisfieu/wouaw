// 04 — Attracteur de Lorenz (1963) : dx/dt = σ(y − x), dy/dt = x(ρ − z) − y, dz/dt = xy − βz.
// Des dizaines de milliers de points partent d'un minuscule cube ; on regarde le chaos les séparer.
import { QUAD_VS, GLSL_COMMON, perspective, lookAt, mul4 } from './gl.js';

const INIT = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o; uniform vec3 uStart; uniform float uEps, uSeed;
${GLSL_COMMON}
void main() {
  vec2 h = hash22(vUv * 917.3 + uSeed), g = hash22(vUv * 311.7 - uSeed);
  vec3 off = (vec3(h, g.x) - 0.5) * uEps;
  // La couleur dépend de la position de départ dans le cube : on verra les couleurs se mélanger.
  o = vec4(uStart + off, fract(h.x + 0.35 * g.x));
}`;

const STEP = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv; out vec4 o; uniform sampler2D uPos; uniform float uDt; uniform int uSteps;
vec3 f(vec3 p) { return vec3(10.0 * (p.y - p.x), p.x * (28.0 - p.z) - p.y, p.x * p.y - (8.0 / 3.0) * p.z); }
void main() {
  vec4 s = texture(uPos, vUv);
  vec3 p = s.xyz;
  for (int i = 0; i < 24; i++) {
    if (i >= uSteps) break;
    vec3 k1 = f(p), k2 = f(p + 0.5 * uDt * k1), k3 = f(p + 0.5 * uDt * k2), k4 = f(p + uDt * k3);
    p += uDt / 6.0 * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
  }
  o = vec4(p, s.w);
}`;

const PTS_VS = `#version 300 es
precision highp float; precision highp sampler2D;
uniform sampler2D uPos; uniform int uCols; uniform mat4 uMVP; uniform float uSize; uniform vec2 uOff;
out vec3 vCol;
${GLSL_COMMON}
void main() {
  vec4 s = texelFetch(uPos, ivec2(gl_VertexID % uCols, gl_VertexID / uCols), 0);
  gl_Position = uMVP * vec4(s.xyz - vec3(0.0, 0.0, 25.0), 1.0);
  gl_Position.xy += uOff * gl_Position.w;
  gl_PointSize = uSize;
  vCol = cosPal(s.w, vec3(.55, .5, .55), vec3(.45, .5, .45), vec3(1.0, 1.0, 1.0), vec3(.0, .33, .67));
}`;
const PTS_FS = `#version 300 es
precision highp float; in vec3 vCol; out vec4 o; uniform float uGain;
void main() { vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d)); o = vec4(vCol * a * uGain, 1.0); }`;

const FADE = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv; out vec4 o; uniform sampler2D uAcc; uniform float uFade;
void main() { o = texture(uAcc, vUv) * uFade; }`;

const SHOW = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv; out vec4 o; uniform sampler2D uAcc;
${GLSL_COMMON}
void main() {
  vec3 c = texture(uAcc, vUv).rgb;
  vec3 bg = mix(vec3(0.004, 0.004, 0.012), vec3(0.03, 0.015, 0.05), smoothstep(1.2, 0.0, length(vUv - vec2(0.5, 0.55))));
  o = vec4(aces(c * 1.2) + bg, 1.0);
}`;

export default function create(G, { params, section, coarse }) {
  const { gl } = G;
  const init = G.program(QUAD_VS, INIT), step = G.program(QUAD_VS, STEP), fade = G.program(QUAD_VS, FADE), show = G.program(QUAD_VS, SHOW);
  const pts = G.program(PTS_VS, PTS_FS);
  const emptyVao = gl.createVertexArray();
  const cols = 256, rows = coarse ? 128 : 256, N = cols * rows;
  const pos = G.pingpong(cols, rows, G.F4, { filter: 'nearest' });
  const label = section.querySelector('[data-count]');
  if (label) label.textContent = N.toLocaleString('fr-FR');
  let W = 1, H = 1, acc = null, simT = 0, theta = 0.6, phi = 0.18, dragging = false;

  // Un point de départ déjà posé sur l'attracteur (intégration préalable côté processeur)
  function onAttractor() {
    let x = 1 + Math.random(), y = 1, z = 1;
    for (let i = 0; i < 3000 + Math.random() * 2000; i++) {
      const dt = 0.005, dx = 10 * (y - x), dy = x * (28 - z) - y, dz = x * y - (8 / 3) * z;
      x += dx * dt; y += dy * dt; z += dz * dt;
    }
    return [x, y, z];
  }
  function restart() {
    init.use().set({ uStart: onAttractor(), uEps: Math.pow(10, params.eps ?? -3), uSeed: Math.random() * 50 });
    G.draw(pos.read); G.draw(pos.write);
    simT = 0;
    if (acc) for (const tg of [acc.read, acc.write]) { gl.bindFramebuffer(gl.FRAMEBUFFER, tg.fbo); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); }
  }
  restart();

  return {
    quality: 1,
    resize(w, h) { W = w; H = h; G.free(acc); acc = G.pingpong(w, h, 'rgba16f'); },
    frame(dt, time) {
      let px = 0;
      const steps = Math.round(params.speed ?? 5), sdt = 0.005;
      step.use().set({ uPos: pos.read, uDt: sdt, uSteps: steps });
      px += G.draw(pos.write); pos.swap();
      simT += steps * sdt;
      if (simT > 45) restart();
      if (params.spin !== false && !dragging) theta += dt * 0.12;
      const R = 74, eye = [R * Math.cos(theta) * Math.cos(phi), R * Math.sin(theta) * Math.cos(phi), R * Math.sin(phi)];
      const asp = W / H, fov = 2 * Math.atan(Math.tan(0.36) / Math.min(asp, 1));
      const mvp = mul4(perspective(fov, asp, 1, 400), lookAt(eye, [0, 0, 0], [0, 0, 1]));
      // Traînées : on estompe l'image précédente puis on ajoute les points
      fade.use().set({ uAcc: acc.read, uFade: 0.88 });
      px += G.draw(acc.write); acc.swap();
      gl.bindFramebuffer(gl.FRAMEBUFFER, acc.read.fbo);
      gl.viewport(0, 0, W, H);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      const k = Math.max(1, Math.min(W, H) / 700);
      pts.use().set({ uPos: pos.read, uCols: cols, uMVP: mvp, uSize: 1.7 * k, uOff: asp < 1 ? [0, 0.28] : [0.22 * Math.min(1, asp / 1.6), 0.05], uGain: (coarse ? 1.8 : 1) * (0.022 + 0.07 * Math.min(1, Math.max(0, (simT - 4) / 22))) });
      gl.bindVertexArray(emptyVao);
      gl.drawArrays(gl.POINTS, 0, N);
      gl.disable(gl.BLEND);
      px += N * 4;
      show.use().set({ uAcc: acc.read });
      px += G.draw(null, W, H);
      void time;
      return px;
    },
    pointer(e) {
      if (e.type === 'down') dragging = true;
      if (e.type === 'up') dragging = false;
      if (e.type === 'move' && e.down) { theta -= e.dx * 4; phi = Math.max(-1.2, Math.min(1.2, phi - e.dy * 3)); }
    },
    param(k) { if (k === 'eps') restart(); },
    act(a) { if (a === 'reset') restart(); },
    info() { return `${N.toLocaleString('fr-FR')} trajectoires · t = ${simT.toFixed(1).replace('.', ',')}`; },
    destroy() {},
  };
}
