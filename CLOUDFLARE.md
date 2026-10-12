# Hébergement Cloudflare (gratuit)

Un seul Worker, `elixir-runes`, sert le site (fichiers statiques de `docs/`) et l'API des codes courts (`/api/*`),
avec une base D1. La configuration est dans `wrangler.jsonc` ; le Worker est déployé par Workers Builds (relié au dépôt GitHub).

Sans la base, l'API répond 503 et le site masque les boutons de codes courts : rien ne casse.

## Étape 1 : codes courts (sans compte)

- `POST /api/codes` : enregistre une bindrune (validée côté serveur) et renvoie un code de 8 caractères (`ABCD-EF23`).
- `GET /api/codes/ABCD-EF23` : renvoie `{ name, d }`.
- `GET /api/health` : le site l'appelle pour savoir si l'API existe (elle n'existe pas sur GitHub Pages ni en local).
- Limites : 4 Ko par envoi, 30 envois par heure et par adresse IP (stockée seulement sous forme d'empreinte salée).

## Étape 2 : connexion Discord et bindrunes du compte

- `GET /api/auth/login` : envoie vers Discord (OAuth2, permission `identify` seulement). `GET /api/auth/callback` : échange le code, ouvre la session, revient sur le site.
- `GET /api/me`, `POST /api/auth/logout`, `DELETE /api/me` (supprime le compte et ses bindrunes).
- `GET/POST /api/my/bindrunes`, `DELETE /api/my/bindrunes/<id>` : bindrunes du compte (100 par compte, un nom par compte).
- Cookie de session `__Host-session` (HttpOnly, Secure, SameSite=Lax, 30 jours) ; seule l'empreinte du jeton est en base. Les routes qui modifient quelque chose exigent l'en-tête `Origin` du site (protection CSRF). Aucune route de compte n'a de CORS.
- Le jeton Discord est révoqué juste après la lecture de l'identité ; on ne stocke que l'identifiant, le pseudo et les dates.
- Un code court créé en étant connecté est rattaché au compte (`shared_bindrunes.user_id`).

### Configuration Discord (à faire une seule fois)

1. https://discord.com/developers/applications > New Application (nom : celui du site).
2. OAuth2 > Redirects > ajouter `https://elixir-runes.ledoii.workers.dev/api/auth/callback` (exactement).
3. Copier le Client ID (public) et le Client Secret (secret : ne jamais le mettre dans le dépôt ni dans un message).
4. Cloudflare > Worker `elixir-runes` > Settings > Variables and Secrets :
   - `DISCORD_CLIENT_ID` : déjà dans `wrangler.jsonc` (`vars`), car il est public. Une variable en texte ajoutée seulement dans le tableau de bord serait écrasée au prochain déploiement ;
   - `DISCORD_CLIENT_SECRET` (**secret**) ;
   - `ADMIN_IDS` (**secret**) : identifiants Discord des administrateurs, séparés par des virgules ;
   - `IP_SALT` (secret, facultatif) : chaîne aléatoire.
   Les secrets ne sont pas touchés par les déploiements.
5. Redéployer si besoin. Tant que ces variables manquent, `/api/me` répond `login: false` et le site cache la connexion.

## Mise en place

1. Base D1 `elixir-runes` (créée), schémas `migrations/0001_init.sql` et `0002_accounts.sql` appliqués.
2. `wrangler.jsonc` à la racine : Worker `elixir-runes`, `assets.directory = ./docs`, liaison `DB` vers la base, `run_worker_first = ["/api/*"]`.
3. Dans le tableau de bord, Worker `elixir-runes` > Settings > Build : commande de déploiement `npx wrangler deploy` (sans option `--assets`, la configuration vient du fichier).
4. (Facultatif) Secret `IP_SALT` : une chaîne aléatoire, pour saler l'empreinte des adresses IP.

## Fichiers

- `server/worker.js` : point d'entrée ; `server/api.js` : routes ; `server/auth.js` : connexion et compte ; `server/mine.js` : bindrunes du compte ; `server/lib/` : validation, codes, sessions, réponses HTTP.
- `server/lib/rune-data.js` est généré par `tools/build_data.py`.

## Tests

`node --no-warnings tools/test_functions.mjs` : le Worker avec une vraie base SQLite en mémoire (migrations appliquées) et un faux Discord : codes, connexion, sessions, CSRF, bindrunes du compte, limites, bannissement, suppression du compte.
