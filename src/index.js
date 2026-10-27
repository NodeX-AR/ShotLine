import { DurableObject } from "cloudflare:workers";
import { handleApi, userByToken } from "./api.js";
import { POWERS, ECON, PET, petPos, levelOf, xpOf, isReserved, parseTag, killReward, MATCH, MOVE_TECH, rankBoard, matchWinner, recallPlausible } from "./lib.js";

const MAX_PLAYERS   = 20;
const DAMAGE_CAP    = 160;
const SPRINT_LIMIT  = 12;
const CHAT_RATE_MS  = 700;
const CHAT_HISTORY  = 30;
const ADMIN_NAME    = "NoDeX";
const ADMIN_RADIUS  = 500;

const WEAPONS = [
  { pellets:1, dmg:18,  head:1.8, range:120, falloff:[30,120,0.5],  minInterval:120  },   // 0 pistol
  { pellets:1, dmg:26,  head:2.0, range:220, falloff:[40,220,0.55], minInterval:85   },   // 1 AK-47
  { pellets:1, dmg:105, head:2.6, range:400, falloff:[400,400,1.0], minInterval:1000 },   // 2 sniper
  { pellets:8, dmg:15,  head:1.5, range:34,  falloff:[8,24,0.2],    minInterval:600  },   // 3 shotgun
  { pellets:0, dmg:0,   head:1.0, range:0,   falloff:[1,1,1],       minInterval:900, projectile:true }, // 4 bazooka
  { pellets:1, dmg:22,  head:1.3, range:2.3, falloff:[2.3,2.3,1],   minInterval:380 },   // 5 fists (melee)
];
const BOOM = { bazooka:{ r:5.5, dmg:130, maxDist:300 }, grenade:{ r:4.2, dmg:85, maxDist:60 } };


export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected Upgrade: websocket", { status: 426 });
      }
      const arena = url.searchParams.get("arena") || "1";
      const stub = env.ARENA.getByName("arena-" + arena);
      return stub.fetch(request);
    }
    if (url.pathname.startsWith("/api/")) {
      try { return await handleApi(request, env); }
      catch (e) { return new Response(JSON.stringify({ ok:false, error:"Server error" }), { status:500, headers:{ "content-type":"application/json" } }); }
    }
    if (url.pathname === "/arena-count") {
      const arena = url.searchParams.get("arena") || "1";
      const stub = env.ARENA.getByName("arena-" + arena);
      return stub.fetch(new Request("https://do/count"));
    }
    return env.ASSETS.fetch(request);
  },
};

