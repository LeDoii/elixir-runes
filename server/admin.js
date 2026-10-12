// Administration : tout est réservé aux identifiants Discord de ADMIN_IDS (vérifié à chaque requête, côté serveur).
import { privateJson } from "./lib/http.js";
import { sessionUser, isAdmin, sameOrigin } from "./lib/auth.js";
import { validateBindrune } from "./lib/validate.js";
import { like, intParam } from "./lib/sql.js";
import { parseTags } from "./lib/tags.js";

const PAGE = 30;
const EXPORT_MAX = 5000;
const DAY = 86400000;

/** Retourne { user } si l'appelant est administrateur, sinon { res } avec la réponse de refus. */
async function gate(request, env, mutates) {
  const user = await sessionUser(request, env);
  if (!user) return { res: privateJson({ error: "Non connecté." }, 401) };
  if (!isAdmin(user, env)) return { res: privateJson({ error: "Accès réservé aux administrateurs." }, 403) };
  if (mutates && !sameOrigin(request)) return { res: privateJson({ error: "Origine refusée." }, 403) };
  return { user };
}

const displayName = (u) => (u ? u.global_name || u.username : "");

async function logAction(env, admin, action, target, detail) {
  await env.DB.prepare("INSERT INTO admin_log (at, admin_id, admin_name, action, target, detail) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(Date.now(), admin.id, displayName(admin).slice(0, 64), action, String(target).slice(0, 80), String(detail || "").slice(0, 120)).run();
}

/* ---------------------------------------------------------------- bindrunes (comptes et codes courts) */
const UNION = "SELECT 'account' AS source, id, name, description, tags, published, data, user_id, created_at, updated_at AS at FROM bindrunes " +
  "UNION ALL SELECT 'code' AS source, code AS id, name, description, tags, 0 AS published, data, user_id, created_at, created_at AS at FROM shared_bindrunes";
const FROM = " FROM (" + UNION + ") x LEFT JOIN users u ON u.id = x.user_id";

function filters(q) {
  const where = [], binds = [];
  const source = q.get("source");
  if (source === "account" || source === "code") { where.push("x.source = ?"); binds.push(source); }
  const user = q.get("user");
  if (user === "anonymous") where.push("x.user_id IS NULL");
  else if (user && /^\d{1,25}$/.test(user)) { where.push("x.user_id = ?"); binds.push(user); }
  const text = (q.get("q") || "").trim().slice(0, 60);
  if (text) {
    where.push("(x.name LIKE ? ESCAPE '\\' OR u.username LIKE ? ESCAPE '\\' OR u.global_name LIKE ? ESCAPE '\\' OR x.id = ?)");
    binds.push(like(text), like(text), like(text), text.replace(/[\s-]+/g, "").toUpperCase());
  }
  return { sql: where.length ? " WHERE " + where.join(" AND ") : "", binds };
}

function shape(r) {
  let d = null;
  try { d = validateBindrune(JSON.parse(r.data)); } catch (e) { /* ligne illisible : affichée sans aperçu */ }
  return {
    source: r.source, id: r.id, name: r.name, description: r.description, tags: parseTags(r.tags), published: !!r.published, d, created_at: r.created_at, at: r.at,
    user: r.user_id ? { id: r.user_id, name: r.global_name || r.username || null } : null,
  };
}

async function listBindrunes(request, env) {
  const q = new URL(request.url).searchParams, f = filters(q), page = intParam(q.get("page"), 1, 1, 100000);
  const total = (await env.DB.prepare("SELECT COUNT(*) AS n" + FROM + f.sql).bind(...f.binds).first()).n;
  const rows = await env.DB.prepare("SELECT x.*, u.username, u.global_name" + FROM + f.sql + " ORDER BY x.at DESC, x.id LIMIT ? OFFSET ?")
    .bind(...f.binds, PAGE, (page - 1) * PAGE).all();
  return privateJson({ items: (rows.results || []).map(shape), total, page, pages: Math.max(1, Math.ceil(total / PAGE)) });
}

async function exportBindrunes(request, env) {
  const f = filters(new URL(request.url).searchParams);
  const rows = await env.DB.prepare("SELECT x.*, u.username, u.global_name" + FROM + f.sql + " ORDER BY x.at DESC, x.id LIMIT ?").bind(...f.binds, EXPORT_MAX).all();
  const body = JSON.stringify({ format: "elixir-runes-admin-export", exported_at: new Date().toISOString(), bindrunes: (rows.results || []).map(shape) }, null, 1);
  return new Response(body, { status: 200, headers: {
    "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store",
    "Content-Disposition": 'attachment; filename="bindrunes-export.json"',
  } });
}

async function deleteBindrune(env, admin, source, id) {
  const table = source === "account" ? "bindrunes" : "shared_bindrunes", col = source === "account" ? "id" : "code";
  const row = await env.DB.prepare("SELECT name, user_id FROM " + table + " WHERE " + col + " = ?").bind(id).first();
  if (!row) return privateJson({ error: "Introuvable." }, 404);
  await env.DB.prepare("DELETE FROM " + table + " WHERE " + col + " = ?").bind(id).run();
  await logAction(env, admin, source === "account" ? "delete_bindrune" : "delete_code", id, row.name + (row.user_id ? " (compte " + row.user_id + ")" : " (anonyme)"));
  return privateJson({ ok: true });
}

async function unpublish(env, admin, id) {
  const row = await env.DB.prepare("SELECT name, user_id, published FROM bindrunes WHERE id = ?").bind(id).first();
  if (!row) return privateJson({ error: "Introuvable." }, 404);
  await env.DB.prepare("UPDATE bindrunes SET published = 0 WHERE id = ?").bind(id).run();
  await logAction(env, admin, "unpublish", id, row.name + " (compte " + row.user_id + ")");
  return privateJson({ ok: true });
}

/* ---------------------------------------------------------------- utilisateurs */
async function listUsers(request, env) {
  const q = new URL(request.url).searchParams, page = intParam(q.get("page"), 1, 1, 100000);
  const text = (q.get("q") || "").trim().slice(0, 60);
  const where = text ? " WHERE u.username LIKE ? ESCAPE '\\' OR u.global_name LIKE ? ESCAPE '\\' OR u.id = ?" : "";
  const binds = text ? [like(text), like(text), text] : [];
  const total = (await env.DB.prepare("SELECT COUNT(*) AS n FROM users u" + where).bind(...binds).first()).n;
  const rows = await env.DB.prepare(
    "SELECT u.id, u.username, u.global_name, u.created_at, u.last_login, u.banned, " +
    "(SELECT COUNT(*) FROM bindrunes b WHERE b.user_id = u.id) AS bindrunes, (SELECT COUNT(*) FROM shared_bindrunes s WHERE s.user_id = u.id) AS codes " +
    "FROM users u" + where + " ORDER BY u.last_login DESC LIMIT ? OFFSET ?").bind(...binds, PAGE, (page - 1) * PAGE).all();
  const adminIds = String(env.ADMIN_IDS || "").split(",").map((s) => s.trim());
  return privateJson({
    items: (rows.results || []).map((r) => ({
      id: r.id, name: r.global_name || r.username, username: r.username, created_at: r.created_at, last_login: r.last_login,
      banned: !!r.banned, bindrunes: r.bindrunes, codes: r.codes, admin: adminIds.includes(r.id),
    })),
    total, page, pages: Math.max(1, Math.ceil(total / PAGE)),
  });
}

async function setBan(request, env, admin, id) {
  let body;
  try { body = JSON.parse(await request.text()); } catch (e) { return privateJson({ error: "JSON invalide." }, 400); }
  if (!body || typeof body.banned !== "boolean") return privateJson({ error: "Champ « banned » attendu." }, 400);
  if (String(env.ADMIN_IDS || "").split(",").map((s) => s.trim()).includes(id)) return privateJson({ error: "Impossible de bloquer un administrateur." }, 400);
  const user = await env.DB.prepare("SELECT id, username, global_name FROM users WHERE id = ?").bind(id).first();
  if (!user) return privateJson({ error: "Utilisateur introuvable." }, 404);
  await env.DB.prepare("UPDATE users SET banned = ? WHERE id = ?").bind(body.banned ? 1 : 0, id).run();
  if (body.banned) await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id).run();
  await logAction(env, admin, body.banned ? "ban" : "unban", id, displayName(user));
  return privateJson({ ok: true, banned: body.banned });
}

