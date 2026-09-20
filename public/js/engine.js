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
   TEXTURES & PROCEDURAL NORMAL MAPS
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

function normalMapFromCanvas(srcCanvas, strength = 1.8) {
  const S = srcCanvas.width;
  const sCtx = srcCanvas.getContext('2d');
  const src = sCtx.getImageData(0, 0, S, S).data;
  const outCanvas = canvas2D(S);
  const outCtx = outCanvas.getContext('2d');
  const outData = outCtx.createImageData(S, S);
  const d = outData.data;

  for (let y = 0; y < S; y++) {
    const ym = (y - 1 + S) % S, yp = (y + 1) % S;
    for (let x = 0; x < S; x++) {
      const xm = (x - 1 + S) % S, xp = (x + 1) % S;
      const hL = src[(y * S + xm) * 4];
      const hR = src[(y * S + xp) * 4];
      const hU = src[(ym * S + x) * 4];
      const hD = src[(yp * S + x) * 4];
      const dx = (hR - hL) / 255.0 * strength;
      const dy = (hD - hU) / 255.0 * strength;
      const dz = 1.0;
      const len = Math.hypot(dx, dy, dz) || 1;
      const idx = (y * S + x) * 4;
      d[idx]     = Math.floor((-dx / len * 0.5 + 0.5) * 255);
      d[idx + 1] = Math.floor((-dy / len * 0.5 + 0.5) * 255);
      d[idx + 2] = Math.floor((dz / len * 0.5 + 0.5) * 255);
      d[idx + 3] = 255;
    }
  }
  outCtx.putImageData(outData, 0, 0);
  return texFromCanvas(outCanvas, 1, false);
}

function brickTex(seed, hue) {
  const S = 512, c = canvas2D(S), g = c.getContext('2d'), rng = mulberry32(seed);
  // Realistic London mortar base
  g.fillStyle = '#8f887d';
  g.fillRect(0, 0, S, S);
  const bw = 64, bh = 28, gap = 4;
  for (let y = 0; y < S; y += bh) {
    const off = ((y / bh) | 0) % 2 ? bw / 2 : 0;
    for (let x = -bw; x < S + bw; x += bw) {
      const l = 24 + rng() * 22;
      const sat = 22 + rng() * 18;
      g.fillStyle = `hsl(${hue + rng() * 12 - 6},${sat}%,${l}%)`;
      // Main brick face
      g.fillRect(x + off + gap / 2, y + gap / 2, bw - gap, bh - gap);
      // Subtle top/left bevel highlight
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(x + off + gap / 2, y + gap / 2, bw - gap, 2);
      g.fillRect(x + off + gap / 2, y + gap / 2, 2, bh - gap);
      // Bottom/right shadow
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(x + off + gap / 2, y + bh - gap / 2 - 2, bw - gap, 2);
      g.fillRect(x + off + bw - gap / 2 - 2, y + gap / 2, 2, bh - gap);
    }
  }
  // Realistic urban weathering, soot drips & grime
  for (let i = 0; i < 30000; i++) {
    const rx = rng() * S, ry = rng() * S;
    g.fillStyle = `hsla(30,10%,${rng() * 60}%,${rng() * 0.12})`;
    g.fillRect(rx, ry, 1 + rng() * 2, 1 + rng() * 2);
  }
  return c;
}

function concreteTex(seed) {
  const S = 512, c = canvas2D(S), g = c.getContext('2d'), rng = mulberry32(seed);
  g.fillStyle = '#7a766c';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 400; i++) {
    const x = rng() * S, y = rng() * S, r = 4 + rng() * 35;
    g.fillStyle = `hsla(35,10%,${32 + rng() * 35}%,0.35)`;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.beginPath(); g.arc(x + ox, y + oy, r, 0, 6.28); g.fill();
    }
  }
  for (let i = 0; i < 16000; i++) {
    g.fillStyle = `hsla(30,8%,${15 + rng() * 50}%,${rng() * 0.35})`;
    g.fillRect(rng() * S, rng() * S, 1 + rng() * 2, 1 + rng() * 2);
  }
  for (let i = 0; i < 25; i++) {
    g.strokeStyle = `rgba(18,14,10,${0.2 + rng() * 0.35})`;
    g.lineWidth = 1 + rng() * 2;
    g.beginPath();
    let x = rng() * S, y = rng() * S;
    g.moveTo(x, y);
    for (let j = 0; j < 6; j++) {
      x += (rng() - 0.5) * 50;
      y += (rng() - 0.5) * 50;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  return c;
}

function pavingTex(seed) {
  const S = 512, c = canvas2D(S), g = c.getContext('2d'), rng = mulberry32(seed);
  g.fillStyle = '#4a4844';
  g.fillRect(0, 0, S, S);
  const sw = 64, sh = 64, gap = 4;
  for (let y = 0; y < S; y += sh) {
    const off = ((y / sh) | 0) % 2 ? sw / 2 : 0;
    for (let x = -sw; x < S + sw; x += sw) {
      const l = 42 + rng() * 16;
      g.fillStyle = `hsl(38, 6%, ${l}%)`;
      g.fillRect(x + off + gap / 2, y + gap / 2, sw - gap, sh - gap);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(x + off + gap / 2, y + gap / 2, sw - gap, 2);
      g.fillRect(x + off + gap / 2, y + gap / 2, 2, sh - gap);
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(x + off + gap / 2, y + sh - gap / 2 - 2, sw - gap, 2);
      g.fillRect(x + off + sw - gap / 2 - 2, y + gap / 2, 2, sh - gap);
    }
  }
  for (let i = 0; i < 15000; i++) {
    g.fillStyle = `hsla(0,0%,${rng() * 100}%,${rng() * 0.08})`;
    g.fillRect(rng() * S, rng() * S, 1 + rng() * 2, 1 + rng() * 2);
  }
  return c;
}

function asphaltTex(seed) {
  const S = 512, c = canvas2D(S), g = c.getContext('2d'), rng = mulberry32(seed);
  g.fillStyle = '#222326';
  g.fillRect(0, 0, S, S);
  // Fine aggregate
  for (let i = 0; i < 50000; i++) {
    g.fillStyle = `hsla(0,0%,${8 + rng() * 55}%,${rng() * 0.45})`;
    g.fillRect(rng() * S, rng() * S, 1 + rng() * 2, 1 + rng() * 2);
  }
  // Subtle reflective damp sheen / puddles
  for (let i = 0; i < 15; i++) {
    const x = rng() * S, y = rng() * S, rx = 20 + rng() * 50, ry = 10 + rng() * 25;
    const grad = g.createRadialGradient(x, y, 2, x, y, rx);
    grad.addColorStop(0, 'rgba(15, 20, 25, 0.45)');
    grad.addColorStop(1, 'rgba(15, 20, 25, 0.0)');
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(x, y, rx, ry, rng() * Math.PI, 0, 6.28);
    g.fill();
  }
  return c;
}

function rustTex(seed) {
  const S = 512, c = canvas2D(S), g = c.getContext('2d'), rng = mulberry32(seed);
  g.fillStyle = '#45321f';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 300; i++) {
    const x = rng() * S, y = rng() * S, r = 6 + rng() * 45;
    g.fillStyle = `hsla(${14 + rng() * 26},${40 + rng() * 30}%,${18 + rng() * 26}%,0.65)`;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.beginPath(); g.arc(x + ox, y + oy, r, 0, 6.28); g.fill();
    }
  }
  for (let i = 0; i < 16000; i++) {
    g.fillStyle = `hsla(${18 + rng() * 30},${45 + rng() * 40}%,${12 + rng() * 45}%,${rng() * 0.55})`;
    g.fillRect(rng() * S, rng() * S, 1 + rng() * 3, 1 + rng() * 3);
  }
  return c;
}

function woodTex(seed) {
  const S = 512, c = canvas2D(S), g = c.getContext('2d'), rng = mulberry32(seed);
  g.fillStyle = '#553721';
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 3) {
    const b = 0.7 + rng() * 0.6;
    g.fillStyle = `rgba(${110 * b},${68 * b},${34 * b},${rng() * 0.6})`;
    g.fillRect(0, y, S, 2 + rng() * 3);
  }
  for (let i = 0; i < 80; i++) {
    g.strokeStyle = `rgba(18,10,4,${0.2 + rng() * 0.4})`;
    g.lineWidth = 1;
    g.beginPath();
    const y = rng() * S;
    g.moveTo(0, y);
    for (let x = 0; x < S; x += 8) g.lineTo(x, y + (rng() - 0.5) * 5);
    g.stroke();
  }
  // Plank joints
  for (let x = 0; x < S; x += 64) {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(x, 0, 2, S);
  }
  return c;
}

