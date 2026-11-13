# MATRICE DE TESTS DU MOTEUR DE JONCTIONS DE MURS (@mini-bim/geometry)

**Statut :** Matrice de Qualification Complète  
**Date :** 13 novembre 2026  
**Nombre total de tests :** 118 tests automatisés  
**Taux de succès :** 100% (118/118 passing)

---

## 1. Vue d'Ensemble par Fichier de Test

| Fichier de Test                    | Périmètre / Composant                                             | Nb Tests |    Statut     |
| :--------------------------------- | :---------------------------------------------------------------- | :------: | :-----------: |
| `src/vec2.test.ts`                 | Primitives vectorielles 2D, tolérances et guards `NaN`/`Infinity` |    22    |   **PASS**    |
| `src/line.test.ts`                 | Géométrie des droites infinies et intersections typées            |    10    |   **PASS**    |
| `src/segment.test.ts`              | Segments finis, chevauchements, colinéarité, projections          |    19    |   **PASS**    |
| `src/polygon.test.ts`              | Calculs d'aire signée, CCW, centroïdes et périmètres              |    8     |   **PASS**    |
| `src/wall-geometry.test.ts`        | Emprise nominale 2D (`center`, `exterior`, `interior`)            |    10    |   **PASS**    |
| `src/junctions/miter.test.ts`      | Solveur d'onglet en L et application de la miter limit            |    7     |   **PASS**    |
| `src/junctions/t-junction.test.ts` | Raccordements en T (faces extérieure et intérieure)               |    3     |   **PASS**    |
| `src/junctions/x-junction.test.ts` | Croisements sécants en X et scission en branches                  |    2     |   **PASS**    |
| `src/junctions/collinear.test.ts`  | Jonctions colinéaires aboutées et superposées                     |    3     |   **PASS**    |
| `src/junctions/engine.test.ts`     | Moteur global `solveWallJunctions` et intégration                 |    9     |   **PASS**    |
| `src/junctions/audit.test.ts`      | Audit approfondi et tests de robustesse Option B                  |    25    |   **PASS**    |
| **TOTAL**                          | **Validation globale du moteur géométrique**                      | **118**  | **100% PASS** |

---

## 2. Matrice Détaillée des Configurations Géométriques

### 2.1 Jonctions en L (Coins et Raccords d'Extrémités)

| ID Test  | Angle ($\theta$) | Épaisseurs ($t_1 / t_2$) |   Lignes Réf.   | Propriété / Invariant Vérifié                          | Fichier de Test  | Résultat |
| :------- | :--------------: | :----------------------: | :-------------: | :----------------------------------------------------- | :--------------- | :------: |
| **L-01** |    $90^\circ$    |       200 / 200 mm       | center / center | Onglet orthogonal nominal, CCW, 4 sommets              | `engine.test.ts` | **PASS** |
| **L-02** |    $90^\circ$    |       200 / 300 mm       | center / center | Asymétrie d'épaisseur, absence de décalage             | `miter.test.ts`  | **PASS** |
| **L-03** |    $90^\circ$    |       200 / 200 mm       |    ext / int    | Permutations des 9 paires de `locationLine`            | `audit.test.ts`  | **PASS** |
| **L-04** |    $45^\circ$    |       200 / 200 mm       | center / center | Angle aigu modéré, miter complet sans biseau           | `miter.test.ts`  | **PASS** |
| **L-05** |    $30^\circ$    |       200 / 200 mm       | center / center | Angle aigu prononcé, conservation de l'aire            | `audit.test.ts`  | **PASS** |
| **L-06** |    $15^\circ$    |       200 / 200 mm       | center / center | Seuil limite de miter limit ratio ($4.0$)              | `audit.test.ts`  | **PASS** |
| **L-07** |    $10^\circ$    |       200 / 200 mm       | center / center | Déclenchement effectif du biseau (`isBevelled = true`) | `miter.test.ts`  | **PASS** |
| **L-08** |    $60^\circ$    |       200 / 200 mm       | center / center | Balayage angulaire, polygone simple (Jordan)           | `audit.test.ts`  | **PASS** |
| **L-09** |   $120^\circ$    |       200 / 200 mm       | center / center | Angle obtus, orientation CCW garantie                  | `audit.test.ts`  | **PASS** |
| **L-10** |   $135^\circ$    |       200 / 200 mm       | center / center | Angle obtus large, raccord fluide                      | `audit.test.ts`  | **PASS** |
| **L-11** |   $150^\circ$    |       200 / 200 mm       | center / center | Angle très obtus, pas d'auto-intersection              | `audit.test.ts`  | **PASS** |
| **L-12** |   $170^\circ$    |       200 / 200 mm       | center / center | Angle quasi-plat, stabilité numérique `float64`        | `audit.test.ts`  | **PASS** |
| **L-13** |   $180^\circ$    |       200 / 200 mm       | center / center | Basculement automatique en jonction colinéaire         | `miter.test.ts`  | **PASS** |

