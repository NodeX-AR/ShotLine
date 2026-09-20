import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ================================================================
   Constants (single source of truth)
================================================================ */
export const MAP = 480;
export const NUM_BOTS = 11;
export const MP_MAX = 20;
export const EYE = 1.62;
export const R = 0.4;
export const H = 1.8;
export const STEP = 0.55;
export const GRAV = 24;
export const BASE_FOV = 80;
export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rnd = (a, b) => a + Math.random() * (b - a);
export const angDiff = (a, b) => {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
};
export const r2 = v => Math.round(v * 100) / 100;
export const r4 = v => Math.round(v * 10000) / 10000;

export function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export const WEAPONS = [
  { key:'pistol', name:'R-9 Pistol', dmg:18, head:1.8, rate:0.14, mag:15, reload:1.5, hip:0.012, ads:0.003, recoil:0.006, auto:false, pellets:1, adsFov:60, falloff:[30,120,0.5], flashZ:-0.50, recoilKick:0.6, recoilReturn:14 },
  { key:'smg',    name:'MP-7 SMG', dmg:13, head:1.6, rate:0.065, mag:30, reload:1.7, hip:0.020, ads:0.006, recoil:0.006, auto:true, pellets:1, adsFov:58, falloff:[25,120,0.5], flashZ:-0.70, recoilKick:0.35, recoilReturn:16 },
  { key:'rifle',  name:'VX-9 Rifle', dmg:22, head:2.0, rate:0.095, mag:30, reload:1.9, hip:0.014, ads:0.0035, recoil:0.0085, auto:true, pellets:1, adsFov:52, falloff:[45,220,0.6], flashZ:-0.86, recoilKick:1.0, recoilReturn:10 },
  { key:'bullpup',name:'QB-95 Bullpup', dmg:19, head:2.0, rate:0.075, mag:30, reload:1.85, hip:0.012, ads:0.003, recoil:0.010, auto:true, pellets:1, adsFov:50, falloff:[50,240,0.6], flashZ:-0.80, recoilKick:0.75, recoilReturn:12 },
  { key:'dmr',    name:'AR-45 DMR', dmg:38, head:2.2, rate:0.28, mag:15, reload:2.0, hip:0.015, ads:0.002, recoil:0.020, auto:false, pellets:1, adsFov:42, falloff:[80,320,0.7], flashZ:-1.00, recoilKick:2.2, recoilReturn:5 },
  { key:'lmg',    name:'M-249 LMG', dmg:20, head:1.8, rate:0.09, mag:100, reload:4.2, hip:0.028, ads:0.010, recoil:0.018, auto:true, pellets:1, adsFov:55, falloff:[40,200,0.55], flashZ:-1.00, recoilKick:1.5, recoilReturn:7 },
  { key:'shotgun',name:'Breaker 12', dmg:13, head:1.5, rate:0.85, mag:6, reload:2.6, hip:0.055, ads:0.040, recoil:0.055, auto:false, pellets:9, adsFov:66, falloff:[6,34,0.12], flashZ:-0.98, recoilKick:3.5, recoilReturn:2.5 },
  { key:'sniper', name:'Longshot .50', dmg:95, head:2.5, rate:1.35, mag:5, reload:3.2, hip:0.048, ads:0.0002, recoil:0.058, auto:false, pellets:1, adsFov:14, falloff:[400,400,1.0], flashZ:-1.22, recoilKick:6.0, recoilReturn:1.5 },
];

export function dmgMul(w, t) {
  const a = w.falloff[0], b = w.falloff[1], m = w.falloff[2];
  if (t <= a) return 1;
  if (t >= b) return m;
  return 1 + (m - 1) * (t - a) / (b - a);
}

export const EMOTES = {
  wave: { dur: 2.0, sym: '👋', color: '#9ad9ff' },
  taunt: { dur: 1.6, sym: '😎', color: '#ffd166' },
  dance: { dur: 2.6, sym: '💃', color: '#ff9ad9' },
  celebrate: { dur: 2.2, sym: '🎉', color: '#a0ff9a' },
};

export const BOT_NAMES = ['Vex','Rook','Kite','Nova','Jinx','Onyx','Pyre','Sable','Talon','Wisp','Zeal'];
export const BOT_COLORS = [0xc0392b,0x2e86c1,0x27ae60,0x8e44ad,0xd68910,0x16a085,0xc2185b,0x5d6d7e,0xa04000,0x1f618d,0x7d3c98];

/* ================================================================
   TEXTURES
================================================================ */
function canvas2D(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function texFromCanvas(c, rep, color) {
  const t = new THREE.CanvasTexture(c);
  if (color !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (rep) t.repeat.set(rep, rep);
  return t;
}

function brickTex(seed, hue) {
  const S = 512, c = canvas2D(S), g = c.getContext('2d'), rng = mulberry32(seed);
  g.fillStyle = `hsl(${hue},12%,28%)`;
  g.fillRect(0, 0, S, S);
  const bw = 64, bh = 28, gap = 3;
  for (let y = 0; y < S; y += bh) {
    const off = ((y / bh) | 0) % 2 ? bw / 2 : 0;
    for (let x = -bw; x < S + bw; x += bw) {
      const l = 22 + rng() * 18;
      g.fillStyle = `hsl(${hue + rng() * 14 - 7},${18 + rng() * 14}%,${l}%)`;
      g.fillRect(x + off + gap / 2, y + gap / 2, bw - gap, bh - gap);
    }
  }
  for (let i = 0; i < 20000; i++) {
    g.fillStyle = `hsla(0,0%,${rng() * 100}%,${rng() * 0.06})`;
    g.fillRect(rng() * S, rng() * S, 1, 1);
  }
  return c;
}

function concreteTex(seed) {
  const S = 512, c = canvas2D(S), g = c.getContext('2d'), rng = mulberry32(seed);
  g.fillStyle = '#6a665c';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 200; i++) {
    const x = rng() * S, y = rng() * S, r = 6 + rng() * 40;
    g.fillStyle = `hsla(30,8%,${30 + rng() * 25}%,0.4)`;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.beginPath(); g.arc(x + ox, y + oy, r, 0, 6.28); g.fill();
    }
  }
  for (let i = 0; i < 8000; i++) {
    g.fillStyle = `hsla(30,6%,${20 + rng() * 40}%,${rng() * 0.35})`;
    g.fillRect(rng() * S, rng() * S, 1 + rng() * 2, 1 + rng() * 2);
  }
  for (let i = 0; i < 20; i++) {
    g.strokeStyle = `rgba(15,12,10,${0.15 + rng() * 0.35})`;
    g.lineWidth = 1 + rng() * 2;
    g.beginPath();
    let x = rng() * S, y = rng() * S;
    g.moveTo(x, y);
    for (let j = 0; j < 6; j++) {
      x += (rng() - 0.5) * 60;
      y += (rng() - 0.5) * 60;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return c;
}

function asphaltTex(seed) {
  const S = 512, c = canvas2D(S), g = c.getContext('2d'), rng = mulberry32(seed);
  g.fillStyle = '#2a2a2c';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 40000; i++) {
    g.fillStyle = `hsla(0,0%,${10 + rng() * 50}%,${rng() * 0.4})`;
    g.fillRect(rng() * S, rng() * S, 1 + rng() * 2, 1 + rng() * 2);
  }
  return c;
}

function rustTex(seed) {
  const S = 512, c = canvas2D(S), g = c.getContext('2d'), rng = mulberry32(seed);
  g.fillStyle = '#4a3520';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 200; i++) {
    const x = rng() * S, y = rng() * S, r = 8 + rng() * 50;
    g.fillStyle = `hsla(${15 + rng() * 25},${35 + rng() * 30}%,${20 + rng() * 25}%,0.6)`;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.beginPath(); g.arc(x + ox, y + oy, r, 0, 6.28); g.fill();
    }
  }
  for (let i = 0; i < 10000; i++) {
    g.fillStyle = `hsla(${20 + rng() * 30},${40 + rng() * 40}%,${15 + rng() * 40}%,${rng() * 0.5})`;
    g.fillRect(rng() * S, rng() * S, 1 + rng() * 3, 1 + rng() * 3);
  }
  return c;
}

