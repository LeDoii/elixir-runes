-- Étape 3 : page d'administration (journal des actions, index de recherche).

CREATE TABLE IF NOT EXISTS admin_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         INTEGER NOT NULL,
  admin_id   TEXT    NOT NULL,
  admin_name TEXT    NOT NULL,
  action     TEXT    NOT NULL,              -- delete_bindrune, delete_code, ban, unban
  target     TEXT    NOT NULL,              -- identifiant de la cible
  detail     TEXT    NOT NULL DEFAULT ''    -- nom de la bindrune, pseudo...
);
CREATE INDEX IF NOT EXISTS idx_admin_log_at ON admin_log (at);

CREATE INDEX IF NOT EXISTS idx_shared_user ON shared_bindrunes (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_shared_created ON shared_bindrunes (created_at);
