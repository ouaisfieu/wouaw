// wouaw — chef d'orchestre : crée chaque simulation quand on s'en approche,
// la fait tourner quand elle est visible, la détruit quand on s'en éloigne.
import { createGL } from './gl.js';

const MODULES = {
  fluid: () => import('./fluid.js'),
  turing: () => import('./turing.js'),
  physarum: () => import('./physarum.js'),
  lorenz: () => import('./lorenz.js'),
  blackhole: () => import('./blackhole.js'),
  waves: () => import('./waves.js'),
  mandelbulb: () => import('./mandelbulb.js'),
};

const root = document.documentElement;
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = matchMedia('(pointer: coarse)').matches;
const fr = (n) => Math.round(n).toLocaleString('fr-FR');

// Test de support global
const probe = document.createElement('canvas').getContext('webgl2');
const glOK = !!probe && (!!probe.getExtension('EXT_color_buffer_float') || !!probe.getExtension('EXT_color_buffer_half_float'));
probe?.getExtension('WEBGL_lose_context')?.loseContext();
if (!glOK) root.classList.add('nogl');

/* ---------- Compteur de pixels calculés ---------- */
let pixels = 0, pixWindow = 0, lastCount = performance.now();
const counter = document.getElementById('counter');
const rate = document.getElementById('rate');
const total = document.querySelector('[data-total]');
setInterval(() => {
  const now = performance.now();
  if (counter) counter.textContent = fr(pixels);
  if (rate) rate.textContent = fr((pixWindow / (now - lastCount)) * 1000);
  if (total && pixels) total.textContent = fr(pixels);
  pixWindow = 0; lastCount = now;
}, 500);

/* ---------- Scènes ---------- */
const scenes = [...document.querySelectorAll('.scene[data-sim]')].map((el) => ({
  el, id: el.id, kind: el.dataset.sim, base: +(el.dataset.scale || 1),
  canvas: el.querySelector('canvas'), inst: null, G: null, loading: false,
  visible: false, near: false, q: 1, ema: 16, slow: 0, fast: 0,
  allowed: !reduce, params: {}, info: el.querySelector('[data-info]'),
}));

function readParams(sc) {
  sc.el.querySelectorAll('[data-p]').forEach((inp) => {
    sc.params[inp.dataset.p] = inp.type === 'checkbox' ? inp.checked : inp.tagName === 'SELECT' ? inp.value : +inp.value;
  });
}

function wireControls(sc) {
  readParams(sc);
  sc.el.querySelectorAll('[data-p]').forEach((inp) => inp.addEventListener('input', () => {
    readParams(sc);
    sc.inst?.param?.(inp.dataset.p, sc.params[inp.dataset.p]);
  }));
  sc.el.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => {
    const a = b.dataset.act;
    if (a === 'launch') { sc.allowed = true; sc.el.classList.add('launched'); ensure(sc); return; }
    if (a === 'touch') {
      const on = !sc.el.classList.contains('touching');
      sc.el.classList.toggle('touching', on);
      b.setAttribute('aria-pressed', String(on));
      b.textContent = on ? 'défiler' : 'toucher';
      return;
    }
    sc.inst?.act?.(a, b);
  }));
}

function size(sc, force = false) {
  if (!sc.inst) return;
  const r = sc.canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const s = dpr * sc.base * sc.q;
  const w = Math.max(64, Math.round(r.width * s)), h = Math.max(64, Math.round(r.height * s));
  if (force || sc.canvas.width !== w || sc.canvas.height !== h) {
    sc.canvas.width = w; sc.canvas.height = h;
    sc.inst.resize?.(w, h);
  }
}

async function ensure(sc) {
  if (!glOK || !sc.allowed || sc.inst || sc.loading) return;
  sc.loading = true;
  try {
    const mod = await MODULES[sc.kind]();
    if (!sc.near) return;
    const G = createGL(sc.canvas);
    if (!G) { sc.el.classList.add('failed'); return; }
    sc.G = G;
    readParams(sc);
    sc.inst = mod.default(G, { params: sc.params, section: sc.el, canvas: sc.canvas, coarse });
    sc.q = sc.inst.quality ?? 1;
    size(sc, true);
    sc.first = true;
  } catch (e) {
    console.error(`[${sc.id}]`, e);
    sc.el.classList.add('failed');
  } finally { sc.loading = false; }
}

function release(sc) {
  if (!sc.inst) return;
  try { sc.inst.destroy?.(); } catch (e) { /* rien */ }
  sc.G.destroy();
  // Un canvas dont le contexte est perdu ne peut pas en recréer : on le remplace.
  const fresh = sc.canvas.cloneNode(false);
  sc.canvas.replaceWith(fresh);
  sc.canvas = fresh; sc.inst = null; sc.G = null;
  sc.el.classList.remove('live');
  bindPointer(sc);
  ro.observe(fresh);
}