function woodTex(seed) {
  const S = 512, c = canvas2D(S), g = c.getContext('2d'), rng = mulberry32(seed);
  g.fillStyle = '#5a3a22';
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 3) {
    const b = 0.75 + rng() * 0.5;
    g.fillStyle = `rgba(${100 * b},${60 * b},${30 * b},${rng() * 0.55})`;
    g.fillRect(0, y, S, 2 + rng() * 3);
  }
  for (let i = 0; i < 60; i++) {
    g.strokeStyle = `rgba(20,10,5,${0.15 + rng() * 0.35})`;
    g.lineWidth = 1;
    g.beginPath();
    const y = rng() * S;
    g.moveTo(0, y);
    for (let x = 0; x < S; x += 8) g.lineTo(x, y + (rng() - 0.5) * 4);
    g.stroke();
  }
  return c;
}

function roughnessFrom(albedoCanvas, variance) {
  const S = albedoCanvas.width;
  const c = canvas2D(S), g = c.getContext('2d'), rng = mulberry32(1234);
  g.fillStyle = 'rgb(180,180,180)';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 8000; i++) {
    const v = Math.floor(150 + (rng() - 0.5) * variance * 80);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(rng() * S, rng() * S, 3 + rng() * 6, 3 + rng() * 6);
  }
  return c;
}

let TEX = null;
export function buildTextures() {
  if (TEX) return TEX;
  TEX = {
    brickRed:   texFromCanvas(brickTex(1, 15), 1, true),
    brickBrown: texFromCanvas(brickTex(2, 25), 1, true),
    brickCream: texFromCanvas(brickTex(3, 40), 1, true),
    concrete:   texFromCanvas(concreteTex(4), 1, true),
    concrete2:  texFromCanvas(concreteTex(5), 1, true),
    asphalt:    texFromCanvas(asphaltTex(6), 1, true),
    rust:       texFromCanvas(rustTex(7), 1, true),
    rust2:      texFromCanvas(rustTex(8), 1, true),
    wood:       texFromCanvas(woodTex(9), 1, true),
  };
  TEX.concreteRough = texFromCanvas(roughnessFrom(TEX.concrete.image, 80), 1, false);
  TEX.brickRough    = texFromCanvas(roughnessFrom(TEX.brickRed.image, 60), 1, false);
  TEX.metalRough    = texFromCanvas(roughnessFrom(TEX.rust.image, 100), 1, false);
  return TEX;
}

/* ================================================================
   MATERIALS + ENVIRONMENT
================================================================ */
let MAT = null;
export function buildMaterials() {
  if (MAT) return MAT;
  const T = buildTextures();
  function pbr(hex, opts) {
    opts = opts || {};
    return new THREE.MeshStandardMaterial({
      color: hex,
      roughness: opts.r !== undefined ? opts.r : 0.85,
      metalness: opts.m !== undefined ? opts.m : 0.0,
      map: opts.map || null,
      roughnessMap: opts.rm || null,
      envMapIntensity: opts.env !== undefined ? opts.env : 0.7,
      side: opts.side || THREE.FrontSide,
      transparent: opts.tr || false,
      opacity: opts.op !== undefined ? opts.op : 1,
    });
  }
  MAT = {
    brickA:    pbr(0xffffff, { r:0.95, map:T.brickRed,   rm:T.brickRough, env:0.4 }),
    brickB:    pbr(0xffffff, { r:0.95, map:T.brickBrown, rm:T.brickRough, env:0.4 }),
    brickC:    pbr(0xffffff, { r:0.95, map:T.brickCream, rm:T.brickRough, env:0.4 }),
    concrete:  pbr(0xffffff, { r:0.96, map:T.concrete,   rm:T.concreteRough, env:0.4 }),
    concrete2: pbr(0xffffff, { r:0.96, map:T.concrete2,  rm:T.concreteRough, env:0.4 }),
    asphalt:   pbr(0xffffff, { r:0.85, map:T.asphalt, env:0.6 }),
    rust:      pbr(0xffffff, { r:0.75, m:0.55, map:T.rust,  rm:T.metalRough, env:1.1 }),
    rust2:     pbr(0xffffff, { r:0.70, m:0.60, map:T.rust2, rm:T.metalRough, env:1.1 }),
    wood:      pbr(0xffffff, { r:0.85, map:T.wood, env:0.3 }),
    metal:     pbr(0x3a4048, { r:0.35, m:0.90, env:1.4 }),
    paintedRed:   pbr(0xa82030, { r:0.4, m:0.15, env:1.0 }),
    paintedBlue:  pbr(0x1a3a5a, { r:0.4, m:0.15, env:1.0 }),
    paintedGreen: pbr(0x2a5a3a, { r:0.4, m:0.15, env:1.0 }),
    paintedBlack: pbr(0x141414, { r:0.4, m:0.20, env:1.0 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x8ab8d0, transparent: true, opacity: 0.35,
      roughness: 0.06, metalness: 0.0, envMapIntensity: 1.6, side: THREE.DoubleSide,
    }),
  };
  return MAT;
}

let ENV = null;
export function buildEnvironment(renderer, scene) {
  if (ENV) { scene.environment = ENV; return ENV; }
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#3a5a80');
  grad.addColorStop(0.5, '#8fb0d0');
  grad.addColorStop(0.7, '#c0a880');
  grad.addColorStop(1, '#4a3a30');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  ENV = pmrem.fromEquirectangular(tex).texture;
  tex.dispose();
  pmrem.dispose();
  scene.environment = ENV;
  return ENV;
}

/* ================================================================
   WORLD — spatial grid + geometry batches
================================================================ */
export const boxes = [];
export const GRID_CELL = 16;
const GRID_HALF = Math.ceil((MAP + 40) / GRID_CELL);
const GRID_SIZE = GRID_HALF * 2 + 1;
const grid = new Map();

export const rand = mulberry32(90210);
export const wr = (a, b) => a + rand() * (b - a);
export const wpick = a => a[(rand() * a.length) | 0];

export function regCol(b) {
  const gx0 = Math.max(0, ((b.x0 + MAP + 20) / GRID_CELL) | 0);
  const gx1 = Math.min(GRID_SIZE - 1, ((b.x1 + MAP + 20) / GRID_CELL) | 0);
  const gz0 = Math.max(0, ((b.z0 + MAP + 20) / GRID_CELL) | 0);
  const gz1 = Math.min(GRID_SIZE - 1, ((b.z1 + MAP + 20) / GRID_CELL) | 0);
  for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
    const k = gx * 10000 + gz;
    let a = grid.get(k);
    if (!a) { a = []; grid.set(k, a); }
    a.push(b);
  }
}

export function queryGrid(x, z, r) {
  const out = [], seen = new Set();
  const gx0 = Math.max(0, ((x - r + MAP + 20) / GRID_CELL) | 0);
  const gx1 = Math.min(GRID_SIZE - 1, ((x + r + MAP + 20) / GRID_CELL) | 0);
  const gz0 = Math.max(0, ((z - r + MAP + 20) / GRID_CELL) | 0);
  const gz1 = Math.min(GRID_SIZE - 1, ((z + r + MAP + 20) / GRID_CELL) | 0);
  for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
    const a = grid.get(gx * 10000 + gz);
    if (!a) continue;
    for (let i = 0; i < a.length; i++) {
      const b = a[i];
      if (!seen.has(b)) { seen.add(b); out.push(b); }
    }
  }
  return out;
}

const OCC_CELL = 8;
const occHash = new Map();

export function occupy(x0, x1, z0, z1, pad) {
  const ox0 = x0 - pad, ox1 = x1 + pad, oz0 = z0 - pad, oz1 = z1 + pad;
  const rec = { x0: ox0, x1: ox1, z0: oz0, z1: oz1 };
  const gx0 = ((ox0 + MAP + 20) / OCC_CELL) | 0;
  const gx1 = ((ox1 + MAP + 20) / OCC_CELL) | 0;
  const gz0 = ((oz0 + MAP + 20) / OCC_CELL) | 0;
  const gz1 = ((oz1 + MAP + 20) / OCC_CELL) | 0;
  for (let gx = gx0; gx <= gx1; gx++) for (let gz = gz0; gz <= gz1; gz++) {
    const k = gx * 10000 + gz;
    let a = occHash.get(k);
    if (!a) { a = []; occHash.set(k, a); }
    a.push(rec);
  }
}

