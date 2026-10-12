// Bindrunes du compte connecté : liste, enregistrement (création ou mise à jour par nom), suppression.
import { privateJson } from "./lib/http.js";
import { sessionUser, sameOrigin, randomToken } from "./lib/auth.js";
import { validateBindrune, cleanName } from "./lib/validate.js";

const MAX_BODY = 4096;
const MAX_PER_USER = 100;

export async function listMine(request, env) {
  const user = await sessionUser(request, env);
  if (!user) return privateJson({ error: "Non connecté." }, 401);
  const rows = await env.DB.prepare("SELECT id, name, data, created_at, updated_at FROM bindrunes WHERE user_id = ? ORDER BY updated_at DESC").bind(user.id).all();
  const items = [];
  (rows.results || []).forEach((r) => {
    let d = null;
    try { d = validateBindrune(JSON.parse(r.data)); } catch (e) { /* ligne illisible : ignorée */ }
    if (d) items.push({ id: r.id, name: r.name, d, created_at: r.created_at, updated_at: r.updated_at });
  });
  return privateJson({ items });
}

export async function saveMine(request, env) {
  if (!sameOrigin(request)) return privateJson({ error: "Origine refusée." }, 403);
  const user = await sessionUser(request, env);
  if (!user) return privateJson({ error: "Non connecté." }, 401);

  const text = await request.text();
  if (text.length > MAX_BODY) return privateJson({ error: "Données trop volumineuses." }, 413);
  let body;
  try { body = JSON.parse(text); } catch (e) { return privateJson({ error: "JSON invalide." }, 400); }
  const name = cleanName(body && body.name), d = validateBindrune(body && body.d);
  if (!name || !d) return privateJson({ error: "Bindrune invalide." }, 400);

  const key = name.toLowerCase(), now = Date.now(), data = JSON.stringify(d);
  const existing = await env.DB.prepare("SELECT id FROM bindrunes WHERE user_id = ? AND name_key = ?").bind(user.id, key).first();
  if (existing) {
    await env.DB.prepare("UPDATE bindrunes SET name = ?, data = ?, updated_at = ? WHERE id = ? AND user_id = ?").bind(name, data, now, existing.id, user.id).run();
    return privateJson({ id: existing.id, name, updated: true });
  }
  const count = await env.DB.prepare("SELECT COUNT(*) AS n FROM bindrunes WHERE user_id = ?").bind(user.id).first();
  if (count && count.n >= MAX_PER_USER) return privateJson({ error: "Limite de " + MAX_PER_USER + " bindrunes sur le compte atteinte." }, 409);
  const id = randomToken(12);
  await env.DB.prepare("INSERT INTO bindrunes (id, user_id, name, name_key, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, user.id, name, key, data, now, now).run();
  return privateJson({ id, name, updated: false }, 201);
}

export async function deleteMine(request, env, id) {
  if (!sameOrigin(request)) return privateJson({ error: "Origine refusée." }, 403);
  const user = await sessionUser(request, env);
  if (!user) return privateJson({ error: "Non connecté." }, 401);
  const res = await env.DB.prepare("DELETE FROM bindrunes WHERE id = ? AND user_id = ?").bind(id, user.id).run();
  const changes = res && res.meta ? res.meta.changes : 1;
  return changes ? privateJson({ ok: true }) : privateJson({ error: "Bindrune introuvable." }, 404);
}
