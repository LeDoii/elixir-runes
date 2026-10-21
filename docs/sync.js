/* Synchronisation des bindrunes avec le compte : logique pure (sans réseau ni navigateur), pour pouvoir la tester.
 *
 * « Mes bindrunes » est une seule liste. Hors connexion elle vit dans le navigateur ; connecté, elle est le reflet du compte :
 * tout ce qui s'y ajoute, change ou disparaît est envoyé au compte, et le compte y fait revenir ce qui lui est propre.
 *
 * Données : { name, description, tags (étiquettes ajoutées seulement), d } plus at (local) ou updated_at et id (compte).
 * `synced` garde, pour chaque nom (en minuscules), { id, sig, published } tels que vus lors de la dernière synchronisation. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Sync = factory();
})(typeof self !== "undefined" ? self : globalThis, function () {
  /** JSON canonique (clés triées) : deux données identiques ont la même signature quel que soit l'ordre des champs. */
  const canon = (v) => (v === null || typeof v !== "object" ? JSON.stringify(v) : Array.isArray(v) ? "[" + v.map(canon).join(",") + "]" : "{" + Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}");
  const key = (name) => String(name).trim().toLowerCase();
  const sig = (r) => canon([r.d, r.description || "", r.tags || []]);

  /**
   * Rapprochement complet (à la connexion, puis de temps en temps) : compare la liste locale, celle du compte et le dernier état connu.
   * Retourne { pull, push, drop, del, mark } :
   *  pull : enregistrements du compte à écrire en local ; push : enregistrements locaux à envoyer au compte ;
   *  drop : noms à retirer du local (supprimés ailleurs) ; del : { key, id } à supprimer sur le compte (supprimés ici) ;
   *  mark : { key, id, sig, published } déjà identiques des deux côtés.
   * Quand les deux côtés ont changé depuis la dernière fois (ou à la première connexion), le plus récent l'emporte.
   */
  function plan(local, remote, synced) {
    const out = { pull: [], push: [], drop: [], del: [], mark: [] };
    const L = {}, R = {};
    local.forEach((l) => { L[key(l.name)] = l; });
    remote.forEach((r) => { R[key(r.name)] = r; });
    Object.keys(R).forEach((k) => {
      const r = R[k], l = L[k], known = synced[k];
      if (!l) { if (known) out.del.push({ key: k, id: r.id }); else out.pull.push(r); return; }
      const sl = sig(l), sr = sig(r);
      if (sl === sr) { out.mark.push({ key: k, id: r.id, sig: sr, published: !!r.published }); return; }
      if (known && known.sig === sr) out.push.push(l);            // seul le local a changé
      else if (known && known.sig === sl) out.pull.push(r);       // seul le compte a changé
      else if ((l.at || 0) > (r.updated_at || 0)) out.push.push(l);   // conflit ou première connexion : le plus récent gagne
      else out.pull.push(r);
    });
    Object.keys(L).forEach((k) => { if (!R[k]) { if (synced[k]) out.drop.push(L[k].name); else out.push.push(L[k]); } });
    return out;
  }

  /** Changements locaux depuis la dernière synchronisation : à envoyer, et à supprimer sur le compte. */
  function diffPush(local, synced) {
    const push = [], seen = new Set();
    local.forEach((l) => { const k = key(l.name); seen.add(k); if (!synced[k] || synced[k].sig !== sig(l)) push.push(l); });
    const del = Object.keys(synced).filter((k) => !seen.has(k)).map((k) => ({ key: k, id: synced[k].id, name: synced[k].name || k, published: !!synced[k].published }));
    return { push, del };
  }
  return { canon, key, sig, plan, diffPush };
});
