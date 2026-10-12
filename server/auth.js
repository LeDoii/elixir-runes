// Connexion Discord (OAuth2, permission « identify » seulement) et gestion du compte.
import { privateJson, redirect } from "./lib/http.js";
import {
  COOKIE_SESSION, COOKIE_STATE, SESSION_DAYS, parseCookies, cookie, clearCookie,
  sha256Hex, randomToken, safeEqual, sessionUser, isAdmin, sameOrigin,
} from "./lib/auth.js";

const DISCORD = "https://discord.com";
const configured = (env) => !!(env.DB && env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET);
const redirectUri = (request) => new URL(request.url).origin + "/api/auth/callback";

/** GET /api/auth/login : envoie vers Discord, avec un « state » aléatoire gardé dans un cookie (protection CSRF). */
export async function login(request, env) {
  if (!configured(env)) return privateJson({ error: "Connexion Discord non configurée." }, 503);
  const state = randomToken(16);
  const url = new URL(DISCORD + "/oauth2/authorize");
  url.searchParams.set("client_id", env.DISCORD_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri(request));
  url.searchParams.set("scope", "identify");
  url.searchParams.set("state", state);
  return redirect(url.toString(), [cookie(COOKIE_STATE, state, 600)]);
}

/** GET /api/auth/callback : échange le code contre l'identité, ouvre la session, retourne sur le site. */
export async function callback(request, env) {
  const done = (status, cookies = []) => redirect("/?login=" + status + "#bindrunes", [clearCookie(COOKIE_STATE), ...cookies]);
  if (!configured(env)) return done("error");
  const q = new URL(request.url).searchParams;
  if (q.get("error")) return done("denied");
  const code = q.get("code"), state = q.get("state"), expected = parseCookies(request.headers.get("Cookie"))[COOKIE_STATE];
  if (!code || !state || !expected || !safeEqual(state, expected)) return done("error");

  let profile, accessToken;
  try {
    const tokenRes = await fetch(DISCORD + "/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code", code, redirect_uri: redirectUri(request),
      }),
    });
    if (!tokenRes.ok) return done("error");
    accessToken = (await tokenRes.json()).access_token;
    const meRes = await fetch(DISCORD + "/api/users/@me", { headers: { Authorization: "Bearer " + accessToken } });
    if (!meRes.ok) return done("error");
    profile = await meRes.json();
  } catch (e) { return done("error"); }
  if (!profile || !/^\d{15,25}$/.test(String(profile.id)) || typeof profile.username !== "string") return done("error");

  // Le jeton Discord ne sert qu'à lire l'identité : on le révoque tout de suite (au mieux, sans bloquer la connexion).
  try {
    await fetch(DISCORD + "/api/oauth2/token/revoke", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, token: accessToken }),
    });
  } catch (e) { /* ignoré */ }

  const now = Date.now(), id = String(profile.id);
  const username = profile.username.slice(0, 64), globalName = typeof profile.global_name === "string" ? profile.global_name.slice(0, 64) : null;
  await env.DB.prepare(
    "INSERT INTO users (id, username, global_name, created_at, last_login) VALUES (?, ?, ?, ?, ?) " +
    "ON CONFLICT(id) DO UPDATE SET username = excluded.username, global_name = excluded.global_name, last_login = excluded.last_login"
  ).bind(id, username, globalName, now, now).run();
  const user = await env.DB.prepare("SELECT banned FROM users WHERE id = ?").bind(id).first();
  if (user && user.banned) return done("banned");

  const token = randomToken(32);
  await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now).run();
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256Hex(token), id, now, now + SESSION_DAYS * 86400000).run();
  return done("ok", [cookie(COOKIE_SESSION, token, SESSION_DAYS * 86400)]);
}

/** GET /api/me : l'état de la connexion (aussi utilisé pour savoir si la connexion Discord est configurée). */
export async function me(request, env) {
  const user = await sessionUser(request, env);
  return privateJson({
    login: configured(env),
    user: user ? { id: user.id, name: user.global_name || user.username, admin: isAdmin(user, env) } : null,
  });
}

/** POST /api/auth/logout */
export async function logout(request, env) {
  if (!sameOrigin(request)) return privateJson({ error: "Origine refusée." }, 403);
  const token = parseCookies(request.headers.get("Cookie"))[COOKIE_SESSION];
  if (token && env.DB) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
  return privateJson({ ok: true }, 200, [clearCookie(COOKIE_SESSION)]);
}

/** DELETE /api/me : supprime le compte et toutes ses bindrunes ; les codes courts déjà partagés restent valables, détachés du compte. */
export async function deleteMe(request, env) {
  if (!sameOrigin(request)) return privateJson({ error: "Origine refusée." }, 403);
  const user = await sessionUser(request, env);
  if (!user) return privateJson({ error: "Non connecté." }, 401);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM bindrunes WHERE user_id = ?").bind(user.id),
    env.DB.prepare("UPDATE shared_bindrunes SET user_id = NULL WHERE user_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
    env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
  ]);
  return privateJson({ ok: true }, 200, [clearCookie(COOKIE_SESSION)]);
}