function woodDarkTex(seed) {
  const S = 512, c = canvas2D(S), g = c.getContext('2d'), rng = mulberry32(seed);
  g.fillStyle = '#2b1a10';
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 2) {
    const b = 0.6 + rng() * 0.7;
    g.fillStyle = `rgba(${70 * b},${40 * b},${22 * b},${rng() * 0.5})`;
    g.fillRect(0, y, S, 2 + rng() * 2);
  }
  for (let i = 0; i < 40; i++) {
    g.strokeStyle = `rgba(10,5,2,${0.3 + rng() * 0.3})`;
    g.lineWidth = 1;
    g.beginPath();
    const y = rng() * S;
    g.moveTo(0, y);
    for (let x = 0; x < S; x += 8) g.lineTo(x, y + (rng() - 0.5) * 3);
    g.stroke();
  }
  return c;
}

function tacticalFabricTex(seed) {
  const S = 256, c = canvas2D(S), g = c.getContext('2d'), rng = mulberry32(seed);
  g.fillStyle = '#222622';
  g.fillRect(0, 0, S, S);
  // Ripstop grid
  for (let x = 0; x < S; x += 8) {
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fillRect(x, 0, 1, S);
  }
  for (let y = 0; y < S; y += 8) {
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fillRect(0, y, S, 1);
  }
  for (let i = 0; i < 6000; i++) {
    g.fillStyle = `hsla(110,8%,${15 + rng() * 20}%,${rng() * 0.3})`;
    g.fillRect(rng() * S, rng() * S, 2, 2);
  }
  return c;
}