export function isFree(x, z, r) {
  if (Math.abs(x) > MAP - 8 || Math.abs(z) > MAP - 8) return false;
  const gx = ((x + MAP + 20) / OCC_CELL) | 0;
  const gz = ((z + MAP + 20) / OCC_CELL) | 0;
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    const a = occHash.get((gx + dx) * 10000 + (gz + dz));
    if (!a) continue;
    for (const o of a) if (x > o.x0 - r && x < o.x1 + r && z > o.z0 - r && z < o.z1 + r) return false;
  }
  return true;
}

export const BATCH = {
  brickA:    { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'brickA' },
  brickB:    { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'brickB' },
  brickC:    { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'brickC' },
  concrete:  { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'concrete' },
  concrete2: { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'concrete2' },
  asphalt:   { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'asphalt' },
  rust:      { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'rust' },
  rust2:     { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'rust2' },
  wood:      { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'wood' },
  metal:     { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'metal' },
  red:       { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'paintedRed' },
  blue:      { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'paintedBlue' },
  green:     { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'paintedGreen' },
  black:     { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'paintedBlack' },
  glass:     { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'glass' },
};

const FACES = [
  { n: [1, 0, 0],  v: [[.5, -.5, .5], [.5, -.5, -.5], [.5, .5, -.5], [.5, .5, .5]] },
  { n: [-1, 0, 0], v: [[-.5, -.5, -.5], [-.5, -.5, .5], [-.5, .5, .5], [-.5, .5, -.5]] },
  { n: [0, 1, 0],  v: [[-.5, .5, .5], [.5, .5, .5], [.5, .5, -.5], [-.5, .5, -.5]] },
  { n: [0, -1, 0], v: [[-.5, -.5, -.5], [.5, -.5, -.5], [.5, -.5, .5], [-.5, -.5, .5]] },
  { n: [0, 0, 1],  v: [[-.5, -.5, .5], [.5, -.5, .5], [.5, .5, .5], [-.5, .5, .5]] },
  { n: [0, 0, -1], v: [[.5, -.5, -.5], [-.5, -.5, -.5], [-.5, .5, -.5], [.5, .5, -.5]] },
];

function batchAdd(B, cx, y, cz, w, h, d, uvScale) {
  uvScale = uvScale || 0.35;
  for (const f of FACES) {
    const base = B.n;
    for (const v of f.v) {
      const wy = y + h / 2 + v[1] * h;
      B.pos.push(cx + v[0] * w, wy, cz + v[2] * d);
      B.nor.push(f.n[0], f.n[1], f.n[2]);
      B.uv.push((v[0] + 0.5) * w * uvScale, (v[2] + 0.5) * d * uvScale);
    }
    B.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    B.n += 4;
  }
}

export function addBox(cx, y, cz, w, h, d, matKey, collide, visual) {
  if (collide === undefined) collide = true;
  if (visual === undefined) visual = true;
  if (visual) {
    const B = BATCH[matKey] || BATCH.concrete;
    batchAdd(B, cx, y, cz, w, h, d);
  }
  if (collide) {
    const b = { x0: cx - w / 2, x1: cx + w / 2, y0: y, y1: y + h, z0: cz - d / 2, z1: cz + d / 2 };
    boxes.push(b);
    regCol(b);
  }
}

export function finalizeBatches(scene) {
  const M = buildMaterials();
  for (const k in BATCH) {
    const B = BATCH[k];
    if (!B.n) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(B.pos), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(B.nor), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(B.uv), 2));
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(B.idx), 1));
    const m = new THREE.Mesh(g, M[B.matKey]);
    m.frustumCulled = false;
    m.castShadow = k !== 'glass';
    m.receiveShadow = k !== 'glass';
    scene.add(m);
  }
}

/* ================================================================
   COLLISION
================================================================ */
export function rayBox(ox, oy, oz, dx, dy, dz, x0, x1, y0, y1, z0, z1, maxT) {
  let tmin = 0, tmax = maxT, t1, t2, t;
  if (Math.abs(dx) < 1e-9) { if (ox < x0 || ox > x1) return -1; }
  else { t1=(x0-ox)/dx; t2=(x1-ox)/dx; if(t1>t2){t=t1;t1=t2;t2=t;} if(t1>tmin)tmin=t1; if(t2<tmax)tmax=t2; if(tmin>tmax)return -1; }
  if (Math.abs(dy) < 1e-9) { if (oy < y0 || oy > y1) return -1; }
  else { t1=(y0-oy)/dy; t2=(y1-oy)/dy; if(t1>t2){t=t1;t1=t2;t2=t;} if(t1>tmin)tmin=t1; if(t2<tmax)tmax=t2; if(tmin>tmax)return -1; }
  if (Math.abs(dz) < 1e-9) { if (oz < z0 || oz > z1) return -1; }
  else { t1=(z0-oz)/dz; t2=(z1-oz)/dz; if(t1>t2){t=t1;t1=t2;t2=t;} if(t1>tmin)tmin=t1; if(t2<tmax)tmax=t2; if(tmin>tmax)return -1; }
  return tmin;
}

export function castRay(ox, oy, oz, dx, dy, dz, maxT, ignore, fighters) {
  let best = maxT, hitF = null, head = false, world = false;
  const steps = Math.ceil(maxT / GRID_CELL);
  const seen = new Set();
  for (let s = 0; s <= steps; s++) {
    const t = Math.min(s * GRID_CELL, maxT);
    const px = ox + dx * t, pz = oz + dz * t;
    const cand = queryGrid(px, pz, GRID_CELL);
    for (const b of cand) {
      if (seen.has(b)) continue;
      seen.add(b);
      const tt = rayBox(ox, oy, oz, dx, dy, dz, b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, best);
      if (tt >= 0 && tt < best) { best = tt; world = true; hitF = null; }
    }
    if (t >= maxT) break;
  }
  if (dy < -1e-6) {
    const t = -oy / dy;
    if (t >= 0 && t < best) { best = t; world = true; hitF = null; }
  }
  if (fighters) {
    for (const f of fighters) {
      if (f === ignore || !f.alive) continue;
      let t = rayBox(ox, oy, oz, dx, dy, dz, f.x - 0.22, f.x + 0.22, f.y + 1.42, f.y + 1.78, f.z - 0.22, f.z + 0.22, best);
      if (t >= 0 && t < best) { best = t; hitF = f; head = true; world = false; }
      t = rayBox(ox, oy, oz, dx, dy, dz, f.x - 0.32, f.x + 0.32, f.y, f.y + 1.42, f.z - 0.32, f.z + 0.32, best);
      if (t >= 0 && t < best) { best = t; hitF = f; head = false; world = false; }
    }
  }
  return { t: best, f: hitF, head, world };
}

export function losBlocked(ox, oy, oz, tx, ty, tz) {
  const dx = tx - ox, dy = ty - oy, dz = tz - oz, L = Math.hypot(dx, dy, dz);
  if (L < 0.01) return false;
  const ux = dx / L, uy = dy / L, uz = dz / L;
  const steps = Math.ceil(L / GRID_CELL);
  const seen = new Set();
  for (let s = 0; s <= steps; s++) {
    const t = Math.min(s * GRID_CELL, L);
    const px = ox + ux * t, pz = oz + uz * t;
    const cand = queryGrid(px, pz, GRID_CELL);
    for (const b of cand) {
      if (seen.has(b)) continue;
      seen.add(b);
      if (rayBox(ox, oy, oz, ux, uy, uz, b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, L) >= 0) return true;
    }
    if (t >= L) break;
  }
  return false;
}

