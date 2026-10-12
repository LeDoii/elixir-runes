// Détection des combinaisons identiques : empreinte (parité navigateur / serveur) et route /api/combo.
// À lancer depuis SiteRunes/ : node --no-warnings tools/test_combo.mjs
import { createRequire } from "node:module";
import { check, finish, ORIGIN, baseEnv, call, post, same, good, loginAs } from "./testkit.mjs";
import { comboKey } from "../server/lib/combo.js";

const Combo = createRequire(import.meta.url)("../docs/combo.js");
const RUNES = ["Gebo", "Mannaz", "Ansuz", "Laguz", "Isa", "Wunjo"];
const design = (items, extra = {}) => Object.assign({ r: items.map(([n, x, y, m, c]) => ({ n, x, y, m: m === undefined ? 1 : m, c: c || "#3D5C8C" })), s: "bois", t: 0, l: [] }, extra);

/* ---- empreinte : ce qui compte, ce qui ne compte pas */
const A = design([["Gebo", 44, 64], ["Mannaz", 44, 64], ["Ansuz", 236, 64], ["Laguz", 236, 64]]);
const key = Combo.key(A);
check("déplacement d'ensemble : même combinaison", Combo.key(design([["Gebo", 144, 164], ["Mannaz", 144, 164], ["Ansuz", 336, 164], ["Laguz", 336, 164]])) === key);
check("ordre des runes : sans importance", Combo.key(design([["Laguz", 236, 64], ["Ansuz", 236, 64], ["Mannaz", 44, 64], ["Gebo", 44, 64]])) === key);
check("quelques pixels d'écart à la main : même combinaison", Combo.key(design([["Gebo", 47, 61], ["Mannaz", 41, 66], ["Ansuz", 240, 62], ["Laguz", 232, 67]])) === key);
check("un autre point d'ancrage (une demi-colonne) : combinaison différente", Combo.key(design([["Gebo", 44, 64], ["Mannaz", 44, 64], ["Ansuz", 260, 64], ["Laguz", 260, 64]])) !== key);
check("une demi-ligne de décalage : combinaison différente", Combo.key(design([["Gebo", 44, 64], ["Mannaz", 44, 80.5], ["Ansuz", 236, 64], ["Laguz", 236, 64]])) !== key);
check("une rune en moins : combinaison différente", Combo.key(design([["Gebo", 44, 64], ["Mannaz", 44, 64], ["Ansuz", 236, 64]])) !== key);
check("une rune différente : combinaison différente", Combo.key(design([["Gebo", 44, 64], ["Mannaz", 44, 64], ["Ansuz", 236, 64], ["Isa", 236, 64]])) !== key);
check("couleurs, aimant, support, strates, liaisons : ignorés", Combo.key(design([["Gebo", 44, 64, 0, "#8C3D3D"], ["Mannaz", 44, 64, 0, "#2B2B2E"], ["Ansuz", 236, 64], ["Laguz", 236, 64]], { s: "cristal", t: 1, l: [[0, 1, 0, 2]] })) === key);
check("même rune deux fois : empreinte stable quel que soit le repère", Combo.key(design([["Isa", 0, 0], ["Isa", 192, 0], ["Gebo", 96, 0]])) === Combo.key(design([["Gebo", 500, 7], ["Isa", 404, 7], ["Isa", 596, 7]])));
check("même rune deux fois : écarts différents, combinaisons différentes", Combo.key(design([["Isa", 0, 0], ["Isa", 192, 0]])) !== Combo.key(design([["Isa", 0, 0], ["Isa", 96, 0]])));
check("une seule rune : toutes positions équivalentes", Combo.key(design([["Gebo", 0, 0]])) === Combo.key(design([["Gebo", 300, 200]])));

/* ---- parité navigateur / serveur (100 combinaisons au hasard) */
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let ok = true;
for (let i = 0; i < 100; i++) {
  const n = 1 + Math.floor(rnd() * 6);
  const d = design(Array.from({ length: n }, () => [RUNES[Math.floor(rnd() * RUNES.length)], Math.round(rnd() * 600 * 10) / 10, Math.round(rnd() * 400 * 10) / 10]));
  if (Combo.key(d) !== comboKey(d)) { ok = false; break; }
}
check("parité : docs/combo.js et server/lib/combo.js donnent la même empreinte", ok);

/* ---- route /api/combo */
const ADMIN = "111111111111111111", ALICE = "222222222222222222", BOB = "333333333333333333";
const env = baseEnv({ ADMIN_IDS: ADMIN });
const alice = await loginAs(env, { id: ALICE, username: "alice", global_name: "Alice Étoile" });
const bob = await loginAs(env, { id: BOB, username: "bob", global_name: null });
const ask = async (d, cookie) => { const r = await post(env, "/api/combo", { d }, cookie ? { Cookie: cookie } : {}); return [r, await r.json().catch(() => null)]; };
const shifted = design([["Gebo", 144, 164], ["Mannaz", 144, 164], ["Ansuz", 336, 164], ["Laguz", 336, 164]]);

