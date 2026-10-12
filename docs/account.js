/* Compte : connexion Discord et bindrunes enregistrées en ligne (disponibles seulement sur l'hébergement Cloudflare). */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const B = window.Bindrunes;
  let state = { login: false, user: null };
  const say = (t) => { $("acc-msg").textContent = t; };

  async function api(path, options) {
    let r, j;
    try { r = await fetch(path, options); j = await r.json(); } catch (e) { throw new Error("Le serveur ne répond pas."); }
    if (!r.ok) throw new Error(j && j.error ? j.error : "Erreur " + r.status + ".");
    return j;
  }

  async function refresh() {
    try {
      const j = await api("/api/me");
      state = { login: !!j.login, user: j.user };
    } catch (e) { state = { login: false, user: null }; }      // pas d'API (GitHub Pages, local) : la section reste cachée
    render();
    B.rerender();
    if (state.user) loadOnline();
  }

  function render() {
    $("account").hidden = !state.login && !state.user;
    $("acc-out").hidden = !!state.user;
    $("acc-in").hidden = !state.user;
    if (state.user) $("acc-name").textContent = state.user.name;
    $("acc-admin").hidden = !(state.user && state.user.admin);
  }

  /* ---- bindrunes du compte */
  async function loadOnline() {
    const ul = $("acc-list");
    try {
      const j = await api("/api/my/bindrunes");
      ul.innerHTML = "";
      $("acc-empty").hidden = j.items.length > 0;
      j.items.forEach((it) => {
        const li = document.createElement("li"), pv = document.createElement("div"), info = document.createElement("div");
        const h = document.createElement("h4"), meta = document.createElement("p"), acts = document.createElement("div");
        li.className = "mcard"; pv.className = "mprev"; pv.innerHTML = B.previewSVG(it.d);
        h.textContent = it.name; meta.className = "meta"; acts.className = "macts";
        if (it.published) { const b = document.createElement("span"); b.className = "badge pub"; b.textContent = "publiée"; h.appendChild(b); }
        meta.textContent = B.runesLine(it.d) + " · " + Supports.get(it.d.s).label + " · " + new Date(it.updated_at).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
        action(acts, "Ouvrir dans le concepteur", () => window.dispatchEvent(new CustomEvent("bindrune:open", { detail: { name: it.name, description: it.description, d: it.d } })));
        action(acts, "Récupérer ici", () => {
          const added = B.importItems([{ name: it.name, description: it.description, d: it.d }]);
          say(added.length ? "« " + added[0].name + " » récupérée dans tes bindrunes de ce navigateur." : "Récupération impossible : stockage du navigateur indisponible.");
        });
        action(acts, "Supprimer", async () => {
          if (!confirm("Supprimer « " + it.name + " » de ton compte ? (Les copies de ce navigateur ne sont pas touchées.)")) return;
          try { await api("/api/my/bindrunes/" + encodeURIComponent(it.id), { method: "DELETE" }); say("« " + it.name + " » supprimée du compte."); loadOnline(); }
          catch (e) { say("Suppression impossible : " + e.message); }
        });
        if (it.published) action(acts, "Retirer de la galerie", () => setPublished(it.id, it.name, false));
        else action(acts, "Publier dans la galerie", () => setPublished(it.id, it.name, true));
        info.appendChild(h); info.appendChild(meta);
        if (it.description) { const dp = document.createElement("p"); dp.className = "desc"; dp.textContent = it.description; info.appendChild(dp); }
        info.appendChild(acts);
        li.appendChild(pv); li.appendChild(info); ul.appendChild(li);
      });
    } catch (e) { say("Impossible de lire ton compte : " + e.message); }
  }
  function action(parent, label, fn) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "act"; b.textContent = label; b.addEventListener("click", fn);
    parent.appendChild(b);
  }

  async function send(rec) {
    return api("/api/my/bindrunes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: rec.name, description: rec.description || "", d: rec.d }) });
  }
  async function upload(rec) {
    try {
      const j = await send(rec);
      say("« " + j.name + " » " + (j.updated ? "mise à jour sur ton compte." : "enregistrée sur ton compte."));
      loadOnline();
    } catch (e) { say("Envoi impossible : " + e.message); }
  }
  async function setPublished(id, name, published) {
    try {
      await api("/api/my/bindrunes/" + encodeURIComponent(id) + "/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ published }) });
      await loadOnline();
      say("« " + name + " » " + (published ? "publiée dans la galerie, créditée à ton nom d'affichage Discord." : "retirée de la galerie."));
    } catch (e) { say("Action impossible : " + e.message); }
  }
  /** Envoie la bindrune sur le compte (nom, description, tracé) puis la publie. */
  async function publish(rec) {
    try {
      const j = await send(rec);
      await setPublished(j.id, j.name, true);
    } catch (e) { say("Publication impossible : " + e.message); }
  }

  /* ---- boutons */
  $("acc-login").addEventListener("click", () => { location.href = "/api/auth/login"; });
  $("acc-logout").addEventListener("click", async () => {
    try { await api("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); } catch (e) { /* déjà déconnecté */ }
    say("Déconnecté.");
    refresh();
  });
  $("acc-delete").addEventListener("click", async () => {
    if (!confirm("Supprimer ton compte et toutes tes bindrunes en ligne ? Les copies de ce navigateur sont conservées. Cette action est définitive.")) return;
    try { await api("/api/me", { method: "DELETE" }); say("Compte et bindrunes en ligne supprimés."); refresh(); }
    catch (e) { say("Suppression impossible : " + e.message); }
  });

  /* ---- retour de Discord : /?login=ok|denied|error|banned */
  const MESSAGES = {
    ok: "Connecté avec Discord.",
    denied: "Connexion annulée.",
    error: "La connexion avec Discord a échoué. Réessaie dans un moment.",
    banned: "Ce compte ne peut pas se connecter.",
  };
  const q = new URLSearchParams(location.search).get("login");
  if (q && MESSAGES[q]) {
    history.replaceState(null, "", location.pathname + location.hash);
    say(MESSAGES[q]);
  }

  window.Account = { user: () => state.user, upload, publish, refresh };
  refresh();
})();
