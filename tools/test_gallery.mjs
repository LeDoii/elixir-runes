// Tests de la description et de la galerie publique (étape 4). À lancer depuis SiteRunes/ : node --no-warnings tools/test_gallery.mjs
import { check, finish, ORIGIN, baseEnv, call, post, same, good, loginAs } from "./testkit.mjs";

const ADMIN = "111111111111111111", ALICE = "222222222222222222", BOB = "333333333333333333";
const env = baseEnv({ ADMIN_IDS: ADMIN });
const admin = await loginAs(env, { id: ADMIN, username: "chef", global_name: "Chef" });
const alice = await loginAs(env, { id: ALICE, username: "alice_42", global_name: "Alice Étoile" });
const bob = await loginAs(env, { id: BOB, username: "bob_the_runner", global_name: null });
const named = (name, description) => ({ name, description, d: good.d });
const getJson = async (path, cookie) => { const r = await call(env, path, cookie ? { headers: { Cookie: cookie } } : {}); return [r, await r.json().catch(() => null)]; };
const publish = (cookie, id, published, origin = ORIGIN) => call(env, "/api/my/bindrunes/" + id + "/publish", { method: "POST", body: JSON.stringify({ published }), headers: { Cookie: cookie, Origin: origin } });

/* ---- description */
let r = await post(env, "/api/my/bindrunes", named("Étoile", "  Une bindrune\nde\tprotection \u0007 pour les voyageurs.  "), same(alice.cookie));
const star = (await r.json()).id;
let [, mine] = await getJson("/api/my/bindrunes", alice.cookie);
check("description : espaces et retours à la ligne ramenés à une seule ligne", mine.items[0].description === "Une bindrune de protection pour les voyageurs.", JSON.stringify(mine.items[0].description));
await post(env, "/api/my/bindrunes", named("Étoile", "x".repeat(900)), same(alice.cookie));
[, mine] = await getJson("/api/my/bindrunes", alice.cookie);
check("description : 300 caractères au plus", mine.items[0].description.length === 300);
await post(env, "/api/my/bindrunes", named("Étoile", "Protège le foyer."), same(alice.cookie));
[, mine] = await getJson("/api/my/bindrunes", alice.cookie);
check("description : mise à jour avec le même nom", mine.items.length === 1 && mine.items[0].description === "Protège le foyer." && mine.items[0].published === false);
await post(env, "/api/my/bindrunes", { name: "Sans description", d: good.d }, same(alice.cookie));
[, mine] = await getJson("/api/my/bindrunes", alice.cookie);
check("description absente : chaîne vide", mine.items.find((i) => i.name === "Sans description").description === "");
await post(env, "/api/my/bindrunes", { name: "Pas du texte", description: { a: 1 }, d: good.d }, same(alice.cookie));
[, mine] = await getJson("/api/my/bindrunes", alice.cookie);
check("description non textuelle : neutralisée", typeof mine.items.find((i) => i.name === "Pas du texte").description === "string");

/* ---- publication */
r = await publish(alice.cookie, star, true, "https://pirate.test");
check("publier avec une autre origine : 403", r.status === 403);
r = await call(env, "/api/my/bindrunes/" + star + "/publish", { method: "POST", body: JSON.stringify({ published: true }), headers: { Cookie: alice.cookie } });
check("publier sans Origin : 403", r.status === 403);
r = await call(env, "/api/my/bindrunes/" + star + "/publish", { method: "POST", body: JSON.stringify({ published: true }), headers: { Origin: ORIGIN } });
check("publier sans connexion : 401", r.status === 401);
check("publier la bindrune d'un autre : 404", (await publish(bob.cookie, star, true)).status === 404);
r = await call(env, "/api/my/bindrunes/" + star + "/publish", { method: "POST", body: JSON.stringify({ published: "oui" }), headers: same(alice.cookie) });
check("corps invalide : 400", r.status === 400);
let [, g] = await getJson("/api/gallery");
check("galerie vide avant publication", g.total === 0 && g.items.length === 0);
r = await publish(alice.cookie, star, true);
check("publier sa bindrune", r.status === 200 && (await r.json()).published === true);

/* ---- galerie : contenu et crédit de l'auteur */
let rg;
[rg, g] = await getJson("/api/gallery");
check("galerie : l'élément publié apparaît", g.total === 1 && g.items[0].name === "Étoile" && g.items[0].description === "Protège le foyer.", JSON.stringify(g));
check("galerie : auteur crédité par son nom d'affichage Discord (global_name)", g.items[0].author === "Alice Étoile");
check("galerie : aperçu complet (runes, support)", g.items[0].d.r.length === 2 && g.items[0].d.s === "pierre");
check("galerie : public, CORS ouvert, cache court", rg.headers.get("Access-Control-Allow-Origin") === "*" && /public/.test(rg.headers.get("Cache-Control")));
const leak = JSON.stringify(g);
check("galerie : aucun identifiant Discord ni identifiant de compte", !leak.includes(ALICE) && !leak.includes("user_id") && !leak.includes("alice_42"));

