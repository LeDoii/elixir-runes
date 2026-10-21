/* Mes bindrunes : stockage local, partage (lien), import / export (fichier), et onglet de gestion.
 *
 * Une bindrune enregistrée = { name, at, d } avec d = { r: [{ n, x, y, m, c }], s, t } :
 * runes (nom, position, aimant, couleur), support de gravure, strates colorées.
 * Tout ce qui vient du stockage, d'un lien ou d'un fichier est revalidé : jamais de confiance.
 */
(function () {
  "use strict";
  const D = window.RUNES, $ = (id) => document.getElementById(id);
  const COLORS = ["#3D5C8C", "#7A4E7A", "#A4551F", "#2B2B2E", "#4E7A53", "#8C3D3D"];
  const STORE = "runes-saved", MAX_NAME = 40, MAX_DESC = 300, MAX_RUNES = 6, FORMAT = "elixir-runes-bindrunes";
  const byName = (n) => D.runes.find((r) => r.name === n);
  const listeners = [];

  /** Points d'ancrage d'une rune (extrémités et angles de chaque trait, sans doublon). */
  const anchors = (name, f) => Geom.anchors(name, f);

  /* ------------------------------------------------------------------ validation */
  const cleanName = (s) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);
  /** Description libre : une seule ligne (retours à la ligne et caractères de contrôle remplacés par des espaces). */
  const cleanDesc = (s) => String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_DESC);
  const isNum = (v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 2000;

  /** Retourne les données normalisées, ou null si elles sont invalides. */
  function validate(d) {
    if (!d || !Array.isArray(d.r) || !d.r.length || d.r.length > MAX_RUNES) return null;
    const r = [];
    for (const e of d.r) {
      if (!e || typeof e.n !== "string" || !byName(e.n) || !isNum(e.x) || !isNum(e.y)) return null;
      const entry = { n: e.n, x: Math.round(e.x * 10) / 10, y: Math.round(e.y * 10) / 10, m: e.m === 0 ? 0 : 1, c: typeof e.c === "string" && /^#[0-9a-fA-F]{6}$/.test(e.c) ? e.c.toUpperCase() : COLORS[r.length % COLORS.length] };
      const kept = Array.isArray(e.t) ? Tags.keptTags(e) : null;             // étiquettes gardées de la rune (absent : toutes)
      if (kept && kept.length < Tags.runeTags(e.n).length) entry.t = kept;
      const f = Number.isInteger(e.f) && e.f > 0 && e.f <= 3 ? e.f : 0;      // miroir : 1 haut ↔ bas, 2 gauche ↔ droite
      if (f) entry.f = f;
      if (e.o === 1 || e.o === true) entry.o = 1;                            // coins ouverts d'origine fermés (réglage de la rune, absent : non)
      const k = isNum(e.k) ? Math.round(Math.min(3, Math.max(0.25, e.k)) * 100) / 100 : 1;              // échelle de la rune (1 : taille d'origine)
      if (k !== 1) entry.k = k;
      r.push(entry);
    }
    const l = (Array.isArray(d.l) ? d.l.slice(0, 40) : []).filter((k) => {
      if (!Array.isArray(k) || (k.length !== 4 && k.length !== 5) || !k.every(Number.isInteger) || k[0] === k[1] || k[0] < 0 || k[1] < 0 || k[0] >= r.length || k[1] >= r.length || k[2] < 0 || k[3] < 0) return false;
      if (k.length === 5) return k[4] === 2 && k[2] < anchors(r[k[0]].n).length && k[3] < 64;      // ancrage de la rune i posé sur le trait (segment) de la rune j
      return k[2] < anchors(r[k[0]].n).length && k[3] < anchors(r[k[1]].n).length;
    });
    const out = { r, s: Supports.list.some((s) => s.id === d.s) ? d.s : "bois", t: d.t === 1 ? 1 : 0, l };
    const z = isNum(d.z) ? Math.round(Math.min(1.6, Math.max(0.4, d.z)) * 100) / 100 : 1;   // taille de la bindrune sur la plaque
    if (z !== 1) out.z = z;
    return out;
  }

  /* ------------------------------------------------------------------ stockage */
  let cache = null;                                           // lecture du stockage mémorisée (invalidée à chaque écriture)
  function readAll() {
    if (!cache) {
      try {
        const a = JSON.parse(localStorage.getItem(STORE) || "[]");
        cache = (Array.isArray(a) ? a : []).map((x) => {
          const name = cleanName(x && x.name), d = validate(x && x.d);
          return name && d ? { name, at: Number.isFinite(x.at) ? x.at : 0, d, description: cleanDesc(x.description), tags: Tags.extras(d, x.tags), from: cleanName(x.from) } : null;
        }).filter(Boolean);
      } catch (e) { cache = []; }
    }
    return cache.map((x) => Object.assign({}, x));
  }
  function writeAll(a) {
    cache = null;
    try { localStorage.setItem(STORE, JSON.stringify(a)); } catch (e) { return false; }
    changed();
    return true;
  }
  function changed() { renderTab(); listeners.forEach((fn) => fn()); }

  const list = () => readAll().sort((a, b) => b.at - a.at);
  const get = (name) => readAll().find((x) => x.name.toLowerCase() === cleanName(name).toLowerCase()) || null;
  const has = (name) => !!get(name);
  function uniqueName(base) {
    const names = readAll().map((x) => x.name.toLowerCase());
    let n = cleanName(base) || "Sans nom", out = n, i = 2;
    while (names.includes(out.toLowerCase())) { const suffix = " (" + i++ + ")"; out = n.slice(0, MAX_NAME - suffix.length) + suffix; }
    return out;
  }
  /** Enregistre (ou remplace) une bindrune. Retourne l'enregistrement, ou null si le stockage est indisponible. */
  function save(name, d, description, tags) {
    const nm = cleanName(name), data = validate(d);
    if (!nm || !data) return null;
    const all = readAll(), rec = { name: nm, at: Date.now(), d: data, description: cleanDesc(description), tags: Tags.extras(data, tags), from: "" }, idx = all.findIndex((x) => x.name.toLowerCase() === nm.toLowerCase());
    if (idx >= 0) all[idx] = rec; else all.push(rec);
    return writeAll(all) ? rec : null;
  }
  function setDescription(name, text) {
    const all = readAll(), rec = all.find((x) => x.name.toLowerCase() === cleanName(name).toLowerCase());
    if (!rec) return false;
    rec.description = cleanDesc(text);
    return writeAll(all);
  }
  /** Étiquettes d'une bindrune : enregistrées sans redessiner l'onglet (l'éditeur d'étiquettes se met à jour lui-même). */
  function setTags(name, tags) {
    const all = readAll(), rec = all.find((x) => x.name.toLowerCase() === cleanName(name).toLowerCase());
    if (!rec) return false;
    rec.tags = Tags.extras(rec.d, tags);
    cache = null;
    try { localStorage.setItem(STORE, JSON.stringify(all)); } catch (e) { return false; }
    listeners.forEach((fn) => fn());
    return true;
  }
  /** Écrit des enregistrements venus du compte (ajout ou remplacement par nom). Voir account.js. */
  function applyRemote(upserts) {
    const all = readAll();
    upserts.forEach((u) => {
      const i = all.findIndex((x) => x.name.toLowerCase() === u.name.toLowerCase());
      const rec = { name: cleanName(u.name), at: Number.isFinite(u.at) ? u.at : Date.now(), d: validate(u.d), description: cleanDesc(u.description), tags: [], from: i >= 0 ? all[i].from : "" };
      if (!rec.name || !rec.d) return;
      rec.tags = Tags.extras(rec.d, u.tags);
      if (i >= 0) all[i] = rec; else all.push(rec);
    });
    return writeAll(all);
  }
  /** Retire de la liste les bindrunes de ces noms. */
  const dropLocal = (names) => { const set = new Set(names.map((n) => cleanName(n).toLowerCase())); return writeAll(readAll().filter((x) => !set.has(x.name.toLowerCase()))); };
  const remove = (name) => writeAll(readAll().filter((x) => x.name.toLowerCase() !== cleanName(name).toLowerCase()));
  function rename(oldName, newName) {
    const nm = cleanName(newName);
    if (!nm) return "Le nom est vide.";
    const all = readAll(), rec = all.find((x) => x.name === oldName);
    if (!rec) return "Bindrune introuvable.";
    if (all.some((x) => x !== rec && x.name.toLowerCase() === nm.toLowerCase())) return "Ce nom est déjà pris.";
    rec.name = nm;
    return writeAll(all) ? null : "Stockage indisponible.";
  }

  /* ------------------------------------------------------------------ modèle pour le dessin libre */
  const modelCache = {};
  /** Géométrie de la bindrune comme une « rune » (traits en coordonnées de grille), recentrée et réduite pour tenir dans le cadre. */
  function model(name) {
    const rec = get(name);
    if (!rec) return null;
    const key = rec.name + "|" + rec.at;
    if (modelCache[key]) return modelCache[key];
    const strokes = [];
    rec.d.r.forEach((e) => Geom.placed(e).forEach((s) => strokes.push({ name: s.name, pts: s.pts })));
    const all = strokes.flatMap((s) => s.pts);
    const x0 = Math.min(...all.map((p) => p[0])), x1 = Math.max(...all.map((p) => p[0]));
    const y0 = Math.min(...all.map((p) => p[1])), y1 = Math.max(...all.map((p) => p[1]));
    const f = Math.min(1, 492 / Math.max(x1 - x0, 1), 492 / Math.max(y1 - y0, 1)), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const m = { name: rec.name, widthScale: f, strokes: strokes.map((s) => ({ name: s.name, pts: s.pts.map(([x, y]) => [(x - cx) * f + 256, (y - cy) * f + 256]) })) };
    return (modelCache[key] = m);
  }

  /* ------------------------------------------------------------------ partage et import / export */
  const b64 = {
    enc: (o) => { const u = new TextEncoder().encode(JSON.stringify(o)); let b = ""; u.forEach((c) => (b += String.fromCharCode(c))); return btoa(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); },
    dec: (t) => { const b = atob(t.replace(/-/g, "+").replace(/_/g, "/")); return JSON.parse(new TextDecoder().decode(Uint8Array.from(b, (c) => c.charCodeAt(0)))); },
  };
  const shareCode = (rec) => b64.enc({ name: rec.name, description: rec.description || "", tags: rec.tags || [], from: rec.from || "", d: rec.d });
  const shareUrl = (rec) => location.origin + location.pathname + "#bindrunes=" + shareCode(rec);

  /** Lit un lien, un code ou un fichier JSON. Retourne un tableau de { name, d } valides (éventuellement vide). */
  function parseImport(text) {
    const t = String(text || "").trim();
    if (!t) return [];
    let raw;
    try {
      if (t[0] === "{" || t[0] === "[") raw = JSON.parse(t);
      else {
        const i = Math.max(t.indexOf("#bindrunes="), t.indexOf("#concepteur="));
        raw = b64.dec(i >= 0 ? t.slice(t.indexOf("=", i) + 1).trim() : t);
      }
    } catch (e) { return []; }
    const entries = Array.isArray(raw) ? raw : raw && Array.isArray(raw.bindrunes) ? raw.bindrunes : [raw];
    const out = [];
    entries.slice(0, 50).forEach((e) => {
      const d = validate(e && e.d), name = cleanName(e && e.name);
      if (d) out.push({ name: name || "Sans nom", description: cleanDesc(e && e.description), tags: Tags.extras(d, e && e.tags), from: cleanName(e && e.from), d });
    });
    return out;
  }
  function importAll(items) {
    const all = readAll();
    const added = [];
    items.forEach((it) => {
      const names = all.map((x) => x.name.toLowerCase());
      let name = cleanName(it.name), i = 2;
      const base = name;
      while (names.includes(name.toLowerCase())) { const suffix = " (" + i++ + ")"; name = base.slice(0, MAX_NAME - suffix.length) + suffix; }
      const rec = { name, at: Date.now() + added.length, d: it.d, description: cleanDesc(it.description), tags: Tags.extras(it.d, it.tags), from: cleanName(it.from) };
      all.push(rec); added.push(rec);
    });
    return writeAll(all) ? added : [];
  }
  function download(obj, filename) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: "application/json" }));
    a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const fileSafe = (s) => s.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").toLowerCase() || "bindrune";
  const exportDoc = (recs) => ({ format: FORMAT, version: 1, bindrunes: recs.map((r) => ({ name: r.name, description: r.description || "", tags: r.tags || [], from: r.from || "", d: r.d })) });

  /* ------------------------------------------------------------------ onglet « Mes bindrunes » */
  const say = (t) => { $("mine-msg").textContent = t; };
  function previewSVG(d) {
    const parts = [];
    d.r.forEach((e) => Geom.drawn(e).forEach((s) => parts.push({ c: e.c, k: e.k || 1, pts: s.pts })));
    Geom.joins(Geom.linkPairs(d.r, d.l)).forEach((j) => parts.push({ c: j.e.c, k: j.e.k || 1, pts: j.pts }));
    const all = parts.flatMap((p) => p.pts);
    const x0 = Math.min(...all.map((p) => p[0])) - 30, x1 = Math.max(...all.map((p) => p[0])) + 30;
    const y0 = Math.min(...all.map((p) => p[1])) - 30, y1 = Math.max(...all.map((p) => p[1])) + 30;
    return '<svg viewBox="' + x0 + " " + y0 + " " + (x1 - x0) + " " + (y1 - y0) + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      parts.map((p) => '<polyline points="' + p.pts.map((q) => q.join(",")).join(" ") + '" fill="none" stroke="' + p.c + '" stroke-opacity=".88" stroke-width="' + D.strokeWidth * p.k + '" stroke-linejoin="miter"/>').join("") + "</svg>";
  }
  const when = (at) => (at ? new Date(at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "");
  const runesLine = (d) => d.r.map((e) => e.n).join(" · ");
  /** « complexité élevée (58/100) » : voir complexity.js */
  const cxLine = (d) => { const c = Complexity.rate(d); return "complexité " + c.level.toLowerCase() + " (" + c.score + "/100)"; };

  /** Fiche A4 (PNG ou PDF) d'une bindrune : voir sheet.js. */
  async function sheet(rec, kind) {
    say("Création de la fiche…");
    try { await Sheet.download(rec, kind); say("Fiche de « " + rec.name + " » prête (" + kind.toUpperCase() + ")."); }
    catch (e) { say("Fiche impossible : " + e.message); }
  }
  function act(parent, label, fn) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "act"; b.textContent = label; b.addEventListener("click", fn);
    parent.appendChild(b);
  }
  function copyText(text, what, rec) {
    const ok = () => say(what + " de « " + rec.name + " » copié.");
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, () => prompt("Copie ce texte :", text));
    else prompt("Copie ce texte :", text);
  }

  /* ---- codes courts : API des Pages Functions, seulement sur l'hébergement Cloudflare (absente de GitHub Pages et en local) */
  let apiOk = null;
  async function checkApi() {
    try {
      const r = await fetch("/api/health", { cache: "no-store" });
      apiOk = r.ok && (await r.json()).db === true;
    } catch (e) { apiOk = false; }
    renderTab();
  }
  const SHORT = /^[A-HJKMNP-Z2-9]{4}[\s-]?[A-HJKMNP-Z2-9]{4}$/i;      // alphabet du serveur : ni 0, 1, I, L, O
  async function apiCall(url, options) {
    let r, j;
    try { r = await fetch(url, options); j = await r.json(); } catch (e) { throw new Error("Le serveur ne répond pas."); }
    if (!r.ok) throw new Error(j && j.error ? j.error : "Erreur " + r.status + ".");
    return j;
  }
  async function shortCode(rec) {
    if (!apiOk) { say("Les codes courts ne sont disponibles que sur l'adresse Cloudflare du site."); return; }
    say("Création du code court…");
    try {
      const j = await apiCall("/api/codes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: rec.name, description: rec.description || "", tags: rec.tags || [], d: rec.d }) });
      let copied = false;
      try { await navigator.clipboard.writeText(j.display); copied = true; } catch (e) { /* presse-papiers indisponible */ }
      say("Code court de « " + rec.name + " » : " + j.display + (copied ? " (copié)." : "."));
    } catch (e) { say("Code court impossible : " + e.message); }
  }
  async function importShort(text) {
    if (!apiOk) { say("Les codes courts ne sont disponibles que sur l'adresse Cloudflare du site."); return null; }
    try {
      const j = await apiCall("/api/codes/" + encodeURIComponent(text.replace(/[\s-]+/g, "").toUpperCase()));
      const d = validate(j.d);
      return d ? [{ name: cleanName(j.name) || "Sans nom", description: cleanDesc(j.description), tags: Tags.extras(d, j.tags), d }] : [];
    } catch (e) { say("Import impossible : " + e.message); return null; }
  }

  /**
   * Cette combinaison de runes existe-t-elle déjà ? (mêmes runes, mêmes points d'ancrage : voir combo.js)
   * Cherche dans tes bindrunes (navigateur, ou compte une fois connecté : c'est la même liste) et dans la galerie publique.
   * Retourne une phrase d'information, ou "" : jamais bloquant, sans aucune incidence sur l'enregistrement.
   */
  async function duplicateNotice(name, d) {
    const nm = cleanName(name).toLowerCase(), key = Combo.key(d), parts = [];
    list().forEach((r) => { if (r.name.toLowerCase() !== nm && Combo.key(r.d) === key) parts.push("« " + r.name + " » (dans tes bindrunes)"); });
    if (apiOk) {
      try {
        const j = await apiCall("/api/combo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ d }) });
        (j.gallery || []).forEach((g) => { if (!g.own) parts.push("« " + g.name + " » par " + g.author + " (galerie)"); });   // les siennes sont déjà dans la liste
      } catch (e) { /* le serveur ne répond pas : on ne signale rien */ }
    }
    return parts.length ? "À noter : une combinaison identique existe déjà : " + parts.join(", ") + ". C'est seulement une information." : "";
  }

  function renderTab() {
    const ul = $("mine-list");
    if (!ul) return;
    const all = list();
    ul.innerHTML = "";
    $("mine-empty").hidden = all.length > 0;
    $("mine-export-all").disabled = !all.length;
    all.forEach((rec) => {
      const li = document.createElement("li");
      li.className = "mcard";
      const pv = document.createElement("div");
      pv.className = "mprev"; pv.innerHTML = previewSVG(rec.d);
      const info = document.createElement("div"), h = document.createElement("h4"), meta = document.createElement("p"), acts = document.createElement("div");
      h.textContent = rec.name;
      if (window.Account && window.Account.isPublished(rec.name)) { const bd = document.createElement("span"); bd.className = "badge pub"; bd.textContent = "publiée"; h.appendChild(bd); }
      meta.className = "meta";
      meta.textContent = runesLine(rec.d) + " · " + Supports.get(rec.d.s).label + " · " + cxLine(rec.d) + (rec.at ? " · " + when(rec.at) : "") + (rec.from ? " · d'après " + rec.from : "");
      acts.className = "macts";
      act(acts, "Ouvrir dans Bindrune", () => window.dispatchEvent(new CustomEvent("bindrune:open", { detail: { name: rec.name, description: rec.description, tags: rec.tags, d: rec.d } })));
      act(acts, "S'entraîner", () => window.dispatchEvent(new CustomEvent("bindrune:train", { detail: { name: rec.name } })));
      act(acts, "Description", () => {
        const t = prompt("Description (" + MAX_DESC + " caractères au plus) :", rec.description || "");
        if (t === null) return;
        say(setDescription(rec.name, t) ? "Description enregistrée." : "Enregistrement impossible.");
      });
      act(acts, "Renommer", () => {
        const nn = prompt("Nouveau nom :", rec.name);
        if (nn === null) return;
        const err = rename(rec.name, nn);
        say(err || "Renommée.");
      });
      act(acts, "Lien", () => copyText(shareUrl(rec), "Lien", rec));
      act(acts, "Code", () => copyText(shareCode(rec), "Code", rec));
      if (apiOk) act(acts, "Code court", () => shortCode(rec));
      if (window.Account && window.Account.user()) {
        if (window.Account.isPublished(rec.name)) act(acts, "Retirer de la galerie", () => window.Account.unpublish(rec));
        else if (!rec.from) act(acts, "Publier dans la galerie", () => window.Account.publish(rec));
      }
      act(acts, "Fiche PNG", () => sheet(rec, "png"));
      act(acts, "Fiche PDF", () => sheet(rec, "pdf"));
      act(acts, "Exporter", () => download(exportDoc([rec]), fileSafe(rec.name) + ".json"));
      act(acts, "Supprimer", () => { if (confirm("Supprimer « " + rec.name + " » ?")) { remove(rec.name); say("« " + rec.name + " » supprimée."); } });
      info.appendChild(h); info.appendChild(meta);
      if (rec.description) { const dp = document.createElement("p"); dp.className = "desc"; dp.textContent = rec.description; info.appendChild(dp); }
      info.appendChild(Tags.editor({
        collapsible: true,
        locked: () => Tags.derive(rec.d),
        get: () => rec.tags || [],
        set: (t) => { rec.tags = Tags.extras(rec.d, t); setTags(rec.name, rec.tags); },
      }).el);
      info.appendChild(acts);
      li.appendChild(pv); li.appendChild(info);
      ul.appendChild(li);
    });
  }

  function doImport(items, from) {
    if (!items.length) { say("Rien d'importable : " + from + " ne contient pas de bindrune valide."); return; }
    const added = importAll(items);
    if (!added.length) { say("Import impossible : le stockage du navigateur est indisponible."); return; }
    say(added.length === 1 ? "« " + added[0].name + " » importée." : added.length + " bindrunes importées.");
  }

  /* ---- boîte de réception : bindrune reçue par lien */
  function showInbox(item) {
    const box = $("inbox");
    box.hidden = false;
    box.innerHTML = "";
    const pv = document.createElement("div"), body = document.createElement("div"), h = document.createElement("h3"), p = document.createElement("p"), acts = document.createElement("div");
    pv.className = "mprev"; pv.innerHTML = previewSVG(item.d);
    h.textContent = "Bindrune reçue : « " + item.name + " »";
    p.className = "meta"; p.textContent = runesLine(item.d) + " · " + Supports.get(item.d.s).label + " · " + cxLine(item.d) + (item.description ? " · " + item.description : "");
    acts.className = "macts";
    act(acts, "Enregistrer dans mes bindrunes", () => { doImport([item], "ce lien"); box.hidden = true; });
    act(acts, "Ouvrir dans Bindrune", () => window.dispatchEvent(new CustomEvent("bindrune:open", { detail: { name: item.name, description: item.description, tags: item.tags, d: item.d } })));
    act(acts, "Ignorer", () => { box.hidden = true; });
    body.appendChild(h); body.appendChild(p);
    if ((item.tags || []).length) body.appendChild(Tags.chips(Tags.derive(item.d), item.tags || []));
    body.appendChild(acts);
    box.appendChild(pv); box.appendChild(body);
  }

  $("mine-import-btn").addEventListener("click", async () => {
    const t = $("mine-import-text").value.trim();
    if (SHORT.test(t)) {                                      // code court : on le résout auprès du serveur
      const items = await importShort(t);
      if (items) doImport(items, "ce code");
      if ($("mine-msg").textContent.indexOf("importée") >= 0) $("mine-import-text").value = "";
      return;
    }
    doImport(parseImport(t), "ce texte");
    if ($("mine-msg").textContent.indexOf("importée") >= 0) $("mine-import-text").value = "";
  });
  $("mine-file").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > 1000000) { say("Fichier trop volumineux."); return; }
    const rd = new FileReader();
    rd.onload = () => doImport(parseImport(String(rd.result)), "ce fichier");
    rd.onerror = () => say("Lecture du fichier impossible.");
    rd.readAsText(f);
  });
  $("mine-export-all").addEventListener("click", () => download(exportDoc(list()), "mes-bindrunes.json"));
  window.addEventListener("storage", (e) => { if (e.key === STORE) { cache = null; changed(); } });

  window.Bindrunes = { applyRemote, dropLocal, sheet, cxLine, setTags, duplicateNotice, cleanDesc, MAX_DESC, setDescription, previewSVG, runesLine, importItems: importAll, rerender: renderTab, checkApi, COLORS, anchors, validate, list, get, has, save, remove, rename, uniqueName, model, onChange: (fn) => listeners.push(fn), cleanName, MAX_NAME };
  renderTab();
  checkApi();

  const hash = location.hash;                                  // lien de partage reçu (ancien format #concepteur= inclus)
  if (hash.indexOf("#bindrunes=") === 0 || hash.indexOf("#concepteur=") === 0) {
    const items = parseImport(hash);
    if (items.length) showInbox(items[0]); else say("Le lien de partage est invalide.");
  }
})();
