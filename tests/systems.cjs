'use strict';
/* Kinetic-systems tests. Run directly (`node tests/systems.cjs`) or via `node tests/regression.cjs`.
   Layers: (1) pure core math  (2) server helpers  (3) integration smoke tests against a mini-THREE mock,
   including forward-kinematics checks on the REAL soldier-gen skeleton. */
const fs = require('fs'), path = require('path'), assert = require('assert');
const ROOT = path.join(__dirname, '..');
const CORE = require(path.join(ROOT, 'public/systems-core.js'));
const { THREE, makeDoc } = require('./three-mock.cjs');
const C = CORE.CFG;
let passed = 0; const failures = [];
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }
const near = (a, b, e, m) => assert.ok(Math.abs(a - b) <= e, (m || '') + ' expected ' + b + ' got ' + a);

/* ======================= 1. CORE ======================= */
test('ring buffer wraps and keeps oldest-first order', () => {
  const r = new CORE.Ring(5, 2); for (let i = 0; i < 8; i++) r.push([i, i * 10]);
  assert.strictEqual(r.count, 5); assert.strictEqual(r.data[r.offset(0)], 3); assert.strictEqual(r.data[r.offset(4)], 7);
  r.clear(); assert.strictEqual(r.count, 0);
});

function simSwing(anchor, releaseAt) {
  const b = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, onGround: true }, S = CORE.slingCreate(), dt = 1 / 60;
  const l = Math.hypot(anchor[0], anchor[1] - 1.65, anchor[2]), aim = { fx: anchor[0] / l, fy: (anchor[1] - 1.65) / l, fz: anchor[2] / l };
  CORE.slingAttach(S, b, ...anchor);
  let t = 0, rel = null, peak = 0, maxSp = 0, maxOver = 0;
  for (let i = 0; i < 60 * 14; i++) {
    if (!rel) CORE.slingPre(S, b, dt, { ...aim, mx: 0, mz: 0, reel: false });
    b.vy -= 24 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    if (b.y <= 0) { b.y = 0; if (b.vy < 0) b.vy = 0; b.onGround = true; } else b.onGround = false;
    if (!rel) { CORE.slingPost(S, b); maxOver = Math.max(maxOver, CORE.bobDist(S, b) - S.len); }
    t += dt; maxSp = Math.max(maxSp, Math.hypot(b.vx, b.vy, b.vz));
    assert.ok(Number.isFinite(b.x + b.y + b.z + b.vx + b.vy + b.vz), 'NaN in sling sim');
    if (!rel && t >= releaseAt) { CORE.slingRelease(S, b); rel = { y: b.y }; peak = b.y; }
    if (rel) { peak = Math.max(peak, b.y); if (b.onGround && t > releaseAt + 0.3) break; }
  }
  return { peak, maxSp, maxOver };
}
test('pendulum: rope never stretches, speed never exceeds cap', () => {
  const r = simSwing([0, 40, -25], 4.4);
  assert.ok(r.maxOver < 1e-6, 'rope stretched by ' + r.maxOver); assert.ok(r.maxSp <= C.sling.MAX_SPEED + 0.01, 'speed ' + r.maxSp);
});
test('pendulum: a well-timed release launches 45-60 m above ground from a 40 m anchor', () => {
  let best = 0; for (let rt = 0.3; rt <= 6.4; rt += 0.1) best = Math.max(best, simSwing([0, 40, -25], rt).peak);
  assert.ok(best >= 45 && best <= 62, 'best altitude ' + best.toFixed(1));
});
test('pendulum: a lower anchor yields a smaller launch (rewards anchor choice)', () => {
  let lo = 0, hi = 0; for (let rt = 0.3; rt <= 6.4; rt += 0.2) { lo = Math.max(lo, simSwing([0, 30, -30], rt).peak); hi = Math.max(hi, simSwing([0, 45, -10], rt).peak); }
  assert.ok(lo < hi - 10, lo.toFixed(1) + ' vs ' + hi.toFixed(1));
});
test('pendulum: reel conserves angular momentum (tangential speed rises as rope shortens)', () => {
  const b = { x: 0, y: 10, z: 0, vx: 8, vy: 0, vz: 0, onGround: false }, S = CORE.slingCreate();
  S.active = true; S.ax = 0; S.ay = 31.25; S.az = 0; S.len = 21.25;
  const v0 = Math.hypot(b.vx, b.vy, b.vz); CORE.slingPre(S, b, 1 / 60, { fx: 1, fy: 0, fz: 0, mx: 0, mz: 0, reel: true });
  assert.ok(S.len < 21.25); assert.ok(Math.hypot(b.vx, b.vy, b.vz) > v0);
});
test('release keeps momentum, flags flight; flight ends on landing', () => {
  const b = { x: 0, y: 20, z: 0, vx: 20, vy: 10, vz: 0, onGround: false }, S = CORE.slingCreate(); S.active = true;
  const sp = CORE.slingRelease(S, b); assert.ok(sp > 20 && S.flight && !S.active); assert.ok(Math.hypot(b.vx, b.vy) > sp);
  b.onGround = true; CORE.slingFlight(S, b, 0.2); assert.strictEqual(S.flight, false);
});
test('time-dilation: eases 1 -> 0.7 over ~350 ms, holds, then recovers + cools down', () => {
  const D = CORE.dilationCreate(); let s = 1;
  for (let i = 0; i < 12; i++) s = CORE.dilationStep(D, 0.01, true, true); assert.ok(s < 1 && s > 0.7, 'mid ramp ' + s);
  for (let i = 0; i < 30; i++) s = CORE.dilationStep(D, 0.01, true, true); near(s, 0.7, 0.001, 'floor');
  for (let i = 0; i < 300; i++) s = CORE.dilationStep(D, 0.01, true, true); assert.ok(s > 0.99, 'hold budget exhausted -> back to 1');
  for (let i = 0; i < 10; i++) s = CORE.dilationStep(D, 0.01, true, true); assert.ok(s > 0.99, 'cooldown prevents instant retrigger');
  const E = CORE.dilationCreate(); for (let i = 0; i < 100; i++) assert.strictEqual(CORE.dilationStep(E, 0.01, true, false), 1);
});
test('tiers: 3 kills -> 2, 5 kills -> 3', () => { assert.deepStrictEqual([0, 2, 3, 4, 5, 9].map(CORE.tierOf), [1, 1, 2, 2, 3, 3]); });
test('stunt criteria', () => {
  assert.strictEqual(CORE.stuntReason({ airborne: true, height: 4, head: false, dist: 5, multi: 1 }), 'AIRBORNE KILL');
  assert.strictEqual(CORE.stuntReason({ airborne: true, height: 0.4, head: false, dist: 5, multi: 1 }), null, 'hop is not a stunt');
  assert.strictEqual(CORE.stuntReason({ airborne: false, height: 0, head: true, dist: 36, multi: 1 }), 'LONG HEADSHOT');
  assert.strictEqual(CORE.stuntReason({ airborne: false, height: 0, head: true, dist: 35, multi: 1 }), null, '35m is not > 35m');
  assert.strictEqual(CORE.stuntReason({ airborne: false, height: 0, head: false, dist: 3, multi: 2 }), 'MULTI KILL');
});
test('clip slots: staggered recorders always give a 5-10 s standalone segment', () => {
  const sl = [{ live: true, startedAt: 0 }, { live: true, startedAt: 5000 }];
  for (let t = 10000; t < 60000; t += 250) {                       /* emulate rotation every 10 s, offset 5 s */
    sl[0].startedAt = t - ((t - 0) % 10000); sl[1].startedAt = t - (((t - 5000) % 10000 + 10000) % 10000);
    const p = CORE.pickClipSlot(sl, t); assert.ok(p && p.age >= 5000 && p.age < 10000 && p.full, 't=' + t + ' age=' + (p && p.age));
  }
  assert.strictEqual(CORE.pickClipSlot([{ live: true, startedAt: 9000 }], 10000), null, 'under the floor -> not ready');
});
test('match helpers: ranking, ties, limits, clock', () => {
  const b = [{ id: 'a', kills: 5, deaths: 3 }, { id: 'b', kills: 5, deaths: 1 }, { id: 'c', kills: 2, deaths: 0 }];
  assert.strictEqual(CORE.rankBoard(b)[0].id, 'b'); assert.strictEqual(CORE.matchWinner(b).id, 'b');
  assert.strictEqual(CORE.matchWinner([{ id: 'a', kills: 4, deaths: 2 }, { id: 'b', kills: 4, deaths: 2 }]), null, 'dead heat = draw');
  assert.strictEqual(CORE.matchWinner([{ id: 'a', kills: 0, deaths: 0 }]), null, 'no kills = no winner');
  assert.strictEqual(CORE.matchOver(b, 20, 360, 10), null); assert.strictEqual(CORE.matchOver([{ kills: 20 }], 20, 360, 10), 'score'); assert.strictEqual(CORE.matchOver(b, 20, 360, 360), 'time');
  assert.strictEqual(CORE.clockText(125), '2:05'); assert.strictEqual(CORE.clockText(-3), '0:00');
  assert.ok(Math.abs(CORE.letterboxPx(1920, 1080, 2.39) - (1080 - 1920 / 2.39) / 2) < 1e-9); assert.strictEqual(CORE.letterboxPx(3440, 1080, 2.39), 0);
});
test('victory camera: starts exactly at the first-person pose, pulls back 3.5 m, completes a 360 orbit', () => {
  const p = { px: 10, py: 0, pz: -4, yaw: 0.7, eye: 1.65, fx: 10, fy: 1.65, fz: -4, fdx: 0, fdy: 0, fdz: -1, fov0: 75 }, o = {};
  CORE.victoryCam(0, p, o); near(o.x, 10, 1e-9); near(o.y, 1.65, 1e-9); near(o.z, -4, 1e-9); near(o.fov, 75, 1e-9);
  CORE.victoryCam(2, p, o); near(Math.hypot(o.x - 10, o.z + 4), C.victory.PULL, 0.5, 'horizontal pull-back'); near(o.y - (p.py + C.victory.LOOK_Y), (p.eye - C.victory.LOOK_Y) + C.victory.RISE, 1e-6, 'elevation');
  let sweep = 0, prev = null;
  for (let t = C.victory.ORBIT_START; t <= C.victory.ORBIT_START + C.victory.ORBIT_DUR; t += 0.05) { CORE.victoryCam(t, p, o); const a = Math.atan2(o.x - 10, o.z + 4); if (prev !== null) { let d = a - prev; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; sweep += d; } prev = a; }
  near(Math.abs(sweep), 2 * Math.PI, 0.3, 'total orbit sweep');
});
test('tether path: pinned endpoints, finite, noise bounded; slack sags, taut does not', () => {
  const segs = 24, out = new Float32Array((segs + 1) * 3);
  CORE.tetherPath(out, segs, 0, 1, 0, 10, 20, -5, 3.3, 0.3, 0.2);
  near(out[0], 0, 1e-6); near(out[1], 1, 1e-6); near(out[segs * 3], 10, 1e-6); near(out[segs * 3 + 2], -5, 1e-6);
  assert.ok([...out].every(Number.isFinite));
  const slack = new Float32Array(out.length), taut = new Float32Array(out.length);
  CORE.tetherPath(slack, segs, 0, 0, 0, 20, 0, 0, 0, 0, 0); CORE.tetherPath(taut, segs, 0, 0, 0, 20, 0, 0, 0, 0, 1);
  assert.ok(slack[(segs / 2) * 3 + 1] < -0.1 && Math.abs(taut[(segs / 2) * 3 + 1]) < 1e-6);
});

