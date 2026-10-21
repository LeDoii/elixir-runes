// Miroirs, taille et validation des bindrunes retournées. À lancer depuis SiteRunes/ : node --no-warnings tools/test_geom.mjs
import { createRequire } from "node:module";
import { check, finish } from "./testkit.mjs";
import { validateBindrune } from "../server/lib/validate.js";
import { comboKey } from "../server/lib/combo.js";

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require("../docs/data.js");
const Geom = require("../docs/geom.js");
const Combo = require("../docs/combo.js");
const RUNES = window.RUNES.runes.map((r) => r.name);
const near = (a, b) => Math.abs(a - b) < 1e-9;
const rune = (n, x, y, f) => Object.assign({ n, x, y, m: 1, c: "#3D5C8C" }, f ? { f } : {});

/* ---- retourner une rune */
const iso = Geom.strokes("Isa", 0), isoV = Geom.strokes("Isa", Geom.FLIP_V), algV = Geom.strokes("Algiz", Geom.FLIP_V);
check("sans miroir : les traits d'origine, sans copie", Geom.strokes("Isa", 0)[0].pts === window.RUNES.runes.find((r) => r.name === "Isa").strokes[0].pts);
check("Algiz retournée haut ↔ bas : la fourche passe en bas", Geom.anchors("Algiz", 0)[0][1] === 58 && Geom.anchors("Algiz", Geom.FLIP_V)[0][1] === 454);
check("deux miroirs identiques : retour à l'origine", RUNES.every((n) => JSON.stringify(Geom.flipPts(Geom.flipPts(Geom.strokes(n, 0)[0].pts, 1), 1)) === JSON.stringify(Geom.strokes(n, 0)[0].pts)));
check("miroir : mêmes points d'ancrage, même nombre et même ordre", RUNES.every((n) => [1, 2, 3].every((f) => Geom.anchors(n, f).length === Geom.anchors(n, 0).length)));
check("miroir : les points d'ancrage retombent sur la grille de la rune (24 px x 16,5 px)", RUNES.every((n) => [1, 2, 3].every((f) => Geom.anchors(n, f).every(([x, y]) => near(((x - 160) / 24) % 1 + 1, 1) || near(Math.abs(((x - 160) / 24) % 1), 0)) && Geom.anchors(n, f).every(([x, y]) => near(Math.abs(((y - 58) / 16.5) % 1), 0)))));
check("miroir : les traits restent dans la case de la rune", RUNES.every((n) => [1, 2, 3].every((f) => Geom.strokes(n, f).every((s) => s.pts.every(([x, y]) => x >= 136 && x <= 376 && y >= 58 && y <= 454)))));
check("Mannaz miroir horizontal : l'échelle (2 traits) passe à gauche", Geom.anchors("Mannaz", 2).length === Geom.anchors("Mannaz", 0).length && JSON.stringify(Geom.anchors("Mannaz", 2)) !== JSON.stringify(Geom.anchors("Mannaz", 0)));

/* ---- retourner toute une composition */
const comp = () => [{ n: "Gebo", x: 44, y: 64 }, { n: "Isa", x: 236, y: 100 }, { n: "Ansuz", x: 140, y: -30 }];
const bounds = (es) => { const pts = es.flatMap((e) => Geom.placed(e).flatMap((s) => s.pts)); return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))]; };
const a = comp(), b0 = bounds(a), cx = (b0[0] + b0[2]) / 2, cy = (b0[1] + b0[3]) / 2;
Geom.mirror(a, "v", cx, cy);
const b1 = bounds(a);
check("miroir vertical : l'emprise reste la même, centrée au même endroit", b0.every((v, i) => near(v, b1[i])), JSON.stringify([b0, b1]));
check("miroir vertical : chaque rune dont la forme change porte le drapeau 1, les autres (Gebo, Isa) restent à 0", a.every((e) => e.f === (e.n === "Ansuz" ? 1 : 0)), JSON.stringify(a.map((e) => [e.n, e.f])));
Geom.mirror(a, "v", cx, cy);
check("deux miroirs verticaux : composition d'origine", JSON.stringify(a.map((e) => [e.n, e.x, e.y, e.f || 0])) === JSON.stringify(comp().map((e) => [e.n, e.x, e.y, 0])));
const h = comp(); Geom.mirror(h, "h", cx, cy); Geom.mirror(h, "v", cx, cy);
check("miroirs vertical puis horizontal : rotation de 180° (drapeau 3 pour Ansuz, 0 pour les runes symétriques)", h.every((e) => e.f === (e.n === "Ansuz" ? 3 : 0)));
const rot = bounds(h);
check("rotation de 180° : même emprise", b0.every((v, i) => near(v, rot[i])));
// la liaison entre deux runes (points qui se touchent) reste vraie après miroir
const touch = (es) => { const A = Geom.anchors(es[0].n, es[0].f).map(([x, y]) => [x + es[0].x, y + es[0].y]), B = Geom.anchors(es[1].n, es[1].f).map(([x, y]) => [x + es[1].x, y + es[1].y]); return A.some((p, i) => B.some((q, j) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6)); };
const pair = [{ n: "Gebo", x: 0, y: 0 }, { n: "Ansuz", x: 0, y: 0 }];
const before = touch(pair); Geom.mirror(pair, "v", 256, 256);
check("liaison : deux runes dont les points se touchent se touchent encore après miroir", before && touch(pair));

