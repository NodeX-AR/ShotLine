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

function roundelTex() {
  const S = 512, c = canvas2D(S), g = c.getContext('2d');
  g.fillStyle = '#dcdad4';
  g.fillRect(0, 0, S, S);
  // Red circular ring
  g.beginPath();
  g.arc(256, 256, 185, 0, Math.PI * 2);
  g.fillStyle = '#dc241f';
  g.fill();
  g.beginPath();
  g.arc(256, 256, 115, 0, Math.PI * 2);
  g.fillStyle = '#ffffff';
  g.fill();
  // Blue horizontal bar
  g.fillStyle = '#0019a8';
  g.fillRect(18, 202, 476, 108);
  // White crisp text
  g.fillStyle = '#ffffff';
  g.font = '900 52px "Gill Sans", "Trebuchet MS", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('UNDERGROUND', 256, 256);
  return c;
}

function bigBenClockTex() {
  const S = 512, c = canvas2D(S), g = c.getContext('2d');
  g.fillStyle = '#221e18';
  g.fillRect(0, 0, S, S);
  // Gold ornate outer rim
  g.beginPath(); g.arc(256, 256, 246, 0, Math.PI * 2);
  g.fillStyle = '#d4af37'; g.fill();
  g.beginPath(); g.arc(256, 256, 230, 0, Math.PI * 2);
  g.fillStyle = '#181410'; g.fill();
  // Opal glass illuminated dial
  g.beginPath(); g.arc(256, 256, 222, 0, Math.PI * 2);
  g.fillStyle = '#fff9e8'; g.fill();
  // Minute ticks
  for (let i = 0; i < 60; i++) {
    const ang = (i / 60) * Math.PI * 2;
    const isHour = i % 5 === 0;
    const r1 = isHour ? 192 : 206;
    const r2 = 218;
    g.strokeStyle = isHour ? '#221b14' : '#887460';
    g.lineWidth = isHour ? 4.5 : 2;
    g.beginPath();
    g.moveTo(256 + Math.cos(ang) * r1, 256 + Math.sin(ang) * r1);
    g.lineTo(256 + Math.cos(ang) * r2, 256 + Math.sin(ang) * r2);
    g.stroke();
  }
  // Roman Numerals
  const numerals = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  g.fillStyle = '#16120c';
  g.font = '900 36px "Times New Roman", serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const rx = 256 + Math.cos(ang) * 165;
    const ry = 256 + Math.sin(ang) * 165;
    g.fillText(numerals[i], rx, ry);
  }
  // Central rosette
  g.beginPath(); g.arc(256, 256, 44, 0, Math.PI * 2);
  g.fillStyle = '#d4af37'; g.fill();
  // Hands (pointing to 10:10)
  g.strokeStyle = '#100e0b';
  g.lineCap = 'round';
  const hAng = (10 / 12 + 10 / 720) * Math.PI * 2 - Math.PI / 2;
  g.lineWidth = 11;
  g.beginPath(); g.moveTo(256, 256); g.lineTo(256 + Math.cos(hAng) * 98, 256 + Math.sin(hAng) * 98); g.stroke();
  const mAng = (10 / 60) * Math.PI * 2 - Math.PI / 2;
  g.lineWidth = 6.5;
  g.beginPath(); g.moveTo(256, 256); g.lineTo(256 + Math.cos(mAng) * 152, 256 + Math.sin(mAng) * 152); g.stroke();
  g.beginPath(); g.arc(256, 256, 16, 0, Math.PI * 2);
  g.fillStyle = '#f5cb42'; g.fill();
  return c;
}

function londonStreetSignTex(streetName, postCode) {
  const S = 512, c = canvas2D(S), g = c.getContext('2d');
  g.fillStyle = '#545048';
  g.fillRect(0, 0, S, S);
  const px = 24, py = 120, pw = 464, ph = 272;
  g.fillStyle = '#111111';
  g.fillRect(px - 4, py - 4, pw + 8, ph + 8);
  g.fillStyle = '#fdfdfb';
  g.fillRect(px, py, pw, ph);
  g.strokeStyle = '#222222';
  g.lineWidth = 3;
  g.strokeRect(px + 4, py + 4, pw - 8, ph - 8);
  g.fillStyle = '#111111';
  g.font = 'bold 22px "Trebuchet MS", sans-serif';
  g.textAlign = 'center';
  g.fillText('CITY OF WESTMINSTER', 256, py + 52);
  g.font = '900 56px "Trebuchet MS", Arial, sans-serif';
  g.fillText(streetName, 256, py + 144);
  g.fillStyle = '#d01e1e';
  g.font = '900 44px "Trebuchet MS", Arial, sans-serif';
  g.fillText(postCode, 256, py + 224);
  return c;
}

function pubSignTex() {
  const S = 512, c = canvas2D(S), g = c.getContext('2d');
  g.fillStyle = '#0f2416';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = '#d4af37';
  g.lineWidth = 14;
  g.strokeRect(18, 18, S - 36, S - 36);
  g.lineWidth = 3;
  g.strokeRect(32, 32, S - 64, S - 64);
  g.fillStyle = '#d4af37';
  // Golden Crown
  g.beginPath();
  g.moveTo(200, 160); g.lineTo(215, 115); g.lineTo(238, 138); g.lineTo(256, 105);
  g.lineTo(274, 138); g.lineTo(297, 115); g.lineTo(312, 160); g.closePath();
  g.fill();
  // Golden Anchor
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo(256, 170); g.lineTo(256, 250);
  g.moveTo(226, 192); g.lineTo(286, 192);
  g.arc(256, 218, 38, 0, Math.PI, false);
  g.stroke();
  g.font = 'bold 36px "Georgia", serif';
  g.textAlign = 'center';
  g.fillText('THE CROWN & ANCHOR', 256, 325);
  g.font = 'italic 24px "Georgia", serif';
  g.fillText('EST. 1842', 256, 375);
  g.font = 'bold 22px "Trebuchet MS", sans-serif';
  g.fillText('FINE ALES & FOOD', 256, 425);
  return c;
}

function busBlindTex() {
  const S = 512, c = canvas2D(S), g = c.getContext('2d');
  g.fillStyle = '#101214';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#f5b800';
  g.font = '900 64px "Trebuchet MS", Arial, sans-serif';
  g.textAlign = 'center';
  g.fillText('15  TRAFALGAR SQ', 256, 190);
  g.font = 'bold 42px "Trebuchet MS", Arial, sans-serif';
  g.fillText('via PICCADILLY & STRAND', 256, 280);
  g.font = 'bold 30px "Trebuchet MS", Arial, sans-serif';
  g.fillStyle = '#ffffff';
  g.fillText('LONDON TRANSPORT', 256, 365);
  return c;
}

function policeLiveryTex() {
  const S = 256, c = canvas2D(S), g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  const sz = 64;
  for (let y = 0; y < S; y += sz) {
    for (let x = 0; x < S; x += sz) {
      g.fillStyle = ((x / sz + y / sz) % 2 === 0) ? '#0038a8' : '#e6ff00';
      g.fillRect(x, y, sz, sz);
    }
  }
  g.fillStyle = '#0a0a0a';
  g.font = '900 28px "Trebuchet MS", sans-serif';
  g.textAlign = 'center';
  g.fillText('POLICE', 128, 140);
  return c;
}

function posterTex() {
  const S = 512, c = canvas2D(S), g = c.getContext('2d');
  g.fillStyle = '#24374a';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#dfa234';
  g.fillRect(32, 32, S - 64, S - 64);
  g.fillStyle = '#182430';
  g.fillRect(48, 48, S - 96, S - 96);
  g.fillStyle = '#f2e2be';
  g.fillRect(130, 200, 60, 180);
  g.beginPath(); g.moveTo(130, 200); g.lineTo(160, 120); g.lineTo(190, 200); g.fill();
  g.fillRect(230, 260, 120, 120);
  g.fillStyle = '#ffffff';
  g.font = '900 50px "Gill Sans", "Trebuchet MS", sans-serif';
  g.textAlign = 'center';
  g.fillText('FLY THE TUBE', 256, 110);
  g.font = 'bold 28px "Gill Sans", "Trebuchet MS", sans-serif';
  g.fillText('LONDON UNDERGROUND', 256, 430);
  return c;
}

function tubeTileTex() {
  const S = 512, c = canvas2D(S), g = c.getContext('2d');
  g.fillStyle = '#202020';
  g.fillRect(0, 0, S, S);
  const tw = 128, th = 64;
  for (let y = 0; y < S; y += th) {
    const row = (y / th) | 0;
    const off = row % 2 ? tw / 2 : 0;
    for (let x = -tw; x < S + tw; x += tw) {
      g.fillStyle = (row === 0 || row === 7) ? '#681324' : '#edf0f4';
      g.fillRect(x + off + 2, y + 2, tw - 4, th - 4);
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.fillRect(x + off + 2, y + 2, tw - 4, 3);
    }
  }
  return c;
}

function moquetteTex() {
  const S = 256, c = canvas2D(S), g = c.getContext('2d');
  g.fillStyle = '#192438';
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 32) {
    for (let x = 0; x < S; x += 32) {
      g.fillStyle = '#dd6b50';
      g.fillRect(x + 4, y + 4, 10, 10);
      g.fillStyle = '#f09652';
      g.fillRect(x + 18, y + 18, 10, 10);
      g.fillStyle = '#268f82';
      g.fillRect(x + 4, y + 18, 10, 10);
      g.fillStyle = '#e26245';
      g.fillRect(x + 18, y + 4, 10, 10);
    }
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

function lookLeftTex(dir = 'left') {
  const S = 512, c = canvas2D(S), g = c.getContext('2d');
  g.fillStyle = '#1c1e22';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#f5f7fa';
  g.font = '900 64px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (dir === 'left') {
    g.fillText('◄ LOOK LEFT', S / 2, S / 2);
  } else {
    g.fillText('LOOK RIGHT ►', S / 2, S / 2);
  }
  return c;
}

function neonSignsTex() {
  const S = 512, c = canvas2D(S), g = c.getContext('2d');
  g.fillStyle = '#080b10';
  g.fillRect(0, 0, S, S);
  
  // Bovril
  g.strokeStyle = '#ff3344';
  g.lineWidth = 6;
  g.strokeRect(16, 16, S - 32, 136);
  g.fillStyle = '#ff2b3d';
  g.font = '900 60px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center';
  g.fillText('BOVRIL', S / 2, 80);
  g.fillStyle = '#ffbb33';
  g.font = 'bold 20px sans-serif';
  g.fillText('PREVENTS THAT SINKING FEELING', S / 2, 124);

  // Schweppes
  g.strokeStyle = '#00e5ff';
  g.strokeRect(16, 172, S - 32, 136);
  g.fillStyle = '#00e5ff';
  g.font = '900 52px sans-serif';
  g.fillText('SCHWEPPES', S / 2, 235);
  g.fillStyle = '#ffffff';
  g.font = 'italic bold 20px sans-serif';
  g.fillText('TONIC WATER • TABLE WATERS', S / 2, 280);

  // Guinness
  g.strokeStyle = '#ffbb22';
  g.strokeRect(16, 330, S - 32, 164);
  g.fillStyle = '#ffdd44';
  g.font = '900 56px "Georgia", serif';
  g.fillText('GUINNESS', S / 2, 400);
  g.fillStyle = '#ffffff';
  g.font = 'bold 22px sans-serif';
  g.fillText('TIME FOR A GUINNESS', S / 2, 452);

  return c;
}