---

### 2.2 Jonctions en T (Aboutements de Murs Secondaires)

| ID Test  | Orientation / Côté                           | Épaisseurs ($t_{\text{traversant}} / t_{\text{stem}}$) | Propriété / Invariant Vérifié                                                 | Fichier de Test  | Résultat |
| :------- | :------------------------------------------- | :----------------------------------------------------: | :---------------------------------------------------------------------------- | :--------------- | :------: |
| **T-01** | Perpendiculaire ($90^\circ$) face intérieure |                      250 / 150 mm                      | Continuité intégrale du mur principal, ajustement exact de la tige            | `audit.test.ts`  | **PASS** |
| **T-02** | Perpendiculaire ($90^\circ$) face extérieure |                      250 / 150 mm                      | Détection automatique du sens via le produit scalaire $\vec{d} \cdot \vec{n}$ | `audit.test.ts`  | **PASS** |
| **T-03** | Oblique ($60^\circ$)                         |                      250 / 200 mm                      | Aboutement biseauté non orthogonal épousant la face d'appui                   | `audit.test.ts`  | **PASS** |
| **T-04** | Oblique ($120^\circ$)                        |                      250 / 200 mm                      | Face intérieure oblique, absence d'auto-intersection                          | `audit.test.ts`  | **PASS** |
| **T-05** | Multiple T sur le même mur                   |                      300 / 150 mm                      | Deux cloisons aboutissant sur des faces opposées du même mur                  | `engine.test.ts` | **PASS** |

---

### 2.3 Jonctions en X (Croisements Intérieurs)

| ID Test  |      Angle de Croisement      | Priorités ($P_1 / P_2$) | Propriété / Invariant Vérifié                             | Fichier de Test      | Résultat |
| :------- | :---------------------------: | :---------------------: | :-------------------------------------------------------- | :------------------- | :------: |
| **X-01** |    $90^\circ$ (orthogonal)    |        100 / 50         | Mur $P_1$ continu, mur $P_2$ scindé en 2 branches propres | `x-junction.test.ts` | **PASS** |
| **X-02** |     $45^\circ$ (oblique)      |        100 / 50         | Aboutements inclinés des deux branches sur les deux faces | `engine.test.ts`     | **PASS** |
| **X-03** | $90^\circ$ (priorités égales) |          0 / 0          | Départage déterministe par identifiant, zéro instabilité  | `x-junction.test.ts` | **PASS** |

---

### 2.4 Jonctions Colinéaires et Jonctions Multiples

| ID Test    | Configuration                 |   Branches / Murs   | Propriété / Invariant Vérifié                             | Fichier de Test     | Résultat |
| :--------- | :---------------------------- | :-----------------: | :-------------------------------------------------------- | :------------------ | :------: |
| **COL-01** | Bout-à-bout même épaisseur    |  2 murs (200/200)   | Continuité de face sans modification superflue            | `collinear.test.ts` | **PASS** |
| **COL-02** | Bout-à-bout épaisseur inégale |  2 murs (200/300)   | Redent d'épaulement orthogonal de 50 mm par face          | `collinear.test.ts` | **PASS** |
| **MUL-01** | Croix orthogonale (Star 4)    | 4 murs à $90^\circ$ | Tri CCW radial, sommets partagés, absence de vide central | `audit.test.ts`     | **PASS** |
| **MUL-02** | Étoile régulière 5 branches   | 5 murs à $72^\circ$ | Robustesse trigonométrique, 5 polygones fermés simples    | `audit.test.ts`     | **PASS** |
| **MUL-03** | Jonction en Y asymétrique     |  3 murs connectés   | Distribution correcte des coins gauche/droit              | `audit.test.ts`     | **PASS** |