/* ---- validation (serveur) */
const plate = (rs, extra = {}) => Object.assign({ r: rs, s: "bois", t: 0, l: [] }, extra);
let v = validateBindrune(plate([rune("Isa", 0, 0, 1), rune("Gebo", 0, 0, 3), rune("Ansuz", 0, 0, 7), rune("Laguz", 0, 0, 0), rune("Mannaz", 0, 0, "x")]));
check("validation : miroir 1 à 3 conservé, hors plage ou absent ignoré", v.r[0].f === 1 && v.r[1].f === 3 && v.r[2].f === undefined && v.r[3].f === undefined && v.r[4].f === undefined);
v = validateBindrune(plate([rune("Isa", 0, 0)], { z: 1.25 }));
check("validation : taille conservée", v.z === 1.25);
check("validation : taille 1 omise", validateBindrune(plate([rune("Isa", 0, 0)], { z: 1 })).z === undefined && validateBindrune(plate([rune("Isa", 0, 0)])).z === undefined);
check("validation : taille bornée à 0,4 – 1,6", validateBindrune(plate([rune("Isa", 0, 0)], { z: 9 })).z === 1.6 && validateBindrune(plate([rune("Isa", 0, 0)], { z: 0.01 })).z === 0.4);
check("validation : taille non numérique ignorée", validateBindrune(plate([rune("Isa", 0, 0)], { z: "grand" })).z === undefined && validateBindrune(plate([rune("Isa", 0, 0)], { z: NaN })).z === undefined);

/* ---- empreinte de combinaison */
const A = plate([rune("Gebo", 44, 64), rune("Ansuz", 236, 64)]);
check("empreinte : sans miroir, identique à l'ancien format (aucun champ en plus)", !comboKey(A).includes(",1]") && comboKey(A) === Combo.key(A));
check("empreinte : la bindrune retournée est une autre combinaison", comboKey(plate([rune("Gebo", 44, 64, 1), rune("Ansuz", 236, 64, 1)])) !== comboKey(A));
check("empreinte : tout retourner dans un sens ou dans l'autre donne deux combinaisons différentes", comboKey(plate([rune("Gebo", 44, 64, 1), rune("Ansuz", 236, 64, 1)])) !== comboKey(plate([rune("Gebo", 44, 64, 2), rune("Ansuz", 236, 64, 2)])));
check("empreinte : la taille ne compte pas", comboKey(plate(A.r, { z: 1.4 })) === comboKey(A));
check("empreinte : parité navigateur / serveur avec miroirs", [1, 2, 3].every((f) => comboKey(plate([rune("Gebo", 44, 64, f), rune("Isa", 140, 100, 0), rune("Ansuz", 236, 64, f)])) === Combo.key(plate([rune("Gebo", 44, 64, f), rune("Isa", 140, 100, 0), rune("Ansuz", 236, 64, f)]))));

