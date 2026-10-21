/* Comparaison de deux bindrunes (données validées { r, s, t, l }) : liste de différences lisibles. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BindDiff = factory();
})(typeof self !== "undefined" ? self : globalThis, function () {
  const FLIPS = ["", "retournée haut ↔ bas", "retournée gauche ↔ droite", "retournée dans les deux sens"];
  const pct = (k) => Math.round((k || 1) * 100) + " %";
  const keptKey = (e) => JSON.stringify(e.t || null);

  /**
   * Retourne { same, lines }. Les runes de même nom sont appariées dans l'ordre. Déplacements : écart d'au moins 2 unités de la plaque.
   * a = état de départ (« avant »), b = état d'arrivée (« maintenant »).
   */
  function diff(a, b, supportLabel) {
    const lines = [], label = supportLabel || ((s) => s);
    const group = (d) => { const m = {}; d.r.forEach((e) => { (m[e.n] = m[e.n] || []).push(e); }); return m; };
    const ga = group(a), gb = group(b), names = Array.from(new Set(Object.keys(ga).concat(Object.keys(gb))));
    names.forEach((n) => {
      const A = ga[n] || [], B = gb[n] || [], common = Math.min(A.length, B.length);
      for (let i = A.length; i > common; i--) lines.push("« " + n + " » retirée");
      for (let i = B.length; i > common; i--) lines.push("« " + n + " » ajoutée");
      for (let i = 0; i < common; i++) {
        const x = A[i], y = B[i], what = [];
        const dx = Math.round(y.x - x.x), dy = Math.round(y.y - x.y);
        if (Math.abs(dx) >= 2 || Math.abs(dy) >= 2) what.push("déplacée de " + dx + " ; " + dy);
        if ((x.f || 0) !== (y.f || 0)) what.push(y.f ? FLIPS[y.f] : "miroir retiré");
        if ((x.k || 1) !== (y.k || 1)) what.push("taille " + pct(x.k) + " → " + pct(y.k));
        if (keptKey(x) !== keptKey(y)) what.push("étiquettes gardées modifiées");
        if (x.c !== y.c) what.push("couleur modifiée");
        if (what.length) lines.push("« " + n + " » : " + what.join(", "));
      }
    });
    if (a.s !== b.s) lines.push("Support : " + label(a.s) + " → " + label(b.s));
    if ((a.t || 0) !== (b.t || 0)) lines.push(b.t ? "Strates colorées activées" : "Strates colorées désactivées");
    if ((a.l || []).length !== (b.l || []).length) lines.push("Liaisons : " + (a.l || []).length + " → " + (b.l || []).length);
    return { same: !lines.length, lines };
  }
  return { diff };
});
