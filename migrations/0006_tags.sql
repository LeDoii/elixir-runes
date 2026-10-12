-- Étape 6 : étiquettes des bindrunes (liste imposée + étiquettes libres), au plus 6 par bindrune.
-- Texte JSON : tableau de chaînes normalisées (minuscules, 2 à 20 caractères). Les étiquettes verrouillées des runes
-- ne sont pas stockées : elles se déduisent des runes de la bindrune (docs/tags.js, server/lib/tags.js).
ALTER TABLE bindrunes ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
ALTER TABLE shared_bindrunes ADD COLUMN tags TEXT NOT NULL DEFAULT '[]';
