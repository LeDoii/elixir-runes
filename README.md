# Les runes

Galerie des 24 runes et atelier de **dessin libre**, pour le serveur de jeu de rôle Elixir RP. Outil fan-made, non affilié à l'équipe d'Elixir RP.

## Ce que fait le site

- **Les runes** : les 24 runes ; le tracé se joue au survol de la carte, et la fiche donne les sens du livre et les traits.
- **Dessin libre** :
  - **sans modèle**, l'option « Envoyer la gravure » (activée par défaut) lance la recherche au clic : le tracé est gravé, recentré, puis le site compare ; désactivée, la recherche se met à jour à chaque trait ;
  - le site compare ton dessin aux 24 runes et affiche les plus proches, avec un pourcentage de correspondance ;
  - **avec un modèle**, tu t'entraînes à tracer la rune choisie (guidé, estompé ou de mémoire) et tu obtiens un pourcentage de précision.

- **Concepteur** : assemblage d'une bindrune. 4 runes au maximum (6 en mode avancé), choisies dans la palette par clic ou glisser-déposer, déplaçables sur la plaque. Les extrémités et les angles de chaque rune portent un point d'ancrage visible qui s'aimante à ceux des autres runes. Le magnétisme se coupe globalement ou rune par rune (actif par défaut). Une rune ne sort jamais du cadre (un ensemble plus grand que le cadre est centré). Un clic sur deux points d'ancrage qui se touchent lie les runes : les points de liaison deviennent verts et l'ensemble (runes liées) se déplace d'un bloc ; un second clic délie. Les boutons « Centrer la sélection » (rune ou ensemble) et « Tout centrer » recentrent ; la composition est toujours centrée avant l'export PNG. Les liaisons sont enregistrées avec la bindrune. Sous la plaque, chaque rune posée affiche ses sens et ses traits. Une bindrune se nomme et s'enregistre dans le navigateur.
- **Mes bindrunes** : liste des créations (rouvrir dans le concepteur, s'entraîner à les tracer, renommer, supprimer), partage par lien, import (lien, code ou fichier JSON) et export (une ou toutes). Les bindrunes apparaissent dans le choix du modèle du Dessin libre et dans le Concepteur.
- **Support de gravure** (Dessin libre et Concepteur) : bois (pyrogravure), pierre, métal (cuivre ciré ou acier brossé), os, défense, papier (encre), tissu (fil, pour un habit), cristal. Le fond et l'effet du tracé changent avec le support. Les supports et leur stabilité viennent des notes sur les bindrunes (bois, pierre, métal stables ; os, défense, papier, tissu instables ; cristal : amplifie la puissance ; aucun être vivant). Le rendu visuel de chaque effet est une interprétation. Le Concepteur permet aussi d'afficher les strates colorées (une couleur par rune).
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

GitHub Pages sert le site seul. Sur Cloudflare, un Worker (`server/`, `wrangler.jsonc`) sert le site et ajoute les codes courts de partage (base D1). Voir `CLOUDFLARE.md`.

## Licence

Code : [MIT](LICENSE). Polices Italiana et Crimson Pro (`docs/fonts/`) sous [SIL OFL 1.1](https://openfontlicense.org).
