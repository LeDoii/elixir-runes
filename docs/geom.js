/* Géométrie des runes posées : miroirs et points d'ancrage.
 *
 * Une rune posée = { n, x, y, f?, k? } : nom, position (décalage du repère de la rune), miroir f (bit 1 : haut ↔ bas, bit 2 : gauche ↔ droite)
 * et échelle k (1 = taille d'origine ; chaque rune a la sienne, autour du centre de sa case).
 * Le miroir se fait autour du centre de la grille d'une rune (D.bbox) : la rune reste dans sa case, les points d'ancrage retombent sur la grille.
 * Les points d'ancrage gardent le même ordre avec ou sans miroir : les liaisons enregistrées restent valables.
 * Dépend de data.js (window.RUNES).
 *
 * Miroirs inutiles : certaines runes ne changent pas de forme selon un miroir (Isa, Gebo, Dagaz, Ingwaz : aucun ; Thurisaz, Kenaz, Perthro,
 * Berkano : haut ↔ bas ; Algiz, Tiwaz, Ehwaz, Mannaz, Othala : gauche ↔ droite ; Hagalaz, Jera, Eihwaz, Sowilo : les deux ensemble).
 * Le drapeau f d'une rune ne retient que les miroirs utiles (canonF). Voir NOTES_BINDRUNES.md. */
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

  /* ---------------------------------------------------------------- miroirs inutiles */
  const segKey = (a, b) => { const ka = a[0] + "," + a[1], kb = b[0] + "," + b[1]; return ka < kb ? ka + ">" + kb : kb + ">" + ka; };
  const shapeCache = {};
  /** Forme d'une rune (ensemble de segments, indépendant de l'ordre et du sens des traits) avec le miroir f. */
  function shapeKey(name, f) {
    const k = name + "|" + f;
    return shapeCache[k] || (shapeCache[k] = strokes(name, f).flatMap((s) => s.pts.slice(1).map((p, i) => segKey(s.pts[i], p))).sort().join("|"));
  }
  /** Le miroir f change-t-il la forme de la rune ? (f : 1 haut ↔ bas, 2 gauche ↔ droite, 3 les deux) */
  const changes = (name, f) => shapeKey(name, f) !== shapeKey(name, 0);
  /** Drapeau équivalent le plus simple : deux drapeaux qui donnent la même forme n'en font qu'un (Isa, Gebo, Dagaz, Ingwaz : toujours 0). */
  function canonF(name, f) {
    f = f & 3;
    const key = shapeKey(name, f);
    for (let g = 0; g < 4; g++) if (shapeKey(name, g) === key) return g;
    return f;
  }

  /* ---------------------------------------------------------------- piques de jonction */
  const distSeg = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); };
  const spikeCache = {};
  /**
   * Sommets « en T » à l'origine d'une pique : un sommet intérieur d'un trait posé au milieu d'un autre trait (pas à son extrémité), dont la
   * pointe du joint mitré dépasse de ce trait sur le côté (Berkano : la double panse repose sur la tige et pointe à gauche).
   * Retourne [{ si, v }] (indices du trait et du sommet) ; les miroirs et les échelles gardent les mêmes indices.
   */
  function spikes(name) {
    if (spikeCache[name]) return spikeCache[name];
    const W = root.RUNES.strokeWidth, H = W / 2, st = byName(name).strokes, out = [];
    const segs = st.flatMap((s, si) => s.pts.slice(1).map((p, i) => ({ a: s.pts[i], b: p, si })));
    st.forEach((s, si) => {
      for (let v = 1; v < s.pts.length - 1; v++) {
        const P = s.pts[v], A = s.pts[v - 1], B = s.pts[v + 1];
        const host = segs.find((g) => g.si !== si && distSeg(P, g.a, g.b) <= 1.5 && Math.hypot(P[0] - g.a[0], P[1] - g.a[1]) > H + 1 && Math.hypot(P[0] - g.b[0], P[1] - g.b[1]) > H + 1);
        if (!host) continue;                                   // pas posé au milieu d'un autre trait : un vrai coin de la rune
        const u1 = [A[0] - P[0], A[1] - P[1]], u2 = [B[0] - P[0], B[1] - P[1]], l1 = Math.hypot(u1[0], u1[1]), l2 = Math.hypot(u2[0], u2[1]);
        u1[0] /= l1; u1[1] /= l1; u2[0] /= l2; u2[1] /= l2;
        const th = Math.acos(Math.max(-1, Math.min(1, u1[0] * u2[0] + u1[1] * u2[1]))), ml = 1 / Math.sin(th / 2), bx = u1[0] + u2[0], by = u1[1] + u2[1], bl = Math.hypot(bx, by);
        if (bl < 1e-9) continue;
        const td = ml <= 3 ? H * ml : H, tip = [P[0] - (bx / bl) * td, P[1] - (by / bl) * td];
        if (distSeg(tip, host.a, host.b) > H + 0.6) out.push({ si, v });
      }
    });
    return (spikeCache[name] = out);
  }
  /** Coupe un trait aux sommets en T : chaque morceau se termine à plat sur le trait porteur, sans pointe sur le côté. */
  function splitStroke(name, si, pts) {
    const cuts = spikes(name).filter((x) => x.si === si).map((x) => x.v);
    if (!cuts.length) return [pts];
    const parts = [];
    let from = 0;
    cuts.forEach((v) => { parts.push(pts.slice(from, v + 1)); from = v; });
    parts.push(pts.slice(from));
    return parts;
  }
  /** Traits à dessiner (nom, points) d'une rune posée : comme placed, mais sans les piques de jonction. Les mesures (emprise, contacts) restent sur placed. */
  const drawn = (e) => {
    const name = e.n || e.name, base = byName(name).strokes, out = [];
    strokes(name, e.f, e.k).forEach((s, si) => splitStroke(name, si, s.pts).forEach((pts) => out.push({ name: base[si].name, pts: pts.map((p) => [p[0] + e.x, p[1] + e.y]) })));
    return out;
  };

  /* ---------------------------------------------------------------- liaisons : joints aux points d'ancrage, ancrage posé sur une ligne */
  /** Segments d'une rune posée, dans le repère de la plaque, avec leur numéro (continu d'un trait au suivant). */
  function segments(e) {
    const out = [];
    placed(e).forEach((s) => s.pts.slice(1).forEach((p, i) => out.push({ a: s.pts[i], b: p, idx: out.length })));
    return out;
  }
  /** Directions (angle, longueur disponible) des traits de la rune qui partent du point P : une extrémité en donne une, un sommet deux, un trait qui traverse P deux (opposées). */
  function raysAt(e, P) {
    const out = [];
    segments(e).forEach((g) => {
      const dx = g.b[0] - g.a[0], dy = g.b[1] - g.a[1], len = Math.hypot(dx, dy), ux = dx / len, uy = dy / len;
      if (Math.hypot(g.a[0] - P[0], g.a[1] - P[1]) < 0.75) out.push({ a: Math.atan2(uy, ux), len });
      else if (Math.hypot(g.b[0] - P[0], g.b[1] - P[1]) < 0.75) out.push({ a: Math.atan2(-uy, -ux), len });
      else {
        const t = (P[0] - g.a[0]) * ux + (P[1] - g.a[1]) * uy, off = Math.abs((P[0] - g.a[0]) * uy - (P[1] - g.a[1]) * ux);
        if (off < 0.75 && t > 0.75 && t < len - 0.75) { out.push({ a: Math.atan2(-uy, -ux), len: t }); out.push({ a: Math.atan2(uy, ux), len: len - t }); }
      }
    });
    return out;
  }
  /**
   * Joints aux points d'ancrage liés. Autour d'un point lié, les traits de toutes les runes qui s'y rejoignent sont classés par direction :
   * l'encoche à combler est un grand écart (plus de 180°) entre deux traits voisins de runes différentes. Le joint est alors un V mitré
   * (deux bras assez longs pour que la pointe soit exacte) qui prolonge le coin comme à l'intérieur d'une rune. Entre des traits qui
   * se recouvrent ou se prolongent (angle d'au plus 180°), rien à ajouter : aucune bosse.
   * pairs : [[runeA, runeB, pointA, pointB]] ; retourne [{ e: runeA, pts }] (e donne la couleur et l'échelle).
   */
  function joins(pairs) {
    const W = root.RUNES.strokeWidth, out = [], at = new Map();
    pairs.forEach(([A, B, pa]) => {
      const pt = anchors(A.n || A.name, A.f, A.k)[pa];
      if (!pt) return;
      const P = [pt[0] + A.x, pt[1] + A.y], key = Math.round(P[0] * 2) + "," + Math.round(P[1] * 2);
      const g = at.get(key) || { P, e: A, runes: [] };
      [A, B].forEach((r) => { if (!g.runes.includes(r)) g.runes.push(r); });
      at.set(key, g);
    });
    at.forEach(({ P, e, runes }) => {
      const rays = [];
      runes.forEach((r) => raysAt(r, P).forEach((x) => rays.push({ a: x.a, len: x.len, r })));
      if (rays.length < 2) return;
      rays.sort((p, q) => p.a - q.a);
      rays.forEach((r1, i) => {
        const r2 = rays[(i + 1) % rays.length], gap = i === rays.length - 1 ? r2.a + 2 * Math.PI - r1.a : r2.a - r1.a;
        if (gap <= Math.PI + 0.02 || r1.r === r2.r) return;
        const half = (2 * Math.PI - gap) / 2;
        if (half < 0.06) return;                               // traits presque superposés : pas de joint
        const need = (W * (e.k || 1)) / 2 / Math.tan(half) + 1, l1 = Math.min(need, r1.len), l2 = Math.min(need, r2.len);
        out.push({ e, pts: [[P[0] + Math.cos(r1.a) * l1, P[1] + Math.sin(r1.a) * l1], P, [P[0] + Math.cos(r2.a) * l2, P[1] + Math.sin(r2.a) * l2]] });
      });
    });
    return out;
  }
  /** Point d'un trait de la rune e le plus proche de P, à moins de tol : { idx (segment), q (point), d } ou null. */
  function onLine(P, e, tol) {
    let best = null;
    segments(e).forEach((g) => {
      const dx = g.b[0] - g.a[0], dy = g.b[1] - g.a[1], t = Math.max(0, Math.min(1, ((P[0] - g.a[0]) * dx + (P[1] - g.a[1]) * dy) / (dx * dx + dy * dy)));
      const q = [g.a[0] + t * dx, g.a[1] + t * dy], d = Math.hypot(P[0] - q[0], P[1] - q[1]);
      if (d <= tol && (!best || d < best.d)) best = { idx: g.idx, q, d };
    });
    return best;
  }
  /**
   * Aimantation d'un point d'ancrage sur une ligne : le décalage (dx, dy) qui amène un point d'ancrage des runes déplacées sur un trait d'une
   * autre rune, ou un point d'ancrage d'une autre rune sur un trait des runes déplacées, si l'écart est inférieur à radius. { dx, dy, at } ou null.
   */
  function anchorLineSnap(moving, others, radius) {
    let best = null;
    const take = (d, dx, dy, at) => { if (!best || d < best.d) best = { d, dx, dy, at }; };
    const pts = (e) => anchors(e.n || e.name, e.f, e.k).map((p) => [p[0] + e.x, p[1] + e.y]);
    moving.forEach((m) => pts(m).forEach((a) => others.forEach((o) => { const h = onLine(a, o, radius); if (h) take(h.d, h.q[0] - a[0], h.q[1] - a[1], h.q); })));
    others.forEach((o) => pts(o).forEach((b) => moving.forEach((m) => { const h = onLine(b, m, radius); if (h) take(h.d, b[0] - h.q[0], b[1] - h.q[1], b); })));
    return best;
  }

  /**
   * Miroir de toute une composition autour du centre de son emprise (cx, cy en coordonnées de la plaque) :
   * chaque rune est retournée et sa position est reportée de l'autre côté. Appliquer deux fois le même miroir redonne la composition d'origine.
   * entries : objets { x, y, f } modifiés sur place. axis : "v" (haut ↔ bas) ou "h" (gauche ↔ droite).
   */
  function mirror(entries, axis, cx, cy) {
    const [bx, by] = center();
    entries.forEach((e) => {
      const name = e.n || e.name;                              // la position se retourne toujours ; le drapeau seulement si la forme change
      if (axis === "v") { e.y = 2 * cy - e.y - 2 * by; e.f = canonF(name, (e.f || 0) ^ FLIP_V); }
      else { e.x = 2 * cx - e.x - 2 * bx; e.f = canonF(name, (e.f || 0) ^ FLIP_H); }
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
  return { FLIP_V, FLIP_H, KMIN, KMAX, changes, canonF, spikes, drawn, segments, joins, onLine, anchorLineSnap, flipPts, scalePts, strokes, anchors, placed, mirror, scaleAbout, center };
});