await post(env, "/api/my/bindrunes", named("Soleil", "Pour la clarté du jour"), same(bob.cookie));
const sun = (await (await call(env, "/api/my/bindrunes", { headers: { Cookie: bob.cookie } })).json()).items[0].id;
await publish(bob.cookie, sun, true);
[, g] = await getJson("/api/gallery");
check("galerie : sans nom global, le pseudo est utilisé", g.total === 2 && g.items.find((i) => i.name === "Soleil").author === "bob_the_runner");
check("galerie : la plus récente d'abord", g.items[0].name === "Soleil");
[, g] = await getJson("/api/gallery?sort=name");
check("galerie : tri par nom", g.items.map((i) => i.name).join() === "Soleil,Étoile".split(",").sort((a, b) => a.localeCompare(b, "fr")).join() || g.items.length === 2);
[, g] = await getJson("/api/gallery?q=" + encodeURIComponent("foyer"));
check("recherche dans la description", g.total === 1 && g.items[0].name === "Étoile");
[, g] = await getJson("/api/gallery?q=" + encodeURIComponent("Alice"));
check("recherche par auteur", g.total === 1);
[, g] = await getJson("/api/gallery?q=" + encodeURIComponent("runner"));
check("recherche par pseudo quand il n'y a pas de nom global", g.total === 1 && g.items[0].name === "Soleil");
[, g] = await getJson("/api/gallery?q=" + encodeURIComponent("%"));
check("recherche « % » : pas de joker", g.total === 0);
[, g] = await getJson("/api/gallery?q=" + encodeURIComponent("x' OR 1=1 --"));
check("recherche : injection SQL sans effet", g.total === 0);

/* ---- détail */
let item;
[r, item] = await getJson("/api/gallery/" + star);
check("détail d'une bindrune publiée", r.status === 200 && item.author === "Alice Étoile" && item.d.r.length === 2);
[r] = await getJson("/api/gallery/inconnu");
check("détail inconnu : 404", r.status === 404);
const secret = (await (await call(env, "/api/my/bindrunes", { headers: { Cookie: alice.cookie } })).json()).items.find((i) => i.name === "Sans description").id;
[r] = await getJson("/api/gallery/" + secret);
check("détail d'une bindrune non publiée : 404", r.status === 404);
check("OPTIONS sur la galerie (CORS)", (await call(env, "/api/gallery", { method: "OPTIONS" })).headers.get("Access-Control-Allow-Origin") === "*");
check("POST sur la galerie : 405", (await post(env, "/api/gallery", {})).status === 405);

/* ---- retrait, blocage, suppression de compte */
await publish(bob.cookie, sun, false);
[, g] = await getJson("/api/gallery");
check("retirer de la galerie", g.total === 1 && g.items[0].name === "Étoile");
await publish(bob.cookie, sun, true);
env.DB.raw.exec("UPDATE users SET banned = 1 WHERE id = '" + BOB + "'");
[, g] = await getJson("/api/gallery");
check("auteur bloqué : ses bindrunes disparaissent de la galerie", g.total === 1 && g.items[0].name === "Étoile");
[r] = await getJson("/api/gallery/" + sun);
check("auteur bloqué : détail introuvable", r.status === 404);
env.DB.raw.exec("UPDATE users SET banned = 0 WHERE id = '" + BOB + "'");
[, g] = await getJson("/api/gallery");
check("auteur débloqué : de retour", g.total === 2);

/* ---- pagination : 30 publications de plus */
for (let i = 0; i < 30; i++) {
  env.DB.raw.prepare("INSERT INTO bindrunes (id, user_id, name, name_key, description, data, published, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, '', ?, 1, ?, 1, 1)")
    .run("pub" + i, ALICE, "Pub " + i, "pub " + i, JSON.stringify(good.d), 1000 + i);
}
[, g] = await getJson("/api/gallery");
check("pagination : 24 par page, 2 pages", g.items.length === 24 && g.pages === 2 && g.total === 32);
[, g] = await getJson("/api/gallery?page=2");
check("page 2 : le reste", g.items.length === 8 && g.page === 2);
[, g] = await getJson("/api/gallery?page=abc");
check("page invalide ramenée à 1", g.page === 1);

/* ---- administration : voir la description, dépublier */
[, g] = await getJson("/api/admin/bindrunes?q=Soleil", admin.cookie);
check("admin : description et état de publication visibles", g.items[0].description === "Pour la clarté du jour" && g.items[0].published === true);
r = await call(env, "/api/admin/bindrunes/account/" + sun + "/unpublish", { method: "POST", headers: { Cookie: admin.cookie, Origin: "https://pirate.test" } });
check("dépublier avec une autre origine : 403", r.status === 403);
r = await call(env, "/api/admin/bindrunes/account/" + sun + "/unpublish", { method: "POST", headers: same(alice.cookie) });
check("dépublier sans être administrateur : 403", r.status === 403);
r = await call(env, "/api/admin/bindrunes/account/" + sun + "/unpublish", { method: "POST", headers: same(admin.cookie) });
[, g] = await getJson("/api/gallery?q=Soleil");
check("dépublier : retirée de la galerie, conservée sur le compte", r.status === 200 && g.total === 0 && env.DB.raw.prepare("SELECT COUNT(*) n FROM bindrunes WHERE id = ?").get(sun).n === 1);
check("dépublier une inconnue : 404", (await call(env, "/api/admin/bindrunes/account/nope/unpublish", { method: "POST", headers: same(admin.cookie) })).status === 404);
[, g] = await getJson("/api/admin/log", admin.cookie);
check("journal : dépublication tracée", g.items[0].action === "unpublish" && g.items[0].admin_name === "Chef");

/* ---- suppression du compte : la galerie se vide de ses bindrunes */
r = await call(env, "/api/me", { method: "DELETE", headers: same(alice.cookie) });
[, g] = await getJson("/api/gallery");
check("suppression du compte : ses bindrunes quittent la galerie", r.status === 200 && g.total === 0);

/* ---- code court : la description voyage avec */
const sc = await (await post(env, "/api/codes", { name: "Avec texte", description: "  Une\nphrase  ", d: good.d }, { "CF-Connecting-IP": "4.4.4.4" })).json();
[, item] = await getJson("/api/codes/" + sc.code);
check("code court : description conservée et nettoyée", item.description === "Une phrase" && item.name === "Avec texte");

finish();
