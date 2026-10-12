// Routes de l'API : /api/health, POST /api/codes, GET /api/codes/<code>.
// Retourne une Response, ou null si l'adresse n'est pas une route de l'API.
import { json, preflight, ipHash } from "./lib/http.js";
import { validateBindrune, cleanName } from "./lib/validate.js";
import { newCode, normalizeCode, formatCode } from "./lib/codes.js";

const MAX_BODY = 4096;          // octets : une bindrune de 6 runes en fait moins de 1 500
const RATE_PER_HOUR = 30;       // envois par empreinte d'adresse IP et par heure

const noDb = () => json({ error: "Base de données non configurée." }, 503);

async function createCode(request, env) {
  if (!env.DB) return noDb();
  const text = await request.text();
  if (text.length > MAX_BODY) return json({ error: "Données trop volumineuses." }, 413);
  let body;
  try { body = JSON.parse(text); } catch (e) { return json({ error: "JSON invalide." }, 400); }

  const name = cleanName(body && body.name), d = validateBindrune(body && body.d);
  if (!name || !d) return json({ error: "Bindrune invalide." }, 400);

  const ip = await ipHash(request, env), now = Date.now();
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM shared_bindrunes WHERE ip_hash = ? AND created_at > ?").bind(ip, now - 3600000).first();
  if (row && row.n >= RATE_PER_HOUR) return json({ error: "Trop d'envois : réessaie dans un moment." }, 429);

  for (let i = 0; i < 5; i++) {                       // collision de code : on retire un autre code
    const code = newCode();
    try {
      await env.DB.prepare("INSERT INTO shared_bindrunes (code, name, data, created_at, ip_hash) VALUES (?, ?, ?, ?, ?)")
        .bind(code, name, JSON.stringify(d), now, ip).run();
      return json({ code, display: formatCode(code) }, 201);
    } catch (e) {
      if (!/UNIQUE|constraint/i.test(String(e && e.message ? e.message : e))) throw e;
    }
  }
  return json({ error: "Impossible de générer un code." }, 500);
}

async function readCode(rawCode, env) {
  if (!env.DB) return noDb();
  const code = normalizeCode(rawCode);
  if (!code) return json({ error: "Code invalide." }, 400);
  const row = await env.DB.prepare("SELECT name, data FROM shared_bindrunes WHERE code = ?").bind(code).first();
  if (!row) return json({ error: "Code introuvable." }, 404);
  let d;
  try { d = validateBindrune(JSON.parse(row.data)); } catch (e) { d = null; }
  if (!d) return json({ error: "Données illisibles." }, 500);
  return json({ name: row.name, d }, 200, { "Cache-Control": "public, max-age=300" });   // un code ne change jamais
}

export async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "");
  if (path !== "/api" && !path.startsWith("/api/")) return null;
  const method = request.method;
  if (method === "OPTIONS") return preflight();

  try {
    if (path === "/api/health" && method === "GET") return json({ ok: true, db: !!env.DB });
    if (path === "/api/codes" && method === "POST") return await createCode(request, env);
    const m = path.match(/^\/api\/codes\/([^/]+)$/);
    if (m && method === "GET") return await readCode(decodeURIComponent(m[1]), env);
    if (path === "/api/health" || path === "/api/codes" || m) return json({ error: "Méthode non autorisée." }, 405);
    return json({ error: "Route inconnue." }, 404);
  } catch (e) {
    console.error("Erreur API :", e && e.stack ? e.stack : e);
    return json({ error: "Erreur du serveur." }, 500);
  }
}
