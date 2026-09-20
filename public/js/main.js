import * as THREE from 'three';
import {
  MAP, NUM_BOTS, MP_MAX, EYE, R, H, STEP, GRAV, BASE_FOV, TAU,
  clamp, lerp, rnd, angDiff, r2, r4, mulberry32,
  WEAPONS, dmgMul, EMOTES, BOT_NAMES, BOT_COLORS,
  buildMaterials, buildEnvironment, buildTextures,
  rand, wr, wpick, addBox, occupy, isFree, queryGrid, boxes,
  castRay, losBlocked, physics, spawnOK, finalizeBatches, generateCity,
  buildCharacterRig, buildWeapon, Effects, buildComposer,
} from './engine.js';

const $ = id => document.getElementById(id);

/* ================================================================
   LOADING INDICATOR
================================================================ */
const loadEl = $('load'), loadbar = $('loadbar'), loadmsg = $('loadmsg');
function setLoad(p, msg) {
  loadbar.style.width = (p * 100) + '%';
  if (msg) loadmsg.textContent = String(msg).toUpperCase();
}

/* ================================================================
   AUDIO
================================================================ */
let actx = null, noiseBuf = null;
function initAudio() {
  try {
    if (!actx) { const AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
    if (actx && actx.state === 'suspended') actx.resume();
  } catch { actx = null; }
}
function getNoise() {
  if (!noiseBuf) {
    const len = Math.floor(actx.sampleRate * 0.6);
    noiseBuf = actx.createBuffer(1, len, actx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}
function sfxNoise(vol, f0, f1, dur, type) {
  if (!actx || vol < 0.01) return;
  try {
    const t = actx.currentTime, s = actx.createBufferSource();
    s.buffer = getNoise();
    const f = actx.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = actx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(actx.destination);
    s.start(t); s.stop(t + dur + 0.02);
  } catch {}
}
function sfxTone(freq, dur, vol, type, f2) {
  if (!actx || vol < 0.01) return;
  try {
    const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  } catch {}
}
function sfxShot(kind, vol) {
  if (kind === 'shotgun') { sfxNoise(vol * 0.9, 3200, 180, 0.32); sfxTone(90, 0.2, vol * 0.5, 'sine', 40); }
  else if (kind === 'sniper') { sfxNoise(vol, 2600, 120, 0.55); sfxTone(70, 0.35, vol * 0.7, 'sine', 30); }
  else if (kind === 'lmg') { sfxNoise(vol * 0.85, 2400, 220, 0.18); sfxTone(110, 0.1, vol * 0.4, 'sine', 55); }
  else if (kind === 'dmr') { sfxNoise(vol * 0.8, 2600, 180, 0.16); sfxTone(120, 0.12, vol * 0.35, 'sine', 60); }
  else if (kind === 'pistol') { sfxNoise(vol * 0.5, 3200, 400, 0.09); sfxTone(180, 0.06, vol * 0.25, 'square', 90); }
  else sfxNoise(vol * 0.7, 2800, 260, 0.12);
}
const sfxHit = h => sfxTone(h ? 1900 : 1250, 0.06, 0.16, 'square');
const sfxKill = () => { sfxTone(880, 0.09, 0.18, 'triangle'); setTimeout(() => sfxTone(1320, 0.14, 0.18, 'triangle'), 80); };
const sfxHurt = () => sfxNoise(0.3, 600, 120, 0.18);
function sfxReload(duration = 2.2) {
  // Stage 1: Mag release latch click & unseat
  sfxTone(580, 0.035, 0.16, 'square');
  sfxNoise(0.12, 2200, 800, 0.07, 'bandpass');
  // Stage 2: Empty magazine slide out
  setTimeout(() => {
    sfxTone(260, 0.06, 0.14, 'triangle');
    sfxNoise(0.10, 1400, 300, 0.09, 'lowpass');
  }, duration * 260);
  // Stage 3: Fresh magazine inserted & slapped home into magwell
  setTimeout(() => {
    sfxTone(180, 0.09, 0.30, 'square');
    sfxTone(360, 0.06, 0.22, 'triangle');
    sfxNoise(0.28, 2800, 450, 0.11, 'lowpass');
  }, duration * 640);
  // Stage 4: Crisp mechanical bolt catch release / charging handle rack
  setTimeout(() => {
    sfxTone(780, 0.03, 0.20, 'square');
    sfxTone(460, 0.05, 0.22, 'triangle');
    sfxNoise(0.20, 3400, 900, 0.08, 'bandpass');
  }, duration * 820);
}
const sfxPickup = () => sfxTone(520, 0.1, 0.15, 'sine', 780);

/* ================================================================
   BOT CHAT AI
================================================================ */
const BotChat = (function () {
  const recent = [], CAP = 40;
  const P = {
    curse: ['ffs','jfc','bro','dude','omfg','wtf','nah','no way','are you serious','holy shit','damn','christ'],
    noob: ['noob','bot','trash','garbage','timmy','kid','free kill','walking loot','copper','casual','sweat','tryhard'],
    adverb: ['literally','actually','seriously','honestly','fully','completely','straight up'],
    intensifier: ['so','way','mad','super','stupid','absolutely','deadass','lowkey','highkey'],
    verb_hit: ['clapped me','fried me','deleted me','ended me','crossed me','gapped me','one tapped me','shredded me','nuked me'],
    verb_kill: ['got you','clapped you','fried you','deleted you','dropped you','crossed you','gapped you','one tapped you','wiped you'],
    weapon: ['that rifle','that smg','that dmr','that sniper','that lmg','that shotgun','that pistol'],
    place: ['that alley','the rooftop','that corner','the square','that building','the tower','that phone box','the bus'],
    praise: ['nice shot','clean shot','good shot ngl','respect','fair','ok thats clean'],
    surprise: ['how','what','where did you come from','i didnt even see you','bro what'],
    rejoined: ['im back','lets run it','round 2','ah shit here we go again','ok locked in','watch this'],
    banter: ['anyone else lagging','who keeps tap firing','this map is cursed','somebody is def walling','yall camping hard','so quiet rn','i hear steps'],
  };
  const T = {
    death_player: ['{curse} {killer} {verb_hit} with {weapon}','{intensifier} {noob}, {killer} is {adverb} {intensifier} {noob}','bro {killer} {verb_hit}, {intensifier} {noob}','{killer} camping {place} with {weapon}','where was the lag comp {killer}, {adverb} {noob}','{killer} {adverb} one tapped me with {weapon}','{surprise} {killer}','{killer} got {adverb} no life for that shot','im so done, {killer} is {intensifier} {noob}','yo {killer} {verb_hit} from {place}, {curse}','gg, {killer} is {adverb} cracked','next one you are {verb_kill}, {curse}','{curse} i had him one shot and {killer} got me'],
    kill_player: ['{verb_kill}, {noob}','{adverb} too easy, {verb_kill}','gg, {verb_kill}','sit down, {verb_kill}','{verb_kill} with {weapon}, {noob}','{praise}... to myself. {verb_kill}','{intensifier} free kill, {verb_kill}','{verb_kill}, that was {intensifier} clean','ez, {verb_kill}','lmao {verb_kill}','{verb_kill}, {adverb} {noob} behavior','{verb_kill} from {place}, {noob}','one shot one kill, {verb_kill}'],
    kill_headshot: ['headshot, {verb_kill}, {noob}','{curse} that was a headshot, {verb_kill}','{verb_kill} on the head','brain shot, {verb_kill}','{intensifier} clean headshot, {verb_kill}'],
    death_other: ['{curse}','{curse} that hurt','i need healing','ok i am tilted','{killer} is {intensifier} {noob} too','someone get that guy','{curse} third party','lagging so hard','wheres my team'],
    spawn: ['{rejoined}','ok back, {rejoined}','{curse} i died, {rejoined}','{rejoined}, watch out'],
    idle: ['{banter}','{banter}','{banter}'],
  };
  const pick = a => a[(Math.random() * a.length) | 0];
  function fill(tpl, vars) {
    return tpl.replace(/\{(\w+)\}/g, (m, k) => {
      if (vars && vars[k] !== undefined) return vars[k];
      const p = P[k];
      return p ? pick(p) : m;
    });
  }
  function garnish(s) {
    if (Math.random() < 0.06) s = s.replace(/\bone\b/g, '1').replace(/\btoo\b/g, '2');
    if (Math.random() < 0.04) s += ' lol';
    if (Math.random() < 0.03) s += ' smh';
    if (Math.random() < 0.02) s += ' 💀';
    if (Math.random() < 0.7) s = s.charAt(0).toUpperCase() + s.slice(1);
    return s;
  }
  return {
    gen(cat, vars) {
      const tpls = T[cat];
      if (!tpls) return '';
      let line = '';
      for (let i = 0; i < 10; i++) {
        line = fill(pick(tpls), vars);
        if (!recent.includes(line)) break;
      }
      line = garnish(line);
      recent.push(line);
      if (recent.length > CAP) recent.shift();
      return line;
    },
  };
})();

/* ================================================================
   UI HELPERS
================================================================ */
const cache = {};
function setText(id, v) {
  if (cache[id] !== v) { cache[id] = v; const el = $(id); if (el) el.textContent = v; }
}
let toastT = 0;
function toast(msg, cls) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'show ' + (cls || '');
  toastT = 1.4;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const feedItems = [];
function renderFeed() {
  $('feed').innerHTML = feedItems.slice(-5).map(i => {
    if (i.say) return '<div class="fi say"><b>' + esc(i.k) + ':</b><span>' + esc(i.v) + '</span></div>';
    return '<div class="fi' + (i.me ? ' me' : '') + '"><b>' + esc(i.k) + '</b><span class="ic">' + (i.head ? '⌖' : '✕') + '</span><b>' + esc(i.v) + '</b></div>';
  }).join('');
}
function pushFeed(item) {
  feedItems.push(item);
  if (feedItems.length > 12) feedItems.shift();
  renderFeed();
}
function chatLine(name, text, sys, bot) {
  const log = $('chatlog');
  const line = document.createElement('div');
  line.className = 'chat' + (sys ? ' sys' : '') + (bot ? ' bot' : '');
  line.innerHTML = name ? ('<b>' + esc(name) + '</b> ' + esc(text)) : esc(text);
  log.appendChild(line);
  setTimeout(() => {
    line.style.transition = 'opacity .6s';
    line.style.opacity = '0';
    setTimeout(() => line.remove(), 620);
  }, 13000);
  while (log.children.length > 8) log.firstChild.remove();
}
function botSay(name, text) { if (text) chatLine(name, text, false, true); }

/* ================================================================
   RENDERER + SCENE
================================================================ */
setLoad(0.05, 'renderer');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
} catch (e) {
  loadmsg.textContent = 'WEBGL UNAVAILABLE';
  throw e;
}
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('game').appendChild(renderer.domElement);
const canvasEl = renderer.domElement;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x8a9098, 0.0022);
const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.08, 1500);
camera.rotation.order = 'YXZ';
scene.add(camera);

buildEnvironment(renderer, scene);