/* ---- échelle propre à chaque rune */
const kOf = (n, k) => Geom.strokes(n, 0, k)[0].pts;
check("échelle 1 : les traits d'origine, sans copie", Geom.strokes("Isa", 0, 1) === Geom.strokes("Isa", 0) );
const big = Geom.anchors("Isa", 0, 2), base = Geom.anchors("Isa", 0);
check("échelle 2 : les points s'écartent du centre de la case (256, 256)", big[0][1] === 256 + (base[0][1] - 256) * 2 && big[0][0] === 256);
check("échelle : même nombre de points d'ancrage, même ordre", RUNES.every((n) => [0.5, 2].every((k) => Geom.anchors(n, 3, k).length === Geom.anchors(n, 0).length)));
check("échelle puis échelle inverse : retour à l'origine", JSON.stringify(Geom.scalePts(Geom.scalePts(kOf("Gebo", 1), 2), 0.5).map((p) => p.map((v) => Math.round(v * 1e6) / 1e6))) === JSON.stringify(kOf("Gebo", 1)));
const grp = [{ n: "Gebo", x: 0, y: 0 }, { n: "Ansuz", x: 0, y: 0 }];
const contact = (es) => { const A = Geom.anchors(es[0].n, es[0].f, es[0].k).map(([x, y]) => [x + es[0].x, y + es[0].y]), B = Geom.anchors(es[1].n, es[1].f, es[1].k).map(([x, y]) => [x + es[1].x, y + es[1].y]); return A.filter((p) => B.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6)).length; };
const c0 = contact(grp);
const eff = Geom.scaleAbout(grp, 1.5, 256, 256);
check("redimensionner un bloc : facteur appliqué, échelles multipliées", eff === 1.5 && grp.every((e) => e.k === 1.5));
check("redimensionner un bloc : des runes en contact le restent (même nombre de points communs)", c0 > 0 && contact(grp) === c0);
const single = [{ n: "Isa", x: 100, y: 50 }];
Geom.scaleAbout(single, 2, single[0].x + 256, single[0].y + 256);
check("redimensionner une rune seule autour de son centre : sa case reste centrée au même endroit", single[0].x === 100 && single[0].y === 50 && single[0].k === 2);
const lim = [{ n: "Isa", x: 0, y: 0, k: 2 }, { n: "Laguz", x: 0, y: 0, k: 1 }];
const f2 = Geom.scaleAbout(lim, 5, 0, 0);
check("redimensionner : le facteur est borné pour garder toutes les échelles dans 0,25 – 3", f2 === 1.5 && lim[0].k === 3 && lim[1].k === 1.5, JSON.stringify(lim));
const small = [{ n: "Isa", x: 0, y: 0, k: 0.5 }]; Geom.scaleAbout(small, 0.01, 0, 0);
check("redimensionner : plancher à 0,25", small[0].k === 0.25);
check("miroir d'une rune à l'échelle : même emprise", (() => { const a = [{ n: "Algiz", x: 10, y: 20, k: 1.6 }]; const bb = (e) => { const p = Geom.placed(e[0]).flatMap((s) => s.pts); return [Math.min(...p.map((q) => q[0])), Math.min(...p.map((q) => q[1])), Math.max(...p.map((q) => q[0])), Math.max(...p.map((q) => q[1]))]; }; const b0 = bb(a); Geom.mirror(a, "v", 256 + 10, 256 + 20); const b1 = bb(a); return b0.every((v, i) => near(v, b1[i])) && a[0].f === 1 && a[0].k === 1.6; })());
v = validateBindrune(plate([{ n: "Isa", x: 0, y: 0, k: 1.5 }, { n: "Gebo", x: 0, y: 0, k: 1 }, { n: "Ansuz", x: 0, y: 0, k: 99 }, { n: "Laguz", x: 0, y: 0, k: 0.01 }, { n: "Mannaz", x: 0, y: 0, k: "x" }]));
check("validation : échelle conservée, 1 omise, bornée à 0,25 – 3, non numérique ignorée", v.r[0].k === 1.5 && v.r[1].k === undefined && v.r[2].k === 3 && v.r[3].k === 0.25 && v.r[4].k === undefined, JSON.stringify(v.r.map((r) => r.k)));
const K = (k) => plate([rune("Gebo", 44, 64), Object.assign(rune("Ansuz", 236, 64), k ? { k } : {})]);
check("empreinte : une rune redimensionnée est une autre combinaison", comboKey(K(1.5)) !== comboKey(K(0)));
check("empreinte : échelle 1 explicite = pas d'échelle", comboKey(plate([rune("Gebo", 44, 64), Object.assign(rune("Ansuz", 236, 64), { k: 1 })])) === comboKey(K(0)));
check("empreinte : parité navigateur / serveur avec échelles et miroirs", [[0, 1.5], [1, 0.5], [3, 2]].every(([f, k]) => { const dd = plate([rune("Gebo", 44, 64, f), Object.assign(rune("Isa", 140, 100, 0), { k }), rune("Ansuz", 236, 64, f)]); return comboKey(dd) === Combo.key(dd); }));

