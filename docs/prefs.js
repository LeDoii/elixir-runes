/* Préférences de l'atelier : valeurs bornées, unités des règles. Rien n'est envoyé : tout reste dans le navigateur. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Prefs = factory();
})(typeof self !== "undefined" ? self : globalThis, function () {
  const KEY = "runes-prefs";
  const DEFAULTS = { snap: 14, align: 5, units: "plate", askNew: true, confirmClose: true, history: 100 };
  const clamp = (v, lo, hi, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : def; };

  /** Toute valeur venue du stockage est revalidée : bornes, types, valeurs d'origine en cas de doute. */
  function sanitize(raw) {
    const r = raw && typeof raw === "object" ? raw : {};
    return {
      snap: clamp(r.snap, 4, 40, DEFAULTS.snap),                       // portée du magnétisme (unités de la plaque)
      align: clamp(r.align, 2, 12, DEFAULTS.align),                    // portée des repères d'alignement (pixels de l'écran)
      units: ["plate", "percent", "cells"].includes(r.units) ? r.units : DEFAULTS.units,
      askNew: r.askNew !== false,                                      // « Nouvelle bindrune » demande ses options
      confirmClose: r.confirmClose !== false,                          // prévenir à la fermeture avec un travail non enregistré
      history: clamp(r.history, 10, 300, DEFAULTS.history),            // actions gardées par l'historique
    };
  }
  function load(storage) { try { return sanitize(JSON.parse(storage.getItem(KEY) || "{}")); } catch (e) { return sanitize({}); } }
  function save(storage, prefs) { try { storage.setItem(KEY, JSON.stringify(sanitize(prefs))); } catch (e) { /* stockage indisponible */ } }

  /**
   * Unité d'une règle : k = unités par unité de plaque ; steps = graduations possibles (en unités) ; fmt = étiquette.
   * axis : "x" (plaque de 800) ou "y" (plaque de 640) ; cases de la grille des runes : 24 en largeur, 16,5 en hauteur.
   */
  function rulerUnit(units, axis) {
    const size = axis === "x" ? 800 : 640, cell = axis === "x" ? 24 : 16.5;
    if (units === "percent") return { k: 100 / size, steps: [1, 2, 5, 10, 20, 50], fmt: (n) => String(n) + " %" };
    if (units === "cells") return { k: 1 / cell, steps: [0.5, 1, 2, 5, 10, 20, 50], fmt: (n) => String(n) };
    return { k: 1, steps: [1, 2, 5, 10, 20, 50, 100, 200, 500], fmt: (n) => String(n) };
  }
  return { KEY, DEFAULTS, sanitize, load, save, rulerUnit };
});
