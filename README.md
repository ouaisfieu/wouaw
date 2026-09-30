# wouaw.

**Sept merveilles de la nature, calculées en direct.** Aucune vidéo, aucune image précalculée : chaque scène est une vraie simulation physique que votre carte graphique résout sous vos yeux, en WebGL2.

En ligne : <https://ouaisfieu.github.io/wouaw/>

| # | Scène | Ce qui est calculé |
|---|-------|--------------------|
| 01 | Encre | Équations de Navier-Stokes incompressibles, méthode *Stable Fluids* (Stam, 1999) avec confinement de vorticité |
| 02 | Taches | Réaction-diffusion de Gray-Scott (Turing, 1952), six régimes : corail, labyrinthe, mitose, vers, taches, trous |
| 03 | Blob | *Physarum polycephalum* : 262 144 agents à trois capteurs (Jones, 2010) |
| 04 | Papillon | Attracteur de Lorenz (1963) : 65 536 trajectoires intégrées en Runge-Kutta 4 |
| 05 | Trou noir | Lancer de rayons courbés en géométrie de Schwarzschild, disque d'accrétion, Doppler relativiste |
| 06 | Ondes | Équation d'onde 2D, bords absorbants, fentes de Young et écran d'intensité |
| 07 | Bulbe | Mandelbulb (White et Nylander, 2009) par *raymarching* d'estimateur de distance |

## Comment c'est fait

- `index.html`, `wouaw.css`, `js/`. Pas de build, pas de dépendance, pas de framework, aucun cookie ni traceur.
- `js/gl.js` : une petite couche WebGL2 (programmes, textures flottantes, *ping-pong*, dessin plein écran).
- `js/main.js` : chaque scène est un module chargé à la demande. Le contexte WebGL n'est créé qu'à l'approche de la scène et détruit quand on s'en éloigne (les navigateurs limitent le nombre de contextes). La résolution s'adapte en continu pour tenir la cadence.
- Tactile : faire défiler reste la priorité ; le bouton « toucher » permet d'interagir avec la simulation sans que la page bouge.
- « Réduire les animations » : chaque scène affiche une image fixe et un bouton « lancer ».
- Sans WebGL2 : les images fixes et les textes restent lisibles.
- SEO : Open Graph, `sitemap.xml` (avec images), `robots.txt`, JSON-LD schema.org (`WebSite`, `Article` + `LearningResource`, une `CreativeWork` par scène reliée à Wikipédia).

## Mise en ligne

Pousser le contenu de ce dossier à la racine de la branche `main`, puis *Settings → Pages → Deploy from a branch → `main` / `(root)`*.

Pour tester en local : `python3 -m http.server` puis ouvrir `http://localhost:8000/` (les modules ES exigent un serveur ; la page 404 suppose le chemin `/wouaw/`).

## Auteur et licences

Textes, code et images écrits et calculés par Claude (IA, Anthropic), avec carte blanche, à l'invitation d'un éditeur anonyme.
Textes et images : [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/deed.fr). Code : licence MIT (voir `LICENSE`).

Même auteur : [rien](https://ouaisfieu.github.io/rien/) (de quoi la science est-elle sûre ?) · [kiss](https://ouaisfieu.github.io/kiss/) (des règles simples, des mondes entiers).
