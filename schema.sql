-- ShotLine accounts. Apply with:  wrangler d1 execute shotline-db --remote --file=schema.sql
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  UN          TEXT    NOT NULL UNIQUE COLLATE NOCASE,   -- username
  PASS        TEXT    NOT NULL,                         -- pbkdf2$iter$salt$hash (never plain)
  SKN         BLOB,                                     -- 64x64 skin PNG
  SKM         TEXT    NOT NULL DEFAULT 'classic',       -- 'classic' | 'slim' arms
  SKV         INTEGER NOT NULL DEFAULT 0,               -- skin version (cache buster)
  MONEY       INTEGER NOT NULL DEFAULT 0,               -- in-game coins
  COL         TEXT,                                     -- name colour: '#rrggbb' | 'g:#a,#b' | 'sp:<id>' (sp set by hand)
  TAG         TEXT,                                     -- manual only, e.g. 'Creator:blue'
  EFFECTS     TEXT    NOT NULL DEFAULT '[]',            -- JSON array of owned item ids
  POWER       TEXT,                                     -- equipped power id
  REC         TEXT,                                     -- sha256 of recovery code
  LAST_DAILY  TEXT,                                     -- 'YYYY-MM-DD' (UTC)
  STREAK      INTEGER NOT NULL DEFAULT 0,
  EARN_T      INTEGER NOT NULL DEFAULT 0,               -- start of current earn window (ms)
  EARN_AMT    INTEGER NOT NULL DEFAULT 0,               -- coins earned from kills this window
  KILLS       INTEGER NOT NULL DEFAULT 0,               -- counted kills (leaderboard + XP)
  PLAYSEC     INTEGER NOT NULL DEFAULT 0,               -- seconds played in online matches (leaderboard + XP)
  CREATED     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS users_kills ON users(KILLS DESC);
CREATE INDEX IF NOT EXISTS users_play  ON users(PLAYSEC DESC);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  uid        INTEGER NOT NULL,
  exp        INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_uid ON sessions(uid);
CREATE TABLE IF NOT EXISTS attempts (
  k     TEXT PRIMARY KEY,
  n     INTEGER NOT NULL,
  reset INTEGER NOT NULL
);