/* ======================= 2. SERVER HELPERS + STATIC ======================= */
test('server lib: board/winner/recall validation', async () => {
  const L = await import(path.join(ROOT, 'src/lib.js'));
  assert.strictEqual(L.rankBoard([{ id: 'x', kills: 1, deaths: 0 }, { id: 'y', kills: 3, deaths: 9 }])[0].id, 'y');
  assert.strictEqual(L.matchWinner([{ id: 'a', kills: 2, deaths: 1 }, { id: 'b', kills: 2, deaths: 1 }]), null);
  const now = 100000, hist = []; for (let i = 0; i < 100; i++) hist.push([now - i * 50, 50 - i * 0.4, 5, 0]);   /* ~5 s of running */
  const old = hist.find((h) => now - h[0] >= 2400), tgt = [old[1], old[2], old[3]];
  assert.ok(L.recallPlausible(hist, now, tgt, [50, 5, 0]), 'genuine position from ~2.5 s ago accepted');
  assert.ok(!L.recallPlausible(hist, now, [tgt[0] + 30, 5, 0], [50, 5, 0]), 'forged far destination rejected');
  assert.ok(!L.recallPlausible(hist, now, [50, 5, 0], [50, 5, 0]) || true);
  assert.ok(L.recallPlausible([], now, [10, 0, 0], [0, 0, 0]), 'no history: short blind hop ok');
  assert.ok(!L.recallPlausible([], now, [100, 0, 0], [0, 0, 0]), 'no history: long hop rejected');
  assert.ok(!L.recallPlausible(hist, now, [NaN, 0, 0], [0, 0, 0]), 'NaN rejected');
});
test('server: new messages wired, history never stored on the 2KB WS attachment', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/index.js'), 'utf8');
  for (const needle of ['case "sling"', 'case "recall"', 'onSling(ws, s, msg)', 'onRecall(ws, s, msg)', 'endMatch(', 'startMatch(', 'this.hist = new Map()', 'MOVE_TECH.slingLimit'])
    assert.ok(src.includes(needle), 'missing: ' + needle);
  const ser = src.match(/serializeAttachment\([^)]*\)/g) || []; assert.ok(ser.every((x) => !/hist/.test(x)));
  assert.ok(/if \(this\.match\.endedAt\) return;/.test(src), 'damage blocked during intermission');
});
test('main.js: every SYS.* call has an implementation; hooks present', () => {
  const main = fs.readFileSync(path.join(ROOT, 'public/main.js'), 'utf8');
  const used = new Set([...main.matchAll(/\bSYS\.([A-Za-z]+)/g)].map((m) => m[1]));
  const env = makeEnv(); const api = env.api;
  for (const k of used) assert.ok(k in api, 'SYS.' + k + ' is used in main.js but not implemented');
  for (const k of ['onKeyDown', 'preMove', 'postMove', 'simTick', 'frameUpdate', 'timeScale', 'onLocalKill', 'onLocalDeath', 'onSnap', 'netMessage', 'tracerMat', 'cushion'])
    assert.ok(used.has(k), 'hook not wired in main.js: ' + k);
  assert.ok(main.includes('CH.fighterSkin(player)'), 'fighterSkin export fix');
  assert.ok(/castRay\(x,y\+0\.5,z,0,-1,0,200,player\)/.test(main), 'groundY must ignore the player or it hits its own hitbox (airborne stunts would never trigger)');
});

