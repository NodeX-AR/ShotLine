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
};
/* Power balance (ms / metres / hp). Only ONE can be equipped; all are cooldown-gated and short. */
export const POWERS = {
  heal:   { cd: 60000, dur: 5000, r: 4, rate: 6 },      // +6 hp/s for 5 s  (heals anyone standing inside)
  poison: { cd: 50000, dur: 5000, r: 4, dmg: 5 },       // 5 dmg/s for 5 s  (owner immune)
  dash:   { cd: 20000, dist: 6 },
  shield: { cd: 60000, dur: 3000, absorb: 30 },
};
export const ECON = {
  daily: 10, streakStep: 5, dailyMax: 50,
  hourCap: 600,                 // max coins from kills per rolling hour
  minVictimAliveMs: 8000,       // victim must have been alive this long
  sameVictim: [10, 5, 2, 0],    // reward for kill #1,#2,#3,#4+ on the same victim inside the window
  sameVictimWindowMs: 10 * 60 * 1000,
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
