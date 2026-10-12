// Suivi du site : erreurs du serveur et compteurs journaliers. Tout est « au mieux » : si la base ne répond pas
// (quota atteint, panne), on ne masque jamais l'erreur d'origine et on n'en ajoute pas.
export const KEEP_ERRORS = 200;
const day = () => new Date().toISOString().slice(0, 10);

/** Message lisible (jamais d'objet interne, 300 caractères au plus). */
export const errorText = (e) => String(e && e.message ? e.message : e).replace(/\s+/g, " ").slice(0, 300);

export async function recordError(env, request, err) {
  if (!env.DB) return;
  try {
    const url = new URL(request.url);
    await env.DB.prepare("INSERT INTO error_log (at, method, path, message) VALUES (?, ?, ?, ?)").bind(Date.now(), request.method, url.pathname.slice(0, 120), errorText(err)).run();
    await env.DB.prepare("DELETE FROM error_log WHERE id <= (SELECT id FROM error_log ORDER BY id DESC LIMIT 1 OFFSET ?)").bind(KEEP_ERRORS).run();
    await env.DB.prepare("INSERT INTO usage_daily (day, errors) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET errors = errors + 1").bind(day()).run();
  } catch (e) { /* la base elle-même est en cause : rien de plus à faire */ }
}

/** Une écriture réussie de plus aujourd'hui (enregistrement, publication, suppression, code court…). */
export async function recordMutation(env) {
  if (!env.DB) return;
  try { await env.DB.prepare("INSERT INTO usage_daily (day, mutations) VALUES (?, 1) ON CONFLICT(day) DO UPDATE SET mutations = mutations + 1").bind(day()).run(); }
  catch (e) { /* au mieux */ }
}
