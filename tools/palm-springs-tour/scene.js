// Palm Springs community tour: procedural 3D scene driven entirely by frame number.
// Layout is decoded from the developer's scale model (see README.md).
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const Q = new URLSearchParams(location.search);
const VERSION = +(Q.get('v') || 1), SCALE = +(Q.get('s') || 1), SHOW_UI = Q.get('ui') !== '0';
const DBG = Q.get('cam') ? Q.get('cam').split(',').map(Number) : null, DBGH = Q.get('hour') ? +Q.get('hour') : null;
const W = Math.round(1080 * SCALE), H = Math.round(1920 * SCALE), FPS = 30, DUR = 60;

// ---------- utilities ----------
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = mulberry(20261115);
const rr = (a, b) => a + (b - a) * rnd();
const pick = a => a[Math.floor(rnd() * a.length)];
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const Y = new THREE.Vector3(0, 1, 0);
const C = h => new THREE.Color(h);
const ni = g => g.index ? g.toNonIndexed() : g;

function paint(g, col, shade) {
  const c = C(col), p = g.attributes.position, a = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const k = shade ? shade(p.getX(i), p.getY(i), p.getZ(i)) : 1; a[i * 3] = c.r * k; a[i * 3 + 1] = c.g * k; a[i * 3 + 2] = c.b * k; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}
function cbox(w, h, d, x, y, z, col, ry = 0) { const g = ni(new THREE.BoxGeometry(w, h, d)); if (ry) g.rotateY(ry); g.translate(x, y, z); return paint(g, col); }
function M(x, y, z, ry = 0, sx = 1, sy = sx, sz = sx) { return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(Y, ry), new THREE.Vector3(sx, sy, sz)); }

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}
function speckle(g, w, h, base, n, cols, max = 3) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; g.globalAlpha = .06 + .12 * rnd(); const r = 1 + rnd() * max; g.fillRect(rnd() * w, rnd() * h, r, r); }
  g.globalAlpha = 1;
}

// ---------- renderer ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.setSize(W, H, false);
canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xcfd8e0, 0.00016);
const camera = new THREE.PerspectiveCamera(74, W / H, 2, 30000);

// tiled instancing so frustum culling can drop most of the community on low shots
const TILE = 320;
function instTiled(geo, mat, mats, colors, { cast = true, recv = true, depthMat } = {}) {
  const b = new Map();
  mats.forEach((m, i) => { const e = m.elements, k = Math.floor(e[12] / TILE) + ':' + Math.floor(e[14] / TILE); if (!b.has(k)) b.set(k, []); b.get(k).push(i); });
  const out = [];
  for (const idx of b.values()) {
    const im = new THREE.InstancedMesh(geo, mat, idx.length);
    idx.forEach((i, j) => { im.setMatrixAt(j, mats[i]); if (colors) im.setColorAt(j, colors[i]); });
    im.castShadow = cast; im.receiveShadow = recv; if (depthMat) im.customDepthMaterial = depthMat;
    im.computeBoundingSphere(); scene.add(im); out.push(im);
  }
  return out;
}

// ---------- layout (metres; x east, z south) ----------
const OUT = { hx: 760, hz: 560, r: 160 };            // outer loop boulevard centreline
const LOOP = { cx: 330, rx: 270, rz: 360 };          // two inner loops at x = -cx and +cx
const HWY_Z = 722, METRO_Z = 772, ART_X = -905;
const spineZ = x => 34 * Math.sin(x / 170) + 12 * Math.sin(x / 60 + 1);
const sdOuter = (x, z) => { const qx = Math.abs(x) - (OUT.hx - OUT.r), qz = Math.abs(z) - (OUT.hz - OUT.r); return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - OUT.r; };
const ell = (x, z) => Math.min(Math.hypot((x - LOOP.cx) / LOOP.rx, z / LOOP.rz), Math.hypot((x + LOOP.cx) / LOOP.rx, z / LOOP.rz));
const inPark = (x, z, m = 0) => Math.abs(x) < 592 && Math.abs(z - spineZ(x)) < 38 + m;
const PADS = [
  { x: 0, z: 0, w: 130, d: 150 },        // clubhouse + lagoon
  { x: -112, z: 300, w: 84, d: 84 },     // mosque
  { x: 100, z: 300, w: 110, d: 84 },     // town centre
  { x: -104, z: -300, w: 100, d: 80 },   // community centre
  { x: 98, z: -300, w: 96, d: 120 },     // pitch + courts
];
const inPad = (x, z, m = 0) => PADS.some(p => Math.abs(x - p.x) < p.w / 2 + m && Math.abs(z - p.z) < p.d / 2 + m);
const inAvenue = (x, z, m = 0) => Math.abs(x) < 24 + m && Math.abs(z) > 60;

class Poly {
  constructor(pts, closed = false) {
    this.p = pts; this.closed = closed; this.cum = [0];
    const n = pts.length, segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) { const a = pts[i], b = pts[(i + 1) % n]; this.cum.push(this.cum[i] + Math.hypot(b.x - a.x, b.z - a.z)); }
    this.len = this.cum[segs];
  }
  at(s) {
    const n = this.p.length;
    s = this.closed ? ((s % this.len) + this.len) % this.len : clamp(s, 0, this.len - 1e-4);
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (this.cum[mid] <= s) lo = mid; else hi = mid; }
    const a = this.p[lo], b = this.p[(lo + 1) % n], f = (s - this.cum[lo]) / (this.cum[lo + 1] - this.cum[lo] || 1);
    const L = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: lerp(a.x, b.x, f), y: lerp(a.y || 0, b.y || 0, f), z: lerp(a.z, b.z, f), tx: (b.x - a.x) / L, tz: (b.z - a.z) / L };
  }
  every(d, cb, s0 = 0) { let i = 0; for (let s = s0; s < this.len - (this.closed ? d * .5 : 0); s += d) cb(this.at(s), i++); }
}
const V = (x, z, y = 0) => ({ x, y, z });
function roundedRect(hx, hz, r, step = 6) {
  const pts = [], arc = (cx, cz, a0) => { for (let a = 0; a < Math.PI / 2; a += step / r) pts.push(V(cx + r * Math.cos(a0 + a), cz + r * Math.sin(a0 + a))); };
  const seg = (x1, z1, x2, z2) => { const L = Math.hypot(x2 - x1, z2 - z1), n = Math.ceil(L / step); for (let i = 0; i < n; i++) pts.push(V(lerp(x1, x2, i / n), lerp(z1, z2, i / n))); };
  seg(-hx + r, hz, hx - r, hz); arc(hx - r, hz - r, Math.PI / 2 - Math.PI / 2 + Math.PI / 2 - Math.PI / 2 + Math.PI / 2 * 1 - Math.PI / 2 + Math.PI / 2);
  pts.length = 0; // build explicitly, clockwise seen from above (east along south edge first)
  seg(-hx + r, hz, hx - r, hz);
  for (let a = Math.PI / 2; a > 0; a -= step / r) pts.push(V(hx - r + r * Math.cos(a), hz - r + r * Math.sin(a)));
  seg(hx, hz - r, hx, -hz + r);
  for (let a = 0; a > -Math.PI / 2; a -= step / r) pts.push(V(hx - r + r * Math.cos(a), -hz + r + r * Math.sin(a)));
  seg(hx - r, -hz, -hx + r, -hz);
  for (let a = -Math.PI / 2; a > -Math.PI; a -= step / r) pts.push(V(-hx + r + r * Math.cos(a), -hz + r + r * Math.sin(a)));
  seg(-hx, -hz + r, -hx, hz - r);
  for (let a = Math.PI; a > Math.PI / 2; a -= step / r) pts.push(V(-hx + r + r * Math.cos(a), hz - r + r * Math.sin(a)));
  return pts;
}
const ellipsePts = (cx, rx, rz, n = 240) => Array.from({ length: n }, (_, i) => V(cx + rx * Math.cos(i / n * Math.PI * 2), rz * Math.sin(i / n * Math.PI * 2)));
const linePts = (x1, z1, x2, z2, step = 8, y1 = 0, y2 = 0) => { const n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / step)); return Array.from({ length: n + 1 }, (_, i) => V(lerp(x1, x2, i / n), lerp(z1, z2, i / n), lerp(y1, y2, i / n))); };
function offsetPts(pts, off, closed) {
  const n = pts.length;
  return pts.map((p, i) => { const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)]; const L = Math.hypot(b.x - a.x, b.z - a.z) || 1; return V(p.x - (b.z - a.z) / L * off, p.z + (b.x - a.x) / L * off, p.y); });
}

