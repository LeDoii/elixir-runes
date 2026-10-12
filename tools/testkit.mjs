// Outils communs des tests du Worker : base SQLite en mémoire avec les migrations, faux Discord, requêtes, connexion.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker from "../server/worker.js";

/* ---------------------------------------------------------------- base D1 simulée (SQLite) */
function d1(sqlite) {
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => sqlite.prepare(sql).get(...args) || null,
    all: async () => ({ results: sqlite.prepare(sql).all(...args) }),
    run: async () => { const r = sqlite.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
  });
  return { prepare: (sql) => stmt(sql), batch: async (list) => { for (const s of list) await s.run(); return []; }, raw: sqlite };
}
function freshDb() {
  const sqlite = new DatabaseSync(":memory:");
  ["0001_init.sql", "0002_accounts.sql", "0003_admin.sql"].forEach((f) => sqlite.exec(readFileSync(new URL("../migrations/" + f, import.meta.url), "utf8")));
  return d1(sqlite);
}

/* ---------------------------------------------------------------- faux Discord */
export const discord = { tokenOk: true, user: { id: "111111111111111111", username: "viktor", global_name: "Viktor" }, calls: [] };
globalThis.fetch = async (url, init) => {
  const u = String(url);
  discord.calls.push(u);
  if (u.endsWith("/api/oauth2/token")) return discord.tokenOk ? Response.json({ access_token: "tok" }) : new Response("{}", { status: 400 });
  if (u.endsWith("/api/users/@me")) return Response.json(discord.user);
  if (u.endsWith("/token/revoke")) return new Response("{}");
  throw new Error("appel inattendu : " + u);
};

/* ---------------------------------------------------------------- outils */
let failed = 0;
export const check = (label, ok, extra = "") => { if (!ok) failed++; console.log((ok ? "ok   " : "ECHEC") + " " + label + (ok ? "" : " " + extra)); };
export const finish = () => { console.log(failed ? failed + " échec(s)" : "Tout est bon"); process.exit(failed ? 1 : 0); };
export const ASSETS = { fetch: async () => new Response("fichier statique", { status: 200 }) };
export const ORIGIN = "https://site.test";
export const baseEnv = (over = {}) => Object.assign({ ASSETS, DB: freshDb(), DISCORD_CLIENT_ID: "cid", DISCORD_CLIENT_SECRET: "secret" }, over);
export const call = (env, path, init = {}) => worker.fetch(new Request(ORIGIN + path, init), env);
export const cookieOf = (res) => (res.headers.getSetCookie ? res.headers.getSetCookie() : []).map((c) => c.split(";")[0]).filter((c) => !/=$/.test(c)).join("; ");
export const post = (env, path, body, headers = {}) => call(env, path, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers });
export const same = (cookie) => ({ Origin: ORIGIN, Cookie: cookie });

export async function loginAs(env, user) {
  if (user) discord.user = user;
  const start = await call(env, "/api/auth/login");
  const state = new URL(start.headers.get("Location")).searchParams.get("state");
  const res = await call(env, "/api/auth/callback?code=abc&state=" + state, { headers: { Cookie: cookieOf(start) } });
  return { start, res, cookie: cookieOf(res) };
}

export const good = { name: "  Ma   création ", d: { r: [{ n: "Gebo", x: 44, y: 64, m: 1, c: "#3D5C8C" }, { n: "Mannaz", x: 44, y: 64, m: 1, c: "#7A4E7A" }], s: "pierre", t: 0, l: [[0, 1, 0, 2], [0, 1, 99, 0], [1, 1, 0, 0]] } };

