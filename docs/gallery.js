/* Galerie publique : bindrunes publiées par les joueurs, créditées à leur auteur (nom d'affichage Discord). */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const B = window.Bindrunes;
  const initialHash = location.hash;                          // « #galerie=<id> » : une bindrune précise, lue avant que app.js ne réécrive l'adresse
  const state = { page: 1, tag: "" };
  const fmt = (t) => new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const say = (t) => { $("g-msg").textContent = t; };

  async function api(path) {
    let r, j;
    try { r = await fetch(path); j = await r.json(); } catch (e) { throw new Error("La galerie n'est disponible que sur le site Cloudflare."); }
    if (!r.ok) throw new Error(j && j.error ? j.error : "Erreur " + r.status + ".");
    return j;
  }
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  function action(parent, label, fn) {
    const b = el("button", "act", label);
    b.type = "button"; b.addEventListener("click", fn); parent.appendChild(b);
  }

  /** Copie locale d'une bindrune de la galerie : l'auteur est gardé (« d'après X »), jamais republiable telle quelle. */
  function keep(item) {
    const same = B.list().find((r) => r.from === item.author && JSON.stringify(r.d) === JSON.stringify(item.d));
    if (same) return same;
    const added = B.importItems([{ name: item.name, description: item.description, tags: item.tags, from: item.author, d: item.d }]);
    return added[0] || null;
  }

  /** Filtre par étiquette : la liste déroule les étiquettes imposées ; une étiquette libre cliquée s'ajoute à la liste. */
  const tagSel = $("g-tag");
  function setTag(t) {
    state.tag = t;
    tagSel.innerHTML = "";
    const o0 = el("option", "", "Toutes les étiquettes"); o0.value = ""; tagSel.appendChild(o0);
    const opts = Tags.VOCAB.map(Tags.norm);
    if (t && !opts.includes(t)) opts.unshift(t);
    opts.forEach((v) => { const o = el("option", "", Tags.label(v)); o.value = v; tagSel.appendChild(o); });
    tagSel.value = t;
  }
  function pickTag(t) { setTag(t); window.scrollTo({ top: 0, behavior: "smooth" }); load(1); }
  tagSel.addEventListener("change", () => { state.tag = tagSel.value; load(1); });
  setTag("");

  function card(item, shared) {
    const li = el("li", "mcard"), info = el("div"), acts = el("div", "macts");
    const pv = el("div", "mprev"); pv.innerHTML = B.previewSVG(item.d);
    info.appendChild(el("h4", "", item.name));
    info.appendChild(el("p", "author", "par " + item.author));
    info.appendChild(el("p", "meta", B.runesLine(item.d) + " · " + Supports.get(item.d.s).label + " · " + B.cxLine(item.d) + (item.published_at ? " · publiée le " + fmt(item.published_at) : "")));
    if (item.description) info.appendChild(el("p", "desc", item.description));
    info.appendChild(Tags.chips(Tags.derive(item.d), item.tags || [], pickTag));
    action(acts, "Ouvrir dans le concepteur", () => window.dispatchEvent(new CustomEvent("bindrune:open", { detail: { name: item.name, description: item.description, tags: item.tags, d: item.d } })));
    action(acts, "S'entraîner", () => {
      const rec = keep(item);
      if (rec) window.dispatchEvent(new CustomEvent("bindrune:train", { detail: { name: rec.name } }));
      else say("Impossible d'enregistrer une copie : stockage du navigateur indisponible.");
    });
    action(acts, "Enregistrer chez moi", () => {
      const rec = keep(item);
      say(rec ? "« " + rec.name + " » enregistrée dans « Mes bindrunes » (d'après " + item.author + ")." : "Enregistrement impossible : stockage du navigateur indisponible.");
    });
    action(acts, "Lien", () => {
      const url = location.origin + "/#galerie=" + item.id;
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(() => say("Lien copié."), () => prompt("Copie ce lien :", url));
      else prompt("Copie ce lien :", url);
    });
    if (!shared) action(acts, "Autres bindrunes de cet auteur", () => { $("g-q").value = item.author; load(1); });
    info.appendChild(acts); li.appendChild(pv); li.appendChild(info);
    return li;
  }

  async function load(page) {
    state.page = page || 1;
    const q = new URLSearchParams({ page: state.page, sort: $("g-sort").value });
    if ($("g-q").value.trim()) q.set("q", $("g-q").value.trim());
    if (state.tag) q.set("tag", state.tag);
    const sense = Tags.match($("g-q").value).tags.slice(0, 12);          // « sante » retrouve aussi « santé », une famille retrouve ses mots
    if (sense.length) q.set("qt", sense.join(","));
    try {
      const j = await api("/api/gallery?" + q.toString());
      state.page = j.page;
      say(j.total ? "" : ($("g-q").value.trim() || state.tag ? "Aucune bindrune ne correspond." : "La galerie est vide pour l'instant."));
      const ul = $("g-list"); ul.innerHTML = "";
      j.items.forEach((it) => ul.appendChild(card(it, false)));
      $("g-page").textContent = "Page " + j.page + " sur " + j.pages + " · " + j.total + " bindrune" + (j.total > 1 ? "s" : "");
      $("g-prev").disabled = j.page <= 1; $("g-next").disabled = j.page >= j.pages;
      $("g-prev").onclick = () => load(j.page - 1); $("g-next").onclick = () => load(j.page + 1);
    } catch (e) { say(e.message); }
  }

  /** Lien « #galerie=<id> » : la bindrune visée est mise en avant en haut de la page. */
  async function showShared(id) {
    const box = $("g-shared");
    try {
      const item = await api("/api/gallery/" + encodeURIComponent(id));
      box.innerHTML = ""; box.hidden = false;
      const pv = el("div", "mprev"); pv.innerHTML = B.previewSVG(item.d);
      const body = el("div");
      body.appendChild(el("h3", "", "« " + item.name + " », par " + item.author));
      body.appendChild(el("p", "meta", B.runesLine(item.d) + " · " + Supports.get(item.d.s).label + " · " + B.cxLine(item.d)));
      if (item.description) body.appendChild(el("p", "desc", item.description));
      body.appendChild(Tags.chips(Tags.derive(item.d), item.tags || [], pickTag));
      const acts = el("div", "macts");
      action(acts, "Ouvrir dans le concepteur", () => window.dispatchEvent(new CustomEvent("bindrune:open", { detail: { name: item.name, description: item.description, tags: item.tags, d: item.d } })));
      action(acts, "Enregistrer chez moi", () => { const rec = keep(item); say(rec ? "« " + rec.name + " » enregistrée dans « Mes bindrunes »." : "Enregistrement impossible."); });
      action(acts, "Fermer", () => { box.hidden = true; });
      body.appendChild(acts); box.appendChild(pv); box.appendChild(body);
    } catch (e) { say("Cette bindrune n'est plus dans la galerie."); }
  }

  let timer;
  $("g-q").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => load(1), 300); });
  $("g-sort").addEventListener("change", () => load(1));
  window.PublicGallery = { showTag: (t) => { setTag(t); $("g-q").value = ""; window.showTab("galerie"); load(1); } };
  $("tab-galerie").addEventListener("click", () => load(state.page));
  if (initialHash.indexOf("#galerie=") === 0) showShared(initialHash.slice(9));
  if (initialHash.indexOf("#galerie") === 0) load(1);
})();