function ribbon(pts, width, y, mat, { closed = false, vrep = 12, recv = true, cast = false } = {}) {
  const n = pts.length, cnt = closed ? n + 1 : n, pos = [], uv = [], nor = [], idx = []; let L = 0;
  for (let i = 0; i < cnt; i++) {
    const p = pts[i % n], a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const l = Math.hypot(b.x - a.x, b.z - a.z) || 1, nx = -(b.z - a.z) / l, nz = (b.x - a.x) / l, yy = y + (p.y || 0);
    pos.push(p.x + nx * width / 2, yy, p.z + nz * width / 2, p.x - nx * width / 2, yy, p.z - nz * width / 2);
    uv.push(1, L / vrep, 0, L / vrep); nor.push(0, 1, 0, 0, 1, 0);
    const q = pts[(i + 1) % n]; L += Math.hypot(q.x - p.x, q.z - p.z);
    if (i < cnt - 1) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  const m = new THREE.Mesh(g, mat); m.receiveShadow = recv; m.castShadow = cast; scene.add(m); return m;
}

// ---------- textures & materials ----------
function roadTex(widthM, { lines = [], median, base = '#4b4e53', lightKerb = false }) {
  return canvasTex(512, 512, (g, w, h) => {
    const px = w / widthM;
    speckle(g, w, h, base, 9000, ['#2f3236', '#6b6e73', '#3b3d41', '#7c7f84'], 2);
    g.globalAlpha = .07; g.fillStyle = '#17181a'; for (const l of lines.filter(l => l.dash)) { g.fillRect((l.x - 2.3) * px, 0, 1.0 * px, h); g.fillRect((l.x + 1.3) * px, 0, 1.0 * px, h); } g.globalAlpha = 1;
    if (median) { g.fillStyle = '#c9c4b8'; g.fillRect(median[0] * px, 0, (median[1] - median[0]) * px, h); g.save(); g.beginPath(); g.rect((median[0] + .35) * px, 0, (median[1] - median[0] - .7) * px, h); g.clip(); speckle(g, w, h, median[2] || '#4d7a36', 5000, ['#3c6a2a', '#6a9440', '#2f5a24', '#7fa24c'], 3); g.restore(); }
    if (lightKerb) { g.fillStyle = '#cfcabf'; g.fillRect(0, 0, .3 * px, h); g.fillRect(w - .3 * px, 0, .3 * px, h); }
    for (const l of lines) { g.fillStyle = l.c || '#f3f1ea'; const lw = Math.max(2, (l.w || .16) * px); if (l.dash) g.fillRect(l.x * px - lw / 2, 0, lw, h * .28); else g.fillRect(l.x * px - lw / 2, 0, lw, h); }
  });
}
const YEL = '#e6b63a';
const texBlvd = roadTex(22, { median: [8, 14], lines: [{ x: 1.1 }, { x: 20.9 }, { x: 7.6, c: YEL }, { x: 14.4, c: YEL }, { x: 4.5, dash: 1 }, { x: 17.5, dash: 1 }] });
const texHwy = roadTex(44, { median: [20.6, 23.4, '#a9a7a0'], lines: [{ x: 2 }, { x: 42 }, { x: 20.2, c: YEL }, { x: 23.8, c: YEL }, ...[1, 2, 3, 4].flatMap(k => [{ x: 2 + 3.64 * k, dash: 1 }, { x: 42 - 3.64 * k, dash: 1 }])] });
const texArt = roadTex(30, { median: [13.5, 16.5], lines: [{ x: 1 }, { x: 29 }, { x: 13.1, c: YEL }, { x: 16.9, c: YEL }, { x: 5.2, dash: 1 }, { x: 9.2, dash: 1 }, { x: 20.8, dash: 1 }, { x: 24.8, dash: 1 }] });
const texStreet = roadTex(7, { base: '#6f7175', lightKerb: true, lines: [] });
const texRbt = roadTex(10, { lines: [{ x: .5 }, { x: 9.5 }, { x: 5, dash: 1 }] });
const texGrass = canvasTex(512, 512, (g, w, h) => { speckle(g, w, h, '#4f7d37', 22000, ['#3f6d2c', '#6a9645', '#35602a', '#7da650', '#58853a'], 5); });
texGrass.repeat.set(1 / 28, 1 / 28);
const texSand = canvasTex(512, 512, (g, w, h) => { speckle(g, w, h, '#c9b592', 16000, ['#b9a47f', '#d8c6a4', '#a89572', '#cdbb9a'], 7); });
texSand.repeat.set(1 / 60, 1 / 60);
const texPave = canvasTex(256, 256, (g, w, h) => { speckle(g, w, h, '#d6cdbd', 3000, ['#c4baa8', '#e2dacb', '#b9b09f'], 3); g.strokeStyle = 'rgba(120,110,95,.35)'; g.lineWidth = 1; for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.stroke(); } });
const texFoliage = canvasTex(256, 256, (g, w, h) => { speckle(g, w, h, '#ffffff', 5000, ['#9fb58a', '#d7e6c2', '#6f8f5a', '#b6cc9a', '#4f6f43'], 9); });
texFoliage.repeat.set(3, 3);
const texFrond = canvasTex(256, 512, (g, w, h) => {
  g.clearRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(0, 0, 26, 26); g.strokeStyle = '#fff'; g.lineCap = 'round';
  g.lineWidth = 7; g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2, 6); g.stroke();
  for (let i = 0; i < 46; i++) { const y = h - 20 - i * (h - 40) / 46, len = (w / 2 - 8) * Math.sin(Math.PI * (.12 + .88 * i / 46)) ** .7; g.lineWidth = 5.5; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w / 2 + s * len, y - 26 - 10 * rnd()); g.stroke(); } }
});
texFrond.wrapS = texFrond.wrapT = THREE.ClampToEdgeWrapping;
const texFacade = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#efece6'; g.fillRect(0, 0, w, h); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { g.fillStyle = '#2a3440'; g.fillRect(c * 64 + 9, r * 64 + 14, 46, 34); g.fillStyle = '#d9d4ca'; g.fillRect(c * 64 + 5, r * 64 + 50, 54, 5); } });
const texFacadeE = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (rnd() < .55) { g.fillStyle = pick(['#ffd9a0', '#ffe7c0', '#ffc98a']); g.fillRect(c * 64 + 9, r * 64 + 14, 46, 34); } });
const texGlow = canvasTex(128, 128, (g, w, h) => { const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
const texPitch = canvasTex(256, 512, (g, w, h) => { for (let i = 0; i < 10; i++) { g.fillStyle = i % 2 ? '#3f8a3a' : '#4a9a43'; g.fillRect(0, i * h / 10, w, h / 10); } g.strokeStyle = '#f4f4f0'; g.lineWidth = 3; g.strokeRect(10, 10, w - 20, h - 20); g.beginPath(); g.moveTo(10, h / 2); g.lineTo(w - 10, h / 2); g.stroke(); g.beginPath(); g.arc(w / 2, h / 2, 36, 0, 7); g.stroke(); g.strokeRect(w / 2 - 60, 10, 120, 60); g.strokeRect(w / 2 - 60, h - 70, 120, 60); });
const texZebra = canvasTex(64, 256, (g, w, h) => { g.clearRect(0, 0, w, h); g.fillStyle = '#f3f1ea'; for (let i = 0; i < 8; i++) g.fillRect(4, i * 32 + 6, w - 8, 18); });
function waterNormal() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'), im = g.createImageData(S, S);
  const waves = Array.from({ length: 14 }, () => ({ kx: Math.round(rr(-7, 7)), ky: Math.round(rr(-7, 7)), ph: rr(0, 6.28), a: rr(.4, 1) })).filter(w => w.kx || w.ky);
  const hgt = (x, y) => waves.reduce((s, w) => s + w.a * Math.sin(2 * Math.PI * (w.kx * x + w.ky * y) / S + w.ph) / Math.hypot(w.kx, w.ky), 0);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const dx = (hgt(x + 1, y) - hgt(x - 1, y)) * 9, dy = (hgt(x, y + 1) - hgt(x, y - 1)) * 9, l = Math.hypot(dx, dy, 1), i = (y * S + x) * 4; im.data[i] = 128 - dx / l * 127; im.data[i + 1] = 128 - dy / l * 127; im.data[i + 2] = 128 + 127 / l; im.data[i + 3] = 255; }
  g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1 / 9, 1 / 9); return t;
}
const texWaterN = waterNormal();

const std = o => new THREE.MeshStandardMaterial({ roughness: .9, metalness: 0, ...o });
const mat = {
  sand: std({ map: texSand }), grass: std({ map: texGrass }),
  blvd: std({ map: texBlvd, roughness: .82 }), hwy: std({ map: texHwy, roughness: .82 }), art: std({ map: texArt, roughness: .82 }), street: std({ map: texStreet, roughness: .88 }), rbt: std({ map: texRbt }),
  walk: std({ map: texPave, color: 0xf2ebdd }), track: std({ color: 0xb4614a, roughness: .95 }), path: std({ map: texPave, color: 0xe9dcc2 }),
  house: std({ vertexColors: true, roughness: .78 }),
  glass: std({ color: 0x27323d, roughness: .08, metalness: .55, envMapIntensity: 1.4 }),
  glassLit: std({ color: 0x27323d, roughness: .08, metalness: .55, envMapIntensity: 1.4, emissive: 0xffc27a, emissiveIntensity: 0 }),
  tree: std({ vertexColors: true, map: texFoliage, roughness: .95 }),
  treeLit: std({ vertexColors: true, map: texFoliage, roughness: .95, emissive: 0x9aa520, emissiveIntensity: 0 }),
  palm: std({ vertexColors: true, map: texFrond, alphaTest: .45, side: THREE.DoubleSide, roughness: .85 }),
  palmLit: std({ vertexColors: true, map: texFrond, alphaTest: .45, side: THREE.DoubleSide, roughness: .85, emissive: 0xff8a1e, emissiveIntensity: 0 }),
  palmBlvd: std({ vertexColors: true, map: texFrond, alphaTest: .45, side: THREE.DoubleSide, roughness: .85, emissive: 0xb8b030, emissiveIntensity: 0 }),
  water: std({ color: 0x25b9c6, roughness: .05, metalness: .05, normalMap: texWaterN, normalScale: new THREE.Vector2(.45, .45), envMapIntensity: 1.25, emissive: 0x16c4d4, emissiveIntensity: 0 }),
  sea: std({ color: 0x2a6f9a, roughness: .22, metalness: .1, normalMap: texWaterN, normalScale: new THREE.Vector2(.25, .25) }),
  v: std({ vertexColors: true, roughness: .8 }),
  pole: std({ color: 0x6a6d70, roughness: .5, metalness: .6 }),
  lamp: std({ color: 0xfff3d6, emissive: 0xffd28a, emissiveIntensity: 0 }),
  pool: new THREE.MeshBasicMaterial({ map: texGlow, color: 0xffd08a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  poolAmber: new THREE.MeshBasicMaterial({ map: texGlow, color: 0xff8a2a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }),
  facade: std({ map: texFacade, emissiveMap: texFacadeE, emissive: 0xffffff, emissiveIntensity: 0, roughness: .7 }),
  carLights: new THREE.MeshBasicMaterial({ vertexColors: true }),
};
const palmDepth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: texFrond, alphaTest: .45 });

// ---------- ground ----------
{
  const g = new THREE.PlaneGeometry(40000, 40000).rotateX(-Math.PI / 2); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 40000, uv.getY(i) * 40000);
  const m = new THREE.Mesh(g, mat.sand); m.receiveShadow = true; scene.add(m);
  // site lawn: everything inside the green belt
  const sh = new THREE.Shape(roundedRect(OUT.hx + 105, OUT.hz + 105, OUT.r + 105, 14).map(p => new THREE.Vector2(p.x, -p.z)));
  const sg = new THREE.ShapeGeometry(sh).rotateX(-Math.PI / 2); const lawn = new THREE.Mesh(sg, mat.grass); lawn.position.y = .12; lawn.receiveShadow = true; scene.add(lawn);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(40000, 14000).rotateX(-Math.PI / 2), mat.sea); sea.position.set(0, .5, -9300); scene.add(sea);
  const uv2 = sea.geometry.attributes.uv; for (let i = 0; i < uv2.count; i++) uv2.setXY(i, uv2.getX(i) * 40000, uv2.getY(i) * 14000);
  // Palm Jebel Ali silhouette offshore
  const fr = []; for (let i = -4; i <= 4; i++) { const a = i * .3; fr.push(cbox(110, 2.4, 1500, -1500 + Math.sin(a) * 900, 1, -3900 - Math.cos(a) * 900, 0xd2c09c, -a)); }
  fr.push(cbox(260, 2.4, 1500, -1500, 1, -2900, 0xd2c09c));
  const pj = new THREE.Mesh(mergeGeometries(fr), mat.v); scene.add(pj);
}

