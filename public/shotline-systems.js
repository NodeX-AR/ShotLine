/* ShotLine Kinetic Systems — integration layer.
   Everything the game needs is injected through `ctx` by main.js (see the SYS_CTX block there), so this
   file never reaches into main.js private scope and can be smoke-tested in Node with a THREE mock.
   Each public entry point is wrapped in a circuit breaker: after 3 exceptions a subsystem disables itself
   and the game keeps running (a bug here must never black-screen the match). */
(function (root) {
  'use strict';
  const CORE = root.SHOTLINE_CORE || (typeof require === 'function' ? require('./systems-core.js') : null);
  const SINGLE_RULES = { scoreLimit: 20, timeLimitSec: 360 };

  function create(ctx) {
    const T = ctx.THREE, C = CORE.CFG, doc = ctx.document, mobile = !!ctx.isMobile;
    const P = ctx.P, player = ctx.player;
    const clamp = CORE.clamp, lerp = CORE.lerp;
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

    /* ---------- circuit breaker ---------- */
    const faults = Object.create(null);
    function guard(name, fn, fallback) {
      return function () {
        if ((faults[name] | 0) >= 3) return fallback;
        try { return fn.apply(null, arguments); }
        catch (e) { faults[name] = (faults[name] | 0) + 1; try { console.error('[ShotlineSystems] ' + name + ' fault #' + faults[name], e); } catch (_) {} return fallback; }
      };
    }

    /* ---------- tiny DOM helpers ---------- */
    const ui = {};
    function el(tag, cls, parent, text) {
      const e = doc.createElement(tag); if (cls) e.className = cls;
      if (text !== undefined) e.textContent = text;
      (parent || ui.root).appendChild(e); return e;
    }
    const keyName = (code) => String(code || '').replace(/^Key|^Digit/, '').replace('Arrow', '');
    const B = () => ctx.getBinds();

    /* ---------- audio (Web Audio via the game's shared context; routed through the capture bus) ---------- */
    let noiseBuf = null;
    function A() { if (!ctx.sfxOn()) return null; try { return ctx.getAudio(); } catch (e) { return null; } }
    function tone(a, type, f0, f1, dur, vol, delay) {
      const ac = a.ctx, t = ac.currentTime + (delay || 0), o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur / 3));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(a.out); o.start(t); o.stop(t + dur + 0.03);
    }
    function sweepNoise(a, f0, f1, dur, vol, delay, rise) {
      const ac = a.ctx, t = ac.currentTime + (delay || 0);
      if (!noiseBuf || noiseBuf.sampleRate !== ac.sampleRate) {
        noiseBuf = ac.createBuffer(1, Math.floor(ac.sampleRate * 1.0), ac.sampleRate);
        const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = noiseBuf; f.type = 'bandpass'; f.Q.value = 3;
      f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
      if (rise) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.92); g.gain.setValueAtTime(0.0001, t + dur); }
      else { g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); }
      s.connect(f); f.connect(g); g.connect(a.out); s.start(t); s.stop(t + dur + 0.05);
    }
    const sfx = {
      /* inverse temporal effect: *rising* sweep + reverse-envelope swell that cuts dead, then a sub thump */
      recall() { const a = A(); if (!a) return; tone(a, 'sawtooth', 90, 3200, 0.55, 0.2); tone(a, 'square', 45, 1600, 0.55, 0.08);
        sweepNoise(a, 200, 7000, 0.56, 0.32, 0, true);
        [0, 0.13, 0.23, 0.31, 0.37, 0.41].forEach((d, i) => tone(a, 'square', 2600 - i * 180, 0, 0.025, 0.05, d));
        tone(a, 'sine', 70, 28, 0.4, 0.42, 0.56); sweepNoise(a, 900, 60, 0.35, 0.3, 0.56, false); },
      grapple() { const a = A(); if (!a) return; sweepNoise(a, 1400, 6000, 0.12, 0.2, 0, false); tone(a, 'square', 600, 1900, 0.1, 0.1); tone(a, 'sine', 180, 90, 0.18, 0.25, 0.08); },
      release() { const a = A(); if (!a) return; tone(a, 'triangle', 900, 260, 0.2, 0.14); sweepNoise(a, 3000, 600, 0.25, 0.18, 0, false); },
      dry() { const a = A(); if (!a) return; tone(a, 'square', 220, 140, 0.07, 0.08); },
      tier(n) { const a = A(); if (!a) return; const base = n >= 3 ? 330 : 262; [0, 4, 7, 12].forEach((s, i) => tone(a, 'triangle', base * Math.pow(2, s / 12), 0, 0.16, 0.12, i * 0.06)); if (n >= 3) sweepNoise(a, 400, 8000, 0.35, 0.18, 0, true); },
      crt() { const a = A(); if (!a) return; tone(a, 'sawtooth', 900, 40, 0.5, 0.18); sweepNoise(a, 5000, 120, 0.5, 0.25, 0, false); tone(a, 'sine', 60, 30, 0.3, 0.3, 0.4); },
      clip() { const a = A(); if (!a) return; tone(a, 'sine', 1200, 1800, 0.08, 0.1); tone(a, 'sine', 1800, 2400, 0.1, 0.1, 0.09); },
    };
    const haptic = (ms) => { try { if (ctx.haptic) ctx.haptic(ms); } catch (e) {} };

    /* ---------- shockwave rings (recall) ---------- */
    const shocks = [];
    let ringGeo = null;
    function shockwave(x, y, z, color, maxR, life) {
      if (!ringGeo) ringGeo = new T.RingGeometry(0.9, 1, mobile ? 32 : 56);
      if (shocks.length >= 10) { const o = shocks.shift(); ctx.scene.remove(o.m); o.m.material.dispose(); }
      const m = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(x, y + 0.08, z); m.scale.setScalar(0.4); m.frustumCulled = false;
      ctx.scene.add(m); shocks.push({ m, t: 0, life: life || 0.9, maxR: maxR || 14 });
    }
    function updateShocks(dt) {
      for (let i = shocks.length - 1; i >= 0; i--) {
        const s = shocks[i]; s.t += dt; const k = s.t / s.life;
        if (k >= 1) { ctx.scene.remove(s.m); s.m.material.dispose(); shocks.splice(i, 1); continue; }
        const e = 1 - Math.pow(1 - k, 3); s.m.scale.setScalar(0.4 + e * s.maxR); s.m.material.opacity = 0.9 * (1 - k);
      }
    }

    /* ================= 1. KINETIC PENDULUM SLINGSHOT ================= */
    const sling = { S: CORE.slingCreate(), tension: 0, losT: 0, losFail: 0, tether: null, anchorFx: null, remote: new Map(), tLast: 0 };
    const _col = { cyan: 0x62e9ff, violet: 0xc27bff };

    function makeRibbon(segs, width, color, opacity) {
      const pos = new Float32Array((segs + 1) * 2 * 3), idx = [];
      for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setIndex(idx);
      const m = new T.Mesh(g, new T.MeshBasicMaterial({ color, transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
      m.frustumCulled = false; m.userData.width = width; return m;
    }
    function makeTether(withRibbon) {
      const segs = mobile ? 20 : 32, path = new Float32Array((segs + 1) * 3);
      const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.BufferAttribute(new Float32Array((segs + 1) * 3), 3));
      const line = new T.Line(lg, new T.LineBasicMaterial({ color: 0xeaffff, transparent: true, opacity: 0.98, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
      line.frustumCulled = false;
      const g = new T.Group(); g.add(line); g.userData = { segs, path, line, ribbons: [] };
      if (withRibbon) { const r1 = makeRibbon(segs, 0.05, _col.cyan, 0.55), r2 = makeRibbon(segs, 0.16, _col.cyan, 0.2); g.add(r1); g.add(r2); g.userData.ribbons.push(r1, r2); }
      const node = new T.Mesh(new T.OctahedronGeometry(0.2), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
      node.frustumCulled = false; g.add(node); g.userData.node = node;
      g.visible = false; ctx.scene.add(g); return g;
    }
    function disposeTether(g) {
      if (!g) return; ctx.scene.remove(g);
      g.traverse((o) => { if (o.geometry && o.geometry.dispose) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); });
    }
    /* camera-facing ribbon from the noisy path */
    function fillRibbon(r, path, segs, cam) {
      const pa = r.geometry.attributes.position.array, hw = r.userData.width * 0.5;
      for (let i = 0; i <= segs; i++) {
        const o = i * 3, a = Math.max(0, i - 1) * 3, b = Math.min(segs, i + 1) * 3;
        let tx = path[b] - path[a], ty = path[b + 1] - path[a + 1], tz = path[b + 2] - path[a + 2];
        const vx = cam.x - path[o], vy = cam.y - path[o + 1], vz = cam.z - path[o + 2];
        let sx = ty * vz - tz * vy, sy = tz * vx - tx * vz, sz = tx * vy - ty * vx;
        const l = Math.hypot(sx, sy, sz) || 1; sx = sx / l * hw; sy = sy / l * hw; sz = sz / l * hw;
        const q = i * 6;
        pa[q] = path[o] - sx; pa[q + 1] = path[o + 1] - sy; pa[q + 2] = path[o + 2] - sz;
        pa[q + 3] = path[o] + sx; pa[q + 4] = path[o + 1] + sy; pa[q + 5] = path[o + 2] + sz;
      }
      r.geometry.attributes.position.needsUpdate = true;
    }
    function drawTether(g, sx, sy, sz, ex, ey, ez, time, amp, tension, color) {
      const u = g.userData, cam = ctx.camera.position;
      CORE.tetherPath(u.path, u.segs, sx, sy, sz, ex, ey, ez, time, amp, tension);
      const la = u.line.geometry.attributes.position; la.array.set(u.path); la.needsUpdate = true;
      for (const r of u.ribbons) { fillRibbon(r, u.path, u.segs, cam); r.material.color.setHex(color); }
      u.node.position.set(ex, ey, ez); u.node.rotation.y = time * 3; u.node.rotation.x = time * 2; u.node.scale.setScalar(0.8 + Math.sin(time * 14) * 0.25);
      g.visible = true;
    }
    function handPos(out) {
      const cam = ctx.camera;
      if (ctx.getViewMode() === 'fp') {
        const e = cam.matrixWorld.elements;      /* right = col0, up = col1, forward = -col2 */
        out.x = cam.position.x + e[0] * 0.24 - e[4] * 0.2 - e[8] * 0.6;
        out.y = cam.position.y + e[1] * 0.24 - e[5] * 0.2 - e[9] * 0.6;
        out.z = cam.position.z + e[2] * 0.24 - e[6] * 0.2 - e[10] * 0.6;
      } else { const y = ctx.getYaw(); out.x = player.x + Math.cos(y) * 0.25; out.y = player.y + 1.3; out.z = player.z - Math.sin(y) * 0.25; }
    }
    const _hand = { x: 0, y: 0, z: 0 };
    const keyHeld = (action) => !!ctx.keys[B()[action]];

    function slingFail(msg) { sling.S.cd = Math.max(sling.S.cd, 0.25); ctx.toast(msg, 'warn'); sfx.dry(); haptic(12); }
    function pressGrapple() {
      if (ctx.getState() !== 'playing' || !player.alive || ctx.isPaused()) return false;
      const S = sling.S;
      if (S.active) return true;
      if (S.cd > 0 || player.climb || player.mantle) return false;
      const a = ctx.getAim(), R = C.sling.RANGE;
      const h = ctx.castRay(a.ox, a.oy, a.oz, a.dx, a.dy, a.dz, R, player);
      if (!h || !h.world || h.t >= R - 0.05) { slingFail('NO ANCHOR IN RANGE'); return false; }
      const ax = a.ox + a.dx * (h.t - 0.08), ay = a.oy + a.dy * (h.t - 0.08), az = a.oz + a.dz * (h.t - 0.08);
      if (ay < player.y + C.sling.MIN_RISE) { slingFail('ANCHOR TOO LOW'); return false; }
      CORE.slingAttach(S, player, ax, ay, az);
      sling.losT = 0; sling.losFail = 0; sling.tension = 0;
      if (!sling.tether) sling.tether = makeTether(true);
      sfx.grapple(); haptic(18);
      ctx.netSend({ t: 'sling', on: 1, a: [ax, ay, az] });
      return true;
    }
    function releaseGrapple(silent) {
      const S = sling.S; if (!S.active) return;
      const sp = CORE.slingRelease(S, player);
      if (sling.tether) sling.tether.visible = false;
      ctx.netSend({ t: 'sling', on: 0 });
      if (!silent) { sfx.release(); haptic(10); if (sp > 24) ctx.banner('SLINGSHOT', '#62e9ff'); P.camShake = Math.max(P.camShake || 0, clamp(sp / 60, 0.1, 0.7)); }
    }
    function slingPreMove(dt) {
      const S = sling.S; if (!S.active) return;
      if (!player.alive || player.climb || player.mantle || S.t > C.sling.MAX_HOLD || !keyHeld('grapple')) { releaseGrapple(false); return; }
      const a = ctx.getAim(), yaw = ctx.getYaw();
      const fw = (ctx.isDown('forward') ? 1 : 0) - (ctx.isDown('back') ? 1 : 0), rt = (ctx.isDown('right') ? 1 : 0) - (ctx.isDown('left') ? 1 : 0);
      let mx = -Math.sin(yaw) * fw + Math.cos(yaw) * rt, mz = -Math.cos(yaw) * fw - Math.sin(yaw) * rt;
      const ml = Math.hypot(mx, mz); if (ml > 0) { mx /= ml; mz /= ml; }
      CORE.slingPre(S, player, dt, { fx: a.dx, fy: a.dy, fz: a.dz, mx, mz, reel: ctx.isDown('jump') });
    }
    function slingPostMove(dt) {
      const S = sling.S; if (!S.active) return;
      sling.tension = CORE.slingPost(S, player);
      sling.losT -= dt;
      if (sling.losT <= 0) {
        sling.losT = 0.1;
        const bx = player.x, by = player.y + C.sling.BOB, bz = player.z, dx = bx - S.ax, dy = by - S.ay, dz = bz - S.az, d = Math.hypot(dx, dy, dz) || 1;
        const blocked = ctx.losBlocked(bx, by, bz, S.ax + dx / d * 0.5, S.ay + dy / d * 0.5, S.az + dz / d * 0.5);
        sling.losFail = blocked ? sling.losFail + 1 : 0;
        if (sling.losFail >= 3) { releaseGrapple(true); ctx.toast('ROPE SNAPPED', 'warn'); sfx.release(); }
      }
    }
    function updateTether(time) {
      const S = sling.S;
      if (!S.active || !sling.tether) return;
      handPos(_hand);
      const tier = tierState.tier;
      drawTether(sling.tether, _hand.x, _hand.y, _hand.z, S.ax, S.ay, S.az, time, 0.1 + 0.22 * (1 - sling.tension) + Math.min(0.2, S.speed / 200), sling.tension, tier >= 2 ? _col.violet : _col.cyan);
    }
    function updateRemoteSling(time) {
      for (const [id, r] of sling.remote) {
        const f = ctx.remotes().get(id);
        if (!f || now() > r.until) { disposeTether(r.g); sling.remote.delete(id); continue; }
        drawTether(r.g, f.x, f.y + 1.3, f.z, r.ax, r.ay, r.az, time + r.seed, 0.25, 0.6, _col.cyan);
      }
    }

    /* ================= 2. CHRONO-GHOST ================= */
    const ghost = { ring: new CORE.Ring(C.ghost.FRAMES, 11), acc: 0, cd: 0, mesh: null, mat: null, s: new Array(11), has: false, lx: 0, ly: 0, lz: 0, tap: 0, pendingPower: 0 };
    function buildGhost() {
      const mat = ghost.mat = new T.MeshBasicMaterial({ color: 0x66f2ff, wireframe: true, transparent: true, opacity: 0.5, depthWrite: false, fog: false });
      const g = new T.Group();
      const add = (geo, x, y, z) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.frustumCulled = false; g.add(m); };
      add(new T.IcosahedronGeometry(0.17, 0), 0, 1.62, 0);
      add(new T.BoxGeometry(0.52, 0.62, 0.26), 0, 1.15, 0);
      add(new T.BoxGeometry(0.17, 0.62, 0.17), -0.37, 1.12, 0); add(new T.BoxGeometry(0.17, 0.62, 0.17), 0.37, 1.12, 0);
      add(new T.BoxGeometry(0.2, 0.82, 0.2), -0.14, 0.41, 0); add(new T.BoxGeometry(0.2, 0.82, 0.2), 0.14, 0.41, 0);
      const bg = new T.BufferGeometry(); bg.setAttribute('position', new T.BufferAttribute(new Float32Array([0, 0, 0, 0, 3.2, 0]), 3));
      const beacon = new T.Line(bg, new T.LineBasicMaterial({ color: 0x66f2ff, transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
      beacon.frustumCulled = false; g.add(beacon);
      const ring = new T.Mesh(new T.RingGeometry(0.5, 0.62, 28), new T.MeshBasicMaterial({ color: 0x66f2ff, transparent: true, opacity: 0.5, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; ring.frustumCulled = false; g.add(ring);
      g.visible = false; ctx.scene.add(g); ghost.mesh = g;
    }
    function ghostSimTick(dt) {
      const g = ghost; g.cd = Math.max(0, g.cd - dt);
      if (!player.alive || ctx.getState() !== 'playing') { if (g.ring.count) g.ring.clear(); g.has = false; g.acc = 0; return; }
      g.acc += dt; const step = 1 / C.ghost.HZ; let n = 0, q = ctx.camera.quaternion;
      while (g.acc >= step && n < 4) {
        g.acc -= step; n++;
        if (g.has && Math.hypot(player.x - g.lx, player.y - g.ly, player.z - g.lz) > C.ghost.JUMP_RESET) g.ring.clear();   /* teleport / server snap */
        const s = g.s;
        s[0] = player.x; s[1] = player.y; s[2] = player.z; s[3] = q.x; s[4] = q.y; s[5] = q.z; s[6] = q.w;
        s[7] = player.vx; s[8] = player.vy; s[9] = player.vz; s[10] = player.peakY === undefined ? player.y : player.peakY;
        g.ring.push(s); g.lx = player.x; g.ly = player.y; g.lz = player.z; g.has = true;
      }
      if (g.acc > step * 4) g.acc = 0;
    }
    const canRecall = () => ghost.cd <= 0 && ghost.ring.count >= C.ghost.MIN_FRAMES && player.alive && ctx.getState() === 'playing' && !ctx.isPaused() && !player.climb && !player.mantle;
    function recall() {
      const g = ghost;
      if (ctx.getState() !== 'playing' || !player.alive) return false;
      if (!canRecall()) { if (g.cd > 0) ctx.toast('RECALL CHARGING ' + g.cd.toFixed(1) + 's', 'warn'); else ctx.toast('TIMELINE TOO SHORT', 'warn'); sfx.dry(); return false; }
      const d = g.ring.data, o = g.ring.offset(0);
      const fx = player.x, fy = player.y, fz = player.z;
      shockwave(fx, fy, fz, 0x62e9ff, 15, 0.95); shockwave(fx, fy, fz, 0xffffff, 8, 0.6);
      releaseGrapple(true); sling.S.flight = false;
      player.x = d[o]; player.y = d[o + 1]; player.z = d[o + 2];
      player.vx = d[o + 7]; player.vy = d[o + 8]; player.vz = d[o + 9]; player.peakY = d[o + 10];
      player.onGround = false; player.climb = null; player.mantle = null; P.dashT = 0;
      shockwave(player.x, player.y, player.z, 0x66f2ff, 7, 0.7);
      ctx.netSend({ t: 'recall', x: player.x, y: player.y, z: player.z });
      g.ring.clear(); g.cd = C.ghost.COOLDOWN; g.has = false; g.acc = 0;
      P.camShake = Math.max(P.camShake || 0, 0.8); recallPulse = 1;
      ctx.banner('CHRONO-RECALL', '#62e9ff'); sfx.recall(); haptic([20, 30, 40]);
      return true;
    }
    let recallPulse = 0;
    function updateGhostMesh(time, dt) {
      if (!ghost.mesh) return;
      const g = ghost, show = ctx.getState() === 'playing' && player.alive && g.ring.count >= C.ghost.MIN_FRAMES && !vic.active;
      if (!show) { g.mesh.visible = false; return; }
      const d = g.ring.data, o = g.ring.offset(0);
      const dist = Math.hypot(d[o] - player.x, d[o + 1] - player.y, d[o + 2] - player.z);
      g.mesh.position.set(d[o], d[o + 1], d[o + 2]);
      _q.set(d[o + 3], d[o + 4], d[o + 5], d[o + 6]); _e.setFromQuaternion(_q, 'YXZ'); g.mesh.rotation.y = _e.y;
      const ready = g.cd <= 0, fade = clamp((dist - 1.2) / 4, 0, 1);
      g.mat.opacity = (0.22 + 0.2 * Math.sin(time * 5)) * fade + (ready ? 0.05 : 0);
      g.mat.color.setHex(ready ? 0x66f2ff : 0x6b7c88);
      g.mesh.visible = fade > 0.02;
    }
    const _q = new T.Quaternion(), _e = new T.Euler();

    /* ================= 3. NEURAL OVERDRIVE ================= */
    const tierState = { streak: 0, tier: 1, b2: 0, b3: 0, crt: 0, violetMat: null, bolts: null, boltAcc: 0 };
    const dil = CORE.dilationCreate();
    let lastScale = 1;
    function setStreak(n) {
      const old = tierState.tier; tierState.streak = n; tierState.tier = CORE.tierOf(n);
      if (tierState.tier > old) { ctx.banner(tierState.tier >= 3 ? 'NEURAL SURGE' : 'OVERCLOCKED', tierState.tier >= 3 ? '#d9a8ff' : '#b06cff'); sfx.tier(tierState.tier); haptic([15, 20, 15]); }
      ui.tier.className = 'nx-tier' + (tierState.tier >= 2 ? ' t' + tierState.tier : '');
      ui.tier.textContent = tierState.tier >= 3 ? 'NEURAL SURGE' : tierState.tier === 2 ? 'OVERCLOCKED' : '';
    }
    function crtFlash() {
      ui.crt.classList.remove('go'); void ui.crt.offsetWidth; ui.crt.classList.add('go'); sfx.crt(); haptic([40, 30, 80]);
    }
    function buildBolts() {
      const g = new T.Group(); g.visible = false;
      const mat = new T.LineBasicMaterial({ color: 0xcfa6ff, transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false, fog: false });
      const lines = [], N = mobile ? 3 : 6, SEG = 7;
      for (let i = 0; i < N; i++) {
        const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(new Float32Array(SEG * 3), 3));
        const ln = new T.Line(geo, mat); ln.frustumCulled = false; g.add(ln); lines.push(ln);
      }
      tierState.bolts = { g, lines, SEG, mat };
      ctx.gunRoot.add(g);
    }
    function updateBolts(dt) {
      const b = tierState.bolts; if (!b) return;
      const show = tierState.tier >= 3 && ctx.getState() === 'playing' && ctx.gunRoot.visible && P.adsT < 0.9;
      b.g.visible = show; if (!show) return;
      tierState.boltAcc += dt; if (tierState.boltAcc < 1 / 24) return; tierState.boltAcc = 0;
      const A_ = ctx.weaponAnchor(), mz = A_ ? A_.muzzle[2] : -0.8, cx = A_ ? A_.muzzle[0] : 0.2, cy = A_ ? A_.muzzle[1] : -0.1, cz = mz * 0.5;
      const rz = Math.abs(mz) * 0.5, rnd = Math.random;
      b.mat.color.setHex(rnd() < 0.3 ? 0xffffff : 0xcfa6ff);
      for (const ln of b.lines) {
        const a = ln.geometry.attributes.position.array;
        const x0 = cx + (rnd() - 0.5) * 0.14, y0 = cy + (rnd() - 0.5) * 0.14, z0 = cz + (rnd() - 0.5) * 2 * rz;
        const x1 = cx + (rnd() - 0.5) * 0.3, y1 = cy + (rnd() - 0.5) * 0.3, z1 = cz + (rnd() - 0.5) * 2 * rz;
        for (let i = 0; i < b.SEG; i++) {
          const f = i / (b.SEG - 1), j = (i === 0 || i === b.SEG - 1) ? 0 : 0.045;
          a[i * 3] = lerp(x0, x1, f) + (rnd() - 0.5) * j; a[i * 3 + 1] = lerp(y0, y1, f) + (rnd() - 0.5) * j; a[i * 3 + 2] = lerp(z0, z1, f) + (rnd() - 0.5) * j;
        }
        ln.geometry.attributes.position.needsUpdate = true; ln.visible = rnd() < 0.8;
      }
    }

    /* ================= 4. CLIP RECORDER (rotating, independently-decodable segments) =================
       A single MediaRecorder whose old chunks are discarded produces an unplayable file (only the first chunk
       carries the container header). Two recorders restart every SEG_MS, offset by OFFSET_MS, so at any instant
       one holds a *complete* standalone WebM/MP4 covering the last 5–10 s. */
    const rec = { ok: false, on: false, mime: '', ext: 'webm', stream: null, slots: [{ live: false, startedAt: 0, rec: null, chunks: [], timer: 0 }, { live: false, startedAt: 0, rec: null, chunks: [], timer: 0 }],
      offsetTimer: 0, busy: false, pending: null, url: null, wantOpen: false, ema: 16, lowT: 0, tapAudio: null, hintT: 0 };
    function recDetect() {
      try {
        if (typeof MediaRecorder === 'undefined' || !ctx.canvas || !ctx.canvas.captureStream) return;
        const list = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1', 'video/mp4'];
        for (const m of list) if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) { rec.mime = m; break; }
        rec.ext = /mp4/.test(rec.mime) ? 'mp4' : 'webm'; rec.ok = true;
      } catch (e) { rec.ok = false; }
    }
    function recEnabledPref() { try { return localStorage.getItem('shotline.clip') !== '0'; } catch (e) { return true; } }
    function recStart() {
      if (!rec.ok || rec.stream || !recEnabledPref()) return;
      try {
        rec.stream = ctx.canvas.captureStream(mobile ? 24 : 30);
        if (rec.tapAudio) for (const t of rec.tapAudio.stream.getAudioTracks()) rec.stream.addTrack(t);
      } catch (e) { rec.ok = false; rec.stream = null; return; }
      rec.on = true; startSlot(0);
      rec.offsetTimer = setTimeout(() => { if (rec.on) startSlot(1); }, C.clip.OFFSET_MS);
    }
    function recStop() {
      rec.on = false; clearTimeout(rec.offsetTimer);
      for (const s of rec.slots) { clearTimeout(s.timer); stopQuiet(s.rec); s.rec = null; s.live = false; s.chunks = []; }
      if (rec.stream) { try { for (const t of rec.stream.getVideoTracks()) t.stop(); } catch (e) {} rec.stream = null; }
    }
    function stopQuiet(r) { try { if (r && r.state !== 'inactive') { r.ondataavailable = null; r.onstop = null; r.stop(); } } catch (e) {} }
    function startSlot(i) {
      const sl = rec.slots[i]; let r;
      const opts = { videoBitsPerSecond: mobile ? 1600000 : 2500000 }; if (rec.mime) opts.mimeType = rec.mime;
      try { r = new MediaRecorder(rec.stream, opts); } catch (e) { try { r = new MediaRecorder(rec.stream); } catch (e2) { rec.ok = false; recStop(); return; } }
      const chunks = []; sl.rec = r; sl.chunks = chunks; sl.startedAt = now(); sl.live = true;
      r.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      try { r.start(1000); } catch (e) { sl.live = false; return; }
      clearTimeout(sl.timer); sl.timer = setTimeout(() => { if (!rec.on) return; stopQuiet(sl.rec); startSlot(i); }, C.clip.SEG_MS);
    }
    function finalizeSlot(i) {
      return new Promise((resolve) => {
        const sl = rec.slots[i], r = sl.rec, chunks = sl.chunks;
        if (!r || r.state === 'inactive') { resolve(null); return; }
        clearTimeout(sl.timer); sl.live = false;
        const startedAt = sl.startedAt;
        r.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        r.onstop = () => { const blob = chunks.length ? new Blob(chunks, { type: rec.mime || 'video/webm' }) : null; if (rec.on) startSlot(i); resolve(blob ? { blob, ms: now() - startedAt } : null); };
        try { r.stop(); } catch (e) { resolve(null); }
      });
    }
    function captureClip(reason, followMs, openWhenReady) {
      if (!rec.ok || !rec.on) { if (openWhenReady) ctx.toast(rec.ok ? 'RECORDER OFF — ENABLE IN SETTINGS' : 'CLIP RECORDING NOT SUPPORTED', 'warn'); return; }
      if (rec.busy) { rec.wantOpen = rec.wantOpen || !!openWhenReady; return; }
      if (!CORE.pickClipSlot(rec.slots, now())) { ctx.toast('RECORDER WARMING UP…', 'warn'); return; }
      rec.busy = true; rec.wantOpen = !!openWhenReady;
      setTimeout(async () => {
        try {
          const pick = CORE.pickClipSlot(rec.slots, now());
          const res = pick ? await finalizeSlot(pick.index) : null;
          if (res) setPending(res.blob, reason, res.ms);
        } catch (e) { /* swallowed: recorder is best-effort */ }
        rec.busy = false;
        if (rec.wantOpen && rec.pending) { rec.wantOpen = false; openModal(); }
      }, followMs);
    }
    function setPending(blob, reason, ms) {
      if (rec.url) { try { URL.revokeObjectURL(rec.url); } catch (e) {} rec.url = null; }
      rec.pending = { blob, reason, ms, name: 'shotline-stunt-' + Date.now() + '.' + rec.ext };
      if (ui.modal.classList.contains('on')) { rec.url = URL.createObjectURL(blob); ui.video.src = rec.url; }
    }
    function showHint(reason) {
      ui.hintTxt.textContent = mobile ? '[ TAP: EXPORT TIKTOK CLIP ]' : '[ PRESS ' + keyName(B().clip) + ': EXPORT TIKTOK CLIP ]';
      ui.hintSub.textContent = reason; ui.hint.classList.add('on'); rec.hintT = 7; sfx.clip(); haptic(15);
    }
    function onStunt(reason) { showHint(reason); captureClip(reason, C.clip.FOLLOW_MS, false); }
    function openClip() {
      ui.hint.classList.remove('on'); rec.hintT = 0;
      if (rec.pending) { openModal(); return; }
      captureClip('MANUAL', 0, true);
    }
    function openModal() {
      if (!rec.pending) return;
      if (rec.url) { try { URL.revokeObjectURL(rec.url); } catch (e) {} }
      rec.url = URL.createObjectURL(rec.pending.blob);
      ui.video.src = rec.url; ui.video.muted = true; ui.modalMeta.textContent = rec.pending.reason + ' · ' + Math.max(1, Math.round(rec.pending.ms / 1000)) + 's · ' + (rec.pending.blob.size / 1048576).toFixed(1) + ' MB';
      ui.share.style.display = canShare() ? '' : 'none';
      ui.modal.classList.add('on'); ctx.onModal(true);
      try { const p = ui.video.play(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
    }
    function closeModal() {
      ui.modal.classList.remove('on'); try { ui.video.pause(); } catch (e) {} ctx.onModal(false);
    }
    function clipFile() { return new File([rec.pending.blob], rec.pending.name, { type: rec.pending.blob.type || 'video/webm' }); }
    function canShare() { try { return !!(rec.pending && navigator.canShare && typeof File !== 'undefined' && navigator.canShare({ files: [clipFile()] })); } catch (e) { return false; } }
    function downloadClip() {
      if (!rec.pending) return;
      const a = doc.createElement('a'); a.href = rec.url || URL.createObjectURL(rec.pending.blob); a.download = rec.pending.name;
      doc.body.appendChild(a); a.click(); a.remove();
    }
    async function shareClip() {
      try { await navigator.share({ files: [clipFile()], title: 'ShotLine stunt', text: 'Check this ShotLine stunt!' }); } catch (e) { /* user cancelled */ }
    }
    function governor(realDt) {                                   /* never let recording tank the frame rate */
      if (!rec.on) return;
      rec.ema = lerp(rec.ema, realDt * 1000, 0.05);
      rec.lowT = rec.ema > (mobile ? 45 : 36) ? rec.lowT + realDt : Math.max(0, rec.lowT - realDt);
      if (rec.lowT > 6) { recStop(); ctx.toast('STUNT RECORDER PAUSED — LOW FPS', 'warn'); try { localStorage.setItem('shotline.clip', '0'); const cb = ctx.$('optClip'); if (cb) cb.checked = false; } catch (e) {} }
    }

    /* ================= 5. MATCH + VICTORY ================= */
    const match = { over: false, t0: 0, limit: 0, timeLimit: 0, netEndsAt: 0, nextAt: 0, phase: 'play', deployReady: false, meId: null };
    const vic = { active: false, t: 0, wrap: null, bones: null, holder: null, spot: null, cone: null, pool: null, conf: null, exposure0: 1, lastFov: 0, cam: {}, p: {}, panelOn: false, head: 0 };
    const SOLDIER_BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];

    function boardFromFighters() {
      return ctx.fighters().map((f) => ({ id: f.isPlayer ? '__me' : String(f.name), name: f.name, kills: f.kills | 0, deaths: f.deaths | 0, me: !!f.isPlayer }));
    }
    function matchReset() {
      cleanupVictory(); match.over = false; match.phase = 'play'; match.deployReady = false; match.nextAt = 0; match.t0 = ctx.getT();
      const multi = ctx.getMode() === 'multi';
      match.limit = multi ? 25 : SINGLE_RULES.scoreLimit; match.timeLimit = multi ? 0 : SINGLE_RULES.timeLimitSec; match.netEndsAt = 0;
      setStreak(0); ghost.ring.clear(); sling.S.active = false; sling.S.flight = false; sling.S.cd = 0;
    }
    function matchSimTick() {
      if (match.over || !match.limit || !match.timeLimit || ctx.getMode() !== 'single') return;   /* never end a match that was not initialised */
      const st = ctx.getState(); if (st !== 'playing' && st !== 'dead') return;
      const board = boardFromFighters(), why = CORE.matchOver(board, match.limit, match.timeLimit, ctx.getT() - match.t0);
      if (why) endMatch(why, board, undefined, '__me');
    }
    function endMatch(reason, boardIn, winnerId, meId) {
      if (match.over) return; match.over = true; match.meId = meId;
      const board = CORE.rankBoard(boardIn).map((r) => Object.assign({}, r, { me: r.id === meId }));
      const w = winnerId !== undefined ? (board.find((r) => r.id === winnerId) || null) : CORE.matchWinner(board);
      const iWon = !!(w && w.id === meId);
      releaseGrapple(true); sling.S.flight = false; ghost.ring.clear();
      ui.hint.classList.remove('on'); ui.modal.classList.remove('on');
      ctx.enterEnded();
      fillPanel(board, w, iWon, reason);
      if (iWon) startVictory(); else showPanel();
    }
    function fillPanel(board, w, iWon, reason) {
      ui.vTitle.textContent = iWon ? 'VICTORY' : (w ? 'MATCH OVER' : 'DRAW');
      ui.vTitle.className = 'nx-vtitle' + (iWon ? ' win' : '');
      ui.vSub.textContent = (w ? (iWon ? 'You are the top operator' : w.name + ' wins') : 'No clear winner') + ' · ' + (reason === 'score' ? 'score limit' : 'time limit');
      ui.vList.textContent = '';
      board.slice(0, 6).forEach((r, i) => {
        const row = el('div', 'nx-row' + (r.me ? ' me' : ''), ui.vList);
        el('span', 'nx-rk', row, String(i + 1)); el('span', 'nx-nm', row, r.name); el('span', 'nx-kd', row, r.kills + ' / ' + r.deaths);
      });
      const multi = ctx.getMode() === 'multi';
      ui.bAgain.style.display = multi ? 'none' : ''; ui.bDeploy.style.display = 'none'; ui.vWait.style.display = multi ? '' : 'none';
    }
    function showPanel() { vic.panelOn = true; ui.vic.classList.add('panel'); ui.skip.classList.remove('on'); }

    function bone(n) { return vic.bones && vic.bones[n]; }
    function buildSoldier() {
      const SG = ctx.SOLDIER_GEN; if (!SG) return false;
      const gen = SG.build({ slim: ctx.playerSlim() }), root = gen.scene;
      try { const tex = ctx.playerSkin(); if (tex) SG.applySkin(root, tex); } catch (e) {}
      const bones = {}; for (const n of SOLDIER_BONES) bones[n] = root.getObjectByName('mixamorig' + n);
      if (!bones.Hips || !bones.RightHand) return false;
      const wrap = new T.Group(); wrap.add(root); wrap.rotation.y = vic.p.yaw + Math.PI; wrap.position.set(vic.p.px, vic.p.py, vic.p.pz);
      ctx.scene.add(wrap); vic.wrap = wrap; vic.bones = bones; vic.hipY = SG.HIPY;
      try {                                                        /* the weapon the player actually used */
        const kind = ctx.weaponKey(), gun = ctx.gunInst(kind === 'fist' ? 'rifle' : kind), An = gun.userData && gun.userData.anch;
        const holder = new T.Group(); holder.rotation.x = -Math.PI / 2;          /* barrel (-Z) -> along the forearm (-Y) */
        if (An && An.rGrip) { const gp = new T.Vector3(-An.rGrip[0], -An.rGrip[1], -An.rGrip[2]).applyEuler(holder.rotation); gun.position.copy(gp); }
        gun.scale.setScalar(1.15); holder.add(gun); holder.position.set(0, -0.03, 0); bones.RightHand.add(holder); vic.holder = holder;
      } catch (e) { try { console.warn('[ShotlineSystems] victory weapon prop skipped', e); } catch (_) {} }
      return true;
    }
    function poseSoldier(t) {
      const b = bone, bounce = Math.abs(Math.sin(t * 4.4)), sw = Math.sin(t * 2.2);
      b('Hips').position.y = vic.hipY - 0.012 + 0.02 * bounce;
      b('Spine').rotation.set(-0.05, 0.05 * sw, 0); b('Spine1').rotation.set(-0.04, 0.07 * sw, 0); b('Spine2').rotation.set(-0.05, 0.1 * sw, 0);
      /* right arm straight up, slightly outward, holding the weapon overhead (hanging arm is -Y; Rz(-pi) points it up) */
      b('RightArm').rotation.set(-0.1, 0, -Math.PI + 0.3 + 0.05 * Math.sin(t * 5));
      b('RightForeArm').rotation.set(-0.22, 0, 0); b('RightHand').rotation.set(0, 0, 0);
      /* left arm: double-bicep flex — upper arm out to the side, forearm curled up */
      b('LeftArm').rotation.set(0, 0, Math.PI / 2 - 0.05 + 0.04 * Math.sin(t * 3.1));
      b('LeftForeArm').rotation.set(0, 0, 1.95 + 0.12 * Math.sin(t * 3.1 + 1)); b('LeftHand').rotation.set(0, 0, 0);
      /* wide victory stance with a bounce */
      b('LeftUpLeg').rotation.set(-0.02, 0, 0.15); b('RightUpLeg').rotation.set(-0.02, 0, -0.15);
      b('LeftLeg').rotation.set(0.1 + 0.12 * bounce, 0, 0); b('RightLeg').rotation.set(0.1 + 0.12 * bounce, 0, 0);
      b('LeftFoot').rotation.set(-0.1 - 0.06 * bounce, 0, -0.1); b('RightFoot').rotation.set(-0.1 - 0.06 * bounce, 0, 0.1);
      /* look at the camera */
      _v.copy(ctx.camera.position); vic.wrap.updateMatrixWorld(true); vic.wrap.worldToLocal(_v);
      const want = clamp(Math.atan2(_v.x, _v.z), -1.0, 1.0); vic.head = lerp(vic.head, want, 0.12);
      b('Neck').rotation.set(0, vic.head * 0.4, 0); b('Head').rotation.set(-0.06, vic.head * 0.6, 0);
    }
    const _v = new T.Vector3(), _v2 = new T.Vector3(), _up = new T.Vector3(0, -1, 0);

    function buildStage() {
      const gold = 0xffc24a, p = vic.p;
      const sp = new T.SpotLight(gold, mobile ? 2.2 : 3.2, 60, 0.42, 0.65, 1.2); sp.castShadow = false;
      sp.position.set(p.px, p.py + 13, p.pz); sp.target.position.set(p.px, p.py + 1, p.pz); ctx.scene.add(sp); ctx.scene.add(sp.target); vic.spot = sp;
      const H = 14, R = 2.8;
      const cone = new T.Mesh(new T.ConeGeometry(R, H, mobile ? 20 : 36, 1, true), new T.ShaderMaterial({
        transparent: true, depthWrite: false, side: T.DoubleSide, blending: T.AdditiveBlending, fog: false,
        uniforms: { uColor: { value: new T.Color(gold) }, uTime: { value: 0 }, uI: { value: 0 } },
        vertexShader: 'varying vec2 vUv;varying vec3 vN;varying vec3 vV;void main(){vUv=uv;vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.0);vV=-mv.xyz;gl_Position=projectionMatrix*mv;}',
        fragmentShader: 'uniform vec3 uColor;uniform float uTime;uniform float uI;varying vec2 vUv;varying vec3 vN;varying vec3 vV;void main(){float f=abs(dot(normalize(vN),normalize(vV)));float edge=pow(f,1.7);float along=0.12+0.88*vUv.y;float shim=0.85+0.15*sin(vUv.x*60.0+uTime*3.0+vUv.y*9.0);gl_FragColor=vec4(uColor*edge*along*shim*uI,1.0);}',
      }));
      cone.frustumCulled = false; ctx.scene.add(cone); vic.cone = cone; vic.coneH = H;
      const pool = new T.Mesh(new T.CircleGeometry(R * 0.95, 32), new T.MeshBasicMaterial({ color: gold, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, fog: false, side: T.DoubleSide }));
      pool.rotation.x = -Math.PI / 2; pool.frustumCulled = false; ctx.scene.add(pool); vic.pool = pool;
      const N = mobile ? 90 : 220, pos = new Float32Array(N * 3), vel = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) { pos[i * 3] = p.px + (Math.random() - 0.5) * 7; pos[i * 3 + 1] = p.py + Math.random() * 9; pos[i * 3 + 2] = p.pz + (Math.random() - 0.5) * 7; vel[i * 3] = (Math.random() - 0.5) * 0.5; vel[i * 3 + 1] = -(0.6 + Math.random() * 0.9); vel[i * 3 + 2] = (Math.random() - 0.5) * 0.5; }
      const pg = new T.BufferGeometry(); pg.setAttribute('position', new T.BufferAttribute(pos, 3));
      const conf = new T.Points(pg, new T.PointsMaterial({ color: 0xffd36a, size: mobile ? 0.14 : 0.1, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
      conf.frustumCulled = false; conf.userData.vel = vel; ctx.scene.add(conf); vic.conf = conf;
    }
    function updateStage(t, dt) {
      const p = vic.p, sweep = CORE.smooth(t / 2.6), ang = (1 - sweep) * Math.PI * 1.6, r = (1 - sweep) * 11;
      const tx = p.px + Math.cos(ang) * r, tz = p.pz + Math.sin(ang) * r, ty = p.py + (1 - sweep) * 0.2 + 1;
      vic.spot.position.set(p.px, p.py + 13, p.pz); vic.spot.target.position.set(tx, ty, tz);
      _v.set(p.px, p.py + 13, p.pz); _v2.set(tx - p.px, ty - (p.py + 13), tz - p.pz); const len = _v2.length(); _v2.multiplyScalar(1 / len);
      vic.cone.position.copy(_v).addScaledVector(_v2, len / 2); vic.cone.scale.set(1, len / vic.coneH, 1); vic.cone.quaternion.setFromUnitVectors(_up, _v2);
      const fadeIn = CORE.smooth(t / 0.9); vic.cone.material.uniforms.uI.value = 1.5 * fadeIn; vic.cone.material.uniforms.uTime.value = t;
      vic.pool.position.set(tx, ty - 0.92, tz); vic.pool.material.opacity = 0.38 * fadeIn; vic.spot.intensity = (mobile ? 2.2 : 3.2) * fadeIn;
      const arr = vic.conf.geometry.attributes.position.array, vel = vic.conf.userData.vel, k = Math.min(dt, 0.1);
      for (let i = 0; i < arr.length; i += 3) { arr[i] += vel[i] * k; arr[i + 1] += vel[i + 1] * k; arr[i + 2] += vel[i + 2] * k; if (arr[i + 1] < p.py) arr[i + 1] = p.py + 9; }
      vic.conf.geometry.attributes.position.needsUpdate = true;
      ctx.setExposure(lerp(vic.exposure0, vic.exposure0 * 0.72, CORE.smooth(t / 1.2)));
    }

    function startVictory() {
      const V = C.victory, cam = ctx.camera, p = vic.p;
      p.px = player.x; p.pz = player.z; p.py = ctx.groundY(player.x, player.y, player.z); if (!(p.py <= player.y + 0.5)) p.py = player.y;
      p.yaw = ctx.getYaw(); p.eye = ctx.EYE; p.fov0 = cam.fov;
      p.fx = cam.position.x; p.fy = cam.position.y; p.fz = cam.position.z;
      cam.getWorldDirection(_v); p.fdx = _v.x; p.fdy = _v.y; p.fdz = _v.z;
      vic.active = true; vic.t = 0; vic.panelOn = false; vic.head = 0; vic.exposure0 = ctx.getExposure();
      ctx.hidePlayerBody();
      const okSoldier = buildSoldier(); buildStage();
      if (!okSoldier) { vic.noSoldier = true; }
      const px = CORE.letterboxPx(ctx.vw(), ctx.vh(), V.RATIO); ui.vic.style.setProperty('--nx-bar', px + 'px');
      ui.barT.classList.add('on'); ui.barB.classList.add('on'); ui.skip.classList.add('on');
      ui.vic.classList.remove('panel'); ui.vic.classList.add('show');
      ctx.banner('VICTORY', '#ffc24a'); sfx.tier(3); haptic([30, 40, 30, 40, 80]);
    }
    function updateVictory(realDt) {
      const V = C.victory; vic.t += realDt;
      if (vic.wrap) poseSoldier(vic.t);
      updateStage(vic.t, realDt);
      const cam = ctx.camera, out = CORE.victoryCam(vic.t, vic.p, vic.cam);
      /* keep the dolly out of walls */
      const tx = vic.p.px, ty = vic.p.py + V.LOOK_Y, tz = vic.p.pz;
      let ox = out.x - tx, oy = out.y - ty, oz = out.z - tz; const len = Math.hypot(ox, oy, oz);
      if (len > 0.8) { const h = ctx.castRay(tx, ty, tz, ox / len, oy / len, oz / len, len + 0.3, player); if (h && h.world && h.t < len) { const k = Math.max(0.35, (h.t - 0.25) / len); ox *= k; oy *= k; oz *= k; } }
      cam.position.set(tx + ox, ty + oy, tz + oz); cam.up.set(0, 1, 0); cam.lookAt(out.lx, out.ly, out.lz); cam.rotation.z = 0;
      if (Math.abs(cam.fov - out.fov) > 0.05) { cam.fov = out.fov; cam.updateProjectionMatrix(); }
      cam.updateMatrixWorld(true);
      if (!vic.panelOn && vic.t >= V.DURATION - 1.2) showPanel();
    }
    function cleanupVictory() {
      const wasActive = vic.active || vic.wrap || vic.spot;
      if (vic.wrap) { ctx.scene.remove(vic.wrap); vic.wrap.traverse((o) => { if (o.geometry && o.geometry.dispose) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); }); vic.wrap = null; }
      for (const k of ['spot', 'cone', 'pool', 'conf']) { const o = vic[k]; if (!o) continue; ctx.scene.remove(o); if (o.target) ctx.scene.remove(o.target); if (o.geometry && o.geometry.dispose) o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); vic[k] = null; }
      vic.bones = null; vic.holder = null; vic.active = false; vic.panelOn = false; vic.noSoldier = false;
      if (ui.vic) { ui.vic.classList.remove('show', 'panel'); ui.barT.classList.remove('on'); ui.barB.classList.remove('on'); ui.skip.classList.remove('on'); }
      if (wasActive) { try { ctx.setExposure(vic.exposure0); } catch (e) {} }
    }

    /* ---- multiplayer match messages ---- */
    function netMessage(msg) {
      switch (msg.t) {
        case 'match':
          match.limit = msg.limit | 0 || match.limit; match.netEndsAt = msg.phase === 'ended' ? 0 : now() + (msg.left | 0);
          if (msg.phase === 'ended') { match.phase = 'ended'; match.nextAt = now() + (msg.next | 0); }
          break;
        case 'matchstart':
          match.over = false; match.phase = 'play'; match.netEndsAt = now() + (msg.left | 0); match.limit = msg.limit | 0 || match.limit; match.deployReady = true;
          setStreak(0); ghost.ring.clear();
          if (ctx.getState() === 'ended') { ui.vWait.style.display = 'none'; ui.bDeploy.style.display = ''; ui.vSub.textContent = 'New match is live — deploy!'; }
          break;
        case 'matchend': {
          if (match.over) break;
          match.phase = 'ended'; match.nextAt = now() + (msg.next | 0);
          const board = (msg.board || []).map((r) => ({ id: r.id, name: r.name, kills: r.kills | 0, deaths: r.deaths | 0 }));
          if (ctx.getState() === 'menu') break;
          endMatch(msg.reason || 'time', board, msg.winner === null || msg.winner === undefined ? null : msg.winner, ctx.selfId());
          break;
        }
        case 'sl': {
          if (msg.id === ctx.selfId()) break;
          const old = sling.remote.get(msg.id);
          if (!msg.on) { if (old) { disposeTether(old.g); sling.remote.delete(msg.id); } break; }
          if (!msg.a || old) { if (old && msg.a) { old.ax = msg.a[0]; old.ay = msg.a[1]; old.az = msg.a[2]; old.until = now() + 12000; } break; }
          sling.remote.set(msg.id, { g: makeTether(false), ax: msg.a[0], ay: msg.a[1], az: msg.a[2], until: now() + 12000, seed: Math.random() * 10 });
          break;
        }
        case 'rc':
          if (msg.a) shockwave(msg.a[0], msg.a[1], msg.a[2], 0x62e9ff, 12, 0.9);
          if (msg.b) shockwave(msg.b[0], msg.b[1], msg.b[2], 0x66f2ff, 6, 0.7);
          break;
      }
    }
    function matchClockText() {
      if (match.over) return 'MATCH OVER';
      if (ctx.getMode() === 'single') return CORE.clockText(match.timeLimit - (ctx.getT() - match.t0));
      return match.netEndsAt ? CORE.clockText((match.netEndsAt - now()) / 1000) : '';
    }
    function matchSubtitle(mode) {
      return mode === 'multi' ? 'First to ' + (match.limit || 25) + ' · 10:00 · rematch after' : 'First to ' + SINGLE_RULES.scoreLimit + ' · ' + CORE.clockText(SINGLE_RULES.timeLimitSec) + ' · ' + 4 + ' bots';
    }

    /* ================= UI ================= */
    function buildUI() {
      ui.root = doc.createElement('div'); ui.root.id = 'nx-root'; doc.body.appendChild(ui.root);
      ui.hint = el('button', 'nx-hint', null); ui.hint.type = 'button';
      ui.hintTxt = el('span', 'nx-hint-t', ui.hint, ''); ui.hintSub = el('span', 'nx-hint-s', ui.hint, '');
      ui.hint.addEventListener('click', () => api.openClip());
      ui.tier = el('div', 'nx-tier');
      ui.cool = el('div', 'nx-cool');
      ui.crt = el('div', 'nx-crt');
      ui.skip = el('div', 'nx-skip'); ui.skip.addEventListener('click', () => { if (vic.active && !vic.panelOn) vic.t = Math.max(vic.t, C.victory.DURATION - 1.1); });
      ui.barT = el('div', 'nx-bar nx-bar-t'); ui.barB = el('div', 'nx-bar nx-bar-b');
      ui.vic = el('div', 'nx-victory');
      const card = el('div', 'nx-vcard', ui.vic);
      ui.vTitle = el('div', 'nx-vtitle', card, ''); ui.vSub = el('div', 'nx-vsub', card, ''); ui.vList = el('div', 'nx-vlist', card);
      ui.vWait = el('div', 'nx-vwait', card, '');
      const btns = el('div', 'nx-vbtns', card);
      ui.bAgain = el('button', 'nx-btn gold', btns, 'PLAY AGAIN'); ui.bDeploy = el('button', 'nx-btn gold', btns, 'DEPLOY'); ui.bMenu = el('button', 'nx-btn', btns, 'MENU');
      ui.bAgain.type = ui.bDeploy.type = ui.bMenu.type = 'button';
      ui.bAgain.addEventListener('click', () => { cleanupVictory(); ctx.playAgain(); });
      ui.bDeploy.addEventListener('click', () => { cleanupVictory(); ctx.deploy(); });
      ui.bMenu.addEventListener('click', () => { cleanupVictory(); ctx.toMenu(); });
      ui.modal = el('div', 'nx-modal', null);
      const mc = el('div', 'nx-mcard', ui.modal);
      el('div', 'nx-mtitle', mc, 'STUNT CLIP READY');
      ui.video = el('video', 'nx-video', mc); ui.video.setAttribute('playsinline', ''); ui.video.setAttribute('controls', ''); ui.video.loop = true; ui.video.muted = true;
      ui.modalMeta = el('div', 'nx-mmeta', mc, '');
      const mb = el('div', 'nx-vbtns', mc);
      ui.dl = el('button', 'nx-btn gold', mb, 'Download Stunt Video'); ui.share = el('button', 'nx-btn', mb, 'Share'); ui.close = el('button', 'nx-btn', mb, 'Close');
      ui.dl.type = ui.share.type = ui.close.type = 'button';
      ui.dl.addEventListener('click', downloadClip); ui.share.addEventListener('click', shareClip); ui.close.addEventListener('click', closeModal);
      ui.modal.addEventListener('click', (e) => { if (e.target === ui.modal) closeModal(); });
      doc.addEventListener('keydown', (e) => {                       /* capture: while the modal is open it owns the keyboard */
        if (!ui.modal.classList.contains('on')) return;
        e.stopPropagation();
        if (e.code === 'Escape' || e.code === B().clip) { e.preventDefault(); closeModal(); }
      }, true);
    }

    /* ================= public API ================= */
    function onKeyDown(e, castPowerFn) {
      if (e.repeat) return false;
      const code = e.code, b = B(), st = ctx.getState();
      if (code === b.clip && (st === 'playing' || st === 'dead' || st === 'ended')) { e.preventDefault(); openClip(); return true; }
      if (st !== 'playing' || ctx.isPaused()) return false;
      if (code === b.grapple) { e.preventDefault(); pressGrapple(); return true; }
      if (code === b.recall) {
        const t = now(), shared = b.recall === b.power;
        if (ghost.tap && t - ghost.tap <= C.ghost.DOUBLE_TAP_MS) {            /* second tap: Chrono-Recall */
          ghost.tap = 0; if (ghost.pendingPower) { clearTimeout(ghost.pendingPower); ghost.pendingPower = 0; }
          recall(); return true;
        }
        ghost.tap = t;
        if (shared && P.power && P.powerCd <= 0 && canRecall()) {             /* defer the power one tap-window so a double-tap can win */
          ghost.pendingPower = setTimeout(() => { ghost.pendingPower = 0; try { castPowerFn(); } catch (err) {} }, C.ghost.DOUBLE_TAP_MS);
          return true;
        }
        return !shared;
      }
      return false;
    }
    function simTick(dt) {
      sling.S.cd = Math.max(0, sling.S.cd - dt);
      if (sling.S.flight) sling.S.speed = Math.hypot(player.vx, player.vy, player.vz);
      CORE.slingFlight(sling.S, player, dt);
      ghostSimTick(dt);
      matchSimTick();
    }
    function frameUpdate(realDt) {
      const time = now() / 1000;
      tierState.b2 = lerp(tierState.b2, tierState.tier >= 2 ? 1 : 0, Math.min(1, realDt * 4));
      tierState.b3 = lerp(tierState.b3, tierState.tier >= 3 ? 1 : 0, Math.min(1, realDt * 4));
      recallPulse = Math.max(0, recallPulse - realDt * 2.5);
      updateShocks(realDt); updateTether(time); updateRemoteSling(time); updateGhostMesh(time, realDt); updateBolts(realDt);
      if (vic.active) updateVictory(realDt);
      if (rec.hintT > 0) { rec.hintT -= realDt; if (rec.hintT <= 0) ui.hint.classList.remove('on'); }
      ui.hint.style.display = (ctx.getState() === 'menu') ? 'none' : '';
      governor(realDt);
      if ((faults._hudT = (faults._hudT || 0) - realDt) <= 0) { faults._hudT = 0.1; hudUpdate(); }
    }
    function hudUpdate() {
      const S = sling.S, g = ghost, st = ctx.getState();
      const rp = g.cd > 0 ? Math.round(g.cd / C.ghost.COOLDOWN * 100) : 0;
      if (!mobile) {
        const b = B();
        ui.cool.textContent = st === 'playing' ? '[' + keyName(b.grapple) + '] GRAPPLE' + (S.cd > 0 ? ' …' : '') + '   [' + keyName(b.recall) + '×2] RECALL ' + (g.cd > 0 ? g.cd.toFixed(1) + 's' : (g.ring.count >= C.ghost.MIN_FRAMES ? 'READY' : '…')) : '';
      }
      const mR = ctx.$('mRecall'), mG = ctx.$('mGrapple');
      if (mR) { mR.style.setProperty('--p', rp); mR.classList.toggle('cooling', g.cd > 0 || g.ring.count < C.ghost.MIN_FRAMES); }
      if (mG) { mG.classList.toggle('cooling', S.cd > 0 && !S.active); mG.classList.toggle('on', S.active); }
      if (match.phase === 'ended' && ctx.getMode() === 'multi' && ctx.getState() === 'ended' && !match.deployReady) {
        const left = Math.max(0, Math.ceil((match.nextAt - now()) / 1000)); ui.vWait.textContent = 'NEXT MATCH IN ' + left + 's';
      }
    }
    const api = {
      onKeyDown: guard('keys', onKeyDown, false),
      pressGrapple: guard('sling', pressGrapple, false), releaseGrapple: guard('sling', () => releaseGrapple(false), undefined),
      recallTap: guard('ghost', recall, false), openClip: guard('clip', openClip, undefined),
      preMove: guard('sling', slingPreMove, undefined), postMove: guard('sling', slingPostMove, undefined),
      dampK: () => (sling.S.active ? 0 : (sling.S.flight && !player.onGround ? C.sling.FLIGHT_DAMP : 1)),
      cushion: () => !!(sling.S.active || sling.S.flight),
      onLanded: guard('sling', (drop) => { if ((sling.S.active || sling.S.flight) && drop > 6) { ctx.toast('IMPACT ABSORBED', 'good'); shockwave(player.x, player.y, player.z, 0x62e9ff, 6, 0.5); haptic(25); } }, undefined),
      fovBonus: () => C.tier.FOV_T2 * tierState.b2 + ((sling.S.active || sling.S.flight) ? clamp((sling.S.speed - 15) / 37, 0, 1) * 9 : 0),
      aberration: () => 0.0013 * tierState.b2 + 0.0009 * tierState.b3 + ((sling.S.active || sling.S.flight) ? clamp(sling.S.speed / 52, 0, 1) * 0.0006 : 0) + recallPulse * 0.004 + (dil.k > 0 ? dil.k * 0.0012 : 0),
      tracerMat: () => (tierState.tier >= 2 ? (tierState.violetMat || (tierState.violetMat = new T.MeshBasicMaterial({ color: 0xb23cff, fog: false, transparent: true, opacity: 0.95, blending: T.AdditiveBlending, depthWrite: false }))) : null),
      timeScale: guard('time', (realDt) => {
        const st = ctx.getState();
        let s = CORE.dilationStep(dil, realDt, ctx.isAds(), tierState.tier >= 3 && player.alive && st === 'playing');
        lastScale = s;
        if (vic.active && vic.t < C.victory.DURATION) s *= C.victory.SLOWMO;
        return s;
      }, 1),
      aimComp: () => 1 / Math.max(0.2, lastScale),
      simTick: guard('sim', simTick, undefined), frameUpdate: guard('frame', frameUpdate, undefined),
      onLocalKill: guard('kill', (victim, head) => {
        setStreak(tierState.streak + 1);
        const dist = victim ? Math.hypot(victim.x - player.x, victim.y - player.y, victim.z - player.z) : 0;
        const gy = ctx.groundY(player.x, player.y, player.z);
        const why = CORE.stuntReason({ airborne: !player.onGround, height: player.y - gy, head: !!head, dist, multi: ctx.multiKillCount() });
        if (why) onStunt(why);
      }, undefined),
      onLocalDeath: guard('death', () => {
        const had = tierState.streak > 0; setStreak(0); releaseGrapple(true); sling.S.flight = false; dil.active = false; ghost.ring.clear();
        if (had || tierState.b2 > 0.05) crtFlash();
      }, undefined),
      onLocalSpawn: guard('spawn', () => { ghost.ring.clear(); ghost.has = false; sling.S.active = false; sling.S.flight = false; if (sling.tether) sling.tether.visible = false; ui.hint.classList.remove('on'); }, undefined),
      onSnap: guard('snap', () => { ghost.ring.clear(); ghost.has = false; releaseGrapple(true); sling.S.flight = false; }, undefined),
      onMatchReset: guard('match', matchReset, undefined),
      onLeave: guard('leave', () => { recStop(); releaseGrapple(true); cleanupVictory(); closeModal(); for (const r of sling.remote.values()) disposeTether(r.g); sling.remote.clear(); ui.hint.classList.remove('on'); }, undefined),
      onPlaying: guard('rec', () => { recStart(); }, undefined),
      setRecorderEnabled: guard('rec', (on) => { if (on) { recDetect(); recStart(); } else recStop(); }, undefined),
      netMessage: guard('net', netMessage, undefined),
      matchClockText, matchSubtitle,
      audioBus: (ac) => {
        try {
          if (!ac || !ac.createMediaStreamDestination) return null;
          if (rec.bus && rec.busCtx === ac) return rec.bus;
          const bus = ac.createGain(); bus.connect(ac.destination);
          const tap = ac.createMediaStreamDestination(); bus.connect(tap);
          rec.bus = bus; rec.busCtx = ac; rec.tapAudio = tap;
          if (ctx.rerouteUltra) ctx.rerouteUltra(bus);
          return bus;
        } catch (e) { return null; }
      },
      cleanupVictory,
      isSlinging: () => sling.S.active,
      debug: { sling, ghost, tierState, rec, match, vic, dil, faults, ui },
    };

    buildUI(); buildGhost(); buildBolts(); recDetect();
    return api;
  }

  /* neutral stand-in used by main.js if this file failed to load or create() throws */
  const NEUTRAL = { dampK: 1, cushion: false, fovBonus: 0, aberration: 0, tracerMat: null, timeScale: 1, aimComp: 1, matchClockText: '', matchSubtitle: '', audioBus: null, onKeyDown: false, isSlinging: false };
  const noop = new Proxy({}, { get: (_, k) => ((k in NEUTRAL) ? () => NEUTRAL[k] : () => undefined) });
  const out = { create, noop };
  root.ShotlineSystems = out;
  if (typeof module === 'object' && module.exports) module.exports = out;
})(typeof self !== 'undefined' ? self : this);
