# Hébergement Cloudflare (gratuit)

Un seul Worker, `elixir-runes`, sert le site (fichiers statiques de `docs/`) et l'API des codes courts (`/api/*`),
avec une base D1. La configuration est dans `wrangler.jsonc` ; le Worker est déployé par Workers Builds (relié au dépôt GitHub).

Sans la base, l'API répond 503 et le site masque les boutons de codes courts : rien ne casse.

## Étape 1 : codes courts (sans compte)

- `POST /api/codes` : enregistre une bindrune (validée côté serveur) et renvoie un code de 8 caractères (`ABCD-EF23`).
- `GET /api/codes/ABCD-EF23` : renvoie `{ name, d }`.
- `GET /api/health` : le site l'appelle pour savoir si l'API existe (elle n'existe pas sur GitHub Pages ni en local).
- Limites : 4 Ko par envoi, 30 envois par heure et par adresse IP (stockée seulement sous forme d'empreinte salée).

## Mise en place

1. Base D1 `elixir-runes` (créée), schéma `migrations/0001_init.sql` appliqué.
2. `wrangler.jsonc` à la racine : Worker `elixir-runes`, `assets.directory = ./docs`, liaison `DB` vers la base, `run_worker_first = ["/api/*"]`.
3. Dans le tableau de bord, Worker `elixir-runes` > Settings > Build : commande de déploiement `npx wrangler deploy` (sans option `--assets`, la configuration vient du fichier).
4. (Facultatif) Secret `IP_SALT` : une chaîne aléatoire, pour saler l'empreinte des adresses IP.

## Fichiers

- `server/worker.js` : point d'entrée ; `server/api.js` : routes ; `server/lib/` : validation, codes, réponses HTTP.
- `server/lib/rune-data.js` est généré par `tools/build_data.py`.

## Tests

`node tools/test_functions.mjs` : le Worker avec une base D1 simulée (validation, codes, limites, collisions, routes).
