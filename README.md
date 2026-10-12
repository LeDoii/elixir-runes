# Les runes

Galerie des 24 runes et atelier de **dessin libre**, pour le serveur de jeu de rôle Elixir RP. Outil fan-made, non affilié à l'équipe d'Elixir RP.

## Ce que fait le site

- **Les runes** : les 24 runes ; le tracé se joue au survol de la carte, et la fiche donne les sens du livre et les traits.
- **Dessin libre** :
  - **sans modèle**, l'option « Envoyer la gravure » (activée par défaut) lance la recherche au clic : le tracé est gravé, recentré, puis le site compare ; désactivée, la recherche se met à jour à chaque trait ;
  - le site compare ton dessin aux 24 runes et affiche les plus proches, avec un pourcentage de correspondance ;
  - **avec un modèle**, tu t'entraînes à tracer la rune choisie (guidé, estompé ou de mémoire) et tu obtiens un pourcentage de précision.

- **Bindrune** : assemblage d'une bindrune. 4 runes au maximum (6 en mode avancé), choisies dans la palette par clic ou glisser-déposer, déplaçables sur la plaque. Les extrémités et les angles de chaque rune portent un point d'ancrage visible qui s'aimante à ceux des autres runes. Le magnétisme se coupe globalement ou rune par rune (actif par défaut). Une rune ne sort jamais du cadre (un ensemble plus grand que le cadre est centré). Un clic sur deux points d'ancrage qui se touchent lie les runes : les points de liaison deviennent verts et l'ensemble (runes liées) se déplace d'un bloc ; un second clic délie. Les boutons « Centrer la sélection » (rune ou ensemble) et « Tout centrer » recentrent ; la composition est toujours centrée avant l'export PNG. Les liaisons sont enregistrées avec la bindrune. Sous la plaque, chaque rune posée affiche ses sens et ses traits. Une bindrune se nomme et s'enregistre dans le navigateur.
- **Mes bindrunes** : liste des créations (rouvrir dans Bindrune, s'entraîner à les tracer, renommer, supprimer), partage par lien, import (lien, code ou fichier JSON) et export (une ou toutes). Les bindrunes apparaissent dans le choix du modèle du Dessin libre et dans l'onglet Bindrune.
- **Galerie** : bindrunes publiées par les joueurs (publication volontaire depuis un compte Discord), chacune créditée à son auteur (nom d'affichage Discord) avec sa description ; recherche, tri, ouverture dans Bindrune, entraînement, copie « d'après X ».
- **Combinaisons identiques** : à l'enregistrement, le site prévient (sans aucune incidence) si la même combinaison de runes, au point d'ancrage près, existe déjà dans tes bindrunes, sur ton compte ou dans la galerie.
- **Étiquettes** : chaque sens du Chapitre 7 d'une rune a sa liste d'étiquettes (vide si le sens n'en a pas volontairement), choisie par l'utilisateur avec `tools/choisir_etiquettes.py` (109 mots, synonymes conservés, au singulier, 20 caractères au plus). Dans l'onglet Bindrune, chaque rune garde tout ou partie de ses étiquettes (un interrupteur par étiquette dans « Ce que chaque rune apporte ») ; les étiquettes actives (en gris dans la fiche d'enregistrement) en découlent. On peut y ajouter jusqu'à 6 étiquettes, de la liste ou libres (2 à 20 caractères). Une bindrune porte au moins une étiquette. Les étiquettes gardées (champ `t` de chaque rune, absent si toutes sont gardées ; l'ancien format par indices de sens reste lu) et les étiquettes ajoutées voyagent avec la bindrune (liens, codes, codes courts, fichiers, compte) ; la galerie filtre par étiquette et la recherche texte les parcourt. Code : `docs/tags.js` et `server/lib/tags.js` (test de parité `tools/test_tags.mjs`), migration `0006_tags.sql`.
- **Complexité** : note de 0 à 100 (Simple, Modérée, Élevée, Très élevée, Extrême) affichée dans l'onglet Bindrune avec le détail, et sur les fiches de « Mes bindrunes », du compte et de la galerie. Elle additionne le nombre de runes (30 au plus), la difficulté de tracé (20), le nombre de traits (15), les runes répétées (10) et les sens opposés entre runes différentes (25, 8 par opposition). Seules les étiquettes actives comptent. Chaque étiquette est rattachée à une famille de sens (`FAMILIES` dans `docs/tags.js`, ex. Mort et Force destructrice → Destruction) et des familles s'opposent (`OPPOSED`, ex. Immobilité contre Mouvement) ; une opposition compte une fois par couple de familles et de runes. Familles et oppositions sont une interprétation, à valider. Repère du site, pas une règle du livre. Code : `docs/complexity.js`, test `tools/test_complexity.mjs`.
- **Dessin libre, comme dans Bindrune** : annuler et rétablir les traits (Ctrl+Z, Ctrl+Y), export PNG du tracé sur le support, mode étendu, barre d'outils en groupes.
- **Fiabilité** : page Santé de l'administration (base, erreurs, écritures du jour, limites du plan gratuit), sauvegarde JSON téléchargeable et restauration (`tools/restore_backup.mjs`), contrôle automatique avant publication (`tools/check.mjs`, GitHub Actions) : voir `CLOUDFLARE.md`, étape 7.
- **Icône** : bindrune Gebo + Isa gravée en clair sur fond d'encre (`tools/build_icon.py` → `docs/favicon.svg`, `favicon.ico`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `manifest.webmanifest`).
- **Mode étendu** (onglet Bindrune) : le bouton agrandit la conception sur toute la fenêtre (plaque agrandie, panneaux à côté) ; Échap désélectionne puis quitte.
- **Recherche par sens** : dans la liste des runes, un champ cherche (sans accent ni casse, début de mot) dans le nom, les étiquettes, la famille de sens et le texte du livre ; tous les mots tapés doivent se retrouver. Les étiquettes trouvées mènent à la galerie des bindrunes, dont la recherche parcourt aussi les étiquettes (via `qt`, calculé par le navigateur), les noms de runes, les descriptions et les auteurs.
- **Sélection multiple** (onglet Bindrune) : clic gauche maintenu sur le fond de la plaque pour entourer plusieurs runes (Maj ou Ctrl : ajouter, Ctrl+A : toutes, Échap : désélectionner) ; elles se déplacent, se centrent, se retirent ensemble, et les flèches les déplacent.
- **Description** : champ de 300 caractères sur chaque bindrune (Bindrune, « Mes bindrunes », liens, codes, fichiers, comptes, galerie).
- **Support de gravure** (Dessin libre et Bindrune) : bois (pyrogravure), pierre, métal (cuivre ciré ou acier brossé), os, défense, papier (encre), tissu (fil, pour un habit), cuir (gravure pressée et brunie ; support instable), cristal. Le fond et l'effet du tracé changent avec le support. Les supports et leur stabilité viennent des notes sur les bindrunes (bois, pierre, métal stables ; os, défense, papier, tissu instables ; cristal : amplifie la puissance ; aucun être vivant). Le rendu visuel de chaque effet est une interprétation. Le Bindrune permet aussi d'afficher les strates colorées (une couleur par rune).
- **Difficulté** : chaque rune a un niveau (1 à 5) et un rang sur 24 ; la galerie se trie par difficulté.

## Comment ça marche

Le dessin est comparé à chaque rune point par point, sur sa ligne centrale : **couverture** (part de la rune recouverte) × **précision** (part du dessin qui tombe sur la rune). Le calage automatique recentre et redimensionne le dessin sans corriger la rotation. Tout se calcule dans le navigateur.

La reconnaissance tient aussi compte de la **topologie** : nombre de formes (deux tracés qui se rejoignent n'en font qu'une) et de boucles (le rond du R, les deux ventres du B). Une forme ou une boucle de différence retire 20 % ou 15 % à la correspondance. `node tools/test_topology.js` compare avec et sans ce réglage (de 229 à 235 réussites sur 240 pour un tremblement fort, de 209 à 215 pour un tremblement très fort).

`node tools/test_recognition.js` vérifie la reconnaissance sur des copies tremblées, tournées et redimensionnées de chaque rune (93 à 100 % de réussite au premier rang).

## Contenu

- `docs/supports.js` : fonds et effets de gravure.
- `docs/` : site statique (GitHub Pages, branche `main`, dossier `/docs`).
- `tools/build_data.py` : régénère `docs/data.js` depuis la bibliothèque de runes (`Devoir/Bindrune/Runes/runes.json`, grille commune).
- `tools/test_recognition.js` : test de reconnaissance.
- `tools/build_difficulty.js` : calcule le classement de difficulté (`docs/difficulty.js`) : moyenne de 50 % de précision simulée à main levée (80 tracés par rune) et 50 % de complexité de forme.

Les sens affichés sur la fiche de chaque rune sont les descriptions du Chapitre 7 du livre de runes (`tools/descriptions.json`, source du `build_data.py`). Seules les descriptions des pages d'aett sont reprises ; les phrases composées sont découpées par idée, avec les mots du livre (connecteurs retirés, rares sujets ou verbes répétés pour que chaque idée se lise seule).

## Hébergement et API

Adresse du site : https://elixir-runes.ledoii.workers.dev. L'ancienne adresse GitHub Pages (https://ledoii.github.io/elixir-runes/) redirige vers elle (petit script en tête de `index.html` et `admin.html`, actif seulement sur `*.github.io`).

GitHub Pages sert le site seul. Sur Cloudflare, un Worker (`server/`, `wrangler.jsonc`) sert le site et ajoute les codes courts de partage (base D1). Connexion Discord facultative (permission `identify` seulement) pour retrouver ses bindrunes sur son compte. Voir `CLOUDFLARE.md`.

## Licence

Code : [MIT](LICENSE). Polices Italiana et Crimson Pro (`docs/fonts/`) sous [SIL OFL 1.1](https://openfontlicense.org).
