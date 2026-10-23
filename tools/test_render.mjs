// Régression du tracé : les formes de toutes les runes, les joints de liaison et les SVG exportés sont comparés à des empreintes de référence.
// Une différence n'est pas forcément un bug (un changement voulu du tracé en provoque) : relire le rendu, puis `node tools/test_render.mjs --update`.
// À lancer depuis SiteRunes/ : node --no-warnings tools/test_render.mjs
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { check, finish } from "./testkit.mjs";

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require("../docs/data.js");
const Geom = require("../docs/geom.js");
globalThis.Geom = Geom;                                     // export.js lit root.Geom
const Export = require("../docs/export.js");
const RUNES = window.RUNES.runes.map((r) => r.name);
const GOLDEN = join(dirname(fileURLToPath(import.meta.url)), "golden", "render.json");
const update = process.argv.includes("--update");

const r2 = (v) => Math.round(v * 100) / 100;
const flat = (paths) => paths.map((p) => ({ f: !!p.filled, p: p.map((q) => [r2(q[0]), r2(q[1])]) }));
const hash = (o) => createHash("sha256").update(JSON.stringify(o)).digest("hex").slice(0, 16);

/* ---- cas : chaque entrée donne ce qui est dessiné (polylignes et polygones) */
const cases = {};
const variants = { "simple": {}, "coins": { o: 1 }, "miroir": { f: 3 }, "grosse": { k: 1.5, w: 1.5 } };
RUNES.forEach((n) => Object.entries(variants).forEach(([v, extra]) => { cases["rune/" + n + "/" + v] = () => flat(Geom.drawn(Object.assign({ n, x: 10, y: 20 }, extra)).map((s) => s.pts)); }));

const isa = (x, y, extra) => Object.assign({ n: "Isa", x, y }, extra);
const scenes = {
  "chevron-sur-tige": [[{ n: "Kenaz", x: 0, y: 0 }, isa(-96, 198), 1, 0]],
  "fehu-wunjo": [[{ n: "Fehu", x: -192, y: 0 }, { n: "Wunjo", x: 0, y: 0 }, 3, 0], [{ n: "Fehu", x: -192, y: 0 }, { n: "Wunjo", x: 0, y: 0 }, 5, null]],
  "dagaz-tige": [[{ n: "Dagaz", x: 0, y: 0 }, isa(-96, 0), 0, 0]],
  "dagaz-epais": [[{ n: "Dagaz", x: 0, y: 0, w: 2 }, isa(-96, 0), 0, 0]],
  "tiges-bout-a-bout": [[isa(0, 0), isa(0, 396), 1, 0]],
};
Object.entries(scenes).forEach(([name, pairs]) => ["square", "bevel"].forEach((style) => {
  cases["liaison/" + name + "/" + style] = () => { Geom.setJoinStyle(style); const out = flat(Geom.joins(pairs).map((j) => j.pts)); Geom.setJoinStyle("square"); return out; };
}));

const sample = (runes, l) => ({ r: runes.map(([n, x, y, extra], i) => Object.assign({ n, x, y, m: 1, c: ["#A4551F", "#3D5C8C", "#4E7A53"][i % 3] }, extra || {})), s: "bois", t: 0, l: l || [] });
const bindrunes = {
  "algiz-othala": sample([["Algiz", 44, 64], ["Othala", 44, 64]]),
  "dagaz-mannaz-fehu": sample([["Dagaz", 44, 64], ["Mannaz", 44, 64, { o: 1 }], ["Fehu", 236, 64, { w: 1.5 }]], [[1, 0, 0, 0], [2, 0, 0, 3]]),
  "berkano-miroir": sample([["Berkano", 100, 64, { f: 2 }], ["Isa", 200, 64]]),
};
Object.entries(bindrunes).forEach(([name, d]) => { cases["svg/" + name] = () => Export.svgOf(d, "Essai"); });

const current = {};
Object.entries(cases).forEach(([k, fn]) => { const v = fn(); current[k] = { h: hash(v), n: typeof v === "string" ? v.length : v.length }; });

if (update || !existsSync(GOLDEN)) {
  mkdirSync(dirname(GOLDEN), { recursive: true });
  writeFileSync(GOLDEN, JSON.stringify(current, null, 0).replace(/},"/g, "},\n\"") + "\n");
  console.log("Références écrites : " + Object.keys(current).length + " cas (" + GOLDEN + ").");
} else {
  const ref = JSON.parse(readFileSync(GOLDEN, "utf8")), keys = Object.keys(current);
  const diff = keys.filter((k) => !ref[k] || ref[k].h !== current[k].h), missing = Object.keys(ref).filter((k) => !current[k]);
  check("rendu : " + keys.length + " cas identiques aux références (formes des runes, joints, SVG)", !diff.length && !missing.length, "différents : " + diff.slice(0, 8).join(", ") + (diff.length > 8 ? " … (" + diff.length + ")" : "") + (missing.length ? " ; disparus : " + missing.slice(0, 5).join(", ") : ""));
}

/* ---- garde-fous indépendants des références */
check("rendu : aucune coordonnée invalide dans les 24 runes (toutes variantes)", Object.keys(cases).filter((k) => k.startsWith("rune/")).every((k) => JSON.stringify(cases[k]()).indexOf("null") < 0));
check("rendu : chaque rune produit au moins un trait, et seuls les joints sont des polygones remplis", RUNES.every((n) => { const d = Geom.drawn({ n, x: 0, y: 0, o: 1 }); return d.length >= 1 && d.every((s) => s.pts.filled === undefined); }));
check("rendu : les SVG exportés ont tous une épaisseur de trait positive et une emprise finie", Object.keys(bindrunes).every((k) => { const s = Export.svgOf(bindrunes[k], "x"); return /stroke-width="[1-9]/.test(s) && /viewBox="-?[\d.]+ -?[\d.]+ [\d.]+ [\d.]+"/.test(s); }));
finish();
