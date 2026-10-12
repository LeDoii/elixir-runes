-- Étape 4 : description des bindrunes et galerie publique.

-- Description libre (300 caractères au plus) ; publication volontaire dans la galerie.
ALTER TABLE bindrunes ADD COLUMN description  TEXT    NOT NULL DEFAULT '';
ALTER TABLE bindrunes ADD COLUMN published    INTEGER NOT NULL DEFAULT 0;     -- 1 : visible dans la galerie
ALTER TABLE bindrunes ADD COLUMN published_at INTEGER;                        -- date de la dernière publication

CREATE INDEX IF NOT EXISTS idx_bindrunes_published ON bindrunes (published, published_at);

-- Les codes courts portent aussi la description.
ALTER TABLE shared_bindrunes ADD COLUMN description TEXT NOT NULL DEFAULT '';