/* ---- miroirs inutiles */
const SYM = { Gebo: [1, 1, 1], Isa: [1, 1, 1], Ingwaz: [1, 1, 1], Dagaz: [1, 1, 1], Thurisaz: [1, 0, 0], Kenaz: [1, 0, 0], Perthro: [1, 0, 0], Berkano: [1, 0, 0], Algiz: [0, 1, 0], Tiwaz: [0, 1, 0], Ehwaz: [0, 1, 0], Mannaz: [0, 1, 0], Othala: [0, 1, 0], Hagalaz: [0, 0, 1], Jera: [0, 0, 1], Eihwaz: [0, 0, 1], Sowilo: [0, 0, 1] };
check("miroirs inutiles : la liste notée dans geom.js et NOTES_BINDRUNES.md", RUNES.every((n) => { const [v, hh, both] = SYM[n] || [0, 0, 0]; return Geom.changes(n, 1) === !v && Geom.changes(n, 2) === !hh && Geom.changes(n, 3) === !both; }));
check("drapeau équivalent : Gebo et Isa restent à 0 quel que soit le miroir", [0, 1, 2, 3].every((f) => Geom.canonF("Isa", f) === 0 && Geom.canonF("Gebo", f) === 0 && Geom.canonF("Dagaz", f) === 0));
check("drapeau équivalent : Hagalaz 3 devient 0 (rotation de 180° sans effet) et 2 donne la même forme que 1", Geom.canonF("Hagalaz", 3) === 0 && Geom.canonF("Hagalaz", 1) === 1 && Geom.canonF("Hagalaz", 2) === 1);
check("drapeau équivalent : Thurisaz haut ↔ bas inutile, gauche ↔ droite utile", Geom.canonF("Thurisaz", 1) === 0 && Geom.canonF("Thurisaz", 2) === 2 && Geom.canonF("Thurisaz", 3) === 2);
const sym = [{ n: "Isa", x: 0, y: 0 }, { n: "Algiz", x: 100, y: 50 }, { n: "Berkano", x: 200, y: 0 }];
Geom.mirror(sym, "v", 300, 200);
check("miroir vertical : les positions se retournent toujours, le drapeau seulement si la forme change", sym[0].f === 0 && sym[1].f === 1 && sym[2].f === 0 && sym[0].y === 2 * 200 - 0 - 512 && sym[1].y === 2 * 200 - 50 - 512);
Geom.mirror(sym, "h", 300, 200);
check("miroir horizontal : Algiz (symétrique gauche ↔ droite) garde 1, Berkano passe à 2", sym[1].f === 1 && sym[2].f === 2);

/* ---- piques de jonction */
const spk = RUNES.map((n) => [n, Geom.spikes(n).length]).filter(([, c]) => c);
check("piques : seule Berkano en a une (son sommet central, posé au milieu de la tige) ; la pointe de Tiwaz est une vraie pointe de flèche", JSON.stringify(spk) === JSON.stringify([["Berkano", 1]]) && Geom.spikes("Berkano")[0].v === 2);
const nBerkano = window.RUNES.runes.find((r) => r.name === "Berkano").strokes.length;
check("piques : le trait de Berkano est coupé en deux à ce sommet (mêmes traits pour toutes les autres runes)", Geom.drawn({ n: "Berkano", x: 0, y: 0 }).length === nBerkano + 1 && RUNES.filter((n) => n !== "Berkano").every((n) => Geom.drawn({ n, x: 0, y: 0 }).length === window.RUNES.runes.find((r) => r.name === n).strokes.length));
const bd = Geom.drawn({ n: "Berkano", x: 10, y: 20 });
check("piques : les deux morceaux se rejoignent exactement au sommet coupé, décalés de la position", bd.some((s, i) => bd[i + 1] && s.pts[s.pts.length - 1].join() === bd[i + 1].pts[0].join() && s.pts[s.pts.length - 1].join() === "170,276"));

