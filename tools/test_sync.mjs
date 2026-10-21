// Synchronisation des bindrunes avec le compte (logique pure). À lancer depuis SiteRunes/ : node --no-warnings tools/test_sync.mjs
import { createRequire } from "node:module";
import { check, finish } from "./testkit.mjs";
const { plan, diffPush, canon, sig, key } = createRequire(import.meta.url)("../docs/sync.js");

const d = (n) => ({ r: [{ n, x: 0, y: 0, m: 1, c: "#3D5C8C" }], s: "bois", t: 0, l: [] });
const loc = (name, at, desc = "", tags = [], rune = "Isa") => ({ name, at, d: d(rune), description: desc, tags });
const rem = (id, name, upd, desc = "", tags = [], rune = "Isa", published = false) => ({ id, name, updated_at: upd, d: d(rune), description: desc, tags, published });
const st = (r, published = false) => ({ id: r.id || "x", sig: sig(r), published, name: r.name });

check("signature : l'ordre des champs ne compte pas", canon({ a: 1, b: [2, { c: 3, d: 4 }] }) === canon({ b: [2, { d: 4, c: 3 }], a: 1 }));
check("signature : une donnée différente change la signature", sig(loc("A", 1, "x")) !== sig(loc("A", 1, "y")) && sig(loc("A", 1, "", [], "Isa")) !== sig(loc("A", 1, "", [], "Gebo")));
check("nom : casse et espaces ignorés", key("  Alpha ") === key("ALPHA"));

/* ---- première connexion : rien de connu */
let p = plan([loc("Locale", 5)], [rem("r1", "Distante", 9)], {});
check("première connexion : la locale part sur le compte, la distante vient en local", p.push.map((x) => x.name).join() === "Locale" && p.pull.map((x) => x.name).join() === "Distante" && !p.drop.length && !p.del.length);
p = plan([loc("Même", 5, "a")], [rem("r1", "même", 9, "a")], {});
check("même nom, mêmes données : rien à faire, juste marquée (casse ignorée)", !p.push.length && !p.pull.length && p.mark.length === 1 && p.mark[0].id === "r1");
p = plan([loc("Conflit", 20, "locale")], [rem("r1", "Conflit", 10, "distante")], {});
check("conflit à la première connexion : la plus récente gagne (locale)", p.push.length === 1 && !p.pull.length);
p = plan([loc("Conflit", 5, "locale")], [rem("r1", "Conflit", 10, "distante")], {});
check("conflit à la première connexion : la plus récente gagne (compte)", p.pull.length === 1 && !p.push.length);

/* ---- synchronisations suivantes */
const base = rem("r1", "Suivie", 10, "v1");
let known = { suivie: st(base) };
p = plan([loc("Suivie", 30, "v2")], [base], known);
check("seul le local a changé : envoi", p.push.length === 1 && !p.pull.length);
p = plan([loc("Suivie", 5, "v1")], [rem("r1", "Suivie", 40, "v3")], known);
check("seul le compte a changé : récupération", p.pull.length === 1 && !p.push.length);
p = plan([loc("Suivie", 99, "v2")], [rem("r1", "Suivie", 10, "v3")], known);
check("les deux ont changé : la plus récente gagne", p.push.length === 1);
p = plan([], [base], known);
check("supprimée en local : suppression sur le compte", p.del.length === 1 && p.del[0].id === "r1" && !p.pull.length);
p = plan([loc("Suivie", 5, "v1")], [], known);
check("supprimée ailleurs : retirée du local", p.drop.join() === "Suivie" && !p.push.length);
p = plan([loc("Neuve", 5)], [], known);
check("nouvelle en local : envoyée", p.push.length === 1 && !p.drop.length);
p = plan([], [rem("r2", "Nouvelle ailleurs", 5)], known);
check("nouvelle sur le compte : récupérée", p.pull.length === 1 && !p.del.length);

/* ---- changements locaux entre deux synchronisations */
const syn = { a: st(rem("ida", "A", 1, "x")), b: st(rem("idb", "B", 1, "y")), c: st(rem("idc", "C", 1, "z"), true) };
let dp = diffPush([loc("A", 1, "x"), loc("B", 1, "autre"), loc("D", 1)], syn);
check("changements locaux : modifiée (B) et nouvelle (D) à envoyer", dp.push.map((x) => x.name).sort().join() === "B,D");
check("changements locaux : retirée (C) à supprimer sur le compte, avec son état publié", dp.del.length === 1 && dp.del[0].id === "idc" && dp.del[0].published === true);
dp = diffPush([loc("A", 1, "x"), loc("B", 1, "y"), loc("C", 1, "z")], syn);
check("aucun changement : rien à faire", !dp.push.length && !dp.del.length);
dp = diffPush([loc("a", 1, "x"), loc("b", 1, "y"), loc("c", 1, "z")], syn);
check("noms en minuscules : même bindrune", !dp.push.length && !dp.del.length);
dp = diffPush([loc("A2", 1, "x"), loc("B", 1, "y"), loc("C", 1, "z")], syn);
check("renommage : l'ancien nom est supprimé, le nouveau envoyé", dp.push.map((x) => x.name).join() === "A2" && dp.del[0].id === "ida");
check("liste vide et rien de connu : rien à faire", !diffPush([], {}).push.length && !diffPush([], {}).del.length);
finish();
