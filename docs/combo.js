/* Empreinte d'une « combinaison » de runes : les mêmes runes, placées de la même façon les unes par rapport aux autres.
 * Deux bindrunes ont la même combinaison si on passe de l'une à l'autre par un simple déplacement d'ensemble.
 * Seul l'agencement compte (pas le nom, la description, les couleurs, l'aimant, les liaisons ni le support).
 *
 * Les positions relatives sont ramenées au réseau des points d'ancrage (demi-colonne = 24 px, demi-ligne = 16,5 px) :
 * un décalage de quelques pixels fait à la main ne change pas la combinaison, un autre point d'ancrage oui.
 * À garder identique à server/lib/combo.js (test de parité : tools/test_combo.mjs). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Combo = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const STEP_X = 24, STEP_Y = 16.5;

  function key(d) {
    const items = d.r.map((e) => ({ n: e.n, x: e.x, y: e.y, f: e.f || 0, k: e.k || 1 }));
    let best = null;
    items.forEach((ref) => {                                   // chaque rune sert tour à tour de repère : plus petite écriture retenue
      const rel = items.map((i) => [i.n, Math.round((i.x - ref.x) / STEP_X), Math.round((i.y - ref.y) / STEP_Y)].concat(i.k !== 1 ? [i.f, i.k] : i.f ? [i.f] : []))
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1] || a[2] - b[2] || (a[3] || 0) - (b[3] || 0) || (a[4] || 0) - (b[4] || 0)));
      const s = JSON.stringify(rel);
      if (best === null || s < best) best = s;
    });
    return best;
  }
  return { key };
});