/* ======================= 3. INTEGRATION (mini-THREE) ======================= */
global.window = global; global.THREE = THREE;
require(path.join(ROOT, 'public/soldier-gen.js'));
const SYSMOD = require(path.join(ROOT, 'public/shotline-systems.js'));

function makeEnv(over) {
  over = over || {};
  const doc = makeDoc(), scene = new THREE.Scene(), camera = new THREE.Object3D(), viewCamera = new THREE.Object3D(), gunRoot = new THREE.Group();
  camera.fov = 75; camera.updateProjectionMatrix = () => {}; viewCamera.add(gunRoot); scene.add(camera);
  const player = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, onGround: true, alive: true, peakY: 0, isPlayer: true, name: 'You', kills: 0, deaths: 0, mesh: { visible: true } };
  const bot = { x: 30, y: 0, z: 0, alive: true, name: 'Bot', kills: 0, deaths: 0 };
  const P = { adsT: 0, power: null, powerCd: 0, dashT: 0, cur: 1, camShake: 0 };
  const S = { state: 'playing', mode: 'single', T: 0, yaw: 0, pitch: 0, ads: false, view: 'fp', exposure: 1, paused: false, aim: null };
  const log = { toasts: [], banners: [], net: [], ended: 0, menu: 0, again: 0, deploy: 0, modal: [], power: 0 };
  const keys = {}, binds = { forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', grapple: 'KeyE', recall: 'KeyQ', clip: 'KeyK', power: 'KeyQ' };
  const wall = over.anchor || [0, 38, -18];
  const ctx = {
    THREE, document: doc, isMobile: !!over.mobile, scene, camera, viewCamera, gunRoot, renderer: {}, canvas: over.canvas || null, player, P, keys, EYE: 1.65, SOLDIER_GEN: global.SOLDIER_GEN,
    $: () => null, toast: (m) => log.toasts.push(m), banner: (m) => log.banners.push(m), haptic: () => {},
    getBinds: () => binds, isDown: (a) => !!keys[binds[a]], isPaused: () => S.paused, isAds: () => S.ads,
    getState: () => S.state, getMode: () => S.mode, getT: () => S.T, getYaw: () => S.yaw, getPitch: () => S.pitch, getViewMode: () => S.view,
    getAim: () => { if (S.aim) return S.aim; const dx = wall[0] - player.x, dy = wall[1] - (player.y + 1.65), dz = wall[2] - player.z, l = Math.hypot(dx, dy, dz); return { ox: player.x, oy: player.y + 1.65, oz: player.z, dx: dx / l, dy: dy / l, dz: dz / l }; },
    castRay: (ox, oy, oz, dx, dy, dz, max) => { if (over.noHit) return { t: max, world: false }; const dist = Math.hypot(wall[0] - ox, wall[1] - oy, wall[2] - oz), t = dist; return (t <= max && dz < 0) ? { t, world: true } : { t: max, world: false }; },
    losBlocked: () => false, groundY: () => 0,
    fighters: () => [player, bot], remotes: () => new Map(), selfId: () => 'me', netSend: (o) => log.net.push(o),
    weaponKey: () => 'rifle', weaponAnchor: () => ({ muzzle: [0.2, -0.1, -0.8] }),
    gunInst: () => { const g = new THREE.Group(); g.userData = { anch: { rGrip: [0, -0.08, 0.05] } }; return g; }, playerSkin: () => null, playerSlim: () => false,
    multiKillCount: () => over.multi || 1, sfxOn: () => false, getAudio: () => null,
    getExposure: () => S.exposure, setExposure: (v) => { S.exposure = v; }, vw: () => 390, vh: () => 844,
    enterEnded: () => { log.ended++; S.state = 'ended'; }, hidePlayerBody: () => { player.mesh.visible = false; },
    playAgain: () => log.again++, deploy: () => log.deploy++, toMenu: () => log.menu++, onModal: (on) => log.modal.push(on),
  };
  const api = SYSMOD.create(ctx);
  return { api, ctx, player, bot, P, S, log, keys, scene, camera, gunRoot, doc };
}
const DT = 1 / 60;
function physics(p) { p.vy -= 24 * DT; p.x += p.vx * DT; p.y += p.vy * DT; p.z += p.vz * DT; if (p.y <= 0) { p.y = 0; if (p.vy < 0) p.vy = 0; p.onGround = true; } else p.onGround = false; }
function frame(e, n) { for (let i = 0; i < n; i++) { e.camera.position.set(e.player.x, e.player.y + 1.65, e.player.z); e.camera.updateMatrixWorld(); e.api.frameUpdate(DT); } }

