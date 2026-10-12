/* Étiquettes des bindrunes.
 *
 * - Étiquettes des runes (RUNE_TAGS) : pour chaque sens du Chapitre 7, dans l'ordre des sens de la rune (data.js), la liste de ses
 *   étiquettes (vide si le sens n'en a pas). Choix de l'utilisateur ; les synonymes sont conservés.
 * - Dans une bindrune, chaque rune garde tout ou partie de ses sens (champ « t » de la rune : indices des sens gardés ; absent = tous).
 *   Les étiquettes gardées ne sont pas modifiables à la main : on les coche ou décoche par rune.
 * - Étiquettes ajoutées : choisies dans la même liste (VOCAB) ou libres (2 à 20 caractères), MAX_TAGS au plus.
 * - FAMILIES / OPPOSED : chaque étiquette est rattachée à une famille de sens ; certaines familles s'opposent (sert à l'évaluation
 *   de la complexité ; à valider).
 *
 * Les étiquettes enregistrées sont normalisées : minuscules, sans ponctuation autre que - et '.
 * À garder identique à server/lib/tags.js (test de parité : tools/test_tags.mjs). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Tags = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const MAX_TAGS = 6, MIN_LEN = 2, MAX_LEN = 20;

  const RUNE_TAGS = {
    Fehu: [["Abondance"], ["Maîtrise"], ["Partage"], ["Cupidité"]],
    Uruz: [["Force vitale", "Endurance"], ["Santé"]],
    Thurisaz: [[], ["Force de défense", "Dissipation"]],
    Ansuz: [["Parole", "Expression"], ["Écoute"], ["Communication", "Sagesse"]],
    Raidho: [["Mouvement", "Rythme"], ["Voyage"], ["Ordre cosmique", "Cycle naturel"]],
    Kenaz: [["Connaissance", "Révélation", "Créativité"], ["Feu", "Lumière"]],
    Gebo: [["Don", "Échange", "Partenariat"], [], ["Équilibre"]],
    Wunjo: [["Joie", "Bonheur", "Harmonie"], ["Réalisation", "Satisfaction", "Partage"]],
    Hagalaz: [["Grêle", "Force destructrice", "Bouleversement"], ["Transformation", "Changement"]],
    Nauthiz: [["Contrainte", "Nécessité"], ["Épreuve", "Limitation", "Croissance"]],
    Isa: [["Glace", "Immobilité", "Gel", "Stagnation"], ["Patience", "Réflexion"]],
    Jera: [["Cycle des saisons", "Récolte"], ["Récompense"], ["Temps"]],
    Eihwaz: [["Renaissance", "Mort"], ["Transformation", "Continuité", "Lien inter-mondes"]],
    Perthro: [["Mystère", "Destin"], ["Hasard", "Secret", "Opportunité"]],
    Algiz: [["Protection"], [], ["Défense"], ["Énergie divine"]],
    Sowilo: [["Énergie solaire", "Victoire", "Clarté"], ["Lumière", "Succès", "Guidance"]],
    Tiwaz: [["Justice", "Courage", "Sacrifice"], ["Honneur", "Leadership"]],
    Berkano: [["Renaissance", "Fertilité"], ["Croissance", "Famille", "Nouveau départ", "Guérison", "Prospérité"]],
    Ehwaz: [["Partenariat", "Confiance mutuelle"], ["Mouvement", "Progrès", "Coopération"]],
    Mannaz: [["Humanité", "Soi"], ["Collaboration", "Conscience de soi", "Relation sociale"]],
    Laguz: [["Eau", "Source de vie", "Inconscient"], ["Intuition", "Émotion", "Flux", "Énergie vitale"]],
    Ingwaz: [["Fertilité", "Paix", "Abondance"], ["Potentiel", "Réalisation", "Plénitude"]],
    Dagaz: [["Jour", "Aube", "Transformation", "Éveil"], ["Nouveau départ", "Prospérité", "Accomplissement"]],
    Othala: [["Héritage", "Possession familiale", "Tradition"], ["Transmission", "Savoir", "Identité culturelle", "Origine"]],
  };
  /** Familles de sens : chaque étiquette est rattachée à la famille la plus proche. */
  const FAMILIES = {
    "Abondance": ["Abondance", "Prospérité", "Récolte", "Potentiel", "Plénitude"],
    "Cupidité": ["Cupidité"],
    "Union": ["Partage", "Don", "Échange", "Partenariat", "Confiance mutuelle", "Coopération", "Collaboration", "Relation sociale", "Humanité", "Famille", "Soi", "Conscience de soi"],
    "Maîtrise": ["Maîtrise", "Ordre cosmique", "Leadership", "Guidance"],
    "Justice": ["Justice", "Honneur", "Courage", "Sacrifice"],
    "Vitalité": ["Force vitale", "Endurance", "Santé", "Guérison", "Source de vie", "Énergie vitale", "Fertilité", "Croissance", "Renaissance"],
    "Protection": ["Protection", "Défense", "Force de défense", "Dissipation"],
    "Destruction": ["Force destructrice", "Grêle", "Bouleversement", "Mort"],
    "Renouveau": ["Transformation", "Changement", "Nouveau départ", "Aube", "Éveil", "Jour"],
    "Mouvement": ["Voyage", "Mouvement", "Rythme", "Flux"],
    "Cycle": ["Cycle des saisons", "Cycle naturel", "Continuité"],
    "Élan": ["Progrès"],
    "Immobilité": ["Immobilité", "Glace", "Gel", "Stagnation"],
    "Patience": ["Patience", "Temps", "Réflexion"],
    "Épreuve": ["Épreuve", "Contrainte", "Nécessité", "Limitation"],
    "Harmonie": ["Harmonie", "Équilibre", "Joie", "Bonheur", "Satisfaction", "Paix"],
    "Accomplissement": ["Accomplissement", "Réalisation", "Victoire", "Succès", "Récompense"],
    "Lumière": ["Lumière", "Feu", "Énergie solaire", "Clarté", "Révélation"],
    "Connaissance": ["Connaissance", "Savoir", "Sagesse", "Créativité", "Transmission", "Écoute"],
    "Communication": ["Parole", "Expression", "Communication"],
    "Mystère": ["Mystère", "Secret", "Destin", "Hasard", "Opportunité", "Inconscient"],
    "Intuition": ["Intuition", "Émotion", "Eau"],
    "Spirituel": ["Énergie divine", "Lien inter-mondes"],
    "Héritage": ["Héritage", "Tradition", "Possession familiale", "Origine", "Identité culturelle"],
  };
  /** Familles qui s'opposent (évaluation de la complexité). */
  const OPPOSED = [["Cupidité", "Union"], ["Cupidité", "Justice"], ["Immobilité", "Mouvement"], ["Immobilité", "Élan"], ["Immobilité", "Renouveau"], ["Immobilité", "Vitalité"], ["Destruction", "Protection"], ["Destruction", "Vitalité"], ["Destruction", "Harmonie"], ["Destruction", "Héritage"], ["Épreuve", "Harmonie"], ["Épreuve", "Mouvement"], ["Mystère", "Maîtrise"], ["Mystère", "Connaissance"], ["Patience", "Élan"], ["Renouveau", "Héritage"]];

  /** « Épreuve  ! » → « épreuve » ; "" si l'étiquette est trop courte. */
  function norm(s) {
    const t = String(s == null ? "" : s).normalize("NFC").toLowerCase()
      .replace(/[^\p{L}\p{N}' -]+/gu, " ").replace(/\s+/g, " ").trim().replace(/^[-' ]+|[-' ]+$/g, "").slice(0, MAX_LEN).trim();
    return t.length >= MIN_LEN ? t : "";
  }
  /** Liste quelconque → liste normalisée, sans doublon, de max étiquettes au plus. */
  function clean(list, max) {
    const out = [], cap = max || MAX_TAGS;
    (Array.isArray(list) ? list : []).forEach((x) => { const t = norm(x); if (t && !out.includes(t) && out.length < cap) out.push(t); });
    return out;
  }
  const label = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : "");
  /** Liste des étiquettes proposées : toutes celles des runes, sans doublon, par ordre alphabétique. */
  const VOCAB = Array.from(new Set([].concat(...Object.values(RUNE_TAGS).map((l) => [].concat(...l))))).sort((x, y) => x.localeCompare(y, "fr"));
  const IMPOSED = new Set(VOCAB.map(norm));
  const isImposed = (t) => IMPOSED.has(t);

  /** Indices des sens gardés par une rune de la bindrune (t absent : tous). */
  function keptIndexes(r) {
    const n = (RUNE_TAGS[r.n] || []).length;
    return Array.isArray(r.t) ? Array.from(new Set(r.t.filter((i) => Number.isInteger(i) && i >= 0 && i < n))).sort((x, y) => x - y) : Array.from({ length: n }, (_, i) => i);
  }
  /** Étiquettes des runes d'une bindrune d = { r: [{ n, t }] } : celles des sens gardés, sans doublon, dans l'ordre des runes. */
  function derive(d) {
    const out = [];
    ((d && d.r) || []).forEach((r) => keptIndexes(r).forEach((i) => RUNE_TAGS[r.n][i].forEach((t) => { const k = norm(t); if (!out.includes(k)) out.push(k); })));
    return out;
  }
  /** Toutes les étiquettes d'une bindrune : celles de ses runes, puis celles qui ont été ajoutées. */
  const all = (d, extra) => { const base = derive(d); return base.concat(clean(extra).filter((t) => !base.includes(t))); };
  /** Étiquettes ajoutées : une liste complète (comme la renvoie le serveur) privée de celles qui viennent des runes. */
  const extras = (d, list) => { const base = derive(d); return clean(list, 60).filter((t) => !base.includes(t)).slice(0, MAX_TAGS); };
  const FAMILY_OF = {};
  Object.keys(FAMILIES).forEach((f) => FAMILIES[f].forEach((t) => { FAMILY_OF[norm(t)] = f; }));
  /** Famille de sens d'une étiquette (normalisée) ; undefined pour une étiquette libre. */
  const familyOf = (t) => FAMILY_OF[t];
  /**
   * Oppositions entre runes différentes : une famille d'une rune contre la famille opposée d'une autre (OPPOSED).
   * Chaque opposition compte une fois par couple de familles et par couple de runes, quel que soit le nombre de mots.
   */
  function dissonances(d) {
    const runes = (d && d.r) || [];
    const per = runes.map((r) => {
      const byFam = {};
      keptIndexes(r).forEach((i) => RUNE_TAGS[r.n][i].forEach((t) => { const f = FAMILY_OF[norm(t)]; if (f && !byFam[f]) byFam[f] = norm(t); }));
      return byFam;
    });
    const found = [];
    OPPOSED.forEach(([x, y]) => {
      for (let i = 0; i < per.length; i++) for (let j = 0; j < per.length; j++) {
        if (i === j || !per[i][x] || !per[j][y]) continue;
        if (found.some((o) => o.families[0] === x && o.families[1] === y && o.ij[0] === Math.min(i, j) && o.ij[1] === Math.max(i, j))) continue;
        found.push({ families: [x, y], tags: [per[i][x], per[j][y]], runes: [runes[i].n, runes[j].n], ij: [Math.min(i, j), Math.max(i, j)] });
      }
    });
    return found;
  }

  /* ---------------------------------------------------------------- interface (navigateur seulement) */
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  /** Pastille d'étiquette. kind : « locked » (verrouillée), « imposed » (liste imposée) ou « free » (libre). */
  function chip(t, kind) {
    const c = el("span", "tag " + kind, label(t));
    if (kind === "locked") c.title = "Étiquette d'un sens gardé d'une rune (à cocher dans les sens de la rune).";
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

  return { MAX_TAGS, MAX_LEN, VOCAB, RUNE_TAGS, FAMILIES, OPPOSED, familyOf, norm, clean, label, isImposed, keptIndexes, derive, all, extras, dissonances, locked: derive, chip, chips, editor };
});
