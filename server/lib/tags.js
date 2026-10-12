// Étiquettes des bindrunes : mêmes règles que docs/tags.js (test de parité : tools/test_tags.mjs).
// Les étiquettes enregistrées sont normalisées (minuscules, 2 à 20 caractères, 6 au plus). Les étiquettes verrouillées des runes
// ne sont pas stockées : elles servent seulement au filtre de la galerie (une bindrune porte celles de ses runes).
export const MAX_TAGS = 6, MIN_LEN = 2, MAX_LEN = 20;

export const RUNE_TAGS = {
  Fehu: ["Abondance"], Uruz: ["Force", "Vitalité"], Thurisaz: ["Force", "Défense"], Ansuz: ["Communication", "Sagesse"],
  Raidho: ["Voyage", "Cycles"], Kenaz: ["Connaissance", "Lumière"], Gebo: ["Échange", "Partenariat"], Wunjo: ["Joie", "Harmonie"],
  Hagalaz: ["Transformation"], Nauthiz: ["Épreuve"], Isa: ["Immobilité", "Patience"], Jera: ["Cycles"],
  Eihwaz: ["Renaissance", "Transformation"], Perthro: ["Mystère", "Destin"], Algiz: ["Protection", "Défense"], Sowilo: ["Lumière", "Victoire"],
  Tiwaz: ["Justice", "Courage"], Berkano: ["Croissance", "Guérison"], Ehwaz: ["Partenariat", "Harmonie"], Mannaz: ["Humanité"],
  Laguz: ["Intuition", "Eau"], Ingwaz: ["Fertilité", "Paix"], Dagaz: ["Éveil", "Renaissance"], Othala: ["Héritage"],
};

export function normTag(s) {
  const t = String(s == null ? "" : s).normalize("NFC").toLowerCase()
    .replace(/[^\p{L}\p{N}' -]+/gu, " ").replace(/\s+/g, " ").trim().replace(/^[-' ]+|[-' ]+$/g, "").slice(0, MAX_LEN).trim();
  return t.length >= MIN_LEN ? t : "";
}

/** Liste quelconque → liste normalisée, sans doublon, de MAX_TAGS au plus. */
export function cleanTags(list) {
  const out = [];
  (Array.isArray(list) ? list : []).forEach((x) => { const t = normTag(x); if (t && !out.includes(t) && out.length < MAX_TAGS) out.push(t); });
  return out;
}

/** Colonne `tags` (texte JSON) → liste ; une valeur illisible donne une liste vide. */
export function parseTags(text) {
  try { return cleanTags(JSON.parse(text)); } catch (e) { return []; }
}

/** Noms des runes qui portent l'étiquette (normalisée) : pour retrouver les bindrunes qui la portent par leurs runes. */
export function runesWithTag(tag) {
  return Object.keys(RUNE_TAGS).filter((n) => RUNE_TAGS[n].some((t) => normTag(t) === tag));
}
