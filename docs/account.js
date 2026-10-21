/* Compte : connexion Discord et synchronisation des bindrunes (disponibles seulement sur l'hébergement Cloudflare).
 *
 * « Mes bindrunes » est une seule liste. Hors connexion, elle reste dans ce navigateur. Connecté, elle est le reflet du compte :
 * les bindrunes du navigateur partent sur le compte à la première connexion, chaque enregistrement, modification ou suppression
 * y est envoyé tout de suite, et ce qui vient du compte (autre appareil) revient dans la liste. La logique de comparaison est dans sync.js. */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const B = window.Bindrunes;
  let state = { login: false, user: null };
  let synced = {};                                            // nom en minuscules -> { id, sig, published, name } : dernier état connu du compte
  let queue = Promise.resolve(), pushTimer = null, lastPull = 0, failed = false;
  const syncKey = () => "runes-sync-" + (state.user ? state.user.id : "");

  /** Message à l'utilisateur : dans l'onglet « Mes bindrunes » et, pour l'atelier, par un événement (bulle de notification). */
  function say(t) { $("acc-msg").textContent = t; }
  function notify(t) { say(t); window.dispatchEvent(new CustomEvent("sync:message", { detail: { text: t } })); }

  async function api(path, options) {
    let r, j;
    try { r = await fetch(path, options); j = await r.json(); } catch (e) { throw new Error("Le serveur ne répond pas."); }
    if (!r.ok) throw new Error(j && j.error ? j.error : "Erreur " + r.status + ".");
    return j;
  }
  const post = (path, body) => api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  /* ---- état synchronisé, gardé dans le navigateur */
  function loadSynced() { try { synced = JSON.parse(localStorage.getItem(syncKey()) || "{}") || {}; } catch (e) { synced = {}; } }
  function saveSynced() { try { localStorage.setItem(syncKey(), JSON.stringify(synced)); } catch (e) { /* ignoré */ } }
  const toLocal = (it) => ({ name: it.name, description: it.description || "", tags: Tags.extras(it.d, it.tags), d: it.d, at: it.updated_at, id: it.id, published: !!it.published, updated_at: it.updated_at });
  const mark = (rec, id, published) => { synced[Sync.key(rec.name)] = { id, sig: Sync.sig({ d: rec.d, description: rec.description || "", tags: rec.tags || [] }), published: !!published, name: rec.name }; };

  /** Envoie une bindrune au compte (création ou mise à jour par nom). */
  async function sendOne(rec) {
    const j = await post("/api/my/bindrunes", { name: rec.name, description: rec.description || "", tags: rec.tags || [], d: rec.d });
    const old = synced[Sync.key(rec.name)];
    mark(rec, j.id, old ? old.published : false);
    return j;
  }
  const serial = (fn) => { queue = queue.then(fn, fn); return queue; };

  /** Envoie les changements locaux (ajouts, modifications, suppressions) au compte. */
  function pushChanges() {
    return serial(async () => {
      if (!state.user) return;
      const { push, del } = Sync.diffPush(B.list(), synced);
      if (!push.length && !del.length) return;
      try {
        for (const r of push) await sendOne(r);
        for (const x of del) {
          await api("/api/my/bindrunes/" + encodeURIComponent(x.id), { method: "DELETE" });
          delete synced[x.key];
          if (x.published) notify("« " + x.name + " » n'est plus dans la galerie : sa bindrune a été supprimée ou renommée.");
        }
        failed = false;
      } catch (e) { failed = true; notify("Synchronisation avec le compte impossible : " + e.message); }
      saveSynced();
      B.rerender();
    });
  }
  function schedulePush() { clearTimeout(pushTimer); if (state.user) pushTimer = setTimeout(pushChanges, 700); }

  /** Rapprochement complet avec le compte : à la connexion, au retour sur l'onglet, puis de temps en temps. */
  function reconcile() {
    return serial(async () => {
      if (!state.user) return;
      try {
        const remote = (await api("/api/my/bindrunes")).items.map(toLocal);
        const p = Sync.plan(B.list(), remote, synced);
        p.mark.forEach((m) => { synced[m.key] = { id: m.id, sig: m.sig, published: m.published, name: (remote.find((r) => Sync.key(r.name) === m.key) || {}).name }; });
        if (p.drop.length) { B.dropLocal(p.drop); p.drop.forEach((n) => delete synced[Sync.key(n)]); }
        if (p.pull.length) { B.applyRemote(p.pull); p.pull.forEach((r) => mark(r, r.id, r.published)); }
        for (const x of p.del) { await api("/api/my/bindrunes/" + encodeURIComponent(x.id), { method: "DELETE" }); delete synced[x.key]; }
        let sent = 0;
        for (const r of p.push) { await sendOne(r); sent++; }
        remote.forEach((r) => { const s = synced[Sync.key(r.name)]; if (s) { s.published = !!r.published; s.id = r.id; } });   // « publiée » vient toujours du compte
        saveSynced(); lastPull = Date.now(); failed = false;
        B.rerender();
        if (sent && !p.pull.length) say(sent + " bindrune" + (sent > 1 ? "s" : "") + " enregistrée" + (sent > 1 ? "s" : "") + " sur ton compte.");
        else if (p.pull.length || sent) say("Tes bindrunes sont à jour avec ton compte (" + B.list().length + ").");
      } catch (e) { failed = true; notify("Synchronisation avec le compte impossible : " + e.message); }
    });
  }

  async function refresh() {
    const before = state.user && state.user.id;
    try {
      const j = await api("/api/me");
      state = { login: !!j.login, user: j.user };
    } catch (e) { state = { login: false, user: null }; }      // pas d'API (GitHub Pages, local) : la section reste cachée
    render();
    B.rerender();
    if (state.user) { if (state.user.id !== before) loadSynced(); await reconcile(); }
  }

  function render() {
    $("account").hidden = !state.login && !state.user;
    $("acc-out").hidden = !!state.user;
    $("acc-in").hidden = !state.user;
    if (state.user) $("acc-name").textContent = state.user.name;
    $("acc-admin").hidden = !(state.user && state.user.admin);
  }

  /* ---- galerie : publier ou retirer une bindrune (elle est d'abord synchronisée, donc connue du compte) */
  const isPublished = (name) => !!(state.user && synced[Sync.key(name)] && synced[Sync.key(name)].published);
  async function setPublished(rec, published) {
    try {
      await pushChanges();
      const s = synced[Sync.key(rec.name)];
      if (!s) throw new Error("la bindrune n'est pas encore sur le compte.");
      await post("/api/my/bindrunes/" + encodeURIComponent(s.id) + "/publish", { published });
      s.published = published; saveSynced(); B.rerender();
      say("« " + rec.name + " » " + (published ? "publiée dans la galerie, créditée à ton nom d'affichage Discord." : "retirée de la galerie."));
    } catch (e) { say("Action impossible : " + e.message); }
  }
  const publish = async (rec) => { await setPublished(rec, true); const t = await B.duplicateNotice(rec.name, rec.d); if (t) say($("acc-msg").textContent + " " + t); };
  const unpublish = (rec) => setPublished(rec, false);

  /* ---- boutons */
  $("acc-login").addEventListener("click", () => { location.href = "/api/auth/login"; });
  $("acc-logout").addEventListener("click", async () => {
    await pushChanges();
    if (failed && !confirm("Certaines modifications n'ont pas pu être envoyées au compte. Elles seraient perdues en se déconnectant. Se déconnecter quand même ?")) return;
    try { await api("/api/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }); } catch (e) { /* déjà déconnecté */ }
    // la liste du navigateur reflétait le compte : elle est vidée (tout reste sur le compte et revient à la prochaine connexion)
    B.dropLocal(Object.keys(synced).map((k) => synced[k].name || k));
    try { localStorage.removeItem(syncKey()); } catch (e) { /* ignoré */ }
    synced = {};
    say("Déconnecté : les bindrunes de ton compte ont quitté ce navigateur ; elles reviendront à ta prochaine connexion.");
    state = { login: state.login, user: null }; refresh();
  });
  $("acc-delete").addEventListener("click", async () => {
    if (!confirm("Supprimer ton compte et toutes tes bindrunes en ligne ? Les bindrunes de ce navigateur restent ici, mais ne sont plus reliées à un compte. Cette action est définitive.")) return;
    try { await api("/api/me", { method: "DELETE" }); try { localStorage.removeItem(syncKey()); } catch (e) { /* ignoré */ } synced = {}; say("Compte et bindrunes en ligne supprimés."); refresh(); }
    catch (e) { say("Suppression impossible : " + e.message); }
  });

  /* ---- retour de Discord : /?login=ok|denied|error|banned */
  const MESSAGES = {
    ok: "Connecté avec Discord : tes bindrunes sont enregistrées sur ton compte.",
    denied: "Connexion annulée.",
    error: "La connexion avec Discord a échoué. Réessaie dans un moment.",
    banned: "Ce compte ne peut pas se connecter.",
  };
  const q = new URLSearchParams(location.search).get("login");
  if (q && MESSAGES[q]) {
    history.replaceState(null, "", location.pathname + location.hash);
    say(MESSAGES[q]);
  }

  B.onChange(schedulePush);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && state.user && Date.now() - lastPull > 30000) reconcile(); });
  window.addEventListener("pagehide", () => {                 // dernier envoi si une modification attend encore
    if (!state.user) return;
    Sync.diffPush(B.list(), synced).push.forEach((r) => { try { fetch("/api/my/bindrunes", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: r.name, description: r.description || "", tags: r.tags || [], d: r.d }) }); } catch (e) { /* ignoré */ } });
  });

  window.Account = { user: () => state.user, publish, unpublish, isPublished, refresh, flush: pushChanges };
  refresh();
})();
