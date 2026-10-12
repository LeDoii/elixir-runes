// Étiquettes des bindrunes : normalisation, étiquettes par sens, parité navigateur / serveur, enregistrement, galerie, codes courts, administration.
// À lancer depuis SiteRunes/ : node --no-warnings tools/test_tags.mjs
import { createRequire } from "node:module";
import { check, finish, baseEnv, call, post, same, good, loginAs } from "./testkit.mjs";
import * as S from "../server/lib/tags.js";
import { validateBindrune } from "../server/lib/validate.js";

const require = createRequire(import.meta.url);
const T = require("../docs/tags.js");
global.window = {};
require("../docs/data.js");
const RUNES = Object.keys(S.RUNE_TAGS);
const rune = (n, extra = {}) => Object.assign({ n, x: 44, y: 64, m: 1, c: "#3D5C8C" }, extra);
const plate = (...rs) => ({ r: rs, s: "bois", t: 0, l: [] });

/* ---- normalisation */
check("minuscules, espaces et ponctuation nettoyés", T.norm("  Épreuve !! ") === "épreuve");
check("tiret et apostrophe conservés", T.norm("Voyage-éclair") === "voyage-éclair" && T.norm("l'aube") === "l'aube");
check("trop courte : vide", T.norm("a") === "" && T.norm("  ") === "" && T.norm("!!") === "");
check("tronquée à 20 caractères", T.norm("a".repeat(40)).length === 20);
check("balises et symboles neutralisés", T.norm("<b>gras</b>") === "b gras b");
check("liste : doublons retirés, 6 au plus", JSON.stringify(T.clean(["A1", "a1", "Bb", "Cc", "Dd", "Ee", "Ff", "Gg", "Hh"])) === JSON.stringify(["a1", "bb", "cc", "dd", "ee", "ff"]));
check("liste non tableau : vide", T.clean("x").length === 0 && T.clean(null).length === 0 && T.clean({ a: 1 }).length === 0);

/* ---- une étiquette par sens */
const sensOk = window.RUNES.runes.every((r) => (T.RUNE_TAGS[r.name] || []).length === r.sens.length);
check("chaque rune : exactement une étiquette par sens du livre", sensOk && window.RUNES.runes.length === 24);
check("aucune rune ne répète la même étiquette", RUNES.every((r) => new Set(S.RUNE_TAGS[r].map(S.normTag)).size === S.RUNE_TAGS[r].length));
check("étiquettes de rune : 2 à 20 caractères", RUNES.every((r) => S.RUNE_TAGS[r].every((t) => S.normTag(t).length >= 2 && S.normTag(t) === t.toLowerCase().normalize("NFC"))));
check("liste proposée = étiquettes des runes, sans doublon", T.VOCAB.length === new Set(T.VOCAB.map(T.norm)).size && T.VOCAB.every((v) => RUNES.some((r) => T.RUNE_TAGS[r].includes(v))));
check("couples opposés : étiquettes connues, jamais un couple avec lui-même", T.DISSONANT.every(([a, b]) => a !== b && T.VOCAB.includes(a) && T.VOCAB.includes(b)));
check("Algiz : Protection, Élan, Défense, Divin", T.derive({ r: [{ n: "Algiz" }] }).join() === "protection,élan,défense,divin");

/* ---- sens gardés par rune */
check("rune sans « t » : tous les sens", T.derive(plate(rune("Isa"))).join() === "immobilité,patience");
check("sens gardés : seulement ceux-là", T.derive(plate(rune("Algiz", { t: [0, 2] }))).join() === "protection,défense");
check("« t » vide : aucune étiquette de cette rune", T.derive(plate(rune("Algiz", { t: [] }), rune("Isa"))).join() === "immobilité,patience");
check("indices invalides ou doublons ignorés", T.derive(plate(rune("Isa", { t: [1, 1, 9, -1, "a", 0.5] }))).join() === "patience");
check("étiquette partagée entre runes : une seule fois", T.derive(plate(rune("Thurisaz"), rune("Algiz"))).filter((t) => t === "défense").length === 1);
check("toutes : celles des runes puis celles ajoutées", T.all(plate(rune("Isa")), ["Mon projet", "patience", "x"]).join() === "immobilité,patience,mon projet");
check("ajoutées : on retire celles qui viennent des runes", T.extras(plate(rune("Isa")), ["immobilité", "mon projet", "patience"]).join() === "mon projet");
check("couples opposés : Isa (immobilité) et Raidho (mouvement)", T.dissonances(plate(rune("Isa"), rune("Raidho"))).length === 2);
check("un couple ne compte pas dans une même rune", T.dissonances(plate(rune("Hagalaz"))).length === 0 && T.dissonances(plate(rune("Fehu"))).length === 0);
check("couples : le sens non gardé ne compte plus", T.dissonances(plate(rune("Isa"), rune("Raidho", { t: [2] }))).length === 0);
check("sans opposition : rien", T.dissonances(plate(rune("Gebo"), rune("Mannaz"))).length === 0);