function screenTex() {
  const S = 256, c = canvas2D(S), g = c.getContext('2d');
  g.fillStyle = '#061218';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = '#0df5c6';
  g.lineWidth = 2;
  // Radar circle
  g.beginPath(); g.arc(128, 128, 90, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(128, 128, 50, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(128, 20); g.lineTo(128, 236); g.stroke();
  g.beginPath(); g.moveTo(20, 128); g.lineTo(236, 128); g.stroke();
  // Tactical telemetry text
  g.font = 'bold 16px monospace';
  g.fillStyle = '#0df5c6';
  g.fillText('ZONE 4: ACTIVE', 24, 40);
  g.fillText('SECTOR D-7', 24, 60);
  g.font = '12px monospace';
  g.fillStyle = '#4ee3ff';
  g.fillText('RADAR SCAN: 360°', 24, 215);
  g.fillText('SYNC: ONLINE', 24, 235);
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
  const cBrickRed = brickTex(1, 14);
  const cBrickBrown = brickTex(2, 24);
  const cBrickCream = brickTex(3, 40);
  const cConcrete = concreteTex(4);
  const cConcrete2 = concreteTex(5);
  const cPaving = pavingTex(10);
  const cAsphalt = asphaltTex(6);
  const cRust = rustTex(7);
  const cRust2 = rustTex(8);
  const cWood = woodTex(9);
  const cWoodDark = woodDarkTex(11);
  const cTacticalFabric = tacticalFabricTex(12);
  const cScreen = screenTex();

  TEX = {
    brickRed:   texFromCanvas(cBrickRed, 1, true),
    brickBrown: texFromCanvas(cBrickBrown, 1, true),
    brickCream: texFromCanvas(cBrickCream, 1, true),
    concrete:   texFromCanvas(cConcrete, 1, true),
    concrete2:  texFromCanvas(cConcrete2, 1, true),
    paving:     texFromCanvas(cPaving, 1, true),
    asphalt:    texFromCanvas(cAsphalt, 1, true),
    rust:       texFromCanvas(cRust, 1, true),
    rust2:      texFromCanvas(cRust2, 1, true),
    wood:       texFromCanvas(cWood, 1, true),
    woodDark:   texFromCanvas(cWoodDark, 1, true),
    fabric:     texFromCanvas(cTacticalFabric, 1, true),
    screen:     texFromCanvas(cScreen, 1, true),
  };

  TEX.concreteRough = texFromCanvas(roughnessFrom(cConcrete, 70), 1, false);
  TEX.brickRough    = texFromCanvas(roughnessFrom(cBrickRed, 60), 1, false);
  TEX.metalRough    = texFromCanvas(roughnessFrom(cRust, 90), 1, false);

  TEX.brickNorm     = normalMapFromCanvas(cBrickRed, 2.2);
  TEX.pavingNorm    = normalMapFromCanvas(cPaving, 2.0);
  TEX.concreteNorm  = normalMapFromCanvas(cConcrete, 1.4);
  TEX.woodNorm      = normalMapFromCanvas(cWood, 1.5);
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
      normalMap: opts.nm || null,
      normalScale: opts.ns ? new THREE.Vector2(opts.ns, opts.ns) : (opts.nm ? new THREE.Vector2(1, 1) : null),
      roughnessMap: opts.rm || null,
      envMapIntensity: opts.env !== undefined ? opts.env : 0.8,
      side: opts.side || THREE.FrontSide,
      transparent: opts.tr || false,
      opacity: opts.op !== undefined ? opts.op : 1,
      emissive: opts.em || 0x000000,
      emissiveIntensity: opts.emi || 0,
      emissiveMap: opts.emMap || null,
    });
  }
  MAT = {
    brickA:       pbr(0xffffff, { r:0.92, map:T.brickRed, nm:T.brickNorm, rm:T.brickRough, env:0.5 }),
    brickB:       pbr(0xffffff, { r:0.92, map:T.brickBrown, nm:T.brickNorm, rm:T.brickRough, env:0.5 }),
    brickC:       pbr(0xffffff, { r:0.92, map:T.brickCream, nm:T.brickNorm, rm:T.brickRough, env:0.5 }),
    concrete:     pbr(0xffffff, { r:0.94, map:T.concrete, nm:T.concreteNorm, rm:T.concreteRough, env:0.5 }),
    concrete2:    pbr(0xffffff, { r:0.94, map:T.concrete2, nm:T.concreteNorm, rm:T.concreteRough, env:0.5 }),
    paving:       pbr(0xffffff, { r:0.86, map:T.paving, nm:T.pavingNorm, env:0.7 }),
    asphalt:      pbr(0xffffff, { r:0.72, m:0.08, map:T.asphalt, env:0.85 }),
    rust:         pbr(0xffffff, { r:0.75, m:0.55, map:T.rust, rm:T.metalRough, env:1.2 }),
    rust2:        pbr(0xffffff, { r:0.70, m:0.60, map:T.rust2, rm:T.metalRough, env:1.2 }),
    wood:         pbr(0xffffff, { r:0.82, map:T.wood, nm:T.woodNorm, env:0.4 }),
    woodDark:     pbr(0xffffff, { r:0.55, map:T.woodDark, env:0.6 }),
    metal:        pbr(0x3a4048, { r:0.32, m:0.92, env:1.5 }),
    metalDark:    pbr(0x181c22, { r:0.40, m:0.88, env:1.4 }),
    paintedRed:   pbr(0xa82030, { r:0.35, m:0.18, env:1.1 }),
    paintedBlue:  pbr(0x1a3a5a, { r:0.35, m:0.18, env:1.1 }),
    paintedGreen: pbr(0x2a5a3a, { r:0.35, m:0.18, env:1.1 }),
    paintedBlack: pbr(0x141414, { r:0.38, m:0.22, env:1.1 }),
    cautionYellow:pbr(0xe5a912, { r:0.42, m:0.10, env:1.0 }),
    leather:      pbr(0x221a14, { r:0.60, m:0.05, env:0.7 }),
    screenGlow:   pbr(0xffffff, { r:0.2, m:0.1, map:T.screen, em:0xffffff, emi:1.4, emMap:T.screen }),
    fabricTactical: pbr(0xffffff, { r:0.92, m:0.0, map:T.fabric, env:0.4 }),
    glass: new THREE.MeshStandardMaterial({
      color: 0x8ab8d0, transparent: true, opacity: 0.32,
      roughness: 0.04, metalness: 0.1, envMapIntensity: 2.0, side: THREE.DoubleSide,
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
  paving:    { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'paving' },
  asphalt:   { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'asphalt' },
  rust:      { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'rust' },
  rust2:     { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'rust2' },
  wood:      { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'wood' },
  woodDark:  { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'woodDark' },
  metal:     { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'metal' },
  metalDark: { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'metalDark' },
  red:       { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'paintedRed' },
  blue:      { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'paintedBlue' },
  green:     { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'paintedGreen' },
  black:     { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'paintedBlack' },
  yellow:    { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'cautionYellow' },
  leather:   { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'leather' },
  screen:    { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'screenGlow' },
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
  const cand = queryGrid(f.x, f.z, 1.8);
  const stepMargin = R * 0.82; // smooth stair step-on margin
  for (const b of cand) {
    if (f.x > b.x0 - stepMargin && f.x < b.x1 + stepMargin && f.z > b.z0 - stepMargin && f.z < b.z1 + stepMargin && b.y1 <= f.y + STEP + 0.08 && b.y1 > g) {
      g = b.y1;
    }
  }
  // Smooth stair step elevation when moving on ground
  if (f.onGround && g > f.y && g <= f.y + STEP + 0.08) {
    f.y = g;
    f.vy = 0;
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
   LONDON CITY GENERATOR & ARCHITECTURAL SYSTEMS
================================================================ */

export function addStairs(sx, sy, sz, width, totalRise, stepsCount, facing, matKey = 'concrete2') {
  const stepH = totalRise / stepsCount;
  const stepD = 0.32;
  const isX = facing === 'e' || facing === 'w';
  const sign = (facing === 's' || facing === 'e') ? 1 : -1;

  for (let i = 0; i < stepsCount; i++) {
    const curY = sy + i * stepH;
    const curOff = (i + 0.5) * stepD * sign;
    const stepX = isX ? sx + curOff : sx;
    const stepZ = isX ? sz : sz + curOff;
    const sw = isX ? stepD : width;
    const sd = isX ? width : stepD;
    addBox(stepX, curY, stepZ, sw, stepH, sd, matKey, true, true);
  }

  // Handrail on the open side
  const railSideSign = 1;
  const railOffset = (width / 2 - 0.08) * railSideSign;
  const totalD = stepsCount * stepD;
  const midY = sy + totalRise / 2;
  const midOff = (totalD / 2) * sign;
  const handrailH = 0.95;

  for (let p = 0; p <= stepsCount; p += 3) {
    const py = sy + p * stepH;
    const poff = p * stepD * sign;
    const px = isX ? sx + poff : sx + railOffset;
    const pz = isX ? sz + railOffset : sz + poff;
    addBox(px, py, pz, 0.06, handrailH, 0.06, 'metal', true, true);
  }
  const rx = isX ? sx + midOff : sx + railOffset;
  const rz = isX ? sz + railOffset : sz + midOff;
  addBox(rx, midY + handrailH, rz, isX ? totalD : 0.08, 0.08, isX ? 0.08 : totalD, 'metal', false, true);
}

export function addDesk(cx, cy, cz, facing = 'n') {
  const isX = facing === 'e' || facing === 'w';
  const w = isX ? 1.0 : 1.8;
  const d = isX ? 1.8 : 1.0;
  addBox(cx, cy + 0.72, cz, w, 0.06, d, 'woodDark', true, true);
  const lx = w / 2 - 0.1, lz = d / 2 - 0.1;
  addBox(cx - lx, cy, cz - lz, 0.08, 0.72, 0.08, 'metalDark', false, true);
  addBox(cx + lx, cy, cz - lz, 0.08, 0.72, 0.08, 'metalDark', false, true);
  addBox(cx - lx, cy, cz + lz, 0.08, 0.72, 0.08, 'metalDark', false, true);
  addBox(cx + lx, cy, cz + lz, 0.08, 0.72, 0.08, 'metalDark', false, true);
  const sign = facing === 's' ? 1 : -1;
  addBox(cx - (isX ? 0 : 0.35), cy + 0.78, cz + (isX ? -0.35 : 0), isX ? 0.05 : 0.5, 0.32, isX ? 0.5 : 0.05, 'screen', false, true);
  addBox(cx + (isX ? 0 : 0.35), cy + 0.78, cz + (isX ? 0.35 : 0), isX ? 0.05 : 0.5, 0.32, isX ? 0.5 : 0.05, 'screen', false, true);
  addBox(cx, cy + 0.78, cz + sign * 0.25, isX ? 0.16 : 0.45, 0.02, isX ? 0.45 : 0.16, 'black', false, true);
  const chZ = cz - sign * 0.65;
  addBox(cx, cy, chZ, 0.5, 0.46, 0.5, 'leather', true, true);
  addBox(cx, cy + 0.46, chZ - sign * 0.2, 0.48, 0.55, 0.08, 'leather', false, true);
}

export function addSofa(cx, cy, cz, facing = 'n') {
  const isX = facing === 'e' || facing === 'w';
  const w = isX ? 1.0 : 2.2;
  const d = isX ? 2.2 : 1.0;
  addBox(cx, cy, cz, w, 0.42, d, 'leather', true, true);
  const sign = facing === 's' ? 1 : -1;
  const bz = isX ? cz : cz - sign * (d / 2 - 0.12);
  const bx = isX ? cx - sign * (w / 2 - 0.12) : cx;
  addBox(bx, cy + 0.42, bz, isX ? 0.24 : w, 0.48, isX ? d : 0.24, 'leather', false, true);
  const tfZ = isX ? cz : cz + sign * 0.9;
  const tfX = isX ? cx + sign * 0.9 : cx;
  addBox(tfX, cy, tfZ, isX ? 0.6 : 1.2, 0.35, isX ? 1.2 : 0.6, 'wood', true, true);
}

export function addBookshelf(cx, cy, cz, facing = 'n') {
  const isX = facing === 'e' || facing === 'w';
  const w = isX ? 0.5 : 1.6;
  const d = isX ? 1.6 : 0.5;
  addBox(cx, cy, cz, w, 2.2, d, 'woodDark', true, true);
  for (let s = 0; s < 4; s++) {
    const by = cy + 0.4 + s * 0.48;
    addBox(cx, by, cz, isX ? 0.3 : 1.4, 0.3, isX ? 1.4 : 0.3, wpick(['red', 'blue', 'yellow', 'green']), false, true);
  }
}

export function addCrateStack(cx, cy, cz) {
  addBox(cx, cy, cz, 1.1, 1.1, 1.1, 'wood', true, true);
  addBox(cx + 1.15, cy, cz, 1.1, 1.1, 1.1, 'wood', true, true);
  addBox(cx + 0.55, cy + 1.1, cz, 1.0, 1.0, 1.0, 'wood', true, true);
  addBox(cx - 0.2, cy, cz + 1.1, 1.0, 1.0, 1.0, 'wood', true, true);
}

export function addBarrels(cx, cy, cz) {
  addBox(cx, cy, cz, 0.75, 1.05, 0.75, 'rust', true, true);
  addBox(cx + 0.8, cy, cz + 0.2, 0.75, 1.05, 0.75, 'rust2', true, true);
  addBox(cx + 0.3, cy, cz - 0.75, 0.75, 1.05, 0.75, 'metal', true, true);
}

export function addRooftopAC(cx, cy, cz) {
  addBox(cx, cy, cz, 2.2, 1.4, 1.6, 'metalDark', true, true);
  addBox(cx + 0.5, cy + 1.4, cz, 0.9, 0.15, 0.9, 'metal', false, true);
  addBox(cx - 0.6, cy + 0.4, cz + 0.85, 0.6, 0.6, 0.4, 'rust', false, true);
  addBox(cx - 1.3, cy + 0.4, cz, 0.5, 0.5, 1.2, 'metal', true, true);
}

export function addBusStop(x, z, facing = 'n') {
  const isX = facing === 'e' || facing === 'w';
  const w = isX ? 1.8 : 3.6, d = isX ? 3.6 : 1.8;
  addBox(x, 0, z, w, 0.1, d, 'paving', false, true);
  addBox(x, 0, z - (isX ? 0 : 0.8), isX ? 0.08 : 3.4, 2.6, isX ? 3.4 : 0.08, 'glass', true, true);
  addBox(x, 2.6, z, w + 0.2, 0.12, d + 0.2, 'metalDark', false, true);
  addBox(x, 0.45, z - (isX ? 0 : 0.3), isX ? 0.4 : 2.4, 0.1, isX ? 2.4 : 0.4, 'wood', true, true);
  addBox(x + (isX ? 0 : 1.4), 0.8, z - (isX ? 0 : 0.75), isX ? 0.1 : 0.6, 1.0, isX ? 0.6 : 0.1, 'yellow', false, true);
}

export function accessibleTownhouse(cx, cz, floors = 3, facing = 's') {
  const w = 14, d = 12;
  const floorH = 2.88;
  const totalH = floors * floorH;
  const sign = (facing === 's' || facing === 'e') ? 1 : -1;
  const brick = wpick(['brickA', 'brickB', 'brickC']);

  addBox(cx, 0, cz, w, 0.1, d, 'paving', false, true);

  const frontZ = cz + (d / 2 - 0.15) * sign;
  const leftX = cx - (w / 2 - 0.15);
  const rightX = cx + (w / 2 - 0.15);
  const backZ = cz - (d / 2 - 0.15) * sign;

  addBox(leftX, 0, cz, 0.3, totalH, d, brick, true, true);
  addBox(rightX, 0, cz, 0.3, totalH, d, brick, true, true);
  addBox(cx, 0, backZ, w, totalH, 0.3, brick, true, true);

  const doorWidth = 2.4;
  const frontSideW = (w - doorWidth) / 2;
  addBox(cx - (w / 2 - frontSideW / 2), 0, frontZ, frontSideW, totalH, 0.3, brick, true, true);
  addBox(cx + (w / 2 - frontSideW / 2), 0, frontZ, frontSideW, totalH, 0.3, brick, true, true);
  addBox(cx, 2.5, frontZ, doorWidth, totalH - 2.5, 0.3, brick, true, true);

  addBox(cx - 1.2, 0, cz, 0.2, floorH, d * 0.6, 'woodDark', true, true);
  addDesk(cx - 3.8, 0, cz - 1.5, 's');
  addBookshelf(cx - 5.5, 0, cz + 1.2, 'e');
  addCrateStack(cx + 4.2, 0, cz - 3.5);

  const stair1X = cx + (w / 2 - 1.2);
  addStairs(stair1X, 0, cz + 2.2, 1.8, floorH, 12, 'n', 'concrete2');

  addBox(cx - 1.5, floorH - 0.12, cz, w - 3.8, 0.15, d - 0.6, 'wood', true, true);
  addBox(stair1X, floorH - 0.12, cz - 2.8, 2.2, 0.15, 2.4, 'wood', true, true);

  addSofa(cx - 2.5, floorH, cz - 2.0, 's');
  addBookshelf(cx - 5.5, floorH, cz - 2.0, 'e');
  addDesk(cx - 3.5, floorH, cz + 2.5, 'n');

  addBox(cx - 3.5, floorH + 0.9, frontZ, 1.8, 1.5, 0.1, 'glass', false, true);
  addBox(cx + 3.5, floorH + 0.9, frontZ, 1.8, 1.5, 0.1, 'glass', false, true);

  const stair2X = cx - (w / 2 - 1.2);
  addStairs(stair2X, floorH, cz - 2.0, 1.8, floorH, 12, 's', 'concrete2');

  const roofY = floorH * 2;
  addBox(cx + 1.2, roofY - 0.12, cz, w - 3.2, 0.18, d - 0.6, 'concrete2', true, true);
  addBox(stair2X, roofY - 0.12, cz + 2.6, 2.2, 0.18, 2.2, 'concrete2', true, true);

  const parapetH = 1.1;
  addBox(leftX, roofY, cz, 0.3, parapetH, d, 'brickB', true, true);
  addBox(rightX, roofY, cz, 0.3, parapetH, d, 'brickB', true, true);
  addBox(cx, roofY, backZ, w, parapetH, 0.3, 'brickB', true, true);
  addBox(cx - 4.0, roofY, frontZ, 5.0, parapetH, 0.3, 'brickB', true, true);
  addBox(cx + 4.0, roofY, frontZ, 5.0, parapetH, 0.3, 'brickB', true, true);
  addBox(cx, roofY, frontZ, 3.0, 0.55, 0.3, 'brickB', true, true);

  addRooftopAC(cx + 2.5, roofY, cz - 1.5);
  addBox(cx + 4.5, roofY, cz + 3.0, 0.12, 4.2, 0.12, 'metal', true, true);
  addBox(cx + 4.5, roofY + 4.2, cz + 3.0, 1.2, 0.12, 0.12, 'metal', false, true);

  occupy(cx - w / 2 - 0.5, cx + w / 2 + 0.5, cz - d / 2 - 0.5, cz + d / 2 + 0.5, 0.5);
}

export function accessiblePub(cx, cz) {
  const w = 18, d = 14, floorH = 2.88, totalH = floorH * 2;
  const brick = 'brickB';

  addBox(cx, 0, cz, w, 0.1, d, 'woodDark', false, true);

  const zFront = cz - d / 2 + 0.15;
  const zBack = cz + d / 2 - 0.15;
  const xLeft = cx - w / 2 + 0.15;
  const xRight = cx + w / 2 - 0.15;

  addBox(xLeft, 0, cz, 0.3, totalH, d, brick, true, true);
  addBox(xRight, 0, cz, 0.3, totalH, d, brick, true, true);
  addBox(cx, 0, zBack, w, totalH, 0.3, brick, true, true);

  const fsw = (w - 3.0) / 2;
  addBox(cx - (w / 2 - fsw / 2), 0, zFront, fsw, totalH, 0.3, brick, true, true);
  addBox(cx + (w / 2 - fsw / 2), 0, zFront, fsw, totalH, 0.3, brick, true, true);
  addBox(cx, 2.5, zFront, 3.0, totalH - 2.5, 0.3, brick, true, true);

  addBox(cx - 3.5, 0, cz - 1.0, 0.8, 1.1, 6.0, 'woodDark', true, true);
  addBox(cx - 5.0, 0, cz + 1.6, 3.0, 1.1, 0.8, 'woodDark', true, true);
  for (let s = -2; s <= 2; s += 1.3) {
    addBox(cx - 2.4, 0, cz - 1.0 + s, 0.4, 0.75, 0.4, 'leather', true, true);
  }
  addBox(cx - 6.5, 1.0, cz - 1.0, 0.3, 2.2, 5.0, 'wood', true, true);
  addBox(cx - 6.3, 1.3, cz - 1.0, 0.2, 0.4, 4.6, 'yellow', false, true);
  addBox(cx - 6.3, 2.0, cz - 1.0, 0.2, 0.4, 4.6, 'green', false, true);

  for (let r = -1; r <= 1; r += 2) {
    const tx = cx + 3.5, tz = cz + r * 2.8;
    addBox(tx, 0, tz, 1.4, 0.85, 1.4, 'woodDark', true, true);
    addBox(tx - 1.0, 0, tz, 0.45, 0.5, 0.45, 'leather', true, true);
    addBox(tx + 1.0, 0, tz, 0.45, 0.5, 0.45, 'leather', true, true);
    addBox(tx, 0, tz - 1.0, 0.45, 0.5, 0.45, 'leather', true, true);
    addBox(tx, 0, tz + 1.0, 0.45, 0.5, 0.45, 'leather', true, true);
  }

  const stairX = cx + 6.5;
  addStairs(stairX, 0, cz - 2.5, 1.8, floorH, 12, 's', 'wood');

  addBox(cx - 1.5, floorH - 0.12, cz, w - 4.5, 0.16, d - 0.6, 'wood', true, true);
  addBox(stairX, floorH - 0.12, cz + 2.0, 2.2, 0.16, 2.4, 'wood', true, true);

  addBox(cx, floorH, zFront - 1.2, w * 0.7, 0.15, 2.4, 'wood', true, true);
  addBox(cx, floorH + 0.15, zFront - 2.4, w * 0.7, 1.05, 0.1, 'metal', true, true);
  addBox(cx - (w * 0.35), floorH + 0.15, zFront - 1.2, 0.1, 1.05, 2.4, 'metal', true, true);
  addBox(cx + (w * 0.35), floorH + 0.15, zFront - 1.2, 0.1, 1.05, 2.4, 'metal', true, true);

  addBox(cx, totalH, cz, w + 0.4, 0.3, d + 0.4, 'concrete2', false, true);

  occupy(cx - w / 2 - 0.5, cx + w / 2 + 0.5, cz - d / 2 - 0.5, cz + d / 2 + 0.5, 0.5);
}

export function accessibleWarehouse(cx, cz) {
  const w = 24, d = 16, h = 6.8;
  addBox(cx, 0, cz, w, 0.12, d, 'concrete', false, true);

  const zF = cz - d / 2 + 0.15, zB = cz + d / 2 - 0.15;
  const xL = cx - w / 2 + 0.15, xR = cx + w / 2 - 0.15;

  addBox(xL, 0, cz, 0.3, h, d, 'metalDark', true, true);
  addBox(xR, 0, cz, 0.3, h, d, 'metalDark', true, true);

  const doorW = 6.0;
  const sw = (w - doorW) / 2;
  addBox(cx - (w / 2 - sw / 2), 0, zF, sw, h, 0.3, 'metalDark', true, true);
  addBox(cx + (w / 2 - sw / 2), 0, zF, sw, h, 0.3, 'metalDark', true, true);
  addBox(cx, 4.2, zF, doorW, h - 4.2, 0.3, 'metalDark', true, true);

  addBox(cx - (w / 2 - sw / 2), 0, zB, sw, h, 0.3, 'metalDark', true, true);
  addBox(cx + (w / 2 - sw / 2), 0, zB, sw, h, 0.3, 'metalDark', true, true);
  addBox(cx, 4.2, zB, doorW, h - 4.2, 0.3, 'metalDark', true, true);

  addBox(cx, h, cz, w + 0.4, 0.3, d + 0.4, 'concrete2', false, true);
  addBox(cx, h + 0.05, cz, w * 0.7, 0.1, 2.5, 'glass', false, true);

  addCrateStack(cx - 3.5, 0, cz - 2.0);
  addCrateStack(cx + 4.5, 0, cz + 2.0);
  addBarrels(cx - 5.5, 0, cz + 3.0);
  addBarrels(cx + 2.0, 0, cz - 4.0);

  const catwalkY = 3.36;
  addStairs(xL + 1.2, 0, cz - 3.0, 1.6, catwalkY, 14, 's', 'metal');

  addBox(xL + 1.6, catwalkY - 0.12, cz + 1.5, 2.6, 0.15, d - 4.0, 'metal', true, true);
  addBox(cx - 3.0, catwalkY - 0.12, zB - 1.6, w * 0.6, 0.15, 2.6, 'metal', true, true);

  addBox(xL + 2.9, catwalkY + 0.15, cz + 1.5, 0.08, 1.05, d - 4.0, 'metal', true, true);
  addBox(cx - 3.0, catwalkY + 0.15, zB - 2.9, w * 0.6, 1.05, 0.08, 'metal', true, true);

  occupy(cx - w / 2 - 0.5, cx + w / 2 + 0.5, cz - d / 2 - 0.5, cz + d / 2 + 0.5, 0.5);
}

function terraceRow(cx, cz, len, floors, facing) {
  const unitW = 6;
  const units = Math.max(3, Math.floor(len / unitW));
  const totalW = units * unitW;
  const depth = 10;
  const floorH = 3.2;
  const totalH = floors * floorH;
  const isX = facing === 'n' || facing === 's';
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
  }
  occupy(x0 - 0.3, x1 + 0.3, z0 - 0.3, z1 + 0.3, 0.5);
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

function detailedDoubleDecker(x, z, yaw) {
  const w = 2.5, l = 11, h = 4.3;
  // Lower body chassis
  addBox(x, 0.3, z, w, 1.8, l, 'red', true, true);
  // Wheels
  for (const wx of [-w / 2 - 0.05, w / 2 + 0.05]) {
    for (const wz of [-l / 2 + 1.8, l / 2 - 2.2]) {
      addBox(x + wx, 0, z + wz, 0.25, 0.9, 0.9, 'black', true, true);
    }
  }
  // Windows lower
  addBox(x + w / 2 + 0.01, 1.3, z, 0.05, 0.8, l - 2.2, 'glass', false, true);
  addBox(x - w / 2 - 0.01, 1.3, z, 0.05, 0.8, l - 2.2, 'glass', false, true);
  // Upper deck body
  addBox(x, 2.2, z, w, 1.9, l, 'red', true, true);
  // Windows upper
  addBox(x + w / 2 + 0.01, 2.8, z, 0.05, 0.85, l - 1.2, 'glass', false, true);
  addBox(x - w / 2 - 0.01, 2.8, z, 0.05, 0.85, l - 1.2, 'glass', false, true);
  addBox(x, 2.8, z - l / 2 - 0.01, w - 0.4, 0.85, 0.05, 'glass', false, true);
  // Destination roll sign
  addBox(x, 3.85, z - l / 2 - 0.02, 1.4, 0.35, 0.05, 'yellow', false, true);
}

function detailedBlackCab(x, z) {
  const w = 1.9, l = 4.6, h = 1.85;
  // Wheels
  for (const wx of [-w / 2 - 0.02, w / 2 + 0.02]) {
    for (const wz of [-l / 2 + 1.1, l / 2 - 1.1]) {
      addBox(x + wx, 0, z + wz, 0.22, 0.65, 0.65, 'black', true, true);
    }
  }
  // Main chassis & hood
  addBox(x, 0.25, z + 0.3, w, 0.75, l - 0.6, 'black', true, true);
  addBox(x, 0.35, z - 1.5, w * 0.85, 0.55, 1.4, 'black', true, true);
  // Chrome grille & headlights
  addBox(x, 0.45, z - 2.22, 0.8, 0.45, 0.05, 'metal', false, true);
  addBox(x - 0.65, 0.55, z - 2.22, 0.25, 0.25, 0.05, 'yellow', false, true);
  addBox(x + 0.65, 0.55, z - 2.22, 0.25, 0.25, 0.05, 'yellow', false, true);
  // Cabin & glass
  addBox(x, 1.0, z + 0.2, w - 0.08, 0.75, 2.6, 'glass', false, true);
  addBox(x, 1.75, z + 0.2, w - 0.05, 0.1, 2.7, 'black', false, true);
  // Taxi roof sign
  addBox(x, 1.85, z - 0.6, 0.5, 0.18, 0.2, 'yellow', false, true);
}

export function generateCity(scene) {
  // 1. KEY ACCESSIBLE BUILDINGS WITH CLIMBABLE STAIRS, FURNITURE & ROOFTOPS:
  // North Accessible Townhouse (Command Post)
  accessibleTownhouse(0, -42, 3, 's');
  // South Accessible Townhouse
  accessibleTownhouse(0, 42, 3, 'n');
  // East Accessible Townhouse
  accessibleTownhouse(46, 0, 3, 'w');
  // West Accessible Pub (The Crown & Anchor) with bar, 2nd floor lounge and street balcony!
  accessiblePub(-48, 0);

  // Tactical Accessible Warehouse on the East flank with climbable catwalk
  accessibleWarehouse(65, 55);
  // Secondary Warehouse on the West flank
  accessibleWarehouse(-65, -55);

  // Additional accessible townhouses in tactical corners
  accessibleTownhouse(-52, 52, 3, 's');
  accessibleTownhouse(52, -52, 3, 'n');

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

  // Mid-ring accessible blocks and terraces
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + wr(-0.1, 0.1);
    const r = 110 + wr(-15, 15);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!isFree(x, z, 10)) continue;
    const rr = rand();
    if (rr < 0.45) {
      accessibleTownhouse(x, z, 3, wpick(['n', 's', 'e', 'w']));
    } else if (rr < 0.75) {
      const facing = wpick(['n', 's', 'e', 'w']);
      terraceRow(x, z, wr(20, 36), 2 + ((rand() * 2) | 0), facing);
    } else {
      const w = 12, d = 12, floors = 4, fh = 3.0;
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

  // London Bus Stops with glass shelters and timetables
  addBusStop(18, -12, 's');
  addBusStop(-18, 12, 'n');
  addBusStop(-12, -18, 'e');
  addBusStop(12, 18, 'w');

  // Sidewalks along main cross roads
  const roadW = 9, sidewalkW = 2.5;
  for (let x = -MAP + 20; x < MAP - 20; x += 20) {
    if (isFree(x + 10, -roadW / 2 - sidewalkW / 2, 2))
      addBox(x + 10, 0, -roadW / 2 - sidewalkW / 2, 20, 0.15, sidewalkW, 'paving', false, true);
    if (isFree(x + 10, roadW / 2 + sidewalkW / 2, 2))
      addBox(x + 10, 0, roadW / 2 + sidewalkW / 2, 20, 0.15, sidewalkW, 'paving', false, true);
  }
  for (let z = -MAP + 20; z < MAP - 20; z += 20) {
    if (isFree(-roadW / 2 - sidewalkW / 2, z + 10, 2))
      addBox(-roadW / 2 - sidewalkW / 2, 0, z + 10, sidewalkW, 0.15, 20, 'paving', false, true);
    if (isFree(roadW / 2 + sidewalkW / 2, z + 10, 2))
      addBox(roadW / 2 + sidewalkW / 2, 0, z + 10, sidewalkW, 0.15, 20, 'paving', false, true);
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

  // High detail Parked vehicles
  for (let i = 0; i < 14; i++) {
    const a = rand() * TAU, r = 25 + rand() * (MAP * 0.65);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!isFree(x, z, 6)) continue;
    const yaw = rand() * Math.PI * 2;
    if (rand() < 0.4) detailedDoubleDecker(x, z, yaw);
    else if (rand() < 0.8) detailedBlackCab(x, z);
    else {
      addCrateStack(x, 0, z);
      addBarrels(x + 2, 0, z);
    }
    occupy(x - 3.5, x + 3.5, z - 3.5, z + 3.5, 0.5);
  }

  // Perimeter wall
  const E = MAP + 1.5, L = MAP * 2 + 6;
  addBox(0, 4.5, -E, L, 9, 3, 'concrete', true, true);
  addBox(0, 4.5, E, L, 9, 3, 'concrete', true, true);
  addBox(-E, 4.5, 0, 3, 9, L, 'concrete', true, true);
  addBox(E, 4.5, 0, 3, 9, L, 'concrete', true, true);
}

/* ================================================================
   CHARACTER RIG (Tactical Operator with ballistic gear & comms)
================================================================ */
export function buildCharacterRig(palette, name) {
  const root = new THREE.Group();
  const bones = {};
  const isNoDeX = name === 'NoDeX';

  const skinMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.skinTone || '#c89870').getHex(),
    roughness: 0.65, metalness: 0.02, envMapIntensity: 0.5,
  });
  const clothMat = new THREE.MeshStandardMaterial({
    map: palette.texture, roughness: 0.88, metalness: 0.05, envMapIntensity: 0.4,
  });
  const clothDark = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.dark || '#16191f').getHex(),
    roughness: 0.90, metalness: 0.08, envMapIntensity: 0.4,
  });
  const bootMat = new THREE.MeshStandardMaterial({
    color: 0x111317, roughness: 0.50, metalness: 0.20, envMapIntensity: 0.9
  });
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x30363d, roughness: 0.32, metalness: 0.85, envMapIntensity: 1.4
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(palette.accent || '#ff6a2b').getHex(),
    roughness: 0.45, metalness: 0.15, envMapIntensity: 0.9
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0x050c12, roughness: 0.08, metalness: 0.95, envMapIntensity: 2.5,
    emissive: 0x143c54, emissiveIntensity: 0.4
  });
  const gloveMat = new THREE.MeshStandardMaterial({
    color: 0x22262c, roughness: 0.65, metalness: 0.15, envMapIntensity: 0.6
  });

  function bone(parent, bname, x, y, z) {
    const b = new THREE.Group();
    b.position.set(x, y, z);
    parent.add(b);
    bones[bname] = b;
    return b;
  }
  function capsule(parent, len, r, mat) {
    const geo = new THREE.CapsuleGeometry(r, Math.max(0.01, len - 2 * r), 6, 10);
    const m = new THREE.Mesh(geo, mat);
    m.position.y = -len / 2;
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function box(parent, w, h, d, mat, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true; m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function sphere(parent, r, mat, x = 0, y = 0, z = 0) {
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

  const shoulderL = bone(chest, 'shoulderL', -0.21, 0.16, 0);
  const upperArmL = bone(shoulderL, 'upperArmL', 0, -0.06, 0);
  const lowerArmL = bone(upperArmL, 'lowerArmL', 0, -0.28, 0);
  const handL = bone(lowerArmL, 'handL', 0, -0.24, 0);

  const shoulderR = bone(chest, 'shoulderR', 0.21, 0.16, 0);
  const upperArmR = bone(shoulderR, 'upperArmR', 0, -0.06, 0);
  const lowerArmR = bone(upperArmR, 'lowerArmR', 0, -0.28, 0);
  const handR = bone(lowerArmR, 'handR', 0, -0.24, 0);

  const upperLegL = bone(pelvis, 'upperLegL', -0.10, -0.08, 0);
  const lowerLegL = bone(upperLegL, 'lowerLegL', 0, -0.44, 0);
  const footL = bone(lowerLegL, 'footL', 0, -0.42, 0);

  const upperLegR = bone(pelvis, 'upperLegR', 0.10, -0.08, 0);
  const lowerLegR = bone(upperLegR, 'lowerLegR', 0, -0.44, 0);
  const footR = bone(lowerLegR, 'footR', 0, -0.42, 0);

  // --- LOWER BODY & DUTY BELT ---
  box(pelvis, 0.36, 0.22, 0.26, clothMat, 0, -0.02, 0);
  // Tactical duty belt
  box(pelvis, 0.38, 0.08, 0.28, clothDark, 0, 0.08, 0);
  box(pelvis, 0.07, 0.06, 0.04, metalMat, 0, 0.08, -0.145); // belt buckle
  // Utility pouch on right hip
  box(pelvis, 0.08, 0.12, 0.10, clothDark, 0.19, 0.04, 0.02);
  // Sidearm holster on left thigh
  box(pelvis, 0.07, 0.16, 0.09, clothDark, -0.19, -0.08, 0.02);

  // --- TORSO & SPINE ---
  box(spine1, 0.35, 0.20, 0.25, clothMat, 0, 0.04, 0);
  box(spine2, 0.37, 0.22, 0.27, clothMat, 0, 0.04, 0);

  // --- TACTICAL CHEST RIG / MOLLE PLATE CARRIER ---
  // Main armored plate carrier body
  box(chest, 0.44, 0.36, 0.32, clothDark, 0, 0.02, 0);
  // Shoulder straps
  box(chest, 0.10, 0.38, 0.08, clothDark, -0.15, 0.04, 0);
  box(chest, 0.10, 0.38, 0.08, clothDark, 0.15, 0.04, 0);
  // 3x Front 5.56 Rifle Magazine Pouches
  box(chest, 0.09, 0.16, 0.06, clothDark, -0.11, -0.06, -0.185);
  box(chest, 0.09, 0.16, 0.06, clothDark, 0, -0.06, -0.185);
  box(chest, 0.09, 0.16, 0.06, clothDark, 0.11, -0.06, -0.185);
  // Magazine baseplates
  box(chest, 0.08, 0.03, 0.05, metalMat, -0.11, 0.03, -0.185);
  box(chest, 0.08, 0.03, 0.05, metalMat, 0, 0.03, -0.185);
  box(chest, 0.08, 0.03, 0.05, metalMat, 0.11, 0.03, -0.185);
  // Chest velcro patch / callsign
  box(chest, 0.14, 0.06, 0.02, accentMat, 0, 0.11, -0.165);
  if (isNoDeX) {
    box(chest, 0.08, 0.04, 0.02, metalMat, -0.12, 0.11, -0.165);
  }
  // Tactical comms radio on left chest/shoulder
  box(chest, 0.08, 0.14, 0.07, metalMat, -0.16, 0.10, -0.15);
  box(chest, 0.015, 0.22, 0.015, metalMat, -0.16, 0.24, -0.15); // radio antenna
  // Hydration pack / rear tactical backpack
  box(chest, 0.30, 0.34, 0.15, clothDark, 0, 0.02, 0.21);
  box(chest, 0.22, 0.06, 0.03, accentMat, 0, 0.15, 0.29);

  // --- NECK & HEAD ---
  box(neck, 0.11, 0.10, 0.11, clothDark, 0, 0.03, 0); // Balaclava neck
  sphere(head, 0.13, skinMat, 0, 0.06, 0);
  // Balaclava lower face mask
  box(head, 0.16, 0.12, 0.16, clothDark, 0, 0.02, -0.04);

  // FAST Ballistic Combat Helmet
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.152, 14, 12, 0, Math.PI * 2, 0, Math.PI / 1.7), clothDark);
  dome.position.y = 0.06; dome.castShadow = true; head.add(dome);
  // Helmet rim and side ARC rails
  box(head, 0.31, 0.05, 0.30, clothDark, 0, 0.02, 0);
  box(head, 0.04, 0.04, 0.16, metalMat, -0.15, 0.07, 0); // Left ARC rail
  box(head, 0.04, 0.04, 0.16, metalMat, 0.15, 0.07, 0);  // Right ARC rail
  // Wilcox NVG mount bracket on front of helmet
  box(head, 0.06, 0.07, 0.05, metalMat, 0, 0.10, -0.145);
  // Rear battery pack / counterweight
  box(head, 0.12, 0.06, 0.05, clothDark, 0, 0.06, 0.145);

  // Comms Headset (dual ear cups and boom mic)
  box(head, 0.05, 0.09, 0.08, metalMat, -0.15, 0.04, -0.01); // left ear cup
  box(head, 0.05, 0.09, 0.08, metalMat, 0.15, 0.04, -0.01);  // right ear cup
  box(head, 0.03, 0.02, 0.14, metalMat, -0.14, 0.02, -0.10); // flexible mic arm
  box(head, 0.03, 0.03, 0.03, clothDark, -0.10, 0.02, -0.15); // mic foam tip

  // Ballistic Eye Protection Goggles
  box(head, 0.25, 0.08, 0.04, visorMat, 0, 0.07, -0.135);
  box(head, 0.29, 0.04, 0.28, clothDark, 0, 0.07, 0); // goggle retention strap

  // --- ARMS & TACTICAL GLOVES ---
  // Left arm
  capsule(upperArmL, 0.26, 0.06, clothMat);
  sphere(upperArmL, 0.07, clothMat, 0, 0, 0); // shoulder pad
  box(upperArmL, 0.08, 0.06, 0.02, accentMat, -0.065, -0.08, 0); // patch
  capsule(lowerArmL, 0.26, 0.052, clothMat);
  box(lowerArmL, 0.10, 0.09, 0.09, clothDark, 0, -0.02, 0); // elbow pad
  box(handL, 0.085, 0.14, 0.065, gloveMat, 0, -0.13, 0); // tactical glove
  box(handL, 0.08, 0.03, 0.06, metalMat, 0, -0.11, -0.035); // carbon knuckle guard

  // Right arm
  capsule(upperArmR, 0.26, 0.06, clothMat);
  sphere(upperArmR, 0.07, clothMat, 0, 0, 0);
  box(upperArmR, 0.08, 0.06, 0.02, accentMat, 0.065, -0.08, 0);
  capsule(lowerArmR, 0.26, 0.052, clothMat);
  box(lowerArmR, 0.10, 0.09, 0.09, clothDark, 0, -0.02, 0);
  box(handR, 0.085, 0.14, 0.065, gloveMat, 0, -0.13, 0);
  box(handR, 0.08, 0.03, 0.06, metalMat, 0, -0.11, -0.035);

  // --- LEGS & COMBAT BOOTS ---
  // Left leg
  capsule(upperLegL, 0.42, 0.078, clothMat);
  sphere(upperLegL, 0.085, clothMat, 0, 0, 0);
  box(upperLegL, 0.06, 0.16, 0.14, clothDark, -0.08, -0.22, 0); // cargo thigh pocket
  capsule(lowerLegL, 0.40, 0.068, clothMat);
  box(lowerLegL, 0.13, 0.13, 0.12, clothDark, 0, 0.02, -0.04); // tactical hard knee pad
  box(footL, 0.14, 0.13, 0.27, bootMat, 0, -0.03, -0.05); // combat boot
  box(footL, 0.15, 0.035, 0.28, metalMat, 0, -0.09, -0.05); // lugged rubber sole

  // Right leg
  capsule(upperLegR, 0.42, 0.078, clothMat);
  sphere(upperLegR, 0.085, clothMat, 0, 0, 0);
  box(upperLegR, 0.06, 0.16, 0.14, clothDark, 0.08, -0.22, 0);
  capsule(lowerLegR, 0.40, 0.068, clothMat);
  box(lowerLegR, 0.13, 0.13, 0.12, clothDark, 0, 0.02, -0.04);
  box(footR, 0.14, 0.13, 0.27, bootMat, 0, -0.03, -0.05);
  box(footR, 0.15, 0.035, 0.28, metalMat, 0, -0.09, -0.05);

  // Floating tactical operator callsign HUD
  const lc = document.createElement('canvas'); lc.width = 256; lc.height = 64;
  const lg = lc.getContext('2d');
  lg.font = '700 28px "Chakra Petch",sans-serif';
  lg.textAlign = 'center'; lg.textBaseline = 'middle';
  lg.lineWidth = 6; lg.strokeStyle = 'rgba(0,0,0,0.85)';
  lg.strokeText(name, 128, 32);
  lg.fillStyle = '#f8fafc'; lg.fillText(name, 128, 32);
  const ltex = new THREE.CanvasTexture(lc);
  ltex.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: ltex, transparent: true, fog: false, depthTest: false }));
  label.scale.set(2.2, 0.55, 1); label.position.y = 2.12;
  root.add(label);

  return { root, bones, label };
}

