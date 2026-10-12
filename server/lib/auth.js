// Sessions et cookies : jeton aléatoire dans un cookie HttpOnly, seule son empreinte SHA-256 est en base.
export const COOKIE_SESSION = "__Host-session";     // préfixe __Host- : Secure, Path=/, sans Domain
export const COOKIE_STATE = "__Host-oauth";
export const SESSION_DAYS = 30;

export function parseCookies(header) {
  const out = {};
  String(header || "").split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  });
  return out;
}

export function cookie(name, value, maxAge) {
  return name + "=" + value + "; Path=/; Secure; HttpOnly; SameSite=Lax" + (maxAge == null ? "" : "; Max-Age=" + maxAge);
}
export const clearCookie = (name) => cookie(name, "", 0);

export async function sha256Hex(text) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 32) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  let s = "";
  a.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Comparaison en temps constant de deux chaînes. */
export function safeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Utilisateur de la session en cours, ou null (pas de cookie, session expirée, compte banni). */
export async function sessionUser(request, env) {
  if (!env.DB) return null;
  const token = parseCookies(request.headers.get("Cookie"))[COOKIE_SESSION];
  if (!token || token.length > 100) return null;
  const row = await env.DB.prepare(
    "SELECT u.id, u.username, u.global_name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.banned = 0"
  ).bind(await sha256Hex(token), Date.now()).first();
  return row || null;
}

export const isAdmin = (user, env) => !!user && String(env.ADMIN_IDS || "").split(",").map((s) => s.trim()).filter(Boolean).includes(user.id);

/** Protection CSRF des requêtes qui modifient quelque chose : l'en-tête Origin doit être celui du site. */
export function sameOrigin(request) {
  const origin = request.headers.get("Origin");
  return !!origin && origin === new URL(request.url).origin;
}
