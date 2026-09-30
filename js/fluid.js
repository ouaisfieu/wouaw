// 01 — Fluide : équations de Navier-Stokes incompressibles, méthode « Stable Fluids » (J. Stam, 1999).
// Advection semi-lagrangienne, confinement de la vorticité, projection de pression par itérations de Jacobi.
import { QUAD_VS, NEIGH_VS, hsv } from './gl.js';

const H = `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv, vL, vR, vT, vB; out vec4 o;
`;

const FS = {
  splat: H + `uniform sampler2D uTarget; uniform float uAspect, uRadius; uniform vec3 uColor; uniform vec2 uPoint;
    void main() { vec2 p = vUv - uPoint; p.x *= uAspect; vec3 s = exp(-dot(p, p) / uRadius) * uColor; o = vec4(texture(uTarget, vUv).xyz + s, 1.0); }`,
  advect: H + `uniform sampler2D uVelocity, uSource; uniform vec2 uVelTexel; uniform float uDt, uDiss;
    void main() { vec2 c = vUv - uDt * texture(uVelocity, vUv).xy * uVelTexel; o = texture(uSource, c) / (1.0 + uDiss * uDt); }`,
  divergence: H + `uniform sampler2D uVelocity;
    void main() {
      float L = texture(uVelocity, vL).x, R = texture(uVelocity, vR).x, T = texture(uVelocity, vT).y, B = texture(uVelocity, vB).y;
      vec2 C = texture(uVelocity, vUv).xy;
      if (vL.x < 0.0) L = -C.x; if (vR.x > 1.0) R = -C.x; if (vT.y > 1.0) T = -C.y; if (vB.y < 0.0) B = -C.y;
      o = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
    }`,
  curl: H + `uniform sampler2D uVelocity;
    void main() { float L = texture(uVelocity, vL).y, R = texture(uVelocity, vR).y, T = texture(uVelocity, vT).x, B = texture(uVelocity, vB).x;
      o = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0); }`,
  vorticity: H + `uniform sampler2D uVelocity, uCurl; uniform float uCurlK, uDt;
    void main() {
      float L = texture(uCurl, vL).x, R = texture(uCurl, vR).x, T = texture(uCurl, vT).x, B = texture(uCurl, vB).x, C = texture(uCurl, vUv).x;
      vec2 f = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L)); f /= length(f) + 1e-4; f *= uCurlK * C; f.y *= -1.0;
      vec2 v = texture(uVelocity, vUv).xy + f * uDt; o = vec4(clamp(v, -1000.0, 1000.0), 0.0, 1.0);
    }`,
  clear: H + `uniform sampler2D uTex; uniform float uValue; void main() { o = uValue * texture(uTex, vUv); }`,
  pressure: H + `uniform sampler2D uPressure, uDivergence;
    void main() { float L = texture(uPressure, vL).x, R = texture(uPressure, vR).x, T = texture(uPressure, vT).x, B = texture(uPressure, vB).x;
      o = vec4((L + R + B + T - texture(uDivergence, vUv).x) * 0.25, 0.0, 0.0, 1.0); }`,
  gradient: H + `uniform sampler2D uPressure, uVelocity;
    void main() { float L = texture(uPressure, vL).x, R = texture(uPressure, vR).x, T = texture(uPressure, vT).x, B = texture(uPressure, vB).x;
      vec2 v = texture(uVelocity, vUv).xy - vec2(R - L, T - B); o = vec4(v, 0.0, 1.0); }`,
  display: H + `uniform sampler2D uDye; uniform vec2 uDyeTexel;
    void main() {
      vec3 c = texture(uDye, vUv).rgb;
      // Relief : normale estimée à partir de la luminosité de l'encre
      float l = length(texture(uDye, vUv - vec2(uDyeTexel.x, 0)).rgb), r = length(texture(uDye, vUv + vec2(uDyeTexel.x, 0)).rgb);
      float b = length(texture(uDye, vUv - vec2(0, uDyeTexel.y)).rgb), t = length(texture(uDye, vUv + vec2(0, uDyeTexel.y)).rgb);
      vec3 n = normalize(vec3(l - r, b - t, 0.35));
      float shade = clamp(dot(n, normalize(vec3(0.3, 0.5, 1.0))) + 0.25, 0.55, 1.15);
      c *= shade;
      c = 1.0 - exp(-c * 1.9);
      c = pow(c, vec3(0.92));
      float vig = smoothstep(1.25, 0.35, length(vUv - 0.5) * 1.4);
      o = vec4(mix(vec3(0.012, 0.012, 0.02), c, 0.25 + 0.75 * vig) + c * 0.0, 1.0);
    }`,
};

