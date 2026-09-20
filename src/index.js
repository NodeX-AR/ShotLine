import { DurableObject } from "cloudflare:workers";

const MAX_PLAYERS   = 20;
const DAMAGE_CAP    = 160;
const SPRINT_LIMIT  = 12;
const CHAT_RATE_MS  = 700;
const CHAT_HISTORY  = 30;
const ADMIN_NAME    = "NoDeX";
const ADMIN_RADIUS  = 500;

const WEAPONS = [
  { pellets:1, dmg:18, head:1.8, range:120, falloff:[30,120,0.5],  minInterval:130  },
  { pellets:1, dmg:13, head:1.6, range:120, falloff:[25,120,0.5],  minInterval:55   },
  { pellets:1, dmg:22, head:2.0, range:220, falloff:[45,220,0.6],  minInterval:85   },
  { pellets:1, dmg:19, head:2.0, range:240, falloff:[50,240,0.6],  minInterval:65   },
  { pellets:1, dmg:38, head:2.2, range:320, falloff:[80,320,0.7],  minInterval:260  },
  { pellets:1, dmg:20, head:1.8, range:200, falloff:[40,200,0.55], minInterval:80   },
  { pellets:9, dmg:13, head:1.5, range:34,  falloff:[6,34,0.12],   minInterval:800  },
  { pellets:1, dmg:95, head:2.5, range:400, falloff:[400,400,1.0], minInterval:1200 },
];

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
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment();
      if (att) this.sessions.set(ws, att);
    }
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair("ping", "pong")
    );
  }

  async fetch(request) {
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
      case "map":    return this.onMap(ws, msg);
      case "join":   return this.onJoin(ws, s, msg);
      case "state":  return this.onState(ws, s, msg);
      case "fire":   return this.onFire(ws, s, msg);
      case "chat":   return this.onChat(ws, s, msg);
      case "spawn":  return this.onSpawn(ws, s);
      case "died":   return this.onDied(ws, s, msg);
      case "admin":  return this.onAdmin(ws, s, msg);
      case "roster": return this.onRoster(ws, s);
    }
  }

  async webSocketClose(ws) {
    const s = this.sessions.get(ws);
    if (ws === this.mapUploader && !this.mapReady) { this.mapUploader = null; this.mapParts = null; }
    if (s && s.joined) {
      this.broadcast({ t: "left", id: s.id, name: s.name }, ws);
      this.chatHistory.push({ sys:"leave", name:s.name, t:Date.now() });
      if (this.chatHistory.length > CHAT_HISTORY) this.chatHistory.shift();
    }
    this.sessions.delete(ws);
  }
  async webSocketError(ws) { this.sessions.delete(ws); }

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
        kills:o.kills, deaths:o.deaths,
      }));
    ws.send(JSON.stringify({ t: "players", list: roster }));
  }

  onJoin(ws, s, msg) {
    if (s.joined) return;
    const name = String(msg.name || "Player").slice(0,14).trim() || "Player";
    const taken = [...this.sessions.values()]
      .some(o => o !== s && o.joined && o.name.toLowerCase() === name.toLowerCase());
    if (taken) {
      ws.send(JSON.stringify({ t:"error", m:`"${name}" is already online.` }));
      return;
    }
    const liveCount = [...this.sessions.values()].filter(o => o.joined).length;
    if (liveCount >= MAX_PLAYERS) {
      ws.send(JSON.stringify({ t:"error", m:"Arena is full." }));
      return;
    }
    s.name = name;
    s.color = (msg.color | 0) >>> 0;
    s.joined = true;
    ws.serializeAttachment(s);

    const roster = [...this.sessions.values()]
      .filter(o => o !== s && o.joined)
      .map(o => ({
        id:o.id, name:o.name, color:o.color,
        x:o.x, y:o.y, z:o.z, yaw:o.yaw,
        hp:o.hp, alive:o.alive?1:0,
        kills:o.kills, deaths:o.deaths,
      }));
    ws.send(JSON.stringify({ t:"players", list: roster }));
    this.broadcast({ t:"joined", id:s.id, name:s.name, color:s.color }, ws);
    this.chatHistory.push({ sys:"join", name:s.name, t:Date.now() });
    if (this.chatHistory.length > CHAT_HISTORY) this.chatHistory.shift();
  }

  onState(ws, s, msg) {
    if (!s.joined) return;
    const now = Date.now();
    const dt = Math.max(0.02, (now - s.lastMove)/1000);
    const dx = (+msg.x||0) - s.x;
    const dz = (+msg.z||0) - s.z;
    if (s.alive && Math.hypot(dx,dz)/dt > SPRINT_LIMIT*2.2) {
      ws.send(JSON.stringify({ t:"snap", x:s.x, y:s.y, z:s.z }));
      return;
    }
    const wasAlive = s.alive;
    s.x = +msg.x||0; s.y = +msg.y||0; s.z = +msg.z||0;
    s.yaw = +msg.yaw||0;
    s.p = Math.max(-1.6, Math.min(1.6, +msg.p||0));
    if (s.dead) { s.hp = 0; s.alive = false; }   // server-side death can't be undone by a stale state packet
    else {
      s.hp = Math.max(0, Math.min(100, +msg.hp||0));
      s.alive = !!msg.alive;
    }
    s.lastMove = now;

    if (!wasAlive && s.alive && !s.spawnedAt) {
      s.spawnedAt = now;
      this.broadcast({
        t:"spawned", id:s.id, name:s.name, color:s.color,
        x:s.x, y:s.y, z:s.z, yaw:s.yaw,
      }, ws);
    }
    this.broadcast({
      t:"state", id:s.id, n:s.name, c:s.color,
      x:s.x, y:s.y, z:s.z, yaw:s.yaw, p:s.p,
      hp:s.hp, alive:s.alive?1:0,
      kills:s.kills, deaths:s.deaths,
    }, ws);
  }

  onDied(ws, s, msg) {
    if (!s.joined || !s.alive) return;
    s.alive = false; s.dead = true; s.hp = 0; s.deaths++;
    this.broadcast({ t:"kill", by:null, victim:s.id, byName:null, victimName:s.name, hs:0, cause:"fall" });
  }

  onSpawn(ws, s) {
    s.hp = 100; s.alive = true; s.dead = false; s.spawnedAt = Date.now();
    this.broadcast({
      t:"spawned", id:s.id, name:s.name, color:s.color,
      x:s.x, y:s.y, z:s.z, yaw:s.yaw,
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

    const others  = [...this.sessions.values()].filter(o => o !== s && o.joined && o.alive);
    const victims = new Map();

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
      let bV = null, bH = false;
      for (const os of others) {
        const hbox = { x0:os.x-0.2, x1:os.x+0.2, y0:os.y+1.4, y1:os.y+1.78, z0:os.z-0.2, z1:os.z+0.2 };
        const bbox = { x0:os.x-0.33, x1:os.x+0.33, y0:os.y, y1:os.y+1.4, z0:os.z-0.33, z1:os.z+0.33 };
        let t = rayBox(o,[dx,dy,dz],hbox,bestT);
        if (t >= 0 && t < bestT) { bestT = t; bV = os; bH = true; }
        t = rayBox(o,[dx,dy,dz],bbox,bestT);
        if (t >= 0 && t < bestT) { bestT = t; bV = os; bH = false; }
      }
      if (bV) {
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

    for (const [vid, e] of victims) {
      const victim = [...this.sessions.values()].find(x => x.id === vid);
      if (!victim || !victim.alive) continue;   // already dead — dedup
      const dmg = Math.min(DAMAGE_CAP, e.dmg);
      victim.hp -= dmg;
      if (victim.hp <= 0) {
        victim.hp = 0;
        victim.dead = true;
        victim.alive = false;   // flag first so subsequent pellets can't double-kill
        victim.deaths++;
        s.kills++;
        this.broadcast({
          t:"kill", by:s.id, victim:vid,
          byName:s.name, victimName:victim.name, hs:e.head?1:0,
        });
      } else {
        const vws = [...this.sessions.entries()].find(([_,x]) => x.id === vid)?.[0];
        if (vws) {
          vws.send(JSON.stringify({
            t:"hit", dmg:Math.round(dmg), from:s.id, hs:e.head?1:0,
            fromX:round2(s.x), fromZ:round2(s.z),
          }));
        }
      }
    }
  }

  onChat(ws, s, msg) {
    if (!s.joined) return;
    const now = Date.now();
    if (now - s.lastChat < CHAT_RATE_MS) return;
    s.lastChat = now;
    const text = String(msg.m || "").slice(0,180).trim();
    if (!text) return;
    const entry = { name:s.name, m:text, t:now };
    this.chatHistory.push(entry);
    if (this.chatHistory.length > CHAT_HISTORY) this.chatHistory.shift();
    this.broadcast({ t:"chat", name:s.name, m:text, ts:now });
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
