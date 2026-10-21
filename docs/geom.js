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
  /**
   * Comble les encoches autour d'un point où des traits se rejoignent. rays : [{ a (angle), len (longueur disponible), id }] : traits qui partent de P ;
   * deux traits qui ont le même id sont déjà reliés par un joint (sommet d'un même trait, trait qui traverse P). L'encoche est un grand écart
   * (plus de 180°) entre deux traits voisins d'id différents : on y pose un V à joint mitré dont les bras sont assez longs pour que le coin soit
   * exact (au-delà de la limite de mitre du peintre, le joint devient un biseau, qui ferme aussi l'encoche).
   */
  /** Encoches autour de P : [{ r1, r2, gap, half }] (écart de plus de 180° entre deux traits voisins d'id différents, demi-angle du coin). */
  function notches(rays) {
    const out = [];
    if (rays.length < 2) return out;
    rays = rays.slice().sort((p, q) => p.a - q.a);
    rays.forEach((r1, i) => {
      const r2 = rays[(i + 1) % rays.length], gap = i === rays.length - 1 ? r2.a + 2 * Math.PI - r1.a : r2.a - r1.a;
      if (gap <= Math.PI + 0.02 || r1.id === r2.id) return;
      const half = (2 * Math.PI - gap) / 2;
      if (half >= 0.06) out.push({ r1, r2, gap, half });      // traits presque superposés : pas de joint
    });
    return out;
  }
  function notchFills(P, rays, width) {
    return notches(rays).map(({ r1, r2, half }) => {
      const need = width / 2 / Math.tan(half) + 1, l1 = Math.min(need, r1.len), l2 = Math.min(need, r2.len);
      return [[P[0] + Math.cos(r1.a) * l1, P[1] + Math.sin(r1.a) * l1], P, [P[0] + Math.cos(r2.a) * l2, P[1] + Math.sin(r2.a) * l2]];
    });
  }
  const clipHalf = (poly, inside, cross) => {
    const out = [];
    poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length], ip = inside(p), iq = inside(q); if (ip) out.push(p); if (ip !== iq) out.push(cross(p, q)); });
    return out;
  };
  /** Polygone coupé par le carré [x0, x1] × [y0, y1] (Sutherland-Hodgman). */
  function clipBox(poly, x0, y0, x1, y1) {
    const vx = (x) => (p, q) => [x, p[1] + ((x - p[0]) / (q[0] - p[0])) * (q[1] - p[1])], vy = (y) => (p, q) => [p[0] + ((y - p[1]) / (q[1] - p[1])) * (q[0] - p[0]), y];
    poly = clipHalf(poly, (p) => p[0] >= x0 - 1e-9, vx(x0));
    poly = poly.length ? clipHalf(poly, (p) => p[0] <= x1 + 1e-9, vx(x1)) : poly;
    poly = poly.length ? clipHalf(poly, (p) => p[1] >= y0 - 1e-9, vy(y0)) : poly;
    return poly.length ? clipHalf(poly, (p) => p[1] <= y1 + 1e-9, vy(y1)) : poly;
  }
  /**
   * Remplissage harmonisé des encoches d'un point lié : le coin complet (le losange formé par les bords extérieurs des deux traits, qui se
   * rejoignent à la pointe de la mitre) est coupé par le carré de la demi-épaisseur du trait autour du point. Tous les sommets liés
   * s'arrêtent donc à la même hauteur et à la même largeur (l'emprise de la rune), quel que soit l'angle. Polygones marqués `filled`.
   */
  let joinStyle = "square";                                   // « square » : coin coupé au carré du trait ; « bevel » : biseau (le plus court des deux traits)
  const setJoinStyle = (s) => { joinStyle = s === "bevel" ? "bevel" : "square"; };
  function notchPolys(P, rays, width) {
    const h = width / 2;
    return notches(rays).map(({ r1, r2, gap, half }) => {
      const dir = (a, d) => [P[0] + Math.cos(a) * d, P[1] + Math.sin(a) * d], bis = r1.a + gap / 2;
      if (joinStyle === "bevel") { const tri = [P, dir(r1.a + Math.PI / 2, h), dir(r2.a - Math.PI / 2, h)]; tri.filled = true; return tri; }
      const poly = clipBox([P, dir(r1.a + Math.PI / 2, h), dir(bis, h / Math.sin(half)), dir(r2.a - Math.PI / 2, h)], P[0] - h, P[1] - h, P[0] + h, P[1] + h);
      if (poly.length < 3) return null;
      poly.filled = true;
      return poly;
    }).filter(Boolean);
  }
  /** Rayons des traits (listes de points) qui partent de P : extrémités, sommets (deux rayons de même id) et traits qui traversent P. */
  function polyRays(parts, P) {
    const rays = [], near = (q) => Math.hypot(q[0] - P[0], q[1] - P[1]) < 0.75, ray = (from, to, id) => ({ a: Math.atan2(to[1] - from[1], to[0] - from[0]), len: Math.hypot(to[0] - from[0], to[1] - from[1]), id });
    parts.forEach((p, si) => {
      p.forEach((q, i) => { if (near(q)) { if (i > 0) rays.push(ray(q, p[i - 1], si + ":" + i)); if (i < p.length - 1) rays.push(ray(q, p[i + 1], si + ":" + i)); } });
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[i], b = p[i + 1];
        if (near(a) || near(b)) continue;
        const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy), t = ((P[0] - a[0]) * dx + (P[1] - a[1]) * dy) / len;
        if (t > 0.75 && t < len - 0.75 && Math.abs((P[0] - a[0]) * dy - (P[1] - a[1]) * dx) / len < 0.75) {
          rays.push({ a: Math.atan2(-dy, -dx), len: t, id: si + ":m" + i }, { a: Math.atan2(dy, dx), len: len - t, id: si + ":m" + i });
        }
      }
    });
    return rays;
  }
  const cornerCache = {};
  /** Joints de fermeture propres à la rune : là où des traits distincts se rejoignent en laissant une encoche (Uruz, Ansuz, Dagaz…), et la couture d'un trait fermé (Ingwaz). Repère de la rune. */
  function corners(name, f, k) {
    const key = name + "|" + (f || 0) + "|" + (k || 1);
    if (cornerCache[key]) return cornerCache[key];
    const parts = [], at = new Map();
    strokes(name, f, k).forEach((s, si) => splitStroke(name, si, s.pts).forEach((pts) => parts.push(pts)));
    parts.forEach((p) => p.forEach((q) => at.set(q[0].toFixed(2) + "," + q[1].toFixed(2), q)));
    const out = [];
    at.forEach((P) => notchFills(P, polyRays(parts, P), root.RUNES.strokeWidth * (k || 1)).forEach((pts) => out.push(pts)));
    if (Object.keys(cornerCache).length > 400) for (const x in cornerCache) delete cornerCache[x];
    return (cornerCache[key] = out);
  }
  /** Traits à dessiner (nom, points) d'une rune posée : comme placed, mais sans les piques de jonction ; avec e.o, les coins ouverts d'origine sont fermés par des joints (nom « joint »). Les mesures (emprise, contacts) restent sur placed. */
  const drawn = (e) => {
    const name = e.n || e.name, base = byName(name).strokes, out = [];
    strokes(name, e.f, e.k).forEach((s, si) => splitStroke(name, si, s.pts).forEach((pts) => out.push({ name: base[si].name, pts: pts.map((p) => [p[0] + e.x, p[1] + e.y]) })));
    if (e.o) corners(name, e.f, e.k).forEach((pts) => out.push({ name: "joint", pts: pts.map((p) => [p[0] + e.x, p[1] + e.y]) }));
    return out;
  };

  /* ---------------------------------------------------------------- liaisons : joints aux points d'ancrage, ancrage posé sur une ligne */
  /** Segments d'une rune posée, dans le repère de la plaque, avec leur numéro (continu d'un trait au suivant). */
  function segments(e) {
    const out = [];
    placed(e).forEach((s) => s.pts.slice(1).forEach((p, i) => out.push({ a: s.pts[i], b: p, idx: out.length })));
    return out;
  }
  /** Rayons des traits de la rune posée e qui partent du point P (plaque) ; l'id distingue la rune et le sommet de trait. */
  const raysAt = (e, P, id) => polyRays(placed(e).map((s) => s.pts), P).map((r) => ({ a: r.a, len: r.len, id: id + "|" + r.id }));
  /**
   * Joints aux points d'ancrage liés : autour de chaque point lié, les traits de toutes les runes qui s'y rejoignent sont classés par direction et
   * l'encoche entre deux runes voisines est comblée (voir notchFills) ; entre des traits qui se prolongent ou se recouvrent, rien à ajouter.
   * pairs : [[runeA, runeB, pointA, pointB]] ; pointB null : le point de A est posé sur un trait de B (il est cherché sur la ligne).
   * Retourne [{ e: runeA, pts }] (e donne la couleur et l'échelle).
   */
  function joins(pairs) {
    const out = [], groups = [];
    pairs.forEach(([A, B, pa, pb]) => {
      const ta = anchors(A.n || A.name, A.f, A.k)[pa];
      if (!ta) return;
      const PA = [ta[0] + A.x, ta[1] + A.y];
      let PB;
      if (pb === null || pb === undefined) { const h = onLine(PA, B, 8); if (!h) return; PB = h.q; }
      else { const tb = anchors(B.n || B.name, B.f, B.k)[pb]; if (!tb) return; PB = [tb[0] + B.x, tb[1] + B.y]; }
      let g = groups.find((x) => Math.hypot(x.P[0] - PA[0], x.P[1] - PA[1]) <= 8);
      if (!g) groups.push(g = { P: PA, e: A, ends: [] });
      [[A, PA], [B, PB]].forEach(([r, Q]) => { if (!g.ends.some((x) => x.r === r && Math.hypot(x.Q[0] - Q[0], x.Q[1] - Q[1]) < 1)) g.ends.push({ r, Q }); });
    });
    groups.forEach(({ P, e, ends }) => {
      const runes = [], rays = [];
      ends.forEach(({ r, Q }) => { if (!runes.includes(r)) runes.push(r); raysAt(r, Q, runes.indexOf(r)).forEach((x) => rays.push(x)); });   // id par sommet de trait : les encoches ouvertes d'une rune sont comblées avec celles de la liaison
      notchPolys(P, rays, root.RUNES.strokeWidth * (e.k || 1)).forEach((pts) => out.push({ e, pts }));
    });
    return out;
  }
  /** Les liaisons d'une bindrune (`l`) sous forme de paires pour joins : [[runeA, runeB, pointA, pointB ou null]]. */
  function linkPairs(runes, l) {
    return (l || []).map((k) => (runes[k[0]] && runes[k[1]] ? [runes[k[0]], runes[k[1]], k[2], k.length === 5 ? null : k[3]] : null)).filter(Boolean);
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
  return { FLIP_V, FLIP_H, KMIN, KMAX, changes, canonF, spikes, drawn, segments, joins, setJoinStyle, linkPairs, corners, onLine, anchorLineSnap, flipPts, scalePts, strokes, anchors, placed, mirror, scaleAbout, center };
});
