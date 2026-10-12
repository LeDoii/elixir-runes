// Étiquettes des bindrunes : normalisation, parité navigateur / serveur, enregistrement, galerie, codes courts, administration.
// À lancer depuis SiteRunes/ : node --no-warnings tools/test_tags.mjs
import { createRequire } from "node:module";
import { check, finish, baseEnv, call, post, same, good, loginAs } from "./testkit.mjs";
import * as S from "../server/lib/tags.js";

const T = createRequire(import.meta.url)("../docs/tags.js");
const RUNES = Object.keys(S.RUNE_TAGS);

/* ---- normalisation */
check("minuscules, espaces et ponctuation nettoyés", T.norm("  Épreuve !! ") === "épreuve");
check("tiret et apostrophe conservés", T.norm("Voyage-éclair") === "voyage-éclair" && T.norm("l'aube") === "l'aube");
check("trop courte : vide", T.norm("a") === "" && T.norm("  ") === "" && T.norm("!!") === "");
check("tronquée à 20 caractères", T.norm("a".repeat(40)).length === 20);
check("chiffres acceptés", T.norm("Saison 2") === "saison 2");
check("balises et symboles neutralisés", T.norm("<b>gras</b>") === "b gras b");
check("liste : doublons retirés, 6 au plus", JSON.stringify(T.clean(["A1", "a1", "Bb", "Cc", "Dd", "Ee", "Ff", "Gg", "Hh"])) === JSON.stringify(["a1", "bb", "cc", "dd", "ee", "ff"]));
check("liste non tableau : vide", T.clean("x").length === 0 && T.clean(null).length === 0 && T.clean({ a: 1 }).length === 0);
check("éléments non textuels ignorés", T.clean([{ a: 1 }, 12, "Paix"]).join() === "12,paix" || T.clean([{ a: 1 }, 12, "Paix"]).includes("paix"));

/* ---- étiquettes verrouillées */
check("24 runes, toutes avec au moins une étiquette", RUNES.length === 24 && RUNES.every((r) => S.RUNE_TAGS[r].length >= 1 && S.RUNE_TAGS[r].length <= 2));
check("chaque étiquette de rune est dans la liste imposée", RUNES.every((r) => T.RUNE_TAGS[r].every((t) => T.VOCAB.includes(t))));
check("toute la liste imposée sert à au moins une rune", T.VOCAB.every((v) => RUNES.some((r) => T.RUNE_TAGS[r].includes(v))));
check("liste imposée sans doublon", new Set(T.VOCAB.map(T.norm)).size === T.VOCAB.length);
check("verrouillées : union des runes, sans doublon", T.locked(["Algiz", "Thurisaz"]).join() === "protection,défense,force");
check("verrouillées : rune inconnue ignorée", T.locked(["Nope", "Mannaz"]).join() === "humanité");

/* ---- parité navigateur / serveur */
check("parité : mêmes étiquettes verrouillées", JSON.stringify(T.RUNE_TAGS) === JSON.stringify(S.RUNE_TAGS));
const samples = ["  Épreuve !! ", "a", "Saison 2", "<b>x</b>", "l'aube", "ÉVEIL", "x".repeat(50), "Éveiĺ", "-tiret-", "", null, 5];
check("parité : même normalisation", samples.every((s) => T.norm(s) === S.normTag(s)));
check("parité : même nettoyage de liste", JSON.stringify(T.clean(samples)) === JSON.stringify(S.cleanTags(samples)));
check("serveur : colonne illisible → liste vide", S.parseTags("pas du json").length === 0 && S.parseTags('["Paix","paix"]').join() === "paix");
check("serveur : runes portant une étiquette", S.runesWithTag("défense").join() === "Thurisaz,Algiz" && S.runesWithTag("inconnue").length === 0);

/* ---- compte : enregistrement et lecture */
const ALICE = "222222222222222222", BOB = "333333333333333333";
const env = baseEnv();
const alice = await loginAs(env, { id: ALICE, username: "alice", global_name: "Alice Étoile" });
const bob = await loginAs(env, { id: BOB, username: "bob", global_name: null });
const save = (user, name, tags, d = good.d) => post(env, "/api/my/bindrunes", { name, d, tags }, same(user.cookie));
const mineOf = async (user) => (await (await call(env, "/api/my/bindrunes", { headers: { Cookie: user.cookie } })).json()).items;
const publish = async (user, name) => { const id = (await mineOf(user)).find((i) => i.name === name).id; await call(env, "/api/my/bindrunes/" + id + "/publish", { method: "POST", body: JSON.stringify({ published: true }), headers: same(user.cookie) }); return id; };
const gal = async (qs) => (await call(env, "/api/gallery?" + qs)).json();

await save(alice, "Gebo et Mannaz", ["Protection", "  Voyage-éclair ", "protection", "x"]);
let items = await mineOf(alice);
check("enregistrement : étiquettes normalisées et sans doublon", items[0].tags.join() === "protection,voyage-éclair", JSON.stringify(items[0].tags));
await save(alice, "Gebo et Mannaz", "pas une liste");
check("étiquettes non liste : vide, enregistrement quand même accepté", (await mineOf(alice))[0].tags.length === 0);
await save(alice, "Sans étiquette", undefined);
check("étiquettes absentes : liste vide", (await mineOf(alice)).find((i) => i.name === "Sans étiquette").tags.length === 0);
await save(alice, "Gebo et Mannaz", ["a1", "b2", "c3", "d4", "e5", "f6", "g7", "h8"]);
check("6 étiquettes au plus", (await mineOf(alice))[0].tags.length === 6 || (await mineOf(alice)).find((i) => i.name === "Gebo et Mannaz").tags.length === 6);
await save(alice, "Gebo et Mannaz", ["Protection", "Voyage-éclair"]);
await publish(alice, "Gebo et Mannaz");

