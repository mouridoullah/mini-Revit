# ADR-057 : Indexation Spatiale 2D, Frustum Culling et Modularisation des Moteurs de Rendu

- **Statut :** Accepté
- **Date :** 2026-11-19
- **Auteurs :** Équipe Mini-BIM (Préparation Phase 9.3)
- **Décideurs :** Architecture Core, Visualisation 2D/3D & Direction Technique
- **Références :** ADR-052 (Neutralité de View2D), ADR-055 (Modularisation du Noyau), Phase 9.1 (Goulot Rendu 2D à 270 ms)

---

## 1. Contexte

Lors du benchmark d'échelle de la Phase 9.1 sur une maquette synthétique réaliste multi-catégories de 1 000 entités (~400 murs, 200 ouvertures, mobilier, dalles, toits, escaliers), le rendu 2D Canvas unifié (`renderPlanView`) a révélé un goulot de performance sévère :
- Temps de frame 2D : **270 ms** (~3,7 FPS), très au-delà du budget interactif de **16,67 ms** (60 FPS) et du budget de transaction de 50 ms.
- Cause racine : L'absence totale de filtrage spatial et d'indexation par niveau contraignait `renderPlanView` à parcourir l'intégralité des éléments de la maquette (tous étages cumulés) et à exécuter la résolution géométrique des jonctions de murs (`solveWallJunctions`) sur plusieurs centaines de murs simultanément, dont 85 à 95% étaient hors de l'écran ou sur d'autres niveaux.
- Complexité des monolithes : `packages/view-2d/src/renderer.ts` (~1 946 lignes) et `packages/view-3d/src/mesh-generator.ts` (~1 568 lignes) dépassaient largement le seuil de maintenabilité de 1 500 lignes, créant un risque de régression critique avant d'y intégrer la visualisation MEP (Phase 9.3).

---

## 2. Décisions Architecturales

### 2.1. Modularisation en Sous-Modules de Domaine

1. **Générateur de Maillages 3D (`packages/view-3d/src/mesh-generator/`) :**
   - Scindé en 8 modules étanches : `types.ts`, `walls.ts`, `openings.ts`, `slabs.ts`, `stairs.ts`, `roofs.ts`, `rooms.ts`, `index.ts`.
   - Façade publique rétrocompatible conservée dans `packages/view-3d/src/mesh-generator.ts` (8 lignes).
   - Taille maximale de module : 436 lignes (`roofs.ts`), zéro fichier > 500 lignes.

2. **Moteur de Rendu 2D Canvas (`packages/view-2d/src/renderer/`) :**
   - Scindé en 12 modules spécialisés : `config.ts`, `grid.ts`, `walls.ts`, `openings.ts`, `slabs.ts`, `stairs.ts`, `roofs.ts`, `rooms.ts`, `dimensions.ts`, `underlay.ts`, `preview.ts`, `plan-view.ts`, `index.ts`.
   - Façade publique rétrocompatible conservée dans `packages/view-2d/src/renderer.ts` (8 lignes).
   - Intégration pure et découplée de l'orchestration dans `plan-view.ts`.

### 2.2. Indexation Spatiale par Grille Uniforme (`SpatialGrid2D`)