// Lights
const sun = new THREE.DirectionalLight(0xffeedd, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 600;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.06;
scene.add(sun, sun.target);

const hemi = new THREE.HemisphereLight(0xc0d4e8, 0x3a3028, 0.55);
scene.add(hemi);
const amb = new THREE.AmbientLight(0x2a3038, 0.35);
scene.add(amb);

/* ================================================================
   GRAPHICS QUALITY
================================================================ */
let GFX = 'high';
let composer = null, ssaoPass = null, bloomPass = null, gradePass = null, smPass = null;

function applyGfx(level) {
  GFX = level;
  const dpr = window.devicePixelRatio || 1;
  let pr = 1, size = 2048, ssaoOn = false, bloomOn = true, grassOn = true;
  if (level === 'ultra') { pr = Math.min(dpr, 2); size = 2048; ssaoOn = true; bloomOn = true; grassOn = true; }
  else if (level === 'high') { pr = Math.min(dpr, 1.5); size = 2048; ssaoOn = false; bloomOn = true; grassOn = true; }
  else if (level === 'medium') { pr = Math.min(dpr, 1.15); size = 1024; ssaoOn = false; bloomOn = true; grassOn = false; }
  else { pr = 1; size = 512; ssaoOn = false; bloomOn = false; grassOn = false; }
  renderer.setPixelRatio(pr);
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (sun.shadow.mapSize.x !== size) {
    sun.shadow.mapSize.set(size, size);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  sun.castShadow = level !== 'low';
  if (grassMesh) grassMesh.visible = grassOn;
  if (composer) {
    composer.setPixelRatio(pr);
    composer.setSize(window.innerWidth, window.innerHeight);
    if (ssaoPass) ssaoPass.enabled = ssaoOn;
    if (bloomPass) bloomPass.enabled = bloomOn;
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  applyGfx(GFX);
});

/* ================================================================
   BUILD WORLD
================================================================ */
setLoad(0.2, 'terrain');

// Ground
const groundGeo = new THREE.PlaneGeometry(MAP * 2 + 200, MAP * 2 + 200, 160, 160);
(function () {
  const p = groundGeo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const v = (Math.sin(x * 0.028 + 1.3) * Math.sin(y * 0.024 + 0.4) + 0.6 * Math.sin(x * 0.08 + y * 0.06) + 0.35 * Math.sin(y * 0.13 - x * 0.07)) / 2;
    p.setZ(i, v * 0.4);
  }
  groundGeo.computeVertexNormals();
})();
const M = buildMaterials();
const groundMat = new THREE.MeshStandardMaterial({
  color: 0x5c5240, roughness: 0.98, metalness: 0.02,
  map: buildTextures().concrete.clone(),
  roughnessMap: buildTextures().concreteRough.clone(),
  envMapIntensity: 0.3,
});
groundMat.map.repeat.set(70, 70);
groundMat.roughnessMap.repeat.set(70, 70);
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

setLoad(0.35, 'city');

// Roads
const roadMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2c, roughness: 0.85, map: buildTextures().asphalt, envMapIntensity: 0.6 });
const road1 = new THREE.Mesh(new THREE.PlaneGeometry(9, MAP * 2), roadMat);
road1.rotation.x = -Math.PI / 2;
road1.position.y = 0.02;
road1.receiveShadow = true;
scene.add(road1);
const road2 = new THREE.Mesh(new THREE.PlaneGeometry(9, MAP * 2), roadMat);
road2.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
road2.position.y = 0.02;
road2.receiveShadow = true;
scene.add(road2);
occupy(-5, 5, -MAP, MAP, 0);
occupy(-MAP, MAP, -5, 5, 0);

// Generate city
generateCity(scene);

setLoad(0.6, 'finalizing');

// Finalize batches
finalizeBatches(scene);

// Grass
let grassMesh = null;
(function () {
  const gr = mulberry32(99), N = 3000;
  const geo = new THREE.ConeGeometry(0.05, 0.3, 3, 1);
  geo.translate(0, 0.15, 0);
  const mat = new THREE.MeshStandardMaterial({ color: 0x6a7a4a, roughness: 1, metalness: 0 });
  const im = new THREE.InstancedMesh(geo, mat, N);
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  let n = 0;
  for (let i = 0; i < N * 4 && n < N; i++) {
    const x = (gr() * 2 - 1) * (MAP - 4), z = (gr() * 2 - 1) * (MAP - 4);
    if (!isFree(x, z, 0.5)) continue;
    const s = 0.5 + gr() * 0.9;
    dummy.position.set(x, 0, z);
    dummy.rotation.y = gr() * TAU;
    dummy.scale.set(s, s * (0.7 + gr() * 0.9), s);
    dummy.updateMatrix();
    im.setMatrixAt(n, dummy.matrix);
    col.setHSL(0.18 + gr() * 0.08, 0.30 + gr() * 0.2, 0.20 + gr() * 0.10);
    im.setColorAt(n, col);
    n++;
  }
  im.count = n;
  im.frustumCulled = false;
  im.receiveShadow = true;
  scene.add(im);
  grassMesh = im;
})();

// Distant skyline
(function () {
  const mat = new THREE.MeshStandardMaterial({ color: 0x5a6a58, roughness: 1.0, envMapIntensity: 0.3 });
  for (let i = 0; i < 48; i++) {
    const a = i / 48 * TAU + wr(-.08, .08), r = wr(720, 940), h = wr(60, 180), w = wr(40, 90);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
    m.position.set(Math.cos(a) * r, h / 2 - 3, Math.sin(a) * r);
    scene.add(m);
  }
})();

setLoad(0.75, 'effects');

const effects = new Effects(scene);
effects.attachMuzzleLight(camera);

// Medkit spots
const medSpots = [];
for (let i = 0; i < 3000 && medSpots.length < 36; i++) {
  const x = wr(-MAP + 10, MAP - 10), z = wr(-MAP + 10, MAP - 10);
  if (isFree(x, z, 2)) medSpots.push([x, z]);
}

setLoad(0.85, 'fighters');

/* ================================================================
   FIGHTERS
================================================================ */
const fighters = [];
const remotes = new Map();
const botPool = [];
const medkits = [];

function makeFighter(name, isPlayer, color) {
  return {
    name, isPlayer, color,
    x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, pitch: 0,
    hp: 100, alive: false, kills: 0, deaths: 0,
    onGround: true, invuln: 0, respawnAt: 0,
    lastFire: -99, deathT: 0, speed: 0,
    skill: 0.75 + Math.random() * 0.35,
    target: null, thinkT: Math.random() * 0.3, reactT: 0, nextShot: 0, burst: 3,
    strafe: 1, strafeT: 0, side: Math.random() < 0.5 ? 1 : -1,
    tx: 0, tz: 0, stuckT: 0, px: 0, pz: 0, walk: 0, sprint: false,
    mesh: null, bones: null, label: null, gun: null,
    animT: Math.random() * 10,
    remote: false, isBot: !isPlayer && name !== 'You',
    idleChatT: 2 + Math.random() * 20,
    emote: null, emoteT: 0, emoteSym: null,
    reloading: false, reloadT: 0, reloadDur: 2.2,
    deathKind: 'body', deathDecalSpawned: false,
  };
}

// Skins
function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const skinCache = new Map();

function makeClothTexture(seed, hue, sat, light, pattern) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), rng = mulberry32(seed ^ 0xa5a5a5);
  g.fillStyle = `hsl(${hue},${sat}%,${light}%)`;
  g.fillRect(0, 0, S, S);
  const bl = [];
  for (let k = 0; k < 4; k++) bl.push(`hsl(${hue + (rng() - 0.5) * 60},${sat + (rng() - 0.5) * 20}%,${light + (rng() - 0.5) * 22}%)`);
  switch (pattern) {
    case 0: break;
    case 1: { for (let i = 0; i < 50; i++) { g.fillStyle = bl[(rng() * 4) | 0]; g.beginPath(); g.arc(rng() * S, rng() * S, 8 + rng() * 30, 0, 6.28); g.fill(); } break; }
    case 2: { for (let i = 0; i < 1000; i++) { g.fillStyle = bl[(rng() * 4) | 0]; const s = 4 + ((rng() * 8) | 0); g.fillRect(((rng() * S / s) | 0) * s, ((rng() * S / s) | 0) * s, s, s); } break; }
    case 3: { g.save(); g.rotate(0.55); for (let x = -256; x < 600; x += 28) { g.fillStyle = bl[(rng() * 4) | 0]; g.fillRect(x, -256, 14, 760); } g.restore(); break; }
    case 4: { for (let i = 0; i < 250; i++) { g.fillStyle = bl[(rng() * 4) | 0]; g.beginPath(); g.arc(rng() * S, rng() * S, 2 + rng() * 8, 0, 6.28); g.fill(); } break; }
    case 5: { for (let i = 0; i < 30; i++) { g.strokeStyle = bl[(rng() * 4) | 0]; g.lineWidth = 4 + rng() * 10; g.beginPath(); let x = rng() * S, y = rng() * S; g.moveTo(x, y); for (let j = 0; j < 7; j++) { x += (rng() - 0.5) * 60; y += (rng() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); } break; }
    case 6: { for (let i = 0; i < 500; i++) { g.strokeStyle = bl[(rng() * 4) | 0]; g.lineWidth = 1 + rng() * 3; g.beginPath(); let x = rng() * S, y = rng() * S; g.moveTo(x, y); for (let j = 0; j < 5; j++) { x += (rng() - 0.5) * 25; y += (rng() - 0.5) * 25; g.lineTo(x, y); } g.stroke(); } break; }
  }
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `hsla(${hue},${sat}%,${light}%,${rng() * 0.15})`;
    g.fillRect(rng() * S, rng() * S, 1 + rng() * 2, 1 + rng() * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return tex;
}

function getSkin(name) {
  if (skinCache.has(name)) return skinCache.get(name);
  const seed = hashStr(name), rng = mulberry32(seed);
  const hue = rng() * 360, sat = 18 + rng() * 40, light = 20 + rng() * 25;
  const palette = {
    hue, sat, light,
    dark: `hsl(${hue},${sat + 5}%,${Math.max(12, light - 12)}%)`,
    accent: `hsl(${(hue + 180) % 360},65%,55%)`,
    skinTone: [`hsl(28,55%,${55 + rng() * 20}%)`, `hsl(22,60%,${40 + rng() * 20}%)`, `hsl(15,50%,${35 + rng() * 25}%)`][(rng() * 3) | 0],
    helmet: rng() < 0.6, cap: rng() < 0.2, beret: rng() < 0.08,
    vest: rng() < 0.8, back: rng() < 0.75,
    texture: makeClothTexture(seed, hue, sat, light, (rng() * 7) | 0),
  };
  skinCache.set(name, palette);
  return palette;
}

const NODEX_PALETTE = (() => {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), rng = mulberry32(0xDEADBEEF);
  g.fillStyle = '#1e2018';
  g.fillRect(0, 0, S, S);
  const cols = ['#2a2c1e', '#3a3c28', '#181a10', '#4a4a30', '#25281a'];
  for (let i = 0; i < 300; i++) {
    g.fillStyle = cols[(rng() * cols.length) | 0];
    g.beginPath(); g.arc(rng() * S, rng() * S, 4 + rng() * 20, 0, 6.28); g.fill();
  }
  g.strokeStyle = '#d4af37'; g.lineWidth = 3;
  for (let y = 60; y < 220; y += 40) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
  g.fillStyle = '#c0392b'; g.fillRect(100, 200, 56, 28);
  g.fillStyle = '#d4af37'; g.fillRect(104, 204, 48, 4);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return {
    hue: 50, sat: 30, light: 15,
    dark: '#0a0a08',
    accent: '#d4af37',
    skinTone: '#8a6a4a',
    helmet: true, cap: false, beret: false,
    vest: true, back: true,
    texture: tex, special: true,
  };
})();

