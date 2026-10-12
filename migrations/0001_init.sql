-- Étape 1 : codes courts de partage (sans compte).
CREATE TABLE IF NOT EXISTS shared_bindrunes (
  code       TEXT    PRIMARY KEY,        -- 8 caractères, alphabet sans ambiguïté
  name       TEXT    NOT NULL,           -- nom nettoyé, 40 caractères au plus
  data       TEXT    NOT NULL,           -- JSON validé : { r, s, t, l }
  created_at INTEGER NOT NULL,           -- millisecondes
  ip_hash    TEXT    NOT NULL            -- empreinte de l'adresse IP (limitation d'envois), jamais l'adresse
);
CREATE INDEX IF NOT EXISTS idx_shared_ip_time ON shared_bindrunes (ip_hash, created_at);