// ---------- roads ----------
const outerPts = roundedRect(OUT.hx, OUT.hz, OUT.r);
const loopE = ellipsePts(LOOP.cx, LOOP.rx, LOOP.rz), loopW = ellipsePts(-LOOP.cx, LOOP.rx, LOOP.rz);
const polyOuter = new Poly(outerPts, true), polyE = new Poly(loopE, true), polyW = new Poly(loopW, true);
const hwyPts = linePts(-9000, HWY_Z, 9000, HWY_Z, 200), polyHwy = new Poly(hwyPts);
const artPts = [...linePts(ART_X, -6000, ART_X, 560, 60), ...[590, 620, 650, 680, 722, 764, 794, 824, 854].map((z, i) => V(ART_X, z, [1, 3.4, 6, 7.6, 8.2, 7.6, 6, 3.4, 1][i])), ...linePts(ART_X, 884, ART_X, 6000, 60)];
ribbon(hwyPts, 44, .26, mat.hwy, {});
ribbon(artPts, 30, .30, mat.art, { cast: true });
ribbon(outerPts, 22, .32, mat.blvd, { closed: true });
ribbon(loopE, 22, .36, mat.blvd, { closed: true }); ribbon(loopW, 22, .36, mat.blvd, { closed: true });
const aveS = linePts(0, 548, 0, 78), aveN = linePts(0, -548, 0, -78);
ribbon(aveS, 22, .40, mat.blvd, {}); ribbon(aveN, 22, .40, mat.blvd, {});
ribbon(linePts(0, 572, 0, 700), 22, .34, mat.blvd, {});
const rbt = Array.from({ length: 48 }, (_, i) => V(22 * Math.cos(i / 48 * 6.283), 628 + 22 * Math.sin(i / 48 * 6.283)));
ribbon(rbt, 10, .44, mat.rbt, { closed: true, vrep: 12 });
// interchange ramps (SW corner) and east connector
ribbon(Array.from({ length: 30 }, (_, i) => { const a = Math.PI + i / 29 * Math.PI / 2; return V(ART_X + 150 + 150 * Math.cos(a), HWY_Z - 26 - 150 - 150 * Math.sin(a) + 150); }), 8, .28, mat.street, {});
ribbon(Array.from({ length: 30 }, (_, i) => { const a = Math.PI / 2 + i / 29 * Math.PI / 2; return V(ART_X - 150 - 150 * Math.cos(a) , HWY_Z + 26 + 150 * Math.sin(a)); }), 8, .28, mat.street, {});
for (const p of [[-420], [420]]) ribbon(linePts(p[0], 572, p[0], 700), 8, .3, mat.street, {});
// sidewalks, cycle track, park path
for (const [pts, cl] of [[outerPts, true], [loopE, true], [loopW, true]]) { ribbon(offsetPts(pts, 13.2, cl), 2.6, .34, mat.walk, { closed: cl, vrep: 3 }); ribbon(offsetPts(pts, -13.2, cl), 2.6, .34, mat.walk, { closed: cl, vrep: 3 }); }
ribbon(offsetPts(outerPts, 17.6, true), 3, .33, mat.track, { closed: true });
for (const a of [aveS, aveN]) { ribbon(offsetPts(a, 13.2), 2.6, .42, mat.walk, { vrep: 3 }); ribbon(offsetPts(a, -13.2), 2.6, .42, mat.walk, { vrep: 3 }); }
const pathZ = x => spineZ(x) + 11 * Math.sin(x / 42);
const parkPts = Array.from({ length: 290 }, (_, i) => { const x = -580 + i * 4; return V(x, pathZ(x)); });
const polyPark = new Poly(parkPts);
ribbon(parkPts, 3.6, .42, mat.path, { vrep: 3 });
ribbon(parkPts.map(p => V(p.x, p.z + 5.2)), 2.2, .41, mat.track, {});
// zebra crossings where the park path meets the loops, and on the avenues
const matZebra = std({ map: texZebra, transparent: true, alphaTest: .3 });
function zebra(x, z, ry, len = 22) { const m = new THREE.Mesh(new THREE.PlaneGeometry(4, len).rotateX(-Math.PI / 2), matZebra); m.geometry.attributes.uv.array.forEach((v, i, a) => { if (i % 2) a[i] = v * len / 8; }); m.rotation.y = ry; m.position.set(x, .47, z); m.receiveShadow = true; scene.add(m); }
for (const x of [-600, -60, 60, 600]) zebra(x, pathZ(x), Math.PI / 2 + (Math.abs(x) > 300 ? 0 : 0));
zebra(0, 440, Math.PI / 2); zebra(0, -440, Math.PI / 2); zebra(133, 546, 0, 8);

// ---------- houses ----------
const WALLS = [0xf4f1ea, 0xefe9dd, 0xf7f5f0, 0xe9e3d6];
function townhouseGeo() {
  const g = [], gl = [];
  g.push(cbox(6.8, 6.6, 10, 0, 3.3, 0, 0xffffff));
  g.push(cbox(6.8, 3.3, 1.25, 0, 4.95, 5.6, 0xffffff));                 // cantilevered upper floor
  g.push(cbox(7.02, 7.3, 11.6, 0, 3.65, .3, 0xd9ccb4).scale(1, 1, 1));  // stone party fins (thin shell hidden inside)
  g.pop(); g.push(cbox(.24, 7.3, 11.6, -3.4, 3.65, .3, 0xcdbfa6), cbox(.24, 7.3, 11.6, 3.4, 3.65, .3, 0xcdbfa6));
  g.push(cbox(6.6, .3, 9.8, 0, 6.75, 0, 0xb8b4ad));                      // roof deck
  g.push(cbox(3.2, 2.3, 3.6, 1.5, 7.9, -2.6, 0xe6dccb));                // roof pavilion
  g.push(cbox(3.0, 2.5, .12, -1.6, 1.25, 5.02, 0x7a5a3c));              // timber garage door
  g.push(cbox(1.1, 2.3, .12, 1.25, 1.15, 5.02, 0x3b2c22));              // front door
  g.push(cbox(6.6, .16, 1.3, 0, 3.2, 5.6, 0x8a6a48));                   // timber soffit
  g.push(cbox(2.6, .12, 2.6, -1.5, 6.96, 2.2, 0x6f6a62));               // roof terrace pergola
  gl.push(cbox(4.6, 1.9, .1, 0, 5.0, 6.24, 0xffffff), cbox(1.5, 2.0, .1, 2.55, 1.3, 5.03, 0xffffff), cbox(5.2, 2.1, .1, 0, 1.4, -5.03, 0xffffff), cbox(5.2, 1.7, .1, 0, 4.9, -5.03, 0xffffff), cbox(2.4, 1.6, .1, 1.5, 8.0, -4.42, 0xffffff));
  return [mergeGeometries(g), mergeGeometries(gl)];
}
function villaGeo() {
  const g = [], gl = [];
  g.push(cbox(12, 7, 11, -2, 3.5, 0, 0xffffff));
  g.push(cbox(7, 3.8, 9, 6.4, 1.9, 1.5, 0xffffff));                      // single-storey wing
  g.push(cbox(7.4, .3, 9.4, 6.4, 3.95, 1.5, 0xc9b79a));
  const roof = ni(new THREE.ConeGeometry(9.2, 2.6, 4, 1)); roof.rotateY(Math.PI / 4); roof.scale(1, 1, .92); roof.translate(-2, 8.3, 0); g.push(paint(roof, 0xb0623c));
  g.push(cbox(12.8, .3, 11.8, -2, 7.05, 0, 0xd8c4a4));                   // eaves
  g.push(cbox(4.2, 2.6, .14, 6.4, 1.3, 6.02, 0x7a5a3c));                 // garage
  g.push(cbox(1.3, 2.5, .14, 0.6, 1.25, 5.52, 0x3b2c22));
  g.push(cbox(4.4, 3.2, 3, -5, 1.6, 6.6, 0xe7d9bf));                     // entrance portico
  gl.push(cbox(3.4, 2.2, .1, -5, 1.5, 8.12, 0xffffff), cbox(8.5, 1.8, .1, -2.4, 5.2, 5.53, 0xffffff), cbox(9, 2.2, .1, -2, 1.5, -5.53, 0xffffff), cbox(9, 1.8, .1, -2, 5.2, -5.53, 0xffffff), cbox(.1, 2, 5, 9.93, 1.6, 1.5, 0xffffff));
  return [mergeGeometries(g), mergeGeometries(gl)];
}
const th = { m: [], c: [], lit: [], dark: [], drive: [], cars: [], carCol: [] }, vl = { m: [], c: [], lit: [], dark: [], drive: [], pools: [] };
const trees = { m: [], c: [] }, treesLit = { m: [], c: [] }, palms = { m: [], c: [] }, palmsLit = { m: [], c: [] }, palmsBlvd = { m: [], c: [] }, shrubs = { m: [], c: [] };
const lampsHi = [], lampsLo = [], glows = [], glowsAmber = [];
const GREENS = [0x5d8a3c, 0x4c7a34, 0x6b9646, 0x3f6c30, 0x7a9c4e, 0x56803a];
const addTree = (set, x, z, s = rr(.8, 1.35)) => { set.m.push(M(x, 0, z, rr(0, 6.28), s, s * rr(.85, 1.2), s)); set.c.push(C(pick(GREENS))); };
const addPalm = (set, x, z, s = rr(.8, 1.15)) => { set.m.push(M(x, 0, z, rr(0, 6.28), s * rr(.9, 1.1), s, s * rr(.9, 1.1))); set.c.push(C(pick([0xffffff, 0xe8f0d8, 0xf4f0d0]))); };
const CARCOL = [0xf2f2f0, 0xf2f2f0, 0xd9dadc, 0x2a2c30, 0x8a8d92, 0x3a4a5e, 0x7a1f22, 0xe8e2d2];
const HERO = { x: 113.9, z: 505.3, doorX: 116.75, unitX: 115.5, rowZ: 497 };
const streetSegs = [], poolParks = [];
const blockOK = (x, z) => [[-21, -5.5], [21, -5.5], [-21, 5.5], [21, 5.5], [0, 0]].every(([dx, dz]) => { const px = x + dx, pz = z + dz; return sdOuter(px, pz) < -34 && ell(px, pz) > 1.105 && !inPark(px, pz, 12) && !inAvenue(px, pz) && !inPad(px, pz, 6); });
for (let k = -9; k <= 9; k++) for (let j = -15; j <= 14; j++) {
  const zs = 64 * k, xb = 56 * j + 49; let any = false;
  for (const side of [-1, 1]) {
    const zc = zs + side * 15; if (!blockOK(xb, zc)) continue; any = true;
    const ry = side < 0 ? 0 : Math.PI;
    if ((j * 7 + k * 13 + (side > 0 ? 3 : 0) + 700) % 13 === 0 && !(j === 1 && k === 8)) { poolParks.push({ x: xb, z: zc, ry }); continue; }
    for (let i = 0; i < 6; i++) {
      const ux = xb - 17.5 + 7 * i, hero = j === 1 && k === 8 && i === 4 && side < 0;
      th.m.push(M(ux, 0, zc, ry)); th.c.push(C(pick(WALLS)));
      (rnd() < .62 || hero ? th.lit : th.dark).push(M(ux, 0, zc, ry));
      const f = side < 0 ? 1 : -1;
      th.drive.push(M(ux - 1.6 * f, .2, zc + f * 8.3, 0, 3, 1, 6.6));
      if (rnd() < .42 && !hero) { th.cars.push(M(ux - 1.6 * f + rr(-.2, .2), .2, zc + f * rr(7.9, 8.6), ry + Math.PI)); th.carCol.push(C(pick(CARCOL))); }
      if (i % 2 === 0) addTree(trees, ux + 3.5 + rr(-.6, .6), zc + f * 10.4, rr(.55, .8));
      if (rnd() < .55) addTree(trees, ux + rr(-2, 2), zc - f * rr(8.5, 11), rr(.7, 1.1));
      if (rnd() < .3) { shrubs.m.push(M(ux + 2.6 * f, 0, zc + f * 6.6, 0, rr(.7, 1.1))); shrubs.c.push(C(pick([0xc8327a, 0xd9468a, 0xe0603a, 0x5d8a3c]))); }
    }
    lampsLo.push({ x: xb - 14, z: zs + side * 4.2 }, { x: xb + 14, z: zs - side * 4.2 });
  }
  if (any) { streetSegs.push(linePts(xb - 28, zs, xb + 28, zs, 28)); if ((j + 30) % 2 === 1) streetSegs.push(linePts(xb + 28, zs - 32, xb + 28, zs + 32, 32)); }
}
streetSegs.push(linePts(133, 505, 133, 550, 15));
for (const s of streetSegs) ribbon(s, 7, .28, mat.street, { vrep: 7 });
// villas along ring streets inside both loops
for (const cx of [-LOOP.cx, LOOP.cx]) {
  for (const s of [.36, .72]) { const pts = ellipsePts(cx, LOOP.rx * s, LOOP.rz * s, 120); ribbon(pts, 7, .28, mat.street, { closed: true, vrep: 7 }); new Poly(pts, true).every(34, p => { if (!inPark(p.x, p.z, 4) && !inPad(p.x, p.z, 4)) lampsLo.push({ x: p.x - p.tz * 4.4, z: p.z + p.tx * 4.4 }); }); }
  for (const a of [.5, 1.5].map(v => v * Math.PI)) ribbon(linePts(cx + LOOP.rx * .36 * Math.cos(a), LOOP.rz * .36 * Math.sin(a), cx + LOOP.rx * Math.cos(a), LOOP.rz * Math.sin(a)), 7, .29, mat.street, { vrep: 7 });
  for (const [s, dir] of [[.27, 1], [.45, -1], [.63, 1], [.81, -1]]) {
    const n = Math.floor(Math.PI * 2 * Math.hypot(LOOP.rx * s, LOOP.rz * s) / Math.SQRT2 / 25);
    for (let i = 0; i < n; i++) {
      const a = (i + .5) / n * Math.PI * 2, x = cx + LOOP.rx * s * Math.cos(a), z = LOOP.rz * s * Math.sin(a);
      if (inPark(x, z, 16) || inPad(x, z, 12) || (Math.abs(Math.cos(a)) * LOOP.rx * s < 13 && s > .4)) continue;
      let nx = Math.cos(a) * LOOP.rz, nz = Math.sin(a) * LOOP.rx; const l = Math.hypot(nx, nz); nx = nx / l * dir; nz = nz / l * dir;
      const ry = Math.atan2(nx, nz);
      vl.m.push(M(x, 0, z, ry)); vl.c.push(C(pick([0xf0e4cf, 0xe9dcc4, 0xf4ecdc, 0xe4d5ba])));
      (rnd() < .68 ? vl.lit : vl.dark).push(M(x, 0, z, ry));
      const rx = Math.cos(ry), rz = -Math.sin(ry); // local +x in world
      vl.drive.push(M(x + rx * 6.4 + nx * 9.4, .2, z + rz * 6.4 + nz * 9.4, ry, 4.4, 1, 7));
      if (rnd() < .5) { th.cars.push(M(x + rx * 6.4 + nx * 9.6, .2, z + rz * 6.4 + nz * 9.6, ry + Math.PI)); th.carCol.push(C(pick(CARCOL))); }
      if (rnd() < .6) vl.pools.push(M(x - rx * 2 - nx * 10.5, .3, z - rz * 2 - nz * 10.5, ry));
      addTree(trees, x - rx * 7 + nx * 9, z - rz * 7 + nz * 9, rr(.7, 1));
      if (rnd() < .7) addPalm(palms, x + rx * 8 - nx * 9, z + rz * 8 - nz * 9, rr(.6, .85));
      if (rnd() < .5) { shrubs.m.push(M(x - rx * 2 + nx * 8.6, 0, z - rz * 2 + nz * 8.6, 0, rr(.8, 1.2))); shrubs.c.push(C(pick([0xc8327a, 0xd9468a, 0xe0603a]))); }
    }
  }
}
{
  const [tg, tgl] = townhouseGeo(), [vg, vgl] = villaGeo();
  instTiled(tg, mat.house, th.m, th.c); instTiled(tgl, mat.glassLit, th.lit, null, { cast: false }); instTiled(tgl, mat.glass, th.dark, null, { cast: false });
  instTiled(vg, mat.house, vl.m, vl.c); instTiled(vgl, mat.glassLit, vl.lit, null, { cast: false }); instTiled(vgl, mat.glass, vl.dark, null, { cast: false });
  const dg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  instTiled(dg, mat.walk, [...th.drive, ...vl.drive], null, { cast: false });
  const pg = mergeGeometries([cbox(4.6, .12, 8.6, 0, 0, 0, 0xe8e0d0)]);
  instTiled(pg, mat.v, vl.pools, null, { cast: false });
  const wg = new THREE.PlaneGeometry(3.8, 7.8).rotateX(-Math.PI / 2).translate(0, .1, 0); wg.attributes.uv.array.forEach((v, i, a) => a[i] = v * 6);
  instTiled(wg, mat.water, vl.pools, null, { cast: false });
}

