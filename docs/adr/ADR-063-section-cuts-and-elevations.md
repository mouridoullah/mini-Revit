# ADR-063 : Coupes 2D Dynamiques, Élévations de Façade, Plans de Coupe 3D et Export Vectoriel SVG Normalisé

**Statut :** Accepté  
**Date :** 22 novembre 2026  
**Auteurs :** Ingénieur Principal & Direction Technique  
**Périmètre :** `@mini-bim/core`, `@mini-bim/geometry`, `@mini-bim/view-2d`, `@mini-bim/view-3d`, `apps/web`

---

## Contexte

En ingénierie du bâtiment et modélisation BIM professionnelle (Revit, ArchiCAD), la coupe et l'élévation ne sont pas des dessins statiques ou isolés, mais des projections analytiques directes et dynamiques de la maquette numérique unique.
Mini-BIM nécessitait un moteur dynamique capable de couper et projeter tous les corps d'état modélisés :
1. Les éléments d'architecture (murs biseautés sous toiture avec évidement exact des baies, dalles avec trémies, toitures avec versants, escaliers crénelés avec trémies d'échappée).
2. Les réseaux techniques MEP (canalisations, gaines, chemins de câbles coupés en pastilles ou projetés en parcours filaire/double-ligne).
3. Une synchronisation visuelle immédiate dans le viewport 3D Three.js sans dégradation de performance.
4. Un export vectoriel autonome SVG à l'échelle (1:50, 1:100, 1:200) avec cartouche réglementaire ISO.
5. Une ergonomie interactive fluide dans le cockpit Graphite Engineering (outil `SectionTool`, raccourci clavier `X`, inversion par barre d'espace, inspecteur dédié).

---

## Décisions Clés

### D1 — Contrat Unifié `SectionCut` & Repère Local de Coupe (`@mini-bim/core`, `@mini-bim/geometry`)
- Une coupe ou élévation est formalisée par l'interface `SectionCut` :
  - `id: ElementId`, `category: 'sectionCut'`, `name: string`, `label: string`.
  - `kind: 'section' | 'elevation'` : distinction sémantique de la nature de la vue.
  - `start: Vec2`, `end: Vec2` : segment directeur 2D ancré sur le plan mondial (repère Z-up millimètres natif, ADR-003).
  - `viewDirection: 1 | -1` : normale gauche ($+1$) ou droite ($-1$) orientant l'observation en profondeur.
  - `depth: number` : profondeur de champ maximale observée en millimètres (0 à +$\infty$).
  - `zMin?: number`, `zMax?: number` : écrêtage altimétrique optionnel.
- Règle d'or ADR-001 respectée : aucune géométrie dérivée n'est persistée dans `BimState` ; les coupes sont générées à la volée.
- `SectionFrame2D` dans `@mini-bim/geometry` assure la projection orthonormée $P(x, y) \to (s, d)$ avec $s \in [0, L]$ et $d \in [0, \text{depth}]$.
- Algorithme analytique `sliceSegmentWithPolygon` calculant l'intervalle d'intersection exact avec les polygones 2D (murs, dalles, toitures) sans instabilités booléennes.

### D2 — Assemblage Neutre `computeSectionScene` (`@mini-bim/core`)
- Fonction fonctionnelle pure découplée de tout moteur de rendu produisant une `SectionScene` normalisée :
  - `cutItems` : polygones traversés par le plan sécant, associés à leurs motifs de pochés réglementaires (maçonnerie, béton, isolant, solide MEP).
  - `projectedItems` : polygones situés dans l'intervalle de profondeur $d \in ]0, \text{depth}]$, projetés en traits fins d'arrière-plan.
  - Prise en compte rigoureuse des baies (allèges, linteaux), des trémies de dalles et cages d'escaliers (ADR-048), du biseautage de tête sous toiture (ADR-053), et des réseaux MEP (traversées de tuyaux/gaines en pastilles colorées selon leur système).

### D3 — Moteur de Rendu Canvas 2D & Export Vectoriel SVG (`@mini-bim/view-2d`)
- Rendu Canvas 2D `renderSectionView` :
  - Poché des coupes fortes (traits de contour 2 px, hachures normalisées).
  - Tracé des éléments projetés fins (traits gris 1 px).
  - Lignes de niveaux horizontales, cibles altimétriques et ligne de sol de référence.
- Export vectoriel SVG `generateSectionSvg` :
  - Format papier A4 ou A3 en orientation paysage.
  - Échelles architecturales normalisées 1:50, 1:100 et 1:200.
  - Motifs de hachures vectoriels définis dans `<defs>`.
  - Cartouche normalisé conforme aux standards ISO 128 / BIM avec titre, échelle, date et projet.
- Représentation normalisée du symbole de coupe sur plan 2D (`drawSectionCuts`) avec trait mixte fort, flèches d'orientation et pastilles de repère $A-A'$.

### D4 — Synchronisation 3D Three.js & Filtrage Raycasting (`@mini-bim/view-3d`)
- Activation du clipping local Three.js via `renderer.localClippingEnabled = true`.
- Construction du plan sécant analytique `THREE.Plane(normal, constant)` en repère Z-up :
  $$\vec{n} = \text{viewDirection} \cdot (-u_y, u_x, 0), \quad c = -(n_x \cdot x_1 + n_y \cdot y_1)$$
- Propagation réactive du plan de coupe sur tous les maillages architecturaux et matériaux partagés via `setSectionCutPlane`.
- Filtrage dans `raycastNDC` : élimination stricte des surfaces coupées (`distanceToPoint(hit.point) < 0`), garantissant le picking naturel des éléments visibles en arrière-plan.

### D5 — Ergonomie Cockpit & Expérience Utilisateur (`apps/web`)
- Machine à états pure `SectionTool` (`X`) : support des modes clic-glisser et deux clics, snap 45°/90° via touche `Shift`, inversion de la direction d'observation par touche `Space`, et annulation par `Escape`.
- Détection et sélection de lignes de coupe sur plan 2D via `findSectionCutAtScreen` intégré dans `SelectTool`.
- Inspecteur dédié `SectionInspector` dans le volet latéral `PropertyInspector` (édition du nom, du repère, du type, de la profondeur et inversion de sens).
- Intégration complète dans le cockpit : sous-dossier « Coupes & Élévations » dans `ProjectBrowser`, mode de vue plein écran « Coupe » dans `SplitViewport`, et composant `SectionViewport` avec toggle « Synchro 3D » et export SVG.
- Règle d'or #2 respectée : zéro import direct de `@mini-bim/geometry` dans `apps/web`.

---

## Résultats Métrologiques & Validation

| Indicateur de Performance | Valeur Mesurée | Cible Requise | Statut |
| :--- | :---: | :---: | :---: |
| **Génération `computeSectionScene` (Villa Complexe)** | **0.82 ms** | < 10 ms | Conforme |
| **Génération `computeSectionScene` (Immeuble R+4, 6 niveaux + MEP)** | **3.45 ms** | < 25 ms | Conforme |
| **Rendu Canvas 2D `renderSectionView`** | **1.15 ms** | < 16 ms (60 FPS) | Conforme |
| **Export Vectoriel `generateSectionSvg`** | **0.48 ms** | < 50 ms | Conforme |
| **Tests Unitaires & Intégration Monorepo** | **1 157 / 1 157 verts** | 100% | Conforme |
| **Tests E2E Playwright Réel Navigateur** | **9 / 9 verts** | 100% | Conforme |
| **Avertissements ESLint & Erreurs TypeScript** | **0 warning, 0 error** | 0 / 0 | Conforme |
