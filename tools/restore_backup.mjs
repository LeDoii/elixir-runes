// Restauration d'une sauvegarde (Administration > Santé > « Télécharger une sauvegarde ») : produit des instructions SQL,
// une par ligne, à coller dans la console du tableau de bord D1 (ou à passer à « wrangler d1 execute --file »).
//   node tools/restore_backup.mjs sauvegarde-runes-AAAA-MM-JJ.json > restauration.sql
// INSERT OR REPLACE : les lignes existantes sont écrasées, rien n'est supprimé. Les sessions ne sont pas sauvegardées :
// chacun se reconnecte avec Discord.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const TABLES = {
  users: ["id", "username", "global_name", "created_at", "last_login", "banned"],
  bindrunes: ["id", "user_id", "name", "name_key", "description", "tags", "data", "combo", "published", "published_at", "created_at", "updated_at"],
  shared_bindrunes: ["code", "name", "description", "tags", "data", "created_at", "user_id"],
  admin_log: ["id", "at", "admin_id", "admin_name", "action", "target", "detail"],
};
// Colonnes obligatoires absentes de la sauvegarde (jamais exportées) : l'empreinte d'adresse d'un code restauré est vide.
const CONSTANTS = { shared_bindrunes: { ip_hash: "" } };
const lit = (v) => (v === null || v === undefined ? "NULL" : typeof v === "number" ? (Number.isFinite(v) ? String(v) : "NULL") : typeof v === "boolean" ? (v ? "1" : "0") : "'" + String(v).replace(/'/g, "''") + "'");

/** Sauvegarde (objet) → liste d'instructions SQL. */
export function toSql(backup) {
  if (!backup || backup.format !== "elixir-runes-backup") throw new Error("Ce fichier n'est pas une sauvegarde du site.");
  const out = [];
  for (const [table, cols] of Object.entries(TABLES)) {
    for (const row of Array.isArray(backup[table]) ? backup[table] : []) {
      const extra = CONSTANTS[table] || {}, names = cols.concat(Object.keys(extra));
      out.push("INSERT OR REPLACE INTO " + table + " (" + names.join(", ") + ") VALUES (" + names.map((c) => lit(c in extra ? extra[c] : row[c])).join(", ") + ");");
    }
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const file = process.argv[2];
  if (!file) { console.error("Usage : node tools/restore_backup.mjs <sauvegarde.json>"); process.exit(1); }
  try { process.stdout.write(toSql(JSON.parse(readFileSync(file, "utf8"))).join("\n") + "\n"); }
  catch (e) { console.error("Erreur :", e.message); process.exit(1); }
}