/* ---------- Pointeur ---------- */
function bindPointer(sc) {
  const cv = sc.canvas;
  let last = null, downAt = null;
  const norm = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: 1 - (e.clientY - r.top) / r.height, aspect: r.width / r.height }; };
  const send = (type, e) => {
    if (!sc.inst?.pointer) return;
    const p = norm(e);
    const dx = last ? p.x - last.x : 0, dy = last ? p.y - last.y : 0;
    sc.inst.pointer({ type, ...p, dx, dy, down: e.buttons > 0 || e.pointerType === 'touch', id: e.pointerId, touch: e.pointerType !== 'mouse' });
    last = p;
  };
  cv.addEventListener('pointerdown', (e) => { last = null; downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; send('down', e); });
  cv.addEventListener('pointermove', (e) => send('move', e));
  cv.addEventListener('pointerup', (e) => {
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 8) send('tap', e);
    send('up', e); last = null; downAt = null;
  });
  cv.addEventListener('pointerleave', () => { last = null; });
  cv.addEventListener('pointercancel', () => { last = null; downAt = null; });
}

/* ---------- Observateurs ---------- */
const ro = new ResizeObserver((entries) => {
  for (const en of entries) { const sc = scenes.find((s) => s.canvas === en.target); if (sc) size(sc); }
});
const nearIO = new IntersectionObserver((entries) => {
  for (const en of entries) {
    const sc = scenes.find((s) => s.el === en.target); if (!sc) continue;
    sc.near = en.isIntersecting;
    if (sc.near) ensure(sc); else release(sc);
  }
}, { rootMargin: '110% 0px 110% 0px' });
const visIO = new IntersectionObserver((entries) => {
  for (const en of entries) {
    const sc = scenes.find((s) => s.el === en.target); if (!sc) continue;
    sc.visible = en.isIntersecting;
    if (sc.visible) setActive(sc.id);
  }
}, { threshold: 0.35 });

const dots = [...document.querySelectorAll('.dots a')];
function setActive(id) { dots.forEach((d) => d.classList.toggle('on', d.hash === '#' + id)); }

// La coda n'a pas de simulation : on l'observe à part pour la navigation
const fin = document.getElementById('fin');
if (fin) new IntersectionObserver(([e]) => {
  if (e.isIntersecting) setActive('fin');
  else { const v = scenes.find((s) => s.visible); if (v) setActive(v.id); }
}, { threshold: 0.2 }).observe(fin);

for (const sc of scenes) {
  wireControls(sc);
  bindPointer(sc);
  ro.observe(sc.canvas);
  nearIO.observe(sc.el);
  visIO.observe(sc.el);
  if (coarse) sc.el.classList.add('coarse');
}

/* ---------- Boucle ---------- */
let prev = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - prev) / 1000); prev = now;
  for (const sc of scenes) {
    if (!sc.inst || !sc.visible || document.hidden) continue;
    const n = sc.inst.frame(dt, now / 1000) || 0;
    pixels += n; pixWindow += n;
    if (sc.first) { sc.first = false; sc.el.classList.add('live'); }
    // Qualité adaptative : on vise ~60 i/s, on accepte 40
    const frameMs = Math.min(250, (now - (sc.lastNow || now)) || 16); sc.lastNow = now;
    sc.ema = sc.ema * 0.92 + frameMs * 0.08;
    if (sc.ema > 26) { if (++sc.slow > 40 && sc.q > 0.4) { sc.q = Math.max(0.4, sc.q * 0.85); sc.slow = 0; size(sc); } } else sc.slow = 0;
    if (sc.ema < 17.5 && sc.q < (sc.inst.quality ?? 1)) { if (++sc.fast > 180) { sc.q = Math.min(sc.inst.quality ?? 1, sc.q * 1.1); sc.fast = 0; size(sc); } } else sc.fast = 0;
    if (sc.info && now - (sc.infoAt || 0) > 500) {
      sc.infoAt = now;
      const extra = sc.inst.info?.() || '';
      sc.info.textContent = `${sc.canvas.width}×${sc.canvas.height} · ${Math.round(1000 / sc.ema)} i/s${extra ? ' · ' + extra : ''}`;
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

/* ---------- Clavier : j / k = scène suivante / précédente ---------- */
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, button, textarea')) return;
  if (e.key === 'j' || e.key === 'k') {
    const i = Math.max(0, dots.findIndex((d) => d.classList.contains('on')));
    const d = dots[Math.max(0, Math.min(dots.length - 1, i + (e.key === 'j' ? 1 : -1)))];
    document.querySelector(d.hash)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
  }
});