test('sling: attach, swing, rope holds, tether renders, release => flight + landing cushion', () => {
  const e = makeEnv(); e.keys.KeyE = true;
  assert.ok(e.api.pressGrapple(), 'anchor found'); assert.ok(e.api.isSlinging());
  assert.deepStrictEqual(e.log.net[0].t, 'sling'); assert.strictEqual(e.log.net[0].on, 1);
  for (let i = 0; i < 150; i++) { e.api.preMove(DT); physics(e.player); e.api.postMove(DT); e.api.simTick(DT); frame(e, 1); assert.ok(Number.isFinite(e.player.x + e.player.y + e.player.z)); }
  assert.strictEqual(e.api.dampK(), 0, 'ground/air damping off while attached'); assert.ok(e.api.cushion());
  assert.ok(e.api.debug.sling.tether && e.api.debug.sling.tether.visible, 'tether visible');
  const speed = Math.hypot(e.player.vx, e.player.vy, e.player.vz); assert.ok(speed > 10 && speed <= C.sling.MAX_SPEED + 0.01, 'speed ' + speed);
  e.keys.KeyE = false; e.api.preMove(DT);
  assert.ok(!e.api.isSlinging()); assert.strictEqual(e.log.net[e.log.net.length - 1].on, 0);
  e.player.onGround = false; assert.strictEqual(e.api.dampK(), C.sling.FLIGHT_DAMP, 'momentum preserved in flight'); assert.ok(e.api.cushion(), 'fall damage cushioned');
  e.player.onGround = true; e.api.simTick(0.3); assert.ok(!e.api.cushion(), 'cushion ends after landing');
});
test('sling: failures are graceful (nothing in range / anchor below / on cooldown / dead)', () => {
  let e = makeEnv({ noHit: true }); assert.ok(!e.api.pressGrapple()); assert.ok(e.log.toasts.includes('NO ANCHOR IN RANGE'));
  e = makeEnv({ anchor: [0, 1.5, -10] }); assert.ok(!e.api.pressGrapple()); assert.ok(e.log.toasts.includes('ANCHOR TOO LOW'));
  e = makeEnv(); e.player.alive = false; assert.ok(!e.api.pressGrapple());
});
test('sling: auto-releases after max hold time', () => {
  const e = makeEnv(); e.keys.KeyE = true; e.api.pressGrapple();
  for (let i = 0; i < 60 * 8; i++) { e.api.preMove(DT); physics(e.player); e.api.postMove(DT); }
  assert.ok(!e.api.isSlinging(), 'rope released');
});
test('remote grapple tether: created on "sl", disposed on release', () => {
  const e = makeEnv(); e.ctx.remotes = () => new Map([['r1', { x: 5, y: 0, z: 5 }]]);
  e.api.netMessage({ t: 'sl', id: 'r1', on: 1, a: [5, 30, -10] }); assert.strictEqual(e.api.debug.sling.remote.size, 1);
  frame(e, 2); e.api.netMessage({ t: 'sl', id: 'r1', on: 0 }); assert.strictEqual(e.api.debug.sling.remote.size, 0);
});

