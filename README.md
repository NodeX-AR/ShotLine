# ShotLine 2
This project is still under development!

---

## Accounts, skins, coins, shop (setup)

Everything account-related runs in the Worker (`src/api.js`, `src/lib.js`) and the `Arena` Durable Object, backed by **D1**.

```bash
npx wrangler d1 create shotline-db          # copy the database_id into wrangler.toml
npx wrangler d1 execute shotline-db --remote --file=schema.sql       # fresh install
# upgrading an existing database (adds KILLS / PLAYSEC for levels + leaderboard):
#   npx wrangler d1 execute shotline-db --remote --file=migrate_v2.sql
npx wrangler secret put ADMIN_PASSWORD      # already used by the in-game admin tools
npm run deploy
# local dev:
npx wrangler d1 execute shotline-db --local --file=schema.sql && npm run dev
```

**Your admin account.** Reserved names (`NoDeX`, `admin`, `creator` …) can't be registered normally. Create yours once with the admin key:

```bash
curl -X POST https://YOUR-HOST/api/signup -H 'content-type: application/json' \
  -d '{"un":"NoDeX","pw":"a-strong-password","adminKey":"<ADMIN_PASSWORD>"}'
```
Guests can no longer take reserved or registered names (they are renamed `Guest####`).

**Tags (manual only).** `TAG` is never writable from the game. Format `Label:colour` (colour name or `#rrggbb`):
```bash
npx wrangler d1 execute shotline-db --remote --command "UPDATE users SET TAG='Creator:blue' WHERE UN='N1xiey'"
npx wrangler d1 execute shotline-db --remote --command "UPDATE users SET TAG=NULL WHERE UN='N1xiey'"   # remove
```
Chat shows `[Creator]N1xiey: hello` with `[Creator]` in the tag colour; players without a tag show `N1xiey: hello`.

**Special name gradients (manual only).** Define stops in `public/account.js` → `SPECIAL_GRADIENTS`, then assign:
```bash
npx wrangler d1 execute shotline-db --remote --command "UPDATE users SET COL='sp:creator' WHERE UN='N1xiey'"
```

**Give coins / inspect.**
```bash
npx wrangler d1 execute shotline-db --remote --command "UPDATE users SET MONEY=MONEY+500 WHERE UN='N1xiey'"
```

**Economy (all server-side, see `ECON` in `src/lib.js`).** Daily login 10 → +5 per streak day up to 50. Kill = 10 coins in online matches only; victim must have been alive ≥ 8 s; repeat kills on the same player in 10 min pay 10 / 5 / 2 / 0; max 600 kill-coins per rolling hour. Solid name colour 10 000, gradient 100 000. Powers (one equipped, cooldown-gated): Healing Ring 15 000, Poison Ring 15 000, Dash 10 000, Shield Pulse 25 000. Purchases use compare-and-swap updates so parallel requests can't double-spend.

**Skins.** Standard Minecraft 64×64 PNG (64×32 legacy skins are converted in the browser); classic or slim arms; validated again on the server (size, 64×64, PNG chunks).

**Tests used while building** (not shipped): API/shop/economy rules and the Durable Object kill/coin/power/explosion logic were exercised against a SQLite stand-in for D1.

## v2: levels, global leaderboard, fists, buddy drone, new powers

- **Levels:** XP = 10 per counted kill + 2 per minute played online; level = 1 + floor(sqrt(XP / 40)). Level 10 = 3,240 XP, level 20 = 14,440 XP. Titles: Recruit, Soldier (10), Veteran (20), Elite (30), Legend (40), Mythic (50). The level badge shows in chat, the scoreboard and above players' heads. A kill counts only if the victim was alive >= 8 s and it is not the 4th+ kill on the same victim within 10 minutes.
- **Global leaderboard:** `GET /api/leaderboard?by=kills|time` (top 50 + your rank when logged in). Shown in the **Ranks** tab.
- **Fists:** weapon slot 6 (melee, 22 dmg, 2.3 m reach). First-person arms use the player's own skin.
- **Grenades:** now a stock (not just a timer): 1 grenade that refills in 11 s, or up to 3 with the drone (refills every 8 s). A visible throw animation (pull pin, wind-up, throw); the gun lowers while you throw or cast.
- **Buddy Drone (30,000 coins):** floats beside you, soaks bullets that cross it (and explosions), heals 2 HP/s, restocks grenades. If it is destroyed in an online match it is removed from your account until bought again. In single player it is free practice and is never lost.
- **New powers:** Spectral Arrow (20,000: enemies near the impact glow through walls for 8 s), Frost Nova (20,000: 8 dmg + 55% slow for 3 s in 5 m), Adrenaline (12,000: +35% speed 4.5 s, +10 HP).
- **Movement/collision fix:** physics is sub-stepped, so dashing or a low frame rate can no longer skip through thin walls or the floor; anyone who still ends up outside the map is returned to their last safe ground.
- **Recoil:** per-weapon spray patterns that climb and drift while you hold fire and settle when you stop; first ADS shot after rest is near-perfect.
- **Mobile:** new landscape layout (joystick bottom-left, action grid bottom-right, ammo bottom-centre, health under the pause button), two-column menu, haptic feedback (toggle in Settings).
