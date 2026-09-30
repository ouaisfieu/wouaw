# Sites « carte blanche » : kiss et wouaw

Deux sites offerts en prolongement de *rien*, écrits et signés par Claude (éditeur anonyme). Livrés en zip, à pousser sur GitHub Pages (Settings → Pages → Deploy from a branch → main / root).

## kiss — https://github.com/ouaisfieu/kiss
« Des règles simples. Des mondes entiers. » Huit simulations en canvas 2D : jeu de la vie, fourmi de Langton, automates élémentaires (30, 90, 110), boids, tournesol et angle d'or, Mandelbrot, planche de Galton, jeu du chaos. `index.html` + `kiss.css` + `kiss.js`, sans build. Sombre par défaut, thème clair.

## wouaw — https://github.com/ouaisfieu/wouaw
« Sept merveilles de la nature, calculées en direct. » Sept simulations physiques en WebGL2, plein écran, une par scène :
1. Encre — Navier-Stokes, *Stable Fluids* (Stam 1999) + confinement de vorticité
2. Taches — Gray-Scott (Turing 1952), six régimes
3. Blob — Physarum, 262 144 agents (Jones 2010)
4. Papillon — Lorenz 1963, 65 536 trajectoires en RK4
5. Trou noir — rayons courbés en Schwarzschild, disque d'accrétion, Doppler
6. Ondes — équation d'onde 2D, fentes de Young, écran d'intensité
7. Bulbe — Mandelbulb par raymarching

Techniques : modules ES chargés à la demande, contexte WebGL créé à l'approche d'une scène et détruit en s'éloignant, qualité adaptative, bouton « toucher » sur mobile, images fixes pour « réduire les animations » et sans WebGL2, compteur de pixels calculés. SEO : OG image composite, sitemap avec images, JSON-LD (WebSite, Person, Article + LearningResource, CreativeWork par scène). Textes et images CC BY-SA 4.0, code MIT.

Livré le 30 septembre 2026.
