# ShotLine 2
This project is still under development!

---

## Accounts, skins, coins, shop (setup)

Everything account-related runs in the Worker (`src/api.js`, `src/lib.js`) and the `Arena` Durable Object, backed by **D1**.

```bash
npx wrangler d1 create shotline-db          # copy the database_id into wrangler.toml
npx wrangler d1 execute shotline-db --remote --file=schema.sql
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
