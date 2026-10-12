// Étiquettes des bindrunes : mêmes règles que docs/tags.js (test de parité : tools/test_tags.mjs).
// Chaque sens de chaque rune a sa liste d'étiquettes (vide si aucune) ; une bindrune garde tout ou partie des sens de chacune de ses runes (champ « t »).
// La colonne `tags` contient toutes les étiquettes de la bindrune : celles de ses runes puis celles que l'auteur a ajoutées.
export const MAX_TAGS = 6, MIN_LEN = 2, MAX_LEN = 20, MAX_STORED = 60;

export const RUNE_TAGS = {
  Fehu: [["Abondance"], ["Maîtrise"], ["Partage"], ["Cupidité"]],
  Uruz: [["Force vitale", "Endurance"], ["Santé"]],
  Thurisaz: [[], ["Force de défense", "Dissipation"]],
  Ansuz: [["Parole", "Expression"], ["Écoute"], ["Communication", "Sagesse"]],
  Raidho: [["Mouvement", "Rythme"], ["Voyage"], ["Ordre cosmique", "Cycle naturel"]],
  Kenaz: [["Connaissance", "Révélation", "Créativité"], ["Feu", "Lumière"]],
  Gebo: [["Don", "Échange", "Partenariat"], [], ["Équilibre"]],
  Wunjo: [["Joie", "Bonheur", "Harmonie"], ["Réalisation", "Satisfaction", "Partage"]],
  Hagalaz: [["Grêle", "Force destructrice", "Bouleversement"], ["Transformation", "Changement"]],
  Nauthiz: [["Contrainte", "Nécessité"], ["Épreuve", "Limitation", "Croissance"]],
  Isa: [["Glace", "Immobilité", "Gel", "Stagnation"], ["Patience", "Réflexion"]],
  Jera: [["Cycle des saisons", "Récolte"], ["Récompense"], ["Temps"]],
  Eihwaz: [["Renaissance", "Mort"], ["Transformation", "Continuité", "Lien inter-mondes"]],
  Perthro: [["Mystère", "Destin"], ["Hasard", "Secret", "Opportunité"]],
  Algiz: [["Protection"], [], ["Défense"], ["Énergie divine"]],
  Sowilo: [["Énergie solaire", "Victoire", "Clarté"], ["Lumière", "Succès", "Guidance"]],
  Tiwaz: [["Justice", "Courage", "Sacrifice"], ["Honneur", "Leadership"]],
  Berkano: [["Renaissance", "Fertilité"], ["Croissance", "Famille", "Nouveau départ", "Guérison", "Prospérité"]],
  Ehwaz: [["Partenariat", "Confiance mutuelle"], ["Mouvement", "Progrès", "Coopération"]],
  Mannaz: [["Humanité", "Soi"], ["Collaboration", "Conscience de soi", "Relation sociale"]],
  Laguz: [["Eau", "Source de vie", "Inconscient"], ["Intuition", "Émotion", "Flux", "Énergie vitale"]],
  Ingwaz: [["Fertilité", "Paix", "Abondance"], ["Potentiel", "Réalisation", "Plénitude"]],
  Dagaz: [["Jour", "Aube", "Transformation", "Éveil"], ["Nouveau départ", "Prospérité", "Accomplissement"]],
  Othala: [["Héritage", "Possession familiale", "Tradition"], ["Transmission", "Savoir", "Identité culturelle", "Origine"]],
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

/** Étiquettes d'une rune (tous ses sens), normalisées et sans doublon, dans l'ordre du livre. */
export const runeTags = (name) => Array.from(new Set([].concat(...(RUNE_TAGS[name] || [])).map(normTag)));

/** Étiquettes gardées par une rune de la bindrune : r.t liste les étiquettes gardées (absent : toutes). Ancien format : indices de sens. */
export function keptTags(r) {
  const flat = runeTags(r.n);
  if (!Array.isArray(r.t)) return flat;
  const want = new Set();
  r.t.forEach((x) => {
    if (typeof x === "string") want.add(normTag(x));
    else if (Number.isInteger(x) && RUNE_TAGS[r.n] && RUNE_TAGS[r.n][x]) RUNE_TAGS[r.n][x].forEach((t) => want.add(normTag(t)));
  });
  return flat.filter((t) => want.has(t));
}

/** Étiquettes des runes d'une bindrune validée. */
export function deriveTags(d) {
  const out = [];
  d.r.forEach((r) => keptTags(r).forEach((t) => { if (!out.includes(t)) out.push(t); }));
  return out;
}

/** Toutes les étiquettes à enregistrer : celles des runes, puis les étiquettes ajoutées (nettoyées). */
export function allTags(d, extra) {
  const base = deriveTags(d);
  return base.concat(cleanTags(extra).filter((t) => !base.includes(t)));
}
