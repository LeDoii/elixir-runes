// Suivi du site : erreurs, compteurs, santé, sauvegarde et restauration. À lancer depuis SiteRunes/ : node --no-warnings tools/test_monitor.mjs
import { check, finish, baseEnv, call, post, same, good, loginAs } from "./testkit.mjs";
import { toSql } from "./restore_backup.mjs";

const ADMIN = "111111111111111111", ALICE = "222222222222222222";
const env = baseEnv({ ADMIN_IDS: ADMIN });
const admin = await loginAs(env, { id: ADMIN, username: "root", global_name: "Root" });
const alice = await loginAs(env, { id: ALICE, username: "alice", global_name: "Alice" });
const get = (path, user) => call(env, path, { headers: user ? { Cookie: user.cookie } : {} });
const today = new Date().toISOString().slice(0, 10);

/* ---- accès */
check("santé : refusée sans connexion", (await get("/api/admin/health")).status === 401);
check("santé : refusée à un joueur", (await get("/api/admin/health", alice)).status === 403);
check("sauvegarde : refusée sans connexion", (await get("/api/admin/backup")).status === 401);
check("sauvegarde : refusée à un joueur", (await get("/api/admin/backup", alice)).status === 403);

/* ---- compteurs d'écritures */
await post(env, "/api/my/bindrunes", { name: "Première", d: good.d }, same(alice.cookie));
await post(env, "/api/my/bindrunes", { name: "Seconde", d: good.d }, same(alice.cookie));
await post(env, "/api/codes", { name: "Un code", d: good.d }, { "CF-Connecting-IP": "5.5.5.5" });
await post(env, "/api/combo", { d: good.d });
await call(env, "/api/my/bindrunes", { method: "POST", body: "pas du json", headers: same(alice.cookie) });
let h = await (await get("/api/admin/health", admin)).json();
const u = h.usage.find((x) => x.day === today);
check("compteur : 3 écritures réussies (le refus et /api/combo ne comptent pas)", u && u.mutations === 3, JSON.stringify(h.usage));
check("santé : comptes et bindrunes", h.counts.users === 2 && h.counts.bindrunes === 2 && h.counts.codes === 1 && h.counts.published === 0 && h.counts.errors_24h === 0, JSON.stringify(h.counts));
check("santé : limites du plan gratuit rappelées", h.limits.rows_written_per_day === 100000 && h.limits.rows_read_per_day === 5000000);
check("santé : base joignable", h.db.ok === true);

/* ---- erreurs du serveur */
const real = env.DB;
env.DB = { raw: real.raw, batch: real.batch, prepare: (sql) => { if (/FROM bindrunes b JOIN users/.test(sql)) throw new Error("boum " + "x".repeat(500)); return real.prepare(sql); } };
const bad = await call(env, "/api/gallery?code=secret123&state=zzz");
env.DB = real;
check("erreur serveur : réponse 500 propre", bad.status === 500 && (await bad.json()).error === "Erreur du serveur.");
h = await (await get("/api/admin/health", admin)).json();
check("erreur journalisée avec la méthode et le chemin seul", h.errors.length === 1 && h.errors[0].method === "GET" && h.errors[0].path === "/api/gallery", JSON.stringify(h.errors));
check("erreur : aucun paramètre d'adresse conservé", !JSON.stringify(h.errors).includes("secret123"));
check("erreur : message tronqué à 300 caractères", h.errors[0].message.length <= 300);
check("compteur d'erreurs du jour", h.usage.find((x) => x.day === today).errors === 1 && h.counts.errors_24h === 1);

// la base elle-même en panne : ni plantage, ni boucle
env.DB = { raw: real.raw, batch: real.batch, prepare: () => { throw new Error("base en panne"); } };
const down = await call(env, "/api/gallery");
env.DB = real;
check("base en panne : 500 sans plantage du journal", down.status === 500);

// le journal ne garde que les 200 dernières erreurs
for (let i = 0; i < 205; i++) real.raw.prepare("INSERT INTO error_log (at, method, path, message) VALUES (?, 'GET', '/x', 'm')").run(i);
env.DB = { raw: real.raw, batch: real.batch, prepare: (sql) => { if (/FROM bindrunes b JOIN users/.test(sql)) throw new Error("encore"); return real.prepare(sql); } };
await call(env, "/api/gallery");
env.DB = real;
check("journal d'erreurs : 200 lignes au plus", real.raw.prepare("SELECT COUNT(*) AS n FROM error_log").get().n === 200);

/* ---- sauvegarde et restauration */
await call(env, "/api/my/bindrunes", { method: "POST", body: JSON.stringify({ name: "L'été d'Alice", description: "Une 'description' avec ; des signes", tags: ["Mon projet"], d: good.d }), headers: same(alice.cookie) });
const res = await get("/api/admin/backup", admin);
const text = await res.text();
const b = JSON.parse(text);
check("sauvegarde : fichier JSON à télécharger", res.status === 200 && /attachment; filename="sauvegarde-runes-\d{4}-\d{2}-\d{2}\.json"/.test(res.headers.get("Content-Disposition")) && b.format === "elixir-runes-backup");
check("sauvegarde : comptes, bindrunes, codes", b.users.length === 2 && b.bindrunes.length === 3 && b.shared_bindrunes.length === 1);
check("sauvegarde : ni sessions, ni empreintes d'adresse, ni jetons", !/session|ip_hash|token/i.test(Object.keys(b).join() + JSON.stringify(b.users[0]) + JSON.stringify(b.shared_bindrunes[0])));
check("sauvegarde : l'action est inscrite au journal", real.raw.prepare("SELECT COUNT(*) AS n FROM admin_log WHERE action = 'backup'").get().n === 1);
const sql = toSql(b);
check("restauration : une instruction par ligne", sql.length === 2 + 3 + 1 + b.admin_log.length && sql.every((l) => l.startsWith("INSERT OR REPLACE INTO ") && !l.includes("\n")));
const fresh = baseEnv();
sql.forEach((l) => fresh.DB.raw.exec(l));
const back = fresh.DB.raw.prepare("SELECT name, description, tags, data, user_id FROM bindrunes WHERE name = ?").get("L'été d'Alice");
const orig = real.raw.prepare("SELECT name, description, tags, data, user_id FROM bindrunes WHERE name = ?").get("L'été d'Alice");
check("restauration : base neuve retrouvée à l'identique (apostrophes, accents, JSON)", JSON.stringify(back) === JSON.stringify(orig));
check("restauration : comptes et codes", fresh.DB.raw.prepare("SELECT COUNT(*) AS n FROM users").get().n === 2 && fresh.DB.raw.prepare("SELECT COUNT(*) AS n FROM shared_bindrunes").get().n === 1);
sql.forEach((l) => fresh.DB.raw.exec(l));
check("restauration : rejouable sans doublons", fresh.DB.raw.prepare("SELECT COUNT(*) AS n FROM bindrunes").get().n === 3);
let refused = false; try { toSql({ format: "autre" }); } catch (e) { refused = true; }
check("restauration : un autre fichier est refusé", refused);
check("restauration : injection dans une valeur neutralisée", toSql({ format: "elixir-runes-backup", users: [{ id: "1'); DROP TABLE users; --", username: "x" }] })[0].includes("'1''); DROP TABLE users; --'"));

finish();
