/* Géométrie des runes posées : miroirs et points d'ancrage.
 *
 * Une rune posée = { n, x, y, f? } : nom, position (décalage du repère de la rune) et miroir f (bit 1 : haut ↔ bas, bit 2 : gauche ↔ droite).
 * Le miroir se fait autour du centre de la grille d'une rune (D.bbox) : la rune reste dans sa case, les points d'ancrage retombent sur la grille.
 * Les points d'ancrage gardent le même ordre avec ou sans miroir : les liaisons enregistrées restent valables.
 * Dépend de data.js (window.RUNES). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root);
  else root.Geom = factory(root);
})(typeof self !== "undefined" ? self : globalThis, function (root) {
  const FLIP_V = 1, FLIP_H = 2;
  const byName = (n) => root.RUNES.runes.find((r) => r.name === n);
  const center = () => { const b = root.RUNES.bbox; return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; };

  /** Points d'une rune dans son repère, avec le miroir f. */
  function flipPts(pts, f) {
    if (!f) return pts;
    const [cx, cy] = center();
    return pts.map((p) => [f & FLIP_H ? 2 * cx - p[0] : p[0], f & FLIP_V ? 2 * cy - p[1] : p[1]]);
  }
  const cache = {};
  /** Traits d'une rune (nom, points) avec le miroir f, dans le repère de la rune. */
  function strokes(name, f) {
    const k = name + "|" + (f || 0);
    return cache[k] || (cache[k] = byName(name).strokes.map((s) => ({ name: s.name, pts: flipPts(s.pts, f) })));
  }
  const anchorCache = {};
  /** Extrémités et angles de chaque trait, sans doublon, dans le repère de la rune ; même ordre quel que soit le miroir. */
  function anchors(name, f) {
    const k = name + "|" + (f || 0);
    if (anchorCache[k]) return anchorCache[k];
    const seen = new Set(), out = [];
    byName(name).strokes.forEach((s) => s.pts.forEach((p) => {
      const key = p[0] + "," + p[1];
      if (!seen.has(key)) { seen.add(key); out.push(p); }
    }));
    return (anchorCache[k] = flipPts(out, f));
  }
  /** Traits d'une rune posée, dans le repère de la plaque. */
  const placed = (e) => strokes(e.n || e.name, e.f).map((s) => ({ name: s.name, pts: s.pts.map((p) => [p[0] + e.x, p[1] + e.y]) }));

  /**
   * Miroir de toute une composition autour du centre de son emprise (cx, cy en coordonnées de la plaque) :
   * chaque rune est retournée et sa position est reportée de l'autre côté. Appliquer deux fois le même miroir redonne la composition d'origine.
   * entries : objets { x, y, f } modifiés sur place. axis : "v" (haut ↔ bas) ou "h" (gauche ↔ droite).
   */
  function mirror(entries, axis, cx, cy) {
    const [bx, by] = center();
    entries.forEach((e) => {
      if (axis === "v") { e.y = 2 * cy - e.y - 2 * by; e.f = (e.f || 0) ^ FLIP_V; }
      else { e.x = 2 * cx - e.x - 2 * bx; e.f = (e.f || 0) ^ FLIP_H; }
    });
  }
  return { FLIP_V, FLIP_H, flipPts, strokes, anchors, placed, mirror, center };
});