/* ---------------------------------------------------------------- statistiques et journal */
async function stats(env) {
  const now = Date.now(), week = now - 7 * DAY;
  const r = await env.DB.prepare(
    "SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM users WHERE banned = 1) AS banned, " +
    "(SELECT COUNT(*) FROM users WHERE last_login > ?) AS active_week, " +
    "(SELECT COUNT(*) FROM bindrunes) AS account_bindrunes, (SELECT COUNT(*) FROM bindrunes WHERE created_at > ?) AS account_week, " +
    "(SELECT COUNT(*) FROM shared_bindrunes) AS codes, (SELECT COUNT(*) FROM shared_bindrunes WHERE created_at > ?) AS codes_week, " +
    "(SELECT COUNT(*) FROM shared_bindrunes WHERE user_id IS NULL) AS codes_anonymous").bind(week, week, week).first();
  return privateJson(r);
}

async function logList(env) {
  const rows = await env.DB.prepare("SELECT id, at, admin_id, admin_name, action, target, detail FROM admin_log ORDER BY id DESC LIMIT 100").all();
  return privateJson({ items: rows.results || [] });
}

/** Routes /api/admin/* ; retourne une Response. */
export async function handleAdmin(request, env, path, method) {
  const mutates = method !== "GET";
  const g = await gate(request, env, mutates);
  if (g.res) return g.res;
  if (path === "/api/admin/stats" && method === "GET") return stats(env);
  if (path === "/api/admin/bindrunes" && method === "GET") return listBindrunes(request, env);
  if (path === "/api/admin/export" && method === "GET") return exportBindrunes(request, env);
  if (path === "/api/admin/users" && method === "GET") return listUsers(request, env);
  if (path === "/api/admin/log" && method === "GET") return logList(env);
  let m = path.match(/^\/api\/admin\/bindrunes\/account\/([A-Za-z0-9_-]{1,40})\/unpublish$/);
  if (m && method === "POST") return unpublish(env, g.user, m[1]);
  m = path.match(/^\/api\/admin\/bindrunes\/(account|code)\/([A-Za-z0-9_-]{1,40})$/);
  if (m && method === "DELETE") return deleteBindrune(env, g.user, m[1], m[2]);
  m = path.match(/^\/api\/admin\/users\/(\d{15,25})\/ban$/);
  if (m && method === "POST") return setBan(request, env, g.user, m[1]);
  return privateJson({ error: "Route inconnue." }, 404);
}
