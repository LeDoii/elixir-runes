// Fiche A4 : structure du PDF produit (table xref exacte, une page A4, image JPEG intégrée).
// À lancer depuis SiteRunes/ : node --no-warnings tools/test_sheet.mjs
import { createRequire } from "node:module";
import { check, finish } from "./testkit.mjs";
const Sheet = createRequire(import.meta.url)("../docs/sheet.js");

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const pdf = Sheet.buildPdf(jpeg, 2480, 3508);
const text = Buffer.from(pdf).toString("latin1");
check("PDF : en-tête et fin de fichier", text.startsWith("%PDF-1.4") && text.trimEnd().endsWith("%%EOF"));
const start = Number(text.match(/startxref\n(\d+)\n%%EOF/)[1]);
check("PDF : startxref pointe sur la table xref", text.slice(start, start + 4) === "xref");
const entries = [...text.slice(start).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
check("PDF : 5 objets déclarés", entries.length === 5);
check("PDF : chaque position pointe sur son objet", entries.every((off, i) => text.slice(off).startsWith((i + 1) + " 0 obj")), JSON.stringify(entries));
check("PDF : page A4 (595,28 x 841,89 pt)", text.includes("/MediaBox [0 0 595.28 841.89]"));
check("PDF : image JPEG intégrée avec sa taille réelle", text.includes("/Filter /DCTDecode /Length " + jpeg.length) && text.includes("/Width 2480 /Height 3508"));
const at = text.indexOf("stream\n", text.indexOf("/DCTDecode")) + 7;
check("PDF : octets du JPEG recopiés tels quels", [...pdf.slice(at, at + jpeg.length)].join() === [...jpeg].join());
check("PDF : longueur du flux de contenu exacte", (() => { const m = text.match(/4 0 obj\n<< \/Length (\d+) >>\nstream\n([^\n]*)\nendstream/); return m && Number(m[1]) === m[2].length; })());
finish();