---

## 3. Matrice des Tests de Propriétés Invariantes (CAO / BIM)

| ID Test    | Invariant Testé            | Échelle / Domaine                           | Méthode & Tolérance de Tolérance                   | Fichier de Test | Résultat |
| :--------- | :------------------------- | :------------------------------------------ | :------------------------------------------------- | :-------------- | :------: |
| **INV-01** | Invariance par Translation | Déplacement $(10^6, 10^6)\text{ mm}$ (1 km) | Différence d'aire $= 0$, conservation topologique  | `audit.test.ts` | **PASS** |
| **INV-02** | Invariance par Rotation    | Rotations de $90^\circ$ et $180^\circ$      | Aire totale invariante à $\le 10^{-2}\text{ mm}^2$ | `audit.test.ts` | **PASS** |
| **INV-03** | Indépendance de l'Ordre    | Permutations directes et inversées          | Surfaces et sommets équivalents                    | `audit.test.ts` | **PASS** |
| **INV-04** | Déterminisme Absolu        | 100 exécutions consécutives                 | Identité binaire stricte des coordonnées           | `audit.test.ts` | **PASS** |
| **INV-05** | Simplicité de Jordan       | 100% des polygones résolus                  | Aucun croisement d'arêtes non consécutives         | `audit.test.ts` | **PASS** |
| **INV-06** | Orientation CCW Stricte    | 100% des polygones résolus                  | Aire signée $> 0$, `isCCW(poly) === true`          | `audit.test.ts` | **PASS** |
| **INV-07** | Absence d'Arêtes Nulles    | Longueurs d'arêtes                          | Toutes longueurs $> 10^{-4}\text{ mm}$             | `audit.test.ts` | **PASS** |

---

## 4. Matrice des Tests de Non-Régression Ciblés (Option B)

| ID Test    | Cible Géométrique                                   | Configuration / Conditions                                                                 | Propriété Vérifiée                                                                    | Fichier de Test | Résultat |
| :--------- | :-------------------------------------------------- | :----------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------ | :-------------- | :------: |
| **FIX-01** | Biseau d'onglet aigu étanche (_Watertight Miter_)   | 2 murs à $10^\circ$, $T = 200\text{ mm}$, rapport $4.0$, limite $800\text{ mm}$            | Partage exact de l'arête bissectrice $V_{\text{int}} \to M_{\text{bevel}}$, zéro vide | `audit.test.ts` | **PASS** |
| **FIX-02** | Interception chevauchement colinéaire $0^\circ$     | 2 murs partant du même nœud $(0,0)$ dans la même direction $(1,0)$                         | Détection `collinear`, 4 sommets par mur, aucun collapsus en point                    | `audit.test.ts` | **PASS** |
| **FIX-03** | Continuité des branches opposées à $180^\circ$ en T | 3 branches incidentes (Est $0^\circ$, Nord $90^\circ$, Ouest $180^\circ$) à $(2000, 2000)$ | Face Sud continue à $y = 1900\text{ mm}$, zéro pincement au nœud                      | `audit.test.ts` | **PASS** |

---

## 5. Bilan et Qualification Finale

Toutes les exigences de test sont remplies avec **118 tests au vert (100% PASS)**.  
Les 3 anomalies identifiées ont été résolues mathématiquement et vérifiées par tests unitaires et de propriétés.  
Le moteur de jonctions de murs est certifié étanche, manifold et déterministe pour le démarrage de la Phase 1.2 (percement des ouvertures).