// Emote helper
function makeEmoteSprite(text, colorHex) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.font = '80px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false, depthTest: false }));
  s.scale.set(0.9, 0.9, 1);
  s.material.color = new THREE.Color(colorHex);
  return s;
}
function startEmote(f, name) {
  if (!EMOTES[name]) return;
  if (f.emoteSym) { f.mesh.remove(f.emoteSym); f.emoteSym.material.map.dispose(); f.emoteSym.material.dispose(); }
  f.emote = name;
  f.emoteT = EMOTES[name].dur;
  f.emoteSym = makeEmoteSprite(EMOTES[name].sym, EMOTES[name].color);
  f.emoteSym.position.set(0, 2.5, 0);
  f.mesh.add(f.emoteSym);
}
function stopEmote(f) {
  f.emote = null;
  f.emoteT = 0;
  if (f.emoteSym) { f.mesh.remove(f.emoteSym); f.emoteSym.material.map.dispose(); f.emoteSym.material.dispose(); f.emoteSym = null; }
}

// Create actor
function makeActor(f) {
  const palette = f.name === 'NoDeX' ? NODEX_PALETTE : getSkin(f.name);
  const rig = buildCharacterRig(palette, f.name);
  scene.add(rig.root);
  f.mesh = rig.root;
  f.bones = rig.bones;
  f.label = rig.label;

  // Attach weapon to right hand
  const w = buildWeapon(WEAPONS[0].key);
  f.bones.handR.add(w.group);
  w.group.rotation.set(-Math.PI / 2, 0, 0);
  w.group.position.set(0, -0.01, -0.12);
  f.gun = w;

  rig.root.visible = false;
}

// Player + bots
const player = makeFighter('You', true, 0x6fe3ff);
fighters.push(player);

for (let i = 0; i < NUM_BOTS; i++) {
  const b = makeFighter(BOT_NAMES[i], false, BOT_COLORS[i]);
  botPool.push(b);
}

setLoad(0.9, 'net');

/* ================================================================
   NETWORK
================================================================ */
const net = { ws: null, arena: 1, status: 'idle', selfId: null, mapSent: false };
const myColor = BOT_COLORS[(Math.random() * BOT_COLORS.length) | 0];

function statusText() {
  if (mode === 'single') return 'Single player';
  if (mode === 'multi') {
    if (net.status === 'connecting') return 'Connecting…';
    if (net.status === 'online') return 'Arena ' + net.arena + ' · ' + (1 + remotes.size) + ' players';
    return 'Offline';
  }
  return '';
}

function connectArena(n) {
  if (net.ws) { try { net.ws.close(); } catch {} }
  net.arena = n;
  net.status = 'connecting';
  net.mapSent = false;
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(proto + '//' + location.host + '/ws?arena=' + n);
  net.ws = ws;
  ws.onopen = () => {
    net.status = 'online';
    ws.send(JSON.stringify({ t: 'join', name: player.name, color: myColor }));
  };
  ws.onmessage = e => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    handleNetMessage(msg);
  };
  ws.onclose = () => { net.status = 'idle'; if (state === 'playing' || state === 'dead') toast('Disconnected', 'warn'); };
  ws.onerror = () => { net.status = 'idle'; };
}

function handleNetMessage(msg) {
  switch (msg.t) {
    case 'welcome': net.selfId = msg.id; break;
    case 'mapReady': break;
    case 'players': for (const p of msg.list) addRemote(p.id, p); break;
    case 'joined': if (msg.id !== net.selfId) { const f = addRemote(msg.id, msg); if (f) toast(f.name + ' joined', 'warn'); } break;
    case 'left': { const f = remotes.get(msg.id); if (f) { toast(f.name + ' left', 'warn'); removeRemote(msg.id); } break; }
    case 'spawned':
      if (msg.id !== net.selfId) {
        const f = remotes.get(msg.id) || addRemote(msg.id, msg);
        if (f) {
          f.alive = true;
          f.hasState = true;
          f.x = f.nx = msg.x;
          f.y = f.ny = msg.y;
          f.z = f.nz = msg.z;
          f.yaw = f.nyaw = msg.yaw;
          f.hp = 100;
          f.mesh.visible = true;
          f.mesh.rotation.x = 0;
        }
      }
      break;
    case 'state': onRemoteState(msg); break;
    case 'fire': onRemoteFire(msg); break;
    case 'hit':
      if (player.alive && player.invuln <= 0) {
        player.hp -= msg.dmg;
        P.dmgT = 0.6;
        P.lastHitAt = T;
        sfxHurt();
        if (msg.fromX !== undefined) showDmgDir(msg.fromX, msg.fromZ);
        if (player.hp <= 0) {
          player.hp = 0;
          player.alive = false;
          player.deaths++;
          onPlayerDeath();
        }
      }
      break;
    case 'kill':
      if (msg.by === net.selfId) { player.kills++; sfxKill(); showHit(!!msg.hs, true); toast('Eliminated ' + (msg.victimName || 'a player'), 'good'); }
      if (msg.byName && msg.victimName) pushFeed({ k: msg.byName, v: msg.victimName, head: !!msg.hs, t: T, me: msg.by === net.selfId });
      break;
    case 'chat': chatLine(msg.name, msg.m); break;
    case 'chatHistory': for (const c of msg.m) chatLine(c.name, c.m); break;
    case 'snap': player.x = msg.x; player.y = msg.y; player.z = msg.z; break;
    case 'emote': { const f = remotes.get(msg.id); if (f) startEmote(f, msg.e); break; }
    case 'private': chatLine(null, msg.m, true); if (!$('adminPrompt').classList.contains('hidden')) hideAdminPrompt(); break;
    case 'error': leaveMatch(msg.m); break;
  }
}

function uploadMap() {
  if (!net.ws || net.ws.readyState !== 1 || net.mapSent) return;
  net.mapSent = true;
  const flat = new Array(boxes.length * 6);
  let i = 0;
  for (const b of boxes) {
    flat[i++] = r2(b.x0); flat[i++] = r2(b.x1);
    flat[i++] = r2(b.y0); flat[i++] = r2(b.y1);
    flat[i++] = r2(b.z0); flat[i++] = r2(b.z1);
  }
  net.ws.send(JSON.stringify({ t: 'map', b: flat }));
}

function addRemote(id, info) {
  let f = remotes.get(id);
  if (f) return f;
  f = makeFighter(info.name || 'Player', false, info.color || BOT_COLORS[0]);
  f.remote = true;
  f.isBot = false;
  f.id = id;
  f.nx = info.x || 0; f.ny = info.y || 0; f.nz = info.z || 0; f.nyaw = info.yaw || 0;
  f.x = f.nx; f.y = f.ny; f.z = f.nz; f.yaw = f.nyaw;
  f.hasState = true;
  f.alive = info.alive !== 0;
  f.kills = info.kills || 0;
  f.deaths = info.deaths || 0;
  f.lastMsg = performance.now();
  makeActor(f);
  remotes.set(id, f);
  fighters.push(f);
  f.mesh.visible = f.alive;
  return f;
}

function removeRemote(id) {
  const f = remotes.get(id);
  if (!f) return;
  if (f.mesh) scene.remove(f.mesh);
  const i = fighters.indexOf(f);
  if (i >= 0) fighters.splice(i, 1);
  remotes.delete(id);
}

function onRemoteState(msg) {
  let f = remotes.get(msg.id);
  if (!f) { f = addRemote(msg.id, { name: msg.n || 'Player', color: msg.c }); if (!f) return; }
  f.lastMsg = performance.now();
  if (Math.hypot(msg.x - f.x, msg.z - f.z) > 30) { f.x = msg.x; f.y = msg.y; f.z = msg.z; }
  f.nx = msg.x; f.ny = msg.y; f.nz = msg.z; f.nyaw = msg.yaw;
  f.hp = msg.hp;
  f.kills = msg.kills | 0;
  f.deaths = msg.deaths | 0;
  const alive = !!msg.alive;
  if (alive && !f.alive) { f.alive = true; f.mesh.visible = true; f.mesh.rotation.x = 0; f.deathT = 0; }
  else if (!alive && f.alive) { f.alive = false; f.deathT = 0; }
}

function onRemoteFire(msg) {
  const f = remotes.get(msg.id);
  if (f) f.lastFire = T;
  const o = msg.o, d = msg.d, w = WEAPONS[msg.w | 0] || WEAPONS[0];
  effects.tracer(
    new THREE.Vector3(o[0], o[1], o[2]),
    new THREE.Vector3(o[0] + d[0] * w.range, o[1] + d[1] * w.range, o[2] + d[2] * w.range),
    1
  );
  const cd = Math.hypot(o[0] - camera.position.x, o[2] - camera.position.z);
  sfxShot(w.key, 0.3 * clamp(1 - cd / 120, 0, 1));
}

function sendMyState() {
  if (!net.ws || net.ws.readyState !== 1) return;
  const p = player;
  net.ws.send(JSON.stringify({ t: 'state', x: r2(p.x), y: r2(p.y), z: r2(p.z), yaw: r2(yaw), hp: Math.round(p.hp), alive: p.alive ? 1 : 0 }));
}

function updateRemotes(dt) {
  const k = 1 - Math.exp(-dt * 14);
  const now = performance.now();
  for (const f of Array.from(remotes.values())) {
    if (!f.hasState) continue;
    if (now - f.lastMsg > 25000) { removeRemote(f.id); continue; }
    if (Math.hypot(f.nx - f.x, f.nz - f.z) > 30) { f.x = f.nx; f.y = f.ny; f.z = f.nz; }
    else { f.x += (f.nx - f.x) * k; f.y += (f.ny - f.y) * k; f.z += (f.nz - f.z) * k; }
    f.yaw += angDiff(f.yaw, f.nyaw) * k;
    f.onGround = true;
  }
}

function stopNet() {
  if (net.ws) { try { net.ws.close(); } catch {} net.ws = null; }
  net.status = 'idle';
  net.mapSent = false;
  for (const id of Array.from(remotes.keys())) removeRemote(id);
}

// Send state on wall-clock (survives rAF throttling in background tabs)
setInterval(() => {
  if (mode === 'multi' && net.ws && net.ws.readyState === 1 && (state === 'playing' || state === 'dead')) {
    sendMyState();
  }
}, 50);

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && net.ws && net.ws.readyState === 1 && mode === 'multi') {
    net.ws.send(JSON.stringify({ t: 'roster' }));
  }
});

/* ================================================================
   GAME STATE
================================================================ */
let state = 'menu';
let mode = 'menu';
let T = 0;
let yaw = 0, pitch = 0, deadT = 0;
let locked = false, fallback = false, starting = false;
let sensSetting = 5;
let chatOpen = false;
let matchActive = false;

const keys = {};
let mouseL = false, mouseR = false, mousePressed = false;

const P = {
  cur: 0,
  ammo: WEAPONS.map(w => w.mag),
  reload: 0, reloadTotal: 1,
  nextFire: 0, heat: 0, adsT: 0, swap: 0, kick: 0, flash: 0, bob: 0,
  swayX: 0, swayY: 0,
  hitT: 0, dmgT: 0, dmgDirT: 0,
  fovB: 0, recoilX: 0, recoilY: 0, idleSway: 0,
  sprintSway: 0,
  lastHitAt: -999, regening: false,
};

let gunRoot = new THREE.Group();
camera.add(gunRoot);
const playerGuns = [];
for (const w of WEAPONS) {
  const g = buildWeapon(w.key);
  g.group.visible = false;
  gunRoot.add(g.group);
  playerGuns.push(g);
}
playerGuns[0].group.visible = true;

const flashMat = new THREE.MeshBasicMaterial({ color: 0xffc060, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, fog: false, side: THREE.DoubleSide });
const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.28), flashMat);
flash.renderOrder = 1100;
flash.visible = false;
gunRoot.add(flash);

