# Note d'Architecture — Sous-phase 9.3.3
# Routage Géométrique Déterministe et Insertion Paramétrique des Raccords MEP

**Date :** 19 novembre 2026  
**Branche Git :** `feat/phase-9-3-3-mep-routing-fittings`  
**Statut :** Spécification technique & validation d'architecture  
**Auteurs :** Équipe Mini-BIM Core & MEP Engine  

---

## 1. Objectifs & Principes Directeurs

La sous-phase 9.3.3 implémente le premier moteur de routage automatique et d'assemblage paramétrique de réseaux MEP dans Mini-BIM.

### Principes architecturaux stricts
1. **Zéro pathfinding $A^*$ ni grille voxel (reporté en Phase 9.4) :**
   Le calcul de trajectoire est un routeur géométrique déterministe en temps constant $\mathcal{O}(1)$, calculant des configurations orthogonales exactes (trajet direct, coude en L à 90° et 45°, déport en Z ou baïonnette, colonne montante/descendante $\Delta Z$).
2. **Pureté fonctionnelle (`ADR-009`) :**
   Le solveur de trajectoire réside dans `packages/core/src/mep/routing.ts`. Il ne dépend ni de React, ni de Three.js, ni du Canvas DOM, et ne mute jamais `BimDocument`. Il retourne un `RoutePlan` immuable.
3. **Atomicité transactionnelle absolue (Exigence P0) :**
   La matérialisation d'un tracé (`RouteMepPathCommand`) ou le piquage en Té avec découpe d'un segment existant (`InsertTeeBranchCommand`) constitue une seule transaction réversible. Un unique `doc.undo()` restaure le modèle à l'identique, sans laisser de port, connecteur ou élément orphelin.
4. **Insertion automatique des réductions (`transition`) :**
   Si deux ports ont le même domaine et le même fluide mais des sections/diamètres différents, un raccord `transition` est automatiquement généré.
5. **Propagation géométrique minimale (Exigence P0) :**
   Le re-maillage incrémental 3D (`Viewport3D.tsx`) propage la salissure à la grappe topologique minimale (segment modifié + raccords incidents + indicateurs de ports) sans reconstruire les éléments non impactés.

---

## 2. Géométrie du Route Solver 3D (`routing.ts`)

### 2.1. Configurations de routage orthogonal

Soit un port de départ $A$ (position $P_A$, normale unitaire sortante $\vec{u}_A$) et un port d'arrivée $B$ (position $P_B$, normale unitaire sortante $\vec{u}_B$).
Le vecteur d'écart spatial est $\vec{\Delta} = P_B - P_A = (\Delta x, \Delta y, \Delta z)$.

1. **Trajet Direct (Straight run) :**
   * Condition : $\vec{\Delta}$ est colinéaire à $\vec{u}_A$, $\vec{u}_B$ est opposé à $\vec{u}_A$ ($\vec{u}_A \cdot \vec{u}_B \approx -1$), et $\|\vec{\Delta}\| \ge L_{\min}$.
   * Trajectoire : 1 segment rectiligne direct $[P_A, P_B]$.
   * Raccords : aucun raccord intermédiaire (éventuellement 1 `transition` si dimensions différentes).

2. **Trajet en L (Single Elbow 90° ou 45°) :**
   * Condition 90° : $\vec{u}_A \cdot \vec{u}_B \approx 0$ ou projection orthogonale.
   * Point de virage $W$ (Waypoint) :
     * Option 1 (L standard) : avancer le long de $\vec{u}_A$ jusqu'à la coordonnée de $P_B$ sur cet axe, puis bifurquer vers $P_B$.
     * Option 2 (L inversé, bascule via `flipL` / touche `Tab`) : avancer le long de l'axe perpendiculaire d'abord, puis rejoindre $P_B$.
   * Trajectoire : 2 segments $[P_A, W]$ et $[W, P_B]$, séparés par un coude (`elbow`) centré en $W$.

3. **Trajet en Z ou Baïonnette (Double Elbow 90° ou 45°) :**
   * Condition : $\vec{u}_A$ et $\vec{u}_B$ sont parallèles et de même sens ($\vec{u}_A \cdot \vec{u}_B \approx 1$), ou axes décalés.
   * Trajectoire : 3 segments $[P_A, W_1]$, $[W_1, W_2]$, $[W_2, P_B]$, avec 2 coudes en $W_1$ et $W_2$.

4. **Colonne montante / descendante ($\Delta z \ne 0$) :**
   * Si $P_A.z \ne P_B.z$, le solveur insère un tronçon vertical d'élévation $[W_{z1}, W_{z2}]$ avec coudes verticaux orientés selon l'axe Z.

