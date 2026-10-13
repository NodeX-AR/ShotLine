/* HTTP API: accounts, skins, coins, shop.  All money logic lives here / in the game server — never in the client. */
import {
  ADMIN_NAME, ITEMS, POWERS, ECON, validName, isReserved, parseTag, parseUserColor, dayKey, dailyReward,
  validPng, b64, unb64, sha256Hex, randomToken, hashPassword, verifyPassword, xpOf, levelOf, xpForLevel, titleOf,
} from "./lib.js";

const SESSION_MS = 30 * 24 * 3600 * 1000;
const json = (o, status = 200, extra = {}) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...extra } });
const err = (m, status = 400) => json({ ok: false, error: m }, status);

export async function userByToken(env, token) {
  if (!token || typeof token !== "string" || token.length < 32) return null;
  const th = await sha256Hex(token);
  return await env.DB.prepare(
    "SELECT u.* FROM sessions s JOIN users u ON u.id=s.uid WHERE s.token_hash=? AND s.exp>?"
  ).bind(th, Date.now()).first();
}
async function newSession(env, uid) {
  const token = randomToken(32);
  await env.DB.prepare("INSERT INTO sessions(token_hash,uid,exp) VALUES(?,?,?)").bind(await sha256Hex(token), uid, Date.now() + SESSION_MS).run();
  return token;
}
async function limited(env, key, max, windowMs) {
  const now = Date.now();
  const r = await env.DB.prepare("SELECT n,reset FROM attempts WHERE k=?").bind(key).first();
  if (r && r.reset > now && r.n >= max) return true;
  return false;
}
async function bump(env, key, windowMs) {
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO attempts(k,n,reset) VALUES(?,1,?) ON CONFLICT(k) DO UPDATE SET n=CASE WHEN reset<? THEN 1 ELSE n+1 END, reset=CASE WHEN reset<? THEN ? ELSE reset END"
  ).bind(key, now + windowMs, now, now, now + windowMs).run();
}
export function publicMe(u) {
  const t = parseTag(u.TAG || "");
  let items = []; try { items = JSON.parse(u.EFFECTS || "[]"); } catch {}
  const xp = xpOf(u.KILLS, u.PLAYSEC), lv = levelOf(xp);
  return {
    un: u.UN, money: u.MONEY, col: u.COL || null, tag: t, items, power: u.POWER || null,
    skm: u.SKM, skv: u.SKV, hasSkin: !!u.SKN || u.SKV > 0, streak: u.STREAK,
    kills: u.KILLS | 0, playsec: u.PLAYSEC | 0, xp, level: lv, title: titleOf(lv), xpThis: xpForLevel(lv), xpNext: xpForLevel(lv + 1),
    dailyReady: u.LAST_DAILY !== dayKey(Date.now()),
  };
}
const bearer = (req) => (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
async function body(req) { try { return await req.json(); } catch { return null; } }

export async function handleApi(request, env) {
  if (!env.DB) return err("Database not configured", 503);
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\//, "");
  const ip = request.headers.get("cf-connecting-ip") || "0";

  if (request.method === "GET" && path.startsWith("skin/")) {
    const name = decodeURIComponent(path.slice(5));
    if (!validName(name)) return new Response("not found", { status: 404 });
    const r = await env.DB.prepare("SELECT SKN FROM users WHERE UN=?").bind(name).first();
    if (!r || !r.SKN) return new Response("no skin", { status: 404 });
    const bytes = r.SKN instanceof ArrayBuffer ? new Uint8Array(r.SKN) : new Uint8Array(r.SKN);
    return new Response(bytes, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" } });
  }
  if (request.method === "GET" && path === "shop") {
    return json({ ok: true, items: Object.entries(ITEMS).map(([id, v]) => ({ id, ...v })), powers: POWERS, econ: ECON });
  }
  if (request.method === "GET" && path === "leaderboard") {
    const by = url.searchParams.get("by") === "time" ? "time" : "kills";
    const order = by === "time" ? "PLAYSEC DESC, KILLS DESC" : "KILLS DESC, PLAYSEC DESC";
    const rows = await env.DB.prepare(`SELECT UN,KILLS,PLAYSEC,COL,TAG FROM users WHERE KILLS>0 OR PLAYSEC>0 ORDER BY ${order} LIMIT 50`).all();
    const list = (rows.results || []).map((r, i) => {
      const lv = levelOf(xpOf(r.KILLS, r.PLAYSEC)), t = parseTag(r.TAG || "");
      return { rank: i + 1, un: r.UN, kills: r.KILLS | 0, playsec: r.PLAYSEC | 0, level: lv, col: r.COL || null, tag: t };
    });
    let me = null;
    const u0 = await userByToken(env, bearer(request));
    if (u0) {
      const col = by === "time" ? "PLAYSEC" : "KILLS", v = u0[col] | 0;
      const c = await env.DB.prepare(`SELECT COUNT(*) AS n FROM users WHERE ${col}>?`).bind(v).first();
      me = { un: u0.UN, rank: (c ? c.n : 0) + 1, kills: u0.KILLS | 0, playsec: u0.PLAYSEC | 0, level: levelOf(xpOf(u0.KILLS, u0.PLAYSEC)) };
    }
    return json({ ok: true, by, list, me }, 200, { "cache-control": me ? "private, no-store" : "public, max-age=20" });
  }
  if (request.method !== "POST" && !(request.method === "GET" && path === "me")) return err("Not found", 404);

  if (path === "signup") {
    const b = await body(request); if (!b) return err("Bad request");
    const un = String(b.un || ""), pw = String(b.pw || "");
    if (!validName(un)) return err("Username must be 3-14 letters, numbers or _");
    if (pw.length < 6 || pw.length > 64) return err("Password must be 6-64 characters");
    if (isReserved(un) && !(env.ADMIN_PASSWORD && b.adminKey === env.ADMIN_PASSWORD)) return err("That name is reserved");
    if (await limited(env, "su:" + ip, 5, 3600000)) return err("Too many sign-ups from this network. Try later.", 429);
    let skin = null, skm = b.slim ? "slim" : "classic";
    if (b.skin) { try { skin = unb64(String(b.skin)); } catch { return err("Bad skin data"); } if (!validPng(skin)) return err("Skin must be a 64x64 PNG under 32 KB"); }
    const exists = await env.DB.prepare("SELECT 1 AS x FROM users WHERE UN=?").bind(un).first();
    if (exists) return err("That username is taken", 409);
    const recovery = randomToken(8).toUpperCase().replace(/(.{4})/g, "$1-").slice(0, 19);
    const ph = await hashPassword(pw);
    try {
      await env.DB.prepare("INSERT INTO users(UN,PASS,SKN,SKM,SKV,REC,CREATED) VALUES(?,?,?,?,?,?,?)")
        .bind(un, ph, skin, skm, skin ? 1 : 0, await sha256Hex(recovery), Date.now()).run();
    } catch { return err("That username is taken", 409); }
    await bump(env, "su:" + ip, 3600000);
    const u = await env.DB.prepare("SELECT * FROM users WHERE UN=?").bind(un).first();
    return json({ ok: true, token: await newSession(env, u.id), me: publicMe(u), recovery });
  }

  if (path === "login") {
    const b = await body(request); if (!b) return err("Bad request");
    const un = String(b.un || ""), pw = String(b.pw || "");
    if (await limited(env, "li:" + ip, 20, 600000) || await limited(env, "lu:" + un.toLowerCase(), 8, 600000)) return err("Too many attempts. Wait a few minutes.", 429);
    const u = validName(un) ? await env.DB.prepare("SELECT * FROM users WHERE UN=?").bind(un).first() : null;
    const good = u ? await verifyPassword(pw, u.PASS) : (await hashPassword(pw), false);   // equalise timing
    if (!good) { await bump(env, "li:" + ip, 600000); await bump(env, "lu:" + un.toLowerCase(), 600000); return err("Wrong username or password", 401); }
    return json({ ok: true, token: await newSession(env, u.id), me: publicMe(u) });
  }

  if (path === "reset") {
    const b = await body(request); if (!b) return err("Bad request");
    const un = String(b.un || ""), code = String(b.code || "").toUpperCase().trim(), pw = String(b.pw || "");
    if (pw.length < 6 || pw.length > 64) return err("Password must be 6-64 characters");
    if (await limited(env, "rs:" + ip, 5, 3600000)) return err("Too many attempts", 429);
    const u = validName(un) ? await env.DB.prepare("SELECT * FROM users WHERE UN=?").bind(un).first() : null;
    if (!u || !u.REC || u.REC !== await sha256Hex(code)) { await bump(env, "rs:" + ip, 3600000); return err("Wrong username or recovery code", 401); }
    await env.DB.prepare("UPDATE users SET PASS=? WHERE id=?").bind(await hashPassword(pw), u.id).run();
    await env.DB.prepare("DELETE FROM sessions WHERE uid=?").bind(u.id).run();
    return json({ ok: true });
  }

  /* ---- everything below needs a valid session ---- */
  const token = bearer(request);
  const u = await userByToken(env, token);
  if (!u) return err("Not logged in", 401);

  if (path === "me") return json({ ok: true, me: publicMe(u) });
  if (path === "logout") { await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(await sha256Hex(token)).run(); return json({ ok: true }); }

  if (path === "daily") {
    const today = dayKey(Date.now()), yest = dayKey(Date.now() - 86400000);
    if (u.LAST_DAILY === today) return json({ ok: false, error: "Already claimed today", me: publicMe(u) });
    const streak = u.LAST_DAILY === yest ? u.STREAK + 1 : 1, amt = dailyReward(streak);
    const r = await env.DB.prepare("UPDATE users SET MONEY=MONEY+?,LAST_DAILY=?,STREAK=? WHERE id=? AND (LAST_DAILY IS NULL OR LAST_DAILY<>?)")
      .bind(amt, today, streak, u.id, today).run();
    if (!r.meta || r.meta.changes !== 1) return json({ ok: false, error: "Already claimed today" });
    const nu = await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(u.id).first();
    return json({ ok: true, amount: amt, streak, me: publicMe(nu) });
  }

  if (path === "skin") {
    const b = await body(request); if (!b) return err("Bad request");
    let bytes; try { bytes = unb64(String(b.skin || "")); } catch { return err("Bad skin data"); }
    if (!validPng(bytes)) return err("Skin must be a 64x64 PNG under 32 KB");
    await env.DB.prepare("UPDATE users SET SKN=?,SKM=?,SKV=SKV+1 WHERE id=?").bind(bytes, b.slim ? "slim" : "classic", u.id).run();
    return json({ ok: true, me: publicMe(await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(u.id).first()) });
  }

  if (path === "buy") {
    const b = await body(request); const item = ITEMS[b && b.item];
    if (!item) return err("Unknown item");
    let owned = []; try { owned = JSON.parse(u.EFFECTS || "[]"); } catch {}
    if (owned.includes(b.item)) return err("You already own this");
    if (u.MONEY < item.price) return err("Not enough coins");
    const next = JSON.stringify([...owned, b.item]);
    // compare-and-swap on EFFECTS + MONEY guard => no double spend even with parallel requests
    const r = await env.DB.prepare("UPDATE users SET MONEY=MONEY-?,EFFECTS=? WHERE id=? AND MONEY>=? AND EFFECTS=?")
      .bind(item.price, next, u.id, item.price, u.EFFECTS).run();
    if (!r.meta || r.meta.changes !== 1) return err("Purchase failed, try again", 409);
    return json({ ok: true, me: publicMe(await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(u.id).first()) });
  }

  if (path === "equip") {
    const b = await body(request); const id = b && b.power;
    let owned = []; try { owned = JSON.parse(u.EFFECTS || "[]"); } catch {}
    if (id === null || id === "") { await env.DB.prepare("UPDATE users SET POWER=NULL WHERE id=?").bind(u.id).run(); }
    else {
      if (!POWERS[id] || !owned.includes("pw_" + id)) return err("You don't own that power");
      await env.DB.prepare("UPDATE users SET POWER=? WHERE id=?").bind(id, u.id).run();
    }
    return json({ ok: true, me: publicMe(await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(u.id).first()) });
  }

  if (path === "color") {
    const b = await body(request);
    let owned = []; try { owned = JSON.parse(u.EFFECTS || "[]"); } catch {}
    if (b && (b.color === null || b.color === "")) { await env.DB.prepare("UPDATE users SET COL=NULL WHERE id=?").bind(u.id).run(); }
    else {
      const c = parseUserColor(b && b.color);
      if (!c) return err("Invalid colour");
      if (c.kind === "solid" && !owned.includes("col_solid") && !owned.includes("col_grad")) return err("Buy the solid colour first");
      if (c.kind === "grad" && !owned.includes("col_grad")) return err("Buy the gradient colour first");
      await env.DB.prepare("UPDATE users SET COL=? WHERE id=?").bind(c.value, u.id).run();
    }
    return json({ ok: true, me: publicMe(await env.DB.prepare("SELECT * FROM users WHERE id=?").bind(u.id).first()) });
  }
  return err("Not found", 404);
}
