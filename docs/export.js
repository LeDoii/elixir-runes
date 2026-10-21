/* Sorties vectorielles d'une bindrune : SVG complet et SVG par rune (strates). Dépend de data.js et geom.js.
 * Le dessin est en coordonnées de la plaque ; le cadre (viewBox) est l'emprise de la composition plus une marge, identique pour toutes les strates
 * afin qu'elles se superposent exactement dans un logiciel de retouche. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root);
  else root.Export = factory(root);
})(typeof self !== "undefined" ? self : globalThis, function (root) {
  const MARGIN = 24;
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const num = (v) => Math.round(v * 100) / 100;

  /** Emprise (x0, y0, x1, y1) de toute la composition, épaisseur des traits et marge comprises. */
  function bounds(d) {
    const sw = root.RUNES.strokeWidth;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    d.r.forEach((e) => {
      const pad = (sw * (e.k || 1)) / 2;
      root.Geom.placed(e).forEach((s) => s.pts.forEach((p) => { x0 = Math.min(x0, p[0] - pad); y0 = Math.min(y0, p[1] - pad); x1 = Math.max(x1, p[0] + pad); y1 = Math.max(y1, p[1] + pad); }));
    });
    return [x0 - MARGIN, y0 - MARGIN, x1 + MARGIN, y1 + MARGIN].map(num);
  }
  /** Le groupe SVG d'une rune posée, dans sa couleur. */
  function runeGroup(e, id, joins) {
    const sw = root.RUNES.strokeWidth * (e.k || 1), pts = (a) => a.map((p) => num(p[0]) + "," + num(p[1])).join(" ");
    return '<g id="' + esc(id) + '" fill="none" stroke="' + esc(e.c) + '" stroke-opacity=".88" stroke-width="' + num(sw) + '" stroke-linejoin="miter" stroke-linecap="butt">' +
      root.Geom.drawn(e).map((s) => '<polyline data-trait="' + esc(s.name) + '" points="' + pts(s.pts) + '"/>').join("") +
      (joins || []).map((j) => '<polyline data-trait="joint" points="' + pts(j) + '"/>').join("") + "</g>";
  }
  /** Joints des points d'ancrage liés, rangés par rune (celle du premier point de chaque liaison). */
  function joinsByRune(d) {
    const out = {};
    root.Geom.joins(root.Geom.linkPairs(d.r, d.l)).forEach((j) => { const i = d.r.indexOf(j.e); (out[i] = out[i] || []).push(j.pts); });
    return out;
  }
  const svgOpen = (b) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="' + b.join(" ") + '" width="' + num(b[2] - b[0]) + '" height="' + num(b[3] - b[1]) + '">';
  const idOf = (e, i) => String(i + 1).padStart(2, "0") + "-" + e.n;

  /** SVG de toute la bindrune : un groupe par rune, dans l'ordre d'empilement, fond transparent. */
  function svgOf(d, title) {
    const b = bounds(d);
    const jr = joinsByRune(d);
    return svgOpen(b) + "<title>" + esc(title || "Bindrune") + "</title>" + d.r.map((e, i) => runeGroup(e, idOf(e, i), jr[i])).join("") + "</svg>\n";
  }
  /** Une strate par rune : { name, svg, box, e } avec le même cadre pour toutes. */
  function layers(d, title) {
    const b = bounds(d), jr = joinsByRune(d);
    return d.r.map((e, i) => ({ name: idOf(e, i), box: b, e, svg: svgOpen(b) + "<title>" + esc((title || "Bindrune") + " · " + e.n) + "</title>" + runeGroup(e, idOf(e, i), jr[i]) + "</svg>\n" }));
  }
  return { bounds, svgOf, layers, idOf };
});