let [r, j] = await ask(A);
check("aucune bindrune : rien d'identique", r.status === 200 && j.gallery.length === 0 && j.mine.length === 0);
r = await post(env, "/api/my/bindrunes", { name: "Verbaflux d'Alice", d: A }, same(alice.cookie));
const aid = (await r.json()).id;
[, j] = await ask(shifted, bob.cookie);
check("une bindrune privée n'est jamais révélée à un autre", j.gallery.length === 0 && j.mine.length === 0);
[, j] = await ask(shifted, alice.cookie);
check("l'auteur retrouve la sienne, même non publiée", j.mine.length === 1 && j.mine[0].name === "Verbaflux d'Alice" && j.mine[0].published === false && j.gallery.length === 0);
await call(env, "/api/my/bindrunes/" + aid + "/publish", { method: "POST", body: JSON.stringify({ published: true }), headers: same(alice.cookie) });
[, j] = await ask(shifted, bob.cookie);
check("publiée : un autre est prévenu, avec le nom et l'auteur", j.gallery.length === 1 && j.gallery[0].author === "Alice Étoile" && j.gallery[0].own === false);
check("la réponse ne contient aucun identifiant de compte", !JSON.stringify(j).includes(ALICE) && !JSON.stringify(j).includes("user_id"));
[, j] = await ask(shifted);
check("sans connexion : la galerie est consultée quand même", j.gallery.length === 1 && j.mine.length === 0);
[, j] = await ask(shifted, alice.cookie);
check("l'auteur : sa bindrune publiée marquée « own »", j.gallery.length === 1 && j.gallery[0].own === true && j.mine.length === 1 && j.mine[0].id === j.gallery[0].id);
[, j] = await ask(design([["Gebo", 44, 64], ["Mannaz", 44, 64], ["Ansuz", 260, 64], ["Laguz", 260, 64]]), bob.cookie);
check("combinaison différente : rien", j.gallery.length === 0);
[, j] = await ask(design([["Gebo", 44, 64], ["Mannaz", 44, 64], ["Ansuz", 236, 64], ["Laguz", 236, 64]], { s: "cristal", t: 1 }), bob.cookie);
check("seul le support change : toujours la même combinaison", j.gallery.length === 1);

env.DB.raw.exec("UPDATE users SET banned = 1 WHERE id = '" + ALICE + "'");
[, j] = await ask(shifted, bob.cookie);
check("auteur bloqué : non signalé", j.gallery.length === 0);
env.DB.raw.exec("UPDATE users SET banned = 0 WHERE id = '" + ALICE + "'");

// ligne enregistrée avant la migration (empreinte vide) : remplie à la demande
env.DB.raw.prepare("INSERT INTO bindrunes (id, user_id, name, name_key, description, data, published, published_at, created_at, updated_at) VALUES ('old1', ?, 'Ancienne', 'ancienne', '', ?, 1, 5, 1, 1)")
  .run(BOB, JSON.stringify(design([["Isa", 0, 0], ["Wunjo", 192, 0]])));
[, j] = await ask(design([["Wunjo", 50, 9], ["Isa", -142, 9]]));
check("ancienne ligne sans empreinte : retrouvée (remplissage à la demande)", j.gallery.length === 1 && j.gallery[0].name === "Ancienne" && j.gallery[0].author === "bob");
check("l'empreinte est maintenant stockée", env.DB.raw.prepare("SELECT combo FROM bindrunes WHERE id = 'old1'").get().combo.length > 5);

// mise à jour d'une bindrune du compte : empreinte recalculée
await post(env, "/api/my/bindrunes", { name: "Verbaflux d'Alice", d: design([["Isa", 0, 0], ["Wunjo", 192, 0]]) }, same(alice.cookie));
[, j] = await ask(shifted, bob.cookie);
check("après modification de la bindrune : l'ancienne combinaison n'est plus signalée", j.gallery.length === 0);

/* ---- erreurs et accès */
r = (await ask({ r: [{ n: "Nope", x: 0, y: 0 }] }))[0];
check("combinaison invalide : 400", r.status === 400);
r = await post(env, "/api/combo", "pas du json");
check("JSON invalide : 400", r.status === 400);
r = await post(env, "/api/combo", JSON.stringify({ d: A, bourrage: "a".repeat(5000) }));
check("trop volumineux : 413", r.status === 413);
r = await call(env, "/api/combo", { method: "OPTIONS" });
check("OPTIONS (CORS) : 204", r.status === 204 && r.headers.get("Access-Control-Allow-Origin") === "*");
check("GET sur /api/combo : 405", (await call(env, "/api/combo")).status === 405);
check("sans base : 503", (await post({ ASSETS: baseEnv().ASSETS }, "/api/combo", { d: A })).status === 503);

finish();