Pour garantir un Frustum Culling ultra-rapide à chaque rafraîchissement d'affichage, un moteur d'indexation spatiale 2D pur et indépendant a été créé sous `packages/view-2d/src/spatial/` :
- **Choix de structure : Grille Spatiale Uniforme (Uniform Hash Grid 2D)** avec taille de cellule paramétrable (défaut : 5 000 mm).
- **Justification face au BVH / R-Tree :**
  - Dans un contexte architectural 2D, la distribution spatiale des éléments est quasi-plane et bornée.
  - La grille uniforme offre une insertion et suppression en $\mathcal{O}(k)$ (où $k$ est le nombre de cellules couvertes par l'AABB, le plus souvent 1 à 4).
  - La recherche par fenêtre visible (viewport bounds) s'exécute en $\mathcal{O}(c + m)$ où $c$ est le nombre de cellules visibles et $m$ le nombre d'entités candidates, évitant les rééquilibrages coûteux propres aux R-Trees.
  - Empreinte mémoire extrêmement compacte : ~150 Ko pour 1 000 entités, ~1,4 Mo pour 10 000 entités.
- **Référence métrologique (`LinearSpatialIndex2D`) :**
  - Scan linéaire $\mathcal{O}(N)$ maintenu pour étalonner mathématiquement les gains de `SpatialGrid2D`.

### 2.3. Filtrage par Niveau Actif et Éléments Traversants

- Chaque requête spatiale prend un filtre de niveau altimétrique optionnel (`levelFilter`).
- Les entités mono-niveau (`Wall`, `Slab`, `Roof`, `Component`, `Dimension`) sont filtrées immédiatement par leur `levelId`.
- Les entités **traversantes multi-niveaux** (notamment `Stair`) portent `levelIds: [bottomLevelId, topLevelId]` et demeurent visibles à la fois sur leur niveau de départ et leur niveau d'arrivée, tout en étant masquées sur les autres étages.

### 2.4. Frustum Culling AABB avec Marge de Sécurité Dynamique

- L'emprise du viewport en coordonnées monde ($x, y$ en mm) est extraite via `Transform2D.getVisibleWorldBounds()`.
- Une marge de garde dynamique est appliquée via `expandAABB(visibleBounds, marginMm)` où $\mathrm{marginMm} = \max(500, 50 / \mathrm{scale})$. Cette marge empêche tout artefact de coupure lors de mouvements de caméra rapides (pan/zoom) ou d'éléments dont les arêtes débordent légèrement de leur ligne directrice.
- Les murs hors champ ne sont plus envoyés à `solveWallJunctions` : seuls les murs visibles participent à la résolution topologique des jonctions en plan.
- Les ouvertures architecturales (portes/fenêtres) sont culled instantanément dès lors que leur mur hôte est hors champ.

---

## 3. Résultats Métrologiques et Validation

Sur la suite de test dédiée `view2d-scalability.test.ts` et la suite de non-régression `culling-non-regression.test.ts` :

| Échelle | Nb Entités Indexées | Cellules Grille | Mémoire Grille | Retenus / Visibles | Culling Ratio | Requête Spatiale | Rendu 2D (P50) | Rendu 2D (P95) | Budget 60 FPS (16.7 ms) |
|---|---|---|---|---|---|---|---|---|---|
| **100** | 67 | 49 | 17,8 Ko | 44 | **34,3 %** | 0,33 ms | 4,25 ms | **9,01 ms** | **Atteint** (1,85× sous budget) |
| **1 000** | 670 | 121 | 151,9 Ko | 93 | **86,1 %** | 0,25 ms | 7,78 ms | **11,63 ms** | **Atteint** (1,44× sous budget) |
| **10 000** | 6 700 | 324 | 1 405 Ko | 116 | **98,3 %** | 0,50 ms | 13,65 ms | **25,64 ms** | Fluide / Scalable |

- **Temps de rendu sur 1 000 entités :** Passage de **270 ms** à **11,63 ms (P95)** et **7,78 ms (P50)**, soit une accélération de **~23× à 34×**.
- **Manipulations caméra (Pan & Zoom) :** Le cache de l'index spatial évite toute réallocation lors du déplacement de vue ; pan P50 à **8,10 ms**, zoom P50 à **7,07 ms**, level switch à **7,13 ms**.

---

## 4. Conséquences

- **Positives :**
  - La vue 2D Canvas garantit désormais le respect strict du 60 FPS (> 60 images par seconde) sur le modèle de référence de 1 000 entités.
  - La maquette à 10 000 entités reste interactive avec plus de 98% de suppression des éléments hors écran.
  - Le code du rendu 2D et de la génération 3D est désormais scindé en sous-modules compacts et typés, prêt à accueillir la Sous-phase 9.3 sans risque de régression.
- **Neutres / Négatives :**
  - Empreinte mémoire additionnelle de ~150 Ko pour 1 000 éléments, ce qui est négligeable face au confort de navigation et à la suppression des goulots CPU.
