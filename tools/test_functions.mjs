// Tests du Worker (codes courts, connexion Discord, bindrunes du compte) avec une vraie base SQLite en mémoire
// qui reçoit les migrations, et un faux Discord. À lancer depuis SiteRunes/ : node tools/test_functions.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker from "../server/worker.js";
import { normalizeCode, newCode } from "../server/lib/codes.js";

/* ---------------------------------------------------------------- base D1 simulée (SQLite) */
function d1(sqlite) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => sqlite.prepare(sql).get(...args) || null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    run: async () => { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
  });
  return { prepare: (sql) => stmt(sql), batch: async (list) => { for (const s of list) await s.run(); return []; }, raw: sqlite };
}
function freshDb() {
  const sqlite = new DatabaseSync(":memory:");
  ["0001_init.sql", "0002_accounts.sql"].forEach((f) => sqlite.exec(readFileSync(new URL("../migrations/" + f, import.meta.url), "utf8")));
  return d1(sqlite);
}

/* ---------------------------------------------------------------- faux Discord */
let discord = { tokenOk: true, user: { id: "111111111111111111", username: "viktor", global_name: "Viktor" }, calls: [] };
globalThis.fetch = async (url, init) => {
  const u = String(url);
  discord.calls.push(u);
  if (u.endsWith("/api/oauth2/token")) return discord.tokenOk ? Response.json({ access_token: "tok" }) : new Response("{}", { status: 400 });
  if (u.endsWith("/api/users/@me")) return Response.json(discord.user);
  if (u.endsWith("/token/revoke")) return new Response("{}");
  throw new Error("appel inattendu : " + u);
};

/* ---------------------------------------------------------------- outils */
let failed = 0;
const check = (label, ok, extra = "") => { if (!ok) failed++; console.log((ok ? "ok   " : "ECHEC") + " " + label + (ok ? "" : " " + extra)); };
const ASSETS = { fetch: async () => new Response("fichier statique", { status: 200 }) };
const ORIGIN = "https://site.test";
const baseEnv = (over = {}) => Object.assign({ ASSETS, DB: freshDb(), DISCORD_CLIENT_ID: "cid", DISCORD_CLIENT_SECRET: "secret" }, over);
const call = (env, path, init = {}) => worker.fetch(new Request(ORIGIN + path, init), env);
const cookieOf = (res) => (res.headers.getSetCookie ? res.headers.getSetCookie() : []).map((c) => c.split(";")[0]).filter((c) => !/=$/.test(c)).join("; ");
const post = (env, path, body, headers = {}) => call(env, path, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers });
const same = (cookie) => ({ Origin: ORIGIN, Cookie: cookie });

async function loginAs(env, user) {
  if (user) discord.user = user;
  const start = await call(env, "/api/auth/login");
  const state = new URL(start.headers.get("Location")).searchParams.get("state");
  const res = await call(env, "/api/auth/callback?code=abc&state=" + state, { headers: { Cookie: cookieOf(start) } });
  return { start, res, cookie: cookieOf(res) };
}

const good = { name: "  Ma   création ", d: { r: [{ n: "Gebo", x: 44, y: 64, m: 1, c: "#3D5C8C" }, { n: "Mannaz", x: 44, y: 64, m: 1, c: "#7A4E7A" }], s: "pierre", t: 0, l: [[0, 1, 0, 2], [0, 1, 99, 0], [1, 1, 0, 0]] } };

