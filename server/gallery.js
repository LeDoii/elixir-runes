// Galerie publique : lecture seule, sans cookie. Chaque bindrune porte le nom de son auteur (nom d'affichage Discord).
// Jamais d'identifiant Discord dans ces réponses. Les comptes bloqués et les bindrunes non publiées n'apparaissent pas.
import { json } from "./lib/http.js";
import { validateBindrune } from "./lib/validate.js";
import { like, intParam } from "./lib/sql.js";

const PAGE = 24;
const FROM = " FROM bindrunes b JOIN users u ON u.id = b.user_id WHERE b.published = 1 AND u.banned = 0";
const CACHE = { "Cache-Control": "public, max-age=30" };

function shape(r) {
  let d = null;
  try { d = validateBindrune(JSON.parse(r.data)); } catch (e) { /* ligne illisible : ignorée */ }
  if (!d) return null;
  return { id: r.id, name: r.name, description: r.description, d, author: r.global_name || r.username, published_at: r.published_at };
}

export async function listGallery(request, env) {
  if (!env.DB) return json({ error: "Base de données non configurée." }, 503);
  const q = new URL(request.url).searchParams, page = intParam(q.get("page"), 1, 1, 100000);
  const text = (q.get("q") || "").trim().slice(0, 60);
  const sort = q.get("sort") === "name" ? "b.name COLLATE NOCASE ASC, b.published_at DESC" : "b.published_at DESC, b.id";
  let where = "", binds = [];
  if (text) {
    where = " AND (b.name LIKE ? ESCAPE '\\' OR b.description LIKE ? ESCAPE '\\' OR u.global_name LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\')";
    binds = [like(text), like(text), like(text), like(text)];
  }
  const total = (await env.DB.prepare("SELECT COUNT(*) AS n" + FROM + where).bind(...binds).first()).n;
  const rows = await env.DB.prepare(
    "SELECT b.id, b.name, b.description, b.data, b.published_at, u.username, u.global_name" + FROM + where + " ORDER BY " + sort + " LIMIT ? OFFSET ?"
  ).bind(...binds, PAGE, (page - 1) * PAGE).all();
  return json({ items: (rows.results || []).map(shape).filter(Boolean), total, page, pages: Math.max(1, Math.ceil(total / PAGE)) }, 200, CACHE);
}

export async function getGalleryItem(id, env) {
  if (!env.DB) return json({ error: "Base de données non configurée." }, 503);
  const row = await env.DB.prepare("SELECT b.id, b.name, b.description, b.data, b.published_at, u.username, u.global_name" + FROM + " AND b.id = ?").bind(id).first();
  const item = row ? shape(row) : null;
  return item ? json(item, 200, CACHE) : json({ error: "Introuvable." }, 404);
}
