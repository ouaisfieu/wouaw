// 03 — Le blob : modèle d'agents de Jeff Jones (2010) pour Physarum polycephalum.
// Chaque agent sent la trace devant lui (3 capteurs), tourne, avance, dépose. La trace diffuse et s'évapore.
import { QUAD_VS, GLSL_COMMON } from './gl.js';

const PRESETS = {
  net:     { sa: 22.5, ra: 45, so: 9,  speed: 1.2, decay: 0.90, dep: 0.06, pal: 0 },
  cells:   { sa: 30,   ra: 30, so: 26, speed: 1.4, decay: 0.93, dep: 0.05, pal: 1 },
  rings:   { sa: 60,   ra: 55, so: 14, speed: 1.1, decay: 0.88, dep: 0.07, pal: 2 },
  threads: { sa: 12,   ra: 20, so: 34, speed: 2.2, decay: 0.95, dep: 0.03, pal: 3 },
};

const INIT = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 o; uniform float uSeed, uAspect;
${GLSL_COMMON}
void main() {
  vec2 h = hash22(vUv * 1234.5 + uSeed);
  float a = h.x * 6.28318, r = sqrt(h.y) * 0.33 * min(1.0, uAspect);
  vec2 p = vec2(uAspect > 1.0 ? 0.56 : 0.5, uAspect > 1.0 ? 0.52 : 0.6) + vec2(cos(a) / uAspect, sin(a)) * r;
  float ang = a + (hash12(vUv * 77.7 + uSeed) - 0.5) * 0.6;
  o = vec4(p, ang, 1.0);
}`;

const UPDATE = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform sampler2D uAgents, uTrail; uniform vec2 uTrailPx; uniform float uSA, uRA, uSO, uSpeed, uTime;
${GLSL_COMMON}
float sense(vec2 p, float a) { return texture(uTrail, p + vec2(cos(a), sin(a)) * uSO * uTrailPx).r; }
void main() {
  vec4 ag = texture(uAgents, vUv);
  vec2 p = ag.xy; float a = ag.z;
  float f = sense(p, a), l = sense(p, a + uSA), r = sense(p, a - uSA);
  float rnd = hash12(vUv * 4096.0 + fract(uTime) * 311.0);
  if (f > l && f > r) { }
  else if (f < l && f < r) a += (rnd - 0.5) * 2.0 * uRA;
  else if (l > r) a += uRA * (0.8 + 0.4 * rnd);
  else if (r > l) a -= uRA * (0.8 + 0.4 * rnd);
  p = fract(p + vec2(cos(a), sin(a)) * uSpeed * uTrailPx);
  o = vec4(p, a, 1.0);
}`;

const DEPOSIT_VS = `#version 300 es
precision highp float; precision highp sampler2D;
uniform sampler2D uAgents; uniform int uCols;
void main() {
  ivec2 c = ivec2(gl_VertexID % uCols, gl_VertexID / uCols);
  vec2 p = texelFetch(uAgents, c, 0).xy;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  gl_PointSize = 1.0;
}`;
const DEPOSIT_FS = `#version 300 es
precision highp float; out vec4 o; uniform float uDep;
void main() { o = vec4(uDep, 0.0, 0.0, 1.0); }`;

const DIFFUSE = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform sampler2D uTrail; uniform vec2 uPx; uniform float uDecay, uAspect; uniform vec3 uFood;
void main() {
  float s = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) s += texture(uTrail, vUv + vec2(i, j) * uPx).r;
  float v = (s / 9.0) * uDecay;
  if (uFood.z > 0.0) { vec2 d = vUv - uFood.xy; d.x *= uAspect; v += uFood.z * exp(-dot(d, d) / 0.0006); }
  o = vec4(min(v, 40.0), 0.0, 0.0, 1.0);
}`;

const SHOW = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv; out vec4 o;
uniform sampler2D uTrail; uniform int uPal; uniform float uGain;
${GLSL_COMMON}
vec3 ramp(float t) {
  if (uPal == 0) return mix(mix(vec3(0.01, 0.02, 0.06), vec3(0.05, 0.45, 0.75), smoothstep(0.0, 0.45, t)), vec3(1.0, 0.92, 0.65), smoothstep(0.45, 1.0, t));
  if (uPal == 1) return mix(mix(vec3(0.03, 0.0, 0.03), vec3(0.85, 0.2, 0.45), smoothstep(0.0, 0.5, t)), vec3(1.0, 0.85, 0.6), smoothstep(0.5, 1.0, t));
  if (uPal == 2) return mix(mix(vec3(0.0, 0.03, 0.02), vec3(0.1, 0.7, 0.45), smoothstep(0.0, 0.5, t)), vec3(0.9, 1.0, 0.8), smoothstep(0.5, 1.0, t));
  return mix(mix(vec3(0.02, 0.01, 0.0), vec3(0.95, 0.55, 0.1), smoothstep(0.0, 0.5, t)), vec3(1.0, 0.97, 0.85), smoothstep(0.5, 1.0, t));
}
void main() {
  float v = texture(uTrail, vUv).r;
  float t = 1.0 - exp(-v * uGain);
  vec3 c = ramp(t);
  float vig = smoothstep(1.3, 0.35, length(vUv - 0.5) * 1.4);
  o = vec4(c * (0.4 + 0.6 * vig), 1.0);
}`;