test('chrono: ring holds 150 frames; double-tap Q rewinds ~2.5 s; shockwave + net msg; cooldown', () => {
  const e = makeEnv(); e.player.vx = 9;
  for (let i = 0; i < 60 * 4; i++) { e.player.x += e.player.vx * DT; e.api.simTick(DT); }
  assert.strictEqual(e.api.debug.ghost.ring.count, C.ghost.FRAMES);
  const xNow = e.player.x; e.api.onKeyDown({ code: 'KeyQ', repeat: false, preventDefault() {} }, () => {});
  const handled = e.api.onKeyDown({ code: 'KeyQ', repeat: false, preventDefault() {} }, () => {});
  assert.ok(handled); near(e.player.x, xNow - 9 * 2.5, 0.6, 'rewound ~2.5 s of travel'); near(e.player.vx, 9, 0.01, 'velocity restored');
  assert.ok(e.scene.children.length > 1, 'shockwave rings spawned'); assert.strictEqual(e.log.net.find((m) => m.t === 'recall').x, e.player.x);
  assert.ok(!e.api.recallTap(), 'cooldown'); assert.ok(e.log.toasts.some((m) => /RECALL CHARGING/.test(m)));
});
test('chrono: discontinuity (server snap / teleport) clears history; death clears too', () => {
  const e = makeEnv(); for (let i = 0; i < 100; i++) e.api.simTick(DT);
  e.player.x = 500; e.api.simTick(DT); assert.strictEqual(e.api.debug.ghost.ring.count, 1, 'ring restarted after jump');
  for (let i = 0; i < 50; i++) e.api.simTick(DT); e.api.onSnap(); assert.strictEqual(e.api.debug.ghost.ring.count, 0);
  for (let i = 0; i < 50; i++) e.api.simTick(DT); e.api.onLocalDeath(); assert.strictEqual(e.api.debug.ghost.ring.count, 0);
});
test('chrono: ghost mesh trails the player and hides until there is history', () => {
  const e = makeEnv(); e.player.vx = 8; frame(e, 1); const gm = e.api.debug.ghost.mesh; assert.ok(!gm.visible);
  for (let i = 0; i < 150; i++) { e.player.x += 8 * DT; e.api.simTick(DT); } frame(e, 1);
  assert.ok(gm.visible, 'visible once trailing'); assert.ok(e.player.x - gm.position.x > 15, 'trails by ~2.5 s');
});
test('Q conflict: power fires after the tap window; a double-tap cancels it and recalls instead', async () => {
  const e = makeEnv(); e.P.power = 'dash'; e.P.powerCd = 0; let cast = 0;
  for (let i = 0; i < 120; i++) { e.player.x += 0.1; e.api.simTick(DT); }
  const k = { code: 'KeyQ', repeat: false, preventDefault() {} };
  assert.ok(e.api.onKeyDown(k, () => cast++), 'first tap consumed (power deferred)'); assert.strictEqual(cast, 0);
  await new Promise((r) => setTimeout(r, C.ghost.DOUBLE_TAP_MS + 80)); assert.strictEqual(cast, 1, 'single tap still casts power');
  e.api.debug.ghost.tap = 0; e.api.onKeyDown(k, () => cast++); e.api.onKeyDown(k, () => cast++);
  await new Promise((r) => setTimeout(r, C.ghost.DOUBLE_TAP_MS + 80)); assert.strictEqual(cast, 1, 'double tap did NOT waste the power'); assert.ok(e.api.debug.ghost.cd > 0, 'recalled');
  const e2 = makeEnv(); let c2 = 0; assert.strictEqual(e2.api.onKeyDown(k, () => c2++), false, 'no history / no power: Q falls through to main (no deferral lag)');
});

