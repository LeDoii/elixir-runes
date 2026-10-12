// Validation côté serveur d'une bindrune reçue : jamais de confiance envers le client.
// Mêmes règles que docs/bindrunes.js (validate), avec le nombre de points d'ancrage par rune pour contrôler les liaisons.
import { ANCHORS } from "./rune-data.js";
import { RUNE_TAGS, keptIndexes } from "./tags.js";

export const MAX_NAME = 40;
export const MAX_RUNES = 6;
export const MAX_DESC = 300;
export const COLORS = ["#3D5C8C", "#7A4E7A", "#A4551F", "#2B2B2E", "#4E7A53", "#8C3D3D"];
// À garder alignés avec docs/supports.js
export const SUPPORT_IDS = ["bois", "pierre", "cuivre", "acier", "os", "defense", "papier", "tissu", "cristal"];

export const cleanName = (s) =>
  String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_NAME);

/** Description libre : une seule ligne de texte (retours à la ligne et caractères de contrôle remplacés par des espaces). */
export const cleanDescription = (s) =>
  String(s == null ? "" : s).replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_DESC);

const isNum = (v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 2000;
const known = (n) => typeof n === "string" && Object.prototype.hasOwnProperty.call(ANCHORS, n);

/** Retourne les données normalisées { r, s, t, l }, ou null si elles sont invalides. */
export function validateBindrune(d) {
  if (!d || !Array.isArray(d.r) || !d.r.length || d.r.length > MAX_RUNES) return null;
  const r = [];
  for (const e of d.r) {
    if (!e || !known(e.n) || !isNum(e.x) || !isNum(e.y)) return null;
    const entry = { n: e.n, x: Math.round(e.x * 10) / 10, y: Math.round(e.y * 10) / 10, m: e.m === 0 ? 0 : 1, c: COLORS.includes(e.c) ? e.c : COLORS[r.length % COLORS.length] };
    const kept = Array.isArray(e.t) ? keptIndexes(e) : null;                 // sens gardés de la rune (absent : tous)
    if (kept && kept.length < RUNE_TAGS[e.n].length) entry.t = kept;
    r.push(entry);
  }
  const l = (Array.isArray(d.l) ? d.l.slice(0, 20) : []).filter((k) =>
    Array.isArray(k) && k.length === 4 && k.every(Number.isInteger) &&
    k[0] !== k[1] && k[0] >= 0 && k[1] >= 0 && k[0] < r.length && k[1] < r.length &&
    k[2] >= 0 && k[3] >= 0 && k[2] < ANCHORS[r[k[0]].n] && k[3] < ANCHORS[r[k[1]].n]);
  return { r, s: SUPPORT_IDS.includes(d.s) ? d.s : "bois", t: d.t === 1 ? 1 : 0, l };
}