/* ================================================================ codes courts (étape 1) */
{
  const env = baseEnv();
  let r = await post(env, "/api/codes", good, { "CF-Connecting-IP": "1.2.3.4" });
  let j = await r.json();
  check("POST valide : 201 et code de 8 caractères", r.status === 201 && /^[A-Z2-9]{8}$/.test(j.code) && /^.{4}-.{4}$/.test(j.display), JSON.stringify(j));
  r = await call(env, "/api/codes/" + j.display.toLowerCase());
  const got = await r.json();
  check("GET avec code en minuscules et tiret", r.status === 200 && got.name === "Ma création", JSON.stringify(got));
  check("liaisons invalides retirées, support gardé", JSON.stringify(got.d.l) === "[[0,1,0,2]]" && got.d.s === "pierre", JSON.stringify(got.d));
  check("code court anonyme : user_id nul", env.DB.raw.prepare("SELECT user_id FROM shared_bindrunes").get().user_id === null);
  check("code inconnu : 404", (await call(env, "/api/codes/ZZZZZZZZ")).status === 404);
  check("code mal formé : 400", (await call(env, "/api/codes/abc")).status === 400);
  check("code avec caractère interdit : 400", (await call(env, "/api/codes/ABCD-EFG0")).status === 400);
  check("rune inconnue : 400", (await post(env, "/api/codes", { name: "X", d: { r: [{ n: "Nope", x: 0, y: 0 }] } })).status === 400);
  check("nom de rune piégé (constructor) : 400", (await post(env, "/api/codes", { name: "X", d: { r: [{ n: "constructor", x: 0, y: 0 }] } })).status === 400);
  check("nom vide : 400", (await post(env, "/api/codes", { name: "   ", d: good.d })).status === 400);
  check("JSON invalide : 400", (await post(env, "/api/codes", "pas du json")).status === 400);
  check("trop volumineux : 413", (await post(env, "/api/codes", JSON.stringify({ name: "x", d: good.d, bourrage: "a".repeat(5000) }))).status === 413);
  check("sans base : 503", (await post({ ASSETS }, "/api/codes", good)).status === 503);

  const env2 = baseEnv();
  let last;
  for (let i = 0; i < 31; i++) last = await post(env2, "/api/codes", good, { "CF-Connecting-IP": "9.9.9.9" });
  check("31e envoi de la même adresse : 429", last.status === 429);
  check("une autre adresse n'est pas limitée", (await post(env2, "/api/codes", good, { "CF-Connecting-IP": "8.8.8.8" })).status === 201);
  check("l'adresse IP n'est jamais stockée", !JSON.stringify(env2.DB.raw.prepare("SELECT * FROM shared_bindrunes").all()).includes("9.9.9.9"));

  const env3 = baseEnv();
  let calls = 0;
  const realPrepare = env3.DB.prepare;
  env3.DB.prepare = (sql) => {
    const st = realPrepare(sql);
    if (!/INSERT INTO shared/.test(sql)) return st;
    return { bind: (...a) => ({ run: async () => { if (calls++ < 2) throw new Error("UNIQUE constraint failed"); return st.bind(...a).run(); } }) };
  };
  r = await post(env3, "/api/codes", good);
  check("collision de code : réessaie et réussit", r.status === 201 && calls === 3, "appels " + calls);

  check("normalizeCode refuse O, I, L, 0, 1", normalizeCode("ABCDEFG0") === null && normalizeCode("ABCDEFGI") === null && normalizeCode("ABCDEFGL") === null);
  const codes = new Set(Array.from({ length: 2000 }, () => newCode()));
  check("2000 codes tirés, tous valides et distincts", codes.size === 2000 && [...codes].every((c) => normalizeCode(c) === c));
  check("health", (await (await call(env, "/api/health")).json()).ok === true);
  check("hors API : fichiers statiques", (await (await call(env, "/index.html")).text()) === "fichier statique");
  check("GET /api/codes : 405", (await call(env, "/api/codes")).status === 405);
  r = await call(env, "/api/inconnue");
  check("route inconnue : 404 JSON", r.status === 404 && (await r.json()).error === "Route inconnue.");
  r = await call(env, "/api/codes", { method: "OPTIONS" });
  check("OPTIONS (CORS) sur l'API publique : 204", r.status === 204 && r.headers.get("Access-Control-Allow-Origin") === "*");
  const broken = baseEnv({ DB: { prepare() { throw new Error("boom"); } } });
  const quiet = console.error; console.error = () => {};
  r = await post(broken, "/api/codes", good);
  console.error = quiet;
  check("erreur interne : 500 JSON sans fuite", r.status === 500 && (await r.json()).error === "Erreur du serveur.");
}