### 2.2. Garde-fous contre les micro-segments dégénérés

* `MIN_SEGMENT_LENGTH_MM = 50 mm` : tout segment de longueur inférieure à 50 mm est rejeté ou fusionné.
* `FITTING_CLEARANCE_MM` : distance d'accostage minimale réservée pour chaque embout de raccord.
* Si l'espace entre deux virages est inférieur à $2 \times \text{FITTING_CLEARANCE_MM}$, la configuration est jugée géométriquement invalide et retourne un diagnostic explicite (`ROUTE_INSUFFICIENT_SPACE`).

---

## 3. Raccords Paramétriques (`MepFitting`)

Chaque raccord possède des ports physiques explicitement orientés :

1. **Coude (`elbow`) :**
   * 2 ports orientés selon les directions d'entrée et de sortie des segments raccordés.
   * Angle : 90° ($\pi/2$ rad) ou 45° ($\pi/4$ rad).
2. **Réduction / Transition (`transition`) :**
   * 2 ports coaxiaux opposés ($\vec{u}_1 = -\vec{u}_2$).
   * Port 1 : dimensions amont ($D_1$ ou $W_1 \times H_1$).
   * Port 2 : dimensions aval ($D_2$ ou $W_2 \times H_2$).
3. **Té de dérivation (`tee`) :**
   * 3 ports :
     * Port 1 (`run_start`) : le long du tronçon principal amont.
     * Port 2 (`run_end`) : le long du tronçon principal aval (opposé au Port 1).
     * Port 3 (`branch`) : orthogonal à l'axe principal ($\vec{u}_3 \cdot \vec{u}_1 = 0$).

---

## 4. Piquage en Té Atomique (`InsertTeeBranchCommand`)

### Algorithme transactionnel :
1. **Entrée :** `hostSegmentId`, `splitPoint: Point3D`, `branchData: { endPoint: Point3D, diameter?: number, ... }` ou `branchPortId?: ElementId`.
2. **Vérification de validité :**
   * Le point de piquage $P$ est projeté sur le segment hôte $[S_{\text{start}}, S_{\text{end}}]$.
   * Distance aux extrémités : $d(P, S_{\text{start}}) \ge 50\text{ mm}$ et $d(P, S_{\text{end}}) \ge 50\text{ mm}$. Sinon rejet avec `TEE_TOO_CLOSE_TO_ENDPOINT`.
3. **Mutation (dans le même draft Immer) :**
   * Création du Segment 1 : $[S_{\text{start}}, P]$.
   * Création du Segment 2 : $[P, S_{\text{end}}]$.
   * Création du `MepFitting` de type `tee` en $P$.
   * Connexion Port Té 1 $\leftrightarrow$ Port End Segment 1.
   * Connexion Port Té 2 $\leftrightarrow$ Port Start Segment 2.
   * Reconnexion des anciens connecteurs du segment hôte vers le Port Start Segment 1 et Port End Segment 2.
   * Création du Segment de branche (ou connexion de la branche existante) sur le Port Té 3.
   * Suppression du segment hôte initial.
   * Mise à jour du `MepSystem` : retrait de l'hôte, ajout du Segment 1, Segment 2, Té, Branche.
4. **Undo/Redo :**
   * Immer capture les patches inverses exacts. L'annulation supprime les nouveaux éléments, recrée le segment hôte d'origine avec son identifiant et ses propriétés intactes, et restaure ses connexions sans orphelins.

---

## 5. Matrice de Tests de Qualification

1. **Tests unitaires `routing.test.ts` :**
   * Trajet direct aligné (mêmes dimensions et dimensions différentes avec réduction).
   * Trajet en L à 90° et 45° (avec bascule `flipL`).
   * Trajet en Z (déport parallèle).
   * Trajet avec colonne montante $\Delta Z$.
   * Rejet si ports incompatibles ou espace insuffisant.
2. **Tests de commandes `commands.test.ts` :**
   * `RouteMepPathCommand` : création complète et Undo/Redo.
   * `InsertTeeBranchCommand` : découpe de segment, insertion té, 3 connecteurs, conservation du système, et Undo/Redo parfait.
   * Rejet du piquage à moins de 50 mm des extrémités.
3. **Tests de re-maillage incrémental 3D :**
   * Invalidation de la grappe `segment -> raccord -> segment` lors de la modification d'un tronçon sans invalider les murs architecturaux.
4. **Test E2E Playwright :**
   * Tracé coudé ou piquage en Té dans le navigateur avec vérification de l'inspecteur et rendu 3D Three.js.
