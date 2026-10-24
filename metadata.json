-- Run ONCE on an existing database created from the first schema.sql:
--   wrangler d1 execute shotline-db --remote --file=migrate_v2.sql
ALTER TABLE users ADD COLUMN KILLS   INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN PLAYSEC INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS users_kills ON users(KILLS DESC);
CREATE INDEX IF NOT EXISTS users_play  ON users(PLAYSEC DESC);
