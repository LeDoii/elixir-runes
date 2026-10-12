// Petits outils SQL : motif LIKE sans jokers imprévus, entier borné.
/** « 100% » → « %100\%% » : le texte cherché est littéral (à utiliser avec ESCAPE '\'). */
export const like = (q) => "%" + String(q).replace(/[\\%_]/g, (c) => "\\" + c) + "%";

export const intParam = (v, def, min, max) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
