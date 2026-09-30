// wouaw — petit noyau WebGL2 partagé par toutes les simulations.
// Programmes, textures, framebuffers « ping-pong » et un quadrilatère plein écran.

export const QUAD_VS = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

// Variante avec les coordonnées des quatre voisins (fluides, diffusion…)
export const NEIGH_VS = `#version 300 es
in vec2 aPos;
uniform vec2 uTexel;
out vec2 vUv, vL, vR, vT, vB;
void main() {
  vUv = aPos * 0.5 + 0.5;
  vL = vUv - vec2(uTexel.x, 0.0); vR = vUv + vec2(uTexel.x, 0.0);
  vT = vUv + vec2(0.0, uTexel.y); vB = vUv - vec2(0.0, uTexel.y);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// Fonctions GLSL réutilisables : hachage, bruit, palette « cosinus » (I. Quilez)
export const GLSL_COMMON = `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
vec3 cosPal(float t, vec3 a, vec3 b, vec3 c, vec3 d) { return a + b * cos(6.28318 * (c * t + d)); }
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
`;

export function createGL(canvas) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  const floatRT = !!gl.getExtension('EXT_color_buffer_float');
  const halfRT = floatRT || !!gl.getExtension('EXT_color_buffer_half_float');
  gl.getExtension('OES_texture_float_linear');
  gl.getExtension('EXT_float_blend');
  if (!halfRT) return null;

  // Quadrilatère plein écran partagé
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const G = { gl, floatRT, halfRT, vao, programs: [], textures: [], fbos: [] };

  G.program = (vs, fs) => {
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(s);
        console.error(log, '\n', src.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n'));
        throw new Error('Shader : ' + log);
      }
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, 'aPos');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Lien : ' + gl.getProgramInfoLog(p));
    const loc = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const u = gl.getActiveUniform(p, i); loc[u.name.replace(/\[0\]$/, '')] = { l: gl.getUniformLocation(p, u.name), t: u.type }; }
    const prog = {
      p,
      use() { gl.useProgram(p); return prog; },
      set(u) {
        let unit = 0;
        for (const k in u) {
          const L = loc[k]; if (!L) continue;
          const v = u[k];
          switch (L.t) {
            case gl.FLOAT: gl.uniform1f(L.l, v); break;
            case gl.FLOAT_VEC2: gl.uniform2fv(L.l, v); break;
            case gl.FLOAT_VEC3: gl.uniform3fv(L.l, v); break;
            case gl.FLOAT_VEC4: gl.uniform4fv(L.l, v); break;
            case gl.INT: case gl.BOOL: gl.uniform1i(L.l, v); break;
            case gl.FLOAT_MAT3: gl.uniformMatrix3fv(L.l, false, v); break;
            case gl.FLOAT_MAT4: gl.uniformMatrix4fv(L.l, false, v); break;
            case gl.SAMPLER_2D: {
              gl.activeTexture(gl.TEXTURE0 + unit);
              gl.bindTexture(gl.TEXTURE_2D, v.tex || v);
              gl.uniform1i(L.l, unit++);
              break;
            }
            default: break;
          }
        }
        return prog;
      },
    };
    G.programs.push(p);
    return prog;
  };

  // Formats : 'rgba16f', 'rg16f', 'r16f', 'rgba32f', 'rgba8', 'r8'
  const FMT = {
    rgba32f: [gl.RGBA32F, gl.RGBA, gl.FLOAT], rgba16f: [gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT],
    rg16f: [gl.RG16F, gl.RG, gl.HALF_FLOAT], r16f: [gl.R16F, gl.RED, gl.HALF_FLOAT],
    rg32f: [gl.RG32F, gl.RG, gl.FLOAT], r32f: [gl.R32F, gl.RED, gl.FLOAT],
    rgba8: [gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE], r8: [gl.R8, gl.RED, gl.UNSIGNED_BYTE],
  };
  // Meilleure précision disponible pour les états de simulation
  G.F4 = floatRT ? 'rgba32f' : 'rgba16f';
  G.F2 = floatRT ? 'rg32f' : 'rg16f';
  G.F1 = floatRT ? 'r32f' : 'r16f';

  G.target = (w, h, fmt = 'rgba16f', { filter = 'linear', wrap = 'clamp', data = null } = {}) => {
    const [internal, format, type] = FMT[fmt];
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const f = filter === 'linear' && !(type === gl.FLOAT && !gl.getExtension('OES_texture_float_linear')) ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    const wr = wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wr);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wr);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, data);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (!ok && fmt.endsWith('32f')) return G.target(w, h, fmt.replace('32f', '16f'), { filter, wrap, data: null });
    G.textures.push(tex); G.fbos.push(fbo);
    return { tex, fbo, w, h, texel: [1 / w, 1 / h], fmt };
  };

  G.pingpong = (w, h, fmt, opts) => {
    const a = G.target(w, h, fmt, opts), b = G.target(w, h, fmt, opts);
    return { read: a, write: b, w, h, texel: a.texel, swap() { const t = this.read; this.read = this.write; this.write = t; } };
  };

  G.free = (t) => {
    if (!t) return;
    if (t.read) { G.free(t.read); G.free(t.write); return; }
    gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo);
  };

  // Dessine le quadrilatère dans une cible (ou à l'écran si target est null)
  G.draw = (target, w, h) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    gl.viewport(0, 0, target ? target.w : w, target ? target.h : h);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return (target ? target.w * target.h : w * h);
  };

  G.destroy = () => {
    const ext = gl.getExtension('WEBGL_lose_context');
    if (ext) ext.loseContext();
  };

  return G;
}

// Petites aides mathématiques
export const hsv = (h, s, v) => {
  const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
};

export function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
}

export function lookAt(eye, target, up) {
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((x) => x / l); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const z = norm(sub(eye, target)), x = norm(cross(up, z)), y = cross(z, x);
  return new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
}

export function mul4(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    o[c * 4 + r] = s;
  }
  return o;
}