/* ================================================================
   MATCH FLOW
================================================================ */
function useBots(on) {
  fighters.length = 0;
  fighters.push(player);
  for (const b of botPool) {
    if (on) {
      fighters.push(b);
      if (!b.mesh) makeActor(b);
      b.mesh.visible = false;
    } else {
      b.alive = false;
      b.target = null;
      if (b.mesh) b.mesh.visible = false;
    }
  }
}

function spawn(f) {
  let best = null, bs = -1;
  for (let i = 0; i < 50; i++) {
    const x = rnd(-MAP + 8, MAP - 8), z = rnd(-MAP + 8, MAP - 8);
    if (!spawnOK(x, z)) continue;
    let md = 1e9;
    for (const o of fighters) {
      if (o === f || !o.alive) continue;
      md = Math.min(md, Math.hypot(o.x - x, o.z - z));
    }
    if (md > 35) { best = [x, z]; break; }
    if (md > bs) { bs = md; best = [x, z]; }
  }
  if (!best) best = [0, -MAP + 20];
  f.x = best[0]; f.z = best[1]; f.y = 0;
  f.vx = f.vy = f.vz = 0;
  f.hp = 100;
  f.alive = true;
  f.invuln = 2.5;
  f.yaw = rnd(0, TAU);
  f.target = null;
  f.deathT = 0;
  f.deathDecalSpawned = false;
  f.reloadT = 0;
  f.onGround = true;
  f.px = f.x; f.pz = f.z;
  f.stuckT = 0;
  f.reactT = 0;
  f.nextShot = T + 0.5;
  if (f.mesh) {
    f.mesh.visible = true;
    f.mesh.rotation.set(0, f.yaw, 0);
  }
  if (f.bones) {
    f.bones.pelvis.position.y = 0.9;
    f.bones.spine1.rotation.set(0, 0, 0);
    f.bones.spine2.rotation.set(0, 0, 0);
    f.bones.chest.rotation.set(0, 0, 0);
    f.bones.head.rotation.set(0, 0, 0);
    f.bones.upperLegL.rotation.set(0, 0, 0);
    f.bones.upperLegR.rotation.set(0, 0, 0);
    f.bones.lowerLegL.rotation.set(0, 0, 0);
    f.bones.lowerLegR.rotation.set(0, 0, 0);
  }
  if (f.gun) {
    f.gun.group.position.set(0, -0.01, -0.12);
    f.gun.group.rotation.set(-Math.PI / 2, 0, 0);
  }
  if (f.isPlayer) { yaw = f.yaw; pitch = 0; deadT = 0; camera.rotation.z = 0; P.lastHitAt = T; }
  if (f.isBot) {
    if (Math.random() < 0.3) botSay(f.name, BotChat.gen('spawn'));
    newWander(f);
  }
}

function newWander(b) {
  b.sprint = Math.random() < 0.35;
  for (let i = 0; i < 12; i++) {
    const a = rnd(0, TAU), r = rnd(20, 70);
    const x = clamp(b.x + Math.cos(a) * r, -MAP + 6, MAP - 6);
    const z = clamp(b.z + Math.sin(a) * r, -MAP + 6, MAP - 6);
    if (spawnOK(x, z)) { b.tx = x; b.tz = z; return; }
  }
  b.tx = rnd(-MAP + 10, MAP - 10);
  b.tz = rnd(-MAP + 10, MAP - 10);
}

function damage(v, amt, a, head) {
  if (!v.alive || v.invuln > 0 || state === 'ended') return false;
  v.hp -= amt;
  if (v.isPlayer) { P.dmgT = 0.6; P.lastHitAt = T; sfxHurt(); if (a && a !== v) showDmgDir(a.x, a.z); }
  if (v.hp <= 0) {
    if (v.deathT <= 0 || v.deathT > 3.4) kill(v, a, head);
    v.hp = 0;
    return true;
  }
  return false;
}

function kill(v, a, head) {
  if (!v.alive) return;
  v.alive = false;
  v.hp = 0;
  v.deaths++;
  v.deathT = 0.001;
  v.deathKind = head ? 'head' : 'body';
  v.deathDecalSpawned = false;
  if (a && a !== v) a.kills++;
  if (matchActive || state !== 'menu') {
    pushFeed({ k: a ? a.name : '?', v: v.name, head: !!head, t: T, me: (a && a.isPlayer) || v.isPlayer });
  }
  if (v.isBot) {
    if (a && a.isPlayer) botSay(v.name, BotChat.gen('death_player', { killer: a.name }));
    else if (a && a.name) botSay(v.name, BotChat.gen('death_other', { killer: a.name }));
  }
  if (a && a.isBot && v.isPlayer) {
    const cat = head ? 'kill_headshot' : 'kill_player';
    if (Math.random() < 0.6) botSay(a.name, BotChat.gen(cat));
  }
  if (v.isPlayer) onPlayerDeath(a, head);
  else v.respawnAt = T + 4;
  if (a && a.isPlayer && a !== v) { sfxKill(); showHit(head, true); toast('Eliminated ' + v.name, 'good'); }
}

