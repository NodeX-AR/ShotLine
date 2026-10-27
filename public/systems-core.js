/* ShotLine Kinetic Systems — pure core (no THREE, no DOM).
   UMD: window.SHOTLINE_CORE in the browser, module.exports in Node (tests/systems.cjs).
   Everything here is deterministic and allocation-light so it can be unit-tested headlessly. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SHOTLINE_CORE = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const easeInOutSine = (t) => -(Math.cos(Math.PI * clamp(t, 0, 1)) - 1) / 2;

  const CFG = Object.freeze({
    sling: Object.freeze({
      RANGE: 45, MIN_ROPE: 6, BOB: 1.25,
      PUMP: 21,            /* m/s^2 applied perpendicular to the rope, along the arc */
      STEER: 7, REEL: 9,   /* reel shortens the rope and conserves angular momentum */
      MAX_SPEED: 52,       /* 52^2/(2*24) = 56 m of pure-vertical rise: the "50-60 m" launch */
      MAX_HOLD: 6.5, COOLDOWN: 0.45, MIN_RISE: 2.5, ATTACH_PULL: 7,
      RELEASE_BOOST: 1.1, FLIGHT_MAX: 9, FLIGHT_DAMP: 0.06, SLACK_PUMP: 0.4,
      ABOVE_LO: -0.1, ABOVE_HI: 0.3, /* pump fades out as the bob rises past the anchor's height */
    }),
    ghost: Object.freeze({ FRAMES: 150, HZ: 60, COOLDOWN: 8, MIN_FRAMES: 60, DOUBLE_TAP_MS: 260, JUMP_RESET: 12 }),
    tier: Object.freeze({
      T2: 3, T3: 5, FOV_T2: 6,
      DILATE: Object.freeze({ SCALE: 0.7, RAMP: 0.35, HOLD: 2.2, COOLDOWN: 3.0 }),
    }),
    clip: Object.freeze({ SEG_MS: 10000, OFFSET_MS: 5000, MIN_MS: 5000, FLOOR_MS: 1500, FOLLOW_MS: 1200,
      HEAD_DIST: 35, MULTI: 2, AIR_HEIGHT: 1.5 }),
    victory: Object.freeze({ PULL: 3.5, RISE: 1.0, BLEND: 1.1, ORBIT_START: 0.5, ORBIT_DUR: 8.5, DURATION: 11, FOV: 50,
      LOOK_Y: 1.25, SLOWMO: 0.25, RATIO: 2.39 }),
  });

  /* ---------------- typed ring buffer ---------------- */
  class Ring {
    constructor(cap, stride) {
      this.cap = cap | 0; this.stride = stride | 0;
      this.data = new Float32Array(this.cap * this.stride);
      this.head = 0; this.count = 0;
    }
    push(a) {
      const o = this.head * this.stride;
      for (let i = 0; i < this.stride; i++) this.data[o + i] = a[i] || 0;
      this.head = (this.head + 1) % this.cap;
      if (this.count < this.cap) this.count++;
    }
    /* logical index 0 = oldest, count-1 = newest; returns the offset into .data */
    offset(i) { const start = (this.head - this.count + this.cap) % this.cap; return ((start + i) % this.cap) * this.stride; }
    clear() { this.head = 0; this.count = 0; }
  }

  /* ---------------- kinetic pendulum ----------------
     b = { x,y,z (feet), vx,vy,vz, onGround }.  Gravity + collision are integrated by the game's own
     physics(); we add the rope constraint after it (position-based), plus a tangential pump. */
  function slingCreate() { return { active: false, ax: 0, ay: 0, az: 0, len: 0, t: 0, flight: false, flightT: 0, cd: 0, speed: 0, taut: false }; }

  function bobDist(S, b) {
    return Math.hypot(b.x - S.ax, b.y + CFG.sling.BOB - S.ay, b.z - S.az);
  }

  function clampSpeed(b, max) {
    const s = Math.hypot(b.vx, b.vy, b.vz);
    if (s > max) { const k = max / s; b.vx *= k; b.vy *= k; b.vz *= k; }
  }

  function slingAttach(S, b, ax, ay, az) {
    const C = CFG.sling;
    S.active = true; S.ax = ax; S.ay = ay; S.az = az; S.t = 0; S.flight = false; S.flightT = 0;
    S.len = clamp(bobDist(S, b), C.MIN_ROPE, C.RANGE);
    const dx = ax - b.x, dy = ay - (b.y + C.BOB), dz = az - b.z, d = Math.hypot(dx, dy, dz) || 1;
    b.vx += (dx / d) * C.ATTACH_PULL; b.vy += (dy / d) * C.ATTACH_PULL; b.vz += (dz / d) * C.ATTACH_PULL;
    if (b.onGround) { b.onGround = false; b.vy = Math.max(b.vy, 3); }
    clampSpeed(b, C.MAX_SPEED);
  }

  /* inp: { fx,fy,fz (aim unit vec), mx,mz (move dir, 0..1), reel:boolean } — call BEFORE physics */
  function slingPre(S, b, dt, inp) {
    const C = CFG.sling;
    S.t += dt;
    let rx = b.x - S.ax, ry = b.y + C.BOB - S.ay, rz = b.z - S.az;
    const d = Math.hypot(rx, ry, rz);
    if (d < 1e-3) return;
    const nx = rx / d, ny = ry / d, nz = rz / d;
    S.taut = d >= S.len - 0.4;

    if (inp.reel && S.len > C.MIN_ROPE) {
      const old = S.len; S.len = Math.max(C.MIN_ROPE, S.len - C.REEL * dt);
      const k = clamp(old / S.len, 1, 1.25);                 /* L*omega conserved: shorter rope => faster arc */
      const vr = b.vx * nx + b.vy * ny + b.vz * nz;
      b.vx = nx * vr + (b.vx - nx * vr) * k; b.vy = ny * vr + (b.vy - ny * vr) * k; b.vz = nz * vr + (b.vz - nz * vr) * k;
    }

    const vr = b.vx * nx + b.vy * ny + b.vz * nz;
    let tx = b.vx - nx * vr, ty = b.vy - ny * vr, tz = b.vz - nz * vr;
    const ts = Math.hypot(tx, ty, tz);
    let dx, dy, dz;
    if (ts > 1.5) { dx = tx / ts; dy = ty / ts; dz = tz / ts; }
    else {                                                  /* at rest: swing toward where the player is looking */
      const dr = inp.fx * nx + inp.fy * ny + inp.fz * nz;
      dx = inp.fx - nx * dr; dy = inp.fy - ny * dr; dz = inp.fz - nz * dr;
      let l = Math.hypot(dx, dy, dz);
      if (l < 1e-3) { dx = -nz; dy = 0; dz = nx; l = Math.hypot(dx, dz) || 1; }
      dx /= l; dy /= l; dz /= l;
    }
    const aboveFade = 1 - smooth((ny - C.ABOVE_LO) / (C.ABOVE_HI - C.ABOVE_LO));
    const a = C.PUMP * (S.taut ? 1 : C.SLACK_PUMP) * aboveFade;
    b.vx += dx * a * dt; b.vy += dy * a * dt; b.vz += dz * a * dt;

    if (inp.mx || inp.mz) {                                 /* steering, projected onto the tangent plane */
      const sr = inp.mx * nx + inp.mz * nz;
      const sx = inp.mx - nx * sr, sy = -ny * sr, sz = inp.mz - nz * sr;
      b.vx += sx * C.STEER * dt; b.vy += sy * C.STEER * dt; b.vz += sz * C.STEER * dt;
    }
    clampSpeed(b, C.MAX_SPEED);
  }

  /* call AFTER physics(): enforce |bob-anchor| <= len, drop outward radial velocity. Returns tension 0..1. */
  function slingPost(S, b) {
    const C = CFG.sling;
    const rx = b.x - S.ax, ry = b.y + C.BOB - S.ay, rz = b.z - S.az;
    const d = Math.hypot(rx, ry, rz);
    S.speed = Math.hypot(b.vx, b.vy, b.vz);
    if (d < 1e-3) return 0;
    const nx = rx / d, ny = ry / d, nz = rz / d;
    if (d > S.len) {
      const ex = d - S.len;
      b.x -= nx * ex; b.y -= ny * ex; b.z -= nz * ex;
      const vr = b.vx * nx + b.vy * ny + b.vz * nz;
      if (vr > 0) { b.vx -= nx * vr; b.vy -= ny * vr; b.vz -= nz * vr; }
      return 1;
    }
    return clamp((d - (S.len - 1.5)) / 1.5, 0, 1);
  }

  function slingRelease(S, b) {
    const C = CFG.sling;
    const sp = Math.hypot(b.vx, b.vy, b.vz);
    if (sp > 10) { b.vx *= C.RELEASE_BOOST; b.vy *= C.RELEASE_BOOST; b.vz *= C.RELEASE_BOOST; clampSpeed(b, C.MAX_SPEED); }
    S.active = false; S.flight = true; S.flightT = 0; S.cd = C.COOLDOWN;
    return sp;
  }

  function slingFlight(S, b, dt) {
    if (!S.flight) return;
    S.flightT += dt;
    if ((b.onGround && S.flightT > 0.15) || S.flightT > CFG.sling.FLIGHT_MAX) S.flight = false;
  }

  /* ---------------- neural overdrive ---------------- */
  const tierOf = (streak) => (streak >= CFG.tier.T3 ? 3 : streak >= CFG.tier.T2 ? 2 : 1);

  function dilationCreate() { return { k: 0, active: false, hold: 0, cd: 0, wasAds: false, scale: 1 }; }
  /* realDt: unscaled seconds. Returns world-time scale (1 -> 0.7). Aim input is event-driven so it stays 1.0x. */
  function dilationStep(D, realDt, ads, enabled) {
    const C = CFG.tier.DILATE;
    D.cd = Math.max(0, D.cd - realDt);
    if (!enabled) { D.active = false; D.hold = 0; }
    else {
      if (ads && !D.wasAds && D.cd <= 0) { D.active = true; D.hold = 0; }
      if (!ads) D.active = false;
      if (D.active) { D.hold += realDt; if (D.hold >= C.HOLD) { D.active = false; D.cd = C.COOLDOWN; } }
    }
    D.wasAds = !!ads;
    const rate = 1 / C.RAMP;
    D.k = clamp(D.k + (D.active ? rate : -rate) * realDt, 0, 1);
    D.scale = lerp(1, C.SCALE, smooth(D.k));
    return D.scale;
  }

  /* ---------------- stunt clips ---------------- */
  function stuntReason(i) {
    const C = CFG.clip;
    if (i.airborne && i.height >= C.AIR_HEIGHT) return 'AIRBORNE KILL';
    if (i.head && i.dist > C.HEAD_DIST) return 'LONG HEADSHOT';
    if (i.multi >= C.MULTI) return 'MULTI KILL';
    return null;
  }
  /* slots: [{live,startedAt}] — pick the oldest live segment; "full" means it covers >= MIN_MS */
  function pickClipSlot(slots, now) {
    let best = null, age = -1;
    for (let i = 0; i < slots.length; i++) { const s = slots[i]; if (!s || !s.live) continue; const a = now - s.startedAt; if (a > age) { age = a; best = i; } }
    if (best === null || age < CFG.clip.FLOOR_MS) return null;
    return { index: best, age, full: age >= CFG.clip.MIN_MS };
  }

  /* ---------------- match ---------------- */
  function rankBoard(list) {
    return list.slice().sort((a, b) => ((b.kills | 0) - (a.kills | 0)) || ((a.deaths | 0) - (b.deaths | 0)) || String(a.id).localeCompare(String(b.id)));
  }
  function matchWinner(board) {
    const r = rankBoard(board);
    if (!r.length || (r[0].kills | 0) < 1) return null;
    if (r.length > 1 && (r[1].kills | 0) === (r[0].kills | 0) && (r[1].deaths | 0) === (r[0].deaths | 0)) return null;
    return r[0];
  }
  function matchOver(board, scoreLimit, timeLimitSec, elapsedSec) {
    let top = 0; for (const f of board) top = Math.max(top, f.kills | 0);
    if (top >= scoreLimit) return 'score';
    if (elapsedSec >= timeLimitSec) return 'time';
    return null;
  }
  function clockText(sec) {
    sec = Math.max(0, Math.ceil(sec));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }
  const letterboxPx = (vw, vh, ratio) => Math.max(0, (vh - vw / (ratio || CFG.victory.RATIO)) / 2);

  /* ---------------- victory camera ----------------
     p: {px,py,pz,yaw,eye, fx,fy,fz (first-person camera pos), fdx,fdy,fdz (fp forward), fov0}
     Returns camera pos, look-at point, fov. At t=0 it equals the first-person pose (no pop). */
  function victoryCam(t, p, out) {
    const V = CFG.victory;
    out = out || {};
    const e = smooth(t / V.BLEND);
    const o = easeInOutSine((t - V.ORBIT_START) / V.ORBIT_DUR);
    const th = p.yaw + o * TAU;                                  /* start behind the soldier, end behind him again */
    const tx = p.px, ty = p.py + V.LOOK_Y, tz = p.pz;
    const h = (p.eye - V.LOOK_Y) + V.RISE;                       /* "elevate 1 m" above the head-height eye */
    const ox = tx + Math.sin(th) * V.PULL, oy = ty + h, oz = tz + Math.cos(th) * V.PULL;
    out.x = lerp(p.fx, ox, e); out.y = lerp(p.fy, oy, e); out.z = lerp(p.fz, oz, e);
    const lx0 = p.fx + p.fdx * 10, ly0 = p.fy + p.fdy * 10, lz0 = p.fz + p.fdz * 10;
    out.lx = lerp(lx0, tx, e); out.ly = lerp(ly0, ty, e); out.lz = lerp(lz0, tz, e);
    out.fov = lerp(p.fov0, V.FOV, e); out.orbit = o; out.blend = e;
    return out;
  }

  /* ---------------- tether vertex noise ----------------
     Writes (segs+1) points into out[], endpoints pinned. tension 0..1 flattens the noise and removes sag. */
  function tetherPath(out, segs, sx, sy, sz, ex, ey, ez, t, amp, tension) {
    const dx = ex - sx, dy = ey - sy, dz = ez - sz, len = Math.hypot(dx, dy, dz) || 1e-6;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    let ax = 0, ay = 1, az = 0; if (Math.abs(uy) > 0.95) { ax = 1; ay = 0; az = 0; }
    let p1x = uy * az - uz * ay, p1y = uz * ax - ux * az, p1z = ux * ay - uy * ax;
    const l1 = Math.hypot(p1x, p1y, p1z) || 1; p1x /= l1; p1y /= l1; p1z /= l1;
    const p2x = uy * p1z - uz * p1y, p2y = uz * p1x - ux * p1z, p2z = ux * p1y - uy * p1x;
    const sag = (1 - clamp(tension, 0, 1)) * 0.06 * len;
    for (let i = 0; i <= segs; i++) {
      const f = i / segs, env = Math.sin(f * Math.PI);
      const n1 = Math.sin(f * 23 + t * 31) * 0.5 + Math.sin(f * 47 - t * 19) * 0.35 + Math.sin(f * 91 + t * 53) * 0.15;
      const n2 = Math.cos(f * 29 - t * 27) * 0.5 + Math.sin(f * 61 + t * 23) * 0.35 + Math.cos(f * 83 - t * 47) * 0.15;
      const k = amp * env * (1.15 - clamp(tension, 0, 1) * 0.7);
      const o = i * 3;
      out[o] = sx + dx * f + p1x * n1 * k + p2x * n2 * k;
      out[o + 1] = sy + dy * f + p1y * n1 * k + p2y * n2 * k - sag * env;
      out[o + 2] = sz + dz * f + p1z * n1 * k + p2z * n2 * k;
    }
  }

  return { TAU, CFG, clamp, lerp, smooth, easeInOutSine, Ring,
    slingCreate, slingAttach, slingPre, slingPost, slingRelease, slingFlight, bobDist,
    tierOf, dilationCreate, dilationStep, stuntReason, pickClipSlot,
    rankBoard, matchWinner, matchOver, clockText, letterboxPx, victoryCam, tetherPath };
});