/* ================================================================
   WEAPON MODELS (High-Fidelity with Holographic Optic & Attachments)
================================================================ */
export function buildWeapon(kind) {
  const group = new THREE.Group();
  const M = buildMaterials();
  const dk = new THREE.MeshStandardMaterial({ color: 0x14181e, roughness: 0.38, metalness: 0.7, envMapIntensity: 1.2 });
  const md = new THREE.MeshStandardMaterial({ color: 0x242a32, roughness: 0.35, metalness: 0.8, envMapIntensity: 1.3 });
  const lt = new THREE.MeshStandardMaterial({ color: 0x485058, roughness: 0.30, metalness: 0.88, envMapIntensity: 1.5 });
  const sightGlass = new THREE.MeshStandardMaterial({
    color: 0x00e5ff, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.75,
    emissive: 0x00e5ff, emissiveIntensity: 0.6
  });
  const wood = M.wood;
  const accent = new THREE.MeshStandardMaterial({ color: 0xff5500, roughness: 0.4, metalness: 0.2 });

  function bx(parent, w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true; parent.add(m); return m;
  }
  function cyl(parent, r, len, mat, x, y, z, axis) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 14), mat);
    if (axis === 'x') m.rotation.z = Math.PI / 2;
    else if (axis === 'z') m.rotation.x = Math.PI / 2;
    m.position.set(x, y, z);
    m.castShadow = true; parent.add(m); return m;
  }

  const body = new THREE.Group();
  const mag = new THREE.Group();
  const bolt = new THREE.Group();
  group.add(body, mag, bolt);

  // Tactical Holographic Optic helper
  function addHoloSight(parent, yOff, zOff) {
    bx(parent, 0.05, 0.06, 0.12, dk, 0, yOff + 0.03, zOff);
    bx(parent, 0.045, 0.05, 0.08, md, 0, yOff + 0.06, zOff);
    bx(parent, 0.035, 0.035, 0.01, sightGlass, 0, yOff + 0.06, zOff - 0.02);
  }

  // Picatinny rail
  function addPicatinny(parent, len, yOff, zOff) {
    bx(parent, 0.035, 0.015, len, lt, 0, yOff, zOff);
  }

  if (kind === 'pistol') {
    // Slide and lower frame
    bx(body, 0.048, 0.05, 0.22, dk, 0, 0.02, -0.12);
    bx(body, 0.044, 0.05, 0.17, md, 0, -0.03, -0.10);
    cyl(body, 0.013, 0.20, lt, 0, 0.02, -0.28, 'z');
    bx(body, 0.048, 0.15, 0.065, dk, 0, -0.12, -0.02); // grip
    bx(body, 0.02, 0.05, 0.08, lt, 0, -0.07, -0.07); // trigger guard
    bx(body, 0.028, 0.022, 0.05, dk, 0, 0.05, -0.22); // rear sight
    bx(body, 0.028, 0.020, 0.03, accent, 0, 0.05, -0.32); // front sight dot
    bx(mag, 0.040, 0.12, 0.05, md, 0, -0.12, -0.02);
    bx(bolt, 0.045, 0.025, 0.06, lt, 0, 0.03, -0.16);
  } else if (kind === 'smg') {
    // Compact tactical PDW / MP5 style
    bx(body, 0.06, 0.08, 0.36, md, 0, 0.02, -0.18);
    cyl(body, 0.016, 0.30, lt, 0, 0.03, -0.50, 'z');
    cyl(body, 0.022, 0.06, dk, 0, 0.03, -0.66, 'z'); // suppressor / muzzle
    bx(body, 0.05, 0.10, 0.22, dk, 0, -0.06, 0.02); // collapsible stock
    bx(body, 0.055, 0.18, 0.06, dk, 0, -0.12, -0.10); // pistol grip
    bx(body, 0.05, 0.14, 0.05, dk, 0, -0.10, -0.32); // angled tactical foregrip!
    addPicatinny(body, 0.26, 0.065, -0.24);
    addHoloSight(body, 0.07, -0.22);
    bx(bolt, 0.04, 0.03, 0.05, lt, 0, 0.05, -0.30);
    // Curved high-capacity magazine
    bx(mag, 0.045, 0.20, 0.055, md, 0, -0.16, -0.08);
  } else if (kind === 'rifle') {
    // M4A1 / HK416 Tactical Assault Rifle
    bx(body, 0.062, 0.09, 0.46, md, 0, 0.02, -0.20);
    cyl(body, 0.015, 0.38, lt, 0, 0.03, -0.62, 'z');
    cyl(body, 0.022, 0.08, dk, 0, 0.03, -0.82, 'z'); // tactical muzzle brake
    bx(body, 0.052, 0.08, 0.24, dk, 0, -0.01, 0.12); // crane stock
    bx(body, 0.058, 0.16, 0.06, dk, 0, -0.12, -0.12); // ergonomic pistol grip
    bx(body, 0.058, 0.06, 0.28, dk, 0, -0.02, -0.34); // quad-rail handguard
    bx(body, 0.05, 0.12, 0.05, dk, 0, -0.10, -0.38); // vertical forward grip!
    addPicatinny(body, 0.38, 0.07, -0.26);
    addHoloSight(body, 0.075, -0.24); // EOTech Holographic Optic
    bx(bolt, 0.045, 0.03, 0.06, lt, 0, 0.06, -0.36);
    bx(mag, 0.05, 0.22, 0.065, md, 0, -0.18, -0.14); // STANAG 30rd mag
    bx(body, 0.02, 0.02, 0.08, accent, 0, 0.085, -0.42); // PEQ-15 tactical laser unit
  } else if (kind === 'bullpup') {
    // Bullpup (AUG/L85 style)
    bx(body, 0.065, 0.11, 0.38, md, 0, 0.02, -0.16);
    cyl(body, 0.014, 0.34, lt, 0, 0.03, -0.52, 'z');
    cyl(body, 0.020, 0.06, dk, 0, 0.03, -0.70, 'z');
    bx(body, 0.08, 0.11, 0.20, md, 0, -0.01, 0.10);
    bx(body, 0.06, 0.15, 0.06, dk, 0, -0.10, 0.02);
    bx(body, 0.05, 0.14, 0.05, dk, 0, -0.10, -0.30); // integrated folding foregrip
    addPicatinny(body, 0.32, 0.08, -0.20);
    addHoloSight(body, 0.085, -0.18);
    bx(bolt, 0.045, 0.03, 0.06, lt, 0, 0.06, -0.32);
    bx(mag, 0.05, 0.19, 0.06, md, 0, -0.15, -0.06); // rear bullpup magazine
  } else if (kind === 'dmr') {
    // DMR Marksman Rifle with telescopic optic
    bx(body, 0.062, 0.09, 0.54, md, 0, 0.02, -0.24);
    cyl(body, 0.016, 0.48, lt, 0, 0.03, -0.74, 'z');
    cyl(body, 0.024, 0.08, dk, 0, 0.03, -0.99, 'z');
    bx(body, 0.06, 0.10, 0.30, wood, 0, -0.01, 0.14);
    bx(body, 0.06, 0.16, 0.06, dk, 0, -0.12, -0.16);
    bx(body, 0.06, 0.06, 0.32, dk, 0, -0.02, -0.42);
    // Telescopic sniper scope
    cyl(body, 0.026, 0.26, dk, 0, 0.10, -0.30, 'z');
    cyl(body, 0.032, 0.06, dk, 0, 0.10, -0.44, 'z'); // objective lens bell
    bx(body, 0.04, 0.04, 0.01, sightGlass, 0, 0.10, -0.47);
    bx(bolt, 0.045, 0.03, 0.06, lt, 0, 0.06, -0.42);
    bx(mag, 0.05, 0.18, 0.065, md, 0, -0.16, -0.18);
  } else if (kind === 'lmg') {
    // Heavy squad automatic weapon with drum magazine
    bx(body, 0.085, 0.12, 0.58, md, 0, 0.02, -0.26);
    cyl(body, 0.020, 0.50, lt, 0, 0.03, -0.74, 'z');
    cyl(body, 0.028, 0.10, dk, 0, 0.03, -1.00, 'z');
    bx(body, 0.06, 0.10, 0.22, dk, 0, -0.02, 0.12);
    bx(body, 0.065, 0.16, 0.06, dk, 0, -0.13, -0.14);
    bx(body, 0.07, 0.07, 0.34, dk, 0, -0.03, -0.44);
    addHoloSight(body, 0.09, -0.28);
    // 100rd Ammo drum box
    bx(mag, 0.16, 0.18, 0.18, dk, 0, -0.15, -0.16);
    bx(bolt, 0.045, 0.03, 0.06, lt, 0, 0.06, -0.44);
  } else if (kind === 'shotgun') {
    // Tactical Combat Shotgun
    bx(body, 0.072, 0.09, 0.46, md, 0, 0.02, -0.22);
    cyl(body, 0.022, 0.56, lt, 0, 0.04, -0.68, 'z'); // heavy barrel
    cyl(body, 0.018, 0.52, dk, 0, -0.01, -0.66, 'z'); // magazine tube
    bx(body, 0.065, 0.07, 0.22, dk, 0, -0.04, -0.46); // ribbed pump slide
    bx(body, 0.06, 0.11, 0.26, wood, 0, -0.02, 0.08); // tactical stock
    bx(bolt, 0.045, 0.03, 0.06, lt, 0, 0.05, -0.44);
    bx(mag, 0.04, 0.04, 0.04, md, 0, -0.06, -0.02);
  } else {
    // High-Caliber Bolt Action Sniper
    bx(body, 0.065, 0.09, 0.54, md, 0, 0.02, -0.24);
    cyl(body, 0.018, 0.78, lt, 0, 0.03, -0.88, 'z');
    cyl(body, 0.030, 0.12, dk, 0, 0.03, -1.28, 'z'); // large fluted muzzle brake
    bx(body, 0.065, 0.11, 0.26, dk, 0, -0.01, 0.12);
    bx(body, 0.065, 0.16, 0.06, dk, 0, -0.12, -0.16);
    bx(body, 0.065, 0.07, 0.32, dk, 0, -0.02, -0.42);
    // Bipod folded under barrel
    bx(body, 0.04, 0.04, 0.18, lt, 0, -0.07, -0.62);
    // High-magnification precision optic
    cyl(body, 0.030, 0.34, dk, 0, 0.12, -0.32, 'z');
    cyl(body, 0.040, 0.08, dk, 0, 0.12, -0.50, 'z');
    bx(body, 0.05, 0.05, 0.01, sightGlass, 0, 0.12, -0.54);
    bx(bolt, 0.04, 0.04, 0.10, lt, 0.07, 0.05, -0.30); // side bolt handle
    bx(mag, 0.05, 0.14, 0.065, md, 0, -0.14, -0.18);
  }

  group.traverse(o => {
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; }
  });

  return { group, body, mag, bolt };
}