function onPlayerDeath(a, head) {
  state = 'dead';
  deadT = 0;
  P.reload = 0;
  mouseL = false;
  if (a) $('killer').textContent = 'Taken out by ' + a.name + (head ? ' — headshot' : '');
  else $('killer').textContent = 'You were eliminated';
  $('death').classList.remove('hidden');
  $('shield').classList.add('hidden');
  gunRoot.visible = false;
  $('scope').classList.add('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
}

function doRespawn() {
  spawn(player);
  P.ammo = WEAPONS.map(w => w.mag);
  P.reload = 0;
  P.heat = 0;
  P.adsT = 0;
  P.recoilX = 0;
  P.recoilY = 0;
  if (camera.fov !== BASE_FOV) { camera.fov = BASE_FOV; camera.updateProjectionMatrix(); }
  setGun(0);
  state = 'playing';
  $('death').classList.add('hidden');
  gunRoot.visible = true;
  requestLock(false);
  if (mode === 'multi' && net.ws && net.ws.readyState === 1) net.ws.send(JSON.stringify({ t: 'spawn' }));
}

/* ================================================================
   PLAYER
================================================================ */
function setGun(i) {
  i = clamp(i, 0, WEAPONS.length - 1);
  P.cur = i;
  playerGuns.forEach((g, k) => { g.group.visible = (k === i); });
  flash.position.set(0, 0.01, WEAPONS[i].flashZ);
  setText('wname', WEAPONS[i].name);
  document.querySelectorAll('#wslots span').forEach((s, k) => s.classList.toggle('on', k === i));
  P.swap = 1;
  P.reload = 0;
}

function startReload() {
  const w = WEAPONS[P.cur];
  if (P.reload > 0 || P.ammo[P.cur] >= w.mag) return;
  P.reload = w.reload;
  P.reloadTotal = w.reload;
  sfxReload(w.reload);
}

function currentSpread() {
  const w = WEAPONS[P.cur];
  let s = lerp(w.hip, w.ads, P.adsT);
  const mv = Math.hypot(player.vx, player.vz);
  if (!player.onGround) s *= 2.4;
  else if (mv > 1) s *= 1 + Math.min(mv / 8, 1) * 0.6;
  s += P.heat * w.hip * 0.9 * (1 - P.adsT * 0.6);
  return s;
}

const _v = new THREE.Vector3();

function playerShoot() {
  const w = WEAPONS[P.cur];
  P.ammo[P.cur]--;
  P.nextFire = T + w.rate;
  P.kick = 1;
  P.flash = 0.05;
  player.lastFire = T;
  flash.rotation.z = rnd(0, TAU);

  const ex = player.x, ey = player.y + EYE, ez = player.z;
  const aimYaw = yaw + P.recoilX;
  const aimPitch = clamp(pitch + P.recoilY, -1.5, 1.5);
  const cy = Math.cos(aimYaw), sy = Math.sin(aimYaw);
  const cp = Math.cos(aimPitch), sp = Math.sin(aimPitch);
  const fx_ = -sy * cp, fy_ = sp, fz_ = -cy * cp;
  const rx = cy, rz = -sy;
  const ux = -rz * fy_, uy = rz * fx_ - rx * fz_, uz = rx * fy_;
  const spread = currentSpread();
  _v.set(lerp(0.17, 0.02, P.adsT), lerp(-0.13, -0.05, P.adsT), -0.85).applyMatrix4(camera.matrixWorld);
  const sx = _v.x, sy_ = _v.y, sz = _v.z;
  const hits = new Map();

  for (let i = 0; i < w.pellets; i++) {
    const a = rnd(0, TAU), r = Math.sqrt(Math.random()) * spread;
    const ox = Math.cos(a) * r, oy = Math.sin(a) * r;
    let dx = fx_ + rx * ox + ux * oy, dy = fy_ + uy * oy, dz = fz_ + rz * ox + uz * oy;
    const LL = Math.hypot(dx, dy, dz);
    dx /= LL; dy /= LL; dz /= LL;
    const h = castRay(ex, ey, ez, dx, dy, dz, 300, player, fighters);
    const px = ex + dx * h.t, py = ey + dy * h.t, pz = ez + dz * h.t;
    effects.tracer(new THREE.Vector3(sx, sy_, sz), new THREE.Vector3(px, py, pz), w.pellets > 1 ? 0.5 : 1);
    if (h.f && !h.f.remote) {
      const d = w.dmg * (h.head ? w.head : 1) * dmgMul(w, h.t);
      const e = hits.get(h.f) || { d: 0, head: false };
      e.d += d;
      if (h.head) e.head = true;
      hits.set(h.f, e);
      effects.puff(px, py, pz, 'blood', 2);
    } else if (h.world) {
      effects.puff(px - dx * 0.05, py - dy * 0.05, pz - dz * 0.05, 'dust', 2);
      effects.decal(new THREE.Vector3(px, py, pz), new THREE.Vector3(-dx, -dy, -dz));
    }
  }

  hits.forEach((e, f) => {
    const killed = damage(f, e.d, player, e.head);
    if (!killed) { showHit(e.head, false); sfxHit(e.head); }
  });

  if (mode === 'multi' && net.ws && net.ws.readyState === 1) {
    net.ws.send(JSON.stringify({
      t: 'fire', w: P.cur,
      o: [r2(ex), r2(ey), r2(ez)],
      d: [r4(fx_), r4(fy_), r4(fz_)],
      spread: r4(spread),
    }));
  }

  // Eject physical brass casing from ejection port
  const casingPos = new THREE.Vector3(
    lerp(0.19, 0.05, P.adsT),
    lerp(-0.13, -0.06, P.adsT),
    -0.44
  ).applyMatrix4(camera.matrixWorld);
  const rightDir = new THREE.Vector3(1, 0.40, 0.12).applyQuaternion(camera.quaternion);
  const upDir = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
  effects.ejectCasing(casingPos, rightDir, upDir);

  P.recoilY += w.recoilKick * 0.0075 * (1 - P.adsT * 0.30);
  P.recoilX += (Math.random() - 0.5) * w.recoilKick * 0.0032 * (1 - P.adsT * 0.20);
  P.heat = Math.min(1, P.heat + (w.auto ? 0.12 : 0.5));
  sfxShot(w.key, 0.32);
  if (P.ammo[P.cur] <= 0) startReload();
}

function updatePlayer(dt) {
  const p = player, w = WEAPONS[P.cur];

  if (keys.ArrowLeft) yaw += 1.9 * dt;
  if (keys.ArrowRight) yaw -= 1.9 * dt;
  if (keys.ArrowUp) pitch += 1.4 * dt;
  if (keys.ArrowDown) pitch -= 1.4 * dt;
  pitch = clamp(pitch, -1.5, 1.5);

  const recov = Math.min(1, dt * w.recoilReturn);
  P.recoilY *= Math.max(0, 1 - recov);
  P.recoilX *= Math.max(0, 1 - recov);

  if (p.invuln > 0) p.invuln -= dt;
  $('shield').classList.toggle('hidden', !(p.invuln > 0));

  const fw = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const rt = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  const ads = mouseR && P.reload <= 0;
  P.adsT = clamp(P.adsT + ((ads ? 1 : -1) * dt * (w.key === 'sniper' ? 7 : 11)), 0, 1);

  let spd = 6.2;
  const sprinting = (keys.ShiftLeft || keys.ShiftRight) && fw > 0 && !ads;
  if (sprinting) spd = 9.2;
  else if (ads) spd = w.key === 'sniper' ? 2.6 : 3.6;

  let mx = -Math.sin(yaw) * fw + Math.cos(yaw) * rt;
  let mz = -Math.cos(yaw) * fw - Math.sin(yaw) * rt;
  const ml = Math.hypot(mx, mz);
  if (ml > 0) { mx /= ml; mz /= ml; }
  const k = Math.min(1, dt * (p.onGround ? 14 : 2.5));
  p.vx += (mx * spd - p.vx) * k;
  p.vz += (mz * spd - p.vz) * k;
  if (keys.Space && p.onGround) { p.vy = 7.6; p.onGround = false; }
  physics(p, dt);
  p.speed = Math.hypot(p.vx, p.vz);
  P.bob += p.onGround ? p.speed * dt * 1.5 : 0;
  P.idleSway += dt * 1.2;

  P.fovB = lerp(P.fovB || 0, (sprinting && p.speed > 6) ? 5 : 0, Math.min(1, dt * 6));
  const targetFov = lerp(BASE_FOV + P.fovB, w.adsFov, P.adsT);
  if (Math.abs(camera.fov - targetFov) > 0.01) { camera.fov = targetFov; camera.updateProjectionMatrix(); }
  const bobY = p.onGround && p.speed > 1 ? Math.sin(P.bob * 2) * 0.035 * (1 - P.adsT) : 0;
  camera.position.set(p.x, p.y + EYE + bobY, p.z);
  camera.rotation.set(clamp(pitch + P.recoilY, -1.5, 1.5), yaw + P.recoilX, 0);
  camera.updateMatrixWorld(true);

  // Auto-heal
  if (p.hp < 100 && (T - P.lastHitAt) > 10) { p.hp = Math.min(100, p.hp + 2 * dt); P.regening = true; }
  else P.regening = false;
  if (P.regening) $('hpfill').style.filter = 'brightness(1.3) drop-shadow(0 0 6px #43e0a0)';
  else $('hpfill').style.filter = '';

  // Medkits
  for (const m of medkits) {
    if (!m.active) { if (T >= m.t) { m.active = true; m.mesh.visible = true; } continue; }
    if (p.hp < 100 && Math.abs(p.x - m.x) < 1.4 && Math.abs(p.z - m.z) < 1.4 && Math.abs(p.y - 0) < 3) {
      p.hp = Math.min(100, p.hp + 45);
      m.active = false;
      m.mesh.visible = false;
      m.t = T + 25;
      sfxPickup();
      toast('+45 health', 'good');
    }
  }

  if (P.reload > 0) { P.reload -= dt; if (P.reload <= 0) { P.reload = 0; P.ammo[P.cur] = w.mag; } }
  P.heat = Math.max(0, P.heat - dt * 2.4);
  const wantFire = w.auto ? mouseL : mousePressed;
  if (wantFire && P.reload <= 0 && P.swap < 0.35 && T >= P.nextFire) {
    if (P.ammo[P.cur] > 0) playerShoot();
    else startReload();
  }
  mousePressed = false;
  if (keys.KeyR) startReload();

  // Viewmodel animation
  P.kick = Math.max(0, P.kick - dt * 8.5);
  P.flash = Math.max(0, P.flash - dt);
  P.swap = Math.max(0, P.swap - dt * 4);
  P.swayX *= Math.max(0, 1 - dt * 10);
  P.swayY *= Math.max(0, 1 - dt * 10);

  const rl01 = P.reload > 0 ? 1 - P.reload / P.reloadTotal : 0;
  let reloadLower = 0, reloadTilt = 0, reloadMagY = 0, reloadBoltZ = 0;
  if (P.reload > 0) {
    // 5-Stage Tactical Reload Cycle:
    // 1. (0.00 - 0.22) Tilt into workspace, empty mag unlatches & drops
    // 2. (0.22 - 0.52) Retain workspace angle while left hand grabs fresh mag
    // 3. (0.52 - 0.70) Fresh mag is inserted and slapped home into magwell
    // 4. (0.70 - 0.86) Bolt catch release / charging handle rack
    // 5. (0.86 - 1.00) Smooth return to high-ready aim
    if (rl01 < 0.22) {
      const p = rl01 / 0.22;
      reloadLower = p;
      reloadTilt = p;
      reloadMagY = -p * 0.35;
    } else if (rl01 < 0.52) {
      reloadLower = 1;
      reloadTilt = 1;
      reloadMagY = -1.0;
    } else if (rl01 < 0.70) {
      const p = (rl01 - 0.52) / 0.18;
      reloadLower = 1;
      reloadTilt = 1;
      reloadMagY = -(1 - p) * 0.30;
    } else if (rl01 < 0.86) {
      const p = (rl01 - 0.70) / 0.16;
      reloadLower = 1 - p * 0.45;
      reloadTilt = 1 - p * 0.45;
      reloadMagY = 0;
      reloadBoltZ = Math.sin(p * Math.PI) * -0.07;
    } else {
      const p = (rl01 - 0.86) / 0.14;
      reloadLower = (1 - p) * 0.55;
      reloadTilt = (1 - p) * 0.55;
      reloadMagY = 0;
    }
  }

  const sprintAim = Math.max(0, (sprinting ? 1 : 0) - P.adsT);
  P.sprintSway = lerp(P.sprintSway, sprintAim, Math.min(1, dt * 8));

  const idleX = Math.sin(P.idleSway * 1.4) * 0.0035 * (1 - P.adsT);
  const idleY = Math.sin(P.idleSway * 1.1) * 0.0040 * (1 - P.adsT);

  const a = P.adsT;
  const hipX = 0.20, hipY = -0.19, hipZ = -0.42;
  const adsX = 0, adsY = -0.09, adsZ = -0.36;
  let baseX = lerp(hipX, adsX, a);
  let baseY = lerp(hipY, adsY, a);
  let baseZ = lerp(hipZ, adsZ, a);

  baseX += P.sprintSway * 0.08;
  baseY += P.sprintSway * 0.10;
  baseZ += P.sprintSway * 0.15;
  const sprintRot = P.sprintSway * 0.35;
  const kickK = P.kick * 0.065 * (w.recoil * 35 + 1);
  const kickZ = P.kick * 0.075 * w.recoil * 12;
  const kickRoll = (Math.sin(T * 42) * 0.02) * P.kick;

  gunRoot.position.set(
    baseX + P.swayX + idleX - reloadTilt * 0.035 + (p.onGround ? Math.cos(P.bob) * 0.006 * (1 - a) : 0),
    baseY + P.swayY + idleY - reloadLower * 0.18 - P.swap * 0.30 + (p.onGround ? Math.abs(Math.sin(P.bob)) * 0.008 * (1 - a) : 0),
    baseZ + kickZ - reloadLower * 0.06
  );
  gunRoot.rotation.set(
    kickK - reloadTilt * 0.38,
    reloadTilt * 0.28 + sprintRot * 0.8,
    -reloadTilt * 0.52 + sprintRot + kickRoll
  );

  // Animate weapon sub-parts
  const gun = playerGuns[P.cur];
  if (gun) {
    const fireBolt = Math.max(0, P.flash / 0.05) * -0.06;
    gun.bolt.position.z = fireBolt + reloadBoltZ;
    gun.mag.position.y = reloadMagY;
  }

  flash.visible = P.flash > 0;
  effects.muzzleLight.intensity = P.flash > 0 ? 2.2 : 0;

  const scoped = w.key === 'sniper' && P.adsT > 0.9;
  gunRoot.visible = !scoped;
  $('scope').classList.toggle('hidden', !scoped);
  $('crosshair').style.display = scoped ? 'none' : 'block';
  const gap = 4 + Math.tan(currentSpread()) / Math.tan(camera.fov * Math.PI / 360) * (window.innerHeight / 2);
  $('crosshair').style.setProperty('--gap', Math.min(gap, 90).toFixed(1) + 'px');
}

function updateDeadCamera(dt) {
  deadT += dt;
  effects.muzzleLight.intensity = 0;
  const p = player;
  // Visceral collapse: fall with gravity curve, floor rebound, roll onto side
  const fallT = Math.min(1, deadT * 2.2);
  const easeFall = fallT * fallT;
  const bounce = deadT > 0.45 && deadT < 0.75 ? Math.sin((deadT - 0.45) / 0.30 * Math.PI) * 0.06 : 0;
  const camY = lerp(EYE, 0.22, easeFall) + bounce;
  const stumble = Math.min(0.65, deadT * 1.1);
  const roll = lerp(0, 0.75, Math.min(1, deadT * 1.8));

  camera.position.set(
    p.x - Math.sin(yaw) * stumble,
    p.y + camY,
    p.z - Math.cos(yaw) * stumble
  );
  camera.rotation.set(clamp(pitch - fallT * 0.35, -1.3, 1.3), yaw, roll);
  camera.updateMatrixWorld(true);
}

/* ================================================================
   BOTS
================================================================ */
function blockedAt(b, x, z) {
  const cand = queryGrid(x, z, 1);
  for (const bx of cand) {
    if (bx.y1 > b.y + 0.6 && bx.y0 < b.y + 1.7 && x > bx.x0 - 0.5 && x < bx.x1 + 0.5 && z > bx.z0 - 0.5 && z < bx.z1 + 0.5) return true;
  }
  return false;
}
const OFFS = [0, 0.6, -0.6, 1.2, -1.2, 2.0, -2.0, 3.1];
function steer(b, mx, mz) {
  const l = Math.hypot(mx, mz);
  if (l < 1e-4) return [0, 0];
  mx /= l; mz /= l;
  for (const o0 of OFFS) {
    const o = o0 * b.side;
    const c = Math.cos(o), s = Math.sin(o);
    const dx = mx * c - mz * s, dz = mx * s + mz * c;
    if (!blockedAt(b, b.x + dx * 1.3, b.z + dz * 1.3) && !blockedAt(b, b.x + dx * 2.8, b.z + dz * 2.8)) return [dx, dz];
  }
  return [mx, mz];
}
function acquire(b) {
  let best = null, bd = 1e9;
  for (const f of fighters) {
    if (f === b || !f.alive || f.invuln > 0) continue;
    const d = Math.hypot(f.x - b.x, f.z - b.z);
    if (d > 70 || d >= bd) continue;
    if (!losBlocked(b.x, b.y + 1.55, b.z, f.x, f.y + 1.1, f.z)) { best = f; bd = d; }
  }
  if (best !== b.target) {
    if (!best && b.target) { b.tx = b.target.x; b.tz = b.target.z; }
    b.target = best;
    if (best) b.reactT = rnd(0.3, 0.7) / b.skill;
  }
}
function botFire(b, t) {
  const ox = b.x, oy = b.y + 1.45, oz = b.z;
  const dist = Math.hypot(t.x - ox, t.z - oz);
  const sd = 0.036 / b.skill;
  const ex = t.x + rnd(-1, 1) * sd * dist;
  const ey = t.y + 1.0 + rnd(-1, 1) * sd * dist * 0.8;
  const ez = t.z + rnd(-1, 1) * sd * dist;
  let dx = ex - ox, dy = ey - oy, dz = ez - oz;
  const LL = Math.hypot(dx, dy, dz);
  dx /= LL; dy /= LL; dz /= LL;
  const h = castRay(ox, oy, oz, dx, dy, dz, LL + 40, b, fighters);
  b.lastFire = T;
  const cd = Math.hypot(b.x - camera.position.x, b.z - camera.position.z);
  if (cd < 110) {
    const mx = b.x - Math.sin(b.yaw) * 0.7;
    const mz = b.z - Math.cos(b.yaw) * 0.7;
    effects.tracer(
      new THREE.Vector3(mx, b.y + 1.25, mz),
      new THREE.Vector3(ox + dx * h.t, oy + dy * h.t, oz + dz * h.t),
      1
    );
    // Eject brass casing from bot's rifle ejection port
    const casingPos = new THREE.Vector3(
      b.x + Math.cos(b.yaw) * 0.28,
      b.y + 1.28,
      b.z - Math.sin(b.yaw) * 0.28
    );
    const rightDir = new THREE.Vector3(Math.cos(b.yaw), 0.35, -Math.sin(b.yaw));
    const upDir = new THREE.Vector3(0, 1, 0);
    effects.ejectCasing(casingPos, rightDir, upDir);

    sfxShot('rifle', 0.28 * clamp(1 - cd / 110, 0, 1));
    if (h.world) effects.puff(ox + dx * h.t, oy + dy * h.t, oz + dz * h.t, 'dust', 1);
  }
  if (h.f && !h.f.remote) damage(h.f, 10 * (h.head ? 1.8 : 1), b, h.head);
}
function updateBot(b, dt) {
  if (!b.alive) { if (T >= b.respawnAt && state !== 'ended') spawn(b); return; }
  if (b.invuln > 0) b.invuln -= dt;

  b.idleChatT -= dt;
  if (b.idleChatT <= 0) {
    b.idleChatT = 25 + Math.random() * 40;
    if (Math.random() < 0.35) botSay(b.name, BotChat.gen('idle'));
  }

  b.thinkT -= dt;
  if (b.thinkT <= 0) { b.thinkT = 0.22 + Math.random() * 0.12; acquire(b); }
  b.reactT -= dt;
  b.strafeT -= dt;

  let mx = 0, mz = 0, spd = 0;
  const t = b.target;
  if (t && t.alive && !t.remote) {
    const dx = t.x - b.x, dz = t.z - b.z;
    const dist = Math.hypot(dx, dz) || 1;
    const ux = dx / dist, uz = dz / dist;
    const want = Math.atan2(-dx, -dz);
    b.pitch = clamp(Math.atan2((t.y + 1.1) - (b.y + 1.45), dist), -0.75, 0.75);
    if (b.strafeT <= 0) { b.strafeT = rnd(0.7, 1.8); b.strafe = Math.random() < 0.5 ? -1 : 1; }
    const fw = dist > 26 ? 1 : (dist < 8 ? -0.8 : 0.15);
    mx = ux * fw - uz * b.strafe * 0.9;
    mz = uz * fw + ux * b.strafe * 0.9;
    spd = 4.6;
    b.yaw += angDiff(b.yaw, want) * Math.min(1, dt * 6 * b.skill);
    if (Math.abs(angDiff(b.yaw, want)) < 0.1 && b.reactT <= 0 && T >= b.nextShot && !losBlocked(b.x, b.y + 1.45, b.z, t.x, t.y + 1.1, t.z)) {
      botFire(b, t);
      if (--b.burst <= 0) {
        b.burst = 3 + ((Math.random() * 4) | 0);
        if (Math.random() < 0.45) {
          b.reloadT = 2.0;
          b.reloadDur = 2.0;
          b.nextShot = T + 2.0;
        } else {
          b.nextShot = T + rnd(0.5, 1.1);
        }
      } else b.nextShot = T + 0.14;
    }
  } else {
    b.pitch = 0;
    const dx = b.tx - b.x, dz = b.tz - b.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 3) newWander(b);
    else {
      mx = dx / dist; mz = dz / dist;
      spd = b.sprint ? 7 : 4.4;
      b.yaw += angDiff(b.yaw, Math.atan2(-mx, -mz)) * Math.min(1, dt * 7);
    }
  }

  let dvx = 0, dvz = 0;
  if (spd > 0) { const s = steer(b, mx, mz); dvx = s[0] * spd; dvz = s[1] * spd; }
  const k = Math.min(1, dt * (b.onGround ? 10 : 2));
  b.vx += (dvx - b.vx) * k;
  b.vz += (dvz - b.vz) * k;
  physics(b, dt);
  b.speed = Math.hypot(b.vx, b.vz);
  b.stuckT += dt;
  if (b.stuckT > 1) {
    const moved = Math.hypot(b.x - b.px, b.z - b.pz);
    if (spd > 0 && moved < 0.7) { b.side *= -1; if (b.onGround) b.vy = 7.2; if (!(t && t.alive)) newWander(b); }
    b.px = b.x; b.pz = b.z;
    b.stuckT = 0;
  }
}

