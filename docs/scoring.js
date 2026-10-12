/* Comparaison d'un tracé libre avec une rune (module pur, testable sous Node).
 *
 * On compare la ligne centrale du tracé à celle du modèle, point par point :
 *  - couverture : part du modèle recouverte par le tracé ;
 *  - précision  : part du tracé qui tombe bien sur le modèle (les traits en trop pénalisent) ;
 *  - score      : produit des deux (0 à 100).
 * Chaque point reçoit une note douce : 1 sous t0 d'écart, 0 au-delà de t1, linéaire entre les deux.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RuneScoring = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const STEP = 3; // px : pas d'échantillonnage

  function samplePolyline(pts, step) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(1, Math.round(len / step));
      for (let k = 0; k < n; k++) out.push([x0 + ((x1 - x0) * k) / n, y0 + ((y1 - y0) * k) / n]);
    }
    if (pts.length) out.push(pts[pts.length - 1].slice());
    return out;
  }

  const toPoints = (strokes) => {
    let out = [];
    strokes.forEach((s) => { if (s.length > 1) out = out.concat(samplePolyline(s, STEP).map(([x, y]) => ({ x, y }))); });
    return out;
  };

  function bbox(points) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of points) {
      x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
    }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  }

  /**
   * Calage : centre et échelle uniforme du tracé vers la boîte du modèle.
   * Une dimension quasi nulle (tige seule : Isa) est ignorée, sinon l'échelle explose.
   */
  function fitParams(refBox, userBox) {
    const big = (b) => Math.max(b.w, b.h, 1);
    const usable = (b, d) => b[d] > 0.12 * big(b);
    const ratios = [];
    ["w", "h"].forEach((d) => { if (usable(refBox, d) && usable(userBox, d)) ratios.push(refBox[d] / userBox[d]); });
    if (!ratios.length) ratios.push(refBox.h / Math.max(userBox.h, 1));
    return {
      k: Math.min.apply(null, ratios),
      ucx: userBox.x0 + userBox.w / 2, ucy: userBox.y0 + userBox.h / 2,
      rcx: refBox.x0 + refBox.w / 2, rcy: refBox.y0 + refBox.h / 2,
    };
  }

  function buildIndex(points, cell) {
    const grid = new Map();
    points.forEach((p, i) => {
      const k = Math.floor(p.x / cell) + "," + Math.floor(p.y / cell);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(i);
    });
    return { grid, cell, points };
  }

  function nearest(index, x, y, maxD) {
    const { grid, cell, points } = index;
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), r = Math.ceil(maxD / cell);
    let best = Infinity;
    for (let i = -r; i <= r; i++) {
      for (let j = -r; j <= r; j++) {
        const list = grid.get(cx + i + "," + (cy + j));
        if (!list) continue;
        for (const idx of list) {
          const d = Math.hypot(points[idx].x - x, points[idx].y - y);
          if (d < best) best = d;
        }
      }
    }
    return best;
  }

  /** Points de référence d'une rune, déjà passés par `map` (point de la grille -> point du canevas). */
  function referencePoints(rune, map) {
    return toPoints(rune.strokes.map((s) => s.pts.map(map)));
  }

  /**
   * @param rune     { strokes: [{ pts }] } en coordonnées de grille
   * @param map      fonction point de grille -> point du canevas
   * @param strokes  tracé : tableau de traits, un trait = tableau de [x, y] (px du canevas)
   * @param opts     { align, t0, t1 } ; align = calage automatique ; t0/t1 = tolérances (px du canevas)
   * @returns null si le tracé est trop court
   */
  function score(rune, map, strokes, opts) {
    opts = opts || {};
    const t0 = opts.t0 || 4, t1 = opts.t1 || 24;
    const soft = (d) => (d <= t0 ? 1 : d >= t1 ? 0 : 1 - (d - t0) / (t1 - t0));
    const ref = referencePoints(rune, map);
    let user = toPoints(strokes);
    if (user.length < 12) return null;

    let aligned = strokes, fit = null;
    if (opts.align) {
      fit = fitParams(bbox(ref), bbox(user));
      aligned = strokes.map((s) => s.map(([x, y]) => [(x - fit.ucx) * fit.k + fit.rcx, (y - fit.ucy) * fit.k + fit.rcy]));
      user = toPoints(aligned);
    }
    const userIdx = buildIndex(user, 40), refIdx = buildIndex(ref, 40);
    const covD = ref.map((p) => nearest(userIdx, p.x, p.y, t1));
    const preD = user.map((p) => nearest(refIdx, p.x, p.y, t1));
    const mean = (a) => a.reduce((s, v) => s + v, 0) / Math.max(a.length, 1);
    const C = mean(covD.map(soft)), P = mean(preD.map(soft));
    return {
      total: 100 * C * P, coverage: 100 * C, precision: 100 * P, aligned, fit,
      missed: ref.filter((p, i) => covD[i] >= t1),
      excess: user.filter((p, i) => preD[i] >= t1),
    };
  }

  /** Classe toutes les runes selon leur ressemblance avec le tracé (meilleure d'abord). */
  function recognize(runes, map, strokes, opts) {
    const out = [];
    runes.forEach((r) => {
      const res = score(r, map, strokes, opts);
      if (res) out.push({ name: r.name, total: res.total, coverage: res.coverage, precision: res.precision, fit: res.fit });
    });
    return out.sort((a, b) => b.total - a.total);
  }

  return { score, recognize, samplePolyline, fitParams, bbox, toPoints };
});
