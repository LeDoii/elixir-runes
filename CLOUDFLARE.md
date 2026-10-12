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

## Étape 3 : administration

Page `/admin.html` (lien « Administration » dans l'onglet « Mes bindrunes » pour les administrateurs). Réservée aux identifiants de `ADMIN_IDS`, vérifiés à chaque requête côté serveur.

- `GET /api/admin/stats`, `/api/admin/bindrunes` (comptes et codes courts réunis ; filtres `source`, `user`, `q` ; 30 par page), `/api/admin/users`, `/api/admin/log`, `/api/admin/export` (JSON).
- `DELETE /api/admin/bindrunes/<account|code>/<id>` ; `POST /api/admin/users/<id>/ban` `{ banned: true|false }` (un administrateur ne peut pas être bloqué ; bloquer coupe les sessions).
- Suppressions et blocages sont inscrits dans `admin_log` (migration `0003_admin.sql`).
- Aucune route d'admin n'a de CORS ; les modifications exigent l'en-tête `Origin` du site.

## Étape 4 : description et galerie publique

- Chaque bindrune a une description (300 caractères, une seule ligne), enregistrée avec le nom : localement, sur le compte (`bindrunes.description`), dans les liens, codes, fichiers JSON et codes courts (`shared_bindrunes.description`).
- Publication volontaire : `POST /api/my/bindrunes/<id>/publish` `{ published: true|false }` (bindrune du compte, protection CSRF).
- Galerie publique, lecture seule, sans cookie : `GET /api/gallery?q=&sort=recent|name&page=` (24 par page) et `GET /api/gallery/<id>`. Chaque élément porte son auteur (`global_name`, à défaut le pseudo) ; **jamais d'identifiant Discord** dans ces réponses. Les bindrunes non publiées et celles des comptes bloqués n'apparaissent pas ; la suppression d'un compte les retire.
- Une copie prise dans la galerie garde « d'après <auteur> » et ne peut pas être republiée telle quelle depuis « Mes bindrunes » (refaite dans le concepteur, c'est une nouvelle bindrune).
- Administration : état « publiée » et description visibles ; `POST /api/admin/bindrunes/account/<id>/unpublish` retire une bindrune de la galerie (journalisé `unpublish`) sans la supprimer du compte.
- Migration `0004_gallery.sql`. Tests : `node --no-warnings tools/test_gallery.mjs`.

## Étape 5 : combinaisons identiques

À l'enregistrement d'une bindrune, le site prévient (information seule, sans aucun effet) si **la même combinaison** existe déjà : mêmes runes, même agencement les unes par rapport aux autres, au point d'ancrage près (réseau de 24 px en colonne et 16,5 px en ligne ; un déplacement d'ensemble ou quelques pixels d'écart ne comptent pas ; le nom, la description, les couleurs, l'aimant, les liaisons et le support non plus).
- Empreinte : `docs/combo.js` (navigateur) et `server/lib/combo.js` (serveur), gardés identiques par `tools/test_combo.mjs`. Colonne `bindrunes.combo` (migration `0005_combo.sql`), calculée par le serveur à chaque enregistrement ; les anciennes lignes sont remplies à la demande.
- `POST /api/combo` `{ d }` : retourne les bindrunes **publiées** dans la galerie (nom et auteur) et, si l'appelant est connecté, les siennes. Une bindrune privée n'est jamais révélée à un autre.
- Le navigateur compare aussi avec les bindrunes de ce navigateur, au moment de « Enregistrer » dans le concepteur et de « Publier dans la galerie ».

## Mise en place

1. Base D1 `elixir-runes` (créée), schémas `migrations/0001_init.sql`, `0002_accounts.sql`, `0003_admin.sql`, `0004_gallery.sql` et `0005_combo.sql` appliqués.
2. `wrangler.jsonc` à la racine : Worker `elixir-runes`, `assets.directory = ./docs`, liaison `DB` vers la base, `run_worker_first = ["/api/*"]`.
3. Dans le tableau de bord, Worker `elixir-runes` > Settings > Build : commande de déploiement `npx wrangler deploy` (sans option `--assets`, la configuration vient du fichier).
4. (Facultatif) Secret `IP_SALT` : une chaîne aléatoire, pour saler l'empreinte des adresses IP.

## Fichiers

- `server/worker.js` : point d'entrée ; `server/api.js` : routes ; `server/auth.js` : connexion et compte ; `server/mine.js` : bindrunes du compte ; `server/admin.js` : administration ; `server/gallery.js` : galerie publique ; `server/lib/` : validation, codes, sessions, réponses HTTP.
- `server/lib/rune-data.js` est généré par `tools/build_data.py`.

## Tests

`node --no-warnings tools/test_functions.mjs` (codes, connexion, compte) `node --no-warnings tools/test_admin.mjs` (administration) `node --no-warnings tools/test_gallery.mjs` (galerie) et `node --no-warnings tools/test_combo.mjs` (combinaisons) : le Worker avec une vraie base SQLite en mémoire (migrations appliquées) et un faux Discord : codes, connexion, sessions, CSRF, bindrunes du compte, limites, bannissement, suppression du compte.

## Étape 6 : étiquettes

- Migration `migrations/0006_tags.sql` (colonnes `tags` de `bindrunes` et `shared_bindrunes`, texte JSON), à appliquer **avant** de publier le code.
- La colonne `tags` contient toutes les étiquettes de la bindrune (celles des sens gardés de ses runes, puis celles ajoutées), calculées par le serveur à l'enregistrement ; une bindrune publiée sans étiquette (avant cette étape) est complétée à la première lecture de la galerie. `GET /api/gallery?tag=<étiquette>` filtre dessus ; `q` cherche aussi dans les étiquettes. Un enregistrement sans aucune étiquette est refusé (400).
- Normalisation et étiquettes verrouillées : `docs/tags.js` et `server/lib/tags.js`, gardés identiques par `tools/test_tags.mjs`.