/* ================================================================
   ANIMATION
================================================================ */
function syncMeshes(dt) {
  for (const f of fighters) {
    if (f.isPlayer || !f.mesh || !f.bones) continue;
    f.animT += dt;
    const b = f;
    const m = b.mesh;
    m.position.set(b.x, b.y, b.z);
    m.rotation.y = b.yaw;

    const B = b.bones;

    if (b.alive) {
      const moving = b.speed > 0.6 && b.onGround;
      const normSpeed = Math.min(1, b.speed / 8);

      // Walk cycle
      if (moving) {
        b.walk += b.speed * dt * 1.6;
        const swing = Math.sin(b.walk) * 0.85;
        B.upperLegL.rotation.x = swing;
        B.upperLegR.rotation.x = -swing;
        B.lowerLegL.rotation.x = Math.max(0, -swing) * 0.9;
        B.lowerLegR.rotation.x = Math.max(0, swing) * 0.9;
        B.footL.rotation.x = -swing * 0.3;
        B.footR.rotation.x = swing * 0.3;
      } else {
        B.upperLegL.rotation.x *= 0.8;
        B.upperLegR.rotation.x *= 0.8;
        B.lowerLegL.rotation.x *= 0.8;
        B.lowerLegR.rotation.x *= 0.8;
        B.footL.rotation.x *= 0.8;
        B.footR.rotation.x *= 0.8;
      }

      // Torso bob, breathing, and tactical posture
      const walkBob = moving ? Math.abs(Math.sin(b.walk)) * 0.032 : 0;
      const breathe = Math.sin(b.animT * 1.6) * 0.012;
      B.pelvis.position.y = 0.9 + walkBob + breathe;

      // Combat forward lean & bladed stance (right shoulder drawn back)
      B.spine1.rotation.x = moving ? 0.14 : 0.08;
      B.spine2.rotation.y = -0.18;

      // Dynamic aim pitch: upper torso and chest tilt to aim up or down
      const aimPitch = clamp(b.pitch || 0, -0.75, 0.75);
      B.chest.rotation.x = aimPitch;

      // Head compensates so sightline remains forward on target with tactical cheek weld
      B.head.rotation.y = 0.18;
      B.head.rotation.x = 0.05;

      // Firing kick impulse on character
      const timeSinceFire = T - b.lastFire;
      const kick = timeSinceFire < 0.12 ? (1 - timeSinceFire / 0.12) : 0;

      // Reload animation progression
      let reloadProg = 0;
      if (b.reloadT > 0) {
        b.reloadT -= dt;
        reloadProg = 1 - Math.max(0, b.reloadT) / b.reloadDur;
        if (b.reloadT <= 0) b.reloadT = 0;
      }

      // Right arm: firmly cradles and controls weapon pistol grip
      B.upperArmR.rotation.x = -1.18 - kick * 0.14;
      B.upperArmR.rotation.y = -0.22 - kick * 0.05;
      B.upperArmR.rotation.z = -0.26;
      B.lowerArmR.rotation.x = -0.68 - kick * 0.08;
      B.lowerArmR.rotation.y = 0.12;
      B.handR.rotation.x = -0.12;
      B.handR.rotation.y = 0.04;
      B.handR.rotation.z = 0.08;

      // Left arm: realistic 2-handed tactical grip on rifle handguard or reload cycle
      if (reloadProg > 0.12 && reloadProg < 0.85) {
        // Reloading sequence: left hand drops to chest rig pouch and loads fresh mag
        if (reloadProg < 0.45) {
          const p = (reloadProg - 0.12) / 0.33;
          B.upperArmL.rotation.x = lerp(-1.32, -0.35, p);
          B.upperArmL.rotation.y = lerp(0.46, 0.18, p);
          B.lowerArmL.rotation.x = lerp(-0.54, -1.35, p);
        } else if (reloadProg < 0.70) {
          const p = (reloadProg - 0.45) / 0.25;
          B.upperArmL.rotation.x = lerp(-0.35, -1.18, p);
          B.upperArmL.rotation.y = lerp(0.18, 0.44, p);
          B.lowerArmL.rotation.x = lerp(-1.35, -0.72, p);
        } else {
          B.upperArmL.rotation.x = -1.25;
          B.upperArmL.rotation.y = 0.46;
          B.lowerArmL.rotation.x = -0.58;
        }
        B.upperArmR.rotation.x -= 0.18;
        B.upperArmR.rotation.z += 0.20;
      } else {
        // Standard tactical 2-handed C-clamp / foregrip support
        const armSwing = moving ? Math.sin(b.walk) * 0.08 * normSpeed : 0;
        B.upperArmL.rotation.x = -1.32 + armSwing - kick * 0.10;
        B.upperArmL.rotation.y = 0.46;
        B.upperArmL.rotation.z = 0.48;
        B.lowerArmL.rotation.x = -0.54;
        B.lowerArmL.rotation.y = -0.32;
        B.lowerArmL.rotation.z = 0.22;
        B.handL.rotation.x = -0.28;
        B.handL.rotation.z = -0.18;
      }

      // Emote animation overrides
      if (b.emote && b.emoteT > 0) {
        b.emoteT -= dt;
        const total = EMOTES[b.emote].dur;
        const pr = 1 - Math.max(0, b.emoteT) / total;
        const sym = b.emoteSym;
        if (sym) {
          sym.position.y = 2.5 + Math.sin(pr * Math.PI) * 0.3;
          sym.material.opacity = 1 - Math.pow(pr, 3);
          const kk = 1 + Math.sin(pr * Math.PI * 4) * 0.15;
          sym.scale.set(0.9 * kk, 0.9 * kk, 1);
        }
        if (b.emote === 'wave') {
          B.upperArmR.rotation.z = -2.4;
          B.upperArmR.rotation.x = Math.sin(pr * Math.PI * 10) * 0.5;
        } else if (b.emote === 'taunt') {
          B.upperArmL.rotation.z = 2.4;
          B.upperArmR.rotation.z = -2.4;
          const w = Math.sin(pr * Math.PI * 8) * 0.35;
          B.upperArmL.rotation.x = w;
          B.upperArmR.rotation.x = -w;
        } else if (b.emote === 'dance') {
          B.pelvis.rotation.z = Math.sin(pr * Math.PI * 14) * 0.28;
          B.pelvis.rotation.y = Math.sin(pr * Math.PI * 7) * 0.35;
        } else if (b.emote === 'celebrate') {
          B.upperArmL.rotation.z = 2.7;
          B.upperArmR.rotation.z = -2.7;
          B.pelvis.position.y += Math.abs(Math.sin(pr * Math.PI * 4)) * 0.25;
        }
        if (b.emoteT <= 0) stopEmote(b);
      }

      const d = Math.hypot(b.x - camera.position.x, b.z - camera.position.z);
      b.label.visible = d < 60 && !b.remote;
    } else {
      // Realistic procedural ragdoll death collapse
      b.deathT += dt;
      const dt_ = b.deathT;
      m.position.set(b.x, b.y, b.z);

      const collapseT = Math.min(1, dt_ / 0.65);
      const easeCollapse = collapseT * collapseT;
      B.pelvis.position.y = lerp(0.9, 0.18, easeCollapse);

      if (b.deathKind === 'head') {
        // Headshot: Violent backward whip, spine extension, backward collapse
        const snapT = Math.min(1, dt_ / 0.4);
        B.head.rotation.x = -snapT * 0.85;
        B.head.rotation.y = snapT * 0.45;
        B.spine1.rotation.x = -snapT * 0.45;
        B.spine2.rotation.x = -snapT * 0.35;

        const rollT = Math.min(1, dt_ / 0.85);
        m.rotation.x = lerp(0, 1.48, rollT);
        m.rotation.z = lerp(0, 0.45, rollT);

        B.upperLegL.rotation.x = lerp(0, 0.6, rollT);
        B.lowerLegL.rotation.x = lerp(0, 0.3, rollT);
        B.upperLegR.rotation.x = lerp(0, -0.5, rollT);
        B.lowerLegR.rotation.y = lerp(0, 0.4, rollT);
      } else {
        // Bodyshot: Forward stumble, knee buckle, forward sprawl onto ground
        const crumpleT = Math.min(1, dt_ / 0.5);
        B.head.rotation.x = crumpleT * 0.5;
        B.spine1.rotation.x = crumpleT * 0.6;
        B.spine1.rotation.z = crumpleT * 0.35;

        B.upperLegL.rotation.x = lerp(0, 1.35, crumpleT);
        B.lowerLegL.rotation.x = lerp(0, -1.75, crumpleT);
        B.upperLegR.rotation.x = lerp(0, -0.65, crumpleT);
        B.lowerLegR.rotation.x = lerp(0, 0.95, crumpleT);

        const sprawlT = Math.min(1, Math.max(0, (dt_ - 0.30) / 0.55));
        m.rotation.x = lerp(0, -1.42, sprawlT);
        m.rotation.z = lerp(0, 0.38, sprawlT);
      }

      // Limbs go limp into ragdoll sprawl
      const limpT = Math.min(1, dt_ / 0.6);
      B.upperArmL.rotation.set(0.4 * limpT, 0.2 * limpT, 1.15 * limpT);
      B.lowerArmL.rotation.set(0.3 * limpT, 0, 0);
      B.upperArmR.rotation.set(-0.35 * limpT, -0.2 * limpT, -1.10 * limpT);
      B.lowerArmR.rotation.set(0.4 * limpT, 0, 0);

      // Weapon drops loose from hand
      if (b.gun) {
        const dropT = Math.min(1, dt_ / 0.45);
        b.gun.group.position.y = lerp(-0.01, -0.75, dropT);
        b.gun.group.position.z = lerp(-0.12, 0.35, dropT);
        b.gun.group.rotation.x = lerp(-Math.PI / 2, 0.25, dropT);
        b.gun.group.rotation.z = lerp(0, 1.45, dropT);
      }

      // Blood puddle decal & dust puff upon impact with floor
      if (!b.deathDecalSpawned && dt_ >= 0.45) {
        b.deathDecalSpawned = true;
        effects.puff(b.x, b.y + 0.1, b.z, 'dust', 3);
        effects.decal(new THREE.Vector3(b.x, b.y + 0.02, b.z), new THREE.Vector3(0, 1, 0));
        effects.puff(b.x, b.y + 0.15, b.z, 'blood', 2);
      }

      b.label.visible = false;
      if (b.deathT > 3.8) m.visible = false;
    }
  }
}

