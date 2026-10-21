/* Administration : liste de toutes les bindrunes, utilisateurs, journal. Le serveur vérifie les droits à chaque requête. */
(function () {
  "use strict";
  const D = window.RUNES, $ = (id) => document.getElementById(id);
  const state = { bind: { page: 1 }, users: { page: 1 }, user: "" };
  const fmt = (t) => new Date(t).toLocaleString("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const byName = (n) => D.runes.find((r) => r.name === n);

  async function api(path, options) {
    let r, j;
    try { r = await fetch(path, options); j = await r.json(); } catch (e) { throw new Error("Le serveur ne répond pas."); }
    if (!r.ok) throw new Error(j && j.error ? j.error : "Erreur " + r.status + ".");
    return j;
  }
  const post = (path, body) => api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  function action(parent, label, fn, danger) {
    const b = el("button", "act" + (danger ? " danger" : ""), label);
    b.type = "button"; b.addEventListener("click", fn); parent.appendChild(b);
  }
  function preview(d) {
    const parts = [];
    if (d) { d.r.forEach((e) => Geom.drawn(e).forEach((s) => parts.push({ c: e.c, k: e.k || 1, pts: s.pts }))); Geom.joins((d.l || []).filter((k) => k.length === 4).map(([i, j, pa, pb]) => [d.r[i], d.r[j], pa, pb])).forEach((j) => parts.push({ c: j.e.c, k: j.e.k || 1, pts: j.pts })); }
    const box = el("div", "mprev");
    if (!parts.length) { box.textContent = "?"; return box; }
    const all = parts.flatMap((p) => p.pts);
    const x0 = Math.min(...all.map((p) => p[0])) - 30, x1 = Math.max(...all.map((p) => p[0])) + 30;
    const y0 = Math.min(...all.map((p) => p[1])) - 30, y1 = Math.max(...all.map((p) => p[1])) + 30;
    box.innerHTML = '<svg viewBox="' + x0 + " " + y0 + " " + (x1 - x0) + " " + (y1 - y0) + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      parts.map((p) => '<polyline points="' + p.pts.map((q) => q.join(",")).join(" ") + '" fill="none" stroke="' + p.c + '" stroke-opacity=".88" stroke-width="' + D.strokeWidth * p.k + '"/>').join("") + "</svg>";
    return box;
  }
  function pager(prefix, page, pages, total, onGo) {
    $(prefix + "-page").textContent = "Page " + page + " sur " + pages + " · " + total + " résultat" + (total > 1 ? "s" : "");
    $(prefix + "-prev").disabled = page <= 1; $(prefix + "-next").disabled = page >= pages;
    $(prefix + "-prev").onclick = () => onGo(page - 1); $(prefix + "-next").onclick = () => onGo(page + 1);
  }

  /* ---------------------------------------------------------------- statistiques */
  async function loadStats() {
    const s = await api("/api/admin/stats");
    const rows = [
      ["Comptes", s.users, s.active_week + " actifs sur 7 jours"], ["Bloqués", s.banned, ""],
      ["Bindrunes de comptes", s.account_bindrunes, "+" + s.account_week + " sur 7 jours"],
      ["Codes courts", s.codes, "+" + s.codes_week + " sur 7 jours · " + s.codes_anonymous + " anonymes"],
    ];
    const ul = $("adm-stats");
    ul.innerHTML = "";
    rows.forEach(([t, n, sub]) => { const li = el("li"); li.appendChild(el("strong", "", String(n))); li.appendChild(el("span", "", t)); if (sub) li.appendChild(el("small", "", sub)); ul.appendChild(li); });
  }

  /* ---------------------------------------------------------------- bindrunes */
  function filterQuery() {
    const q = new URLSearchParams();
    if ($("f-source").value) q.set("source", $("f-source").value);
    if (state.user) q.set("user", state.user);
    else if ($("f-user").value) q.set("user", $("f-user").value);
    if ($("f-q").value.trim()) q.set("q", $("f-q").value.trim());
    return q;
  }
  async function loadBind(page) {
    state.bind.page = page || 1;
    const q = filterQuery();
    $("f-export").href = "/api/admin/export?" + q.toString();
    q.set("page", state.bind.page);
    try {
      const j = await api("/api/admin/bindrunes?" + q.toString());
      state.bind.page = j.page;
      $("b-msg").textContent = j.total ? "" : "Aucune bindrune.";
      const ul = $("b-list"); ul.innerHTML = "";
      j.items.forEach((it) => {
        const li = el("li", "mcard"), info = el("div"), acts = el("div", "macts");
        li.appendChild(preview(it.d));
        const h = el("h4", "", it.name);
        h.appendChild(el("span", "badge " + it.source, it.source === "code" ? "code court" : "compte"));
        if (it.published) h.appendChild(el("span", "badge pub", "publiée"));
        info.appendChild(h);
        info.appendChild(el("p", "meta", (it.d ? it.d.r.map((e) => e.n).join(" · ") + " · " + Supports.get(it.d.s).label : "données illisibles") + " · " + fmt(it.at)));
        info.appendChild(el("p", "meta", (it.source === "code" ? "Code " + it.id.slice(0, 4) + "-" + it.id.slice(4) + " · " : "") + (it.user ? "Auteur : " + (it.user.name || "?") + " (" + it.user.id + ")" : "Anonyme")));
        if (it.description) info.appendChild(el("p", "desc", it.description));
        if ((it.tags || []).length) info.appendChild(el("p", "meta", "Étiquettes : " + it.tags.join(", ")));
        if (it.published) action(acts, "Dépublier", async () => {
          if (!confirm("Retirer « " + it.name + " » de la galerie ? Elle reste sur le compte de son auteur.")) return;
          try { await post("/api/admin/bindrunes/account/" + encodeURIComponent(it.id) + "/unpublish", {}); await loadBind(state.bind.page); $("b-msg").textContent = "« " + it.name + " » dépubliée."; }
          catch (e) { $("b-msg").textContent = "Action impossible : " + e.message; }
        });
        if (it.user) action(acts, "Voir l'auteur", () => { state.user = it.user.id; showChip(it.user.name || it.user.id); loadBind(1); });
        action(acts, "Supprimer", async () => {
          if (!confirm("Supprimer définitivement « " + it.name + " » ?" + (it.source === "code" ? " Le code court ne fonctionnera plus." : ""))) return;
          try { await api("/api/admin/bindrunes/" + it.source + "/" + encodeURIComponent(it.id), { method: "DELETE" }); await loadBind(state.bind.page); loadStats(); $("b-msg").textContent = "« " + it.name + " » supprimée."; }
          catch (e) { $("b-msg").textContent = "Suppression impossible : " + e.message; }
        }, true);
        info.appendChild(acts); li.appendChild(info); ul.appendChild(li);
      });
      pager("b", j.page, j.pages, j.total, loadBind);
    } catch (e) { $("b-msg").textContent = e.message; }
  }
  function showChip(name) {
    const chip = $("f-chip");
    chip.hidden = !state.user; chip.textContent = "";
    if (!state.user) return;
    chip.appendChild(document.createTextNode("Auteur : " + name + " "));
    action(chip, "Retirer le filtre", () => { state.user = ""; showChip(""); loadBind(1); });
  }

  /* ---------------------------------------------------------------- utilisateurs */
  async function loadUsers(page) {
    state.users.page = page || 1;
    const q = new URLSearchParams({ page: state.users.page });
    if ($("u-q").value.trim()) q.set("q", $("u-q").value.trim());
    try {
      const j = await api("/api/admin/users?" + q.toString());
      state.users.page = j.page;
      $("u-msg").textContent = j.total ? "" : "Aucun utilisateur.";
      const ul = $("u-list"); ul.innerHTML = "";
      j.items.forEach((u) => {
        const li = el("li", "mcard ucard"), info = el("div"), acts = el("div", "macts");
        const h = el("h4", "", u.name);
        if (u.admin) h.appendChild(el("span", "badge admin", "admin"));
        if (u.banned) h.appendChild(el("span", "badge banned", "bloqué"));
        info.appendChild(h);
        info.appendChild(el("p", "meta", "@" + u.username + " · " + u.id));
        info.appendChild(el("p", "meta", "Inscrit " + fmt(u.created_at) + " · dernière connexion " + fmt(u.last_login)));
        info.appendChild(el("p", "meta", u.bindrunes + " bindrune" + (u.bindrunes > 1 ? "s" : "") + " · " + u.codes + " code" + (u.codes > 1 ? "s" : "") + " court" + (u.codes > 1 ? "s" : "")));
        action(acts, "Voir ses bindrunes", () => { state.user = u.id; showChip(u.name); select("bind"); loadBind(1); });
        if (!u.admin) {
          action(acts, u.banned ? "Débloquer" : "Bloquer", async () => {
            const verb = u.banned ? "Débloquer" : "Bloquer";
            if (!confirm(verb + " " + u.name + " ?" + (u.banned ? "" : " Sa connexion sera refusée et ses sessions coupées ; ses bindrunes restent."))) return;
            try { await post("/api/admin/users/" + u.id + "/ban", { banned: !u.banned }); await loadUsers(state.users.page); loadStats(); $("u-msg").textContent = u.name + (u.banned ? " débloqué." : " bloqué."); }
            catch (e) { $("u-msg").textContent = "Action impossible : " + e.message; }
          }, !u.banned);
        }
        info.appendChild(acts); li.appendChild(info); ul.appendChild(li);
      });
      pager("u", j.page, j.pages, j.total, loadUsers);
    } catch (e) { $("u-msg").textContent = e.message; }
  }

  /* ---------------------------------------------------------------- journal */
  const ACTIONS = { backup: "a téléchargé une sauvegarde :", delete_bindrune: "a supprimé la bindrune", delete_code: "a supprimé le code court", ban: "a bloqué", unban: "a débloqué", unpublish: "a dépublié de la galerie" };
  async function loadLog() {
    const ul = $("l-list");
    try {
      const j = await api("/api/admin/log");
      ul.innerHTML = "";
      if (!j.items.length) ul.appendChild(el("li", "hint", "Aucune action pour l'instant."));
      j.items.forEach((x) => ul.appendChild(el("li", "", fmt(x.at) + " · " + x.admin_name + " " + (ACTIONS[x.action] || x.action) + " « " + x.detail + " » (" + x.target + ")")));
    } catch (e) { ul.textContent = e.message; }
  }

  /* ---------------------------------------------------------------- santé du site */
  const num = (n) => Number(n).toLocaleString("fr-FR");
  async function loadHealth() {
    try {
      const h = await api("/api/admin/health"), c = h.counts;
      const rows = [
        ["Base de données", h.db.ok ? "OK" : "Panne", h.db.size_bytes != null ? (h.db.size_bytes / 1048576).toFixed(2).replace(".", ",") + " Mo sur " + h.limits.storage_gb + " Go" : ""],
        ["Comptes", c.users, ""], ["Bindrunes", c.bindrunes, c.published + " publiées"], ["Codes courts", c.codes, ""],
        ["Erreurs (24 h)", c.errors_24h, c.errors_24h ? "à examiner ci-dessous" : "aucune"],
      ];
      const ul = $("h-stats"); ul.innerHTML = "";
      rows.forEach(([t, n, sub]) => { const li = el("li"); li.appendChild(el("strong", "", String(n))); li.appendChild(el("span", "", t)); if (sub) li.appendChild(el("small", "", sub)); ul.appendChild(li); });
      const us = $("h-usage"); us.innerHTML = "";
      if (!h.usage.length) us.appendChild(el("li", "hint", "Aucune écriture enregistrée pour l'instant."));
      h.usage.forEach((x) => us.appendChild(el("li", "", x.day + " · " + num(x.mutations) + " écriture" + (x.mutations > 1 ? "s" : "") + " · " + num(x.errors) + " erreur" + (x.errors > 1 ? "s" : ""))));
      const er = $("h-errors"); er.innerHTML = "";
      if (!h.errors.length) er.appendChild(el("li", "hint", "Aucune erreur enregistrée."));
      h.errors.forEach((x) => er.appendChild(el("li", "", fmt(x.at) + " · " + x.method + " " + x.path + " · " + x.message)));
      const L = h.limits;
      $("h-limits").textContent = "Limites du plan gratuit de Cloudflare : " + num(L.requests_per_day) + " requêtes par jour (Workers), " + num(L.rows_read_per_day) + " lignes lues et " +
        num(L.rows_written_per_day) + " lignes écrites par jour (D1), " + L.storage_gb + " Go de stockage. Au-delà, les requêtes de la base échouent jusqu'à minuit UTC (Cloudflare envoie un e-mail). " +
        "L'usage exact se lit dans le tableau de bord Cloudflare : D1, puis Metrics ; ici, seules les écritures et les erreurs de ce site sont comptées.";
    } catch (e) { $("h-limits").textContent = e.message; }
  }
  $("h-refresh").addEventListener("click", loadHealth);

  /* ---------------------------------------------------------------- onglets et démarrage */
  const tabs = { bind: $("t-bind"), users: $("t-users"), log: $("t-log"), health: $("t-health") }, panels = { bind: $("p-bind"), users: $("p-users"), log: $("p-log"), health: $("p-health") };
  function select(which) {
    Object.keys(tabs).forEach((k) => { tabs[k].setAttribute("aria-selected", String(k === which)); panels[k].hidden = k !== which; });
    if (which === "log") loadLog();
    if (which === "health") loadHealth();
    if (which === "users") loadUsers(state.users.page);
  }
  Object.keys(tabs).forEach((k) => tabs[k].addEventListener("click", () => select(k)));
  let timer;
  const debounce = (fn) => () => { clearTimeout(timer); timer = setTimeout(fn, 300); };
  $("f-source").addEventListener("change", () => loadBind(1));
  $("f-user").addEventListener("change", () => { state.user = ""; showChip(""); loadBind(1); });
  $("f-q").addEventListener("input", debounce(() => loadBind(1)));
  $("u-q").addEventListener("input", debounce(() => loadUsers(1)));

  (async function start() {
    const gate = $("adm-gate");
    let me;
    try { me = await api("/api/me"); } catch (e) { gate.textContent = "L'administration n'est disponible que sur l'adresse Cloudflare du site."; return; }
    if (!me.user) { gate.textContent = ""; gate.appendChild(document.createTextNode("Connecte-toi avec Discord pour accéder à l'administration. ")); const a = el("a", "link", "Se connecter"); a.href = "/api/auth/login"; gate.appendChild(a); return; }
    if (!me.user.admin) { gate.textContent = "Accès refusé : ce compte n'est pas administrateur."; return; }
    gate.hidden = true; $("adm-app").hidden = false; $("adm-tabs").hidden = false;
    loadStats(); loadBind(1);
  })();
})();
