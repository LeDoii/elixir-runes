// Tests des Pages Functions (codes courts) avec une base D1 simulée.
// À lancer depuis SiteRunes/ : node tools/test_functions.mjs
import { onRequestPost } from "../functions/api/codes/index.js";
import { onRequestGet } from "../functions/api/codes/[code].js";
import { onRequestGet as health } from "../functions/api/health.js";
import { normalizeCode, newCode } from "../server/lib/codes.js";

// D1 minimale : seules les trois requêtes utilisées par les Functions.
function fakeDB() {
  const rows = [];
  return {
    rows,
    prepare(sql) {
      return {
        bind(...a) {
          return {
            async first() {
              if (/COUNT/.test(sql)) return { n: rows.filter((r) => r.ip_hash === a[0] && r.created_at > a[1]).length };
              if (/SELECT name, data/.test(sql)) return rows.find((r) => r.code === a[0]) || null;
              throw new Error("requête inconnue : " + sql);
            },
            async run() {
              if (rows.some((r) => r.code === a[0])) throw new Error("UNIQUE constraint failed: shared_bindrunes.code");
              rows.push({ code: a[0], name: a[1], data: a[2], created_at: a[3], ip_hash: a[4] });
            },
          };
        },
      };
    },
  };
}

let failed = 0;
const check = (label, ok, extra = "") => { if (!ok) failed++; console.log((ok ? "ok   " : "ECHEC") + " " + label + (ok ? "" : " " + extra)); };
const post = (env, body, ip = "1.2.3.4") =>
  onRequestPost({ env, request: new Request("https://x/api/codes", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "CF-Connecting-IP": ip } }) });
const get = (env, code) => onRequestGet({ env, params: { code } });

const env = { DB: fakeDB() };
const good = { name: "  Ma   création ", d: { r: [{ n: "Gebo", x: 44, y: 64, m: 1, c: "#3D5C8C" }, { n: "Mannaz", x: 44, y: 64, m: 1, c: "#7A4E7A" }], s: "pierre", t: 0, l: [[0, 1, 0, 2], [0, 1, 99, 0], [1, 1, 0, 0]] } };

let r = await post(env, good);
let j = await r.json();
check("POST valide : 201 et code de 8 caractères", r.status === 201 && /^[A-Z2-9]{8}$/.test(j.code) && /^.{4}-.{4}$/.test(j.display), JSON.stringify(j));

r = await get(env, j.display.toLowerCase());
const got = await r.json();
check("GET avec code en minuscules et tiret", r.status === 200 && got.name === "Ma création", JSON.stringify(got));
check("liaisons invalides retirées, support gardé", JSON.stringify(got.d.l) === "[[0,1,0,2]]" && got.d.s === "pierre", JSON.stringify(got.d));

r = await get(env, "ZZZZZZZZ");
check("GET code inconnu : 404", r.status === 404);
r = await get(env, "abc");
check("GET code mal formé : 400", r.status === 400);
r = await get(env, "ABCD-EFG0");
check("GET code avec caractère interdit : 400", r.status === 400);

r = await post(env, { name: "X", d: { r: [{ n: "Nope", x: 0, y: 0 }] } });
check("rune inconnue : 400", r.status === 400);
r = await post(env, { name: "X", d: { r: [{ n: "constructor", x: 0, y: 0 }] } });
check("nom de rune piégé (constructor) : 400", r.status === 400);
r = await post(env, { name: "   ", d: good.d });
check("nom vide : 400", r.status === 400);
r = await post(env, "pas du json");
check("JSON invalide : 400", r.status === 400);
r = await post(env, JSON.stringify({ name: "x", d: good.d, bourrage: "a".repeat(5000) }));
check("trop volumineux : 413", r.status === 413);
r = await post({}, good);
check("sans base : 503", r.status === 503);

// limitation d'envois : 30 par heure et par adresse
const env2 = { DB: fakeDB() };
let last;
for (let i = 0; i < 31; i++) last = await post(env2, good, "9.9.9.9");
check("31e envoi de la même adresse : 429", last.status === 429);
r = await post(env2, good, "8.8.8.8");
check("une autre adresse n'est pas limitée", r.status === 201);
check("l'adresse IP n'est jamais stockée", env2.DB.rows.every((x) => !/9\.9\.9\.9/.test(JSON.stringify(x))));

// collision de code : le serveur retire un autre code (on force newCode via une base qui refuse le premier)
const env3 = { DB: fakeDB() };
let calls = 0;
const real = env3.DB.prepare.bind(env3.DB);
env3.DB.prepare = (sql) => {
  const st = real(sql);
  if (!/INSERT/.test(sql)) return st;
  return { bind: (...a) => ({ run: async () => { if (calls++ < 2) throw new Error("UNIQUE constraint failed"); return st.bind(...a).run(); } }) };
};
r = await post(env3, good);
check("collision : réessaie et réussit", r.status === 201 && calls === 3, "appels " + calls);

check("normalizeCode refuse O, I, L, 0, 1", normalizeCode("ABCDEFG0") === null && normalizeCode("ABCDEFGI") === null && normalizeCode("ABCDEFGL") === null);
const codes = new Set(Array.from({ length: 2000 }, () => newCode()));
check("2000 codes tirés, tous valides et distincts", codes.size === 2000 && [...codes].every((c) => normalizeCode(c) === c));
r = health({ env });
check("health", (await r.json()).ok === true);

console.log(failed ? "\n" + failed + " échec(s)" : "\nTout est bon");
process.exit(failed ? 1 : 0);
