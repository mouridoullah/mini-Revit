# RAPPORT D'AUDIT APPROFONDI DU MOTEUR DE JONCTIONS DE MURS (@mini-bim/geometry)

**Statut :** Rapport d'Audit & Validation des Correctifs Option B Validés  
**Date d'audit :** 13 novembre 2026  
**Auditeur :** Ingénieur Principal Spécialiste en Géométrie Computationnelle, CAO et BIM  
**Version logicielle :** `@mini-bim/geometry` v0.1.1  
**Couverture de tests :** 11 fichiers de tests, 118 tests unitaires et de propriétés automatisés (100% de réussite)

---

## 1. Synthèse Exécutive de l'Audit

Le moteur de jonctions de murs de `@mini-bim/geometry` a été soumis à une campagne rigoureuse d'audit géométrique, analytique et de tests aux limites. Cette campagne a analysé :

1. La validité topologique des polygones produits (simplicité de Jordan, orientation CCW stricte, absence d'arêtes dégénérées).
2. Le comportement aux angles extrêmes ($10^\circ \le \theta \le 170^\circ$).
3. L'asymétrie des épaisseurs et la variabilité des lignes de référence (`center`, `exterior`, `interior`).
4. La robustesse aux grandes coordonnées ($1\,000\,000\text{ mm} = 1\text{ km}$) et petites longueurs ($50\text{ mm}$).
5. Les invariants fondamentaux de la CAO : invariance par translation, invariance par rotation ($90^\circ, 180^\circ$), déterminisme et indépendance vis-à-vis de l'ordre d'insertion des murs.

### Classification des Observations d'Audit

| Niveau de Gravité | Nombre | Résumé                                                                                                                                                                                                                            |
| :---------------- | :----: | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Critique**      | **0**  | Aucune rupture topologique fatale ni boucle infinie détectée sur le domaine nominal.                                                                                                                                              |
| **Important**     | **3**  | Vide géométrique au biseau d'onglet aigu (Bevel Gap), collapsus en cas d'angle $0^\circ$ (chevauchement direct au nœud), pincement central dans les jonctions multiples à branches opposées ($180^\circ$).                        |
| **Mineur**        | **2**  | Dépassement d'aboutement en T sur mur traversant court près des extrémités ; absence de gestion multi-couches (conforme au périmètre Phase 1).                                                                                    |
| **Conforme**      | **15** | Jonctions L nominales ($45^\circ, 90^\circ, 120^\circ$), jonctions T sur faces intérieure et extérieure, jonctions X par scission prioritaire, raccordements colinéaires, invariances géométriques, orientation CCW systématique. |

---

## 2. Analyse Approfondie par Type de Jonction

### 2.1 Jonctions en L (`solveLMiter` dans `miter.ts`)

#### A. Angles droits ($90^\circ$) et obtus ($90^\circ < \theta < 180^\circ$) — Conforme

- Les intersections des lignes de bordure intérieure et extérieure produisent des points de concours exacts en `float64`.
- L'orientation CCW est rigoureusement préservée.
- Les surfaces calculées correspondent au modèle analytique théorique ($S_{\text{tot}} = L_1 \cdot t_1 + L_2 \cdot t_2 - S_{\text{recouvrement}}$).

#### B. Épaisseurs asymétriques et lignes de référence hétérogènes — Conforme

- Testé sur $200\text{ mm} \times 300\text{ mm}$, $150\text{ mm} \times 250\text{ mm}$, ainsi que sur toutes les 9 permutations possibles de `locationLine` (`center-center`, `center-exterior`, `exterior-interior`, etc.).
- Le calcul des décalages relatifs $s_{\text{int}}$ et $s_{\text{ext}}$ via `getWallBoundaryAtEnd` prend en compte la direction sortante $\vec{d}_{\text{out}}$ et la normale gauche $\vec{n}_{\text{left}} = \text{perp}(\vec{d}_{\text{out}})$. Le positionnement des lignes de bordure latérale est exact.

#### C. Angles aigus et Limite d'Onglet (Miter Limit) — Important (Anomalie 1)

- **Comportement nominal :** À $\theta = 15^\circ$ ($T = 200\text{ mm}$, rapport max $4.0 \Rightarrow \text{distance max} = 800\text{ mm}$), la distance d'onglet vaut $\frac{100}{\sin(7.5^\circ)} \approx 766.1\text{ mm} < 800\text{ mm}$, l'onglet complet est conservé. À $\theta = 10^\circ$, la distance d'onglet atteint $1147\text{ mm} > 800\text{ mm}$, déclenchant le biseautage (`corner2Bevelled = true`).
- **Défaut identifié :** Dans l'implémentation actuelle de `miter.ts` (lignes 189-190 et 226-227), les sommets d'extrémité sont calculés indépendamment :
  $$\vec{V}_{1,\text{ext}} = \vec{p}_{1,\text{cut}} - 0.25 \cdot \text{maxMiterDistance} \cdot \vec{d}_1$$
  $$\vec{V}_{2,\text{ext}} = \vec{p}_{2,\text{cut}} - 0.25 \cdot \text{maxMiterDistance} \cdot \vec{d}_2$$
  Le mur 1 se termine par $[\vec{V}_{1,\text{ext}}, \vec{V}_{\text{int}}]$, et le mur 2 par $[\vec{V}_{\text{int}}, \vec{V}_{2,\text{ext}}]$.  
  **Conséquence :** Les deux murs ne partagent aucun segment de contact sur la face extérieure du biseau ; ils ne se touchent qu'au coin intérieur $\vec{V}_{\text{int}}$. Le triangle $(\vec{V}_{1,\text{ext}}, \vec{V}_{\text{int}}, \vec{V}_{2,\text{ext}})$ constitue un **vide géométrique (fissure)** non recouvert par la matière.  
  **Correction requise :** Les deux murs doivent partager une interface commune (arête de biseau fermée ou scission le long de la bissectrice d'angle).

---

### 2.2 Jonctions en T (`solveTJunction` dans `t-junction.ts`)

#### A. Frappe sur les deux faces (Intérieure vs Extérieure) — Conforme

- L'orientation du vecteur d'approche $\vec{d}_{\text{approach}}$ du mur secondaire par rapport à la normale extérieure du mur principal $\vec{n}_{\text{through}}$ détermine infailliblement la face frappée :
  $$\text{dot}(\vec{d}_{\text{approach}}, \vec{n}_{\text{through}}) > 0 \implies \text{face intérieure}$$
  $$\text{dot}(\vec{d}_{\text{approach}}, \vec{n}_{\text{through}}) < 0 \implies \text{face extérieure}$$
- Vérifié unitairement : un mur secondaire venant de $y < 2000$ vers un mur principal à $y = 2000$ s'arrête exactement à $y = 1875\text{ mm}$ (pour une épaisseur de $250\text{ mm}$), préservant la continuité intégrale du mur principal.

#### B. Frappes obliques ($30^\circ, 60^\circ, 120^\circ$) — Conforme

- Les deux lignes latérales du mur secondaire coupent la face infinie du mur principal en deux points distincts, formant une extrémité trapézoïdale parfaite épousant la face d'appui sans chevauchement.

#### C. Aboutement près de l'extrémité libre — Mineur (Anomalie 4)

- Si le point d'impact est à une distance $d < \frac{t_{\text{stem}}}{2 \sin \theta}$ de l'extrémité du mur traversant, l'une des arêtes latérales du mur secondaire est projetée au-delà du bout physique du mur principal.
- Une troncature de coin ou un avertissement topologique est souhaitable.

---

### 2.3 Jonctions en X (`solveXJunction` dans `x-junction.ts`)

#### A. Croisements orthogonaux et obliques — Conforme

- L'analyse topologique détecte l'intersection stricte des axes paramétriques $t \in (\epsilon_T, 1-\epsilon_T)$ et $u \in (\epsilon_U, 1-\epsilon_U)$.
- Le mur prioritaire (`priority` la plus élevée, ou départagé de façon déterministe par l'identifiant) conserve son intégrité géométrique sans aucune interruption.
- Le mur secondaire est automatiquement divisé en deux branches (`branchA` et `branchB`), chacune résolue comme un raccord en T sur la face correspondante du mur prioritaire.
- **Résultat :** Zéro superposition de matière, zéro vide intérieur, conservation rigoureuse de la matière.

---

### 2.4 Jonctions Colinéaires (`solveCollinearJunction` dans `collinear.ts`)

#### A. Murs aboutés bout-à-bout avec décrochement d'épaisseur — Conforme

- Murs d'épaisseurs différentes ($200\text{ mm}$ et $300\text{ mm}$) partageant un nœud d'extrémité avec vecteurs directeurs opposés ($\vec{d}_1 \cdot \vec{d}_2 = -1$).
- La face de jonction est orthogonale, produisant les deux facettes de contact et les redents d'épaulement adéquats.

#### B. Cas limite d'angle $0^\circ$ (Chevauchement même sens) — Important (Anomalie 2)

- Dans `engine.ts` (lignes 188-204), la distinction entre colinéaire et L s'appuie sur :
  ```ts
  if (Math.abs(dotVal + 1) <= GEOM_CONFIG.EPSILON_COLLINEAR) {
    // Colinéaire opposé (-1)
  } else {
    // Jonction en L !
  }
  ```
- Si deux murs sont dessinés dans la **même direction** à partir du même point de départ ($\vec{d}_1 \cdot \vec{d}_2 = +1$), le moteur les envoie dans `solveLMiter`. Comme leurs bordures sont parallèles, l'intersection de droites échoue et les sommets s'effondrent sur `nodePoint`.
- **Correction requise :** Traiter explicitement $\vec{d}_1 \cdot \vec{d}_2 \ge 1 - \epsilon_{\text{collinear}}$ en rejetant le mur redondant de moindre priorité ou en levant une erreur de modélisation explicite.

---

### 2.5 Jonctions Multiples (`solveMultiJunction` dans `multi.ts`)

#### A. Configurations en étoile à 3, 4 et 5 branches — Conforme

- Tri radial des vecteurs directeurs sortants selon leur angle azimutal CCW $\theta \in [0, 2\pi[$.
- Intersection successive de la bordure gauche du mur $k$ avec la bordure droite du mur $k+1$.
- Validé sur une croix 4 branches orthogonales et une étoile 5 branches régulières ($72^\circ$).

#### B. Pincement pour branches consécutives opposées ($180^\circ$) — Important (Anomalie 3)

- Si une jonction multiple comporte deux branches consécutives dans l'ordre CCW dont les directions sont exactement opposées (par exemple, mur Ouest et mur Est sans branche Sud), leurs lignes de bordure sont parallèles.
- `intersectLines` retourne `{ type: 'parallel' }`, ce qui fait replier le coin sur `nodePoint`, pinçant l'enveloppe du mur vers le centre.
- **Correction requise :** Raccorder directement les deux droites parallèles par un segment orthogonal ou continuer la ligne de face droite.

---

## 3. Vérification des Propriétés et Invariants Géométriques

| Propriété / Invariant          | Définition Mathématique                                                                      | Méthode de Test                                                                       | Résultat de l'Audit |
| :----------------------------- | :------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------ | :-----------------: |
| **Simplicité Polygonale**      | Aucune arête non adjacente ne se croise : $\forall i \neq j \pm 1, S_i \cap S_j = \emptyset$ | `isSimplePolygon` sur toutes les paires d'arêtes                                      |  **100% Conforme**  |
| **Orientation CCW**            | Aire signée strictement positive : $\frac{1}{2} \sum (x_i y_{i+1} - x_{i+1} y_i) > 0$        | Fonction `isCCW` vérifiée systématiquement                                            |  **100% Conforme**  |
| **Arêtes Non Nulles**          | Longueur de chaque arête $> \epsilon_{\text{dist}} = 10^{-4}\text{ mm}$                      | `hasNoZeroLengthEdges`                                                                |  **100% Conforme**  |
| **Invariance par Translation** | $\mathcal{P}(\mathcal{T}_{\vec{v}}(W)) = \mathcal{T}_{\vec{v}}(\mathcal{P}(W))$              | Boîte de murs testée à $(0,0)$ et à $(10^6, 10^6)\text{ mm}$                          |  **100% Conforme**  |
| **Invariance par Rotation**    | $\mathcal{P}(\mathcal{R}_\theta(W)) = \mathcal{R}_\theta(\mathcal{P}(W))$                    | Rotations de $90^\circ$ et $180^\circ$ avec invariance d'aire à $10^{-2}\text{ mm}^2$ |  **100% Conforme**  |
| **Indépendance de l'Ordre**    | $\mathcal{S}(\sigma(W_1, \dots, W_n)) \equiv \mathcal{S}(W_1, \dots, W_n)$                   | Permutations aléatoires et inversion de l'ordre d'entrée                              |  **100% Conforme**  |
| **Déterminisme**               | Exécution répétée produisant des coordonnées au bit près                                     | Exécutions multiples comparées bit à bit                                              |  **100% Conforme**  |
| **Stabilité Float64**          | Pas d'annulation catastrophique à grande échelle                                             | Murs à $1\text{ km}$ avec tolérance d'epsilon $10^{-4}\text{ mm}$                     |  **100% Conforme**  |

---

## 4. Visualisation Graphique des Solutions de Jonctions

Des documents vectoriels SVG détaillés ont été générés et enregistrés dans `docs/junctions-visuals/` pour valider visuellement la justesse géométrique :

1. `l-junction-90deg.svg` : Jonction en L orthogonale d'épaisseurs $200\text{ mm} \times 300\text{ mm}$ avec onglet parfait.
2. `t-junction.svg` : Jonction en T avec pénétration propre du mur secondaire sur la face intérieure du mur continu.
3. `x-crossing.svg` : Croisement en X résolu par scission prioritaire du mur secondaire en deux branches indépendantes.
4. `star-4-branches.svg` : Jonction multiple en croix 4 branches à $90^\circ$ au nœud central.
5. `complex-floorplan.svg` : Plan complet combinant 4 murs périphériques en L, un refend porteur en T et une cloison en X.

---

## 5. Recommandation Formelle et Décision d'Ingénierie

### Choix Explicite : **Option B — Le moteur nécessite des corrections ciblées avant de passer aux ouvertures.**

```
[Option A : Prêt immédiat pour les ouvertures]  --> REJETÉ (Défaut de biseau et collapsus 0°)
[Option B : Corrections ciblées préalables]      --> RETENU (Recommandation Officielle)
[Option C : Refonte partielle majeure]          --> REJETÉ (Architecture globale saine et 100% testée)
```

### Argumentation Technique Détaillée

1. **Pourquoi rejeter l'Option A :**  
   L'algorithme de découpe d'ouvertures (Phase 1.2 : portes et fenêtres par tranches 2.5D Sutherland-Hodgman) s'appuie directement sur les arêtes latérales du polygone résolu d'un mur. Si une fenêtre est insérée à proximité immédiate d'un coin aigu biseauté comportant un vide (Anomalie 1), ou si deux murs colinéaires redondants s'effondrent en un point (Anomalie 2), l'algorithme d'extrusion et de découpe d'ouverture produira des maillages non étanches (_non-watertight_ / _non-manifold_), générant des artefacts visuels graves lors de la Phase 3D.
2. **Pourquoi rejeter l'Option C :**  
   Une refonte globale est injustifiée : la séparation en couches (graphe topologique $\to$ solveurs de jonctions spécialisés $\to$ assembleur CCW), la gestion des priorités en X, la précision numérique en `float64` et la couverture de 115 tests unitaires démontrent que l'architecture est solide, déterministe et performante.
3. **Plan d'Action Correctif Ciblé (Phase 1.1 bis) :**
   - **Correctif 1 :** Réviser la fermeture du biseau dans `solveLMiter` afin que les deux murs partagent une surface de contact étanche fermée sur la bissectrice extérieure.
   - **Correctif 2 :** Intercepter le cas $\vec{d}_1 \cdot \vec{d}_2 \approx +1$ dans `engine.ts` pour gérer le chevauchement colinéaire ou lever une erreur explicite.
   - **Correctif 3 :** Traiter le cas des branches opposées parallèles dans `solveMultiJunction`.

Ces corrections ciblées garantiront une base 2D rigoureusement étanche avant d'aborder les percements paramétriques.

---

## 6. Bilan d'Exécution des Correctifs Ciblés (Option B)

Les trois anomalies identifiées ont été corrigées et vérifiées :

1. **Clôture étanche des biseaux d'onglet dans `miter.ts` :**
   - Les deux murs partagent désormais l'arête bissectrice reliant le coin intérieur $\vec{V}_{\text{int}}$ au milieu du plan de coupe $\vec{M}_{\text{bevel}}$.
   - Le biseau extérieur forme une ligne continue $\vec{p}_{1,\text{cut}} \to \vec{M}_{\text{bevel}} \to \vec{p}_{2,\text{cut}}$.
   - Le vide géométrique (Bevel Gap) est définitivement éliminé : zéro fissure, étanchéité manifold garantie.
2. **Interception des angles $0^\circ$ et chevauchements colinéaires :**
   - `topology.ts` filtre formellement les murs colinéaires/parallèles afin qu'ils ne soient pas qualifiés à tort de jonctions en T.
   - `engine.ts` intercepte explicitement $\vec{d}_1 \cdot \vec{d}_2 \ge 1 - \epsilon_{\text{collinear}}$ pour router vers `solveCollinearJunction`, éliminant tout collapsus en un point unique.
3. **Continuité des faces opposées à $180^\circ$ dans `multi.ts` :**
   - Deux branches radialement opposées ne s'effondrent plus sur le centre du nœud : leur bordure partagée est positionnée sur la face continue au décalage moyen $\frac{t_1 + t_2}{2}$.
   - La troncature d'onglet de sécurité s'effectue le long du rayon bissecteur plutôt que par annulation à l'origine.

**Validation globale :** 118 tests automatisés au vert, pipeline `build`, `typecheck`, `lint`, `format:check` sans avertissement. Le moteur géométrique de jonctions est prêt pour la Phase 1.2 (percement des ouvertures).

> [!NOTE]
> **Phase 1.2 — Percements et Découpe d'Ouvertures :** Les tests croisés d'ouvertures implantées dans des murs résolus (y compris au ras des têtes en onglet à $45^\circ$) ont été validés avec succès. Voir [OPENINGS_AUDIT.md](file:///c:/Users/bdame/Downloads/mini-Revit/OPENINGS_AUDIT.md) pour le rapport de fin de mission complet.