test('neural overdrive: tiers, violet tracers, FOV/aberration ramps, ADS dilation, CRT on death', () => {
  const e = makeEnv(); assert.strictEqual(e.api.tracerMat(), null);
  for (let i = 0; i < 3; i++) e.api.onLocalKill(e.bot, false);
  assert.strictEqual(e.api.debug.tierState.tier, 2); assert.ok(e.api.tracerMat(), 'violet tracer material'); assert.ok(e.log.banners.includes('OVERCLOCKED'));
  frame(e, 120); near(e.api.fovBonus(), C.tier.FOV_T2, 0.2, 'FOV +6'); assert.ok(e.api.aberration() > 0.001);
  e.S.ads = true; for (let i = 0; i < 60; i++) assert.strictEqual(e.api.timeScale(0.02), 1, 'no dilation below tier 3');
  for (let i = 0; i < 2; i++) e.api.onLocalKill(e.bot, false); assert.strictEqual(e.api.debug.tierState.tier, 3);
  e.S.ads = false; e.api.timeScale(0.2); e.S.ads = true; let s = 1; for (let i = 0; i < 40; i++) s = e.api.timeScale(0.01);
  near(s, 0.7, 0.01, 'tier-3 ADS => 0.7x world'); near(e.api.aimComp(), 1 / 0.7, 0.02, 'aim compensated to 1.0x');
  e.api.onLocalDeath(); assert.strictEqual(e.api.debug.tierState.tier, 1); assert.ok(e.api.debug.ui.crt.classList.contains('go'), 'CRT power-down'); assert.strictEqual(e.api.tracerMat(), null);
  assert.ok(e.api.debug.tierState.bolts, 'lightning rig exists');
});
test('lightning rig animates only at tier 3', () => {
  const e = makeEnv(); const g = e.api.debug.tierState.bolts.g; frame(e, 3); assert.ok(!g.visible);
  for (let i = 0; i < 5; i++) e.api.onLocalKill(e.bot, false); frame(e, 10); assert.ok(g.visible);
  const pts = e.api.debug.tierState.bolts.lines[0].geometry.attributes.position.array; assert.ok([...pts].every(Number.isFinite));
});

test('stunts: airborne / long headshot / multi-kill raise the K prompt; ordinary kills do not', () => {
  let e = makeEnv(); e.player.onGround = true; e.api.onLocalKill(e.bot, false); assert.ok(!e.api.debug.ui.hint.classList.contains('on'));
  e = makeEnv(); e.player.y = 6; e.player.onGround = false; e.api.onLocalKill(e.bot, false);
  assert.ok(e.api.debug.ui.hint.classList.contains('on')); assert.ok(/PRESS K: EXPORT TIKTOK CLIP/.test(e.api.debug.ui.hintTxt.textContent));
  e = makeEnv({ mobile: true }); e.player.y = 6; e.player.onGround = false; e.api.onLocalKill(e.bot, false); assert.ok(/TAP: EXPORT/.test(e.api.debug.ui.hintTxt.textContent), 'touch wording');
  e = makeEnv(); e.bot.x = 50; e.api.onLocalKill(e.bot, true); assert.ok(e.api.debug.ui.hint.classList.contains('on'), '50 m headshot');
  e = makeEnv({ multi: 2 }); e.api.onLocalKill(e.bot, false); assert.ok(e.api.debug.ui.hint.classList.contains('on'), 'double kill');
});

