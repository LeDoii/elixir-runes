// Galerie publique : lecture seule, sans cookie. Chaque bindrune porte le nom de son auteur (nom d'affichage Discord).
// Jamais d'identifiant Discord dans ces réponses. Les comptes bloqués et les bindrunes non publiées n'apparaissent pas.
import { json } from "./lib/http.js";
import { validateBindrune } from "./lib/validate.js";
import { comboKey } from "./lib/combo.js";
import { sessionUser } from "./lib/auth.js";
import { like, intParam } from "./lib/sql.js";
import { normTag, parseTags, runesWithTag } from "./lib/tags.js";

const PAGE = 24;
const FROM = " FROM bindrunes b JOIN users u ON u.id = b.user_id WHERE b.published = 1 AND u.banned = 0";
const CACHE = { "Cache-Control": "public, max-age=30" };

function shape(r) {
  let d = null;
  try { d = validateBindrune(JSON.parse(r.data)); } catch (e) { /* ligne illisible : ignorée */ }
  if (!d) return null;
  return { id: r.id, name: r.name, description: r.description, tags: parseTags(r.tags), d, author: r.global_name || r.username, published_at: r.published_at };
}

export async function listGallery(request, env) {
  if (!env.DB) return json({ error: "Base de données non configurée." }, 503);
  const q = new URL(request.url).searchParams, page = intParam(q.get("page"), 1, 1, 100000);
  const text = (q.get("q") || "").trim().slice(0, 60);
  const sort = q.get("sort") === "name" ? "b.name COLLATE NOCASE ASC, b.published_at DESC" : "b.published_at DESC, b.id";
  let where = "", binds = [];
  if (text) {
    where = " AND (b.name LIKE ? ESCAPE '\\' OR b.description LIKE ? ESCAPE '\\' OR u.global_name LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\'" +
      " OR EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(b.tags) THEN b.tags ELSE '[]' END) WHERE value LIKE ? ESCAPE '\\'))";
    binds = [like(text), like(text), like(text), like(text), like(text)];
  }
  // Filtre par étiquette : étiquette choisie ou étiquette verrouillée d'une des runes de la bindrune.
  const tag = normTag(q.get("tag"));
  if (tag) {
    const runes = runesWithTag(tag);
    where += " AND (EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(b.tags) THEN b.tags ELSE '[]' END) WHERE value = ?)" +
      (runes.length ? " OR EXISTS (SELECT 1 FROM json_each(CASE WHEN json_valid(b.data) THEN b.data ELSE '{}' END, '$.r') WHERE json_extract(value, '$.n') IN (" + runes.map(() => "?").join(",") + "))" : "") + ")";
    binds.push(tag, ...runes);
  }
  const total = (await env.DB.prepare("SELECT COUNT(*) AS n" + FROM + where).bind(...binds).first()).n;
  const rows = await env.DB.prepare(
    "SELECT b.id, b.name, b.description, b.tags, b.data, b.published_at, u.username, u.global_name" + FROM + where + " ORDER BY " + sort + " LIMIT ? OFFSET ?"
  ).bind(...binds, PAGE, (page - 1) * PAGE).all();
  return json({ items: (rows.results || []).map(shape).filter(Boolean), total, page, pages: Math.max(1, Math.ceil(total / PAGE)) }, 200, CACHE);
}

export async function getGalleryItem(id, env) {
  if (!env.DB) return json({ error: "Base de données non configurée." }, 503);
  const row = await env.DB.prepare("SELECT b.id, b.name, b.description, b.tags, b.data, b.published_at, u.username, u.global_name" + FROM + " AND b.id = ?").bind(id).first();
  const item = row ? shape(row) : null;
  return item ? json(item, 200, CACHE) : json({ error: "Introuvable." }, 404);
}

/** Remplit l'empreinte des lignes qui n'en ont pas encore (enregistrées avant la migration 0005). */
async function backfillCombos(env) {
  const rows = await env.DB.prepare("SELECT id, data FROM bindrunes WHERE combo IS NULL LIMIT 100").all();
  for (const r of rows.results || []) {
    let combo = "";                                                      // chaîne vide : ligne illisible, on ne la retente pas
    try { const d = validateBindrune(JSON.parse(r.data)); if (d) combo = comboKey(d); } catch (e) { /* ignorée */ }
    await env.DB.prepare("UPDATE bindrunes SET combo = ? WHERE id = ?").bind(combo, r.id).run();
  }
}

/**
 * POST /api/combo { d } : cette combinaison de runes existe-t-elle déjà ? Réponse seulement informative.
 * Retourne les bindrunes publiées dans la galerie (publiques) et, si l'appelant est connecté, les siennes.
 * Les bindrunes privées des autres ne sont jamais révélées.
 */
export async function checkCombo(request, env) {
  if (!env.DB) return json({ error: "Base de données non configurée." }, 503);
  const text = await request.text();
  if (text.length > 4096) return json({ error: "Données trop volumineuses." }, 413);
  let body;
  try { body = JSON.parse(text); } catch (e) { return json({ error: "JSON invalide." }, 400); }
  const d = validateBindrune(body && body.d);
  if (!d) return json({ error: "Bindrune invalide." }, 400);

  await backfillCombos(env);
  const key = comboKey(d), user = await sessionUser(request, env);
  const pub = await env.DB.prepare(
    "SELECT b.id, b.name, b.user_id, u.username, u.global_name FROM bindrunes b JOIN users u ON u.id = b.user_id " +
    "WHERE b.combo = ? AND b.published = 1 AND u.banned = 0 ORDER BY b.published_at DESC LIMIT 5").bind(key).all();
  let mine = [];
  if (user) mine = (await env.DB.prepare("SELECT id, name, published FROM bindrunes WHERE user_id = ? AND combo = ? LIMIT 5").bind(user.id, key).all()).results || [];
  return json({
    gallery: (pub.results || []).map((r) => ({ id: r.id, name: r.name, author: r.global_name || r.username, own: !!user && r.user_id === user.id })),
    mine: mine.map((r) => ({ id: r.id, name: r.name, published: !!r.published })),
  });
}
