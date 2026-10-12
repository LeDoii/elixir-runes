// Étiquettes des bindrunes : mêmes règles que docs/tags.js (test de parité : tools/test_tags.mjs).
// Une étiquette par sens de chaque rune ; une bindrune garde tout ou partie des sens de chacune de ses runes (champ « t »).
// La colonne `tags` contient toutes les étiquettes de la bindrune : celles de ses runes puis celles que l'auteur a ajoutées.
export const MAX_TAGS = 6, MIN_LEN = 2, MAX_LEN = 20, MAX_STORED = 60;

export const RUNE_TAGS = {
  Fehu: ["Abondance", "Maîtrise", "Partage", "Cupidité"], Uruz: ["Vitalité", "Santé"], Thurisaz: ["Thor", "Défense"],
  Ansuz: ["Parole", "Écoute", "Communication"], Raidho: ["Mouvement", "Voyage", "Cycles"], Kenaz: ["Connaissance", "Lumière"],
  Gebo: ["Échange", "Don", "Équilibre"], Wunjo: ["Joie", "Accomplissement"], Hagalaz: ["Destruction", "Transformation"],
  Nauthiz: ["Contrainte", "Épreuve"], Isa: ["Immobilité", "Patience"], Jera: ["Cycles", "Récompense", "Temps"],
  Eihwaz: ["Renaissance", "Transformation"], Perthro: ["Mystère", "Hasard"], Algiz: ["Protection", "Élan", "Défense", "Divin"],
  Sowilo: ["Victoire", "Lumière"], Tiwaz: ["Justice", "Honneur"], Berkano: ["Renaissance", "Croissance"], Ehwaz: ["Partenariat", "Progrès"],
  Mannaz: ["Humanité", "Collaboration"], Laguz: ["Eau", "Intuition"], Ingwaz: ["Fertilité", "Potentiel"], Dagaz: ["Éveil", "Nouveau départ"],
  Othala: ["Héritage", "Transmission"],
};

export function normTag(s) {
  const t = String(s == null ? "" : s).normalize("NFC").toLowerCase()
    .replace(/[^\p{L}\p{N}' -]+/gu, " ").replace(/\s+/g, " ").trim().replace(/^[-' ]+|[-' ]+$/g, "").slice(0, MAX_LEN).trim();
  return t.length >= MIN_LEN ? t : "";
}

/** Liste quelconque → liste normalisée, sans doublon, de max étiquettes au plus. */
export function cleanTags(list, max = MAX_TAGS) {
  const out = [];
  (Array.isArray(list) ? list : []).forEach((x) => { const t = normTag(x); if (t && !out.includes(t) && out.length < max) out.push(t); });
  return out;
}

/** Colonne `tags` (texte JSON) → liste ; une valeur illisible donne une liste vide. */
export function parseTags(text) {
  try { return cleanTags(JSON.parse(text), MAX_STORED); } catch (e) { return []; }
}

/** Indices des sens gardés par une rune de la bindrune (t absent : tous). */
export function keptIndexes(r) {
  const n = (RUNE_TAGS[r.n] || []).length;
  return Array.isArray(r.t) ? Array.from(new Set(r.t.filter((i) => Number.isInteger(i) && i >= 0 && i < n))).sort((x, y) => x - y) : Array.from({ length: n }, (_, i) => i);
}

/** Étiquettes des runes d'une bindrune validée. */
export function deriveTags(d) {
  const out = [];
  d.r.forEach((r) => keptIndexes(r).forEach((i) => { const k = normTag(RUNE_TAGS[r.n][i]); if (!out.includes(k)) out.push(k); }));
  return out;
}

/** Toutes les étiquettes à enregistrer : celles des runes, puis les étiquettes ajoutées (nettoyées). */
export function allTags(d, extra) {
  const base = deriveTags(d);
  return base.concat(cleanTags(extra).filter((t) => !base.includes(t)));
}
