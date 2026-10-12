// Réponses JSON, CORS (lecture et envoi sans cookie : l'API est ouverte), empreinte de l'adresse IP.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, CORS, extra),
  });
}

export const preflight = () => new Response(null, { status: 204, headers: CORS });

/** Empreinte (SHA-256 salée) de l'adresse IP : sert à limiter les envois, l'adresse elle-même n'est jamais stockée. */
export async function ipHash(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "inconnue";
  const data = new TextEncoder().encode(ip + "|" + (env.IP_SALT || "elixir-runes"));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].slice(0, 16).map((b) => b.toString(16).padStart(2, "0")).join("");
}
