// Contrôle avant publication : syntaxe de tous les scripts, cohérence des migrations et de la configuration, tests.
// À lancer depuis SiteRunes/ :  node --no-warnings tools/check.mjs
// Utilisé par GitHub Actions (.github/workflows/check.yml) et peut servir de « commande de build » de Cloudflare
// (Workers & Pages > elixir-runes > Settings > Build > Build command) : un échec annule alors la mise en ligne.
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
let failures = 0;
const step = (label, ok, detail = "") => { if (!ok) failures++; console.log((ok ? "ok     " : "ÉCHEC  ") + label + (ok || !detail ? "" : "\n" + String(detail).split("\n").slice(0, 12).map((l) => "         " + l).join("\n"))); };
const run = (args) => spawnSync(process.execPath, ["--no-warnings", ...args], { cwd: ROOT, encoding: "utf8" });
const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? (f === "node_modules" || f.startsWith(".") ? [] : walk(p)) : [p]; });

/* ---- 1. syntaxe */
const scripts = ["docs", "server", "tools"].flatMap((d) => walk(join(ROOT, d))).filter((p) => /\.(js|mjs)$/.test(p) && !/data\.js$|difficulty\.js$/.test(p));
const bad = scripts.map((p) => [p, run(["--check", p])]).filter(([, r]) => r.status !== 0);
step("syntaxe de " + scripts.length + " scripts", !bad.length, bad.map(([p, r]) => relative(ROOT, p) + "\n" + r.stderr).join("\n"));

/* ---- 2. migrations : toutes déclarées dans les tests, numérotées sans trou */
const migs = readdirSync(join(ROOT, "migrations")).filter((f) => f.endsWith(".sql")).sort();
const kit = readFileSync(join(ROOT, "tools", "testkit.mjs"), "utf8");
step("migrations numérotées sans trou", migs.every((f, i) => f.startsWith(String(i + 1).padStart(4, "0") + "_")), migs.join(", "));
step("migrations toutes chargées par les tests (testkit.mjs)", migs.every((f) => kit.includes('"' + f + '"')), migs.filter((f) => !kit.includes('"' + f + '"')).join(", "));

/* ---- 3. configuration Cloudflare */
try {
  const cfg = JSON.parse(readFileSync(join(ROOT, "wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, ""));
  step("wrangler.jsonc : script et dossier des fichiers statiques présents", existsSync(join(ROOT, cfg.main)) && existsSync(join(ROOT, cfg.assets.directory)));
  step("wrangler.jsonc : base D1 liée", Array.isArray(cfg.d1_databases) && cfg.d1_databases.some((d) => d.binding === "DB" && d.database_id));
} catch (e) { step("wrangler.jsonc lisible", false, e.message); }

/* ---- 4. fichiers générés : icône, données, manifeste */
for (const f of ["docs/index.html", "docs/data.js", "docs/favicon.svg", "docs/manifest.webmanifest", "server/lib/rune-data.js"]) step("présent : " + f, existsSync(join(ROOT, f)));
try { JSON.parse(readFileSync(join(ROOT, "docs/manifest.webmanifest"), "utf8")); step("manifest.webmanifest valide", true); } catch (e) { step("manifest.webmanifest valide", false, e.message); }

/* ---- 5. tests (ceux qui utilisent la base SQLite en mémoire sont sautés si Node ne l'a pas) */
let sqlite = true;
try { await import("node:sqlite"); } catch (e) { sqlite = false; }
const tests = readdirSync(join(ROOT, "tools")).filter((f) => /^test_.*\.(mjs|js)$/.test(f)).sort();
for (const t of tests) {
  const needsDb = readFileSync(join(ROOT, "tools", t), "utf8").includes("testkit.mjs");
  if (needsDb && !sqlite) { console.log("saute   " + t + " (node:sqlite indisponible dans cette version de Node)"); continue; }
  const r = run([join("tools", t)]);
  step(t, r.status === 0, (r.stdout || "").split("\n").filter((l) => /^ECHEC|échec|Error/.test(l)).join("\n") + (r.stderr || "").slice(0, 600));
}

console.log(failures ? "\n" + failures + " contrôle(s) en échec : ne pas publier." : "\nTout est bon : publication possible.");
process.exit(failures ? 1 : 0);