// ---------- vegetation ----------
function canopyGeo() {
  const g = [paint(ni(new THREE.CylinderGeometry(.22, .34, 3.4, 5)).translate(0, 1.7, 0), 0x5a4632)];
  for (const [x, y, z, r] of [[0, 5, 0, 2.7], [1.5, 4.2, .6, 2], [-1.3, 4.4, -.8, 2.1], [.2, 4.1, -1.6, 1.8]]) {
    const s = new THREE.IcosahedronGeometry(r, 1); const p = s.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 1 + .22 * Math.sin(p.getX(i) * 3.1 + p.getY(i) * 2.3) * Math.cos(p.getZ(i) * 2.7); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * .82, p.getZ(i) * k); }
    s.translate(x, y, z); g.push(paint(s, 0xffffff, (px, py) => clamp(.42 + (py - 2.4) / 5.2, .4, 1.08)));
  }
  return mergeGeometries(g);
}
function palmGeo() {
  const g = [], H0 = 9;
  const tr = ni(new THREE.CylinderGeometry(.2, .32, H0, 6, 4)); tr.translate(0, H0 / 2, 0); const tp = tr.attributes.position; for (let i = 0; i < tp.count; i++) { const y = tp.getY(i); tp.setX(i, tp.getX(i) + .5 * (y / H0) ** 2); } tr.attributes.uv.array.fill(.03); g.push(paint(tr, 0x6a5540));
  const head = ni(new THREE.SphereGeometry(.55, 6, 5)).translate(.5, H0, 0); head.attributes.uv.array.fill(.03); g.push(paint(head, 0x5a4a30));
  for (let i = 0; i < 17; i++) {
    const az = i / 17 * 6.283 + (i % 2) * .3, lift = i < 6 ? rr(.9, 1.25) : i < 12 ? rr(.35, .7) : rr(-.15, .2), len = rr(4.2, 5.4), seg = 5, w = 1.25;
    const pos = [], uv = [], idx = [];
    for (let s = 0; s <= seg; s++) { const u = s / seg, r = len * u, y = Math.sin(lift) * r - 2.6 * u * u * (1.2 - lift * .5), d = Math.cos(lift) * r; const ww = w * (.35 + .65 * Math.sin(Math.PI * (.1 + .9 * u)) ** .5); pos.push(d, y, -ww / 2, d, y, ww / 2); uv.push(0, u, 1, u); if (s < seg) { const k = s * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } }
    const f = new THREE.BufferGeometry(); f.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); f.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); f.setIndex(idx); f.computeVertexNormals();
    const fn = f.toNonIndexed(); fn.rotateY(az); fn.translate(.5, H0, 0); g.push(paint(fn, pick([0x6f8f45, 0x5f8240, 0x7b9a4e, 0x8a9a52])));
  }
  return mergeGeometries(g);
}
// boulevard planting, lights
function plantRoad(pts, closed, opts = {}) {
  const pl = new Poly(pts, closed);
  pl.every(13, (p, i) => { for (const s of [-1, 1]) { const o = 16.2 + (opts.wide ? 5 : 0); addTree(treesLit, p.x - p.tz * o * s + rr(-1, 1), p.z + p.tx * o * s + rr(-1, 1), rr(.9, 1.3)); } }, 4);
  pl.every(11, p => addPalm(palmsBlvd, p.x + rr(-.5, .5), p.z + rr(-.5, .5)), 2);
  pl.every(30, (p, i) => { const s = i % 2 ? 1 : -1; lampsHi.push({ x: p.x - p.tz * 11.6 * s, z: p.z + p.tx * 11.6 * s, ry: Math.atan2(-p.tz * s, p.tx * s) + Math.PI / 2, gx: p.x - p.tz * 6 * s, gz: p.z + p.tx * 6 * s }); }, 8);
}
plantRoad(outerPts, true, { wide: true }); plantRoad(loopE, true); plantRoad(loopW, true); plantRoad(aveS, false); plantRoad(aveN, false);
// green belt outside the outer boulevard
for (let i = 0; i < 1500; i++) { const x = rr(-880, 880), z = rr(-680, 680), d = sdOuter(x, z); if (d > 26 && d < 100 && !(Math.abs(x) < 16 && z > 0) && !(Math.abs(z - 628) < 36 && Math.abs(x) < 36)) (rnd() < .82 ? addTree(trees, x, z, rr(.8, 1.5)) : addPalm(palms, x, z)); }
// springs park: lagoons, palms, flowers
const lagoons = [];
for (let x = -520; x <= 520; x += 86) { if (Math.abs(Math.abs(x) - 60) < 30 || Math.abs(x) < 70) continue; const s = (Math.round(x / 86) % 2 ? 1 : -1); lagoons.push({ x: x + rr(-8, 8), z: pathZ(x) - s * rr(17, 20), rx: rr(15, 24), rz: rr(7, 10), seed: rr(0, 9) }); }
lagoons.push({ x: 0, z: -28, rx: 50, rz: 25, seed: 2.2, main: true });
const nearWater = (x, z, m = 3) => lagoons.some(l => Math.hypot((x - l.x) / (l.rx * 1.25 + m), (z - l.z) / (l.rz * 1.25 + m)) < 1);
for (let i = 0; i < 2600; i++) {
  const x = rr(-585, 585), z = spineZ(x) + rr(-36, 36);
  if (nearWater(x, z) || Math.abs(z - pathZ(x)) < 4 || Math.abs(z - pathZ(x) - 5.2) < 2.4 || Math.abs(Math.abs(x) - 60) < 14 || Math.abs(Math.abs(x) - 600) < 14 || (Math.abs(x) < 62 && Math.abs(z) < 70)) continue;
  const r = rnd();
  if (r < .2) addPalm(palmsLit, x, z, rr(.7, 1.1)); else if (r < .3) addTree(trees, x, z, rr(.7, 1.1)); else if (r < .55) { shrubs.m.push(M(x, 0, z, 0, rr(.6, 1.4))); shrubs.c.push(C(pick([0xc8327a, 0xd9468a, 0xe0603a, 0xf0d85a, 0x6b9646, 0x4c7a34, 0xb23a8a]))); }
  if (r < .2 && rnd() < .5) glowsAmber.push({ x, z, r: 9 });
}
parkPts.forEach((p, i) => { if (i % 6 === 0 && Math.abs(Math.abs(p.x) - 60) > 14 && Math.abs(Math.abs(p.x) - 600) > 14) { lampsLo.push({ x: p.x, z: p.z - 2.6, amber: true }); } });
{
  const bg = [], wg = [];
  for (const l of lagoons) {
    const mk = (k, y) => { const pts = Array.from({ length: 36 }, (_, i) => { const a = i / 36 * 6.283, r = 1 + .16 * Math.sin(2 * a + l.seed) + .09 * Math.sin(3 * a + l.seed * 2) + .05 * Math.sin(5 * a + l.seed * 3); return new THREE.Vector2(l.x + (l.rx * r + k) * Math.cos(a), -(l.z + (l.rz * r + k) * Math.sin(a))); }); return ni(new THREE.ShapeGeometry(new THREE.Shape(pts))).rotateX(-Math.PI / 2).translate(0, y, 0); };
    bg.push(mk(2.6, .34)); wg.push(mk(0, .44));
    glows.push({ x: l.x, z: l.z, r: l.rx * 1.5, c: 'aqua' });
    for (let i = 0; i < (l.main ? 16 : 5); i++) { const a = rr(0, 6.28); addPalm(palmsLit, l.x + (l.rx + 6) * Math.cos(a), l.z + (l.rz + 6) * Math.sin(a), rr(.75, 1.1)); }
  }
  const beach = new THREE.Mesh(mergeGeometries(bg), std({ color: 0xead9b8, roughness: 1 })); beach.receiveShadow = true; scene.add(beach);
  const water = new THREE.Mesh(mergeGeometries(wg), mat.water); water.receiveShadow = true; scene.add(water);
}
// cluster pool parks inside the townhouse neighbourhoods
{
  const deck = [], wat = [], stuff = [];
  for (const p of poolParks) {
    deck.push(ni(new THREE.PlaneGeometry(40, 20)).rotateX(-Math.PI / 2).translate(p.x, .2, p.z));
    const pts = Array.from({ length: 28 }, (_, i) => { const a = i / 28 * 6.283, r = 1 + .18 * Math.cos(2 * a); return new THREE.Vector2(p.x - 6 + 11 * r * Math.cos(a), -(p.z + 5.5 * r * Math.sin(a))); });
    wat.push(ni(new THREE.ShapeGeometry(new THREE.Shape(pts))).rotateX(-Math.PI / 2).translate(0, .3, 0));
    stuff.push(cbox(9, .3, 7, p.x + 13, 3.4, p.z, 0x6a5a48), ...[[-4, -3], [4, -3], [-4, 3], [4, 3]].map(([a, b]) => cbox(.3, 3.3, .3, p.x + 13 + a, 1.7, p.z + b, 0x4a4038)));
    for (let i = 0; i < 6; i++) { stuff.push(cbox(.8, .35, 2, p.x - 15 + i * 3.4, .45, p.z + 8, 0xfaf8f2)); if (i % 2 === 0) { const u = ni(new THREE.ConeGeometry(1.6, .6, 8)).translate(p.x - 13.4 + i * 3.4, 2.6, p.z + 8); stuff.push(paint(u, pick([0xf2ead8, 0xe07a4a, 0xf2ead8])), cbox(.08, 2.4, .08, p.x - 13.4 + i * 3.4, 1.3, p.z + 8, 0x777777)); } }
    for (let i = 0; i < 5; i++) addPalm(palmsLit, p.x + rr(-19, 19), p.z + pick([-9.4, 9.4]), rr(.6, .85));
    glows.push({ x: p.x - 6, z: p.z, r: 20, c: 'aqua' });
  }
  if (deck.length) { const d = new THREE.Mesh(mergeGeometries(deck), mat.walk); d.receiveShadow = true; scene.add(d); const w = new THREE.Mesh(mergeGeometries(wat), mat.water); scene.add(w); const s = new THREE.Mesh(mergeGeometries(stuff), mat.v); s.castShadow = true; scene.add(s); }
}