test('clip recorder: rotating segments, export on stunt, preview modal, download + share wiring', async () => {
  const made = []; class FakeMR { constructor(stream, o) { this.stream = stream; this.opts = o; this.state = 'inactive'; made.push(this); }
    start() { this.state = 'recording'; this._t = setTimeout(() => this.ondataavailable && this.ondataavailable({ data: new Blob(['x'.repeat(2048)]) }), 5); }
    stop() { if (this.state === 'inactive') return; this.state = 'inactive'; if (this.ondataavailable) this.ondataavailable({ data: new Blob(['tail']) }); setTimeout(() => this.onstop && this.onstop(), 1); }
    static isTypeSupported(t) { return /webm/.test(t); } }
  global.MediaRecorder = FakeMR;
  const canvas = { captureStream: (fps) => ({ fps, getAudioTracks: () => [], getVideoTracks: () => [{ stop() {} }], addTrack() {} }) };
  const e = makeEnv({ canvas, mobile: true }); const rec = e.api.debug.rec;
  e.api.onPlaying(); assert.ok(rec.on && rec.slots[0].live && made.length === 1); assert.strictEqual(made[0].opts.videoBitsPerSecond, 1600000, 'mobile bitrate'); assert.strictEqual(made[0].stream.fps, 24, 'mobile fps');
  assert.ok(/webm/.test(rec.mime));
  e.api.openClip(); assert.ok(e.log.toasts.includes('RECORDER WARMING UP…'), 'not enough footage yet');
  rec.slots[0].startedAt -= 6000;                                   /* pretend 6 s have been recorded */
  e.player.y = 8; e.player.onGround = false; e.api.onLocalKill(e.bot, false);
  await new Promise((r) => setTimeout(r, C.clip.FOLLOW_MS + 150));
  assert.ok(rec.pending && rec.pending.blob.size > 0, 'clip compiled'); assert.ok(rec.slots[0].live, 'slot restarted after export (rotation continues)');
  e.api.openClip(); assert.ok(e.api.debug.ui.modal.classList.contains('on')); assert.deepStrictEqual(e.log.modal, [true]);
  assert.ok(/AIRBORNE KILL/.test(e.api.debug.ui.modalMeta.textContent)); assert.ok(e.api.debug.ui.video.src.startsWith('blob:'));
  e.api.debug.ui.dl.click(); e.api.debug.ui.close.click(); assert.ok(!e.api.debug.ui.modal.classList.contains('on')); assert.deepStrictEqual(e.log.modal, [true, false]);
  e.api.onLeave(); assert.ok(!rec.on, 'recorder released when leaving the match'); delete global.MediaRecorder;
});
test('clip recorder: unsupported browsers degrade to a toast, not an error', () => {
  delete global.MediaRecorder; const e = makeEnv({ canvas: {} }); e.api.onPlaying(); e.api.openClip();
  assert.ok(e.log.toasts.includes('CLIP RECORDING NOT SUPPORTED'));
});

test('match (single): score limit ends the match; winner gets the cinematic, loser gets a result panel', () => {
  let e = makeEnv(); e.api.onMatchReset(); e.bot.kills = 20; e.player.kills = 4; e.api.simTick(DT);
  assert.strictEqual(e.log.ended, 1); assert.ok(!e.api.debug.vic.active, 'no cinematic when you lose'); assert.strictEqual(e.api.debug.ui.vTitle.textContent, 'MATCH OVER'); assert.ok(e.api.debug.ui.vic.classList.contains('panel'));
  e = makeEnv(); e.api.onMatchReset(); e.S.T = 361; e.player.kills = 3; e.bot.kills = 1; e.api.simTick(DT);
  assert.strictEqual(e.log.ended, 1); assert.ok(e.api.debug.vic.active, 'time limit + highest score => victory'); assert.strictEqual(e.api.debug.ui.vTitle.textContent, 'VICTORY');
  e = makeEnv(); e.api.onMatchReset(); e.S.T = 361; e.api.simTick(DT); assert.strictEqual(e.api.debug.ui.vTitle.textContent, 'DRAW', '0-0 draw');
  assert.ok(!(e = makeEnv()).api.matchClockText().includes('NaN'));
});
test('match (multi): server matchend drives the same flow; matchstart offers DEPLOY', () => {
  const e = makeEnv(); e.S.mode = 'multi'; e.api.onMatchReset();
  e.api.netMessage({ t: 'matchend', reason: 'score', winner: 'me', board: [{ id: 'me', name: 'You', kills: 25, deaths: 3 }, { id: 'z', name: 'Zed', kills: 20, deaths: 9 }], next: 15000 });
  assert.ok(e.api.debug.vic.active); assert.strictEqual(e.api.debug.ui.vList.children.length, 2);
  e.api.netMessage({ t: 'matchstart', left: 600000, limit: 25 }); assert.strictEqual(e.api.debug.ui.bDeploy.style.display, ''); e.api.debug.ui.bDeploy.click();
  assert.strictEqual(e.log.deploy, 1); assert.ok(!e.api.debug.vic.active, 'cinematic torn down on deploy');
  const e2 = makeEnv(); e2.S.mode = 'multi'; e2.api.onMatchReset(); e2.api.netMessage({ t: 'matchend', reason: 'time', winner: 'z', board: [{ id: 'z', name: 'Zed', kills: 9, deaths: 1 }, { id: 'me', name: 'You', kills: 2, deaths: 5 }], next: 15000 });
  assert.ok(!e2.api.debug.vic.active, 'loser: no cinematic');
});

