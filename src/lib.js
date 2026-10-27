/* Pure helpers shared by the API and the game server (no Cloudflare-only imports, so they are unit-testable). */
export const ADMIN_NAME = "NoDeX";
export const RESERVED = ["nodex","admin","administrator","moderator","mod","system","server","shotline","creator","staff","guest","bot","owner"];
export const NAME_RE = /^[A-Za-z0-9_]{3,14}$/;
export const NAMED_COLORS = {
  blue:"#3a8dff", red:"#ff4d4d", green:"#43e0a0", gold:"#ffc94d", purple:"#b06cff", pink:"#ff7ac8", cyan:"#4de3ff",
  orange:"#ff8a3d", white:"#ffffff", silver:"#c0c8d0", lime:"#a6ff4d", teal:"#2ec4b6", violet:"#8a5cff", yellow:"#ffe14d",
};
export const ITEMS = {
  col_solid:  { price: 10000,  name: "Solid name colour",    type: "color" },
  col_grad:   { price: 100000, name: "Gradient name colour", type: "color" },
  pw_heal:    { price: 15000,  name: "Healing Ring",         type: "power", id: "heal" },
  pw_poison:  { price: 15000,  name: "Poison Ring",          type: "power", id: "poison" },
  pw_dash:    { price: 10000,  name: "Dash",                 type: "power", id: "dash" },
  pw_shield:  { price: 25000,  name: "Shield Pulse",         type: "power", id: "shield" },
  pw_spectral:{ price: 20000,  name: "Spectral Arrow",       type: "power", id: "spectral" },
  pw_frost:   { price: 20000,  name: "Frost Nova",           type: "power", id: "frost" },
  pw_adrenaline:{ price: 12000,name: "Adrenaline",           type: "power", id: "adrenaline" },
  pet_buddy:  { price: 30000,  name: "Buddy Drone (pet)",    type: "pet" },
};
/* Power balance (ms / metres / hp). Only ONE can be equipped; all are cooldown-gated and short. */
export const POWERS = {
  heal:   { cd: 60000, dur: 5000, r: 4, rate: 6 },      // +6 hp/s for 5 s  (heals anyone standing inside)
  poison: { cd: 50000, dur: 5000, r: 4, dmg: 5 },       // 5 dmg/s for 5 s  (owner immune)
  dash:   { cd: 20000, dist: 6 },
  shield: { cd: 60000, dur: 3000, absorb: 30 },
  spectral:{ cd: 40000, glow: 8000, r: 7, range: 120 },        // arrow reveals enemies near the impact (through walls) for 8 s
  frost:  { cd: 45000, r: 5, slow: 0.55, ms: 3000, dmg: 8 },   // slows enemies in 5 m to 55% speed for 3 s
  adrenaline:{ cd: 50000, dur: 4500, boost: 1.35, heal: 10 },  // +35% speed for 4.5 s and a small heal
};
/* Buddy drone: follows you, intercepts some bullets, heals you slowly and restocks grenades. If it is destroyed in a match it is gone until bought again. */
export const PET = { hp: 100, heal: 2, nadeEvery: 8000, baseNadeEvery: 11000, nadeCapBase: 1, nadeCapPet: 3, hitR: 0.34, throwGap: 1000 };
export function petPos(s) {
  const c = Math.cos(s.yaw || 0), sn = Math.sin(s.yaw || 0);
  const fx = -sn, fz = -c, rx = c, rz = -sn;   // right-front of the owner, so it shields from the front and is visible
  return [s.x + rx * 0.75 + fx * 0.55, s.y + 1.5, s.z + rz * 0.75 + fz * 0.55];
}
/* Levels: XP = 10 per (counted) kill + 2 per minute played. level = 1 + floor(sqrt(XP/40)).  L10 = 3240 XP, L20 = 14440 XP. */
export const LEVEL_K = 40;
export const xpOf = (kills, playsec) => (kills | 0) * 10 + Math.floor((playsec | 0) / 60) * 2;
export const levelOf = (xp) => 1 + Math.floor(Math.sqrt(Math.max(0, xp) / LEVEL_K));
export const xpForLevel = (l) => LEVEL_K * (l - 1) * (l - 1);
export const TITLES = [[50, "Mythic"], [40, "Legend"], [30, "Elite"], [20, "Veteran"], [10, "Soldier"], [1, "Recruit"]];
export const titleOf = (l) => { for (const [m, t] of TITLES) if (l >= m) return t; return "Recruit"; };
export const ECON = {
  daily: 10, streakStep: 5, dailyMax: 50,
  hourCap: 600,                 // max coins from kills per rolling hour
  minVictimAliveMs: 8000,       // victim must have been alive this long
  sameVictim: [10, 5, 2, 0],    // reward for kill #1,#2,#3,#4+ on the same victim inside the window
  sameVictimWindowMs: 10 * 60 * 1000,
  lbRepeatLimit: 3,             // leaderboard kills: the 4th+ kill on the same victim in the window does not count
};

