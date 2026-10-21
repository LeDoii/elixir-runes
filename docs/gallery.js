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

  async function sheet(item, kind) {
    say("Création de la fiche…");
    try { await Sheet.download({ name: item.name, description: item.description, tags: Tags.extras(item.d, item.tags), d: item.d, author: item.author }, kind); say("Fiche de « " + item.name + " » prête (" + kind.toUpperCase() + ")."); }
    catch (e) { say("Fiche impossible : " + e.message); }
  }

  /** Quelques étiquettes cliquables (elles filtrent la galerie) ; le reste en « + N ». */
  function tagRow(item) {
    const all = Tags.all(item.d, item.tags), row = el("p", "btags");
    all.slice(0, 5).forEach((t) => { const c = el("button", "tg", Tags.label(t)); c.type = "button"; c.title = "Voir les bindrunes « " + Tags.label(t) + " »"; c.addEventListener("click", () => pickTag(Tags.norm(t))); row.appendChild(c); });
    if (all.length > 5) row.appendChild(el("span", "more", "+ " + (all.length - 5)));
    return row;
  }
  const openIn = (item) => window.dispatchEvent(new CustomEvent("bindrune:open", { detail: { name: item.name, description: item.description, tags: item.tags, d: item.d } }));
  const copyLink = (item) => {
    const url = location.origin + "/#galerie=" + item.id;
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(() => say("Lien copié."), () => prompt("Copie ce lien :", url));
    else prompt("Copie ce lien :", url);
  };
  function card(item, shared) {
    const c = B.cxOf(item.d), lvl = el("span", "", "Complexité " + c.level.toLowerCase() + " · " + c.score + " / 100"), meta = el("span");
    lvl.className = "lvl"; meta.append(lvl, document.createTextNode(" · " + Supports.get(item.d.s).label + (item.published_at ? " · publiée le " + fmt(item.published_at) : "")));
    const train = () => {
      const rec = keep(item);
      if (rec) window.dispatchEvent(new CustomEvent("bindrune:train", { detail: { name: rec.name } }));
      else say("Impossible d'enregistrer une copie : stockage du navigateur indisponible.");
    };
    return Cards.card({
      preview: B.previewSVG(item.d), name: item.name, by: "par " + item.author, runes: B.runesLine(item.d), meta: [meta], desc: item.description, extra: [tagRow(item)],
      actions: [
        Cards.button("Ouvrir", () => openIn(item), true, "Ouvrir dans l'onglet Bindrune"),
        Cards.button("Enregistrer chez moi", () => { const rec = keep(item); say(rec ? "« " + rec.name + " » enregistrée dans « Mes bindrunes » (d'après " + item.author + ")." : "Enregistrement impossible : stockage du navigateur indisponible."); }),
        Cards.dropdown("Fiche", [["Fiche PNG", () => sheet(item, "png")], ["Fiche PDF", () => sheet(item, "pdf")]]),
        Cards.dropdown("⋯", [["S'entraîner", train], ["Copier le lien", () => copyLink(item)], !shared && ["Autres bindrunes de cet auteur", () => { $("g-q").value = item.author; load(1); }]], "more"),
      ],
    });
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
      $("g-count").textContent = j.total ? "· " + j.total : "";
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
      const li = card(item, true);
      li.classList.add("featured");
      const head = el("p", "feat", "Bindrune partagée avec toi"), close = Cards.button("Fermer", () => { box.hidden = true; });
      li.querySelector(".bacts").appendChild(close);
      box.append(head, el("ul", "bgrid one")); box.lastChild.appendChild(li);
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