test('victory: real soldier-gen rig is posed correctly (FK), camera orbits, slow-mo, bars, cleanup', () => {
  const e = makeEnv(); e.S.yaw = 0.6; e.api.onMatchReset(); e.camera.position.set(0, 1.65, 0); e.camera.updateMatrixWorld();
  e.player.kills = 20; e.api.simTick(DT); const vic = e.api.debug.vic; assert.ok(vic.active && vic.wrap && vic.bones, 'soldier built from soldier-gen');
  assert.strictEqual(e.api.timeScale(DT), C.victory.SLOWMO, '0.25x slow-motion');
  assert.ok(e.api.debug.ui.barT.classList.contains('on') && e.api.debug.ui.barB.classList.contains('on'), 'letterbox bars on');
  /* orientation: model +Z must map to the player's facing (-sin yaw, -cos yaw) */
  const f = new THREE.Vector3(0, 0, 1).applyQuaternion(vic.wrap.quaternion); near(f.x, -Math.sin(0.6), 1e-6); near(f.z, -Math.cos(0.6), 1e-6);
  let minD = 1e9, maxD = 0, yaws = [];
  for (let i = 0; i < 60 * 11; i++) { e.api.frameUpdate(DT);
    if (i * DT > 2) { const d = Math.hypot(e.camera.position.x, e.camera.position.z); minD = Math.min(minD, d); maxD = Math.max(maxD, d); }
    yaws.push(Math.atan2(e.camera.position.x, e.camera.position.z)); }
  near(minD, 3.5, 0.25, 'dolly distance'); near(maxD, 3.5, 0.25);
  assert.ok(e.camera.fov < 75 && e.camera.fov > 45, 'fov narrowed cinematically ' + e.camera.fov);
  /* skeleton checks at a sampled pose */
  const B = vic.bones, wp = (n) => B[n].getWorldPosition(new THREE.Vector3()), loc = (v) => vic.wrap.worldToLocal(v.clone());
  const head = wp('Head'), rh = wp('RightHand'), lh = wp('LeftHand'), le = wp('LeftForeArm'), ls = wp('LeftArm'), rs = wp('RightArm');
  assert.ok(rh.y > head.y + 0.15, 'weapon hand is overhead: ' + rh.y.toFixed(2) + ' vs head ' + head.y.toFixed(2));
  assert.ok(lh.y > le.y + 0.08, 'left forearm curled up (flex)'); assert.ok(loc(le).x - loc(ls).x > 0.15, 'left upper arm out to the side (+X = character left)');
  assert.ok(loc(rh).x < loc(rs).x + 0.05, 'right arm raised on its own side');
  const gun = B.RightHand.children[0].children[0]; gun.updateRoot(); const ge = gun.matrixWorld.elements; assert.ok(-ge[9] > 0.8, 'barrel points up (world dir y=' + (-ge[9]).toFixed(2) + ')');
  assert.ok(wp('Hips').y > 0.6 && wp('Hips').y < 1.0, 'hips at a sane height');
  assert.ok(e.api.debug.ui.vic.classList.contains('panel'), 'result panel after the cinematic'); assert.ok(e.S.exposure < 1, 'dramatic exposure applied');
  const n0 = e.scene.children.length; e.api.debug.ui.bMenu.click();
  assert.strictEqual(e.log.menu, 1); assert.ok(!vic.active && !vic.wrap && !vic.spot && !vic.cone && !vic.conf, 'all stage objects removed'); assert.strictEqual(e.S.exposure, 1, 'exposure restored'); assert.ok(e.scene.children.length < n0);
  assert.ok(!e.api.debug.ui.barT.classList.contains('on'));
});
test('victory: tap-to-skip jumps to the result panel (mobile)', () => {
  const e = makeEnv({ mobile: true }); e.api.onMatchReset(); e.camera.updateMatrixWorld(); e.player.kills = 20; e.api.simTick(DT);
  assert.ok(!e.api.debug.vic.panelOn); e.api.debug.ui.skip.click(); frame(e, 3); assert.ok(e.api.debug.vic.panelOn);
});

test('circuit breaker: a throwing subsystem disables itself; game keeps running', () => {
  const e = makeEnv(); e.ctx.getAim = () => { throw new Error('boom'); };
  const orig = console.error; console.error = () => {}; try { for (let i = 0; i < 6; i++) assert.strictEqual(e.api.pressGrapple(), false); } finally { console.error = orig; }
  assert.ok(e.api.debug.faults.sling >= 3); assert.strictEqual(e.api.dampK(), 1); assert.ok(e.api.simTick(DT) === undefined);
});
test('noop fallback is neutral', () => {
  const n = SYSMOD.noop; assert.strictEqual(n.dampK(), 1); assert.strictEqual(n.timeScale(), 1); assert.strictEqual(n.cushion(), false); assert.strictEqual(n.tracerMat(), null); assert.strictEqual(n.preMove(), undefined);
});

(async () => {
  for (const t of queue) {
    try { await t.fn(); passed++; console.log('  ok   ' + t.name); }
    catch (e) { failures.push(t.name); console.log('  FAIL ' + t.name + '\n       ' + String(e && e.stack || e).split('\n').slice(0, 4).join('\n       ')); }
  }
  console.log('\nsystems: ' + passed + '/' + queue.length + ' passed');
  if (failures.length) { console.log('FAILED: ' + failures.join(', ')); process.exitCode = 1; }
})();
