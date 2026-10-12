# Hébergement Cloudflare (gratuit)

Le site est statique (`docs/`). L'API des codes courts est en Pages Functions (`functions/`), qui utilisent une base D1.
Sans la base, l'API répond 503 et le site masque les boutons de codes courts : rien ne casse.

## Étape 1 : codes courts (sans compte)

- `POST /api/codes` : enregistre une bindrune (validée côté serveur) et renvoie un code de 8 caractères (`ABCD-EF23`).
- `GET /api/codes/ABCD-EF23` : renvoie `{ name, d }`.
- `GET /api/health` : le site l'appelle pour savoir si l'API existe (elle n'existe pas sur GitHub Pages ni en local).
- Limites : 4 Ko par envoi, 30 envois par heure et par adresse IP (stockée seulement sous forme d'empreinte salée).

## Mise en place

1. Projet Pages relié au dépôt : racine du projet vide, commande de build vide, dossier de sortie `docs`.
2. Créer la base D1 `elixir-runes`, puis y appliquer `migrations/0001_init.sql`.
3. Pages > projet > Settings > Bindings > Add > D1 database : nom de variable `DB`, base `elixir-runes`. Redéployer.
4. (Facultatif) Variable `IP_SALT` : une chaîne aléatoire, pour saler l'empreinte des adresses IP.

Pas de fichier `wrangler.toml` à la racine : il prendrait la main sur la configuration du tableau de bord.

## Tests

`node tools/test_functions.mjs` : Functions avec une base D1 simulée (validation, codes, limites, collisions).