export default function create(G, { params, section, coarse }) {
  const { gl } = G;
  const init = G.program(QUAD_VS, INIT), upd = G.program(QUAD_VS, UPDATE), dif = G.program(QUAD_VS, DIFFUSE), show = G.program(QUAD_VS, SHOW);
  const dep = G.program(DEPOSIT_VS, DEPOSIT_FS);
  const emptyVao = gl.createVertexArray();
  const cols = coarse ? 256 : 512, N = cols * cols;
  const agents = G.pingpong(cols, cols, G.F4, { filter: 'nearest' });
  const label = section.querySelector('[data-agents]');
  if (label) label.textContent = N.toLocaleString('fr-FR');
  let W = 1, H = 1, trail = null, t = 0, food = null, foodPulse = 0, pulseAt = [0.5, 0.5];

  function seed() {
    init.use().set({ uSeed: Math.random() * 100, uAspect: trail ? trail.w / trail.h : W / H });
    G.draw(agents.read); G.draw(agents.write);
    if (trail) { for (const tg of [trail.read, trail.write]) { gl.bindFramebuffer(gl.FRAMEBUFFER, tg.fbo); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT); } }
  }
  function alloc() {
    G.free(trail);
    const side = coarse ? 720 : 1100, a = W / H;
    const [w, h] = a >= 1 ? [side, Math.round(side / a)] : [Math.round(side * a), side];
    trail = G.pingpong(w, h, 'r16f', { filter: 'linear', wrap: 'repeat' });
    seed();
  }

  return {
    quality: 1,
    resize(w, h) { W = w; H = h; if (!trail || Math.abs(trail.w / trail.h - w / h) > 0.03) alloc(); },
    frame(dt) {
      t += dt;
      const p = PRESETS[params.preset] || PRESETS.net, d2r = Math.PI / 180;
      let px = 0;
      const steps = coarse ? 1 : 2;
      for (let s = 0; s < steps; s++) {
        // 1. Les agents sentent, tournent, avancent
        upd.use().set({ uAgents: agents.read, uTrail: trail.read, uTrailPx: trail.texel, uSA: p.sa * d2r, uRA: p.ra * d2r, uSO: p.so, uSpeed: p.speed, uTime: t + s * 0.37 });
        px += G.draw(agents.write); agents.swap();
        // 2. Ils déposent leur trace (points additionnés)
        gl.bindFramebuffer(gl.FRAMEBUFFER, trail.read.fbo);
        gl.viewport(0, 0, trail.w, trail.h);
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
        dep.use().set({ uAgents: agents.read, uCols: cols, uDep: p.dep * (coarse ? 3 : 1) });
        gl.bindVertexArray(emptyVao);
        gl.drawArrays(gl.POINTS, 0, N);
        gl.disable(gl.BLEND);
        px += N;
        // 3. La trace diffuse et s'évapore ; la nourriture en ajoute
        const fz = food ? 0.35 : foodPulse > 0 ? 2.5 : 0;
        dif.use().set({ uTrail: trail.read, uPx: trail.texel, uDecay: p.decay, uAspect: trail.w / trail.h, uFood: food ? [food[0], food[1], fz] : foodPulse > 0 ? [pulseAt[0], pulseAt[1], fz] : [0, 0, -1] });
        px += G.draw(trail.write); trail.swap();
      }
      if (foodPulse > 0) foodPulse--;
      show.use().set({ uTrail: trail.read, uPal: p.pal, uGain: coarse ? 0.9 : 1.1 });
      px += G.draw(null, W, H);
      return px;
    },
    pointer(e) {
      if (e.type === 'tap') { pulseAt = [e.x, e.y]; foodPulse = 6; return; }
      if (e.type === 'up') { food = null; return; }
      if ((e.type === 'move' || e.type === 'down') && e.down) food = [e.x, e.y];
      else if (e.type === 'move' && !e.touch) food = null;
    },
    param(k) { if (k === 'preset') seed(); },
    act(a) { if (a === 'reset') seed(); },
    info() { return `${N.toLocaleString('fr-FR')} agents · trace ${trail.w}×${trail.h}`; },
    destroy() {},
  };
}
