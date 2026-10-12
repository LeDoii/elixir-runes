/* Complexité d'une bindrune, de 0 à 100. Une évaluation du site, pas une règle du livre : elle sert à comparer des assemblages.
 *
 * Quatre éléments s'additionnent (au plus 30 + 20 + 15 + 10 + 25 = 100) :
 *  - le nombre de runes : 6 points par rune après la première (30 au plus) ;
 *  - la difficulté de tracé des runes : moyenne de leur rang de difficulté, jusqu'à 20 points ;
 *  - le nombre de traits à graver : 1,5 point par trait (15 au plus) ;
 *  - les runes répétées (mode avancé) : 5 points par répétition (10 au plus) ;
 *  - les sens qui s'opposent (étiquettes de runes différentes, voir DISSONANT dans tags.js) : 8 points par opposition (25 au plus).
 * Dépend de tags.js et de difficulty.js. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root);
  else root.Complexity = factory(root);
})(typeof self !== "undefined" ? self : globalThis, function (root) {
  const LEVELS = [[20, "Simple"], [40, "Modérée"], [60, "Élevée"], [80, "Très élevée"], [101, "Extrême"]];

  /** d = { r: [{ n, t }] } → { score, level, parts: [{ label, pts, max, detail }], oppositions } */
  function rate(d) {
    const DIFF = root.DIFFICULTY || {}, Tags = root.Tags, names = d.r.map((e) => e.n), n = names.length;
    const ranks = names.map((x) => (DIFF[x] ? DIFF[x].rank : 12) / 24);
    const strokes = names.reduce((a, x) => a + (DIFF[x] ? DIFF[x].strokes : 2), 0);
    const repeats = n - new Set(names).size;
    const opp = Tags.dissonances(d);
    const parts = [
      { label: "Nombre de runes", pts: Math.min(30, (n - 1) * 6), max: 30, detail: n + (n > 1 ? " runes" : " rune") },
      { label: "Difficulté de tracé", pts: Math.round((ranks.reduce((a, b) => a + b, 0) / n) * 20), max: 20, detail: "rang moyen de difficulté des runes" },
      { label: "Traits à graver", pts: Math.min(15, Math.round(strokes * 1.5)), max: 15, detail: strokes + (strokes > 1 ? " traits" : " trait") },
      { label: "Runes répétées", pts: Math.min(10, repeats * 5), max: 10, detail: repeats ? repeats + (repeats > 1 ? " répétitions" : " répétition") : "aucune" },
      { label: "Sens opposés", pts: Math.min(25, opp.length * 8), max: 25, detail: opp.length ? opp.length + (opp.length > 1 ? " oppositions" : " opposition") : "aucune" },
    ];
    const score = Math.min(100, parts.reduce((a, p) => a + p.pts, 0));
    return { score, level: LEVELS.find(([m]) => score < m)[1], parts, oppositions: opp };
  }
  return { rate };
});