export class Arena extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sessions = new Map();
    this.boxes = [];
    this.mapReady = false;
    this.chatHistory = [];
    this.zones = [];
    this.repeat = new Map();
    this.hist = new Map();                       /* session id -> [[tMs,x,y,z],...] for Chrono-Recall validation (memory only) */
    this.match = { startedAt: 0, endedAt: 0 };   /* first-to-N / timed match; resets with the instance */
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment();
      if (att) this.sessions.set(ws, att);
    }
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong")
    );
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/count") {
      const liveCount = [...this.sessions.values()].filter(o => o.joined).length;
      return new Response(JSON.stringify({ count: liveCount, max: MAX_PLAYERS }), {
        headers: { "content-type": "application/json" },
      });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    const id = crypto.randomUUID();
    const session = {
      id, name: "Player", color: 0,
      x: 0, y: 0, z: 0, yaw: 0,
      hp: 100, kills: 0, deaths: 0, alive: false,
      lastMove: Date.now(), lastFire: 0, lastChat: 0,
      joined: false, spawnedAt: 0, dead: false, p: 0,
    };
    server.serializeAttachment(session);
    this.sessions.set(server, session);
    server.send(JSON.stringify({ t: "welcome", id }));
    if (this.mapReady) server.send(JSON.stringify({ t: "mapReady" }));
    if (this.chatHistory.length) {
      server.send(JSON.stringify({ t: "chatHistory", m: this.chatHistory }));
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const s = this.sessions.get(ws);
    if (!s) return;
    switch (msg.t) {
      case "map":      return this.onMap(ws, msg);
      case "join":     return this.onJoin(ws, s, msg);
      case "state":    return this.onState(ws, s, msg);
      case "fire":     return this.onFire(ws, s, msg);
      case "chat":     return this.onChat(ws, s, msg);
      case "spawn":    return this.onSpawn(ws, s);
      case "died":     return this.onDied(ws, s, msg);
      case "admin":    return this.onAdmin(ws, s, msg);
      case "teleport": return this.onTeleport(ws, s, msg);
      case "roster":   return this.onRoster(ws, s);
      case "power":    return this.onPower(ws, s, msg);
      case "nade":     return this.onNade(ws, s, msg);
      case "boom":     return this.onBoom(ws, s, msg);
      case "sling":    return this.onSling(ws, s, msg);
      case "recall":   return this.onRecall(ws, s, msg);
    }
  }

  async flushPlay(s) {
    if (!s.uid || !s.lastFlush || !this.env.DB) return;
    const now = Date.now(), secs = Math.floor((now - s.lastFlush) / 1000);
    if (secs < 1) return;
    s.lastFlush += secs * 1000;
    try { await this.env.DB.prepare("UPDATE users SET PLAYSEC=PLAYSEC+? WHERE id=?").bind(Math.min(secs, 3600), s.uid).run(); } catch {}
  }

  async webSocketClose(ws) {
    { const so = this.sessions.get(ws); if (so) await this.flushPlay(so); }
    const s = this.sessions.get(ws);
    if (ws === this.mapUploader && !this.mapReady) { this.mapUploader = null; this.mapParts = null; }
    if (s && s.joined) {
      this.broadcast({ t: "left", id: s.id, name: s.name }, ws);
      this.chatHistory.push({ sys:"leave", name:s.name, t:Date.now() });
      if (this.chatHistory.length > CHAT_HISTORY) this.chatHistory.shift();
    }
    if (s) this.hist.delete(s.id);
    this.sessions.delete(ws);
  }
  async webSocketError(ws) { const so = this.sessions.get(ws); if (so) { await this.flushPlay(so); this.hist.delete(so.id); } this.sessions.delete(ws); }

  onMap(ws, msg) {
    if (this.mapReady || typeof msg.s !== "string" || !(msg.n > 0 && msg.n < 64)) return;
    if (this.mapUploader && this.mapUploader !== ws) return;
    this.mapUploader = ws;
    if (!this.mapParts || this.mapParts.n !== msg.n) this.mapParts = { n: msg.n, got: new Map() };
    this.mapParts.got.set(msg.i | 0, msg.s);
    if (this.mapParts.got.size < msg.n) return;
    const chunks = [];
    for (let k = 0; k < msg.n; k++) {
      const bin = atob(this.mapParts.got.get(k) || "");
      const u8 = new Uint8Array(bin.length);
      for (let q = 0; q < bin.length; q++) u8[q] = bin.charCodeAt(q);
      chunks.push(u8);
    }
    let total = 0; for (const c of chunks) total += c.length;
    const all = new Uint8Array(total); let off = 0;
    for (const c of chunks) { all.set(c, off); off += c.length; }
    const f = new Int16Array(all.buffer, 0, Math.floor(total / 12) * 6);
    this.boxes = [];
    this.grid = new Map();
    for (let q = 0; q < f.length; q += 6) {
      const b = { x0:f[q]/50, x1:f[q+1]/50, y0:f[q+2]/50, y1:f[q+3]/50, z0:f[q+4]/50, z1:f[q+5]/50, q:0 };
      this.boxes.push(b);
      const g0 = Math.floor(b.x0/16), g1 = Math.floor(b.x1/16), h0 = Math.floor(b.z0/16), h1 = Math.floor(b.z1/16);
      for (let gx = g0; gx <= g1; gx++) for (let gz = h0; gz <= h1; gz++) {
        const key = gx * 100000 + gz; let a = this.grid.get(key);
        if (!a) { a = []; this.grid.set(key, a); }
        a.push(b);
      }
    }
    this.mapParts = null;
    this.mapReady = true;
    this.broadcast({ t: "mapReady" });
  }

  onRoster(ws, s) {
    if (!s.joined) return;
    const roster = [...this.sessions.values()]
      .filter(o => o !== s && o.joined)
      .map(o => ({
        id:o.id, name:o.name, color:o.color,
        x:o.x, y:o.y, z:o.z, yaw:o.yaw,
        hp:o.hp, alive:o.alive?1:0,
        kills:o.kills, deaths:o.deaths, ...this.meta(o),
      }));
    ws.send(JSON.stringify({ t: "players", list: roster }));
  }

  meta(o) { return { sv:o.skv|0, sm:o.skm||"classic", col:o.col||null, tag:o.tag||null, pw:o.power||null, lv:o.lv|0||1, pet:(o.pet && o.pet.alive) ? 1 : 0 }; }
  wsOf(sess) { for (const [w, o] of this.sessions) if (o.id === sess.id) return w; return null; }

  async onJoin(ws, s, msg) {
    if (s.joined || s.joining) return;
    s.joining = true;
    let user = null;
    try {
      if (msg.token && this.env.DB) {
        user = await userByToken(this.env, String(msg.token));
        if (!user) ws.send(JSON.stringify({ t:"authfail" }));
      }
      let name;
      if (user) {
        name = user.UN;
        s.uid = user.id; s.col = user.COL || null; s.tag = parseTag(user.TAG || ""); s.skv = user.SKV | 0; s.skm = user.SKM || "classic";
        let owned = []; try { owned = JSON.parse(user.EFFECTS || "[]"); } catch {}
        s.power = user.POWER && owned.includes("pw_" + user.POWER) && POWERS[user.POWER] ? user.POWER : null;
        s.lv = levelOf(xpOf(user.KILLS, user.PLAYSEC));
        s.pet = owned.includes("pet_buddy") ? { hp: PET.hp, alive: true, nextAt: Date.now() + PET.nadeEvery } : null;
      } else {
        name = String(msg.name || "Player").replace(/[\u0000-\u001f<>]/g, "").slice(0,14).trim() || "Player";
        let taken = isReserved(name);
        if (!taken && this.env.DB) {
          try { taken = !!(await this.env.DB.prepare("SELECT 1 AS x FROM users WHERE UN=?").bind(name).first()); } catch {}
        }
        if (taken) name = "Guest" + (1000 + Math.floor(Math.random() * 9000));
        s.uid = 0; s.col = null; s.tag = null; s.skv = 0; s.skm = "classic"; s.power = null; s.lv = 1; s.pet = null;
      }
      this.finishJoin(ws, s, name, msg);
    } finally { s.joining = false; }
  }

  finishJoin(ws, s, name, msg) {
    /* Evict any stale session with the same name (a fast reconnect used to leave a ghost in the roster). */
    const stale = [];
    for (const [ows, o] of this.sessions.entries()) {
      if (ows === ws || o === s) continue;
      if (o.joined && o.name.toLowerCase() === name.toLowerCase()) stale.push([ows, o]);
    }
    for (const [ows, o] of stale) {
      try { ows.close(4001, "Session replaced"); } catch {}
      this.sessions.delete(ows);
      this.broadcast({ t:"left", id:o.id, name:o.name }, ws);
      this.chatHistory.push({ sys:"leave", name:o.name, t:Date.now() });
      if (this.chatHistory.length > CHAT_HISTORY) this.chatHistory.shift();
    }
    const liveCount = [...this.sessions.values()].filter(o => o.joined).length;
    if (liveCount >= MAX_PLAYERS) { ws.send(JSON.stringify({ t:"error", m:"Arena is full." })); return; }
    s.name = name;
    s.color = (msg.color | 0) >>> 0;
    s.joined = true;
    if (liveCount === 0 || !this.match.startedAt) this.match = { startedAt: Date.now(), endedAt: 0 };
    s.lastFlush = Date.now(); s.nadeStock = 1; s.nadeRegenAt = 0; s.nadeThrowAt = 0; s.nadesOut = 0;
    this.startTick();
    try { ws.send(JSON.stringify({ t:"ns", n:1, cap:s.pet ? PET.nadeCapPet : PET.nadeCapBase })); } catch {}
    ws.serializeAttachment(s);

    const roster = [...this.sessions.values()]
      .filter(o => o !== s && o.joined)
      .map(o => ({
        id:o.id, name:o.name, color:o.color,
        x:o.x, y:o.y, z:o.z, yaw:o.yaw,
        hp:o.hp, alive:o.alive?1:0,
        kills:o.kills, deaths:o.deaths, ...this.meta(o),
      }));
    ws.send(JSON.stringify({ t:"players", list: roster }));
    ws.send(JSON.stringify({ t:"you", name:s.name, power:s.power, ...this.meta(s) }));
    ws.send(JSON.stringify(this.matchInfo()));
    this.broadcast({ t:"joined", id:s.id, name:s.name, color:s.color, ...this.meta(s) }, ws);
    this.chatHistory.push({ sys:"join", name:s.name, t:Date.now() });
    if (this.chatHistory.length > CHAT_HISTORY) this.chatHistory.shift();
  }

  onState(ws, s, msg) {
    if (typeof msg.wk === "string" && ["pistol","rifle","sniper","shotgun","bazooka"].includes(msg.wk)) s.wk = msg.wk;
    if (!s.joined) return;
    const now = Date.now();
    const inSling = now < (s.slingUntil||0);
    const dt = Math.max(inSling ? MOVE_TECH.slingMinDt : 0.02, (now - s.lastMove)/1000);
    const dx = (+msg.x||0) - s.x;
    const dz = (+msg.z||0) - s.z;
    if (s.alive && now > (s.dashUntil||0) && Math.hypot(dx,dz)/dt > (inSling ? MOVE_TECH.slingLimit : SPRINT_LIMIT*2.2)) {
      ws.send(JSON.stringify({ t:"snap", x:s.x, y:s.y, z:s.z, yaw:s.yaw }));
      return;
    }
    const wasAlive = s.alive;
    s.x = +msg.x||0; s.y = +msg.y||0; s.z = +msg.z||0;
    s.yaw = +msg.yaw||0;
    s.p = Math.max(-1.6, Math.min(1.6, +msg.p||0));
    if (s.dead) { s.hp = 0; s.alive = false; }
    else {
      s.hp = Math.max(0, Math.min(100, +msg.hp||0));
      s.alive = !!msg.alive;
    }
    s.lastMove = now;
    if (s.alive) {
      let h = this.hist.get(s.id); if (!h) this.hist.set(s.id, h = []);
      h.push([now, s.x, s.y, s.z]);
      while (h.length && now - h[0][0] > MOVE_TECH.histKeepMs) h.shift();
    }

    if (!wasAlive && s.alive && !s.spawnedAt) {
      s.spawnedAt = now;
      this.broadcast({
        t:"spawned", id:s.id, name:s.name, color:s.color,
        x:s.x, y:s.y, z:s.z, yaw:s.yaw, ...this.meta(s),
      }, ws);
    }
    this.broadcast({
      t:"state", id:s.id, n:s.name, c:s.color,
      x:s.x, y:s.y, z:s.z, yaw:s.yaw, p:s.p,
      hp:s.hp, alive:s.alive?1:0,
      kills:s.kills, deaths:s.deaths, wk:s.wk,
    }, ws);
  }

  onDied(ws, s, msg) {
    if (!s.joined || !s.alive) return;
    s.alive = false; s.dead = true; s.hp = 0; s.deaths++;
    this.broadcast({ t:"kill", by:null, victim:s.id, byName:null, victimName:s.name, hs:0, cause:"fall" });
  }

  onSpawn(ws, s) {
    s.hp = 100; s.alive = true; s.dead = false; s.spawnedAt = Date.now(); s.shieldUntil = 0; s.shieldHp = 0;
    this.broadcast({
      t:"spawned", id:s.id, name:s.name, color:s.color,
      x:s.x, y:s.y, z:s.z, yaw:s.yaw, ...this.meta(s),
    }, ws);
  }

  onFire(ws, s, msg) {
    if (!s.joined || !s.alive) return;
    const wi = msg.w | 0;
    const w = WEAPONS[wi];
    if (!w) return;
    const now = Date.now();
    if (now - s.lastFire < w.minInterval) return;
    s.lastFire = now;

    const o = [+msg.o[0], +msg.o[1], +msg.o[2]];
    const d = [+msg.d[0], +msg.d[1], +msg.d[2]];
    const dl = Math.hypot(d[0],d[1],d[2]) || 1;
    d[0]/=dl; d[1]/=dl; d[2]/=dl;
    const spread = Math.max(0, Math.min(0.2, +msg.spread||0));

    this.broadcast({
      t:"fire", id:s.id,
      o:[round2(o[0]), round2(o[1]), round2(o[2])],
      d:[round4(d[0]), round4(d[1]), round4(d[2])],
      w: wi,
    }, ws);

    if (w.projectile) { s.rockets = Math.min(3, (s.rockets||0) + 1); s.lastRocketAt = now; return; }
    const others  = [...this.sessions.values()].filter(o => o !== s && o.joined && o.alive);
    const victims = new Map();
    const petHits = new Map();

    for (let p = 0; p < w.pellets; p++) {
      let dx = d[0], dy = d[1], dz = d[2];
      if (spread > 0) {
        const a = Math.random()*Math.PI*2;
        const r = Math.sqrt(Math.random())*spread;
        let ux = 0, uy = 1, uz = 0;
        if (Math.abs(dy) > 0.99) { ux = 1; uy = 0; uz = 0; }
        let rx = dy*uz - dz*uy;
        let ry = dz*ux - dx*uz;
        let rz = dx*uy - dy*ux;
        const rl = Math.hypot(rx,ry,rz) || 1;
        rx/=rl; ry/=rl; rz/=rl;
        const vx = ry*dz - rz*dy;
        const vy = rz*dx - rx*dz;
        const vz = rx*dy - ry*dx;
        const ox = Math.cos(a)*r, oy = Math.sin(a)*r;
        dx += rx*ox + vx*oy;
        dy += ry*ox + vy*oy;
        dz += rz*ox + vz*oy;
        const l2 = Math.hypot(dx,dy,dz) || 1;
        dx/=l2; dy/=l2; dz/=l2;
      }
      const worldT = this.rayWorld(o[0],o[1],o[2],dx,dy,dz,w.range);
      let bestT = Math.min(worldT, w.range);
      let bV = null, bH = false, bP = null;
      for (const os of others) {
        const hbox = { x0:os.x-0.2, x1:os.x+0.2, y0:os.y+1.4, y1:os.y+1.78, z0:os.z-0.2, z1:os.z+0.2 };
        const bbox = { x0:os.x-0.33, x1:os.x+0.33, y0:os.y, y1:os.y+1.4, z0:os.z-0.33, z1:os.z+0.33 };
        let t = rayBox(o,[dx,dy,dz],hbox,bestT);
        if (t >= 0 && t < bestT) { bestT = t; bV = os; bH = true; }
        t = rayBox(o,[dx,dy,dz],bbox,bestT);
        if (t >= 0 && t < bestT) { bestT = t; bV = os; bH = false; bP = null; }
        if (os.pet && os.pet.alive) {
          const pp = petPos(os), R = PET.hitR;
          t = rayBox(o,[dx,dy,dz],{ x0:pp[0]-R, x1:pp[0]+R, y0:pp[1]-R, y1:pp[1]+R, z0:pp[2]-R, z1:pp[2]+R },bestT);
          if (t >= 0 && t < bestT) { bestT = t; bP = os; bV = null; bH = false; }
        }
      }
      if (bP) {
        const t01p = bestT <= w.falloff[0] ? 0 : bestT >= w.falloff[1] ? 1 : (bestT - w.falloff[0])/(w.falloff[1] - w.falloff[0]);
        petHits.set(bP.id, (petHits.get(bP.id) || 0) + w.dmg * (1 + (w.falloff[2]-1)*t01p) * 0.8);
      } else if (bV) {
        const t01 = bestT <= w.falloff[0] ? 0
                  : bestT >= w.falloff[1] ? 1
                  : (bestT - w.falloff[0])/(w.falloff[1] - w.falloff[0]);
        const mul = 1 + (w.falloff[2]-1)*t01;
        const dmg = w.dmg*(bH?w.head:1)*mul;
        const e = victims.get(bV.id) || { dmg:0, head:false };
        e.dmg += dmg;
        if (bH) e.head = true;
        victims.set(bV.id, e);
      }
    }

    for (const [pid, dmgP] of petHits) { const owner = [...this.sessions.values()].find(x => x.id === pid); if (owner) this.hurtPet(owner, dmgP, s); }
    for (const [vid, e] of victims) {
      const victim = [...this.sessions.values()].find(x => x.id === vid);
      if (!victim || !victim.alive) continue;
      this.dealDamage(s, victim, e.dmg, e.head, null);
    }
  }

  /* Single place where damage is applied: handles shield absorb, hit notice, kill + coin reward. */
  dealDamage(attacker, victim, dmg, head, cause) {
    if (!victim.alive) return;
    const now = Date.now();
    if (this.match.endedAt) return;               /* intermission: no damage, no scoring */
    if (victim.shieldUntil > now && victim.shieldHp > 0) { const ab = Math.min(victim.shieldHp, dmg); victim.shieldHp -= ab; dmg -= ab; }
    if (dmg <= 0.01) return;
    dmg = Math.min(DAMAGE_CAP, dmg);
    victim.hp -= dmg;
    if (victim.hp <= 0) { victim.hp = 0; this.registerKill(attacker, victim, head, cause); return; }
    const vws = this.wsOf(victim);
    if (vws) vws.send(JSON.stringify({ t:"hit", dmg:Math.round(dmg), from:attacker.id, hs:head?1:0, fromX:round2(attacker.x), fromZ:round2(attacker.z) }));
  }

  registerKill(killer, victim, head, cause, noCoins) {
    victim.hp = 0; victim.dead = true; victim.alive = false; victim.deaths++;
    const real = killer && killer !== victim;
    if (real) killer.kills++;
    const m = { t:"kill", by: real ? killer.id : null, victim: victim.id, byName: real ? killer.name : null, victimName: victim.name, hs: head?1:0 };
    if (cause) m.cause = cause;
    this.broadcast(m);
    if (real && !noCoins) this.awardKill(killer, victim).catch(() => {});
    if (real && (killer.kills | 0) >= MATCH.scoreLimit) this.endMatch("score");
  }

  /* ---------- match flow (in-memory; broadcast only) ---------- */
  matchInfo(now = Date.now()) {
    const m = this.match;
    return { t:"match", phase: m.endedAt ? "ended" : "play",
      left: m.endedAt ? 0 : Math.max(0, MATCH.durationMs - (now - m.startedAt)),
      next: m.endedAt ? Math.max(0, MATCH.intermissionMs - (now - m.endedAt)) : 0, limit: MATCH.scoreLimit };
  }
  endMatch(reason, now = Date.now()) {
    if (this.match.endedAt) return;
    this.match.endedAt = now;
    const board = rankBoard([...this.sessions.values()].filter(o => o.joined)
      .map(o => ({ id:o.id, name:o.name, kills:o.kills|0, deaths:o.deaths|0 })));
    const w = matchWinner(board);
    this.broadcast({ t:"matchend", reason, winner: w ? w.id : null, board: board.slice(0, 8), next: MATCH.intermissionMs });
  }
  startMatch(now = Date.now()) {
    this.match = { startedAt: now, endedAt: 0 };
    for (const o of this.sessions.values()) if (o.joined) { o.kills = 0; o.deaths = 0; }
    this.broadcast({ t:"matchstart", left: MATCH.durationMs, limit: MATCH.scoreLimit });
  }

  /* ---------- kinetic movement tech: both are announced by the client, then bounded here ---------- */
  onSling(ws, s, msg) {
    if (!s.joined || !s.alive) return;
    const now = Date.now();
    if (msg.on) {
      if (now < (s.slingReadyAt || 0)) return;                 /* re-grant rate limit */
      s.slingReadyAt = now + MOVE_TECH.slingRegrantMs;
      s.slingUntil = now + MOVE_TECH.slingWindowMs;
      const a = Array.isArray(msg.a) ? msg.a.slice(0, 3).map(v => round2(+v || 0)) : null;
      this.broadcast({ t:"sl", id:s.id, on:1, a }, ws);
    } else {
      s.slingUntil = Math.min(s.slingUntil || 0, now + MOVE_TECH.slingReleaseMs);
      this.broadcast({ t:"sl", id:s.id, on:0 }, ws);
    }
  }
  onRecall(ws, s, msg) {
    if (!s.joined || !s.alive) return;
    const now = Date.now();
    const to = [+msg.x, +msg.y, +msg.z];
    const reject = () => { try { ws.send(JSON.stringify({ t:"snap", x:s.x, y:s.y, z:s.z, yaw:s.yaw })); } catch {} };
    if (now < (s.recallReadyAt || 0)) return reject();
    if (!recallPlausible(this.hist.get(s.id) || [], now, to, [s.x, s.y, s.z])) return reject();
    const from = [s.x, s.y, s.z];
    s.recallReadyAt = now + MOVE_TECH.recallCooldownMs;
    s.x = to[0]; s.y = to[1]; s.z = to[2]; s.lastMove = now;
    s.dashUntil = Math.max(s.dashUntil || 0, now + 400);
    this.hist.set(s.id, [[now, s.x, s.y, s.z]]);
    this.broadcast({ t:"rc", id:s.id, a:from.map(round2), b:to.map(round2) }, ws);
  }

  async awardKill(killer, victim) {
    if (!killer.uid || !this.env.DB) return;
    const now = Date.now(), key = killer.uid + ":" + victim.id;
    let rec = this.repeat.get(key);
    if (!rec || now - rec.t > ECON.sameVictimWindowMs) rec = { n:0, t:now };
    const aliveMs = victim.spawnedAt ? now - victim.spawnedAt : 0;
    const row = await this.env.DB.prepare("SELECT EARN_T,EARN_AMT FROM users WHERE id=?").bind(killer.uid).first();
    if (!row) return;
    let t = row.EARN_T, amt = row.EARN_AMT;
    if (now - t >= 3600000) { t = now; amt = 0; }
    const reward = killReward({ victimAliveMs: aliveMs, repeats: rec.n, hourAmt: amt });
    const counts = aliveMs >= ECON.minVictimAliveMs && rec.n < ECON.lbRepeatLimit;
    rec.n++; this.repeat.set(key, rec);
    if (counts) {
      await this.env.DB.prepare("UPDATE users SET KILLS=KILLS+1 WHERE id=?").bind(killer.uid).run();
      const u2 = await this.env.DB.prepare("SELECT KILLS,PLAYSEC FROM users WHERE id=?").bind(killer.uid).first();
      if (u2) {
        const lv = levelOf(xpOf(u2.KILLS, u2.PLAYSEC));
        if (lv !== killer.lv) {
          killer.lv = lv;
          this.broadcast({ t:"lv", id:killer.id, lv });
        }
      }
    }
    if (this.repeat.size > 800) for (const [k, v] of this.repeat) if (now - v.t > ECON.sameVictimWindowMs) this.repeat.delete(k);
    if (reward <= 0) return;
    await this.env.DB.prepare("UPDATE users SET MONEY=MONEY+?,EARN_T=?,EARN_AMT=? WHERE id=?").bind(reward, t, amt + reward, killer.uid).run();
    const r = await this.env.DB.prepare("SELECT MONEY FROM users WHERE id=?").bind(killer.uid).first();
    const kws = this.wsOf(killer);
    if (kws && r) kws.send(JSON.stringify({ t:"coins", total:r.MONEY, delta:reward, why:"kill" }));
  }

  /* ---------- powers (all server-validated: ownership, cooldown, effect) ---------- */
  onPower(ws, s, msg) {
    if (!s.joined || !s.alive || !s.power) return;
    const P = POWERS[s.power]; if (!P) return;
    const now = Date.now();
    if (now < (s.pwReady || 0) - 600) return;
    s.pwReady = now + P.cd;
    const base = { t:"pw", id:s.id, p:s.power, x:round2(s.x), y:round2(s.y), z:round2(s.z), yaw:round2(s.yaw) };
    const others = [...this.sessions.values()].filter(o => o !== s && o.joined && o.alive);
    if (s.power === "heal" || s.power === "poison") {
      this.broadcast(base, ws);
      this.zones.push({ kind:s.power, x:s.x, y:s.y, z:s.z, r:P.r, until:now + P.dur, owner:s, P });
      this.startTick();
    } else if (s.power === "dash") {
      this.broadcast(base, ws); s.dashUntil = now + 800;
    } else if (s.power === "shield") {
      this.broadcast(base, ws); s.shieldUntil = now + P.dur; s.shieldHp = P.absorb;
    } else if (s.power === "adrenaline") {
      this.broadcast(base, ws); s.dashUntil = now + P.dur + 600;
      s.hp = Math.min(100, s.hp + P.heal); try { ws.send(JSON.stringify({ t:"heal", amt:P.heal })); } catch {}
    } else if (s.power === "frost") {
      this.broadcast(base, ws);
      for (const o of others) {
        if (Math.hypot(o.x - s.x, o.z - s.z) > P.r || Math.abs(o.y - s.y) > 3) continue;
        const ow = this.wsOf(o); if (ow) try { ow.send(JSON.stringify({ t:"slow", ms:P.ms, k:P.slow })); } catch {}
        this.dealDamage(s, o, P.dmg, false, "frost");
      }
    } else if (s.power === "spectral") {
      const o = [+(msg.o && msg.o[0]) || s.x, +(msg.o && msg.o[1]) || s.y + 1.6, +(msg.o && msg.o[2]) || s.z];
      let d = [+(msg.d && msg.d[0]) || 0, +(msg.d && msg.d[1]) || 0, +(msg.d && msg.d[2]) || -1];
      const dl = Math.hypot(d[0], d[1], d[2]) || 1; d = d.map(v => v / dl);
      if (Math.hypot(o[0] - s.x, o[2] - s.z) > 4) { o[0] = s.x; o[1] = s.y + 1.6; o[2] = s.z; }
      let bestT = Math.min(this.rayWorld(o[0], o[1], o[2], d[0], d[1], d[2], P.range), P.range);
      for (const os of others) {
        const t = rayBox(o, d, { x0:os.x-0.4, x1:os.x+0.4, y0:os.y, y1:os.y+1.8, z0:os.z-0.4, z1:os.z+0.4 }, bestT);
        if (t >= 0 && t < bestT) bestT = t;
      }
      const ix = o[0] + d[0]*bestT, iy = o[1] + d[1]*bestT, iz = o[2] + d[2]*bestT;
      const ids = [];
      for (const os of others) if (Math.hypot(os.x - ix, os.z - iz) <= P.r && Math.abs((os.y + 0.9) - iy) <= P.r) { os.glowUntil = now + P.glow; ids.push(os.id); }
      this.broadcast({ ...base, o:o.map(round2), d:d.map(round4), hit:[round2(ix), round2(iy), round2(iz)] }, ws);
      if (ids.length) this.broadcast({ t:"glow", ids, ms:P.glow });
    }
  }
  startTick() { if (!this.tickTimer) this.tickTimer = setInterval(() => this.tick(), 1000); }
  tick() {
    const now = Date.now();
    if (this.match.startedAt) {
      if (!this.match.endedAt && now - this.match.startedAt >= MATCH.durationMs) this.endMatch("time", now);
      else if (this.match.endedAt && now - this.match.endedAt >= MATCH.intermissionMs) this.startMatch(now);
    }
    this.zones = this.zones.filter(z => z.until > now);
    for (const z of this.zones) {
      for (const [w, o] of this.sessions) {
        if (!o.joined || !o.alive) continue;
        if (Math.hypot(o.x - z.x, o.z - z.z) > z.r || Math.abs(o.y - z.y) > 3) continue;
        if (z.kind === "heal") {
          const before = o.hp; o.hp = Math.min(100, o.hp + z.P.rate);
          if (o.hp > before) try { w.send(JSON.stringify({ t:"heal", amt:o.hp - before })); } catch {}
        } else if (o !== z.owner) {
          this.dealDamage(z.owner, o, z.P.dmg, false, "poison");
        }
      }
    }
    let anyone = this.zones.length > 0;
    for (const [w, o] of this.sessions) {
      if (!o.joined) continue;
      const cap = (o.pet && o.pet.alive) ? PET.nadeCapPet : PET.nadeCapBase;
      /* grenade stock: refills on its own (slowly); the buddy drone restocks faster and holds more */
      if (o.alive && o.nadeStock < cap && now >= (o.nadeRegenAt || 0)) {
        if (o.nadeRegenAt) { o.nadeStock++; try { w.send(JSON.stringify({ t:"ns", n:o.nadeStock, cap })); } catch {} if (o.pet && o.pet.alive) this.broadcast({ t:"petfetch", id:o.id }); }
        o.nadeRegenAt = now + ((o.pet && o.pet.alive) ? PET.nadeEvery : PET.baseNadeEvery);
      }
      if (o.pet && o.pet.alive) {
        anyone = true;
        if (o.alive && o.hp < 100) {
          const before = o.hp; o.hp = Math.min(100, o.hp + PET.heal);
          try { w.send(JSON.stringify({ t:"heal", amt:o.hp - before, pet:1 })); } catch {}
        }
      }
      if (o.nadeStock < cap) anyone = true;
    }
    if (!anyone && this.tickTimer && ![...this.sessions.values()].some(o => o.joined)) { clearInterval(this.tickTimer); this.tickTimer = null; }
    for (const o of this.sessions.values()) if (o.joined && o.uid && now - (o.lastFlush || now) >= 60000) this.flushPlay(o);
  }

  /* ---------- buddy drone ---------- */
  hurtPet(owner, dmg, attacker) {
    if (!owner.pet || !owner.pet.alive) return;
    owner.pet.hp -= dmg;
    const ow = this.wsOf(owner);
    if (owner.pet.hp > 0) { if (ow) try { ow.send(JSON.stringify({ t:"pethit", hp:Math.round(owner.pet.hp) })); } catch {} return; }
    owner.pet.alive = false; owner.pet.hp = 0;
    this.broadcast({ t:"petdead", id:owner.id });
    this.removePetFromAccount(owner).catch(() => {});
  }
  async removePetFromAccount(owner) {
    if (!owner.uid || !this.env.DB) return;
    const row = await this.env.DB.prepare("SELECT EFFECTS FROM users WHERE id=?").bind(owner.uid).first();
    if (!row) return;
    let items = []; try { items = JSON.parse(row.EFFECTS || "[]"); } catch {}
    const next = JSON.stringify(items.filter(i => i !== "pet_buddy"));
    await this.env.DB.prepare("UPDATE users SET EFFECTS=? WHERE id=? AND EFFECTS=?").bind(next, owner.uid, row.EFFECTS).run();
  }

  /* ---------- grenades & rockets ---------- */
  onNade(ws, s, msg) {
    if (!s.joined || !s.alive) return;
    const now = Date.now();
    if (!(s.nadeStock > 0) || now < (s.nadeThrowAt || 0) - 200) return;
    s.nadeStock--; s.nadeThrowAt = now + PET.throwGap; s.nadesOut = (s.nadesOut || 0) + 1; s.lastNadeAt = now;
    if (!s.nadeRegenAt || s.nadeRegenAt < now) s.nadeRegenAt = now + ((s.pet && s.pet.alive) ? PET.nadeEvery : PET.baseNadeEvery);
    const cap = (s.pet && s.pet.alive) ? PET.nadeCapPet : PET.nadeCapBase;
    const wsS = this.wsOf(s); if (wsS) try { wsS.send(JSON.stringify({ t:"ns", n:s.nadeStock, cap })); } catch {}
    const o = [+msg.o[0]||0, +msg.o[1]||0, +msg.o[2]||0], v = [+msg.v[0]||0, +msg.v[1]||0, +msg.v[2]||0];
    this.broadcast({ t:"nade", id:s.id, o:o.map(round2), v:v.map(round2) }, ws);
  }
  onBoom(ws, s, msg) {
    if (!s.joined) return;
    const k = msg.k, B = BOOM[k]; if (!B) return;
    const now = Date.now();
    if (k === "bazooka") { if (!(s.rockets > 0) || now - (s.lastRocketAt||0) > 9000) return; s.rockets--; }
    else { if (!(s.nadesOut > 0) || now - (s.lastNadeAt||0) > 5000) return; s.nadesOut--; }
    const x = +msg.x, y = +msg.y, z = +msg.z;
    if (![x, y, z].every(Number.isFinite)) return;
    if (Math.hypot(x - s.x, z - s.z) > B.maxDist) return;
    this.broadcast({ t:"boom", k, x:round2(x), y:round2(y), z:round2(z) }, ws);
    for (const o of this.sessions.values()) {
      if (!o.joined) continue;
      if (o.pet && o.pet.alive && o !== s) {
        const pp = petPos(o), dp = Math.hypot(pp[0] - x, pp[1] - y, pp[2] - z);
        if (dp <= B.r) this.hurtPet(o, B.dmg * (1 - dp / B.r) * 0.6, s);
      }
      if (o === s || !o.alive) continue;
      const tx = o.x - x, ty = (o.y + 0.9) - y, tz = o.z - z, d = Math.hypot(tx, ty, tz);
      if (d > B.r) continue;
      if (d > 0.5 && this.rayWorld(x, y + 0.3, z, tx/d, (ty - 0.3)/d, tz/d, d) < d - 0.3) continue;
      this.dealDamage(s, o, B.dmg * (1 - d / B.r), false, k === "bazooka" ? "explosion" : "grenade");
    }
  }

  onChat(ws, s, msg) {
    if (!s.joined) return;
    const now = Date.now();
    if (now - s.lastChat < CHAT_RATE_MS) return;
    s.lastChat = now;
    const text = String(msg.m || "").slice(0,180).trim();
    if (!text) return;
    const entry = { name:s.name, m:text, t:now, col:s.col||null, tag:s.tag||null, lv:s.lv|0 };
    this.chatHistory.push(entry);
    if (this.chatHistory.length > CHAT_HISTORY) this.chatHistory.shift();
    this.broadcast({ t:"chat", name:s.name, m:text, ts:now, col:s.col||null, tag:s.tag||null, lv:s.lv|0 });
  }

  onAdmin(ws, s, msg) {
    if (!s.joined) return;
    if (s.name !== ADMIN_NAME) {
      ws.send(JSON.stringify({ t:"private", m:"Access denied." }));
      return;
    }
    const expected = this.env.ADMIN_PASSWORD;
    if (!expected) {
      ws.send(JSON.stringify({ t:"private", m:"ADMIN_PASSWORD is not set on the server." }));
      return;
    }
    const given = String(msg.pass || "");
    let diff = given.length === expected.length ? 0 : 1;
    const n = Math.max(given.length, expected.length);
    for (let i = 0; i < n; i++) {
      diff |= (given.charCodeAt(i)||0) ^ (expected.charCodeAt(i)||0);
    }
    if (diff !== 0) {
      ws.send(JSON.stringify({ t:"private", m:"Wrong password." }));
      return;
    }
    const victims = [];
    for (const other of this.sessions.values()) {
      if (other === s || !other.alive || !other.joined) continue;
      if (Math.hypot(other.x - s.x, other.z - s.z) > ADMIN_RADIUS) continue;
      other.hp = 0; other.alive = false; other.dead = true; other.deaths++;
      s.kills++;
      victims.push(other);
    }
    for (const v of victims) {
      this.broadcast({
        t:"kill", by:s.id, victim:v.id,
        byName:s.name, victimName:v.name, hs:0,
      });
    }
    ws.send(JSON.stringify({
      t:"private",
      m: victims.length === 0
        ? `Sweep found no one within ${ADMIN_RADIUS}m.`
        : `Sweep complete — ${victims.length} eliminated within ${ADMIN_RADIUS}m.`,
    }));
  }

  onTeleport(ws, s, msg) {
    if (!s.joined) return;
    if (s.name !== ADMIN_NAME) {
      ws.send(JSON.stringify({ t:"private", m:"Access denied." }));
      return;
    }
    const expected = this.env.ADMIN_PASSWORD;
    if (!expected) {
      ws.send(JSON.stringify({ t:"private", m:"ADMIN_PASSWORD is not set on the server." }));
      return;
    }
    const given = String(msg.pass || "");
    let diff = given.length === expected.length ? 0 : 1;
    const n = Math.max(given.length, expected.length);
    for (let i = 0; i < n; i++) {
      diff |= (given.charCodeAt(i)||0) ^ (expected.charCodeAt(i)||0);
    }
    if (diff !== 0) {
      ws.send(JSON.stringify({ t:"private", m:"Wrong password." }));
      return;
    }

    let nearest = null, best = Infinity;
    for (const other of this.sessions.values()) {
      if (other === s || !other.joined) continue;
      const d = Math.hypot(other.x - s.x, other.z - s.z);
      if (d < best) { best = d; nearest = other; }
    }
    if (!nearest) {
      ws.send(JSON.stringify({ t:"private", m:"No other players in the arena to teleport to." }));
      return;
    }

    const fx = -Math.sin(nearest.yaw || 0);
    const fz = -Math.cos(nearest.yaw || 0);
    s.x = nearest.x - fx * 2.5;
    s.z = nearest.z - fz * 2.5;
    s.y = nearest.y;
    s.yaw = nearest.yaw;
    s.lastMove = Date.now();

    ws.send(JSON.stringify({
      t:"snap",
      x: round2(s.x), y: round2(s.y), z: round2(s.z),
      yaw: round2(s.yaw),
    }));

    this.broadcast({
      t:"state", id:s.id, n:s.name, c:s.color,
      x:s.x, y:s.y, z:s.z, yaw:s.yaw, p:s.p,
      hp:s.hp, alive:s.alive?1:0,
      kills:s.kills, deaths:s.deaths,
    }, ws);

    ws.send(JSON.stringify({
      t:"private",
      m:`Teleported to ${nearest.name} — ${Math.round(best)}m away.`,
    }));
  }

  broadcast(obj, excludeWs) {
    const data = JSON.stringify(obj);
    for (const ws of this.sessions.keys()) {
      if (ws === excludeWs) continue;
      try { ws.send(data); } catch {}
    }
  }

  rayWorld(ox,oy,oz,dx,dy,dz,maxRange) {
    let best = maxRange;
    if (this.grid) {
      const C = 16, adx = Math.abs(dx), adz = Math.abs(dz);
      let gx = Math.floor(ox/C), gz = Math.floor(oz/C);
      const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
      const tdx = adx > 1e-9 ? C/adx : 1e9, tdz = adz > 1e-9 ? C/adz : 1e9;
      let tmx = adx > 1e-9 ? (dx > 0 ? (gx+1)*C-ox : ox-gx*C)/adx : 1e9;
      let tmz = adz > 1e-9 ? (dz > 0 ? (gz+1)*C-oz : oz-gz*C)/adz : 1e9;
      const stamp = (this.stamp = (this.stamp || 0) + 1);
      let t = 0;
      while (t < best && t <= maxRange) {
        const a = this.grid.get(gx*100000+gz);
        if (a) for (const b of a) {
          if (b.q === stamp) continue; b.q = stamp;
          const tt = rayBox([ox,oy,oz],[dx,dy,dz],b,best);
          if (tt >= 0 && tt < best) best = tt;
        }
        if (tmx < tmz) { t = tmx; tmx += tdx; gx += sx; } else { t = tmz; tmz += tdz; gz += sz; }
      }
    }
    if (dy < -1e-6) {
      const t = -oy/dy;
      if (t >= 0 && t < best) best = t;
    }
    return best;
  }
}

function rayBox(o, d, b, maxT) {
  let tmin = 0, tmax = maxT;
  const axes = [
    [o[0], d[0], b.x0, b.x1],
    [o[1], d[1], b.y0, b.y1],
    [o[2], d[2], b.z0, b.z1],
  ];
  for (const [oo, dd, lo, hi] of axes) {
    if (Math.abs(dd) < 1e-9) {
      if (oo < lo || oo > hi) return -1;
    } else {
      let a = (lo-oo)/dd, c = (hi-oo)/dd;
      if (a > c) { const t = a; a = c; c = t; }
      if (a > tmin) tmin = a;
      if (c < tmax) tmax = c;
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}

const round2 = v => Math.round(v*100)/100;
const round4 = v => Math.round(v*10000)/10000;