/* ---- parité navigateur / serveur */
check("parité : mêmes étiquettes de rune", JSON.stringify(T.RUNE_TAGS) === JSON.stringify(S.RUNE_TAGS));
const samples = ["  Épreuve !! ", "a", "Saison 2", "<b>x</b>", "l'aube", "ÉVEIL", "x".repeat(50), "-tiret-", "", null, 5];
check("parité : même normalisation et même nettoyage", samples.every((s) => T.norm(s) === S.normTag(s)) && JSON.stringify(T.clean(samples)) === JSON.stringify(S.cleanTags(samples)));
const d1 = plate(rune("Algiz", { t: [0, 3] }), rune("Isa"), rune("Gebo", { t: [] }));
check("parité : mêmes étiquettes de bindrune", T.derive(d1).join() === S.deriveTags(d1).join() && T.all(d1, ["Zèbre"]).join() === S.allTags(d1, ["Zèbre"]).join());
check("serveur : colonne illisible → liste vide", S.parseTags("pas du json").length === 0 && S.parseTags('["Paix","paix"]').join() === "paix");

/* ---- validation serveur du champ « t » */
let v = validateBindrune(plate(rune("Algiz", { t: [3, 0, 0, 7] }), rune("Isa", { t: [0, 1] }), rune("Gebo", { t: "x" })));
check("validation : « t » trié, dédoublonné, borné ; omis quand tous les sens sont gardés", JSON.stringify(v.r[0].t) === "[0,3]" && v.r[1].t === undefined && v.r[2].t === undefined, JSON.stringify(v.r));
v = validateBindrune(plate(rune("Algiz", { t: [] })));
check("validation : « t » vide conservé", Array.isArray(v.r[0].t) && v.r[0].t.length === 0);

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
check("enregistrement : étiquettes des runes puis ajoutées, normalisées", items[0].tags.join() === "échange,don,équilibre,humanité,collaboration,protection,voyage-éclair", items[0].tags.join());
await save(alice, "Gebo et Mannaz", "pas une liste");
check("étiquettes ajoutées non liste : seules celles des runes", (await mineOf(alice))[0].tags.join() === "échange,don,équilibre,humanité,collaboration");
await save(alice, "Gebo et Mannaz", ["a1", "b2", "c3", "d4", "e5", "f6", "g7", "h8"]);
check("6 étiquettes ajoutées au plus", (await mineOf(alice))[0].tags.length === 5 + 6);
const keep = { r: [rune("Gebo", { t: [0] }), rune("Mannaz", { t: [1], x: 236 })], s: "bois", t: 0, l: [] };
await save(alice, "Choix par rune", ["Mon projet"], keep);
items = await mineOf(alice);
const ch = items.find((i) => i.name === "Choix par rune");
check("choix par rune : seuls les sens gardés donnent des étiquettes", ch.tags.join() === "échange,collaboration,mon projet", ch.tags.join());
check("choix par rune : « t » conservé dans les données", JSON.stringify(ch.d.r.map((r) => r.t)) === "[[0],[1]]");
let r = await save(alice, "Aucune étiquette", [], plate(rune("Gebo", { t: [] })));
check("aucune étiquette du tout : refusé (400)", r.status === 400 && !(await mineOf(alice)).some((i) => i.name === "Aucune étiquette"));
r = await save(alice, "Une seule", ["Mon projet"], plate(rune("Gebo", { t: [] })));
check("une étiquette ajoutée suffit", r.status === 200 || r.status === 201);
await save(alice, "Gebo et Mannaz", ["Protection"]);
await publish(alice, "Gebo et Mannaz");