export function resolveXZ(f) {
  const cand = queryGrid(f.x, f.z, 2);
  for (const b of cand) {
    if (f.x < b.x0 - R || f.x > b.x1 + R || f.z < b.z0 - R || f.z > b.z1 + R) continue;
    if (f.y + STEP >= b.y1 || f.y + H <= b.y0) continue;
    const cx = clamp(f.x, b.x0, b.x1), cz = clamp(f.z, b.z0, b.z1);
    const dx = f.x - cx, dz = f.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= R * R) continue;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2), p = (R - d) / d;
      f.x += dx * p; f.z += dz * p;
    } else {
      const l = f.x - b.x0, r = b.x1 - f.x, t = f.z - b.z0, bt = b.z1 - f.z;
      const m = Math.min(l, r, t, bt);
      if (m === l) f.x = b.x0 - R;
      else if (m === r) f.x = b.x1 + R;
      else if (m === t) f.z = b.z0 - R;
      else f.z = b.z1 + R;
    }
  }
}

export function physics(f, dt) {
  f.x += f.vx * dt; f.z += f.vz * dt;
  resolveXZ(f); resolveXZ(f);
  const LL = MAP - 0.8;
  f.x = clamp(f.x, -LL, LL);
  f.z = clamp(f.z, -LL, LL);
  let g = 0;
  const cand = queryGrid(f.x, f.z, 1.5);
  for (const b of cand) {
    if (f.x > b.x0 - 0.25 && f.x < b.x1 + 0.25 && f.z > b.z0 - 0.25 && f.z < b.z1 + 0.25 && b.y1 <= f.y + STEP + 1e-4 && b.y1 > g) g = b.y1;
  }
  f.vy -= GRAV * dt;
  const oy = f.y;
  f.y += f.vy * dt;
  if (f.vy > 0) {
    for (const b of cand) {
      if (b.y0 >= oy + H - 0.05 && f.y + H > b.y0 && f.x > b.x0 - R * 0.8 && f.x < b.x1 + R * 0.8 && f.z > b.z0 - R * 0.8 && f.z < b.z1 + R * 0.8) {
        f.y = b.y0 - H; f.vy = 0; break;
      }
    }
  }
  if (f.y <= g) { f.y = g; if (f.vy < 0) f.vy = 0; f.onGround = true; }
  else f.onGround = false;
}

export function spawnOK(x, z) {
  const cand = queryGrid(x, z, 1.5);
  for (const b of cand) if (b.y0 < 1.5 && x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1) return false;
  return true;
}

/* ================================================================
   LONDON CITY GENERATOR
================================================================ */
function terraceRow(cx, cz, len, floors, facing) {
  const unitW = 6;
  const units = Math.max(3, Math.floor(len / unitW));
  const totalW = units * unitW;
  const depth = 10;
  const floorH = 3.2;
  const totalH = floors * floorH;
  const isX = facing === 'n' || facing === 's';
  const signZ = facing === 's' ? 1 : facing === 'n' ? -1 : 0;
  const w = isX ? totalW : depth;
  const d = isX ? depth : totalW;
  const brick = wpick(['brickA', 'brickB', 'brickC']);
  const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;

  addBox(cx, 0, cz, w, totalH, d, brick, true, true);
  addBox(cx, totalH, cz, w + 0.3, 0.3, d + 0.3, 'concrete2', false, true);

  for (let u = 0; u < units; u++) {
    const off = (u - (units - 1) / 2) * unitW;
    const ucx = isX ? cx + off : cx;
    const ucz = isX ? cz : cz + off;
    const doorW = 1.1, doorH = 2.4;

    addBox(
      facing === 'e' ? x1 - 0.05 : facing === 'w' ? x0 + 0.05 : ucx,
      0,
      facing === 's' ? z1 - 0.05 : facing === 'n' ? z0 + 0.05 : ucz,
      isX ? doorW : 0.15, doorH, isX ? 0.15 : doorW, 'blue', false, true
    );
    addBox(
      facing === 'e' ? x1 - 0.06 : facing === 'w' ? x0 + 0.06 : ucx,
      doorH + 0.05,
      facing === 's' ? z1 - 0.06 : facing === 'n' ? z0 + 0.06 : ucz,
      isX ? doorW : 0.15, 0.5, isX ? 0.15 : doorW, 'glass', false, true
    );
    addBox(
      facing === 'e' ? x1 + 0.35 : facing === 'w' ? x0 - 0.35 : ucx, 0,
      facing === 's' ? z1 + 0.35 : facing === 'n' ? z0 - 0.35 : ucz,
      isX ? doorW + 0.3 : 0.7, 0.15, isX ? 0.7 : doorW + 0.3, 'concrete2', false, true
    );

    for (let f = 1; f < floors; f++) {
      const y = f * floorH + 0.8;
      const proj = 0.9;
      const bayW = 2.8, bayH = 2.0;
      addBox(
        facing === 'e' ? x1 + proj / 2 : facing === 'w' ? x0 - proj / 2 : ucx, y,
        facing === 's' ? z1 + proj / 2 : facing === 'n' ? z0 - proj / 2 : ucz,
        isX ? bayW : proj, bayH, isX ? proj : bayW, brick, false, true
      );
      addBox(
        facing === 'e' ? x1 + proj - 0.05 : facing === 'w' ? x0 - proj + 0.05 : ucx, y + 0.1,
        facing === 's' ? z1 + proj - 0.05 : facing === 'n' ? z0 - proj + 0.05 : ucz,
        isX ? bayW - 0.5 : 0.08, bayH - 0.5, isX ? 0.08 : bayW - 0.5, 'glass', false, true
      );
      addBox(
        facing === 'e' ? x1 + proj / 2 : facing === 'w' ? x0 - proj / 2 : ucx, y + bayH,
        facing === 's' ? z1 + proj / 2 : facing === 'n' ? z0 - proj / 2 : ucz,
        isX ? bayW + 0.2 : proj + 0.1, 0.15, isX ? proj + 0.1 : bayW + 0.2, 'concrete2', false, true
      );
    }

    if (u % 2 === 0) {
      const cmx = isX ? ucx : cx + 2;
      const cmz = isX ? cz + 2 : ucz;
      addBox(cmx, totalH, cmz, 0.9, 3.5, 0.9, 'brickA', false, true);
      for (let p = 0; p < 2; p++) {
        addBox(cmx + (p - 0.5) * 0.4, totalH + 3.5, cmz + 0.1, 0.25, 0.5, 0.25, 'red', false, true);
      }
    }
  }

  occupy(x0 - 0.3, x1 + 0.3, z0 - 0.3, z1 + 0.3, 0.5);
}

function londonPub(cx, cz) {
  const w = 16, d = 12, floors = 3, floorH = 3.2, totalH = floors * floorH;
  addBox(cx, 0, cz, w, totalH, d, 'brickB', true, true);
  addBox(cx, totalH, cz, w + 0.3, 0.3, d + 0.3, 'concrete2', false, true);
  addBox(cx, totalH - 0.6, cz - d / 2 - 0.15, w * 0.7, 1.2, 0.12, 'green', false, true);
  addBox(cx, 0.5, cz - d / 2 - 0.05, w * 0.8, 1.8, 0.1, 'glass', false, true);
  for (let f = 1; f < floors; f++) {
    for (let i = -2; i <= 2; i++) {
      addBox(cx + i * 3, f * floorH + 0.8, cz - d / 2 - 0.05, 1.6, 1.8, 0.1, 'glass', false, true);
    }
  }
  addBox(cx, 3.4, cz - d / 2 - 1.2, w * 0.85, 0.1, 2.4, 'red', false, true);
  addBox(cx - w / 3, totalH, cz + d / 3, 1, 3, 1, 'brickA', false, true);
  addBox(cx + w / 3, totalH, cz + d / 3, 1, 3, 1, 'brickA', false, true);
  occupy(cx - w / 2 - 0.3, cx + w / 2 + 0.3, cz - d / 2 - 0.3, cz + d / 2 + 0.3, 0.5);
}