// ---------- amenities ----------
const amen = [], amenGlassLit = [];
// clubhouse south of the main lagoon
amen.push(cbox(74, 8.4, 20, 0, 4.2, 38, 0xf6f3ec), cbox(84, .6, 30, 0, 8.9, 35, 0xe9dfcc), cbox(30, 5, 14, -24, 11.6, 40, 0xf6f3ec), cbox(34, .5, 18, -24, 14.3, 40, 0xe9dfcc), cbox(120, .12, 18, 0, .3, 14, 0xe6dccb));
for (let i = -8; i <= 8; i++) amen.push(cbox(.5, 8.4, 1.6, i * 4.4, 4.2, 27.4, 0x8a6a48));
amenGlassLit.push(cbox(72, 6.4, .2, 0, 3.6, 27.9, 0xffffff), cbox(28, 3.6, .2, -24, 11.6, 32.9, 0xffffff));
for (let i = 0; i < 14; i++) { amen.push(cbox(.8, .35, 2, -30 + i * 4.6, .5, 6, 0xfaf8f2)); if (i % 2) { const u = ni(new THREE.ConeGeometry(1.7, .6, 8)).translate(-28 + i * 4.6, 2.7, 6); amen.push(paint(u, 0xf2ead8)); } }
// mosque
{ const x = -112, z = 300; amen.push(cbox(34, 9, 34, x, 4.5, z, 0xf7f4ee), cbox(40, .5, 40, x, .3, z, 0xe6dccb), cbox(12, 12, 12, x, 6, z, 0xf7f4ee));
  const dome = ni(new THREE.SphereGeometry(8, 20, 10, 0, 6.283, 0, Math.PI / 2)).translate(x, 12, z); amen.push(paint(dome, 0xefe6d2));
  const min = ni(new THREE.CylinderGeometry(1.3, 1.7, 30, 10)).translate(x + 19, 15, z + 19); amen.push(paint(min, 0xf7f4ee)); const cone = ni(new THREE.ConeGeometry(1.9, 5, 10)).translate(x + 19, 32.5, z + 19); amen.push(paint(cone, 0xcdb27a));
  amenGlassLit.push(cbox(.2, 5, 22, x + 17.05, 4, z, 0xffffff), cbox(22, 5, .2, x, 4, z - 17.05, 0xffffff)); }
// town centre: terracotta low-rise around a court
{ const x = 100, z = 300; for (const [dx, dz, w, d, h, c] of [[-36, -22, 28, 18, 11, 0xc98a6b], [0, -24, 30, 16, 14, 0xd49a78], [36, -22, 28, 18, 11, 0xbd7d60], [-38, 16, 24, 26, 11, 0xd49a78], [38, 16, 24, 26, 14, 0xc98a6b], [0, 24, 34, 14, 8, 0xe2b294]]) { amen.push(cbox(w, h, d, x + dx, h / 2, z + dz, c), cbox(w + .8, .4, d + .8, x + dx, h + .2, z + dz, 0xe9dccb)); amenGlassLit.push(cbox(w - 4, 2.6, d + .2, x + dx, 1.9, z + dz, 0xffffff), cbox(w + .2, 2.2, d - 5, x + dx, 6, z + dz, 0xffffff)); }
  amen.push(cbox(104, .12, 78, x, .25, z, 0xe6dccb)); }
// community centre / school + pitch + padel
{ const x = -104, z = -300; amen.push(cbox(70, 8, 18, x, 4, z - 22, 0xf3ece0), cbox(18, 8, 44, x - 30, 4, z + 6, 0xf3ece0), cbox(74, .5, 22, x, 8.2, z - 22, 0xd9c7a8), cbox(22, .5, 48, x - 30, 8.2, z + 6, 0xd9c7a8), cbox(96, .12, 76, x, .25, z, 0xe6dccb));
  amenGlassLit.push(cbox(64, 2.4, .2, x, 2.2, z - 12.9, 0xffffff), cbox(64, 2.2, .2, x, 5.8, z - 12.9, 0xffffff), cbox(.2, 2.4, 38, x - 20.9, 2.2, z + 6, 0xffffff)); }
{ const pm = new THREE.Mesh(new THREE.PlaneGeometry(62, 96).rotateX(-Math.PI / 2), std({ map: texPitch })); pm.position.set(84, .3, -300); pm.receiveShadow = true; scene.add(pm);
  for (const dz of [-30, 0, 30]) amen.push(cbox(11, .1, 21, 133, .3, -300 + dz, 0x2d6fb0), cbox(11.4, .1, .3, 133, .36, -300 + dz, 0xffffff));
  for (const [dx, dz] of [[-33, -50], [33, -50], [-33, 50], [33, 50]]) { amen.push(cbox(.4, 16, .4, 84 + dx, 8, -300 + dz, 0x8a8d90)); lampsHi.push({ x: 84 + dx, z: -300 + dz, flood: true, gx: 84 + dx * .45, gz: -300 + dz * .5 }); } }
// playgrounds in the park
const playgrounds = [{ x: -250, z: pathZ(-250) + 20 }, { x: 395, z: pathZ(395) - 22 }];
for (const p of playgrounds) {
  const pad = paint(ni(new THREE.CircleGeometry(13, 28)).rotateX(-Math.PI / 2).translate(p.x, .4, p.z), 0x2aa39a); amen.push(pad, paint(ni(new THREE.CircleGeometry(6, 20)).rotateX(-Math.PI / 2).translate(p.x + 3, .43, p.z - 2), 0xe58a3c));
  amen.push(cbox(3, .25, 3, p.x - 5, 2.4, p.z + 3, 0xd94a3a), ...[[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]].map(([a, b]) => cbox(.2, 2.4, .2, p.x - 5 + a, 1.2, p.z + 3 + b, 0xf2c230)));
  const slide = cbox(1, .15, 4.6, p.x - 5, 1.3, p.z + 6.6, 0x2a7fd9); amen.push(slide); amen.push(cbox(4.4, .2, .2, p.x + 5, 3, p.z + 5, 0xd94a3a), cbox(.2, 3, .2, p.x + 2.9, 1.5, p.z + 5, 0xd94a3a), cbox(.2, 3, .2, p.x + 7.1, 1.5, p.z + 5, 0xd94a3a), cbox(.5, .08, .3, p.x + 4.2, .9, p.z + 5, 0x222222), cbox(.5, .08, .3, p.x + 5.8, .9, p.z + 5, 0x222222));
  const dome = paint(ni(new THREE.TorusGeometry(2.4, .09, 6, 20, Math.PI)).translate(p.x + 4, .4, p.z - 5), 0xf2c230); amen.push(dome, paint(ni(new THREE.TorusGeometry(2.4, .09, 6, 20, Math.PI)).rotateY(Math.PI / 2).translate(p.x + 4, .4, p.z - 5), 0xf2c230));
}
// footbridges over the south boulevard, entrance fountain, metro, station
for (const x of [-300, 300]) { amen.push(cbox(5, .6, 34, x, 6.6, OUT.hz, 0xb5654a), cbox(.2, 1.1, 34, x - 2.4, 7.4, OUT.hz, 0xa25a42), cbox(.2, 1.1, 34, x + 2.4, 7.4, OUT.hz, 0xa25a42));
  for (const s of [-1, 1]) { const r = ni(new THREE.BoxGeometry(34, .5, 4)); r.rotateZ(s * .19); r.translate(x + s * 19.2 - s * 0, 3.4, OUT.hz + s * 19); amen.push(paint(r, 0xb5654a)); amen.push(cbox(1.2, 6.4, 1.2, x, 3.2, OUT.hz + s * 15.5, 0xc9c2b4)); } }
amen.push(paint(ni(new THREE.CylinderGeometry(15, 15, .5, 32)).translate(0, .45, 628), 0x4f7d37), paint(ni(new THREE.CylinderGeometry(6.5, 6.5, .9, 24)).translate(0, .7, 628), 0xe6dccb));
{ const f = new THREE.Mesh(new THREE.CircleGeometry(5.8, 24).rotateX(-Math.PI / 2), mat.water); f.position.set(0, 1.18, 628); scene.add(f); for (let i = 0; i < 6; i++) addPalm(palmsBlvd, 11 * Math.cos(i), 628 + 11 * Math.sin(i), .9); glows.push({ x: 0, z: 628, r: 14, c: 'aqua' }); }
amen.push(cbox(18000, 1.2, 9, 0, 10.4, METRO_Z, 0xc9c6bf));
{ const pil = []; for (let x = -3000; x <= 3000; x += 45) pil.push(M(x, 0, METRO_Z)); instTiled(cbox(2.2, 10, 2.2, 0, 5, 0, 0xc2bfb8), mat.v, pil); }
{ const st = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), std({ color: 0xb98450, metalness: .85, roughness: .32 })); st.scale.set(36, 9, 13); st.position.set(420, 14, METRO_Z); st.castShadow = true; scene.add(st);
  amen.push(cbox(4, .5, 86, 420, 8.4, METRO_Z - 43, 0xdedad2), cbox(2.4, 8, 2.4, 420, 4, 692, 0xdedad2)); }
