/* Étiquettes des bindrunes.
 *
 * - Liste imposée (VOCAB) : thèmes tirés des sens du Chapitre 7. Elle sert aussi de filtre dans la galerie.
 * - Étiquettes libres : 2 à 20 caractères, au plus MAX_TAGS étiquettes (imposées et libres confondues) par bindrune.
 * - Étiquettes verrouillées (RUNE_TAGS) : propres à chaque rune, non modifiables. Elles ne sont jamais enregistrées :
 *   une bindrune porte celles de toutes ses runes. Le choix des mots est une lecture des sens du livre (à valider).
 *
 * Les étiquettes enregistrées sont normalisées : minuscules, sans signe de ponctuation autre que - et '.
 * À garder identique à server/lib/tags.js (test de parité : tools/test_tags.mjs). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Tags = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const MAX_TAGS = 6, MIN_LEN = 2, MAX_LEN = 20;

  const VOCAB = ["Abondance", "Communication", "Connaissance", "Courage", "Croissance", "Cycles", "Défense", "Destin", "Eau", "Échange", "Épreuve",
    "Éveil", "Fertilité", "Force", "Guérison", "Harmonie", "Héritage", "Humanité", "Immobilité", "Intuition", "Joie", "Justice",
    "Lumière", "Mystère", "Paix", "Partenariat", "Patience", "Protection", "Renaissance", "Sagesse", "Transformation", "Victoire",
    "Vitalité", "Voyage"];

  const RUNE_TAGS = {
    Fehu: ["Abondance"], Uruz: ["Force", "Vitalité"], Thurisaz: ["Force", "Défense"], Ansuz: ["Communication", "Sagesse"],
    Raidho: ["Voyage", "Cycles"], Kenaz: ["Connaissance", "Lumière"], Gebo: ["Échange", "Partenariat"], Wunjo: ["Joie", "Harmonie"],
    Hagalaz: ["Transformation"], Nauthiz: ["Épreuve"], Isa: ["Immobilité", "Patience"], Jera: ["Cycles"],
    Eihwaz: ["Renaissance", "Transformation"], Perthro: ["Mystère", "Destin"], Algiz: ["Protection", "Défense"], Sowilo: ["Lumière", "Victoire"],
    Tiwaz: ["Justice", "Courage"], Berkano: ["Croissance", "Guérison"], Ehwaz: ["Partenariat", "Harmonie"], Mannaz: ["Humanité"],
    Laguz: ["Intuition", "Eau"], Ingwaz: ["Fertilité", "Paix"], Dagaz: ["Éveil", "Renaissance"], Othala: ["Héritage"],
  };

  /** « Épreuve  ! » → « épreuve » ; "" si l'étiquette est trop courte. */
  function norm(s) {
    const t = String(s == null ? "" : s).normalize("NFC").toLowerCase()
      .replace(/[^\p{L}\p{N}' -]+/gu, " ").replace(/\s+/g, " ").trim().replace(/^[-' ]+|[-' ]+$/g, "").slice(0, MAX_LEN).trim();
    return t.length >= MIN_LEN ? t : "";
  }
  /** Liste d'étiquettes quelconque → liste normalisée, sans doublon, de MAX_TAGS au plus. */
  function clean(list) {
    const out = [];
    (Array.isArray(list) ? list : []).forEach((x) => { const t = norm(x); if (t && !out.includes(t) && out.length < MAX_TAGS) out.push(t); });
    return out;
  }
  const label = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : "");
  const IMPOSED = new Set(VOCAB.map(norm));
  const isImposed = (t) => IMPOSED.has(t);
  /** Étiquettes verrouillées d'un ensemble de runes (noms), dans l'ordre des runes, sans doublon. */
  function locked(names) {
    const out = [];
    (names || []).forEach((n) => (RUNE_TAGS[n] || []).forEach((t) => { const k = norm(t); if (!out.includes(k)) out.push(k); }));
    return out;
  }

  /* ---------------------------------------------------------------- interface (navigateur seulement) */
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  /** Pastille d'étiquette. kind : « locked » (verrouillée), « imposed » (liste imposée) ou « free » (libre). */
  function chip(t, kind) {
    const c = el("span", "tag " + kind, label(t));
    if (kind === "locked") c.title = "Étiquette d'une rune de la bindrune : non modifiable.";
    return c;
  }
  /** Rangée d'étiquettes en lecture seule. onPick(t) rend chaque pastille cliquable (filtre de la galerie). */
  function chips(lockedList, tagList, onPick) {
    const row = el("div", "tags");
    lockedList.map((t) => [t, "locked"]).concat(tagList.filter((t) => !lockedList.includes(t)).map((t) => [t, isImposed(t) ? "imposed" : "free"])).forEach(([t, kind]) => {
      if (!onPick) { row.appendChild(chip(t, kind)); return; }
      const b = el("button", "tag " + kind, label(t));
      b.type = "button"; b.title = "Voir les bindrunes portant « " + label(t) + " »";
      b.addEventListener("click", () => onPick(t));
      row.appendChild(b);
    });
    return row;
  }

  /**
   * Éditeur d'étiquettes. opts : { locked: () => [], get: () => [], set: (liste) => void, collapsible }.
   * Retourne { el, refresh }. Les étiquettes verrouillées s'affichent sans croix.
   */
  function editor(opts) {
    const box = el("div", "tagbox");
    let open = !opts.collapsible, msg = "", shown = "";
    const lockedNow = () => opts.locked();
    function add(raw) {
      const t = norm(raw);
      if (!t) { msg = "Étiquette trop courte (2 caractères au moins)."; return draw(true); }
      const cur = opts.get();
      if (lockedNow().includes(t)) msg = "« " + label(t) + " » vient déjà d'une rune de la bindrune.";
      else if (cur.includes(t)) msg = "« " + label(t) + " » est déjà là.";
      else if (cur.length >= MAX_TAGS) msg = MAX_TAGS + " étiquettes au plus : retire-en une d'abord.";
      else { opts.set(cur.concat(t)); msg = ""; }
      draw(true);
    }
    function draw(force) {
      const sig = JSON.stringify([lockedNow(), opts.get(), open, msg]);
      if (!force && sig === shown) return;
      shown = sig;
      box.innerHTML = "";
      const row = el("div", "tags"), cur = opts.get();
      lockedNow().forEach((t) => row.appendChild(chip(t, "locked")));
      cur.forEach((t) => {
        const c = chip(t, isImposed(t) ? "imposed" : "free");
        if (open) {
          const x = el("button", "tagx", "✕");
          x.type = "button"; x.setAttribute("aria-label", "Retirer l'étiquette " + label(t));
          x.addEventListener("click", () => { opts.set(opts.get().filter((u) => u !== t)); msg = ""; draw(true); });
          c.appendChild(x);
        }
        row.appendChild(c);
      });
      if (!row.children.length) row.appendChild(el("span", "hint", "Aucune étiquette."));
      box.appendChild(row);
      if (opts.collapsible) {
        const tg = el("button", "link", open ? "Terminer" : "Modifier les étiquettes");
        tg.type = "button"; tg.addEventListener("click", () => { open = !open; msg = ""; draw(true); });
        box.appendChild(tg);
      }
      if (open) {
        const ctl = el("div", "tagctl"), sel = el("select"), inp = el("input"), btn = el("button", "btn ghost", "Ajouter");
        const o0 = el("option", "", "Choisir dans la liste…"); o0.value = ""; sel.appendChild(o0);
        VOCAB.filter((v) => !lockedNow().includes(norm(v)) && !cur.includes(norm(v))).forEach((v) => { const o = el("option", "", v); o.value = v; sel.appendChild(o); });
        sel.setAttribute("aria-label", "Étiquette de la liste");
        sel.addEventListener("change", () => { if (sel.value) add(sel.value); });
        inp.type = "text"; inp.maxLength = MAX_LEN; inp.placeholder = "Étiquette libre"; inp.setAttribute("aria-label", "Étiquette libre"); inp.autocomplete = "off";
        inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); add(inp.value); } });
        btn.type = "button"; btn.addEventListener("click", () => add(inp.value));
        ctl.appendChild(sel); ctl.appendChild(inp); ctl.appendChild(btn);
        box.appendChild(ctl);
        if (msg) box.appendChild(el("p", "hint", msg));
      }
    }
    draw(true);
    return { el: box, refresh: () => draw(false) };
  }

  return { MAX_TAGS, MAX_LEN, VOCAB, RUNE_TAGS, norm, clean, label, isImposed, locked, chip, chips, editor };
});