function phoneBox(x, z) {
  const s = 1.0;
  addBox(x, 0, z, 1.0 * s, 2.4 * s, 1.0 * s, 'red', true, true);
  for (let side = 0; side < 4; side++) {
    const ang = side * Math.PI / 2;
    const dx = Math.sin(ang) * 0.51 * s;
    const dz = Math.cos(ang) * 0.51 * s;
    addBox(x + dx, 0.4, z + dz, side % 2 ? 0.06 * s : 0.55 * s, 1.9 * s, side % 2 ? 0.55 * s : 0.06 * s, 'glass', false, true);
  }
  addBox(x, 2.4 * s, z, 1.1 * s, 0.2 * s, 1.1 * s, 'red', false, true);
  addBox(x, 2.5 * s, z, 1.2 * s, 0.1 * s, 1.2 * s, 'red', false, true);
  addBox(x, 2.62 * s, z, 0.3 * s, 0.15 * s, 0.3 * s, 'red', false, true);
}

function postBox(x, z) {
  addBox(x, 0, z, 0.5, 1.0, 0.5, 'red', true, true);
  addBox(x, 1.0, z, 0.55, 0.15, 0.55, 'black', false, true);
  addBox(x, 0.6, z - 0.27, 0.3, 0.15, 0.05, 'black', false, true);
}

function streetLamp(x, z) {
  addBox(x, 0, z, 0.2, 3.8, 0.2, 'black', true, true);
  addBox(x, 3.8, z, 0.4, 0.15, 0.4, 'black', false, true);
  addBox(x, 3.9, z, 0.15, 0.55, 0.15, 'black', false, true);
  addBox(x, 4.4, z, 0.35, 0.35, 0.35, 'metal', false, true);
}

function bench(x, z) {
  addBox(x, 0.35, z, 2.0, 0.1, 0.6, 'wood', true, true);
  addBox(x, 0.75, z - 0.25, 2.0, 0.6, 0.1, 'wood', false, true);
  addBox(x - 0.9, 0, z, 0.1, 0.4, 0.1, 'metal', false, true);
  addBox(x + 0.9, 0, z, 0.1, 0.4, 0.1, 'metal', false, true);
}

function bollard(x, z) {
  addBox(x, 0, z, 0.2, 0.85, 0.2, 'black', true, true);
  addBox(x, 0.85, z, 0.26, 0.15, 0.26, 'black', false, true);
}

function tree(x, z, scene) {
  const s = wr(0.9, 1.5);
  addBox(x, 0, z, 0.35 * s, 2.8 * s, 0.35 * s, 'wood', true, true);
  const leafMat = buildMaterials().paintedGreen;
  const n = 4;
  for (let i = 0; i < n; i++) {
    const r = (1.6 - i * 0.25) * s;
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), leafMat);
    m.position.set(x + wr(-0.3, 0.3), 2.8 * s + i * 0.7 * s, z + wr(-0.3, 0.3));
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
  }
}

function doubleDecker(x, z, yaw) {
  const w = 2.5, l = 11, h = 4.2;
  addBox(x, 0, z, w, h, l, 'red', true, true);
  for (const y of [1.5, 3.2]) {
    addBox(x + w / 2 + 0.01, y, z, l - 1, 0.9, 0.06, 'glass', false, true);
    addBox(x - w / 2 - 0.01, y, z, l - 1, 0.9, 0.06, 'glass', false, true);
  }
  addBox(x, 1.5, z - l / 2 - 0.01, w - 0.2, 1.0, 0.06, 'glass', false, true);
  addBox(x, 3.2, z - l / 2 - 0.01, w - 0.2, 0.9, 0.06, 'glass', false, true);
}

function blackCab(x, z) {
  const w = 1.9, l = 4.5, h = 1.9;
  addBox(x, 0, z, w, h * 0.75, l, 'black', true, true);
  addBox(x, h * 0.75, z - 0.3, w - 0.1, 0.7, l - 1.2, 'glass', false, true);
  addBox(x, h * 1.15, z - 0.3, w - 0.1, 0.1, l - 1.6, 'black', false, true);
  addBox(x - w / 2 - 0.01, 1.1, z, l - 1.2, 0.6, 0.06, 'glass', false, true);
  addBox(x + w / 2 + 0.01, 1.1, z, l - 1.2, 0.6, 0.06, 'glass', false, true);
}

export function generateCity(scene) {
  // Perimeter terrace rows
  const rowLen = 40, rowH = 3;
  const RING = 180;
  for (let side = 0; side < 4; side++) {
    for (let i = -3; i <= 3; i++) {
      const t = i * (rowLen + 4);
      let cx, cz, facing;
      if (side === 0) { cx = t; cz = -RING; facing = 's'; }
      else if (side === 1) { cx = t; cz = RING; facing = 'n'; }
      else if (side === 2) { cx = -RING; cz = t; facing = 'e'; }
      else { cx = RING; cz = t; facing = 'w'; }
      if (!isFree(cx, cz, 6)) continue;
      terraceRow(cx, cz, rowLen, rowH, facing);
    }
  }

  // Mid-ring pubs and blocks
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + wr(-0.1, 0.1);
    const r = 110 + wr(-15, 15);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!isFree(x, z, 10)) continue;
    const rr = rand();
    if (rr < 0.4) londonPub(x, z);
    else if (rr < 0.7) {
      const facing = wpick(['n', 's', 'e', 'w']);
      terraceRow(x, z, wr(20, 36), 2 + ((rand() * 2) | 0), facing);
    } else {
      const w = 10, d = 10, floors = 4, fh = 3.0;
      addBox(x, 0, z, w, floors * fh, d, 'brickA', true, true);
      addBox(x, floors * fh, z, w + 0.3, 0.3, d + 0.3, 'concrete2', false, true);
      for (let f = 0; f < floors; f++) for (let s = 0; s < 4; s++) {
        const ang = s * Math.PI / 2;
        const dx = Math.sin(ang) * (w / 2 + 0.05), dz = Math.cos(ang) * (d / 2 + 0.05);
        addBox(x + dx, f * fh + 1.0, z + dz, s % 2 ? 0.1 : 1.4, 1.6, s % 2 ? 1.4 : 0.1, 'glass', false, true);
      }
      occupy(x - w / 2 - 0.3, x + w / 2 + 0.3, z - d / 2 - 0.3, z + d / 2 + 0.3, 0.5);
    }
  }

  // Central square features
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const r = 22;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!isFree(x, z, 2)) continue;
    bench(x, z);
  }

  // Sidewalks along main cross roads
  const roadW = 9, sidewalkW = 2.5;
  for (let x = -MAP + 20; x < MAP - 20; x += 20) {
    if (isFree(x + 10, -roadW / 2 - sidewalkW / 2, 2))
      addBox(x + 10, 0, -roadW / 2 - sidewalkW / 2, 20, 0.15, sidewalkW, 'concrete2', false, true);
    if (isFree(x + 10, roadW / 2 + sidewalkW / 2, 2))
      addBox(x + 10, 0, roadW / 2 + sidewalkW / 2, 20, 0.15, sidewalkW, 'concrete2', false, true);
  }
  for (let z = -MAP + 20; z < MAP - 20; z += 20) {
    if (isFree(-roadW / 2 - sidewalkW / 2, z + 10, 2))
      addBox(-roadW / 2 - sidewalkW / 2, 0, z + 10, sidewalkW, 0.15, 20, 'concrete2', false, true);
    if (isFree(roadW / 2 + sidewalkW / 2, z + 10, 2))
      addBox(roadW / 2 + sidewalkW / 2, 0, z + 10, sidewalkW, 0.15, 20, 'concrete2', false, true);
  }

  // Street lamps
  for (let i = 0; i < 80; i++) {
    const t = i % 4;
    let x, z;
    if (t === 0) { x = wr(-MAP + 40, MAP - 40); z = -roadW / 2 - sidewalkW - 0.5; }
    else if (t === 1) { x = wr(-MAP + 40, MAP - 40); z = roadW / 2 + sidewalkW + 0.5; }
    else if (t === 2) { x = -roadW / 2 - sidewalkW - 0.5; z = wr(-MAP + 40, MAP - 40); }
    else { x = roadW / 2 + sidewalkW + 0.5; z = wr(-MAP + 40, MAP - 40); }
    if (!isFree(x, z, 1)) continue;
    streetLamp(x, z);
  }

  // Trees
  for (let i = 0; i < 60; i++) {
    const t = i % 4;
    let x, z;
    if (t === 0) { x = wr(-MAP + 40, MAP - 40); z = -roadW / 2 - sidewalkW - 2.5; }
    else if (t === 1) { x = wr(-MAP + 40, MAP - 40); z = roadW / 2 + sidewalkW + 2.5; }
    else if (t === 2) { x = -roadW / 2 - sidewalkW - 2.5; z = wr(-MAP + 40, MAP - 40); }
    else { x = roadW / 2 + sidewalkW + 2.5; z = wr(-MAP + 40, MAP - 40); }
    if (!isFree(x, z, 2)) continue;
    tree(x, z, scene);
  }

  // Phone boxes
  for (let i = 0; i < 10; i++) {
    const a = rand() * TAU, r = rand() * MAP * 0.7;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!isFree(x, z, 2)) continue;
    phoneBox(x, z);
    occupy(x - 0.5, x + 0.5, z - 0.5, z + 0.5, 0.5);
  }
  // Post boxes
  for (let i = 0; i < 14; i++) {
    const a = rand() * TAU, r = rand() * MAP * 0.7;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!isFree(x, z, 1)) continue;
    postBox(x, z);
    occupy(x - 0.3, x + 0.3, z - 0.3, z + 0.3, 0.3);
  }
  // Bollards
  for (let i = 0; i < 30; i++) {
    const a = rand() * TAU, r = 25 + rand() * 5;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!isFree(x, z, 0.5)) continue;
    bollard(x, z);
  }

  // Parked vehicles
  for (let i = 0; i < 12; i++) {
    const a = rand() * TAU, r = rand() * MAP * 0.7;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!isFree(x, z, 6)) continue;
    const yaw = rand() * Math.PI * 2;
    if (rand() < 0.3) doubleDecker(x, z, yaw);
    else if (rand() < 0.6) blackCab(x, z);
    else {
      const w = 2.0, l = 4.2, h = 1.6;
      addBox(x, 0, z, w, h * 0.7, l, wpick(['blue', 'black', 'red', 'green']), true, true);
      addBox(x, h * 0.7, z - 0.3, w - 0.1, 0.7, l - 1.2, 'glass', false, true);
    }
    occupy(x - 3, x + 3, z - 3, z + 3, 0.5);
  }

  // Perimeter wall
  const E = MAP + 1.5, L = MAP * 2 + 6;
  addBox(0, 4.5, -E, L, 9, 3, 'concrete', true, true);
  addBox(0, 4.5, E, L, 9, 3, 'concrete', true, true);
  addBox(-E, 4.5, 0, 3, 9, L, 'concrete', true, true);
  addBox(E, 4.5, 0, 3, 9, L, 'concrete', true, true);
}