/* ================================================================ connexion Discord (étape 2) */
{
  let r = await call(baseEnv({ DISCORD_CLIENT_ID: undefined }), "/api/auth/login");
  check("connexion non configurée : 503", r.status === 503);
  r = await call(baseEnv({ DISCORD_CLIENT_SECRET: undefined }), "/api/me");
  check("/api/me : login=false si non configurée", (await r.json()).login === false);

  const env = baseEnv({ ADMIN_IDS: "999999999999999999, 111111111111111111" });
  r = await call(env, "/api/me");
  let me = await r.json();
  check("/api/me anonyme : login=true, user=null", me.login === true && me.user === null);
  check("/api/me : jamais de CORS", r.headers.get("Access-Control-Allow-Origin") === null && /private/.test(r.headers.get("Cache-Control")));

  const start = await call(env, "/api/auth/login");
  const loc = new URL(start.headers.get("Location"));
  check("login : redirection vers Discord avec les bons paramètres",
    start.status === 302 && loc.origin === "https://discord.com" && loc.searchParams.get("client_id") === "cid" &&
    loc.searchParams.get("scope") === "identify" && loc.searchParams.get("redirect_uri") === ORIGIN + "/api/auth/callback" && loc.searchParams.get("state").length >= 16);
  const stateCookie = start.headers.getSetCookie()[0];
  check("cookie d'état : __Host-, Secure, HttpOnly, SameSite", /^__Host-oauth=/.test(stateCookie) && /Secure/.test(stateCookie) && /HttpOnly/.test(stateCookie) && /SameSite=Lax/.test(stateCookie));

  r = await call(env, "/api/auth/callback?code=abc&state=faux", { headers: { Cookie: cookieOf(start) } });
  check("callback : état différent refusé", r.headers.get("Location").startsWith("/?login=error"));
  r = await call(env, "/api/auth/callback?code=abc&state=" + loc.searchParams.get("state"));
  check("callback : sans cookie d'état refusé", r.headers.get("Location").startsWith("/?login=error"));
  r = await call(env, "/api/auth/callback?error=access_denied", { headers: { Cookie: cookieOf(start) } });
  check("callback : refus de l'utilisateur", r.headers.get("Location").startsWith("/?login=denied"));
  discord.tokenOk = false;
  r = await loginAs(env);
  check("callback : échec de l'échange de code", r.res.headers.get("Location").startsWith("/?login=error") && !r.cookie.includes("__Host-session"));
  discord.tokenOk = true;

  discord.calls = [];
  const a = await loginAs(env, { id: "111111111111111111", username: "viktor", global_name: "Viktor" });
  check("callback : connexion réussie", a.res.headers.get("Location") === "/?login=ok#bindrunes" && /__Host-session=/.test(a.cookie));
  const sessionCookie = a.res.headers.getSetCookie().find((c) => c.startsWith("__Host-session="));
  check("cookie de session : HttpOnly, Secure, SameSite=Lax, 30 jours", /HttpOnly/.test(sessionCookie) && /Secure/.test(sessionCookie) && /SameSite=Lax/.test(sessionCookie) && /Max-Age=2592000/.test(sessionCookie));
  check("jeton Discord révoqué après usage", discord.calls.some((u) => u.endsWith("/token/revoke")));
  const rowSession = env.DB.raw.prepare("SELECT token_hash FROM sessions").get();
  const rawToken = a.cookie.split("__Host-session=")[1].split(";")[0];
  check("seule l'empreinte du jeton est en base", rowSession.token_hash !== rawToken && rowSession.token_hash.length === 64);
  const userRow = env.DB.raw.prepare("SELECT * FROM users").get();
  check("compte créé : identifiant et pseudo seulement", userRow.id === "111111111111111111" && userRow.username === "viktor" && Object.keys(userRow).sort().join() === "banned,created_at,global_name,id,last_login,username");

  me = await (await call(env, "/api/me", { headers: { Cookie: a.cookie } })).json();
  check("/api/me connecté : nom et administrateur (ADMIN_IDS)", me.user.name === "Viktor" && me.user.admin === true);
  const b = await loginAs(env, { id: "222222222222222222", username: "autre", global_name: null });
  me = await (await call(env, "/api/me", { headers: { Cookie: b.cookie } })).json();
  check("autre compte : pseudo utilisé sans nom global, pas administrateur", me.user.name === "autre" && me.user.admin === false);

  /* ---- bindrunes du compte */
  r = await post(env, "/api/my/bindrunes", good, { Cookie: a.cookie });
  check("enregistrer sans Origin : 403 (CSRF)", r.status === 403);
  r = await post(env, "/api/my/bindrunes", good, { Origin: "https://pirate.test", Cookie: a.cookie });
  check("enregistrer avec une autre origine : 403", r.status === 403);
  r = await post(env, "/api/my/bindrunes", good, { Origin: ORIGIN });
  check("enregistrer sans connexion : 401", r.status === 401);
  r = await post(env, "/api/my/bindrunes", good, same(a.cookie));
  let j = await r.json();
  check("enregistrer : 201 et nom nettoyé", r.status === 201 && j.name === "Ma création" && j.updated === false, JSON.stringify(j));
  const myId = j.id;
  r = await post(env, "/api/my/bindrunes", { name: "MA CRÉATION", d: good.d }, same(a.cookie));
  j = await r.json();
  check("même nom (casse différente) : mise à jour, pas de doublon", r.status === 200 && j.updated === true && j.id === myId);
  r = await call(env, "/api/my/bindrunes", { headers: { Cookie: a.cookie } });
  j = await r.json();
  check("liste : une bindrune, données normalisées", j.items.length === 1 && j.items[0].d.l.length === 1, JSON.stringify(j));
  r = await call(env, "/api/my/bindrunes", { headers: { Cookie: b.cookie } });
  check("un autre compte ne voit pas ces bindrunes", (await r.json()).items.length === 0);
  r = await call(env, "/api/my/bindrunes/" + myId, { method: "DELETE", headers: same(b.cookie) });
  check("supprimer la bindrune d'un autre compte : 404", r.status === 404);
  check("la bindrune est toujours là", env.DB.raw.prepare("SELECT COUNT(*) n FROM bindrunes").get().n === 1);
  r = await post(env, "/api/my/bindrunes", { name: "x", d: { r: [{ n: "Nope", x: 0, y: 0 }] } }, same(a.cookie));
  check("bindrune invalide : 400", r.status === 400);
  r = await post(env, "/api/my/bindrunes", JSON.stringify({ name: "x", d: good.d, bourrage: "a".repeat(5000) }), same(a.cookie));
  check("trop volumineux : 413", r.status === 413);
  r = await call(env, "/api/my/bindrunes", { method: "OPTIONS" });
  check("OPTIONS sur le compte : pas de CORS", r.status === 204 && r.headers.get("Access-Control-Allow-Origin") === null);

  /* ---- code court rattaché au compte */
  r = await post(env, "/api/codes", good, { Cookie: a.cookie, "CF-Connecting-IP": "5.5.5.5" });
  const sc = await r.json();
  check("code court créé connecté : rattaché au compte", env.DB.raw.prepare("SELECT user_id FROM shared_bindrunes WHERE code = ?").get(sc.code).user_id === "111111111111111111");

  /* ---- limite par compte */
  for (let i = 0; i < 100; i++) await post(env, "/api/my/bindrunes", { name: "n" + i, d: good.d }, same(b.cookie));
  r = await post(env, "/api/my/bindrunes", { name: "de trop", d: good.d }, same(b.cookie));
  check("limite de 100 bindrunes par compte : 409 au 101e", r.status === 409);
  r = await post(env, "/api/my/bindrunes", { name: "n3", d: good.d }, same(b.cookie));
  check("mettre à jour une existante reste possible à la limite", r.status === 200);

  /* ---- suppression d'une bindrune, déconnexion */
  r = await call(env, "/api/my/bindrunes/" + myId, { method: "DELETE", headers: same(a.cookie) });
  check("supprimer sa bindrune", r.status === 200 && env.DB.raw.prepare("SELECT COUNT(*) n FROM bindrunes WHERE user_id = '111111111111111111'").get().n === 0);
  r = await post(env, "/api/auth/logout", "{}", { Cookie: a.cookie });
  check("déconnexion sans Origin : 403", r.status === 403);
  r = await post(env, "/api/auth/logout", "{}", same(a.cookie));
  check("déconnexion : cookie effacé et session supprimée", r.status === 200 && /Max-Age=0/.test(r.headers.getSetCookie()[0]));
  me = await (await call(env, "/api/me", { headers: { Cookie: a.cookie } })).json();
  check("après déconnexion, l'ancien cookie ne marche plus", me.user === null);

  /* ---- session expirée, compte banni */
  const c = await loginAs(env, { id: "333333333333333333", username: "expire", global_name: null });
  env.DB.raw.exec("UPDATE sessions SET expires_at = 1 WHERE user_id = '333333333333333333'");
  me = await (await call(env, "/api/me", { headers: { Cookie: c.cookie } })).json();
  check("session expirée ignorée", me.user === null);
  const d = await loginAs(env, { id: "444444444444444444", username: "banni", global_name: null });
  env.DB.raw.exec("UPDATE users SET banned = 1 WHERE id = '444444444444444444'");
  me = await (await call(env, "/api/me", { headers: { Cookie: d.cookie } })).json();
  check("compte banni : session ignorée", me.user === null);
  const d2 = await loginAs(env, { id: "444444444444444444", username: "banni", global_name: null });
  check("compte banni : connexion refusée", d2.res.headers.get("Location").startsWith("/?login=banned") && !d2.cookie.includes("__Host-session"));

  /* ---- suppression du compte */
  r = await call(env, "/api/me", { method: "DELETE", headers: { Cookie: b.cookie } });
  check("supprimer son compte sans Origin : 403", r.status === 403);
  const bCode = await (await post(env, "/api/codes", good, { Cookie: b.cookie, "CF-Connecting-IP": "6.6.6.6" })).json();
  r = await call(env, "/api/me", { method: "DELETE", headers: same(b.cookie) });
  check("supprimer son compte : bindrunes, sessions et compte effacés",
    r.status === 200 && env.DB.raw.prepare("SELECT COUNT(*) n FROM bindrunes WHERE user_id = '222222222222222222'").get().n === 0 &&
    env.DB.raw.prepare("SELECT COUNT(*) n FROM users WHERE id = '222222222222222222'").get().n === 0 &&
    env.DB.raw.prepare("SELECT COUNT(*) n FROM sessions WHERE user_id = '222222222222222222'").get().n === 0);
  check("ses codes courts restent valables mais détachés du compte",
    env.DB.raw.prepare("SELECT user_id FROM shared_bindrunes WHERE code = ?").get(bCode.code).user_id === null);
}

console.log(failed ? "\n" + failed + " échec(s)" : "\nTout est bon");
process.exit(failed ? 1 : 0);