function fishChipsTex() {
  const S = 512, c = canvas2D(S), g = c.getContext('2d');
  g.fillStyle = '#0d2238';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = '#d4af37';
  g.lineWidth = 10;
  g.strokeRect(16, 16, S - 32, S - 32);
  g.fillStyle = '#ffffff';
  g.font = '900 44px "Arial Black", Impact, sans-serif';
  g.textAlign = 'center';
  g.fillText('THE GOLDEN CHIP', S / 2, 110);
  g.fillStyle = '#ffd700';
  g.font = 'bold 28px "Trebuchet MS", sans-serif';
  g.fillText('TRADITIONAL FISH & CHIPS', S / 2, 175);
  g.fillStyle = '#edf2f7';
  g.font = 'bold 22px sans-serif';
  g.fillText('FRESH COD • HADDOCK • PIE & MASH', S / 2, 240);
  g.fillText('SALT & VINEGAR • MUSHY PEAS', S / 2, 296);
  g.fillStyle = '#d4af37';
  g.font = 'italic bold 20px serif';
  g.fillText('Est. 1928 — London SE1', S / 2, 410);
  return c;
}

function royalMailVanTex() {
  const S = 512, c = canvas2D(S), g = c.getContext('2d');
  g.fillStyle = '#ba141a';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#ffd700';
  g.font = 'bold 64px "Times New Roman", serif';
  g.textAlign = 'center';
  g.fillText('E II R', S / 2, 180);
  g.fillStyle = '#ffffff';
  g.font = '900 48px "Trebuchet MS", sans-serif';
  g.fillText('Royal Mail', S / 2, 290);
  g.font = 'bold 22px sans-serif';
  g.fillText('FIRST & SECOND CLASS PARCELS', S / 2, 350);
  return c;
}

function manholeTex() {
  const S = 256, c = canvas2D(S), g = c.getContext('2d');
  g.fillStyle = '#1c1e22';
  g.fillRect(0, 0, S, S);
  g.strokeStyle = '#383d46';
  g.lineWidth = 14;
  g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 14, 0, Math.PI * 2); g.stroke();
  for (let i = 24; i < S - 24; i += 16) {
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(i, 24); g.lineTo(i, S - 24); g.stroke();
    g.beginPath(); g.moveTo(24, i); g.lineTo(S - 24, i); g.stroke();
  }
  g.fillStyle = '#8e96a2';
  g.font = 'bold 18px sans-serif';
  g.textAlign = 'center';
  g.fillText('THAMES WATER', S / 2, S / 2 - 6);
  g.font = 'bold 13px sans-serif';
  g.fillText('DRAINAGE', S / 2, S / 2 + 18);
  return c;
}

function newsagentTex() {
  const S = 512, c = canvas2D(S), g = c.getContext('2d');
  g.fillStyle = '#162e24';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#ffffff';
  g.font = '900 44px "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.fillText('LONDON NEWS', S / 2, 70);
  g.fillStyle = '#ffecb3';
  g.font = 'bold 22px sans-serif';
  g.fillText('PAPERS • CONFECTIONERY • POSTCARDS', S / 2, 115);
  g.fillStyle = '#f0f0ea';
  g.fillRect(40, 160, 200, 140);
  g.fillRect(270, 160, 200, 140);
  g.fillStyle = '#111111';
  g.font = '900 22px "Times New Roman", serif';
  g.fillText('THE TIMES', 140, 210);
  g.fillText('STANDARD', 370, 210);
  g.font = '14px sans-serif';
  g.fillText('CITY REPORT', 140, 250);
  g.fillText('WESTMINSTER DISPATCH', 370, 250);
  return c;
}

