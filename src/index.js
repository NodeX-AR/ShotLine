import { DurableObject } from "cloudflare:workers";

const MAX_PLAYERS = 12;
const DAMAGE_CAP  = 140;
const SPRINT_LIMIT = 12;         // units/sec
const CHAT_RATE_MS = 800;
const CHAT_HISTORY = 30;

// Matches the client's WEAPONS table (pellets, dmg, headshot mult, range, falloff)
const WEAPONS = [
  { pellets: 1, dmg: 21, head: 2.0, range: 220, falloff: [45, 220, 0.6], minInterval: 80   },
  { pellets: 9, dmg: 11, head: 1.6, range: 32,  falloff: [6,  32,  0.12], minInterval: 700  },
  { pellets: 1, dmg: 80, head: 2.0, range: 300, falloff: [300,300, 1.0], minInterval: 1100 },
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
    this.sessions = new Map();       // WebSocket -> session
    this.boxes = [];                 // world colliders uploaded by first client
    this.mapReady = false;
    this.chatHistory = [];

    // Restore after hibernation
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment();
      if (att) this.sessions.set(ws, att);
    }

    // Free ping/pong without waking the DO
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
      joined: false,
    };
    server.serializeAttachment(session);
    this.sessions.set(server, session);

    server.send(JSON.stringify({ t: "welcome", id }));

    if (this.mapReady) {
      server.send(JSON.stringify({ t: "mapReady" }));
    }
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
      case "spawn":  return this.onSpawn(ws, s, msg);
    }
  }

  async webSocketClose(ws) {
    const s = this.sessions.get(ws);
    if (s && s.joined) {
      this.broadcast({ t: "left", id: s.id, name: s.name }, ws);
    }
    this.sessions.delete(ws);
  }

  async webSocketError(ws) {
    this.sessions.delete(ws);
  }

  // ---- Map upload (once per arena) ----
  onMap(ws, msg) {
    if (this.mapReady || !Array.isArray(msg.b)) return;
    const flat = msg.b;
    const n = Math.floor(flat.length / 6);
    for (let i = 0; i < n; i++) {
      const o = i * 6;
      this.boxes.push({
        x0: flat[o], x1: flat[o+1],
        y0: flat[o+2], y1: flat[o+3],
        z0: flat[o+4], z1: flat[o+5],
      });
    }
    this.mapReady = true;
    this.broadcast({ t: "mapReady" });
  }

  onJoin(ws, s, msg) {
    if (s.joined) return;
    const name = String(msg.name || "Player").slice(0, 14).trim() || "Player";

    const taken = [...this.sessions.values()]
      .some(o => o !== s && o.joined && o.name.toLowerCase() === name.toLowerCase());
    if (taken) {
      ws.send(JSON.stringify({ t: "error", m: `"${name}" is already online.` }));
      return;
    }
    const liveCount = [...this.sessions.values()].filter(o => o.joined).length;
    if (liveCount >= MAX_PLAYERS) {
      ws.send(JSON.stringify({ t: "error", m: "Arena is full." }));
      return;
    }

    s.name = name;
    s.color = (msg.color | 0) >>> 0;
    s.joined = true;
    ws.serializeAttachment(s);

    // Send the newcomer the current roster
    const roster = [...this.sessions.values()]
      .filter(o => o !== s && o.joined)
      .map(o => ({
        id: o.id, name: o.name, color: o.color,
        x: o.x, y: o.y, z: o.z, yaw: o.yaw,
        hp: o.hp, alive: o.alive ? 1 : 0,
        kills: o.kills, deaths: o.deaths,
      }));
    ws.send(JSON.stringify({ t: "players", list: roster }));

    // Announce to others
    this.broadcast({
      t: "joined", id: s.id, name: s.name, color: s.color,
    }, ws);

    // Tell others to spawn us if we're not alive yet
    if (!s.alive) {
      // server will auto-respawn us on first state packet
    }
  }

  onState(ws, s, msg) {
    if (!s.joined) return;
    const now = Date.now();
    const dt = Math.max(0.02, (now - s.lastMove) / 1000);
    const dx = (+msg.x || 0) - s.x;
    const dz = (+msg.z || 0) - s.z;
    const dist = Math.hypot(dx, dz);

    // Teleport / speed rejection
    if (s.alive && dist / dt > SPRINT_LIMIT * 2.0) {
      ws.send(JSON.stringify({ t: "snap", x: s.x, y: s.y, z: s.z }));
      return;
    }

    const wasAlive = s.alive;
    s.x = +msg.x || 0;
    s.y = +msg.y || 0;
    s.z = +msg.z || 0;
    s.yaw = +msg.yaw || 0;
    s.hp = Math.max(0, Math.min(100, +msg.hp || 0));
    s.alive = !!msg.alive;
    s.lastMove = now;

    // First time we see this player moving → assign a spawn and announce
    if (!wasAlive && s.alive && !s.spawnedAt) {
      s.spawnedAt = now;
      this.broadcast({
        t: "spawned", id: s.id, name: s.name, color: s.color,
        x: s.x, y: s.y, z: s.z, yaw: s.yaw,
      }, ws);
    }

    this.broadcast({
      t: "state", id: s.id,
      x: s.x, y: s.y, z: s.z, yaw: s.yaw,
      hp: s.hp, alive: s.alive ? 1 : 0,
      kills: s.kills, deaths: s.deaths,
    }, ws);
  }

  onSpawn(ws, s) {
    // Client is telling us it just respawned at a new location
    s.hp = 100;
    s.alive = true;
    s.spawnedAt = Date.now();
    this.broadcast({ t: "spawned", id: s.id, name: s.name, color: s.color,
                     x: s.x, y: s.y, z: s.z, yaw: s.yaw }, ws);
  }

  onFire(ws, s, msg) {
    if (!s.joined || !s.alive) return;
    const wi = msg.w | 0;
    const w = WEAPONS[wi];
    if (!w) return;

    const now = Date.now();
    if (now - s.lastFire < w.minInterval) return;
    s.lastFire = now;

    const o = [ +msg.o[0], +msg.o[1], +msg.o[2] ];
    const d = [ +msg.d[0], +msg.d[1], +msg.d[2] ];
    const dl = Math.hypot(d[0], d[1], d[2]) || 1;
    d[0] /= dl; d[1] /= dl; d[2] /= dl;
    const spread = Math.max(0, Math.min(0.2, +msg.spread || 0));

    // Relay the visual tracer to everyone else
    this.broadcast({
      t: "fire", id: s.id,
      o: [ round2(o[0]), round2(o[1]), round2(o[2]) ],
      d: [ round4(d[0]), round4(d[1]), round4(d[2]) ],
      w: wi,
    }, ws);

    // Server-side hit resolution
    const victims = new Map();
    const others = [...this.sessions.entries()]
      .filter(([ows, os]) => ows !== ws && os.joined && os.alive);

    for (let p = 0; p < w.pellets; p++) {
      let dx = d[0], dy = d[1], dz = d[2];
      if (spread > 0) {
        // Random cone in perpendicular basis
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * spread;
        let ux = 0, uy = 1, uz = 0;
        if (Math.abs(dy) > 0.99) { ux = 1; uy = 0; uz = 0; }
        let rx = dy * uz - dz * uy;
        let ry = dz * ux - dx * uz;
        let rz = dx * uy - dy * ux;
        const rl = Math.hypot(rx, ry, rz) || 1;
        rx /= rl; ry /= rl; rz /= rl;
        const vx = ry * dz - rz * dy;
        const vy = rz * dx - rx * dz;
        const vz = rx * dy - ry * dx;
        const ox = Math.cos(a) * r, oy = Math.sin(a) * r;
        dx += rx * ox + vx * oy;
        dy += ry * ox + vy * oy;
        dz += rz * ox + vz * oy;
        const l2 = Math.hypot(dx, dy, dz) || 1;
        dx /= l2; dy /= l2; dz /= l2;
      }

      // World geometry limit
      const worldT = this.rayWorld(o[0], o[1], o[2], dx, dy, dz, w.range);
      let bestT = Math.min(worldT, w.range);
      let bestVictim = null;
      let bestHead = false;

      for (const [ows, os] of others) {
        const hbox = { x0: os.x - 0.2, x1: os.x + 0.2, y0: os.y + 1.4, y1: os.y + 1.78, z0: os.z - 0.2, z1: os.z + 0.2 };
        const bbox = { x0: os.x - 0.33, x1: os.x + 0.33, y0: os.y, y1: os.y + 1.4, z0: os.z - 0.33, z1: os.z + 0.33 };
        let t = rayBox(o, [dx, dy, dz], hbox, bestT);
        if (t >= 0 && t < bestT) { bestT = t; bestVictim = os; bestHead = true; }
        t = rayBox(o, [dx, dy, dz], bbox, bestT);
        if (t >= 0 && t < bestT) { bestT = t; bestVictim = os; bestHead = false; }
      }

      if (bestVictim) {
        const t01 = bestT <= w.falloff[0] ? 0
                  : bestT >= w.falloff[1] ? 1
                  : (bestT - w.falloff[0]) / (w.falloff[1] - w.falloff[0]);
        const mul = 1 + (w.falloff[2] - 1) * t01;
        const dmg = w.dmg * (bestHead ? w.head : 1) * mul;
        const e = victims.get(bestVictim.id) || { dmg: 0, head: false };
        e.dmg += dmg;
        if (bestHead) e.head = true;
        victims.set(bestVictim.id, e);
      }
    }

    for (const [vid, e] of victims) {
      const victim = [...this.sessions.values()].find(x => x.id === vid);
      if (!victim || !victim.alive) continue;
      const dmg = Math.min(DAMAGE_CAP, e.dmg);
      victim.hp -= dmg;

      if (victim.hp <= 0) {
        victim.hp = 0;
        victim.alive = false;
        victim.deaths++;
        s.kills++;
        this.broadcast({
          t: "kill", by: s.id, victim: vid,
          byName: s.name, victimName: victim.name,
          hs: e.head ? 1 : 0,
        });
      } else {
        const victimWs = [...this.sessions.entries()].find(([_, x]) => x.id === vid)?.[0];
        if (victimWs) {
          victimWs.send(JSON.stringify({
            t: "hit", dmg: Math.round(dmg), from: s.id, hs: e.head ? 1 : 0,
            fromX: round2(s.x), fromZ: round2(s.z),
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

    const text = String(msg.m || "").slice(0, 180).trim();
    if (!text) return;

    const entry = { name: s.name, m: text, t: now };
    this.chatHistory.push(entry);
    if (this.chatHistory.length > CHAT_HISTORY) this.chatHistory.shift();

    this.broadcast({ t: "chat", name: s.name, m: text, ts: now });
  }

  broadcast(obj, excludeWs) {
    const data = JSON.stringify(obj);
    for (const ws of this.sessions.keys()) {
      if (ws === excludeWs) continue;
      try { ws.send(data); } catch {}
    }
  }

  // Ray against world geometry; returns min t or maxRange if clear
  rayWorld(ox, oy, oz, dx, dy, dz, maxRange) {
    let best = maxRange;
    for (const b of this.boxes) {
      const t = rayBox([ox, oy, oz], [dx, dy, dz], b, best);
      if (t >= 0 && t < best) best = t;
    }
    if (dy < -1e-6) {
      const t = -oy / dy;
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
      let a = (lo - oo) / dd;
      let c = (hi - oo) / dd;
      if (a > c) { const s = a; a = c; c = s; }
      if (a > tmin) tmin = a;
      if (c < tmax) tmax = c;
      if (tmin > tmax) return -1;
    }
  }
  return tmin;
}

const round2 = v => Math.round(v * 100) / 100;
const round4 = v => Math.round(v * 10000) / 10000;
