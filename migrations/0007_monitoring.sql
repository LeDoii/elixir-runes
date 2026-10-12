-- Étape 7 : suivi du site. Erreurs du serveur (les 200 dernières) et compteurs journaliers (écritures et erreurs).
CREATE TABLE IF NOT EXISTS error_log (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  at      INTEGER NOT NULL,
  method  TEXT    NOT NULL,
  path    TEXT    NOT NULL,           -- chemin seul : jamais de paramètres d'adresse (code Discord, état…)
  message TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_error_log_at ON error_log (at);

CREATE TABLE IF NOT EXISTS usage_daily (
  day       TEXT    PRIMARY KEY,      -- AAAA-MM-JJ (UTC, comme la remise à zéro des limites de Cloudflare)
  mutations INTEGER NOT NULL DEFAULT 0,
  errors    INTEGER NOT NULL DEFAULT 0
);
