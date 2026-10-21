/* Cartes de bindrunes et menus déroulants, communs à « Mes bindrunes », à la galerie et à l'administration. Aucune dépendance. */
(function (root) {
  "use strict";
  const make = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  /** Bouton d'action : primaire (plein), secondaire (contour) ou, pour une action destructrice, rouge dans un menu. */
  function button(label, fn, primary, title) {
    const b = make("button", "btn" + (primary ? "" : " ghost"), label);
    b.type = "button"; if (title) b.title = title; b.addEventListener("click", fn);
    return b;
  }
  /** Menu déroulant : items = [[texte, fonction, danger?]] (les valeurs fausses sont ignorées) ; un seul menu ouvert à la fois. */
  function dropdown(label, items, cls) {
    const list = items.filter(Boolean), dd = make("details", "dd" + (cls ? " " + cls : "")), sm = make("summary", "", label), box = make("div", "ddm");
    list.forEach(([text, fn, danger]) => {
      const b = make("button", danger ? "danger" : "", text);
      b.type = "button"; b.addEventListener("click", () => { dd.open = false; fn(); });
      box.appendChild(b);
    });
    dd.append(sm, box);
    return list.length ? dd : null;
  }
  document.addEventListener("click", (e) => { document.querySelectorAll("details.dd[open]").forEach((d) => { if (!d.contains(e.target)) d.open = false; }); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") document.querySelectorAll("details.dd[open]").forEach((d) => { d.open = false; }); });
  document.addEventListener("toggle", (e) => { if (e.target.matches && e.target.matches("details.dd") && e.target.open) document.querySelectorAll("details.dd[open]").forEach((d) => { if (d !== e.target) d.open = false; }); }, true);

  /**
   * Une carte : o = { preview (SVG en texte ou élément), tag (étiquette posée sur l'aperçu), name, badges [[texte, classe]], by (ligne d'auteur),
   * runes, meta [texte ou nœud], desc, extra [nœuds], actions [nœuds] }. Sans aperçu, la carte est compacte (liste d'utilisateurs).
   */
  function card(o) {
    const li = make("li", "bcard" + (o.preview ? "" : " nopv")), body = make("div", "bbody");
    if (o.preview) {
      const pv = make("div", "bpv");
      if (typeof o.preview === "string") pv.innerHTML = o.preview; else pv.appendChild(o.preview);
      if (o.tag) pv.appendChild(make("span", "bpub", o.tag));
      li.appendChild(pv);
    }
    const h = make("h3", "bname", o.name);
    (o.badges || []).forEach(([t, c]) => h.appendChild(make("span", "badge " + (c || ""), t)));
    body.appendChild(h);
    if (o.by) body.appendChild(make("p", "bby", o.by));
    if (o.runes) body.appendChild(make("p", "brunes", o.runes));
    (o.meta || []).forEach((m) => { const p = make("p", "bmeta"); if (typeof m === "string") p.textContent = m; else p.appendChild(m); body.appendChild(p); });
    if (o.desc) body.appendChild(make("p", "bdesc", o.desc));
    (o.extra || []).forEach((n) => { if (n) body.appendChild(n); });
    const acts = make("div", "bacts");
    (o.actions || []).forEach((n) => { if (n) acts.appendChild(n); });
    if (acts.children.length) body.appendChild(acts);
    li.appendChild(body);
    return li;
  }
  root.Cards = { make, button, dropdown, card };
})(window);