export default function create(G, { params, coarse }) {
  const { gl } = G;
  const P = Object.fromEntries(Object.entries(FS).map(([k, fs]) => [k, G.program(NEIGH_VS, fs)]));
  void QUAD_VS;
  let W = 1, Hh = 1, vel, dye, prs, div, crl, simW, simH, dyeW, dyeH;
  let hue = Math.random(), auto = 0, pending = [];
  const touches = new Map();

  function alloc() {
    const aspect = W / Hh;
    const simRes = coarse ? 96 : 128, dyeRes = coarse ? 512 : 1024;
    [simW, simH] = aspect >= 1 ? [Math.round(simRes * aspect), simRes] : [simRes, Math.round(simRes / aspect)];
    const dr = dyeRes;
    [dyeW, dyeH] = aspect >= 1 ? [dr, Math.round(dr / aspect)] : [Math.round(dr * aspect), dr];
    [vel, dye, prs].forEach(G.free); G.free(div); G.free(crl);
    vel = G.pingpong(simW, simH, 'rg16f');
    dye = G.pingpong(dyeW, dyeH, 'rgba16f');
    prs = G.pingpong(simW, simH, 'r16f', { filter: 'nearest' });
    div = G.target(simW, simH, 'r16f', { filter: 'nearest' });
    crl = G.target(simW, simH, 'r16f', { filter: 'nearest' });
    for (let i = 0; i < 7; i++) randomSplat();
  }

  function splat(x, y, dx, dy, color, radius = 0.22) {
    pending.push({ x, y, dx, dy, color, radius });
  }
  function randomSplat() {
    const c = hsv((hue += 0.13) % 1, 0.9, 1).map((v) => v * 1.4);
    const a = Math.random() * Math.PI * 2, f = 900 + Math.random() * 900;
    splat(0.15 + Math.random() * 0.7, 0.15 + Math.random() * 0.7, Math.cos(a) * f, Math.sin(a) * f, c, 0.35);
  }

  function doSplat(s) {
    let px = 0;
    const aspect = W / Hh, r = (s.radius / 100) * (aspect > 1 ? aspect : 1);
    P.splat.use().set({ uTexel: vel.texel, uTarget: vel.read, uAspect: aspect, uPoint: [s.x, s.y], uColor: [s.dx, s.dy, 0], uRadius: r });
    px += G.draw(vel.write); vel.swap();
    P.splat.use().set({ uTexel: dye.texel, uTarget: dye.read, uAspect: aspect, uPoint: [s.x, s.y], uColor: s.color, uRadius: r });
    px += G.draw(dye.write); dye.swap();
    return px;
  }

  return {
    quality: 1,
    resize(w, h) { const re = !vel || Math.abs(vel.w / vel.h - w / h) > 0.03; W = w; Hh = h; if (re) alloc(); },
    frame(dt) {
      let px = 0;
      const curlK = params.curl ?? 28, iters = coarse ? 16 : 22;
      // Éclaboussures automatiques quand personne ne touche
      if ((auto -= dt) < 0) { auto = touches.size ? 3 : 1.4 + Math.random() * 1.2; if (!touches.size) randomSplat(); }
      while (pending.length) px += doSplat(pending.shift());

      P.curl.use().set({ uTexel: vel.texel, uVelocity: vel.read }); px += G.draw(crl);
      P.vorticity.use().set({ uTexel: vel.texel, uVelocity: vel.read, uCurl: crl, uCurlK: curlK, uDt: dt }); px += G.draw(vel.write); vel.swap();
      P.divergence.use().set({ uTexel: vel.texel, uVelocity: vel.read }); px += G.draw(div);
      P.clear.use().set({ uTexel: prs.texel, uTex: prs.read, uValue: 0.8 }); px += G.draw(prs.write); prs.swap();
      P.pressure.use().set({ uTexel: prs.texel, uDivergence: div });
      for (let i = 0; i < iters; i++) { P.pressure.set({ uPressure: prs.read }); px += G.draw(prs.write); prs.swap(); }
      P.gradient.use().set({ uTexel: vel.texel, uPressure: prs.read, uVelocity: vel.read }); px += G.draw(vel.write); vel.swap();
      P.advect.use().set({ uTexel: vel.texel, uVelocity: vel.read, uSource: vel.read, uVelTexel: vel.texel, uDt: dt, uDiss: 0.15 }); px += G.draw(vel.write); vel.swap();
      P.advect.use().set({ uTexel: dye.texel, uVelocity: vel.read, uSource: dye.read, uVelTexel: vel.texel, uDt: dt, uDiss: params.fade ?? 0.6 }); px += G.draw(dye.write); dye.swap();
      P.display.use().set({ uTexel: dye.texel, uDye: dye.read, uDyeTexel: dye.texel }); px += G.draw(null, W, Hh);
      return px;
    },
    pointer(e) {
      if (e.type === 'up') { touches.delete(e.id); return; }
      if (e.type === 'down' || e.type === 'tap') {
        touches.set(e.id, hsv((hue += 0.17) % 1, 0.9, 1).map((v) => v * 0.8));
        if (e.type === 'tap') { const c = touches.get(e.id); for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; splat(e.x, e.y, Math.cos(a) * 700, Math.sin(a) * 700, c, 0.18); } }
        return;
      }
      if (e.type !== 'move') return;
      if (e.touch && !e.down) return;
      if (!touches.has(e.id)) touches.set(e.id, hsv((hue += 0.17) % 1, 0.9, 1).map((v) => v * 0.8));
      if (Math.abs(e.dx) + Math.abs(e.dy) < 1e-5) return;
      const f = params.force ?? 6000;
      auto = 3;
      splat(e.x, e.y, e.dx * f, e.dy * f, touches.get(e.id), 0.2);
      if (!e.down && !e.touch && Math.random() < 0.004) touches.set(e.id, hsv((hue += 0.17) % 1, 0.9, 1).map((v) => v * 0.8));
    },
    act(a) {
      if (a === 'burst') for (let i = 0; i < 12; i++) randomSplat();
      if (a === 'clear') { alloc(); pending = []; }
    },
    info() { return `grille ${simW}×${simH}`; },
    destroy() {},
  };
}