/* ================================================================
   HUD
================================================================ */
function showHit(head, kill) {
  const h = $('hitm');
  h.className = 'show' + (head ? ' head' : '') + (kill ? ' kill' : '');
  P.hitT = kill ? 0.3 : 0.14;
}

function showDmgDir(ax, az) {
  const fx_ = -Math.sin(yaw), fz_ = -Math.cos(yaw);
  const rx = Math.cos(yaw), rz = -Math.sin(yaw);
  const dx = ax - player.x, dz = az - player.z;
  const a = Math.atan2(dx * rx + dz * rz, dx * fx_ + dz * fz_);
  $('dmgdir').style.transform = 'rotate(' + a + 'rad)';
  P.dmgDirT = 1.1;
}

function sortedFighters() {
  return fighters.slice().sort((a, b) => b.kills - a.kills || a.deaths - b.deaths || a.name.localeCompare(b.name));
}

function renderBoard() {
  const s = sortedFighters();
  $('brows').innerHTML = s.map((f, i) => {
    const kd = f.deaths ? (f.kills / f.deaths).toFixed(2) : f.kills.toFixed(2);
    return '<tr class="' + (f.isPlayer ? 'me ' : '') + (f.alive ? '' : 'dead ') + (i === 0 ? 'top' : '') + '">' +
      '<td class="c rk">' + (i + 1) + '</td>' +
      '<td>' + esc(f.name) + (f.isPlayer ? ' (you)' : '') + '</td>' +
      '<td class="n">' + f.kills + '</td>' +
      '<td class="n">' + f.deaths + '</td>' +
      '<td class="n">' + kd + '</td>' +
      '<td class="c"><span class="st"></span></td></tr>';
  }).join('');
  $('btimer').textContent = statusText();
}

// Radar
const rctx = $('radar').getContext('2d');
const RS = 150, RR = 80, RK = RS / 2 / RR;
function drawRadar() {
  const g = rctx;
  g.clearRect(0, 0, RS, RS);
  g.save();
  g.beginPath(); g.arc(RS / 2, RS / 2, RS / 2 - 1, 0, TAU); g.clip();
  g.fillStyle = 'rgba(14,24,32,.88)'; g.fillRect(0, 0, RS, RS);
  g.translate(RS / 2, RS / 2);
  g.rotate(yaw);
  g.scale(RK, RK);
  g.translate(-player.x, -player.z);
  g.fillStyle = 'rgba(255,255,255,.06)';
  g.fillRect(-6, -MAP, 12, MAP * 2);
  g.fillRect(-MAP, -6, MAP * 2, 12);
  const cand = queryGrid(player.x, player.z, RR);
  g.fillStyle = 'rgba(170,190,205,.5)';
  for (const b of cand) {
    if (b.y0 > 1 || b.y1 < 1.2) continue;
    g.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
  }
  g.fillStyle = '#43e0a0';
  for (const m of medkits) {
    if (m.active && Math.hypot(m.x - player.x, m.z - player.z) < RR) {
      g.beginPath(); g.arc(m.x, m.z, 2.2 / RK * 1.6, 0, TAU); g.fill();
    }
  }
  g.fillStyle = '#ff4d4d';
  for (const f of fighters) {
    if (f === player || !f.alive) continue;
    const d = Math.hypot(f.x - player.x, f.z - player.z);
    if (d < 40 || (T - f.lastFire < 2 && d < RR)) {
      g.beginPath(); g.arc(f.x, f.z, 3.2 / RK, 0, TAU); g.fill();
    }
  }
  g.restore();
  g.fillStyle = '#6fe3ff';
  g.beginPath();
  g.moveTo(RS / 2, RS / 2 - 8);
  g.lineTo(RS / 2 + 6, RS / 2 + 6);
  g.lineTo(RS / 2 - 6, RS / 2 + 6);
  g.closePath();
  g.fill();
}

/* ================================================================
   INPUT
================================================================ */
function requestLock(first) {
  starting = !!first;
  try {
    const r = canvasEl.requestPointerLock && canvasEl.requestPointerLock();
    if (r && r.catch) r.catch(() => {});
    if (!canvasEl.requestPointerLock && first) fallback = true;
  } catch { if (first) fallback = true; }
  if (first) setTimeout(() => { starting = false; syncPause(); }, 900);
}

function syncPause() {
  const pz = paused();
  $('pause').classList.toggle('hidden', !pz);
  if (pz) {
    $('pauseT').textContent = mode === 'multi' ? 'Mouse released' : 'Paused';
    $('pauseS').textContent = mode === 'multi' ? 'The arena is still live. Click to jump back in' : 'Click anywhere to jump back in';
  }
}

function paused() {
  return (state === 'playing' || state === 'dead') && !locked && !fallback && !starting && !chatOpen;
}

function openChat() {
  chatOpen = true;
  $('chatbar').classList.remove('hidden');
  $('chatinput').value = '';
  setTimeout(() => $('chatinput').focus(), 10);
}
function closeChat() {
  chatOpen = false;
  $('chatbar').classList.add('hidden');
  $('chatinput').blur();
  if (state === 'playing' && $('adminPrompt').classList.contains('hidden') && canvasEl.requestPointerLock) canvasEl.requestPointerLock();
}
function sendChat() {
  const raw = $('chatinput').value.trim();
  closeChat();
  if (!raw) return;
  if (raw === '/admin' || raw === '/admin ') {
    if (player.name === 'NoDeX') showAdminPrompt();
    else chatLine(null, 'Unknown command.', true);
    return;
  }
  if (mode === 'multi' && net.ws && net.ws.readyState === 1) net.ws.send(JSON.stringify({ t: 'chat', m: raw }));
  else chatLine(player.name, raw);
}

function showAdminPrompt() {
  $('adminPrompt').classList.remove('hidden');
  $('adminPass').value = '';
  $('adminMsg').textContent = '';
  if (document.pointerLockElement) document.exitPointerLock();
  setTimeout(() => $('adminPass').focus(), 30);
}
function hideAdminPrompt() {
  $('adminPrompt').classList.add('hidden');
  if (state === 'playing' && !chatOpen && !fallback) canvasEl.requestPointerLock && canvasEl.requestPointerLock();
}

function doEmote(name) {
  if (state !== 'playing' || !player.alive) return;
  if (!EMOTES[name]) return;
  startEmote(player, name);
  P.kick = Math.max(P.kick, 0.5);
  if (mode === 'multi' && net.ws && net.ws.readyState === 1) net.ws.send(JSON.stringify({ t: 'emote', e: name }));
}

/* ================================================================
   MATCH START/STOP
================================================================ */
function resetMatch() {
  for (const f of fighters) { f.kills = 0; f.deaths = 0; f.alive = false; }
  for (const f of fighters) spawn(f);
  P.ammo = WEAPONS.map(w => w.mag);
  P.reload = 0; P.heat = 0; P.adsT = 0; P.kick = 0; P.swap = 0;
  P.recoilX = 0; P.recoilY = 0; P.lastHitAt = T;
  camera.fov = BASE_FOV;
  camera.updateProjectionMatrix();
  camera.rotation.z = 0;
  setGun(0);
  P.swap = 0;
  matchActive = true;
  feedItems.length = 0;
  renderFeed();
  cache.mk = cache.mr = null;
}