/* ================================================================
   CHARACTER RIG (bone hierarchy + capsule limbs)
================================================================ */
export function buildCharacterRig(palette, name) {
  const root = new THREE.Group();
  const bones = {};
  const isNoDeX = name === 'NoDeX';

  const M = buildMaterials();
  const skinMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.skinTone || '#c89870').getHex(),
    roughness: 0.65, metalness: 0.02, envMapIntensity: 0.4,
  });
  const clothMat = new THREE.MeshStandardMaterial({
    map: palette.texture, roughness: 0.92, metalness: 0.0, envMapIntensity: 0.35,
  });
  const clothDark = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.dark || '#101010').getHex(),
    roughness: 0.95, metalness: 0.0, envMapIntensity: 0.3,
  });
  const bootMat = new THREE.MeshStandardMaterial({ color: 0x0e1014, roughness: 0.55, metalness: 0.15, envMapIntensity: 0.8 });
  const metalMat = new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.35, metalness: 0.85, envMapIntensity: 1.4 });
  const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(palette.accent || '#ff6a2b').getHex(), roughness: 0.5, metalness: 0.1, envMapIntensity: 0.8 });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x0a1a20, roughness: 0.1, metalness: 0.9, envMapIntensity: 2.0, emissive: 0x1a4a66, emissiveIntensity: 0.6 });

  function bone(parent, name, x, y, z) {
    const b = new THREE.Group();
    b.position.set(x, y, z);
    parent.add(b);
    bones[name] = b;
    return b;
  }
  function capsule(parent, len, r, mat) {
    const geo = new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 4, 8);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = -len / 2;
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function box(parent, w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function sphere(parent, r, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  }

  // Bone hierarchy
  const pelvis = bone(root, 'pelvis', 0, 0.9, 0);
  const spine1 = bone(pelvis, 'spine1', 0, 0.10, 0);
  const spine2 = bone(spine1, 'spine2', 0, 0.14, 0);
  const chest = bone(spine2, 'chest', 0, 0.14, 0);
  const neck = bone(chest, 'neck', 0, 0.20, 0);
  const head = bone(neck, 'head', 0, 0.08, 0);

  const shoulderL = bone(chest, 'shoulderL', -0.20, 0.16, 0);
  const upperArmL = bone(shoulderL, 'upperArmL', 0, -0.06, 0);
  const lowerArmL = bone(upperArmL, 'lowerArmL', 0, -0.28, 0);
  const handL = bone(lowerArmL, 'handL', 0, -0.24, 0);

  const shoulderR = bone(chest, 'shoulderR', 0.20, 0.16, 0);
  const upperArmR = bone(shoulderR, 'upperArmR', 0, -0.06, 0);
  const lowerArmR = bone(upperArmR, 'lowerArmR', 0, -0.28, 0);
  const handR = bone(lowerArmR, 'handR', 0, -0.24, 0);

  const upperLegL = bone(pelvis, 'upperLegL', -0.09, -0.10, 0);
  const lowerLegL = bone(upperLegL, 'lowerLegL', 0, -0.44, 0);
  const footL = bone(lowerLegL, 'footL', 0, -0.42, 0);

  const upperLegR = bone(pelvis, 'upperLegR', 0.09, -0.10, 0);
  const lowerLegR = bone(upperLegR, 'lowerLegR', 0, -0.44, 0);
  const footR = bone(lowerLegR, 'footR', 0, -0.42, 0);

  // Meshes
  box(pelvis, 0.34, 0.22, 0.24, clothMat, 0, -0.02, 0);
  box(spine1, 0.34, 0.20, 0.24, clothMat, 0, 0.04, 0);
  box(spine2, 0.36, 0.22, 0.26, clothMat, 0, 0.04, 0);
  if (palette.vest) {
    box(chest, 0.42, 0.34, 0.30, clothDark, 0, 0.02, 0);
    box(chest, 0.10, 0.10, 0.06, accentMat, -0.13, -0.05, -0.16);
    box(chest, 0.10, 0.10, 0.06, accentMat, 0.13, -0.05, -0.16);
    if (isNoDeX) box(chest, 0.14, 0.05, 0.10, accentMat, 0.16, 0.14, -0.10);
  }
  if (palette.back) {
    box(chest, 0.28, 0.36, 0.16, clothDark, 0, 0.04, 0.19);
    box(chest, 0.24, 0.06, 0.02, accentMat, 0, 0.18, 0.27);
  }

  box(neck, 0.10, 0.08, 0.10, skinMat, 0, 0.03, 0);
  sphere(head, 0.13, skinMat, 0, 0.06, 0);

  if (palette.helmet) {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.145, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), clothDark);
    dome.position.y = 0.06; dome.castShadow = true; head.add(dome);
    box(head, 0.30, 0.05, 0.30, clothDark, 0, -0.04, 0);
    box(head, 0.24, 0.09, 0.02, visorMat, 0, 0.05, -0.13);
    box(head, 0.06, 0.05, 0.06, metalMat, 0, 0.10, -0.13);
  } else if (palette.cap) {
    box(head, 0.26, 0.08, 0.26, clothDark, 0, 0.14, 0);
    box(head, 0.24, 0.02, 0.10, clothDark, 0, 0.12, -0.16);
  } else if (palette.beret) {
    box(head, 0.24, 0.06, 0.24, accentMat, 0, 0.14, 0);
    box(head, 0.04, 0.04, 0.04, metalMat, 0.10, 0.17, 0);
  } else {
    box(head, 0.26, 0.03, 0.10, clothDark, 0, 0.13, -0.05);
  }
  box(head, 0.22, 0.03, 0.02, new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.4 }), 0, 0.06, -0.13);

  capsule(upperArmL, 0.26, 0.055, clothMat); sphere(upperArmL, 0.065, clothMat, 0, 0, 0);
  capsule(lowerArmL, 0.26, 0.05, clothMat); sphere(lowerArmL, 0.06, clothMat, 0, 0, 0);
  box(handL, 0.08, 0.14, 0.06, skinMat, 0, -0.13, 0);

  capsule(upperArmR, 0.26, 0.055, clothMat); sphere(upperArmR, 0.065, clothMat, 0, 0, 0);
  capsule(lowerArmR, 0.26, 0.05, clothMat); sphere(lowerArmR, 0.06, clothMat, 0, 0, 0);
  box(handR, 0.08, 0.14, 0.06, skinMat, 0, -0.13, 0);

  capsule(upperLegL, 0.42, 0.075, clothMat); sphere(upperLegL, 0.085, clothMat, 0, 0, 0);
  capsule(lowerLegL, 0.40, 0.065, clothMat); sphere(lowerLegL, 0.075, clothMat, 0, 0, 0);
  box(footL, 0.14, 0.10, 0.26, bootMat, 0, -0.04, -0.06);

  capsule(upperLegR, 0.42, 0.075, clothMat); sphere(upperLegR, 0.085, clothMat, 0, 0, 0);
  capsule(lowerLegR, 0.40, 0.065, clothMat); sphere(lowerLegR, 0.075, clothMat, 0, 0, 0);
  box(footR, 0.14, 0.10, 0.26, bootMat, 0, -0.04, -0.06);

  // Name label
  const lc = document.createElement('canvas'); lc.width = 256; lc.height = 64;
  const lg = lc.getContext('2d');
  lg.font = '600 30px "Chakra Petch",sans-serif';
  lg.textAlign = 'center'; lg.textBaseline = 'middle';
  lg.lineWidth = 6; lg.strokeStyle = 'rgba(0,0,0,.8)';
  lg.strokeText(name, 128, 32); lg.fillStyle = '#fff'; lg.fillText(name, 128, 32);
  const ltex = new THREE.CanvasTexture(lc);
  ltex.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: ltex, transparent: true, fog: false, depthTest: false }));
  label.scale.set(2.4, 0.6, 1); label.position.y = 2.05;
  root.add(label);

  return { root, bones, label };
}

