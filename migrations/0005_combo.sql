-- Étape 5 : empreinte de la combinaison de runes, pour prévenir quand une même combinaison existe déjà.
-- Calculée par le serveur à chaque enregistrement ; les anciennes lignes sont remplies à la demande (colonne nulle).
ALTER TABLE bindrunes ADD COLUMN combo TEXT;
CREATE INDEX IF NOT EXISTS idx_bindrunes_combo ON bindrunes (combo, published);