function startGame(m) {
  initAudio();
  const nm = ($('name').value || '').trim().slice(0, 14);
  player.name = nm || (m === 'multi' ? 'Player' + (100 + ((Math.random() * 900) | 0)) : 'You');
  try {
    localStorage.setItem('shotline.name', nm);
    localStorage.setItem('shotline.sens', String($('sens').value));
    localStorage.setItem('shotline.gfx', $('gfx').value);
  } catch {}
  sensSetting = +$('sens').value;
  applyGfx($('gfx').value);
  stopNet();
  mode = m;
  useBots(m === 'single');
  resetMatch();
  $('menumsg').textContent = '';
  $('menu').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('board').classList.add('hidden');
  $('death').classList.add('hidden');
  $('chatlog').innerHTML = '';
  $('btitle').textContent = 'Leaderboard';
  $('bsub').textContent = m === 'multi' ? 'Endless online' : 'Endless practice';
  $('goal').textContent = m === 'multi' ? 'Fallen City · Tab · Enter to chat' : 'Fallen City · Tab';
  gunRoot.visible = true;
  state = 'playing';
  mouseL = mouseR = false;
  requestLock(true);
  syncPause();
  toast(m === 'multi' ? 'Connecting…' : 'Fight!', 'warn');
  if (m === 'multi') {
    connectArena(1);
    const checkMap = setInterval(() => {
      if (net.ws && net.ws.readyState === 1) { uploadMap(); clearInterval(checkMap); }
      if (!net.ws) clearInterval(checkMap);
    }, 200);
  }
}

function leaveMatch(msg) {
  stopNet();
  mode = 'menu';
  state = 'menu';
  matchActive = false;
  useBots(true);
  player.alive = false;
  player.hp = 100;
  $('hud').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('death').classList.add('hidden');
  $('board').classList.add('hidden');
  $('scope').classList.add('hidden');
  $('chatlog').innerHTML = '';
  closeChat();
  hideAdminPrompt();
  $('menu').classList.remove('hidden');
  $('menumsg').textContent = msg || '';
  gunRoot.visible = false;
  effects.muzzleLight.intensity = 0;
  mouseL = mouseR = false;
  camera.rotation.set(0, 0, 0);
  camera.fov = 62;
  camera.updateProjectionMatrix();
  try { if (document.exitPointerLock) document.exitPointerLock(); } catch {}
}

/* ================================================================
   EVENT BINDINGS
================================================================ */
$('playSolo').addEventListener('click', () => startGame('single'));
$('playMulti').addEventListener('click', () => startGame('multi'));
$('leave').addEventListener('click', e => { e.stopPropagation(); leaveMatch(); });
$('respawnBtn').addEventListener('click', () => { doRespawn(); });
$('pause').addEventListener('click', () => requestLock(false));

document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvasEl;
  if (locked) starting = false;
  syncPause();
});
document.addEventListener('pointerlockerror', () => {
  if (starting) {
    fallback = true;
    starting = false;
    document.body.classList.add('fb');
    toast('Pointer lock blocked — using cursor mode', 'warn');
  }
  syncPause();
});
document.addEventListener('mousemove', e => {
  if (state !== 'playing') return;
  if (!(locked || fallback) || chatOpen) return;
  if (!$('adminPrompt').classList.contains('hidden')) return;
  const s = (0.0008 + sensSetting * 0.00028) * (camera.fov / BASE_FOV);
  const dx = e.movementX || 0, dy = e.movementY || 0;
  yaw -= dx * s;
  pitch = clamp(pitch - dy * s, -1.5, 1.5);
  P.swayX = clamp(P.swayX - dx * 0.0002, -0.03, 0.03);
  P.swayY = clamp(P.swayY + dy * 0.0002, -0.03, 0.03);
});
document.addEventListener('mousedown', e => {
  if (chatOpen || !$('adminPrompt').classList.contains('hidden')) return;
  if (state !== 'playing' || paused()) return;
  if (e.button === 0) { mouseL = true; mousePressed = true; }
  if (e.button === 2) mouseR = true;
  e.preventDefault();
});
document.addEventListener('mouseup', e => {
  if (e.button === 0) mouseL = false;
  if (e.button === 2) mouseR = false;
});
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('wheel', e => {
  if (state !== 'playing' || paused() || chatOpen) return;
  const n = WEAPONS.length;
  const i = (P.cur + (e.deltaY > 0 ? 1 : -1) + n) % n;
  if (i !== P.cur) setGun(i);
}, { passive: true });

document.addEventListener('keydown', e => {
  if (chatOpen) return;
  if (!$('adminPrompt').classList.contains('hidden')) return;
  if (e.code === 'Tab') {
    e.preventDefault();
    if (state === 'playing' || state === 'dead') { renderBoard(); $('board').classList.remove('hidden'); }
    return;
  }
  if (e.code === 'Enter' && (state === 'playing' || state === 'dead')) { e.preventDefault(); openChat(); return; }
  if (e.code === 'KeyZ' && state === 'playing' && !paused()) { e.preventDefault(); doEmote('wave'); return; }
  if (e.code === 'KeyX' && state === 'playing' && !paused()) { e.preventDefault(); doEmote('taunt'); return; }
  if (e.code === 'KeyC' && state === 'playing' && !paused()) { e.preventDefault(); doEmote('dance'); return; }
  if (e.code === 'KeyV' && state === 'playing' && !paused()) { e.preventDefault(); doEmote('celebrate'); return; }
  if (state === 'playing' || state === 'dead') {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  }
  keys[e.code] = true;
  if (state === 'playing' && !paused() && !e.repeat) {
    const n = parseInt(e.code.replace('Digit', ''), 10);
    if (!isNaN(n) && n >= 1 && n <= WEAPONS.length) setGun(n - 1);
  }
});
document.addEventListener('keyup', e => {
  if (e.code === 'Tab') { e.preventDefault(); $('board').classList.add('hidden'); return; }
  keys[e.code] = false;
});
window.addEventListener('blur', () => {
  for (const k in keys) keys[k] = false;
  mouseL = mouseR = false;
  $('board').classList.add('hidden');
});

$('chatinput').addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Escape') closeChat();
  else if (e.key === 'Enter') { e.preventDefault(); sendChat(); }
});
$('adminOk').addEventListener('click', () => {
  const pass = $('adminPass').value;
  if (!pass) { $('adminMsg').textContent = 'Enter a password.'; return; }
  if (!net.ws || net.ws.readyState !== 1) { $('adminMsg').textContent = 'Not connected.'; return; }
  net.ws.send(JSON.stringify({ t: 'admin', pass }));
  $('adminMsg').textContent = 'Transmitting…';
});
$('adminCancel').addEventListener('click', hideAdminPrompt);
$('adminPass').addEventListener('keydown', e => {
  e.stopPropagation();
  if (e.key === 'Enter') { e.preventDefault(); $('adminOk').click(); }
  else if (e.key === 'Escape') hideAdminPrompt();
});
$('gfx').addEventListener('change', () => applyGfx($('gfx').value));

try {
  const n = localStorage.getItem('shotline.name'); if (n) $('name').value = n;
  const s = localStorage.getItem('shotline.sens'); if (s) $('sens').value = s;
  const gq = localStorage.getItem('shotline.gfx'); if (gq) $('gfx').value = gq;
} catch {}
applyGfx($('gfx').value);

/* ================================================================
   MAIN LOOP
================================================================ */
let lastMs = performance.now();
let hudT = 0;
let menuAng = 0;
let stepAccum = 0;

function step(dt) {
  T += dt;

  if (state === 'menu') {
    menuAng += dt * 0.06;
    camera.position.set(Math.cos(menuAng) * 220, 70, Math.sin(menuAng) * 220);
    camera.lookAt(0, 3, 0);
    camera.updateMatrixWorld(true);
    if (camera.fov !== 62) { camera.fov = 62; camera.updateProjectionMatrix(); }
  } else if (state === 'playing') {
    updatePlayer(dt);
  } else if (state === 'dead') {
    updateDeadCamera(dt);
  }

  // Bots
  for (let i = 1; i < fighters.length; i++) {
    const f = fighters[i];
    if (f.isBot) updateBot(f, dt);
  }
  if (remotes.size) updateRemotes(dt);

  // Push-apart fighters
  for (let i = 0; i < fighters.length; i++) {
    const a = fighters[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < fighters.length; j++) {
      const b = fighters[j];
      if (!b.alive || Math.abs(a.y - b.y) > 1.6 || (a.remote && b.remote)) continue;
      const dx = b.x - a.x, dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.64 && d2 > 1e-6) {
        const d = Math.sqrt(d2), p = (0.8 - d) / 2 / d;
        if (!a.remote) { a.x -= dx * p; a.z -= dz * p; }
        if (!b.remote) { b.x += dx * p; b.z += dz * p; }
      }
    }
  }

  syncMeshes(dt);
  effects.update(dt);

  // Sun follows player for shadows
  const cx = camera.position.x, cz = camera.position.z;
  sun.target.position.set(cx, 0, cz);
  sun.position.set(cx + 80, 140, cz + 50);

  // HUD
  if (state === 'playing' || state === 'dead') {
    const hp = Math.max(0, Math.ceil(player.hp));
    setText('hpnum', String(hp));
    const hf = $('hpfill');
    hf.style.width = hp + '%';
    hf.classList.toggle('low', hp <= 30);
    setText('mag', String(P.ammo[P.cur]));
    $('mag').classList.toggle('empty', P.ammo[P.cur] === 0);
    setText('reloadmsg', P.reload > 0 ? 'Reloading…' : (P.ammo[P.cur] === 0 ? 'Press R to reload' : ''));
    setText('timer', statusText());

    if (P.hitT > 0) { P.hitT -= dt; if (P.hitT <= 0) $('hitm').className = ''; }
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').className = ''; }
    if (P.dmgT > 0) P.dmgT -= dt;
    if (P.dmgDirT > 0) P.dmgDirT -= dt;
    $('dmgdir').style.opacity = Math.max(0, Math.min(1, P.dmgDirT * 1.3)).toFixed(2);
    const low = hp > 0 && hp <= 30 ? 0.25 + 0.15 * Math.sin(T * 6) : 0;
    $('vig').style.opacity = Math.min(1, Math.max(0, P.dmgT) * 1.4 + low).toFixed(2);
    if (feedItems.length && T - feedItems[0].t > 6) { feedItems.shift(); renderFeed(); }

    hudT -= dt;
    if (hudT <= 0) {
      hudT = 0.25;
      const s = sortedFighters();
      setText('mk', String(player.kills));
      setText('mr', String(s.indexOf(player) + 1));
      setText('mn', String(fighters.filter(f => f.alive || f.isPlayer).length));
      if (!$('board').classList.contains('hidden')) renderBoard();
    }
    if (state !== 'dead') drawRadar();
  }
}

function frame(ms) {
  requestAnimationFrame(frame);
  let dt = clamp((ms - lastMs) / 1000, 0, 0.05);
  lastMs = ms;
  if (paused() && mode !== 'multi') dt = 0;
  step(dt);
  if (gradePass) gradePass.uniforms.time.value = T * 1000;
  if (composer) composer.render();
  else renderer.render(scene, camera);
}

/* ================================================================
   BOOT
================================================================ */
setLoad(0.95, 'booting');

// Pre-create player + bot actors
makeActor(player);
for (const b of botPool) makeActor(b);

// Spawn bots so the menu backdrop has life
fighters.length = 0;
fighters.push(player);
for (const b of botPool) { fighters.push(b); spawn(b); }
player.alive = false;

// Initial camera
camera.position.set(0, 30, 60);
camera.lookAt(0, 3, 0);

renderBoard();
setLoad(1, 'ready');
setTimeout(() => {
  loadEl.style.opacity = '0';
  setTimeout(() => loadEl.classList.add('hidden'), 500);
  $('menu').classList.remove('hidden');
}, 250);

requestAnimationFrame(frame);
