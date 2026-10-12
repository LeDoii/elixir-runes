// Tests de l'administration (étape 3). À lancer depuis SiteRunes/ : node --no-warnings tools/test_admin.mjs
import { check, finish, ORIGIN, baseEnv, call, post, same, good, loginAs } from "./testkit.mjs";

const ADMIN = "111111111111111111", USER = "222222222222222222", OTHER = "333333333333333333", GHOST = "555555555555555555";
const env = baseEnv({ ADMIN_IDS: ADMIN });
const admin = await loginAs(env, { id: ADMIN, username: "chef", global_name: "Chef" });
const user = await loginAs(env, { id: USER, username: "alice", global_name: "Alice" });
const other = await loginAs(env, { id: OTHER, username: "bob", global_name: null });
const get = async (cookie, path) => { const r = await call(env, path, { headers: { Cookie: cookie } }); return [r, await r.json().catch(() => null)]; };
const del = (cookie, path, origin = ORIGIN) => call(env, path, { method: "DELETE", headers: { Cookie: cookie, Origin: origin } });
const named = (name) => ({ name, d: good.d });

// des bindrunes : 2 pour alice, 1 pour bob, deux codes courts (un anonyme, un d'alice)
await post(env, "/api/my/bindrunes", named("Étoile d'Alice"), same(user.cookie));
await post(env, "/api/my/bindrunes", named("Lune d'Alice"), same(user.cookie));
await post(env, "/api/my/bindrunes", named("Soleil de Bob"), same(other.cookie));
const anon = await (await post(env, "/api/codes", named("Code anonyme 100% _vrai_"), { "CF-Connecting-IP": "7.7.7.7" })).json();
await post(env, "/api/codes", named("Code d'Alice"), { Cookie: user.cookie, "CF-Connecting-IP": "7.7.7.8" });

/* ---- accès */
for (const path of ["/api/admin/stats", "/api/admin/bindrunes", "/api/admin/users", "/api/admin/log", "/api/admin/export"]) {
  check("sans connexion : " + path + " refusé (401)", (await call(env, path)).status === 401);
  check("compte non administrateur : " + path + " refusé (403)", (await call(env, path, { headers: { Cookie: user.cookie } })).status === 403);
}
let [r, j] = await get(admin.cookie, "/api/admin/stats");
check("stats : comptes, bindrunes et codes", r.status === 200 && j.users === 3 && j.account_bindrunes === 3 && j.codes === 2 && j.codes_anonymous === 1 && j.banned === 0, JSON.stringify(j));
check("réponses d'admin : jamais de CORS, jamais de cache partagé", r.headers.get("Access-Control-Allow-Origin") === null && /private/.test(r.headers.get("Cache-Control")));

/* ---- liste, filtres, recherche */
[r, j] = await get(admin.cookie, "/api/admin/bindrunes");
check("liste : comptes et codes réunis (5 entrées)", j.total === 5 && j.items.length === 5 && j.pages === 1, String(j.total));
check("liste : auteur, source et aperçu", j.items.some((i) => i.source === "code" && i.user === null && i.d && i.d.r.length === 2) && j.items.some((i) => i.user && i.user.name === "Alice"));
[r, j] = await get(admin.cookie, "/api/admin/bindrunes?source=code");
check("filtre : codes courts seulement", j.total === 2 && j.items.every((i) => i.source === "code"));
[r, j] = await get(admin.cookie, "/api/admin/bindrunes?source=account");
check("filtre : bindrunes de comptes seulement", j.total === 3 && j.items.every((i) => i.source === "account"));
[r, j] = await get(admin.cookie, "/api/admin/bindrunes?user=" + USER);
check("filtre : par utilisateur", j.total === 3 && j.items.every((i) => i.user && i.user.id === USER));
[r, j] = await get(admin.cookie, "/api/admin/bindrunes?user=anonymous");
check("filtre : anonymes", j.total === 1 && j.items[0].user === null);
[r, j] = await get(admin.cookie, "/api/admin/bindrunes?q=alice");
check("recherche par pseudo", j.total === 3);
[r, j] = await get(admin.cookie, "/api/admin/bindrunes?q=soleil");
check("recherche par nom", j.total === 1 && j.items[0].name === "Soleil de Bob");
[r, j] = await get(admin.cookie, "/api/admin/bindrunes?q=" + encodeURIComponent("100% _vrai_"));
check("recherche : % et _ traités comme du texte", j.total === 1 && j.items[0].source === "code");
[r, j] = await get(admin.cookie, "/api/admin/bindrunes?q=" + encodeURIComponent("%"));
check("recherche « % » seul : pas de joker", j.total === 1);
[r, j] = await get(admin.cookie, "/api/admin/bindrunes?q=" + anon.display.toLowerCase());
check("recherche par code court", j.total === 1 && j.items[0].id === anon.code);
[r, j] = await get(admin.cookie, "/api/admin/bindrunes?q=" + encodeURIComponent("x' OR 1=1 --"));
check("recherche : injection SQL sans effet", r.status === 200 && j.total === 0);

