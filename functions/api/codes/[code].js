// GET /api/codes/ABCD-EF23 : renvoie { name, d } pour un code court.
import { json, preflight } from "../../../server/lib/http.js";
import { normalizeCode } from "../../../server/lib/codes.js";
import { validateBindrune } from "../../../server/lib/validate.js";

export const onRequestOptions = () => preflight();

export async function onRequestGet({ params, env }) {
  if (!env.DB) return json({ error: "Base de données non configurée." }, 503);
  const code = normalizeCode(params.code);
  if (!code) return json({ error: "Code invalide." }, 400);

  const row = await env.DB.prepare("SELECT name, data FROM shared_bindrunes WHERE code = ?").bind(code).first();
  if (!row) return json({ error: "Code introuvable." }, 404);
  let d;
  try { d = validateBindrune(JSON.parse(row.data)); } catch (e) { d = null; }
  if (!d) return json({ error: "Données illisibles." }, 500);
  return json({ name: row.name, d }, 200, { "Cache-Control": "public, max-age=300" });   // un code ne change jamais
}