function ambulanceLiveryTex() {
  const S = 512, c = canvas2D(S), g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  // High-visibility Battenburg pattern (Yellow + Green checkers)
  const bw = 128, bh = 80;
  for (let y = 140; y < 300; y += bh) {
    const row = (y / bh) | 0;
    for (let x = 0; x < S; x += bw) {
      const col = (x / bw) | 0;
      g.fillStyle = (row + col) % 2 === 0 ? '#d4e815' : '#0a7d32';
      g.fillRect(x, y, bw, bh);
    }
  }
  g.fillStyle = '#0a7d32';
  g.font = '900 44px "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.fillText('AMBULANCE', S / 2, 85);
  g.fillStyle = '#005ea5';
  g.font = '900 36px sans-serif';
  g.fillText('NHS LONDON', S / 2, 380);
  g.font = 'bold 24px sans-serif';
  g.fillText('EMERGENCY SERVICE', S / 2, 425);
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
    brickRed:    texFromCanvas(cBrickRed, 1, true),
    brickBrown:  texFromCanvas(cBrickBrown, 1, true),
    brickCream:  texFromCanvas(cBrickCream, 1, true),
    concrete:    texFromCanvas(cConcrete, 1, true),
    concrete2:   texFromCanvas(cConcrete2, 1, true),
    paving:      texFromCanvas(cPaving, 1, true),
    asphalt:     texFromCanvas(cAsphalt, 1, true),
    rust:        texFromCanvas(cRust, 1, true),
    rust2:       texFromCanvas(cRust2, 1, true),
    wood:        texFromCanvas(cWood, 1, true),
    woodDark:    texFromCanvas(cWoodDark, 1, true),
    fabric:      texFromCanvas(cTacticalFabric, 1, true),
    screen:      texFromCanvas(cScreen, 1, true),
    roundel:     texFromCanvas(roundelTex(), 1, true),
    clockFace:   texFromCanvas(bigBenClockTex(), 1, true),
    streetSign:  texFromCanvas(londonStreetSignTex('WHITEHALL', 'SW1'), 1, true),
    streetSign2: texFromCanvas(londonStreetSignTex('PICCADILLY', 'W1'), 1, true),
    pubSign:     texFromCanvas(pubSignTex(), 1, true),
    busBlind:    texFromCanvas(busBlindTex(), 1, true),
    police:      texFromCanvas(policeLiveryTex(), 1, true),
    poster:      texFromCanvas(posterTex(), 1, true),
    tubeTile:    texFromCanvas(tubeTileTex(), 1, true),
    moquette:    texFromCanvas(moquetteTex(), 1, true),
    lookLeft:    texFromCanvas(lookLeftTex('left'), 1, true),
    lookRight:   texFromCanvas(lookLeftTex('right'), 1, true),
    neonSigns:   texFromCanvas(neonSignsTex(), 1, true),
    fishChips:   texFromCanvas(fishChipsTex(), 1, true),
    royalMail:   texFromCanvas(royalMailVanTex(), 1, true),
    manhole:     texFromCanvas(manholeTex(), 1, true),
    newsagent:   texFromCanvas(newsagentTex(), 1, true),
    ambulance:   texFromCanvas(ambulanceLiveryTex(), 1, true),
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
    roundel:      pbr(0xffffff, { map:T.roundel, em:0xffffff, emi:1.1, emMap:T.roundel, r:0.35 }),
    clockFace:    pbr(0xffffff, { map:T.clockFace, em:0xffe2a0, emi:1.5, emMap:T.clockFace, r:0.2 }),
    streetSign:   pbr(0xffffff, { map:T.streetSign, r:0.3, m:0.1 }),
    streetSign2:  pbr(0xffffff, { map:T.streetSign2, r:0.3, m:0.1 }),
    pubSign:      pbr(0xffffff, { map:T.pubSign, r:0.4, m:0.15 }),
    busBlind:     pbr(0xffffff, { map:T.busBlind, em:0xffd700, emi:1.2, emMap:T.busBlind, r:0.3 }),
    police:       pbr(0xffffff, { map:T.police, r:0.28, m:0.15 }),
    poster:       pbr(0xffffff, { map:T.poster, r:0.65 }),
    tubeTile:     pbr(0xffffff, { map:T.tubeTile, r:0.25, m:0.05 }),
    moquette:     pbr(0xffffff, { map:T.moquette, r:0.95, m:0.0 }),
    lookLeft:     pbr(0xffffff, { map:T.lookLeft, r:0.65 }),
    lookRight:    pbr(0xffffff, { map:T.lookRight, r:0.65 }),
    neonSigns:    pbr(0xffffff, { map:T.neonSigns, em:0xffffff, emi:1.3, emMap:T.neonSigns, r:0.25 }),
    fishChips:    pbr(0xffffff, { map:T.fishChips, r:0.35, m:0.1 }),
    royalMail:    pbr(0xffffff, { map:T.royalMail, r:0.35, m:0.1 }),
    manhole:      pbr(0xffffff, { map:T.manhole, r:0.45, m:0.75 }),
    newsagent:    pbr(0xffffff, { map:T.newsagent, r:0.55 }),
    ambulance:    pbr(0xffffff, { map:T.ambulance, r:0.30, m:0.1 }),
    thamesWater:  pbr(0x1a3330, { r:0.15, m:0.3, env:1.8 }),
    gold:         pbr(0xd4af37, { r:0.22, m:0.88, env:1.6 }),
    belisha:      pbr(0xff8800, { em:0xff7700, emi:2.5, r:0.15 }),
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
  roundel:   { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'roundel' },
  clockFace: { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'clockFace' },
  streetSign:{ pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'streetSign' },
  streetSign2:{ pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'streetSign2' },
  pubSign:   { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'pubSign' },
  busBlind:  { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'busBlind' },
  police:    { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'police' },
  poster:    { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'poster' },
  tubeTile:  { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'tubeTile' },
  moquette:  { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'moquette' },
  gold:      { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'gold' },
  belisha:   { pos: [], nor: [], uv: [], idx: [], n: 0, matKey: 'belisha' },
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

  // Exterior Hanging Pub Sign ("THE CROWN & ANCHOR - EST. 1842")
  addBox(cx, 4.2, zFront - 1.2, 1.8, 1.8, 0.08, 'pubSign', false, true);
  addBox(cx, 5.15, zFront - 0.6, 0.08, 0.08, 1.2, 'metalDark', false, true);
  // Outdoor beer garden tables and benches
  addBox(cx + 4.5, 0.45, zFront - 2.8, 1.8, 0.08, 0.9, 'wood', true, true);
  addBox(cx + 4.5, 0.25, zFront - 3.4, 1.8, 0.08, 0.3, 'wood', true, true);
  addBox(cx + 4.5, 0.25, zFront - 2.2, 1.8, 0.08, 0.3, 'wood', true, true);
  // Second floor green felt pool table
  addBox(cx - 3.2, floorH + 0.5, cz, 2.2, 0.45, 1.2, 'green', true, true);
  addBox(cx - 3.2, floorH + 0.72, cz, 2.4, 0.12, 1.4, 'woodDark', false, true);

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

function enterablePhoneBox(x, z) {
  addBox(x, 0.05, z, 1.1, 0.1, 1.1, 'metalDark', true, true);
  // Left wall
  addBox(x - 0.5, 0.1, z, 0.08, 2.25, 1.0, 'red', true, true);
  addBox(x - 0.51, 0.5, z, 0.02, 1.5, 0.75, 'glass', false, true);
  // Right wall
  addBox(x + 0.5, 0.1, z, 0.08, 2.25, 1.0, 'red', true, true);
  addBox(x + 0.51, 0.5, z, 0.02, 1.5, 0.75, 'glass', false, true);
  // Back wall
  addBox(x, 0.1, z - 0.5, 1.0, 2.25, 0.08, 'red', true, true);
  addBox(x, 0.5, z - 0.51, 0.75, 1.5, 0.02, 'glass', false, true);
  // Front doorframe posts (leaving open doorway in center for player entry!)
  addBox(x - 0.44, 0.1, z + 0.5, 0.14, 2.25, 0.08, 'red', true, true);
  addBox(x + 0.44, 0.1, z + 0.5, 0.14, 2.25, 0.08, 'red', true, true);
  addBox(x, 2.1, z + 0.5, 0.75, 0.25, 0.08, 'red', false, true);
  // Interior vintage telephone unit
  addBox(x, 1.25, z - 0.42, 0.35, 0.48, 0.12, 'metalDark', false, true);
  addBox(x, 1.22, z - 0.34, 0.14, 0.14, 0.04, 'metal', false, true);
  addBox(x - 0.14, 1.32, z - 0.34, 0.06, 0.28, 0.06, 'black', false, true);
  addBox(x, 0.85, z - 0.35, 0.6, 0.04, 0.25, 'wood', false, true);
  // Domed roof
  addBox(x, 2.35, z, 1.15, 0.12, 1.15, 'red', false, true);
  addBox(x, 2.47, z, 0.95, 0.18, 0.95, 'red', false, true);
  addBox(x, 2.65, z, 0.25, 0.12, 0.25, 'gold', false, true);
}

function postBox(x, z) {
  addBox(x, 0, z, 0.5, 0.15, 0.5, 'black', true, true);
  addBox(x, 0.15, z, 0.46, 1.05, 0.46, 'red', true, true);
  addBox(x, 1.2, z, 0.5, 0.15, 0.5, 'red', false, true);
  addBox(x, 0.95, z + 0.24, 0.26, 0.06, 0.04, 'black', false, true);
  addBox(x, 0.65, z + 0.24, 0.16, 0.22, 0.02, 'gold', false, true);
}

function streetLamp(x, z) {
  addBox(x, 0, z, 0.4, 0.7, 0.4, 'metalDark', true, true);
  addBox(x, 0.7, z, 0.14, 3.2, 0.14, 'metalDark', true, true);
  addBox(x, 3.9, z, 0.45, 0.15, 0.45, 'metalDark', false, true);
  addBox(x, 4.05, z, 0.38, 0.55, 0.38, 'glass', false, true);
  addBox(x, 4.25, z, 0.12, 0.18, 0.12, 'yellow', false, true);
  addBox(x, 4.6, z, 0.45, 0.22, 0.45, 'metalDark', false, true);
}

function bench(x, z) {
  addBox(x, 0.35, z, 2.0, 0.1, 0.6, 'wood', true, true);
  addBox(x, 0.75, z - 0.25, 2.0, 0.6, 0.1, 'wood', false, true);
  addBox(x - 0.9, 0, z, 0.1, 0.4, 0.1, 'metal', false, true);
  addBox(x + 0.9, 0, z, 0.1, 0.4, 0.1, 'metal', false, true);
}

function bollard(x, z) {
  addBox(x, 0, z, 0.2, 0.85, 0.2, 'black', true, true);
  addBox(x, 0.85, z, 0.26, 0.15, 0.26, 'gold', false, true);
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

export function enterableDoubleDecker(cx, cz, isEastWest = false) {
  const w = 2.6, l = 11.0;
  if (!isEastWest) {
    // LOWER DECK: floor at y = 0.16
    addBox(cx, 0.16, cz, w - 0.2, 0.12, l - 0.4, 'metalDark', true, true);
    // Wheels (4 sets)
    for (const wx of [-w / 2 - 0.05, w / 2 + 0.05]) {
      for (const wz of [-l / 2 + 1.8, l / 2 - 2.2]) {
        addBox(cx + wx, 0, cz + wz, 0.25, 0.9, 0.9, 'black', true, true);
        addBox(cx + wx * 1.05, 0.2, cz + wz, 0.08, 0.5, 0.5, 'metal', false, true);
      }
    }
    // Right exterior lower wall
    addBox(cx + w / 2 - 0.06, 0.22, cz, 0.12, 0.85, l - 0.4, 'red', true, true);
    addBox(cx + w / 2 - 0.06, 1.07, cz, 0.06, 0.95, l - 1.2, 'glass', false, true);
    // Left exterior lower wall (leave rear 2.2m OPEN for boarding!)
    addBox(cx - w / 2 + 0.06, 0.22, cz - 1.1, 0.12, 0.85, l - 2.8, 'red', true, true);
    addBox(cx - w / 2 + 0.06, 1.07, cz - 1.1, 0.06, 0.95, l - 3.4, 'glass', false, true);
    // Yellow chrome boarding pole at open rear door
    addBox(cx - w / 2 + 0.1, 0.22, cz + 4.3, 0.06, 1.95, 0.06, 'yellow', true, true);
    // Lower front wall & windshield
    addBox(cx, 0.22, cz - l / 2 + 0.08, w - 0.2, 0.85, 0.12, 'red', true, true);
    addBox(cx, 1.07, cz - l / 2 + 0.08, w - 0.3, 0.95, 0.06, 'glass', false, true);
    // Lower rear wall (right portion closed, left open for entry)
    addBox(cx + 0.65, 0.22, cz + l / 2 - 0.08, 1.2, 0.85, 0.12, 'red', true, true);
    // Front driver cab
    addBox(cx - 0.55, 0.22, cz - 4.2, 0.55, 0.48, 0.55, 'leather', true, true);
    addBox(cx - 0.55, 0.7, cz - 4.7, 0.6, 0.4, 0.45, 'metalDark', true, true);
    addBox(cx - 0.55, 0.95, cz - 4.55, 0.36, 0.36, 0.06, 'black', false, true);
    addBox(cx + 0.2, 0.22, cz - 3.6, 0.8, 1.4, 0.08, 'metalDark', true, true);
    // Lower passenger seats in moquette
    for (let z = -2.8; z <= 2.2; z += 1.25) {
      addBox(cx + 0.78, 0.22, cz + z, 0.75, 0.44, 0.45, 'moquette', true, true);
      addBox(cx + 0.78, 0.66, cz + z - 0.18, 0.75, 0.42, 0.1, 'moquette', false, true);
      addBox(cx - 0.78, 0.22, cz + z, 0.75, 0.44, 0.45, 'moquette', true, true);
      addBox(cx - 0.78, 0.66, cz + z - 0.18, 0.75, 0.42, 0.1, 'moquette', false, true);
    }
    // Yellow grab stanchions
    addBox(cx - 0.38, 0.22, cz - 0.5, 0.05, 1.9, 0.05, 'yellow', true, true);
    addBox(cx + 0.38, 0.22, cz + 1.2, 0.05, 1.9, 0.05, 'yellow', true, true);
    // INTERIOR STAIRCASE TO UPPER DECK (rear right)
    addStairs(cx + 0.68, 0.22, cz + 3.6, 0.85, 2.0, 7, 's', 'metal');
    // UPPER DECK FLOOR at y = 2.22
    addBox(cx, 2.22, cz - 0.9, w - 0.2, 0.12, l - 3.0, 'metalDark', true, true);
    addBox(cx + 0.2, 2.34, cz + 3.6, 0.06, 0.9, 1.8, 'yellow', true, true);
    // Upper deck front row panoramic seats
    addBox(cx - 0.6, 2.34, cz - 4.6, 0.8, 0.44, 0.45, 'moquette', true, true);
    addBox(cx + 0.6, 2.34, cz - 4.6, 0.8, 0.44, 0.45, 'moquette', true, true);
    // Upper deck passenger rows
    for (let z = -3.2; z <= 2.2; z += 1.25) {
      addBox(cx - 0.78, 2.34, cz + z, 0.75, 0.44, 0.45, 'moquette', true, true);
      addBox(cx - 0.78, 2.78, cz + z - 0.18, 0.75, 0.42, 0.1, 'moquette', false, true);
      addBox(cx + 0.78, 2.34, cz + z, 0.75, 0.44, 0.45, 'moquette', true, true);
      addBox(cx + 0.78, 2.78, cz + z - 0.18, 0.75, 0.42, 0.1, 'moquette', false, true);
    }
    // Upper deck walls & panoramic windows all around
    addBox(cx + w / 2 - 0.06, 2.22, cz, 0.12, 0.65, l - 0.4, 'red', true, true);
    addBox(cx - w / 2 + 0.06, 2.22, cz, 0.12, 0.65, l - 0.4, 'red', true, true);
    addBox(cx + w / 2 - 0.06, 2.87, cz, 0.06, 0.98, l - 0.6, 'glass', false, true);
    addBox(cx - w / 2 + 0.06, 2.87, cz, 0.06, 0.98, l - 0.6, 'glass', false, true);
    addBox(cx, 2.87, cz - l / 2 + 0.08, w - 0.3, 0.98, 0.06, 'glass', false, true);
    addBox(cx, 2.87, cz + l / 2 - 0.08, w - 0.3, 0.98, 0.06, 'glass', false, true);
    // Red bus roof
    addBox(cx, 3.88, cz, w + 0.1, 0.22, l + 0.1, 'red', true, true);
    addBox(cx, 4.05, cz, w - 0.2, 0.15, l - 0.4, 'red', false, true);
    // Front & rear destination roll displays
    addBox(cx, 3.48, cz - l / 2 - 0.02, 1.8, 0.42, 0.05, 'busBlind', false, true);
    addBox(cx, 3.48, cz + l / 2 + 0.02, 1.8, 0.42, 0.05, 'busBlind', false, true);
    // Front bumper, chrome grille & round headlights
    addBox(cx, 0.25, cz - l / 2 - 0.15, w, 0.22, 0.15, 'metalDark', false, true);
    addBox(cx, 0.45, cz - l / 2 - 0.12, 1.1, 0.45, 0.05, 'metal', false, true);
    addBox(cx - 0.85, 0.52, cz - l / 2 - 0.12, 0.25, 0.25, 0.05, 'yellow', false, true);
    addBox(cx + 0.85, 0.52, cz - l / 2 - 0.12, 0.25, 0.25, 0.05, 'yellow', false, true);
  } else {
    // East-West orientation
    addBox(cx, 0.16, cz, l - 0.4, 0.12, w - 0.2, 'metalDark', true, true);
    for (const wz of [-w / 2 - 0.05, w / 2 + 0.05]) {
      for (const wx of [-l / 2 + 1.8, l / 2 - 2.2]) {
        addBox(cx + wx, 0, cz + wz, 0.9, 0.9, 0.25, 'black', true, true);
      }
    }
    addBox(cx, 0.22, cz + w / 2 - 0.06, l - 0.4, 0.85, 0.12, 'red', true, true);
    addBox(cx, 1.07, cz + w / 2 - 0.06, l - 1.2, 0.95, 0.06, 'glass', false, true);
    addBox(cx - 1.1, 0.22, cz - w / 2 + 0.06, l - 2.8, 0.85, 0.12, 'red', true, true);
    addBox(cx - 1.1, 1.07, cz - w / 2 + 0.06, l - 3.4, 0.95, 0.06, 'glass', false, true);
    addBox(cx + 4.3, 0.22, cz - w / 2 + 0.1, 0.06, 1.95, 0.06, 'yellow', true, true);
    addStairs(cx + 3.6, 0.22, cz + 0.68, 0.85, 2.0, 7, 'e', 'metal');
    addBox(cx - 0.9, 2.22, cz, l - 3.0, 0.12, w - 0.2, 'metalDark', true, true);
    addBox(cx, 3.88, cz, l + 0.1, 0.22, w + 0.1, 'red', true, true);
    addBox(cx - l / 2 - 0.02, 3.48, cz, 0.05, 0.42, 1.8, 'busBlind', false, true);
  }
}

export function enterableBlackCab(cx, cz, isEastWest = false) {
  const w = 2.0, l = 4.6;
  if (!isEastWest) {
    // Wheels
    for (const wx of [-w / 2 - 0.04, w / 2 + 0.04]) {
      for (const wz of [-l / 2 + 1.1, l / 2 - 1.1]) {
        addBox(cx + wx, 0, cz + wz, 0.22, 0.65, 0.65, 'black', true, true);
        addBox(cx + wx * 1.05, 0.15, cz + wz, 0.06, 0.35, 0.35, 'metal', false, true);
      }
    }
    // Floor
    addBox(cx, 0.18, cz, w - 0.2, 0.1, l - 0.4, 'metalDark', true, true);
    // Rear passenger leather bench seat
    addBox(cx, 0.28, cz + 1.4, w - 0.35, 0.42, 0.6, 'leather', true, true);
    addBox(cx, 0.7, cz + 1.75, w - 0.35, 0.5, 0.15, 'leather', false, true);
    // Fold-down jump seats
    addBox(cx - 0.5, 0.28, cz + 0.35, 0.45, 0.38, 0.38, 'leather', true, true);
    addBox(cx + 0.5, 0.28, cz + 0.35, 0.45, 0.38, 0.38, 'leather', true, true);
    // Driver seat and steering wheel (UK right side)
    addBox(cx + 0.45, 0.28, cz - 0.55, 0.5, 0.45, 0.5, 'leather', true, true);
    addBox(cx + 0.45, 0.82, cz - 0.95, 0.35, 0.35, 0.05, 'black', false, true);
    addBox(cx, 0.65, cz - 1.15, w - 0.3, 0.4, 0.35, 'metalDark', true, true);
    addBox(cx - 0.1, 0.88, cz - 1.0, 0.18, 0.12, 0.04, 'yellow', false, true);
    // Front hood & grille
    addBox(cx, 0.3, cz - 1.7, w - 0.35, 0.55, 1.3, 'black', true, true);
    addBox(cx, 0.42, cz - 2.36, 0.75, 0.44, 0.05, 'metal', false, true);
    addBox(cx - 0.65, 0.5, cz - 2.36, 0.22, 0.22, 0.05, 'yellow', false, true);
    addBox(cx + 0.65, 0.5, cz - 2.36, 0.22, 0.22, 0.05, 'yellow', false, true);
    // Windshield & roof
    addBox(cx, 1.05, cz - 1.0, w - 0.4, 0.55, 0.06, 'glass', false, true);
    addBox(cx, 1.75, cz + 0.3, w - 0.08, 0.12, 2.8, 'black', true, true);
    // Open doorframe allows player to walk into the passenger cabin!
    addBox(cx, 1.88, cz - 0.6, 0.52, 0.18, 0.18, 'yellow', false, true);
  } else {
    addBox(cx, 0.18, cz, l - 0.4, 0.1, w - 0.2, 'metalDark', true, true);
    addBox(cx + 1.4, 0.28, cz, 0.6, 0.42, w - 0.35, 'leather', true, true);
    addBox(cx + 0.3, 1.75, cz, 2.8, 0.12, w - 0.08, 'black', true, true);
  }
}

export function enterablePoliceCar(cx, cz, isEastWest = false) {
  const w = 2.0, l = 4.6;
  addBox(cx, 0.18, cz, w - 0.2, 0.1, l - 0.4, 'metalDark', true, true);
  // Livery sides
  addBox(cx + w / 2 - 0.05, 0.35, cz, 0.1, 0.55, 2.6, 'police', false, true);
  addBox(cx - w / 2 + 0.05, 0.35, cz, 0.1, 0.55, 2.6, 'police', false, true);
  // Interior seats & wheel
  addBox(cx - 0.45, 0.28, cz - 0.4, 0.45, 0.45, 0.45, 'leather', true, true);
  addBox(cx + 0.45, 0.28, cz - 0.4, 0.45, 0.45, 0.45, 'leather', true, true);
  addBox(cx, 0.28, cz + 1.2, w - 0.4, 0.42, 0.5, 'leather', true, true);
  addBox(cx + 0.45, 0.82, cz - 0.8, 0.35, 0.35, 0.05, 'black', false, true);
  // Roof & lightbar
  addBox(cx, 1.62, cz + 0.2, w - 0.15, 0.1, 2.4, 'black', true, true);
  addBox(cx, 1.72, cz, 1.1, 0.08, 0.22, 'metalDark', false, true);
  addBox(cx - 0.35, 1.8, cz, 0.35, 0.12, 0.18, 'blue', false, true);
  addBox(cx + 0.35, 1.8, cz, 0.35, 0.12, 0.18, 'red', false, true);
}

export function bigBenTower(cx, cz) {
  const bw = 14, bd = 14, totalH = 44;
  // Base plinth
  addBox(cx, 0, cz, bw + 2, 0.8, bd + 2, 'concrete2', true, true);
  addBox(cx, 0.8, cz, bw, 22.0, bd, 'brickC', true, true);
  // Arched double portals (North and South) - open for player entry!
  addBox(cx, 0.8, cz - bd / 2 + 0.15, 3.6, 4.4, 0.3, 'concrete2', false, false);
  addBox(cx, 0.8, cz + bd / 2 - 0.15, 3.6, 4.4, 0.3, 'concrete2', false, false);
  // Gothic plinth buttresses
  for (let s = 0; s < 4; s++) {
    const ang = s * Math.PI / 2;
    const bx = Math.sin(ang) * (bw / 2 + 0.6), bz = Math.cos(ang) * (bd / 2 + 0.6);
    addBox(cx + bx, 0.8, cz + bz, 1.6, 22.0, 1.6, 'concrete2', true, true);
  }
  // INTERIOR STAIRCASE FLIGHTS
  // Level 1 (y = 0 to 6m)
  addStairs(cx + 3.4, 0.8, cz, 1.6, 5.2, 14, 's', 'concrete2');
  addBox(cx, 6.0, cz, bw - 1.2, 0.22, bd - 1.2, 'concrete2', true, true);
  // Level 2 (y = 6m to 12m)
  addStairs(cx - 3.4, 6.0, cz, 1.6, 6.0, 14, 'n', 'concrete2');
  addBox(cx, 12.0, cz, bw - 1.2, 0.22, bd - 1.2, 'concrete2', true, true);
  // Level 3 (y = 12m to 18m)
  addStairs(cx, 12.0, cz + 3.4, 1.6, 6.0, 14, 'w', 'concrete2');
  addBox(cx, 18.0, cz, bw - 1.2, 0.22, bd - 1.2, 'concrete2', true, true);
  // Clockwork mechanism in Level 3
  addBox(cx, 18.22, cz, 3.5, 2.2, 2.5, 'metalDark', true, true);
  addBox(cx, 19.2, cz + 1.4, 0.8, 1.8, 0.2, 'gold', false, true);
  // Level 4 (y = 18m to 24m)
  addStairs(cx, 18.0, cz - 3.4, 1.6, 6.0, 14, 'e', 'concrete2');
  addBox(cx, 24.0, cz, bw - 1.2, 0.22, bd - 1.2, 'concrete2', true, true);
  // Level 5 (y = 24m to 30m) to BELFRY OBSERVATION DECK
  addStairs(cx + 3.4, 24.0, cz, 1.6, 6.0, 14, 's', 'concrete2');
  // THE GREAT CLOCK DIAL STAGE (y = 22.5 to 29.5)
  addBox(cx, 22.8, cz, bw + 0.8, 6.8, bd + 0.8, 'brickC', true, true);
  // 4 Giant Illuminated Clock Faces
  addBox(cx, 26.0, cz - bd / 2 - 0.45, 6.2, 6.2, 0.12, 'clockFace', false, true);
  addBox(cx, 26.0, cz + bd / 2 + 0.45, 6.2, 6.2, 0.12, 'clockFace', false, true);
  addBox(cx - bw / 2 - 0.45, 26.0, cz, 0.12, 6.2, 6.2, 'clockFace', false, true);
  addBox(cx + bw / 2 + 0.45, 26.0, cz, 0.12, 6.2, 6.2, 'clockFace', false, true);
  // BELFRY & 360-DEGREE OBSERVATION DECK (y = 30m)
  addBox(cx, 30.0, cz, bw + 0.4, 0.25, bd + 0.4, 'concrete2', true, true);
  // Parapet with stone crenellations for sniper cover!
  addBox(cx - bw / 2, 30.25, cz, 0.4, 1.15, bd, 'concrete2', true, true);
  addBox(cx + bw / 2, 30.25, cz, 0.4, 1.15, bd, 'concrete2', true, true);
  addBox(cx, 30.25, cz - bd / 2, bw, 1.15, 0.4, 'concrete2', true, true);
  addBox(cx, 30.25, cz + bd / 2, bw, 1.15, 0.4, 'concrete2', true, true);
  // THE GREAT BELL ("BIG BEN") IN THE CENTER
  addBox(cx, 32.2, cz, 3.2, 0.75, 3.2, 'rust2', true, true);
  addBox(cx, 32.95, cz, 2.5, 1.6, 2.5, 'rust2', true, true);
  addBox(cx, 34.55, cz, 1.5, 0.6, 1.5, 'metalDark', false, true);
  // Crossbeams supporting the bell
  addBox(cx, 35.2, cz, bw - 2, 0.45, 0.45, 'metalDark', false, true);
  addBox(cx, 35.2, cz, 0.45, 0.45, bd - 2, 'metalDark', false, true);
  // Belfry corner columns
  for (let s = 0; s < 4; s++) {
    const ang = s * Math.PI / 2 + Math.PI / 4;
    const px = Math.sin(ang) * (bw * 0.65), pz = Math.cos(ang) * (bd * 0.65);
    addBox(cx + px, 30.25, cz + pz, 1.4, 6.5, 1.4, 'concrete2', true, true);
  }
  // GOTHIC SPIRE & LANTERN (y = 36m to 44m)
  addBox(cx, 36.5, cz, bw - 2, 1.2, bd - 2, 'concrete2', false, true);
  addBox(cx, 37.7, cz, bw - 4, 3.0, bd - 4, 'metalDark', false, true);
  addBox(cx, 40.7, cz, 4.0, 3.5, 4.0, 'gold', false, true);
  addBox(cx, 43.5, cz, 0.6, 2.5, 0.6, 'gold', false, true);
  occupy(cx - bw / 2 - 1, cx + bw / 2 + 1, cz - bd / 2 - 1, cz + bd / 2 + 1, 0.5);
}

export function undergroundStation(cx, cz) {
  const sw = 20, sd = 14, sh = 5.2;
  // Red Edwardian glazed facade
  addBox(cx, 0, cz, sw, sh, sd, 'red', true, true);
  addBox(cx, sh, cz, sw + 0.6, 0.4, sd + 0.6, 'concrete2', false, true);
  // Wide open station entrance portals (front)
  addBox(cx, 0, cz - sd / 2 + 0.15, sw * 0.7, 3.8, 0.3, 'tubeTile', false, false);
  // Station Interior Ticket Concourse
  addBox(cx, 0.05, cz, sw - 1.2, 0.1, sd - 1.2, 'tubeTile', false, true);
  // Interior white glazed tube tiles & posters
  addBox(cx - sw / 2 + 0.4, 0.1, cz, 0.1, sh - 0.2, sd - 1.2, 'tubeTile', true, true);
  addBox(cx + sw / 2 - 0.4, 0.1, cz, 0.1, sh - 0.2, sd - 1.2, 'tubeTile', true, true);
  addBox(cx, 0.1, cz + sd / 2 - 0.4, sw - 1.2, sh - 0.2, 0.1, 'tubeTile', true, true);
  // London Underground travel posters on interior walls
  addBox(cx - sw / 2 + 0.52, 1.5, cz - 2.5, 0.05, 2.2, 1.6, 'poster', false, true);
  addBox(cx - sw / 2 + 0.52, 1.5, cz + 2.5, 0.05, 2.2, 1.6, 'poster', false, true);
  addBox(cx + sw / 2 - 0.52, 1.5, cz, 0.05, 2.2, 1.6, 'poster', false, true);
  // Oyster card automatic ticket barrier gates
  for (let g = -3; g <= 3; g += 1.5) {
    addBox(cx + g, 0.1, cz - 1.0, 0.25, 1.1, 1.4, 'metalDark', true, true);
    addBox(cx + g, 1.12, cz - 1.0, 0.2, 0.06, 0.3, 'yellow', false, true);
  }
  // Ticket vending machines
  addBox(cx + 6.8, 0.1, cz - 3.5, 1.8, 2.1, 0.8, 'metalDark', true, true);
  addBox(cx + 6.8, 1.3, cz - 3.88, 0.8, 0.6, 0.05, 'screen', false, true);
  // Station staircase to upper pedestrian crossover bridge
  addStairs(cx + 7.5, 0.1, cz + 2.0, 1.6, 3.4, 12, 'n', 'concrete2');
  addBox(cx, 3.4, cz + 4.0, sw - 2, 0.2, 2.6, 'concrete2', true, true);
  addBox(cx, 3.6, cz + 5.2, sw - 2, 1.05, 0.1, 'metal', true, true);
  // Iconic London Underground Roundel Sign outside on pylon
  addBox(cx, 0, cz - sd / 2 - 2.0, 0.25, 4.5, 0.25, 'metalDark', true, true);
  addBox(cx, 4.2, cz - sd / 2 - 2.0, 2.2, 2.2, 0.15, 'roundel', false, true);
  occupy(cx - sw / 2 - 0.5, cx + sw / 2 + 0.5, cz - sd / 2 - 3, cz + sd / 2 + 0.5, 0.5);
}

export function nelsonMonument(cx, cz) {
  // Stepped stone plinths (Trafalgar Square)
  addBox(cx, 0, cz, 16.0, 0.4, 16.0, 'concrete2', true, true);
  addBox(cx, 0.4, cz, 12.0, 0.4, 12.0, 'concrete2', true, true);
  addBox(cx, 0.8, cz, 8.0, 1.2, 8.0, 'concrete2', true, true);
  // 4 Bronze Guardian Lions
  addBox(cx - 5.2, 0.8, cz - 5.2, 2.4, 1.2, 1.2, 'metalDark', true, true);
  addBox(cx + 5.2, 0.8, cz - 5.2, 2.4, 1.2, 1.2, 'metalDark', true, true);
  addBox(cx - 5.2, 0.8, cz + 5.2, 2.4, 1.2, 1.2, 'metalDark', true, true);
  addBox(cx + 5.2, 0.8, cz + 5.2, 2.4, 1.2, 1.2, 'metalDark', true, true);
  // Towering fluted stone column
  addBox(cx, 2.0, cz, 2.8, 20.0, 2.8, 'concrete2', true, true);
  addBox(cx, 22.0, cz, 4.0, 1.2, 4.0, 'concrete2', false, true);
  // Bronze statue of Admiral Nelson on top
  addBox(cx, 23.2, cz, 1.2, 2.6, 1.2, 'metalDark', false, true);
  occupy(cx - 8.5, cx + 8.5, cz - 8.5, cz + 8.5, 0.5);
}

export function zebraCrossing(cx, cz, isEastWest = false) {
  const w = isEastWest ? 4.8 : 10.0, d = isEastWest ? 10.0 : 4.8;
  const numStripes = 6;
  for (let i = 0; i < numStripes; i++) {
    const off = (i - (numStripes - 1) / 2) * 1.5;
    if (!isEastWest) {
      addBox(cx + off, 0.03, cz, 0.85, 0.02, d, 'paving', false, true);
    } else {
      addBox(cx, 0.03, cz + off, w, 0.02, 0.85, 'paving', false, true);
    }
  }
  // Belisha Beacons (black-and-white striped posts with glowing orange globe)
  const bOffsets = !isEastWest ? [[cx - 6.2, cz], [cx + 6.2, cz]] : [[cx, cz - 6.2], [cx, cz + 6.2]];
  for (const [bx, bz] of bOffsets) {
    for (let s = 0; s < 6; s++) {
      addBox(bx, s * 0.45, bz, 0.14, 0.45, 0.14, s % 2 === 0 ? 'black' : 'paving', true, true);
    }
    // Glowing vibrant orange globe on top
    addBox(bx, 2.7, bz, 0.45, 0.45, 0.45, 'belisha', false, true);
  }
}

export function londonStreetPlaque(cx, cy, cz, street = 'WHITEHALL', post = 'SW1', facing = 's') {
  const matKey = street.includes('PICCADILLY') ? 'streetSign2' : 'streetSign';
  const isX = facing === 'e' || facing === 'w';
  addBox(cx, cy, cz, isX ? 0.06 : 1.2, 0.7, isX ? 1.2 : 0.06, matKey, false, true);
}

// 14. ENTERABLE ROYAL MAIL DELIVERY VAN (Vibrant red, ER royal crest, open rear doors, parcel cargo)
export function royalMailDeliveryVan(cx, cz, isEastWest = false) {
  const w = 2.1, l = 5.2, h = 2.3;
  if (!isEastWest) {
    // Chassis & Floor
    addBox(cx, 0.22, cz, w - 0.2, 0.12, l - 0.4, 'metalDark', true, true);
    // Wheels (4 heavy duty rubber wheels)
    addBox(cx - w / 2, 0.25, cz - 1.5, 0.26, 0.65, 0.65, 'metalDark', true, true);
    addBox(cx + w / 2, 0.25, cz - 1.5, 0.26, 0.65, 0.65, 'metalDark', true, true);
    addBox(cx - w / 2, 0.25, cz + 1.5, 0.26, 0.65, 0.65, 'metalDark', true, true);
    addBox(cx + w / 2, 0.25, cz + 1.5, 0.26, 0.65, 0.65, 'metalDark', true, true);
    // Scarlet Red Van Body Sides with Royal Mail Emblem
    addBox(cx - w / 2 + 0.05, 0.35, cz + 0.3, 0.1, 1.5, 3.2, 'royalMail', true, true);
    addBox(cx + w / 2 - 0.05, 0.35, cz + 0.3, 0.1, 1.5, 3.2, 'royalMail', true, true);
    // Van Roof
    addBox(cx, 1.95, cz + 0.1, w - 0.08, 0.14, 4.4, 'paintedRed', true, true);
    // Front Cab: Hood, Grille, Windshield, Dashboard & Driver Seat
    addBox(cx, 0.35, cz - 2.0, w - 0.3, 0.7, 1.0, 'paintedRed', true, true);
    addBox(cx, 0.45, cz - 2.52, 0.9, 0.4, 0.05, 'metal', false, true); // grille
    addBox(cx - 0.7, 0.55, cz - 2.52, 0.25, 0.25, 0.05, 'yellow', false, true); // headlight
    addBox(cx + 0.7, 0.55, cz - 2.52, 0.25, 0.25, 0.05, 'yellow', false, true); // headlight
    addBox(cx, 1.15, cz - 1.45, w - 0.35, 0.65, 0.06, 'glass', false, true); // windshield
    addBox(cx + 0.45, 0.35, cz - 0.9, 0.5, 0.45, 0.5, 'leather', true, true); // UK driver seat
    addBox(cx + 0.45, 0.88, cz - 1.25, 0.35, 0.35, 0.05, 'black', false, true); // steering wheel
    // Interior Partition with walk-through opening
    addBox(cx - 0.65, 0.35, cz - 0.5, 0.6, 1.5, 0.08, 'metalDark', true, true);
    addBox(cx + 0.65, 0.35, cz - 0.5, 0.6, 1.5, 0.08, 'metalDark', true, true);
    // Open Rear Cargo Bay with Mail Sacks and Parcel Crates for cover
    addBox(cx - 0.45, 0.35, cz + 0.8, 0.6, 0.55, 0.7, 'fabricTactical', true, true); // mail sack pile
    addBox(cx - 0.45, 0.90, cz + 0.8, 0.5, 0.45, 0.5, 'wood', true, true); // parcel box
    addBox(cx + 0.45, 0.35, cz + 1.2, 0.55, 0.6, 0.8, 'woodDark', true, true); // parcel container
    // Rear Doors swung open to 90 degrees allowing tactical entry!
    addBox(cx - w / 2 - 0.4, 0.35, cz + 2.0, 0.8, 1.4, 0.08, 'paintedRed', true, true);
    addBox(cx + w / 2 + 0.4, 0.35, cz + 2.0, 0.8, 1.4, 0.08, 'paintedRed', true, true);
  } else {
    // East-West orientation
    addBox(cx, 0.22, cz, l - 0.4, 0.12, w - 0.2, 'metalDark', true, true);
    addBox(cx + 0.3, 0.35, cz - w / 2 + 0.05, 3.2, 1.5, 0.1, 'royalMail', true, true);
    addBox(cx + 0.3, 0.35, cz + w / 2 - 0.05, 3.2, 1.5, 0.1, 'royalMail', true, true);
    addBox(cx + 0.1, 1.95, cz, 4.4, 0.14, w - 0.08, 'paintedRed', true, true);
    addBox(cx - 2.0, 0.35, cz, 1.0, 0.7, w - 0.3, 'paintedRed', true, true);
    addBox(cx - 1.45, 1.15, cz, 0.06, 0.65, w - 0.35, 'glass', false, true);
    addBox(cx - 0.9, 0.35, cz + 0.45, 0.5, 0.45, 0.5, 'leather', true, true);
    addBox(cx + 0.8, 0.35, cz - 0.45, 0.7, 0.55, 0.6, 'fabricTactical', true, true);
    addBox(cx + 2.0, 0.35, cz - w / 2 - 0.4, 0.08, 1.4, 0.8, 'paintedRed', true, true);
    addBox(cx + 2.0, 0.35, cz + w / 2 + 0.4, 0.08, 1.4, 0.8, 'paintedRed', true, true);
  }
}

// 15. ENTERABLE NHS LONDON AMBULANCE (High-vis Battenburg livery, stretcher, blue lightbar)
export function nhsAmbulance(cx, cz, isEastWest = false) {
  const w = 2.2, l = 5.6;
  if (!isEastWest) {
    addBox(cx, 0.24, cz, w - 0.2, 0.12, l - 0.4, 'metalDark', true, true);
    // Battenburg sides
    addBox(cx - w / 2 + 0.05, 0.35, cz + 0.2, 0.1, 1.6, 3.6, 'ambulance', true, true);
    addBox(cx + w / 2 - 0.05, 0.35, cz + 0.2, 0.1, 1.6, 3.6, 'ambulance', true, true);
    addBox(cx, 2.05, cz + 0.1, w - 0.08, 0.12, 4.6, 'concrete2', true, true);
    // Blue emergency lights
    addBox(cx - 0.6, 2.18, cz - 1.4, 0.3, 0.16, 0.2, 'blue', false, true);
    addBox(cx + 0.6, 2.18, cz - 1.4, 0.3, 0.16, 0.2, 'blue', false, true);
    addBox(cx - 0.6, 2.18, cz + 2.0, 0.3, 0.16, 0.2, 'blue', false, true);
    addBox(cx + 0.6, 2.18, cz + 2.0, 0.3, 0.16, 0.2, 'blue', false, true);
    // Front cab
    addBox(cx, 0.35, cz - 2.2, w - 0.3, 0.75, 1.0, 'concrete2', true, true);
    addBox(cx, 1.20, cz - 1.6, w - 0.35, 0.65, 0.06, 'glass', false, true);
    addBox(cx + 0.45, 0.35, cz - 1.0, 0.5, 0.45, 0.5, 'leather', true, true);
    // Medical Treatment Interior
    // Wheeled patient stretcher / gurney with mattress
    addBox(cx - 0.35, 0.35, cz + 0.3, 0.65, 0.5, 1.9, 'metal', true, true);
    addBox(cx - 0.35, 0.85, cz + 0.3, 0.60, 0.12, 1.8, 'leather', false, true);
    // Medical equipment rack
    addBox(cx + 0.65, 0.35, cz + 0.3, 0.45, 1.4, 2.0, 'metalDark', true, true);
    addBox(cx + 0.65, 1.1, cz + 0.3, 0.35, 0.25, 0.35, 'red', false, true); // trauma kit
    // Open rear ambulance doors
    addBox(cx - w / 2 - 0.45, 0.35, cz + 2.2, 0.85, 1.5, 0.08, 'ambulance', true, true);
    addBox(cx + w / 2 + 0.45, 0.35, cz + 2.2, 0.85, 1.5, 0.08, 'ambulance', true, true);
  } else {
    addBox(cx, 0.24, cz, l - 0.4, 0.12, w - 0.2, 'metalDark', true, true);
    addBox(cx + 0.2, 0.35, cz - w / 2 + 0.05, 3.6, 1.6, 0.1, 'ambulance', true, true);
    addBox(cx + 0.2, 0.35, cz + w / 2 - 0.05, 3.6, 1.6, 0.1, 'ambulance', true, true);
    addBox(cx + 0.1, 2.05, cz, 4.6, 0.12, w - 0.08, 'concrete2', true, true);
    addBox(cx - 1.4, 2.18, cz - 0.6, 0.2, 0.16, 0.3, 'blue', false, true);
    addBox(cx - 1.4, 2.18, cz + 0.6, 0.2, 0.16, 0.3, 'blue', false, true);
    addBox(cx - 2.2, 0.35, cz, 1.0, 0.75, w - 0.3, 'concrete2', true, true);
    addBox(cx - 1.6, 1.20, cz, 0.06, 0.65, w - 0.35, 'glass', false, true);
    addBox(cx + 0.3, 0.35, cz - 0.35, 1.9, 0.5, 0.65, 'metal', true, true);
    addBox(cx + 0.3, 0.85, cz - 0.35, 1.8, 0.12, 0.60, 'leather', false, true);
    addBox(cx + 2.2, 0.35, cz - w / 2 - 0.45, 0.08, 1.5, 0.85, 'ambulance', true, true);
    addBox(cx + 2.2, 0.35, cz + w / 2 + 0.45, 0.08, 1.5, 0.85, 'ambulance', true, true);
  }
}

// 16. PICCADILLY CIRCUS CURVED CORNER BUILDING & VIBRANT NEON BILLBOARDS
export function piccadillyNeonBuilding(cx, cz) {
  const bw = 16, bd = 16, h = 18;
  // Neoclassical curved corner building
  addBox(cx, 0, cz, bw, h, bd, 'brickC', true, true);
  // Multi-tier Neon Signs (Bovril, Schweppes, Guinness) on outer avenue-facing facade
  addBox(cx - bw / 2 - 0.25, 7.0, cz, 0.15, 9.0, 11.0, 'neonSigns', false, true);
  addBox(cx, 7.0, cz - bd / 2 - 0.25, 11.0, 9.0, 0.15, 'neonSigns', false, true);

  // Ground Floor Enterable Traditional British Newsagent & Tobacco Kiosk
  // Open storefront entrance cut into the corner
  addBox(cx - bw / 2 + 0.2, 0, cz + 2.5, 0.3, 3.2, 4.0, 'newsagent', false, true);
  addBox(cx - bw / 2 + 3.0, 0, cz + 2.5, 3.5, 0.18, 4.0, 'woodDark', true, true); // kiosk floor
  // Newsstand counter & newspaper piles
  addBox(cx - bw / 2 + 2.5, 0.18, cz + 1.2, 2.2, 0.9, 0.7, 'wood', true, true);
  addBox(cx - bw / 2 + 2.5, 1.08, cz + 1.2, 1.6, 0.18, 0.45, 'newsagent', false, true);
  // Postcard display rack
  addBox(cx - bw / 2 + 1.2, 0.18, cz + 3.6, 0.5, 1.6, 0.5, 'metalDark', true, true);
  // Overhead newsagent awning
  addBox(cx - bw / 2 - 0.8, 3.4, cz + 2.5, 1.8, 0.15, 5.0, 'paintedGreen', false, true);

  // Internal stairs to upper levels & rooftop vantage point!
  addStairs(cx + 2.0, 0, cz - 2.0, 1.5, 5.5, 12, 'n', 'concrete2');
  addBox(cx, 5.5, cz, bw - 1.2, 0.25, bd - 1.2, 'woodDark', true, true); // 2nd floor
  addStairs(cx - 2.0, 5.5, cz + 2.0, 1.5, 5.5, 12, 's', 'concrete2');
  addBox(cx, 11.0, cz, bw - 1.2, 0.25, bd - 1.2, 'woodDark', true, true); // 3rd floor
  addStairs(cx + 2.0, 11.0, cz - 2.0, 1.5, 6.5, 14, 'n', 'concrete2');
  addBox(cx, 17.5, cz, bw + 0.4, 0.25, bd + 0.4, 'concrete2', true, true); // Roof observation deck
  // Parapet around roof for cover
  addBox(cx, 17.75, cz - bd / 2, bw, 1.1, 0.35, 'concrete2', true, true);
  addBox(cx, 17.75, cz + bd / 2, bw, 1.1, 0.35, 'concrete2', true, true);
  addBox(cx - bw / 2, 17.75, cz, 0.35, 1.1, bd, 'concrete2', true, true);
  addBox(cx + bw / 2, 17.75, cz, 0.35, 1.1, bd, 'concrete2', true, true);
}

// 17. ENTERABLE TRADITIONAL LONDON FISH & CHIPS SHOP ("THE GOLDEN CHIP")
export function fishAndChipsShop(cx, cz) {
  const w = 12.0, d = 11.0, h = 4.2;
  // Floor with black-and-white checkered vibe
  addBox(cx, 0, cz, w, 0.16, d, 'paving', true, true);
  // Exterior walls
  addBox(cx, 0.16, cz - d / 2, w, h, 0.25, 'paintedBlue', true, true); // back
  addBox(cx - w / 2, 0.16, cz, 0.25, h, d, 'paintedBlue', true, true); // left
  addBox(cx + w / 2, 0.16, cz, 0.25, h, d, 'paintedBlue', true, true); // right
  // Front with entrance door opening (w: 2.2m open)
  addBox(cx - 3.8, 0.16, cz + d / 2, 4.4, h, 0.25, 'paintedBlue', true, true);
  addBox(cx + 3.8, 0.16, cz + d / 2, 4.4, h, 0.25, 'paintedBlue', true, true);
  addBox(cx, 2.6, cz + d / 2, 3.2, 1.6, 0.25, 'paintedBlue', false, true); // lintel above doorway
  // Roof & ceiling
  addBox(cx, h + 0.16, cz, w + 0.4, 0.2, d + 0.4, 'concrete2', true, true);
  // "The Golden Chip" Banner above entrance
  addBox(cx, 3.4, cz + d / 2 + 0.18, 7.5, 1.2, 0.1, 'fishChips', false, true);
  // Striped awning over front windows
  addBox(cx, 2.7, cz + d / 2 + 0.8, 8.5, 0.12, 1.6, 'paintedBlue', false, true);

  // Interior: Stainless steel 3-pan fish & chip frying range with extractor chimney
  addBox(cx, 0.16, cz - d / 2 + 1.4, 5.0, 1.1, 1.4, 'metal', true, true);
  addBox(cx, 1.26, cz - d / 2 + 1.4, 4.6, 1.2, 1.0, 'metalDark', true, true); // extraction hood
  addBox(cx, 2.46, cz - d / 2 + 1.4, 0.6, 1.8, 0.6, 'metalDark', false, true); // chimney pipe to roof
  // Serving counter with glass sneeze guard
  addBox(cx, 0.16, cz - 0.8, 6.0, 1.05, 0.85, 'wood', true, true);
  addBox(cx, 1.21, cz - 0.8, 5.8, 0.35, 0.05, 'glass', false, true);
  // Chalkboard menu on side wall
  addBox(cx - w / 2 + 0.2, 1.8, cz - 1.2, 0.06, 1.4, 2.0, 'fishChips', false, true);
  // 2 Dining tables with chairs and vinegar shakers
  addBox(cx - 3.4, 0.16, cz + 2.2, 1.8, 0.82, 1.1, 'woodDark', true, true);
  addBox(cx - 3.4, 0.98, cz + 2.2, 0.12, 0.25, 0.12, 'metalDark', false, true); // vinegar shaker
  addBox(cx + 3.4, 0.16, cz + 2.2, 1.8, 0.82, 1.1, 'woodDark', true, true);
  addBox(cx + 3.4, 0.98, cz + 2.2, 0.12, 0.25, 0.12, 'metalDark', false, true); // vinegar shaker
}

// 18. DOWNING STREET SECURITY GATES & POLICE SENTRY GUARD BOX
export function downingStreetSecurity(cx, cz) {
  // Heavy wrought-iron spiked gates spanning across avenue offshoot
  addBox(cx - 4.5, 0, cz, 0.8, 3.8, 0.8, 'metalDark', true, true); // stone gatepost left
  addBox(cx + 4.5, 0, cz, 0.8, 3.8, 0.8, 'metalDark', true, true); // stone gatepost right
  addBox(cx - 4.5, 3.8, cz, 0.9, 0.3, 0.9, 'gold', false, true); // decorative finial
  addBox(cx + 4.5, 3.8, cz, 0.9, 0.3, 0.9, 'gold', false, true); // decorative finial
  // Iron gate railings with gold spear tips
  for (let x = cx - 3.8; x <= cx + 3.8; x += 0.45) {
    addBox(x, 0, cz, 0.08, 3.4, 0.08, 'metalDark', true, true);
    addBox(x, 3.4, cz, 0.12, 0.25, 0.12, 'gold', false, true);
  }
  // Heavy gate crossbars
  addBox(cx, 0.6, cz, 8.2, 0.12, 0.1, 'metalDark', false, true);
  addBox(cx, 2.0, cz, 8.2, 0.12, 0.1, 'metalDark', false, true);
  addBox(cx, 3.2, cz, 8.2, 0.12, 0.1, 'metalDark', false, true);

  // British Police Sentry Guard Box
  addBox(cx + 6.2, 0, cz + 0.4, 2.2, 3.2, 2.2, 'paintedBlack', true, true);
  addBox(cx + 6.2, 1.4, cz - 0.72, 1.2, 0.9, 0.06, 'glass', false, true); // observation window
  addBox(cx + 6.2, 3.2, cz + 0.4, 2.4, 0.3, 2.4, 'metalDark', false, true); // roof
  // Tactical concrete vehicle crash barricades
  addBox(cx - 1.8, 0, cz - 2.8, 2.4, 0.85, 0.75, 'concrete', true, true);
  addBox(cx + 1.8, 0, cz - 2.8, 2.4, 0.85, 0.75, 'concrete', true, true);
}

// 19. VICTORIA EMBANKMENT & RIVER THAMES PROMENADE (Granite river wall, River Thames, mooring rings, patrol boat)
export function victoriaEmbankment(scene) {
  const zWall = -140;
  const wallLen = 280;
  // Broad paved riverside promenade
  addBox(0, 0, zWall + 6, wallLen, 0.18, 12.0, 'paving', true, true);

  // Granite River Retaining Wall (from river bed y = -3.8 up to promenade level y = 1.0)
  addBox(0, -3.8, zWall, wallLen, 4.8, 2.2, 'concrete2', true, true);
  // Stone Balustrade with cast-iron ornamental railings and coping along the river
  addBox(0, 1.0, zWall, wallLen, 1.15, 0.45, 'concrete2', true, true);
  // Bronze Lion-head Mooring Rings fixed into the granite wall above the water line
  for (let x = -100; x <= 100; x += 30) {
    addBox(x, -0.6, zWall - 1.15, 0.45, 0.45, 0.12, 'gold', false, true);
  }

  // RIVER THAMES WATER SURFACE (y = -3.5, deep reflective slate-green water)
  const riverGeo = new THREE.PlaneGeometry(wallLen + 40, 75);
  const riverMat = buildMaterials().thamesWater;
  const riverMesh = new THREE.Mesh(riverGeo, riverMat);
  riverMesh.rotation.set(-Math.PI / 2, 0, 0);
  riverMesh.position.set(0, -3.5, zWall - 38);
  riverMesh.receiveShadow = true;
  scene.add(riverMesh);

  // River Thames Promenade amenities (Benches and Historic Dolphin Gas Lamps)
  for (let x = -110; x <= 110; x += 25) {
    bench(x, zWall + 4);
    // Ornate Victorian Dolphin River Lamp
    addBox(x + 5, 1.0, zWall, 0.35, 3.6, 0.35, 'metalDark', true, true);
    addBox(x + 5, 4.6, zWall, 0.65, 0.7, 0.65, 'belisha', false, true);
  }

  // Moored River Thames Police Patrol Launch & Boarding Gangway at (x = 35)
  // Stone/metal descending gangway stairs from promenade down to floating pontoon
  addStairs(35, -2.8, zWall - 4.5, 1.8, 3.8, 10, 's', 'metalDark');
  // Floating pontoon deck (y = -2.8)
  addBox(35, -3.1, zWall - 12.0, 6.0, 0.4, 12.0, 'concrete2', true, true);
  // Moored Thames Patrol Boat (y = -3.2 to 0.5)
  const bx = 35, bz = zWall - 22;
  // Boat hull
  addBox(bx, -3.2, bz, 4.4, 1.3, 14.0, 'paintedBlue', true, true);
  addBox(bx, -1.9, bz, 4.0, 0.2, 13.4, 'woodDark', true, true); // deck
  // Wheelhouse & Cabin
  addBox(bx, -1.7, bz - 1.2, 3.2, 2.1, 5.5, 'concrete2', true, true);
  addBox(bx, -0.6, bz - 4.0, 2.8, 0.7, 0.08, 'glass', false, true); // wheelhouse front window
  addBox(bx - 1.62, -0.6, bz - 1.2, 0.08, 0.7, 4.0, 'glass', false, true); // side windows
  addBox(bx + 1.62, -0.6, bz - 1.2, 0.08, 0.7, 4.0, 'glass', false, true); // side windows
  // Radar dome & antenna mast on cabin roof
  addBox(bx, 0.5, bz - 1.2, 0.8, 0.45, 0.8, 'metal', false, true);
  addBox(bx, 0.95, bz - 1.2, 0.06, 1.4, 0.06, 'metalDark', false, true);
  // Lifebuoy rings on cabin side
  addBox(bx - 1.65, -0.8, bz + 2.0, 0.06, 0.5, 0.5, 'red', false, true);
  addBox(bx + 1.65, -0.8, bz + 2.0, 0.06, 0.5, 0.5, 'red', false, true);
}

// 20. SHEFFIELD BIKE HOOP STANDS & COMMUTER BICYCLES
export function sheffieldBikeStands(cx, cz, isEastWest = false) {
  for (let i = -1; i <= 1; i++) {
    const off = i * 1.8;
    const sx = isEastWest ? cx : cx + off;
    const sz = isEastWest ? cz + off : cz;
    // Sheffield inverted-U tubular hoop
    addBox(sx - 0.45, 0.16, sz, 0.08, 0.85, 0.08, 'metalDark', true, true);
    addBox(sx + 0.45, 0.16, sz, 0.08, 0.85, 0.08, 'metalDark', true, true);
    addBox(sx, 1.01, sz, 0.98, 0.08, 0.08, 'metalDark', false, true);
    // Locked bicycle against the middle stand
    if (i === 0) {
      addBox(sx, 0.2, sz + 0.1, 0.9, 0.65, 0.12, 'paintedBlue', true, true);
    }
  }
}

// 21. WESTMINSTER SUBWAY UNDERPASS STAIRS (Descending below street level)
export function undergroundSubwayUnderpass(cx, cz) {
  // Descending stairs from sidewalk y = 0.16 down to underground pedestrian passage y = -2.8
  addStairs(cx, -2.8, cz, 2.4, 2.96, 12, 'n', 'concrete2');
  // Stone balustrade around the opening
  addBox(cx - 1.4, 0.16, cz - 1.8, 0.22, 1.05, 5.0, 'metalDark', true, true);
  addBox(cx + 1.4, 0.16, cz - 1.8, 0.22, 1.05, 5.0, 'metalDark', true, true);
  // Tube roundel arch sign over subway entrance
  addBox(cx - 1.3, 0.16, cz + 0.8, 0.16, 2.8, 0.16, 'metalDark', true, true);
  addBox(cx + 1.3, 0.16, cz + 0.8, 0.16, 2.8, 0.16, 'metalDark', true, true);
  addBox(cx, 2.8, cz + 0.8, 2.76, 0.2, 0.16, 'metalDark', false, true);
  addBox(cx, 3.2, cz + 0.8, 1.4, 0.7, 0.1, 'roundel', false, true);
  // Underpass tunnel hall below street
  addBox(cx, -2.9, cz - 5.5, 4.5, 0.15, 6.0, 'tubeTile', true, true); // floor
  addBox(cx - 2.2, -2.8, cz - 5.5, 0.2, 2.8, 6.0, 'tubeTile', true, true); // tiled wall
  addBox(cx + 2.2, -2.8, cz - 5.5, 0.2, 2.8, 6.0, 'tubeTile', true, true); // tiled wall
  addBox(cx, 0.0, cz - 5.5, 4.5, 0.2, 6.0, 'concrete2', true, true); // tunnel ceiling
}

export function generateCity(scene) {
  // 1. CENTRAL TRAFALGAR SQUARE & NELSON MONUMENT:
  nelsonMonument(0, 0);

  // 2. BIG BEN & ELIZABETH TOWER (At the end of Whitehall! Enterable with 5-floor staircases & Belfry!)
  bigBenTower(0, -92);

  // 3. WESTMINSTER LONDON UNDERGROUND STATION (Red Edwardian facade, roundel sign, tiled concourse & ticket gates)
  undergroundStation(-38, -28);

  // 4. THE CROWN & ANCHOR TRADITIONAL BRITISH PUB (Pub sign, beer garden, mahogany bar, upstairs lounge & balcony)
  accessiblePub(38, -28);
  londonStreetPlaque(29, 3.2, -28, 'WHITEHALL', 'SW1', 'w');

  // 5. ACCESSIBLE GEORGIAN & VICTORIAN TOWNHOUSES (Climbable stairs, desks, sofas, balconies & rooftops)
  accessibleTownhouse(-38, 36, 3, 's');
  londonStreetPlaque(-31, 3.2, 30, 'WHITEHALL', 'SW1', 'e');

  accessibleTownhouse(38, 36, 3, 's');
  londonStreetPlaque(31, 3.2, 30, 'PICCADILLY', 'W1', 'w');

  accessibleTownhouse(-38, 88, 3, 'n');
  accessibleTownhouse(38, 88, 3, 'n');

  // 6. TACTICAL WAREHOUSES
  accessibleWarehouse(72, 60);
  accessibleWarehouse(-72, -60);

  // 7. FULLY ENTERABLE LONDON DOUBLE DECKER BUSES (Open entrance, moquette seats, interior stairs to upper deck!)
  // Bus 1: On Whitehall approaching the Square
  enterableDoubleDecker(-3.5, -30, false);
  // Bus 2: East-West avenue near station
  enterableDoubleDecker(16, 8, true);
  // Bus 3: South Whitehall
  enterableDoubleDecker(-3.5, 48, false);

  // 8. FULLY ENTERABLE LONDON BLACK CABS (Open doors, rear leather bench, driver cab, illuminated TAXI roof sign)
  enterableBlackCab(3.6, -14, false);
  enterableBlackCab(-16, 22, true);
  enterableBlackCab(16, -60, false);

  // 9. FULLY ENTERABLE MET POLICE PATROL CARS (Battenburg livery, open doors, interior seats, roof lightbar)
  enterablePoliceCar(-3.6, 14, false);
  enterablePoliceCar(22, -45, true);

  // 10. ENTERABLE ROYAL MAIL DELIVERY VANS (Classic scarlet red, ER crest, mail sacks & parcel cargo cover)
  royalMailDeliveryVan(-14, -68, false);
  royalMailDeliveryVan(28, 48, true);

  // 11. ENTERABLE NHS LONDON AMBULANCES (High-vis Battenburg livery, stretcher gurney, emergency flashers)
  nhsAmbulance(16, 28, false);
  nhsAmbulance(-28, -14, true);

  // 12. PICCADILLY CIRCUS CURVED CORNER & VIBRANT NEON BILLBOARDS (Bovril, Schweppes, Guinness & Newsagent Kiosk)
  piccadillyNeonBuilding(38, 28);

  // 13. TRADITIONAL BRITISH FISH & CHIPS SHOP ("THE GOLDEN CHIP" with fryer range, counter & dining tables)
  fishAndChipsShop(-38, -60);

  // 14. DOWNING STREET SECURITY GATES & POLICE SENTRY GUARD BOX
  downingStreetSecurity(0, 56);

  // 15. VICTORIA EMBANKMENT & RIVER THAMES PROMENADE (Granite retaining wall, water surface, mooring rings & police boat)
  victoriaEmbankment(scene);

  // 16. WESTMINSTER SUBWAY PEDESTRIAN UNDERPASS (Subway stairs descending below street level to tiled tunnel)
  undergroundSubwayUnderpass(-26, 8);

  // 17. SHEFFIELD BIKE HOOP STANDS & COMMUTER BICYCLES
  sheffieldBikeStands(-16, -12, false);
  sheffieldBikeStands(16, 12, false);

  // 18. FULLY ENTERABLE RED TELEPHONE BOXES (K6 open kiosk, interior rotary phone, handset, shelf)
  enterablePhoneBox(-11, -8);
  enterablePhoneBox(11, 8);
  enterablePhoneBox(-24, -28);
  enterablePhoneBox(24, -28);
  enterablePhoneBox(-11, 48);

  // 19. ROYAL MAIL POST BOXES
  postBox(-9, -8);
  postBox(9, 8);
  postBox(22, -28);
  postBox(-22, -28);
  postBox(9, 48);

  // 20. ZEBRA CROSSINGS WITH BELISHA BEACONS & "LOOK LEFT/RIGHT" ROAD STENCILS
  zebraCrossing(0, -48, false);
  zebraCrossing(0, 26, false);
  zebraCrossing(-26, 0, true);
  zebraCrossing(26, 0, true);

  // Authentic London Street Stencils ("◄ LOOK LEFT" & "LOOK RIGHT ►")
  addBox(-2.8, 0.04, -45.2, 3.2, 0.02, 0.8, 'lookLeft', false, true);
  addBox(2.8, 0.04, -50.8, 3.2, 0.02, 0.8, 'lookRight', false, true);
  addBox(-2.8, 0.04, 28.8, 3.2, 0.02, 0.8, 'lookRight', false, true);
  addBox(2.8, 0.04, 23.2, 3.2, 0.02, 0.8, 'lookLeft', false, true);
  addBox(-23.2, 0.04, -2.8, 0.8, 0.02, 3.2, 'lookLeft', false, true);
  addBox(-28.8, 0.04, 2.8, 0.8, 0.02, 3.2, 'lookRight', false, true);
  addBox(28.8, 0.04, -2.8, 0.8, 0.02, 3.2, 'lookRight', false, true);
  addBox(23.2, 0.04, 2.8, 0.8, 0.02, 3.2, 'lookLeft', false, true);

  // Cast-Iron Thames Water Manhole Covers on asphalt
  addBox(1.5, 0.03, -20.0, 0.9, 0.02, 0.9, 'manhole', false, true);
  addBox(-2.0, 0.03, -64.0, 0.9, 0.02, 0.9, 'manhole', false, true);
  addBox(2.5, 0.03, 38.0, 0.9, 0.02, 0.9, 'manhole', false, true);
  addBox(-38.0, 0.03, 1.8, 0.9, 0.02, 0.9, 'manhole', false, true);
  addBox(42.0, 0.03, -1.8, 0.9, 0.02, 0.9, 'manhole', false, true);

  // 13. CENTRAL SQUARE AMENITIES
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    const r = 24;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (isFree(x, z, 2)) {
      bench(x, z);
      bollard(x + 1.2, z);
    }
  }

  // London Bus Stops with shelters
  addBusStop(18, -12, 's');
  addBusStop(-18, 12, 'n');

  // Sidewalks along main London avenues
  const roadW = 12, sidewalkW = 3.0;
  for (let x = -MAP + 20; x < MAP - 20; x += 20) {
    if (isFree(x + 10, -roadW / 2 - sidewalkW / 2, 2))
      addBox(x + 10, 0, -roadW / 2 - sidewalkW / 2, 20, 0.16, sidewalkW, 'paving', false, true);
    if (isFree(x + 10, roadW / 2 + sidewalkW / 2, 2))
      addBox(x + 10, 0, roadW / 2 + sidewalkW / 2, 20, 0.16, sidewalkW, 'paving', false, true);
  }
  for (let z = -MAP + 20; z < MAP - 20; z += 20) {
    if (isFree(-roadW / 2 - sidewalkW / 2, z + 10, 2))
      addBox(-roadW / 2 - sidewalkW / 2, 0, z + 10, sidewalkW, 0.16, 20, 'paving', false, true);
    if (isFree(roadW / 2 + sidewalkW / 2, z + 10, 2))
      addBox(roadW / 2 + sidewalkW / 2, 0, z + 10, sidewalkW, 0.16, 20, 'paving', false, true);
  }

  // Victorian Street Lamps
  for (let i = 0; i < 70; i++) {
    const t = i % 4;
    let x, z;
    if (t === 0) { x = wr(-MAP + 40, MAP - 40); z = -roadW / 2 - sidewalkW - 0.5; }
    else if (t === 1) { x = wr(-MAP + 40, MAP - 40); z = roadW / 2 + sidewalkW + 0.5; }
    else if (t === 2) { x = -roadW / 2 - sidewalkW - 0.5; z = wr(-MAP + 40, MAP - 40); }
    else { x = roadW / 2 + sidewalkW + 0.5; z = wr(-MAP + 40, MAP - 40); }
    if (!isFree(x, z, 1.2)) continue;
    streetLamp(x, z);
  }

  // Trees along the avenues
  for (let i = 0; i < 50; i++) {
    const t = i % 4;
    let x, z;
    if (t === 0) { x = wr(-MAP + 40, MAP - 40); z = -roadW / 2 - sidewalkW - 2.8; }
    else if (t === 1) { x = wr(-MAP + 40, MAP - 40); z = roadW / 2 + sidewalkW + 2.8; }
    else if (t === 2) { x = -roadW / 2 - sidewalkW - 2.8; z = wr(-MAP + 40, MAP - 40); }
    else { x = roadW / 2 + sidewalkW + 2.8; z = wr(-MAP + 40, MAP - 40); }
    if (!isFree(x, z, 2)) continue;
    tree(x, z, scene);
  }

  // Perimeter London terrace rows
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

  // Mid-ring London townhouses & squares
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU + wr(-0.1, 0.1);
    const r = 115 + wr(-15, 15);
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!isFree(x, z, 10)) continue;
    accessibleTownhouse(x, z, 3, wpick(['n', 's', 'e', 'w']));
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
    this.flyingBullets = [];
    this.cameraPos = null;
    this.onBulletWhiz = null;
    this.onCasingBounce = null;

    this.tracerGeo = new THREE.CylinderGeometry(0.032, 0.032, 1, 6);
    this.tracerGeo.translate(0, -0.5, 0);
    this.tracerMat = new THREE.MeshBasicMaterial({
      color: 0xffe599, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
    });

    // Flying bullet projectile geometry & glowing material
    this.bulletGeo = new THREE.CylinderGeometry(0.042, 0.015, 1.8, 6);
    this.bulletGeo.translate(0, -0.9, 0);
    this.bulletMat = new THREE.MeshBasicMaterial({
      color: 0xfff6cf, transparent: true, opacity: 0.95,
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

    // 1. Instant beam tracer for immediate visual feedback
    const mesh = new THREE.Mesh(this.tracerGeo, this.tracerMat);
    mesh.position.copy(from);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize());
    mesh.scale.set(width || 1, use, width || 1);
    this.scene.add(mesh);
    this.items.push({ mesh, life: 0.06, max: 0.06, type: 'tracer' });

    // 2. High-speed flying projectile tracer bolt (cinematic bullet animation)
    const speed = 320; // units/second
    const duration = Math.min(0.45, len / speed);
    const bMesh = new THREE.Mesh(this.bulletGeo, this.bulletMat);
    bMesh.position.copy(from);
    bMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize());
    const bScale = Math.min(1.8, Math.max(0.6, len * 0.15));
    bMesh.scale.set((width || 1) * 1.5, bScale, (width || 1) * 1.5);
    this.scene.add(bMesh);

    this.flyingBullets.push({
      mesh: bMesh,
      from: from.clone(),
      to: to.clone(),
      dir: dir.clone().normalize(),
      len,
      dist: 0,
      speed,
      life: duration,
      whizFired: false,
    });
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
    const colors = { dust: 0xdcd6c2, blood: 0x9b111e, spark: 0xffcf44 };
    const mat = new THREE.MeshBasicMaterial({ color: colors[kind] || 0xffffff });
    const isSpark = kind === 'spark';
    for (let i = 0; i < (n || 4); i++) {
      const s = isSpark ? rnd(0.04, 0.12) : rnd(0.08, 0.22);
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat);
      m.position.set(x + rnd(-0.08, 0.08), y + rnd(-0.08, 0.08), z + rnd(-0.08, 0.08));
      m.scale.setScalar(s);
      this.scene.add(m);
      const vx = isSpark ? rnd(-3, 3) : 0;
      const vy = isSpark ? rnd(1.2, 4.5) : rnd(0.4, 2.0);
      const vz = isSpark ? rnd(-3, 3) : 0;
      const life = isSpark ? 0.25 : 0.32;
      this.items.push({ mesh: m, life, max: life, type: 'puff', s, vx, vy, vz, isSpark });
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
        if (e.isSpark) {
          e.mesh.position.x += dt * e.vx;
          e.mesh.position.z += dt * e.vz;
          e.vy -= 14 * dt; // gravity on sparks
        }
      } else if (e.type === 'decal') {
        e.mesh.material.opacity = Math.min(0.9, e.life / 2);
      }
    }

    // Update flying bullet projectile streaks
    for (let i = this.flyingBullets.length - 1; i >= 0; i--) {
      const b = this.flyingBullets[i];
      b.dist += b.speed * dt;
      b.life -= dt;
      if (b.dist >= b.len || b.life <= 0) {
        this.scene.remove(b.mesh);
        this.flyingBullets.splice(i, 1);
        this.puff(b.to.x, b.to.y, b.to.z, 'spark', 4);
        continue;
      }
      const curPos = b.from.clone().addScaledVector(b.dir, b.dist);
      b.mesh.position.copy(curPos);

      // Check for camera near-miss whiz sound
      if (!b.whizFired && this.cameraPos) {
        const dCam = curPos.distanceTo(this.cameraPos);
        if (dCam < 4.0 && b.dist > 2.0 && b.dist < b.len - 2.0) {
          b.whizFired = true;
          if (this.onBulletWhiz) this.onBulletWhiz();
        }
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
          if (this.onCasingBounce) this.onCasingBounce();
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