/* ---- pagination : 40 bindrunes de plus pour bob */
for (let i = 0; i < 40; i++) {
  env.DB.raw.prepare("INSERT INTO bindrunes (id, user_id, name, name_key, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run("bulk" + i, OTHER, "bulk" + i, "bulk" + i, JSON.stringify(good.d), 1000 + i, 1000 + i);
}
[r, j] = await get(admin.cookie, "/api/admin/bindrunes");
check("pagination : 30 par page, 2 pages", j.items.length === 30 && j.pages === 2 && j.total === 45);
[r, j] = await get(admin.cookie, "/api/admin/bindrunes?page=2");
check("page 2 : le reste", j.items.length === 15 && j.page === 2);
[r, j] = await get(admin.cookie, "/api/admin/bindrunes?page=-5");
check("page invalide ramenée à 1", j.page === 1);

/* ---- utilisateurs */
[r, j] = await get(admin.cookie, "/api/admin/users");
const alice = j.items.find((u) => u.id === USER);
check("utilisateurs : 3 comptes, décomptes et marque administrateur", j.total === 3 && alice.bindrunes === 2 && alice.codes === 1 && j.items.find((u) => u.id === ADMIN).admin === true);
[r, j] = await get(admin.cookie, "/api/admin/users?q=ali");
check("utilisateurs : recherche", j.total === 1 && j.items[0].name === "Alice");

/* ---- suppression */
const star = (await (await call(env, "/api/admin/bindrunes?q=" + encodeURIComponent("Étoile"), { headers: { Cookie: admin.cookie } })).json()).items[0];
check("supprimer avec une autre origine : 403", (await del(admin.cookie, "/api/admin/bindrunes/account/" + star.id, "https://pirate.test")).status === 403);
check("supprimer sans Origin : 403", (await call(env, "/api/admin/bindrunes/account/" + star.id, { method: "DELETE", headers: { Cookie: admin.cookie } })).status === 403);
check("supprimer sans être administrateur : 403", (await del(user.cookie, "/api/admin/bindrunes/account/" + star.id)).status === 403);
r = await del(admin.cookie, "/api/admin/bindrunes/account/" + star.id);
check("supprimer une bindrune de compte", r.status === 200 && env.DB.raw.prepare("SELECT COUNT(*) n FROM bindrunes WHERE id = ?").get(star.id).n === 0);
check("supprimer deux fois : 404", (await del(admin.cookie, "/api/admin/bindrunes/account/" + star.id)).status === 404);
r = await del(admin.cookie, "/api/admin/bindrunes/code/" + anon.code);
check("supprimer un code court", r.status === 200 && (await call(env, "/api/codes/" + anon.code)).status === 404);
check("source inconnue : 404", (await del(admin.cookie, "/api/admin/bindrunes/autre/xyz")).status === 404);

/* ---- blocage */
check("bloquer sans Origin : 403", (await post(env, "/api/admin/users/" + USER + "/ban", { banned: true }, { Cookie: admin.cookie })).status === 403);
check("bloquer sans être administrateur : 403", (await post(env, "/api/admin/users/" + USER + "/ban", { banned: true }, same(user.cookie))).status === 403);
check("impossible de bloquer un administrateur", (await post(env, "/api/admin/users/" + ADMIN + "/ban", { banned: true }, same(admin.cookie))).status === 400);
check("corps invalide : 400", (await post(env, "/api/admin/users/" + USER + "/ban", { banned: "oui" }, same(admin.cookie))).status === 400);
check("bloquer un inconnu : 404", (await post(env, "/api/admin/users/" + GHOST + "/ban", { banned: true }, same(admin.cookie))).status === 404);
r = await post(env, "/api/admin/users/" + USER + "/ban", { banned: true }, same(admin.cookie));
check("bloquer un utilisateur", r.status === 200 && env.DB.raw.prepare("SELECT banned FROM users WHERE id = ?").get(USER).banned === 1);
[r, j] = await get(user.cookie, "/api/me");
check("utilisateur bloqué : session coupée", j.user === null);
const again = await loginAs(env, { id: USER, username: "alice", global_name: "Alice" });
check("utilisateur bloqué : connexion refusée", again.res.headers.get("Location").startsWith("/?login=banned"));
r = await post(env, "/api/admin/users/" + USER + "/ban", { banned: false }, same(admin.cookie));
const back = await loginAs(env, { id: USER, username: "alice", global_name: "Alice" });
check("débloquer : connexion de nouveau possible", r.status === 200 && back.res.headers.get("Location").startsWith("/?login=ok"));

/* ---- export, journal */
r = await call(env, "/api/admin/export", { headers: { Cookie: admin.cookie } });
const exp = await r.json();
check("export : fichier JSON des bindrunes", r.status === 200 && /attachment/.test(r.headers.get("Content-Disposition")) && exp.bindrunes.length === 43 && exp.format === "elixir-runes-admin-export", String(exp.bindrunes && exp.bindrunes.length));
[r, j] = await get(admin.cookie, "/api/admin/log");
const actions = j.items.map((x) => x.action).reverse();
check("journal : suppressions et blocages tracés dans l'ordre", JSON.stringify(actions) === JSON.stringify(["delete_bindrune", "delete_code", "ban", "unban"]), JSON.stringify(actions));
check("journal : qui a fait quoi", j.items.every((x) => x.admin_id === ADMIN && x.admin_name === "Chef") && j.items.find((x) => x.action === "ban").detail === "Alice");
[r, j] = await get(admin.cookie, "/api/admin/inconnue");
check("route d'admin inconnue : 404", r.status === 404);
r = await call(env, "/api/admin/bindrunes", { method: "OPTIONS" });
check("OPTIONS sur l'admin : pas de CORS", r.headers.get("Access-Control-Allow-Origin") === null);
const envNoAdmin = baseEnv({ ADMIN_IDS: undefined });
const nobody = await loginAs(envNoAdmin, { id: ADMIN, username: "chef", global_name: "Chef" });
check("sans ADMIN_IDS : personne n'est administrateur", (await call(envNoAdmin, "/api/admin/stats", { headers: { Cookie: nobody.cookie } })).status === 403);

finish();