/* ---- galerie : filtre par étiquette, recherche */
await save(bob, "Isa seule", ["Mon projet"], { r: [{ n: "Isa", x: 44, y: 64, m: 1, c: "#3D5C8C" }], s: "bois", t: 0, l: [] });
await publish(bob, "Isa seule");
await save(bob, "Algiz seule", [], { r: [{ n: "Algiz", x: 44, y: 64, m: 1, c: "#3D5C8C" }], s: "bois", t: 0, l: [] });
await publish(bob, "Algiz seule");
let g = await gal("tag=protection");
check("filtre : étiquette choisie ET étiquette verrouillée d'une rune (Algiz)", g.total === 2 && g.items.map((i) => i.name).sort().join() === "Algiz seule,Gebo et Mannaz", JSON.stringify(g.items.map((i) => i.name)));
g = await gal("tag=" + encodeURIComponent("Voyage-éclair"));
check("filtre : étiquette libre (casse ignorée)", g.total === 1 && g.items[0].name === "Gebo et Mannaz");
g = await gal("tag=" + encodeURIComponent("mon projet"));
check("filtre : étiquette libre avec espace", g.total === 1 && g.items[0].name === "Isa seule");
g = await gal("tag=" + encodeURIComponent("Échange"));
check("filtre : étiquette verrouillée seule (Gebo → Échange)", g.total === 1 && g.items[0].name === "Gebo et Mannaz");
g = await gal("tag=patience");
check("filtre : Isa → Patience", g.total === 1 && g.items[0].name === "Isa seule");
check("filtre : étiquette inconnue → rien", (await gal("tag=zzz")).total === 0);
check("filtre vide ou invalide : ignoré", (await gal("tag=")).total === 3 && (await gal("tag=!")).total === 3);
check("filtre : injection SQL sans effet", (await gal("tag=" + encodeURIComponent("' OR 1=1 --"))).total === 0);
g = await gal("q=" + encodeURIComponent("projet"));
check("recherche texte : trouve aussi dans les étiquettes", g.total === 1 && g.items[0].name === "Isa seule");
g = await gal("q=" + encodeURIComponent("100%"));
check("recherche texte : % reste littéral", g.total === 0);
g = await gal("tag=protection&q=algiz");
check("filtre et recherche se combinent", g.total === 1 && g.items[0].name === "Algiz seule");
g = await gal("");
check("la galerie renvoie les étiquettes choisies (pas les verrouillées)", g.items.find((i) => i.name === "Gebo et Mannaz").tags.join() === "protection,voyage-éclair" && g.items.find((i) => i.name === "Algiz seule").tags.length === 0);
const id = (await mineOf(alice)).find((i) => i.name === "Gebo et Mannaz").id;
check("fiche d'une bindrune : étiquettes comprises", (await (await call(env, "/api/gallery/" + id)).json()).tags.join() === "protection,voyage-éclair");
check("aucune donnée de compte dans la réponse", !JSON.stringify(await gal("")).includes(ALICE));

/* ---- ligne ancienne (colonne par défaut) et colonne corrompue */
env.DB.raw.prepare("INSERT INTO bindrunes (id, user_id, name, name_key, description, data, published, published_at, created_at, updated_at) VALUES ('old2', ?, 'Vieille', 'vieille', '', ?, 1, 5, 1, 1)").run(BOB, JSON.stringify(good.d));
env.DB.raw.exec("UPDATE bindrunes SET tags = 'pas du json' WHERE id = 'old2'");
let r = await call(env, "/api/gallery?tag=protection");
check("colonne corrompue : la galerie répond quand même", r.status === 200);
env.DB.raw.exec("UPDATE bindrunes SET tags = '[]' WHERE id = 'old2'");
g = await gal("");
check("ancienne ligne : étiquettes vides", g.items.find((i) => i.name === "Vieille").tags.length === 0);

/* ---- codes courts */
const sc = await (await post(env, "/api/codes", { name: "Avec étiquettes", tags: ["Joie", "Mon projet", "joie"], d: good.d }, { "CF-Connecting-IP": "9.9.9.9" })).json();
const item = await (await call(env, "/api/codes/" + sc.code)).json();
check("code court : étiquettes conservées et nettoyées", item.tags.join() === "joie,mon projet", JSON.stringify(item.tags));
const sc2 = await (await post(env, "/api/codes", { name: "Sans", d: good.d }, { "CF-Connecting-IP": "9.9.9.9" })).json();
check("code court sans étiquette : liste vide", (await (await call(env, "/api/codes/" + sc2.code)).json()).tags.length === 0);

/* ---- administration */
const ADMIN = "111111111111111111";
const aenv = baseEnv({ ADMIN_IDS: ADMIN });
const admin = await loginAs(aenv, { id: ADMIN, username: "root", global_name: "Root" });
await post(aenv, "/api/my/bindrunes", { name: "Admin test", tags: ["Paix"], d: good.d }, same(admin.cookie));
const al = await (await call(aenv, "/api/admin/bindrunes", { headers: { Cookie: admin.cookie } })).json();
check("admin : voit les étiquettes", al.items[0].tags.join() === "paix", JSON.stringify(al.items[0]));

finish();
