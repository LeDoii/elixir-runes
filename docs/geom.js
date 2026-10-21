/* Géométrie des runes posées : miroirs et points d'ancrage.
 *
 * Une rune posée = { n, x, y, f?, k? } : nom, position (décalage du repère de la rune), miroir f (bit 1 : haut ↔ bas, bit 2 : gauche ↔ droite)
 * et échelle k (1 = taille d'origine ; chaque rune a la sienne, autour du centre de sa case).
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
  const KMIN = 0.25, KMAX = 3;
  /** Points d'une rune dans son repère, à l'échelle k autour du centre de la case. */
  function scalePts(pts, k) {
    if (!k || k === 1) return pts;
    const [cx, cy] = center();
    return pts.map((p) => [cx + (p[0] - cx) * k, cy + (p[1] - cy) * k]);
  }
  const cache = {};
  /** Traits d'une rune (nom, points) avec le miroir f et l'échelle k, dans le repère de la rune. */
  function strokes(name, f, k) {
    const key = name + "|" + (f || 0);
    const base = cache[key] || (cache[key] = byName(name).strokes.map((s) => ({ name: s.name, pts: flipPts(s.pts, f) })));
    return !k || k === 1 ? base : base.map((s) => ({ name: s.name, pts: scalePts(s.pts, k) }));
  }
  const anchorCache = {};
  /** Extrémités et angles de chaque trait, sans doublon, dans le repère de la rune ; même ordre quels que soient le miroir et l'échelle. */
  function anchors(name, f, k) {
    const key = name + "|" + (f || 0);
    if (!anchorCache[key]) {
      const seen = new Set(), out = [];
      byName(name).strokes.forEach((s) => s.pts.forEach((p) => {
        const id = p[0] + "," + p[1];
        if (!seen.has(id)) { seen.add(id); out.push(p); }
      }));
      anchorCache[key] = flipPts(out, f);
    }
    return !k || k === 1 ? anchorCache[key] : scalePts(anchorCache[key], k);
  }
  /** Traits d'une rune posée, dans le repère de la plaque. */
  const placed = (e) => strokes(e.n || e.name, e.f, e.k).map((s) => ({ name: s.name, pts: s.pts.map((p) => [p[0] + e.x, p[1] + e.y]) }));

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
  /**
   * Redimensionne un ensemble de runes d'un facteur, autour d'un point (cx, cy de la plaque) : chaque échelle k est multipliée et les centres
   * des cases s'écartent ou se rapprochent du point dans la même proportion, si bien que des runes liées restent en contact.
   * Le facteur est borné pour que toutes les échelles restent entre KMIN et KMAX ; retourne le facteur réellement appliqué.
   */
  function scaleAbout(entries, factor, cx, cy) {
    if (!entries.length) return 1;
    const ks = entries.map((e) => e.k || 1);
    const f = Math.min(Math.max(factor, KMIN / Math.min(...ks)), KMAX / Math.max(...ks));
    const [bx, by] = center();
    entries.forEach((e) => {
      e.x = cx + (e.x + bx - cx) * f - bx;
      e.y = cy + (e.y + by - cy) * f - by;
      e.k = Math.round((e.k || 1) * f * 1000) / 1000;
    });
    return f;
  }
  return { FLIP_V, FLIP_H, KMIN, KMAX, flipPts, scalePts, strokes, anchors, placed, mirror, scaleAbout, center };
});
