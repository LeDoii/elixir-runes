-- Étape 2 : connexion Discord et bindrunes liées au compte.

-- Un compte = un identifiant Discord. On ne garde que l'identifiant et le pseudo (permission « identify »).
CREATE TABLE IF NOT EXISTS users (
  id          TEXT    PRIMARY KEY,          -- identifiant Discord
  username    TEXT    NOT NULL,
  global_name TEXT,
  created_at  INTEGER NOT NULL,
  last_login  INTEGER NOT NULL,
  banned      INTEGER NOT NULL DEFAULT 0    -- 1 : connexion refusée, sessions ignorées
);

-- Sessions : seule l'empreinte du jeton est stockée (le jeton est dans un cookie HttpOnly).
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);

-- Bindrunes du compte : un nom par compte (insensible à la casse).
CREATE TABLE IF NOT EXISTS bindrunes (
  id         TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL,
  name       TEXT    NOT NULL,
  name_key   TEXT    NOT NULL,
  data       TEXT    NOT NULL,              -- JSON validé : { r, s, t, l }
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, name_key)
);
CREATE INDEX IF NOT EXISTS idx_bindrunes_user ON bindrunes (user_id, updated_at);

-- Un code court créé en étant connecté est rattaché au compte (null sinon).
ALTER TABLE shared_bindrunes ADD COLUMN user_id TEXT;