/* ================================================================
   WEAPON MODELS (multi-part, animatable)
================================================================ */
export function buildWeapon(kind) {
  const group = new THREE.Group();
  const M = buildMaterials();
  const dk = new THREE.MeshStandardMaterial({ color: 0x1a1e24, roughness: 0.45, metalness: 0.4, envMapIntensity: 1.0 });
  const md = new THREE.MeshStandardMaterial({ color: 0x2e343c, roughness: 0.4, metalness: 0.5, envMapIntensity: 1.1 });
  const lt = new THREE.MeshStandardMaterial({ color: 0x5a6068, roughness: 0.35, metalness: 0.75, envMapIntensity: 1.3 });
  const wood = M.wood;
  const accent = new THREE.MeshStandardMaterial({ color: 0xff6a2b, roughness: 0.4, metalness: 0.1, envMapIntensity: 1.0 });

  function bx(parent, w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true; parent.add(m); return m;
  }
  function cyl(parent, r, len, mat, x, y, z, axis) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), mat);
    if (axis === 'x') m.rotation.z = Math.PI / 2;
    else if (axis === 'z') m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    m.castShadow = true; parent.add(m); return m;
  }

  const body = new THREE.Group();
  const mag = new THREE.Group();
  const bolt = new THREE.Group();
  group.add(body, mag, bolt);

  if (kind === 'pistol') {
    bx(body, 0.05, 0.05, 0.20, dk, 0, 0.02, -0.12);
    bx(body, 0.045, 0.05, 0.16, md, 0, -0.03, -0.10);
    cyl(body, 0.013, 0.18, lt, 0, 0.02, -0.28, 'z');
    bx(body, 0.05, 0.14, 0.06, dk, 0, -0.12, -0.02);
    bx(body, 0.03, 0.03, 0.06, dk, 0, 0.05, -0.22);
    bx(body, 0.03, 0.02, 0.04, dk, 0, 0.05, -0.32);
    bx(mag, 0.04, 0.10, 0.045, md, 0, -0.10, -0.02);
    bx(bolt, 0.045, 0.025, 0.06, lt, 0, 0.03, -0.16);
  } else if (kind === 'smg') {
    bx(body, 0.06, 0.08, 0.32, md, 0, 0.02, -0.18);
    cyl(body, 0.015, 0.28, lt, 0, 0.03, -0.48, 'z');
    bx(body, 0.05, 0.10, 0.20, dk, 0, -0.06, 0.02);
    bx(body, 0.06, 0.18, 0.06, dk, 0, -0.12, -0.10);
    bx(body, 0.05, 0.14, 0.05, dk, 0, -0.10, -0.28);
    bx(body, 0.03, 0.03, 0.04, dk, 0, 0.08, -0.28);
    bx(body, 0.03, 0.03, 0.04, dk, 0, 0.08, -0.42);
    bx(bolt, 0.04, 0.03, 0.05, lt, 0, 0.05, -0.30);
    bx(mag, 0.045, 0.14, 0.05, md, 0, -0.14, -0.06);
  } else if (kind === 'rifle') {
    bx(body, 0.06, 0.09, 0.44, md, 0, 0.02, -0.20);
    cyl(body, 0.014, 0.34, lt, 0, 0.03, -0.60, 'z');
    bx(body, 0.05, 0.08, 0.22, dk, 0, -0.01, 0.10);
    bx(body, 0.06, 0.16, 0.06, dk, 0, -0.12, -0.12);
    bx(body, 0.06, 0.05, 0.24, dk, 0, -0.03, -0.32);
    bx(body, 0.03, 0.03, 0.05, dk, 0, 0.08, -0.32);
    bx(body, 0.03, 0.03, 0.05, dk, 0, 0.08, -0.48);
    bx(bolt, 0.045, 0.03, 0.06, lt, 0, 0.06, -0.36);
    bx(mag, 0.05, 0.18, 0.06, md, 0, -0.16, -0.14);
    bx(body, 0.02, 0.02, 0.10, accent, 0, 0.075, -0.36);
  } else if (kind === 'bullpup') {
    bx(body, 0.06, 0.10, 0.36, md, 0, 0.02, -0.16);
    cyl(body, 0.013, 0.30, lt, 0, 0.03, -0.50, 'z');
    bx(body, 0.08, 0.10, 0.18, md, 0, -0.01, 0.10);
    bx(body, 0.06, 0.14, 0.06, dk, 0, -0.10, 0.02);
    bx(body, 0.04, 0.03, 0.05, dk, 0, 0.08, -0.28);
    bx(body, 0.04, 0.03, 0.05, dk, 0, 0.08, -0.44);
    bx(bolt, 0.045, 0.03, 0.06, lt, 0, 0.06, -0.32);
    bx(mag, 0.05, 0.16, 0.055, md, 0, -0.14, -0.06);
  } else if (kind === 'dmr') {
    bx(body, 0.06, 0.09, 0.52, md, 0, 0.02, -0.24);
    cyl(body, 0.014, 0.44, lt, 0, 0.03, -0.72, 'z');
    bx(body, 0.06, 0.10, 0.28, wood, 0, -0.01, 0.12);
    bx(body, 0.06, 0.16, 0.06, dk, 0, -0.12, -0.16);
    bx(body, 0.06, 0.06, 0.30, dk, 0, -0.02, -0.40);
    bx(body, 0.10, 0.06, 0.24, dk, 0, 0.09, -0.30);
    cyl(body, 0.05, 0.20, lt, 0, 0.09, -0.42, 'z');
    bx(bolt, 0.045, 0.03, 0.06, lt, 0, 0.06, -0.42);
    bx(mag, 0.05, 0.16, 0.06, md, 0, -0.16, -0.18);
  } else if (kind === 'lmg') {
    bx(body, 0.08, 0.11, 0.56, md, 0, 0.02, -0.26);
    cyl(body, 0.018, 0.46, lt, 0, 0.03, -0.72, 'z');
    bx(body, 0.05, 0.09, 0.20, dk, 0, -0.02, 0.10);
    bx(body, 0.06, 0.16, 0.06, dk, 0, -0.13, -0.14);
    bx(body, 0.06, 0.06, 0.30, dk, 0, -0.03, -0.42);
    bx(body, 0.14, 0.20, 0.20, dk, 0, -0.14, -0.10);
    bx(bolt, 0.045, 0.03, 0.06, lt, 0, 0.06, -0.44);
    bx(mag, 0.045, 0.05, 0.14, md, 0, -0.06, -0.10);
  } else if (kind === 'shotgun') {
    bx(body, 0.07, 0.08, 0.44, md, 0, 0.02, -0.22);
    cyl(body, 0.020, 0.52, lt, 0, 0.04, -0.66, 'z');
    cyl(body, 0.020, 0.52, dk, 0, -0.01, -0.66, 'z');
    bx(body, 0.06, 0.06, 0.20, wood, 0, -0.04, -0.44);
    bx(body, 0.06, 0.10, 0.24, wood, 0, -0.02, 0.06);
    bx(bolt, 0.045, 0.03, 0.06, lt, 0, 0.05, -0.44);
    bx(mag, 0.04, 0.04, 0.04, md, 0, -0.06, -0.02);
  } else { // sniper
    bx(body, 0.06, 0.09, 0.50, md, 0, 0.02, -0.24);
    cyl(body, 0.016, 0.72, lt, 0, 0.03, -0.86, 'z');
    bx(body, 0.06, 0.10, 0.24, dk, 0, -0.01, 0.10);
    bx(body, 0.06, 0.16, 0.06, dk, 0, -0.12, -0.16);
    bx(body, 0.06, 0.06, 0.30, dk, 0, -0.02, -0.40);
    bx(body, 0.09, 0.08, 0.30, dk, 0, 0.11, -0.32);
    cyl(body, 0.045, 0.10, lt, 0, 0.11, -0.50, 'z');
    bx(body, 0.06, 0.06, 0.06, lt, 0, 0.11, -0.54);
    bx(bolt, 0.04, 0.04, 0.08, lt, 0.06, 0.05, -0.30);
    bx(mag, 0.05, 0.12, 0.055, md, 0, -0.14, -0.18);
  }

  group.traverse(o => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; }
  });

  return { group, body, mag, bolt };
}

