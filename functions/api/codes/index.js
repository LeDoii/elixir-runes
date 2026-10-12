// POST /api/codes : enregistre une bindrune et renvoie son code court.
import { json, preflight, ipHash } from "../../../server/lib/http.js";
import { validateBindrune, cleanName } from "../../../server/lib/validate.js";
import { newCode, formatCode } from "../../../server/lib/codes.js";

const MAX_BODY = 4096;          // octets : une bindrune de 6 runes en fait moins de 1 500
const RATE_PER_HOUR = 30;       // envois par empreinte d'adresse IP et par heure

export const onRequestOptions = () => preflight();

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: "Base de données non configurée." }, 503);

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
