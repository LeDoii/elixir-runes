// Modules de l'atelier : archive ZIP, SVG et strates, comparaison de deux versions.
// À lancer depuis SiteRunes/ : node --no-warnings tools/test_atelier.mjs
import { createRequire } from "node:module";
import { check, finish } from "./testkit.mjs";

const require = createRequire(import.meta.url);
globalThis.window = globalThis;
require("../docs/data.js");
globalThis.Geom = require("../docs/geom.js");
const Zip = require("../docs/zip.js");
const Exp = require("../docs/export.js");
const { diff } = require("../docs/diff.js");
const rune = (n, x, y, extra = {}) => Object.assign({ n, x, y, m: 1, c: "#3D5C8C" }, extra);
const plate = (rs, extra = {}) => Object.assign({ r: rs, s: "bois", t: 0, l: [] }, extra);

/* ---- ZIP */
check("CRC-32 de « 123456789 » : valeur de référence", Zip.crc32(new TextEncoder().encode("123456789")) === 0xcbf43926);
const files = [{ name: "01-Gebo.svg", data: new TextEncoder().encode("<svg/>") }, { name: "dossier é/02-Isa.png", data: Uint8Array.from([137, 80, 78, 71, 0, 255, 128]) }];
const z = Zip.build(files);
const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
const eocd = z.length - 22;
check("ZIP : fin de répertoire à la bonne place, 2 entrées", dv.getUint32(eocd, true) === 0x06054b50 && dv.getUint16(eocd + 10, true) === 2);
let off = dv.getUint32(eocd + 16, true), okAll = true;
for (let i = 0; i < 2; i++) {
  if (dv.getUint32(off, true) !== 0x02014b50) { okAll = false; break; }
  const crc = dv.getUint32(off + 16, true), size = dv.getUint32(off + 24, true), nlen = dv.getUint16(off + 28, true), lo = dv.getUint32(off + 42, true);
  const name = new TextDecoder().decode(z.slice(off + 46, off + 46 + nlen));
  const lnlen = dv.getUint16(lo + 26, true), data = z.slice(lo + 30 + lnlen, lo + 30 + lnlen + size);
  okAll = okAll && dv.getUint32(lo, true) === 0x04034b50 && name === files[i].name && Zip.crc32(data) === crc && [...data].join() === [...files[i].data].join();
  off += 46 + nlen;
}
check("ZIP : chaque entrée relue (nom UTF-8, CRC, contenu identique)", okAll);
check("ZIP vide valide", Zip.build([]).length === 22);

/* ---- SVG et strates */
const d = plate([rune("Gebo", 44, 64, { c: "#3D5C8C" }), rune("Isa", 140, 64, { c: "#8C3D3D", k: 1.5 }), rune("Ansuz", 236, 64, { f: 1 })]);
const svg = Exp.svgOf(d, "Mon « test » <b>");
check("SVG : un groupe par rune, dans l'ordre", ["01-Gebo", "02-Isa", "03-Ansuz"].every((id) => svg.includes('id="' + id + '"')) && svg.indexOf("01-Gebo") < svg.indexOf("03-Ansuz"));
check("SVG : titre échappé", svg.includes("<title>Mon « test » &lt;b&gt;</title>") && !svg.includes("<b>"));
check("SVG : couleur et épaisseur de chaque rune (20 px, ×1,5 = 30 px)", svg.includes('stroke="#8C3D3D"') && svg.includes('stroke-width="30"') && svg.includes('stroke-width="20"'));
check("SVG : pas de fond", !/<rect/.test(svg));
const [bx0, by0, bx1, by1] = Exp.bounds(d);
check("emprise : même cadre pour toutes les strates, marge comprise", Exp.layers(d).every((l) => l.box.join() === [bx0, by0, bx1, by1].join()) && bx1 > bx0 && by1 > by0);
const L = Exp.layers(d);
check("strates : une par rune, un seul groupe chacune", L.length === 3 && L.every((l) => (l.svg.match(/<g /g) || []).length === 1) && L[1].name === "02-Isa");
check("SVG : balises équilibrées", (svg.match(/<g /g) || []).length === (svg.match(/<\/g>/g) || []).length && svg.startsWith("<svg ") && svg.trimEnd().endsWith("</svg>"));

/* ---- comparaison */
const A = plate([rune("Gebo", 44, 64), rune("Isa", 140, 64)]);
check("comparaison : identiques", diff(A, JSON.parse(JSON.stringify(A))).same === true);
const B = plate([rune("Gebo", 44, 64, { f: 2 }), rune("Isa", 150, 64, { k: 1.5 }), rune("Ansuz", 0, 0)], { s: "cuir", t: 1 });
const r = diff(A, B, (s) => s.toUpperCase()).lines.join(" | ");
check("comparaison : ajout, miroir, déplacement, taille, support, strates", r.includes("« Ansuz » ajoutée") && r.includes("« Gebo » : retournée gauche ↔ droite") && r.includes("« Isa » : déplacée de 10 ; 0, taille 100 % → 150 %") && r.includes("Support : BOIS → CUIR") && r.includes("Strates colorées activées"), r);
check("comparaison : retrait", diff(B, A).lines.some((l) => l === "« Ansuz » retirée"));
check("comparaison : un petit écart (moins de 2 unités) n'est pas un déplacement", diff(A, plate([rune("Gebo", 45, 63), rune("Isa", 140, 64)])).same);
check("comparaison : même rune deux fois, appariées dans l'ordre", diff(plate([rune("Isa", 0, 0), rune("Isa", 100, 0)]), plate([rune("Isa", 0, 0), rune("Isa", 100, 50)])).lines.join() === "« Isa » : déplacée de 0 ; 50");
finish();
