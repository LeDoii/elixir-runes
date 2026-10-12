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


  /* ------------------------------------------------------------------ topologie : nombre de formes et de boucles
   * Un dessin est ramené à une grille normalisée (indépendante de la taille), épaissi comme un trait gravé.
   *  - formes : blocs d'encre séparés (deux tracés qui se rejoignent ne font qu'une forme) ;
   *  - boucles : espaces fermés entièrement entourés d'encre (le rond du R, les deux ventres du B...).
   * Le dessin et chaque rune passent par le même traitement, donc les écarts de tremblement s'annulent en grande partie.
   */
  const GRID = 96, MARGIN = 10, RADIUS = 2.6, MIN_HOLE = 8;

  function topology(strokes) {
    const pts = toPoints(strokes);
    if (pts.length < 2) return { shapes: 0, loops: 0 };
    const b = bbox(pts), k = (GRID - 2 * MARGIN) / Math.max(b.w, b.h, 1);
    const ink = new Uint8Array(GRID * GRID);
    const ox = GRID / 2 - (b.x0 + b.w / 2) * k, oy = GRID / 2 - (b.y0 + b.h / 2) * k, r2 = RADIUS * RADIUS;
    const stamp = (x, y) => {
      for (let j = Math.floor(y - RADIUS); j <= Math.ceil(y + RADIUS); j++)
        for (let i = Math.floor(x - RADIUS); i <= Math.ceil(x + RADIUS); i++)
          if (i >= 0 && j >= 0 && i < GRID && j < GRID && (i - x) * (i - x) + (j - y) * (j - y) <= r2) ink[j * GRID + i] = 1;
    };
    strokes.forEach((s) => {
      if (s.length < 2) return;
      samplePolyline(s.map(([x, y]) => [x * k + ox, y * k + oy]), 0.6).forEach(([x, y]) => stamp(x, y));
    });
    const flood = (value, eight) => {                               // composantes connexes de la valeur donnée
      const seen = new Uint8Array(GRID * GRID), comps = [];
      for (let start = 0; start < ink.length; start++) {
        if (seen[start] || ink[start] !== value) continue;
        const stack = [start]; seen[start] = 1;
        let area = 0, border = false;
        while (stack.length) {
          const c = stack.pop(), x = c % GRID, y = (c / GRID) | 0;
          area++;
          if (x === 0 || y === 0 || x === GRID - 1 || y === GRID - 1) border = true;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if ((!dx && !dy) || (!eight && dx && dy)) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
            const n = ny * GRID + nx;
            if (!seen[n] && ink[n] === value) { seen[n] = 1; stack.push(n); }
          }
        }
        comps.push({ area, border });
      }
      return comps;
    };
    return {
      shapes: flood(1, true).length,
      loops: flood(0, false).filter((c) => !c.border && c.area >= MIN_HOLE).length,
    };
  }

  const runeTopo = new WeakMap();
  function runeTopology(rune) {
    if (!runeTopo.has(rune)) runeTopo.set(rune, topology(rune.strokes.map((s) => s.pts)));
    return runeTopo.get(rune);
  }

  /**
   * Classe toutes les runes selon leur ressemblance avec le tracé (meilleure d'abord).
   * La ressemblance géométrique est corrigée par la topologie : une forme ou une boucle de trop ou de moins
   * (opts.shapePenalty, opts.loopPenalty : facteurs multiplicatifs, 1 = ignoré).
   */
  function recognize(runes, map, strokes, opts) {
    opts = opts || {};
    const sp = opts.shapePenalty === undefined ? 0.8 : opts.shapePenalty;
    const lp = opts.loopPenalty === undefined ? 0.85 : opts.loopPenalty;
    const user = topology(strokes);
    const out = [];
    runes.forEach((r) => {
      const res = score(r, map, strokes, opts);
      if (!res) return;
      const t = runeTopology(r);
      const f = (t.shapes === user.shapes ? 1 : sp) * (t.loops === user.loops ? 1 : lp);
      out.push({ name: r.name, total: res.total * f, geometry: res.total, coverage: res.coverage, precision: res.precision, fit: res.fit,
        shapes: t.shapes, loops: t.loops, userShapes: user.shapes, userLoops: user.loops });
    });
    return out.sort((a, b) => b.total - a.total);
  }

  return { score, recognize, topology, runeTopology, samplePolyline, fitParams, bbox, toPoints };
});
