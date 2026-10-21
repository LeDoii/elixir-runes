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
check("miroir vertical : chaque rune porte le drapeau 1", a.every((e) => e.f === 1));
Geom.mirror(a, "v", cx, cy);
check("deux miroirs verticaux : composition d'origine", JSON.stringify(a.map((e) => [e.n, e.x, e.y, e.f || 0])) === JSON.stringify(comp().map((e) => [e.n, e.x, e.y, 0])));
const h = comp(); Geom.mirror(h, "h", cx, cy); Geom.mirror(h, "v", cx, cy);
check("miroirs vertical puis horizontal : drapeau 3 (rotation de 180°)", h.every((e) => e.f === 3));
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
finish();