/* ================================================================
   EFFECTS (tracers, puffs, decals)
================================================================ */
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.tracerGeo = new THREE.CylinderGeometry(0.03, 0.03, 1, 5);
    this.tracerGeo.translate(0, -0.5, 0);
    this.tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffdc90, transparent: true, opacity: 0.85,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    this.decalGeo = new THREE.CircleGeometry(0.06, 8);
    this.decalMat = new THREE.MeshBasicMaterial({
      color: 0x080808, transparent: true, opacity: 0.85, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4,
    });
    this.muzzleLight = new THREE.PointLight(0xffb060, 0, 12, 2);
    this.muzzleLight.position.set(0.2, -0.1, -1);
    this.muzzleT = 0;
  }

  attachMuzzleLight(camera) {
    camera.add(this.muzzleLight);
  }

  flashMuzzle(pos) {
    this.muzzleLight.position.copy(pos);
    this.muzzleLight.intensity = 22;
    this.muzzleT = 0.045;
  }

  tracer(from, to, width) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 0.5) return;
    const use = Math.min(len, 140);
    const mesh = new THREE.Mesh(this.tracerGeo, this.tracerMat);
    mesh.position.copy(from);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
    mesh.scale.set(width || 1, use, width || 1);
    this.scene.add(mesh);
    this.items.push({ mesh, life: 0.05, max: 0.05, type: 'tracer' });
  }

  puff(x, y, z, kind, n) {
    const colors = { dust: 0xdcd6c2, blood: 0xc0392b, spark: 0xffd070 };
    const mat = new THREE.MeshBasicMaterial({ color: colors[kind] || 0xffffff });
    for (let i = 0; i < (n || 3); i++) {
      const s = rnd(0.08, 0.2);
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
      m.position.set(x + rnd(-0.12, 0.12), y + rnd(-0.12, 0.12), z + rnd(-0.12, 0.12));
      m.scale.setScalar(s);
      this.scene.add(m);
      this.items.push({ mesh: m, life: 0.28, max: 0.28, type: 'puff', s, vy: rnd(0.4, 1.6) });
    }
  }

  decal(pos, normal) {
    const m = new THREE.Mesh(this.decalGeo, this.decalMat.clone());
    m.position.copy(pos);
    m.lookAt(pos.clone().add(normal));
    m.position.addScaledVector(normal, 0.01);
    const scale = rnd(0.7, 1.3);
    m.scale.setScalar(scale);
    this.scene.add(m);
    this.items.push({ mesh: m, life: 6, max: 6, type: 'decal' });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const e = this.items[i];
      e.life -= dt;
      if (e.life <= 0) {
        this.scene.remove(e.mesh);
        if (e.type === 'decal') { e.mesh.material.dispose(); }
        this.items.splice(i, 1);
      } else if (e.type === 'tracer') {
        e.mesh.material.opacity = (e.life / e.max) * 0.85;
      } else if (e.type === 'puff') {
        e.mesh.scale.setScalar(Math.max(0.001, e.s * (e.life / e.max)));
        e.mesh.position.y += dt * e.vy;
      } else if (e.type === 'decal') {
        e.mesh.material.opacity = Math.min(0.85, e.life / 2);
      }
    }
    if (this.muzzleT > 0) {
      this.muzzleT -= dt;
      this.muzzleLight.intensity *= Math.max(0, this.muzzleT / 0.045);
      if (this.muzzleT <= 0) this.muzzleLight.intensity = 0;
    }
  }
}

/* ================================================================
   POST-PROCESSING PIPELINE
================================================================ */
export function buildComposer(renderer, scene, camera) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const ssao = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
  ssao.kernelRadius = 8;
  ssao.minDistance = 0.002;
  ssao.maxDistance = 0.1;
  composer.addPass(ssao);

  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.45, 0.4, 0.85);
  composer.addPass(bloom);

  const grade = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, time: { value: 0 },
      grain: { value: 0.045 }, chroma: { value: 0.0018 },
      vignette: { value: 0.28 }, contrast: { value: 1.05 }, saturation: { value: 1.05 },
    },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float time,grain,chroma,vignette,contrast,saturation;
      varying vec2 vUv;
      float rand(vec2 c){return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453);}
      void main(){
        vec2 uv=vUv;vec2 d=uv-0.5;float r2=dot(d,d);
        float ca=chroma*(r2*4.0);
        vec3 col;
        col.r=texture2D(tDiffuse,uv+d*ca).r;
        col.g=texture2D(tDiffuse,uv).g;
        col.b=texture2D(tDiffuse,uv-d*ca).b;
        col=(col-0.5)*contrast+0.5;
        float l=dot(col,vec3(0.2126,0.7152,0.0722));
        col=mix(vec3(l),col,saturation);
        col*=1.0-smoothstep(0.35,0.95,r2)*vignette;
        float g=rand(uv*time)-0.5;
        col+=g*grain;
        gl_FragColor=vec4(col,1.0);
      }`,
  });
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  const sm = new SMAAPass(window.innerWidth * devicePixelRatio, window.innerHeight * devicePixelRatio);
  composer.addPass(sm);

  return { composer, ssao, bloom, grade, sm };
}