/* ---- galerie : filtre par étiquette, recherche */
await save(bob, "Isa seule", ["Mon projet"], plate(rune("Isa")));
await publish(bob, "Isa seule");
await save(bob, "Algiz seule", [], plate(rune("Algiz")));
await publish(bob, "Algiz seule");
await save(bob, "Algiz sans protection", [], plate(rune("Algiz", { t: [1, 2, 3] })));
await publish(bob, "Algiz sans protection");
let g = await gal("tag=protection");
check("filtre : étiquette d'un sens gardé ou ajoutée", g.total === 2 && g.items.map((i) => i.name).sort().join() === "Algiz seule,Gebo et Mannaz", JSON.stringify(g.items.map((i) => i.name)));
g = await gal("tag=" + encodeURIComponent("Défense"));
check("filtre : un sens décoché ne compte pas", g.total === 2 && g.items.map((i) => i.name).sort().join() === "Algiz sans protection,Algiz seule");
g = await gal("tag=" + encodeURIComponent("mon projet"));
check("filtre : étiquette libre avec espace", g.total === 1 && g.items[0].name === "Isa seule");
check("filtre : étiquette inconnue → rien", (await gal("tag=zzz")).total === 0);
check("filtre vide ou invalide : ignoré", (await gal("tag=")).total === 4 && (await gal("tag=!")).total === 4);
check("filtre : injection SQL sans effet", (await gal("tag=" + encodeURIComponent("' OR 1=1 --"))).total === 0);
g = await gal("q=" + encodeURIComponent("projet"));
check("recherche texte : trouve aussi dans les étiquettes", g.total === 1 && g.items[0].name === "Isa seule");
check("recherche texte : % reste littéral", (await gal("q=" + encodeURIComponent("100%"))).total === 0);
g = await gal("tag=protection&q=algiz");
check("filtre et recherche se combinent", g.total === 1 && g.items[0].name === "Algiz seule");
g = await gal("");
check("la galerie renvoie toutes les étiquettes", g.items.find((i) => i.name === "Algiz seule").tags.join() === "protection,élan,défense,divin");
const id = (await mineOf(alice)).find((i) => i.name === "Gebo et Mannaz").id;
check("fiche d'une bindrune : étiquettes comprises", (await (await call(env, "/api/gallery/" + id)).json()).tags.includes("protection"));
check("aucune donnée de compte dans la réponse", !JSON.stringify(await gal("")).includes(ALICE));

/* ---- ligne ancienne (publiée avant les étiquettes par sens) : calculée à la première lecture */
env.DB.raw.prepare("INSERT INTO bindrunes (id, user_id, name, name_key, description, data, published, published_at, created_at, updated_at) VALUES ('old2', ?, 'Vieille', 'vieille', '', ?, 1, 5, 1, 1)").run(BOB, JSON.stringify(plate(rune("Kenaz"))));
g = await gal("tag=lumière");
check("ancienne ligne : étiquettes calculées à la demande", g.items.some((i) => i.name === "Vieille") && JSON.parse(env.DB.raw.prepare("SELECT tags FROM bindrunes WHERE id = 'old2'").get().tags).join() === "connaissance,lumière");
env.DB.raw.exec("UPDATE bindrunes SET tags = 'pas du json' WHERE id = 'old2'");
check("colonne corrompue : la galerie répond quand même", (await call(env, "/api/gallery?tag=protection")).status === 200);

/* ---- codes courts */
const sc = await (await post(env, "/api/codes", { name: "Avec étiquettes", tags: ["Mon projet", "joie"], d: plate(rune("Wunjo", { t: [0] })) }, { "CF-Connecting-IP": "9.9.9.9" })).json();
const item = await (await call(env, "/api/codes/" + sc.code)).json();
check("code court : étiquettes des runes et ajoutées", item.tags.join() === "joie,mon projet", JSON.stringify(item.tags));
const sc2 = await (await post(env, "/api/codes", { name: "Sans", d: good.d }, { "CF-Connecting-IP": "9.9.9.9" })).json();
check("code court sans ajout : étiquettes des runes", (await (await call(env, "/api/codes/" + sc2.code)).json()).tags.length === 5);

/* ---- administration */
const ADMIN = "111111111111111111";
const aenv = baseEnv({ ADMIN_IDS: ADMIN });
const admin = await loginAs(aenv, { id: ADMIN, username: "root", global_name: "Root" });
await post(aenv, "/api/my/bindrunes", { name: "Admin test", tags: ["Paix"], d: plate(rune("Isa")) }, same(admin.cookie));
const al = await (await call(aenv, "/api/admin/bindrunes", { headers: { Cookie: admin.cookie } })).json();
check("admin : voit les étiquettes", al.items[0].tags.join() === "immobilité,patience,paix", JSON.stringify(al.items[0]));

finish();