/* ---- joints aux points d'ancrage liés */
const isa = (x, y) => ({ n: "Isa", x, y });
const isaTop = isa(0, 0), isaBottom = isa(0, 396);
check("joint : deux tiges bout à bout se prolongent : rien à ajouter", Geom.joins([[isaTop, isaBottom, 1, 0]]).length === 0);
const kz = { n: "Kenaz", x: 0, y: 0 };                         // chevron : son sommet gauche (160,256) porte deux traits
const kA = Geom.anchors("Kenaz", 0).findIndex((p) => p[0] === 160 && p[1] === 256);
const jk = Geom.joins([[kz, isa(-96, 198), kA, 0]]);
check("joint : tige posée sous le sommet d'un chevron : un seul joint, au point lié, avec des bras assez longs", kA >= 0 && jk.length === 1 && jk[0].pts[1].join() === "160,256" && jk[0].pts.slice(0, 3).every((p) => Number.isFinite(p[0])), JSON.stringify(jk));
check("joint : le V a un bras sur la tige (vers le bas) et un sur le chevron (vers le haut), longueur de bras juste suffisante", jk.length === 1 && jk[0].pts[0][0] === 160 && jk[0].pts[0][1] > 256 && jk[0].pts[2][0] > 160 && jk[0].pts[2][1] < 256 && Math.hypot(jk[0].pts[0][0] - 160, jk[0].pts[0][1] - 256) < 12);
const bA = Geom.anchors("Berkano", 0).findIndex((p) => p[0] === 160 && p[1] === 256);
check("joint : une tige qui prolonge la tige de Berkano au point central : aucune bosse", bA >= 0 && Geom.joins([[{ n: "Berkano", x: 0, y: 0 }, isa(-96, 198), bA, 0]]).length === 0);
check("joint : lien vers un point inexistant ignoré", Geom.joins([[isaTop, isaBottom, 99, 0]]).length === 0);
check("joint : deux liens sur le même point ne donnent qu'un joint", Geom.joins([[kz, isa(-96, 198), kA, 0], [isa(-96, 198), kz, 0, kA]]).length === 1);

/* ---- ancrage posé sur une ligne */
const onI = Geom.onLine([260, 200], isa(0, 0), 6);
check("ligne : un point à 4 du trait d'une tige est trouvé, avec son point d'attache sur le trait", onI && Math.abs(onI.q[0] - 256) < 1e-9 && onI.q[1] === 200 && onI.d === 4);
check("ligne : un point trop loin n'est pas sur la ligne", Geom.onLine([280, 200], isa(0, 0), 6) === null);
const kenaz = { n: "Kenaz", x: 0, y: 0 };
const als = Geom.anchorLineSnap([isa(2, 99)], [kenaz], 14);          // le haut de la tige (258,157) frôle la branche haute du chevron
const moved = als && isa(2 + als.dx, 99 + als.dy), anc = moved && Geom.anchors("Isa", 0).map((p) => [p[0] + moved.x, p[1] + moved.y])[0];
check("aimant de ligne : l'extrémité de la tige est ramenée exactement sur le trait du chevron", als && anc && Geom.onLine(anc, kenaz, 1e-6) !== null, JSON.stringify(als));
const als3 = Geom.anchorLineSnap([kenaz], [isa(2, 99)], 14);
check("aimant de ligne : même résultat dans l'autre sens (le chevron se déplace vers la tige)", als3 && Math.abs(als3.dx + als.dx) < 1e-9 && Math.abs(als3.dy + als.dy) < 1e-9);
check("aimant de ligne : rien quand aucun ancrage n'est à portée d'un trait", Geom.anchorLineSnap([isa(300, 0)], [kenaz], 14) === null);
finish();