/* ================================================================
   EFFECTS (Tracers, Puffs, Decals, and Physical Brass Casings)
================================================================ */
export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.casings = [];

    this.tracerGeo = new THREE.CylinderGeometry(0.032, 0.032, 1, 6);
    this.tracerGeo.translate(0, -0.5, 0);
    this.tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffe599, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });
    this.decalGeo = new THREE.CircleGeometry(0.07, 10);
    this.decalMat = new THREE.MeshBasicMaterial({
      color: 0x080808, transparent: true, opacity: 0.9, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4,
    });
    this.muzzleLight = new THREE.PointLight(0xffb555, 0, 15, 2);
    this.muzzleLight.position.set(0.2, -0.1, -1);
    this.muzzleT = 0;

    // Brass casing reusable mesh geometry & material
    this.casingGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.045, 8);
    this.casingMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37, roughness: 0.25, metalness: 0.95, envMapIntensity: 1.8
    });
  }

  attachMuzzleLight(camera) {
    camera.add(this.muzzleLight);
  }

  flashMuzzle(pos) {
    this.muzzleLight.position.copy(pos);
    this.muzzleLight.intensity = 26;
    this.muzzleT = 0.045;
  }

  tracer(from, to, width) {
    const dir = new THREE.Vector3().subVectors(to, from);
    const len = dir.length();
    if (len < 0.5) return;
    const use = Math.min(len, 160);
    const mesh = new THREE.Mesh(this.tracerGeo, this.tracerMat);
    mesh.position.copy(from);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.normalize());
    mesh.scale.set(width || 1, use, width || 1);
    this.scene.add(mesh);
    this.items.push({ mesh, life: 0.06, max: 0.06, type: 'tracer' });
  }

  ejectCasing(pos, rightDir, upDir) {
    const mesh = new THREE.Mesh(this.casingGeo, this.casingMat);
    mesh.position.copy(pos);
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    this.scene.add(mesh);

    const vx = rightDir.x * (2.4 + Math.random() * 1.5) + upDir.x * (1.2 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.5;
    const vy = rightDir.y * (2.4 + Math.random() * 1.5) + upDir.y * (1.2 + Math.random() * 0.8) + (1.5 + Math.random() * 1.0);
    const vz = rightDir.z * (2.4 + Math.random() * 1.5) + upDir.z * (1.2 + Math.random() * 0.8) + (Math.random() - 0.5) * 0.5;

    this.casings.push({
      mesh,
      vel: new THREE.Vector3(vx, vy, vz),
      rotVel: new THREE.Vector3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20),
      life: 3.5,
      bounces: 0
    });
  }

  puff(x, y, z, kind, n) {
    const colors = { dust: 0xdcd6c2, blood: 0x9b111e, spark: 0xffe066 };
    const mat = new THREE.MeshBasicMaterial({ color: colors[kind] || 0xffffff });
    for (let i = 0; i < (n || 4); i++) {
      const s = rnd(0.08, 0.22);
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
      m.position.set(x + rnd(-0.12, 0.12), y + rnd(-0.12, 0.12), z + rnd(-0.12, 0.12));
      m.scale.setScalar(s);
      this.scene.add(m);
      this.items.push({ mesh: m, life: 0.32, max: 0.32, type: 'puff', s, vy: rnd(0.4, 2.0) });
    }
  }

  decal(pos, normal) {
    const m = new THREE.Mesh(this.decalGeo, this.decalMat.clone());
    m.position.copy(pos);
    m.lookAt(pos.clone().add(normal));
    m.position.addScaledVector(normal, 0.01);
    const scale = rnd(0.7, 1.4);
    m.scale.setScalar(scale);
    this.scene.add(m);
    this.items.push({ mesh: m, life: 8, max: 8, type: 'decal' });
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
        e.mesh.material.opacity = (e.life / e.max) * 0.9;
      } else if (e.type === 'puff') {
        e.mesh.scale.setScalar(Math.max(0.001, e.s * (e.life / e.max)));
        e.mesh.position.y += dt * e.vy;
      } else if (e.type === 'decal') {
        e.mesh.material.opacity = Math.min(0.9, e.life / 2);
      }
    }

    // Update physical casings
    for (let i = this.casings.length - 1; i >= 0; i--) {
      const c = this.casings[i];
      c.life -= dt;
      if (c.life <= 0) {
        this.scene.remove(c.mesh);
        this.casings.splice(i, 1);
        continue;
      }
      c.vel.y -= 16.0 * dt; // gravity
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.rotVel.x * dt;
      c.mesh.rotation.y += c.rotVel.y * dt;
      c.mesh.rotation.z += c.rotVel.z * dt;

      // Bounce off ground (y = 0.02)
      if (c.mesh.position.y < 0.02) {
        c.mesh.position.y = 0.02;
        if (c.bounces < 2) {
          c.vel.y = -c.vel.y * 0.45;
          c.vel.x *= 0.6;
          c.vel.z *= 0.6;
          c.rotVel.multiplyScalar(0.5);
          c.bounces++;
        } else {
          c.vel.set(0, 0, 0);
          c.rotVel.set(0, 0, 0);
        }
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