// apartments (future phases) east of the outer boulevard
{ const ag = [], roofs = [];
  for (let r = 0; r < 9; r++) for (let c = 0; c < 3; c++) { const x = 850 + c * 78 + rr(-8, 8), z = -500 + r * 124 + rr(-14, 14), w = rr(34, 54), d = rr(22, 34), h = pick([18, 22, 26, 32, 40]) ; const b = new THREE.BoxGeometry(w, h, d); const uv = b.attributes.uv; for (let i = 0; i < uv.count; i++) { const face = Math.floor(i / 4); const hor = face < 2 ? d : w; if (face === 2 || face === 3) uv.setXY(i, 0.02, 0.02); else uv.setXY(i, uv.getX(i) * hor / 13, uv.getY(i) * h / 13); } b.translate(x, h / 2, z); ag.push(b); roofs.push(cbox(w - 6, .3, d - 6, x, h + .2, z, 0x7fa860)); for (let i = 0; i < 3; i++) addTree(trees, x + rr(-40, 40), z + pick([-1, 1]) * (d / 2 + rr(6, 20)), rr(.8, 1.3)); }
  const m = new THREE.Mesh(mergeGeometries(ag), mat.facade); m.castShadow = m.receiveShadow = true; scene.add(m); amen.push(...roofs);
  ribbon(linePts(815, -560, 815, 560, 40), 9, .29, mat.street, { vrep: 7 }); }
// context: neighbouring districts and far skyline
{ const nb = []; for (let i = 0; i < 520; i++) { let x, z; if (rnd() < .5) { x = rr(-3200, -960); z = rr(-1400, 2600); } else { x = rr(-900, 3200); z = rr(820, 2600); } nb.push(cbox(rr(18, 60), rr(5, 16), rr(18, 40), Math.round(x / 70) * 70, 0, Math.round(z / 60) * 60, pick([0xe9e4da, 0xdcd4c6, 0xcfc8ba, 0xd9c2a4]))); }
  for (let i = 0; i < 90; i++) { const h = rr(90, 360); nb.push(cbox(rr(30, 55), h, rr(30, 55), rr(4200, 8200), h / 2, rr(-5200, -1800), pick([0x8f9aa8, 0xa3acb8, 0x7d8896]))); }
  const m = new THREE.Mesh(mergeGeometries(nb), mat.v); m.castShadow = true; m.receiveShadow = true; scene.add(m); }
{ const m = new THREE.Mesh(mergeGeometries(amen), mat.v); m.castShadow = m.receiveShadow = true; scene.add(m); const gm = new THREE.Mesh(mergeGeometries(amenGlassLit), mat.glassLit); scene.add(gm); }

