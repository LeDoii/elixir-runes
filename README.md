# Les runes

Galerie des 24 runes et atelier de **dessin libre**, pour le serveur de jeu de rôle Elixir RP. Outil fan-made, non affilié à l'équipe d'Elixir RP.

## Ce que fait le site

- **Les runes** : les 24 runes, chacune avec son tracé animé trait par trait.
- **Dessin libre** :
  - **sans modèle**, le site compare ton dessin aux 24 runes et affiche les plus proches, avec un pourcentage de correspondance ;
  - **avec un modèle**, tu t'entraînes à tracer la rune choisie (guidé, estompé ou de mémoire) et tu obtiens un pourcentage de précision.

- **Concepteur** : assemblage d'une bindrune. 4 runes au maximum (6 en mode avancé), choisies dans la palette par clic ou glisser-déposer, déplaçables sur la plaque. Les extrémités et les angles de chaque rune portent un point d'ancrage visible qui s'aimante à ceux des autres runes. Le magnétisme se coupe globalement ou rune par rune (actif par défaut). Export PNG.
- **Difficulté** : chaque rune a un niveau (1 à 5) et un rang sur 24 ; la galerie se trie par difficulté.

## Comment ça marche

Le dessin est comparé à chaque rune point par point, sur sa ligne centrale : **couverture** (part de la rune recouverte) × **précision** (part du dessin qui tombe sur la rune). Le calage automatique recentre et redimensionne le dessin sans corriger la rotation. Tout se calcule dans le navigateur.

`node tools/test_recognition.js` vérifie la reconnaissance sur des copies tremblées, tournées et redimensionnées de chaque rune (93 à 100 % de réussite au premier rang).

## Contenu

- `docs/` : site statique (GitHub Pages, branche `main`, dossier `/docs`).
- `tools/build_data.py` : régénère `docs/data.js` depuis la bibliothèque de runes (`Devoir/Bindrune/Runes/runes.json`, grille commune).
- `tools/test_recognition.js` : test de reconnaissance.
- `tools/build_difficulty.js` : calcule le classement de difficulté (`docs/difficulty.js`) : moyenne de 50 % de précision simulée à main levée (80 tracés par rune) et 50 % de complexité de forme.

Les runes ne sont présentées que par leur nom et leur forme, sans les textes du Chapitre 7.

## Licence

Code : [MIT](LICENSE). Polices Italiana et Crimson Pro (`docs/fonts/`) sous [SIL OFL 1.1](https://openfontlicense.org).