export function validName(n) { return typeof n === "string" && NAME_RE.test(n); }
export function isReserved(n) { return RESERVED.includes(String(n).toLowerCase()); }

export function parseTag(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const i = raw.lastIndexOf(":");
  const label = (i < 0 ? raw : raw.slice(0, i)).trim();
  let col = (i < 0 ? "white" : raw.slice(i + 1)).trim().toLowerCase();
  if (!/^[A-Za-z0-9 _\-]{1,12}$/.test(label)) return null;
  if (NAMED_COLORS[col]) col = NAMED_COLORS[col];
  else if (!/^#[0-9a-f]{6}$/.test(col)) return null;
  return { label, color: col };
}
/* Accept '#rrggbb' or 'g:#rrggbb,#rrggbb' (user-chosen). 'sp:*' is never accepted from users. */
export function parseUserColor(c) {
  if (typeof c !== "string") return null;
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return { kind: "solid", value: c.toLowerCase() };
  const m = /^g:(#[0-9a-fA-F]{6}),(#[0-9a-fA-F]{6})$/.exec(c);
  if (m) return { kind: "grad", value: "g:" + m[1].toLowerCase() + "," + m[2].toLowerCase() };
  return null;
}
export function dayKey(ms) { return new Date(ms).toISOString().slice(0, 10); }
export function dailyReward(streak) { return Math.min(ECON.dailyMax, ECON.daily + (Math.max(1, streak) - 1) * ECON.streakStep); }
export function killReward({ victimAliveMs, repeats, hourAmt }) {
  if (victimAliveMs < ECON.minVictimAliveMs) return 0;
  const base = repeats < ECON.sameVictim.length ? ECON.sameVictim[repeats] : 0;
  return Math.max(0, Math.min(base, ECON.hourCap - hourAmt));
}

/* ---------- PNG validation (skin must be exactly 64x64, small, with only standard chunks) ---------- */
const PNG_SIG = [137, 80, 78, 71, 13, 10, 26, 10];
const OK_CHUNKS = new Set(["IHDR","PLTE","tRNS","IDAT","IEND","sRGB","gAMA","pHYs","cHRM","iCCP","sBIT","bKGD"]);
export function validPng(u8, maxBytes = 32768) {
  if (!(u8 instanceof Uint8Array) || u8.length < 60 || u8.length > maxBytes) return false;
  for (let i = 0; i < 8; i++) if (u8[i] !== PNG_SIG[i]) return false;
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let off = 8, first = true, sawEnd = false;
  while (off + 12 <= u8.length) {
    const len = dv.getUint32(off);
    const type = String.fromCharCode(u8[off+4], u8[off+5], u8[off+6], u8[off+7]);
    if (!OK_CHUNKS.has(type)) return false;
    if (off + 12 + len > u8.length) return false;
    if (first) {
      if (type !== "IHDR" || len !== 13) return false;
      if (dv.getUint32(off + 8) !== 64 || dv.getUint32(off + 12) !== 64) return false;
      first = false;
    }
    off += 12 + len;
    if (type === "IEND") { sawEnd = true; break; }
  }
  return sawEnd && !first;
}

/* ---------- encoding / crypto ---------- */
const enc = new TextEncoder();
export function b64(buf) { const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf); let s = ""; for (let i = 0; i < u.length; i += 8192) s += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(s); }
export function unb64(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
export function hex(buf) { return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join(""); }
export async function sha256Hex(str) { return hex(await crypto.subtle.digest("SHA-256", enc.encode(str))); }
export function randomToken(bytes = 32) { return hex(crypto.getRandomValues(new Uint8Array(bytes))); }
const ITER = 100000;   // Workers' PBKDF2 maximum
async function derive(pw, salt, iter) {
  const key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: iter }, key, 256));
}
export async function hashPassword(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(await derive(pw, salt, ITER))}`;
}
export async function verifyPassword(pw, stored) {
  const p = String(stored).split("$");
  if (p.length !== 4 || p[0] !== "pbkdf2") return false;
  const iter = Math.min(+p[1] || ITER, ITER), want = unb64(p[3]), got = await derive(pw, unb64(p[2]), iter);
  if (want.length !== got.length) return false;
  let d = 0; for (let i = 0; i < want.length; i++) d |= want[i] ^ got[i];
  return d === 0;
}

/* ======================================================================
   Match rules + movement-tech validation (pure; unit-tested in tests/systems.cjs).
   The arena used to be endless; a match is now first-to-scoreLimit or durationMs,
   followed by an intermission. All state lives in memory on the Durable Object
   (never on the 2 KB WebSocket attachment).
   ====================================================================== */
export const MATCH = { scoreLimit: 25, durationMs: 10 * 60 * 1000, intermissionMs: 15000 };

/* Grapple-sling / chrono-recall server limits.
   slingLimit is an *apparent* speed ceiling (m/s) applied only inside a short, client-announced,
   rate-limited window; slingMinDt raises the dt floor so packet bunching cannot inflate apparent speed. */
export const MOVE_TECH = {
  slingLimit: 70, slingMinDt: 0.045, slingWindowMs: 12000, slingReleaseMs: 6000, slingRegrantMs: 400,
  recallCooldownMs: 7000, recallMinAgeMs: 700, recallMaxAgeMs: 6500, recallTolerance: 3.0, recallBlindRange: 40,
  histKeepMs: 7000,
};

/* Kills desc, deaths asc, id asc (deterministic). Never mutates the input. */
export function rankBoard(list) {
  return list.slice().sort((a, b) =>
    ((b.kills | 0) - (a.kills | 0)) || ((a.deaths | 0) - (b.deaths | 0)) || String(a.id).localeCompare(String(b.id)));
}

/* Winner, or null for "no kills at all" / a dead heat on kills AND deaths. */
export function matchWinner(board) {
  const r = rankBoard(board);
  if (!r.length || (r[0].kills | 0) < 1) return null;
  if (r.length > 1 && (r[1].kills | 0) === (r[0].kills | 0) && (r[1].deaths | 0) === (r[0].deaths | 0)) return null;
  return r[0];
}

/* Is a claimed Chrono-Recall destination plausible?
   hist = [[tMs,x,y,z],...] recorded server-side from accepted state packets.
   Accept if some sample aged [recallMinAgeMs, recallMaxAgeMs] lies within recallTolerance metres of the target.
   If there is no usable history (fresh join / instance restart) accept only a short blind hop from `cur`. */
export function recallPlausible(hist, now, target, cur, M = MOVE_TECH) {
  if (!target.every(Number.isFinite)) return false;
  let sawOld = false;
  for (const h of hist || []) {
    const age = now - h[0];
    if (age < M.recallMinAgeMs || age > M.recallMaxAgeMs) continue;
    sawOld = true;
    if (Math.hypot(h[1] - target[0], h[2] - target[1], h[3] - target[2]) <= M.recallTolerance) return true;
  }
  if (sawOld) return false;
  return Math.hypot(cur[0] - target[0], cur[1] - target[1], cur[2] - target[2]) <= M.recallBlindRange;
}