// ---------- instanced vegetation + lights ----------
{
  const cg = canopyGeo(), pg = palmGeo();
  instTiled(cg, mat.tree, trees.m, trees.c); instTiled(cg, mat.treeLit, treesLit.m, treesLit.c);
  instTiled(pg, mat.palm, palms.m, palms.c, { depthMat: palmDepth }); instTiled(pg, mat.palmLit, palmsLit.m, palmsLit.c, { depthMat: palmDepth }); instTiled(pg, mat.palmBlvd, palmsBlvd.m, palmsBlvd.c, { depthMat: palmDepth });
  const sg = new THREE.IcosahedronGeometry(1, 1); sg.scale(1.1, .75, 1.1); sg.translate(0, .6, 0); paint(sg, 0xffffff, (x, y) => .55 + y * .4);
  instTiled(sg, std({ vertexColors: true, roughness: .9 }), shrubs.m, shrubs.c, { cast: false });
  // lamp posts
  const hi = mergeGeometries([cbox(.22, 9.5, .22, 0, 4.75, 0, 0xffffff), cbox(.16, .16, 3, 0, 9.4, 1.4, 0xffffff)]);
  const hiHead = cbox(.5, .14, 1.1, 0, 9.3, 2.6, 0xffffff);
  const A = lampsHi.filter(l => !l.flood);
  instTiled(hi, mat.pole, A.map(l => M(l.x, 0, l.z, l.ry)), null, { cast: false }); instTiled(hiHead, mat.lamp, A.map(l => M(l.x, 0, l.z, l.ry)), null, { cast: false, recv: false });
  instTiled(cbox(1.6, .5, 1, 0, 16, 0, 0xffffff), mat.lamp, lampsHi.filter(l => l.flood).map(l => M(l.x, 0, l.z)), null, { cast: false, recv: false });
  const lo = mergeGeometries([cbox(.12, 4.2, .12, 0, 2.1, 0, 0xffffff)]), loHead = paint(ni(new THREE.SphereGeometry(.24, 8, 6)).translate(0, 4.3, 0), 0xffffff);
  instTiled(lo, mat.pole, lampsLo.map(l => M(l.x, 0, l.z)), null, { cast: false }); instTiled(loHead, mat.lamp, lampsLo.map(l => M(l.x, 0, l.z)), null, { cast: false, recv: false });
  // light pools on the ground
  const gq = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const warm = [...lampsHi.map(l => M(l.gx, .5, l.gz, 0, l.flood ? 34 : 17)), ...lampsLo.filter(l => !l.amber).map(l => M(l.x, .5, l.z, 0, 9))];
  const amber = [...lampsLo.filter(l => l.amber).map(l => M(l.x, .5, l.z, 0, 8)), ...glowsAmber.map(l => M(l.x, .5, l.z, 0, l.r))];
  instTiled(gq, mat.pool, warm, null, { cast: false, recv: false }); instTiled(gq, mat.poolAmber, amber, null, { cast: false, recv: false });
  mat.poolAqua = new THREE.MeshBasicMaterial({ map: texGlow, color: 0x35d6e0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  instTiled(gq, mat.poolAqua, glows.map(l => M(l.x, .52, l.z, 0, l.r)), null, { cast: false, recv: false });
}

// ---------- cars ----------
function carGeo() {
  const g = [cbox(1.86, .62, 4.5, 0, .68, 0, 0xffffff), cbox(1.72, .2, 4.3, 0, 1.02, 0, 0xffffff), cbox(1.6, .56, 2.5, 0, 1.36, -.25, 0x10151a), cbox(1.56, .08, 2.1, 0, 1.66, -.3, 0xffffff)];
  for (const [x, z] of [[-.9, 1.4], [.9, 1.4], [-.9, -1.4], [.9, -1.4]]) g.push(paint(ni(new THREE.CylinderGeometry(.36, .36, .24, 10)).rotateZ(Math.PI / 2).translate(x, .36, z), 0x0c0c0c));
  return mergeGeometries(g);
}
const carG = carGeo(), carL = mergeGeometries([cbox(.42, .14, .06, -.62, .82, 2.26, 0xffffff), cbox(.42, .14, .06, .62, .82, 2.26, 0xffffff), cbox(.42, .12, .06, -.62, .86, -2.26, 0xff1a10), cbox(.42, .12, .06, .62, .86, -2.26, 0xff1a10)]);
const matCar = std({ vertexColors: true, roughness: .35, metalness: .45 });
instTiled(carG, matCar, th.cars, th.carCol);
const traffic = [];
function addTraffic(poly, n, lanes, speed, closed) { for (let i = 0; i < n; i++) { const dir = i % 2 ? 1 : -1; traffic.push({ poly, off: pick(lanes), dir, speed: speed * rr(.8, 1.2), s0: rr(0, poly.len), col: C(pick(CARCOL)), closed }); } }
addTraffic(polyOuter, 22, [4.9, 8.3], 14, true); addTraffic(polyE, 9, [4.9, 8.3], 12, true); addTraffic(polyW, 9, [4.9, 8.3], 12, true);
addTraffic(new Poly(linePts(-4000, HWY_Z, 4000, HWY_Z, 400)), 90, [4, 7.7, 11.3, 15, 18.6], 30, false);
const trafMesh = new THREE.InstancedMesh(carG, matCar, traffic.length), trafLights = new THREE.InstancedMesh(carL, mat.carLights, traffic.length + 1);
trafMesh.castShadow = true; trafMesh.frustumCulled = false; trafLights.frustumCulled = false; scene.add(trafMesh, trafLights);
traffic.forEach((c, i) => trafMesh.setColorAt(i, c.col));
// hero car: comes home along the south boulevard and parks on its driveway
const heroCar = new THREE.Mesh(carG, matCar.clone()); heroCar.material.color.set(0xf4f4f2); heroCar.castShadow = true; heroCar.scale.setScalar(1.06); scene.add(heroCar);
const heroBeam = new THREE.Mesh(new THREE.PlaneGeometry(7, 16).rotateX(-Math.PI / 2).translate(0, .15, 10), new THREE.MeshBasicMaterial({ map: texGlow, color: 0xfff0c8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); heroCar.add(heroBeam);
function keyed(keys, t) { // Catmull-Rom in time over [t, ...values]
  if (t <= keys[0][0]) return keys[0].slice(1); const n = keys.length; if (t >= keys[n - 1][0]) return keys[n - 1].slice(1);
  let i = 0; while (keys[i + 1][0] < t) i++;
  const k0 = keys[Math.max(0, i - 1)], k1 = keys[i], k2 = keys[i + 1], k3 = keys[Math.min(n - 1, i + 2)], dt = k2[0] - k1[0], u = (t - k1[0]) / dt, u2 = u * u, u3 = u2 * u;
  return k1.slice(1).map((_, j) => { const p1 = k1[j + 1], p2 = k2[j + 1], m1 = (p2 - k0[j + 1]) / ((k2[0] - k0[0]) || 1) * dt, m2 = (k3[j + 1] - p1) / ((k3[0] - k1[0]) || 1) * dt; return (2 * u3 - 3 * u2 + 1) * p1 + (u3 - 2 * u2 + u) * m1 + (-2 * u3 + 3 * u2) * p2 + (u3 - u2) * m2; });
}
const HERO_KEYS = [[20, 480, 554.6], [22, 452, 554.6], [30, 330, 554.6], [38, 212, 554.6], [41.4, 162, 554.6], [42.8, 144, 553.6], [43.8, 136.6, 549.5], [45, 134.6, 541], [48, 134.6, 522], [49.4, 133.6, 514], [50.3, 129.5, 510.9], [51.6, 122, 510.6], [52.6, 116.6, 509.8], [53.4, 114.3, 507.8], [54.4, HERO.x, HERO.z], [60, HERO.x, HERO.z]];
const heroPos = t => { const [x, z] = keyed(HERO_KEYS, t); return { x, z }; };
function heroHeading(t) { const tt = clamp(t, 20.05, 54.2), a = heroPos(tt - .08), b = heroPos(tt + .08); return Math.atan2(b.x - a.x, b.z - a.z); }

// ---------- people ----------
const gTorso = new THREE.CapsuleGeometry(.17, .42, 3, 8), gHead = new THREE.SphereGeometry(.115, 10, 8), gHair = new THREE.SphereGeometry(.125, 10, 6, 0, 6.283, 0, 1.9), gLeg = new THREE.CapsuleGeometry(.075, .62, 2, 6).translate(0, -.4, 0), gArm = new THREE.CapsuleGeometry(.055, .5, 2, 6).translate(0, -.3, 0);
const SKIN = [0xe8c4a0, 0xc99a72, 0x9a6b48, 0xf0d2b4, 0x7a5236], TOPS = [0xffffff, 0xe9e2d0, 0x3d6fa8, 0xd9534a, 0xf2c14e, 0x5fa37a, 0x222831, 0xf08a5d, 0x9ad0e6, 0xe9a0b8], BOTS = [0x2b3a55, 0x39414d, 0xcdbfa6, 0x1f2329, 0x6b7280, 0xe9e2d0];
const matCache = new Map(), pm = c => { if (!matCache.has(c)) matCache.set(c, std({ color: c, roughness: .8 })); return matCache.get(c); };
function makePerson(scale = 1, top = pick(TOPS), bot = pick(BOTS)) {
  const g = new THREE.Group(), skin = pm(pick(SKIN));
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  add(gTorso, pm(top), 0, 1.2, 0); add(gHead, skin, 0, 1.63, 0); add(gHair, pm(pick([0x1c1612, 0x2e2118, 0x4a3524, 0x15130f])), 0, 1.65, -.01);
  g.userData.legs = [add(gLeg, pm(bot), -.09, .9, 0), add(gLeg, pm(bot), .09, .9, 0)]; g.userData.arms = [add(gArm, pm(top), -.25, 1.44, 0), add(gArm, pm(top), .25, 1.44, 0)];
  g.scale.setScalar(scale); scene.add(g); return g;
}
const people = [];
function pose(g, x, z, ry, phase, amp) { g.position.set(x, .32, z); g.rotation.y = ry; const s = Math.sin(phase) * amp; g.userData.legs[0].rotation.x = s; g.userData.legs[1].rotation.x = -s; g.userData.arms[0].rotation.x = -s * .8; g.userData.arms[1].rotation.x = s * .8; }
function walker(poly, off, speed, s0, scale, pingpong) {
  const g = makePerson(scale, speed > 2.4 ? pick([0xf2c14e, 0xd9534a, 0x5fa37a, 0xffffff, 0xf08a5d]) : undefined);
  people.push(t => {
    let s = s0 + speed * t, dir = 1;
    if (pingpong) { const L = poly.len - 2, m = ((s % (2 * L)) + 2 * L) % (2 * L); dir = m < L ? 1 : -1; s = 1 + (m < L ? m : 2 * L - m); }
    const p = poly.at(s); pose(g, p.x - p.tz * off * dir, p.z + p.tx * off * dir, Math.atan2(p.tx * dir, p.tz * dir), s * (speed > 2.4 ? 2.6 : 4.2) / scale, speed > 2.4 ? .95 : .55);
  });
}
function circler(cx, cz, r, speed, ph, scale) { const g = makePerson(scale, pick([0xf2c14e, 0xd9534a, 0x3d6fa8, 0xe9a0b8, 0x5fa37a])); people.push(t => { const a = ph + speed * t / r, wob = 1 + .25 * Math.sin(a * 3 + ph); pose(g, cx + r * wob * Math.cos(a), cz + r * wob * Math.sin(a), -a + (speed > 0 ? 0 : Math.PI), speed * t * 5 / scale, .9); }); }
function stander(x, z, ry, scale = 1, top) { const g = makePerson(scale, top); people.push(t => pose(g, x, z, ry + .15 * Math.sin(t * .7 + x), 0, 0)); return g; }
for (let i = 0; i < 46; i++) walker(polyPark, pick([-.9, .9]), rnd() < .3 ? rr(2.8, 3.6) : rr(1.1, 1.5), rr(0, 2200), rnd() < .2 ? .68 : rr(.94, 1.06), true);
for (let i = 0; i < 12; i++) walker(new Poly(parkPts.map(p => V(p.x, p.z + 5.2))), 0, rr(3, 3.8), rr(0, 2200), 1, true);  // joggers on the red track
for (const [poly, n] of [[polyE, 14], [polyW, 14], [polyOuter, 20]]) for (let i = 0; i < n; i++) walker(poly, pick([-13.2, 13.2]), rr(1.1, 1.5) * pick([-1, 1]), rr(0, poly.len), rr(.94, 1.06), false);
for (const p of playgrounds) { for (let i = 0; i < 9; i++) circler(p.x + rr(-5, 5), p.z + rr(-5, 5), rr(2.5, 6), rr(2.2, 3.4) * pick([-1, 1]), rr(0, 6), rr(.55, .7)); for (let i = 0; i < 4; i++) stander(p.x + 12 * Math.cos(i * 1.4), p.z + 12 * Math.sin(i * 1.4), -i * 1.4 - Math.PI / 2 + Math.PI); }
for (let i = 0; i < 12; i++) stander(-30 + i * 5 + rr(-1, 1), 9 + rr(-1.5, 3), rr(2.6, 3.6));                     // clubhouse terrace
for (let i = 0; i < 7; i++) circler(rr(-20, 20), rr(-6, 2), rr(2, 4), rr(1.6, 2.6), rr(0, 6), .62);              // kids on the lagoon beach
for (let i = 0; i < 10; i++) circler(84 + rr(-18, 18), -300 + rr(-30, 30), rr(4, 10), rr(3, 4.2) * pick([-1, 1]), rr(0, 6), rr(.7, .9)); // football
for (const p of poolParks.slice(0, 14)) { for (let i = 0; i < 3; i++) stander(p.x - 14 + i * 4, p.z + 6.5, Math.PI, 1); circler(p.x + 6, p.z - 6, 3, 2.4, rr(0, 6), .62); }
// hero street: kids playing, a neighbour walking, family at the door
circler(104, 505.5, 2.6, 2.6, 0, .62); circler(104.5, 506, 2.2, -2.4, 2, .58); circler(125, 506, 2, 2.2, 4, .6);
walker(new Poly(linePts(84, 507.6, 131, 507.6, 4)), 0, 1.25, 12, 1, true);
stander(HERO.doorX + .5, 503.4, .2, 1, 0xe9a0b8);
const heroKid = makePerson(.62, 0xf2c14e), heroDad = makePerson(1.03, 0xffffff, 0x2b3a55);
people.push(t => {
  const k = keyed([[0, 118.2, 504.4], [53.6, 118.2, 504.4], [56.4, 115.6, 506.2], [60, 115.6, 506.2]], t), run = t > 53.6 && t < 56.4;
  pose(heroKid, k[0], k[1], run ? -2.2 : -1.2 + .3 * Math.sin(t * 6), run ? t * 16 : 0, run ? .95 : 0); heroKid.position.y = .32 + (run ? 0 : Math.abs(Math.sin(t * 5)) * (t > 50 ? .18 : 0));
  heroDad.visible = t > 55.6; const d = keyed([[55.6, 115.25, 506.6], [57, 115.3, 506.4], [60, 116.2, 504.6]], t); pose(heroDad, d[0], d[1], t < 57 ? 1.4 : 2.6, t > 57 ? t * 6 : 0, t > 57 ? .5 : 0);
});
// metro train
const train = new THREE.Mesh(mergeGeometries([0, 1, 2, 3, 4].flatMap(i => [cbox(17.4, 3.2, 2.9, i * 18, 12.7, METRO_Z, 0xf4f6f8), cbox(17.5, .9, 2.94, i * 18, 12.9, METRO_Z, 0x1c3e6e), cbox(17.5, .3, 2.95, i * 18, 11.5, METRO_Z, 0x35b6d6)])), mat.v); train.castShadow = true; scene.add(train);

// ---------- sky, light, post ----------
const sky = new Sky(); sky.scale.setScalar(20000); scene.add(sky);
const su = sky.material.uniforms; su.turbidity.value = 5; su.rayleigh.value = 1.6; su.mieCoefficient.value = .004; su.mieDirectionalG.value = .82;
const nightDome = new THREE.Mesh(new THREE.SphereGeometry(19000, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, transparent: true, depthWrite: false, fog: false, uniforms: { op: { value: 0 }, glow: { value: new THREE.Vector3(-1, 0, 0) } },
  vertexShader: 'varying vec3 d; void main(){ d = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); gl_Position.z = gl_Position.w; }',
  fragmentShader: 'varying vec3 d; uniform float op; uniform vec3 glow; float h(vec3 p){ return fract(sin(dot(floor(p*260.), vec3(12.9,78.2,37.7)))*43758.5); } void main(){ float y = clamp(d.y,0.,1.); vec3 c = mix(vec3(.16,.2,.36), vec3(.012,.02,.06), pow(y,.45)); float g = pow(max(dot(normalize(vec3(d.x,0.,d.z)), glow),0.),3.) * pow(1.-y,6.); c += vec3(.75,.3,.12)*g; float s = step(.9975, h(d)) * smoothstep(.08,.4,y); c += vec3(s)*.8; gl_FragColor = vec4(c*op*2.2, op); }' }));
nightDome.renderOrder = 1; scene.add(nightDome);
const sun = new THREE.DirectionalLight(0xffffff, 3); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -.0005; sun.shadow.normalBias = .5; scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xbfd4ff, 0x8a7a5a, .5); scene.add(hemi);
const pmrem = new THREE.PMREMGenerator(renderer), envScene = new THREE.Scene(); let envRT = null, envKey = -1;
const sky2 = new THREE.Mesh(sky.geometry, sky.material); sky2.scale.setScalar(20000); const dome2 = new THREE.Mesh(nightDome.geometry, nightDome.material); envScene.add(sky2, dome2);

const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: +(Q.get('aa') || 4) });
const composer = new EffectComposer(renderer, rt); composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), .3, .7, 1.0); composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass({ uniforms: { tDiffuse: { value: null }, seed: { value: 0 }, warm: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
  fragmentShader: `varying vec2 vUv; uniform sampler2D tDiffuse; uniform float seed, warm;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + seed) * 43758.5453); }
    void main(){ vec2 c = vUv - .5; float r2 = dot(c, c);
      vec3 col = vec3(texture2D(tDiffuse, vUv + c * r2 * .012).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - c * r2 * .012).b);
      float l = dot(col, vec3(.299,.587,.114)); col = mix(vec3(l), col, 1.06);
      col = col * col * (3. - 2. * col) * .35 + col * .65;
      col *= mix(vec3(1.), vec3(1.035, 1., .955), warm);
      col *= 1. - .55 * r2;
      col += (h(gl_FragCoord.xy) - .5) * .045 * (1. - l * .5);
      gl_FragColor = vec4(col, 1.); }` });
composer.addPass(grade);

// ---------- time of day ----------
const TOD = { 1: [[0, 6.15], [12, 8.2], [30, 15.6], [44, 17.75], [52, 18.75], [60, 20.2]], 2: [[0, 6.3], [10, 8.6], [28, 16.4], [42, 17.8], [51, 18.7], [60, 19.9]], 3: [[0, 6.1], [15, 8.6], [32, 15.6], [46, 17.85], [53, 18.8], [60, 20.4]] }[VERSION];
const hourAt = t => DBGH ?? keyed(TOD, t)[0];
function sunAt(h) {
  const elev = h <= 18.5 ? 58 * Math.sin(Math.PI * (h - 6) / 12.5) : -Math.min(18, (h - 18.5) * 13);
  const az = Math.PI * clamp((h - 6) / 12.5, -.05, 1.08) - .35; // rises ESE, sets WSW
  const e = THREE.MathUtils.degToRad(elev);
  return { elev, dir: new THREE.Vector3(Math.cos(e) * Math.cos(az), Math.sin(e), Math.cos(e) * Math.sin(az) * .85 + .25 * Math.cos(e)).normalize() };
}
const cDay = C(0xfff3e0), cLow = C(0xffa45e), cMoon = C(0x8fa8ff), tmpC = new THREE.Color();
const fogDay = C(0xc9d6e2), fogGold = C(0xe6b58c), fogNight = C(0x121a30);
function applyTime(h, forEnv) {
  const s = sunAt(h), day = sstep(-3, 12, s.elev), low = 1 - sstep(4, 30, s.elev), night = sstep(1, -8, s.elev);
  su.sunPosition.value.copy(s.dir); su.rayleigh.value = lerp(1.3, 3.2, low); su.turbidity.value = lerp(4, 9, low);
  nightDome.material.uniforms.op.value = sstep(2, -9, s.elev); nightDome.material.uniforms.glow.value.set(s.dir.x, 0, s.dir.z).normalize();
  return { ...s, day, low, night };
}

// ---------- camera paths ----------
const E = (a, s = 1.02) => [LOOP.cx + LOOP.rx * s * Math.cos(a), LOOP.rz * s * Math.sin(a)];
const hp = t => heroPos(t);
const CAM = {
  1: [ // fly in from the highway, down the palm avenue, along the springs, out over the villas
    [0, -1650, 520, 1750, 0, 0, 200], [6, -980, 330, 1200, 0, 0, 380], [12, -330, 150, 900, 0, 0, 500], [17, 4, 52, 720, 4, 6, 480], [21, 5, 20, 520, 5, 9, 250], [25, 5, 15, 250, -10, 6, 40],
    [28.5, -22, 17, 60, -160, 3, spineZ(-160)], [32, -120, 12, pathZ(-120) + 4, -260, 2, pathZ(-260) + 12], [36, -235, 9, pathZ(-235) - 6, -380, 3, pathZ(-380)], [40, -400, 22, pathZ(-400) - 30, -330, 2, -210],
    [44, -330, 46, -250, -100, 4, -300], [48, -120, 40, -360, 110, 2, -290], [52, 150, 60, -330, 360, 0, -40], [56, 480, 120, -300, 300, 0, 60], [60, 880, 250, 120, 200, 0, 30],
  ],
  2: [ // loop boulevard FPV, then follow the car home
    [0, 700, 150, -560, 420, 0, -150], [5, 640, 60, -330, ...((p) => [p[0], 3, p[1]])(E(-.15))], [9, ...((p) => [p[0], 10, p[1]])(E(-.42)), ...((p) => [p[0], 3, p[1]])(E(-.05))],
    [13, ...((p) => [p[0], 8, p[1]])(E(.12)), ...((p) => [p[0], 2.5, p[1]])(E(.5))], [17, ...((p) => [p[0], 8, p[1]])(E(.62)), ...((p) => [p[0], 2.5, p[1]])(E(1))], [21, ...((p) => [p[0], 9, p[1]])(E(1.1)), ...((p) => [p[0], 3, p[1]])(E(1.42))],
    [25, 372, 16, 392, 345, 2, 540], [29, 372, 12, 549, 330, 1.2, 554.6], [34, hp(34).x + 20, 6.5, 557.5, hp(34).x - 8, 1, 554.6], [39, hp(39).x + 15, 5, 556.8, hp(39).x - 8, 1, 554.6],
    [43.5, 156, 6.5, 560, 136, 1, 549], [47, 142, 6.5, 548, 134.4, 1, 527], [50.5, 139, 5.5, 524, 128, 1, 510.5], [54, 127, 4.6, 517.5, 114.5, 1.6, 505], [57, 122.5, 4.2, 514.5, 115.4, 1.8, 504.5], [60, 132, 34, 560, 108, 4, 470],
  ],
  3: [ // a day at the springs: park, lagoon, playground, pools, then up into the night
    [0, -640, 70, 90, -480, 0, spineZ(-480)], [5, -545, 16, pathZ(-545) + 18, -430, 2, pathZ(-430)], [10, -440, 7, pathZ(-440) + 2, -330, 2, pathZ(-330) + 6], [15, -310, 6.5, pathZ(-310) + 3, -250, 1.5, pathZ(-250) + 18],
    [20, -215, 8, pathZ(-215) + 2, -110, 2, pathZ(-110)], [24, -100, 13, pathZ(-100) - 4, 0, 1, -22], [28, -52, 10, -62, 12, 1.5, 4], [32, 32, 9, -70, 10, 3, 24], [36, 82, 16, -20, 250, 2, pathZ(250)],
    [40, 215, 8, pathZ(215) + 3, 395, 1.5, pathZ(395) - 22], [44, 360, 9, pathZ(360) + 10, 470, 2, pathZ(470)], [48, 470, 28, pathZ(470) + 30, 420, 2, 200], [52, 440, 48, 150, 330, 2, 330], [56, 300, 110, 330, 100, 0, 80], [60, 60, 300, 760, 0, 0, -120],
  ],
}[VERSION];
const CAPS = {
  1: [[2.5, 8, 'Sunrise over Palm Springs'], [13, 19, 'Home is one turn off the highway'], [21, 27, 'A palm-lined drive in'], [30, 38, 'Springs and lagoons through the heart of it'], [44, 50, 'Villas, parks and play, a walk apart'], [54, 59.2, 'And the lights come on']],
  2: [[2.5, 8, 'Good morning, Palm Springs'], [11, 19, 'Tree-lined boulevards, every day'], [30, 38, 'The drive home'], [44, 50, 'Your street'], [53.5, 59.2, 'Welcome home']],
  3: [[2.5, 8, 'A day at the springs'], [10, 17, 'Morning runs by the water'], [24, 31, 'Afternoons at the lagoon'], [40, 46, 'Room to play'], [54, 59.2, 'Evenings that glow']],
}[VERSION];

// ---------- frame ----------
const ui = document.getElementById('ui'); ui.style.transform = `scale(${SCALE})`; if (!SHOW_UI) ui.style.display = 'none';
const $ = id => document.getElementById(id), ticks = [...document.querySelectorAll('.tick')];
const camP = new THREE.Vector3(), camT = new THREE.Vector3(), tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
function camAt(t) { const k = keyed(CAM, t); return [new THREE.Vector3(k[0], k[1], k[2]), new THREE.Vector3(k[3], k[4], k[5])]; }

window.renderFrame = function (f) {
  const t = f / FPS, hour = hourAt(t);
  // environment map refreshes every 10 frames, keyed so chunks render identically
  const key = Math.floor(f / 10);
  if (key !== envKey) { envKey = key; applyTime(hourAt(key * 10 / FPS)); if (envRT) envRT.dispose(); envRT = pmrem.fromScene(envScene, 0, 10, 30000); scene.environment = envRT.texture; }
  const S = applyTime(hour), lampsOn = sstep(9, -1, S.elev), windowsOn = sstep(11, -2, S.elev);
  tmpC.copy(cDay).lerp(cLow, S.low); if (S.elev < -1.5) { sun.color.copy(cMoon); sun.intensity = .28 * sstep(-1.5, -7, S.elev); } else { sun.color.copy(tmpC); sun.intensity = 3.4 * sstep(-1.5, 9, S.elev) * lerp(1, .8, S.low); }
  const ldir = S.elev < -1.5 ? new THREE.Vector3(-.35, .8, -.4).normalize() : S.dir.clone().setY(Math.max(S.dir.y, .06)).normalize();
  hemi.intensity = lerp(.12, .55, S.day); hemi.color.setHex(0xbfd4ff).lerp(C(0x44548a), S.night); hemi.groundColor.setHex(0x8a7a5a).lerp(C(0x1a1c24), S.night);
  scene.environmentIntensity = lerp(.55, .9, S.day);
  scene.fog.color.copy(fogDay).lerp(fogGold, S.low * (1 - S.night)).lerp(fogNight, S.night); scene.fog.density = lerp(.00016, .00024, S.low);
  renderer.toneMappingExposure = lerp(lerp(.5, .62, S.low), 1.05, S.night);
  bloom.strength = lerp(.22, .85, lampsOn); bloom.threshold = lerp(1.0, .78, lampsOn);
  mat.lamp.emissiveIntensity = 7 * lampsOn; mat.pool.opacity = .5 * lampsOn; mat.poolAmber.opacity = .55 * lampsOn; mat.poolAqua.opacity = .5 * lampsOn;
  mat.glassLit.emissiveIntensity = 2.6 * windowsOn; mat.facade.emissiveIntensity = 1.6 * windowsOn;
  mat.treeLit.emissiveIntensity = .42 * lampsOn; mat.palmLit.emissiveIntensity = .7 * lampsOn; mat.palmBlvd.emissiveIntensity = .4 * lampsOn; mat.water.emissiveIntensity = 1.1 * lampsOn;
  mat.carLights.color.setScalar(lerp(.7, 5, lampsOn)); heroBeam.material.opacity = .5 * lampsOn;
  texWaterN.offset.set(t * .012, t * .02);

  // traffic
  traffic.forEach((c, i) => { const s = c.s0 + c.dir * c.speed * t, p = c.poly.at(c.closed ? s : ((s % c.poly.len) + c.poly.len) % c.poly.len); const hx = p.tx * c.dir, hz = p.tz * c.dir; tmpM.compose(new THREE.Vector3(p.x - hz * c.off, .3, p.z + hx * c.off), tmpQ.setFromAxisAngle(Y, Math.atan2(hx, hz)), one); trafMesh.setMatrixAt(i, tmpM); trafLights.setMatrixAt(i, tmpM); });
  const hpz = heroPos(t); heroCar.position.set(hpz.x, .3, hpz.z); heroCar.rotation.y = heroHeading(t); heroCar.updateMatrix(); trafLights.setMatrixAt(traffic.length, heroCar.matrix);
  trafMesh.instanceMatrix.needsUpdate = true; trafLights.instanceMatrix.needsUpdate = true;
  train.position.x = -1500 + ((t * 22 + 900) % 3000);
  for (const p of people) p(t);

  // camera with FPV-style banking
  let [p, look] = camAt(t), [p2] = camAt(t + .4), [p0] = camAt(t - .4);
  if (DBG) { p = new THREE.Vector3(DBG[0], DBG[1], DBG[2]); look = new THREE.Vector3(DBG[3], DBG[4], DBG[5]); p2 = p0 = p; }
  const h1 = Math.atan2(p.x - p0.x, p.z - p0.z), h2 = Math.atan2(p2.x - p.x, p2.z - p.z); let dh = h2 - h1; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  const speed = p2.distanceTo(p0) / .8;
  camera.position.copy(p); camera.lookAt(look); camera.rotateZ(clamp(dh * .9 * clamp(speed / 30, 0, 1), -.3, .3));
  camera.position.y += .12 * Math.sin(t * 1.7) * clamp(p.y / 20, .2, 1);
  // shadow frustum follows the view
  const half = clamp(p.y * 2.4 + 90, 130, 1500), ctr = new THREE.Vector3().copy(look).lerp(p, p.y > 120 ? .25 : .55); ctr.y = 0;
  sun.target.position.copy(ctr); sun.position.copy(ctr).addScaledVector(ldir, 1600); const sc = sun.shadow.camera; sc.left = sc.bottom = -half; sc.right = sc.top = half; sc.near = 100; sc.far = 3400; sc.updateProjectionMatrix(); sun.shadow.normalBias = half / 260;

  // overlay
  if (SHOW_UI) {
    const u = t / DUR, hh = Math.floor(hour), mm = Math.floor((hour - hh) * 60 / 5) * 5;
    $('clock').textContent = `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
    $('clock').style.left = $('knob').style.left = $('moon').style.left = (u * 100) + '%';
    const n = sstep(2, -6, S.elev); tmpC.setHex(0xfff1b8).lerp(C(0xff9a4a), S.low * (1 - n));
    $('knob').style.background = '#' + tmpC.getHexString(); $('knob').style.opacity = 1 - n; $('moon').style.opacity = n; $('moon').style.background = '#eef2ff';
    const seg = hour < 12 ? 0 : hour < 16.6 ? 1 : hour < 18.6 ? 2 : 3; ticks.forEach((e, i) => e.classList.toggle('on', i === seg));
    let cap = '', op = 0; for (const [a, b, txt] of CAPS) if (t >= a && t <= b) { cap = txt; op = Math.min(sstep(a, a + .8, t), 1 - sstep(b - .8, b, t)); }
    $('cap').textContent = cap; $('cap').style.opacity = op;
    const fade = Math.min(sstep(0, 1.2, t), 1 - sstep(DUR - 1, DUR, t)); canvas.style.opacity = fade;
    const ti = 1 - sstep(7, 9, t) + sstep(55, 57, t); $('title').style.opacity = $('sub').style.opacity = clamp(ti, 0, 1) * sstep(.6, 2, t);
  }
  grade.uniforms.seed.value = f * .37; grade.uniforms.warm.value = S.low * (1 - S.night);
  composer.render();
};
document.fonts.ready.then(() => { window.renderFrame(0); window.ready = true; });
