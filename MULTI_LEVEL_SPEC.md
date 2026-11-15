# SPÉCIFICATION TECHNIQUE — MULTI-NIVEAUX & VUE FANTÔME (UNDERLAY)

**Version :** 1.1  
**Date :** 15 novembre 2026  
**Statut :** Spécification Validée (Phase 6 — Révisée suite à l'Audit Croisé)  
**Auteurs :** Lead Software Architect & Computational Geometry Engineer

---

## 1. Objet et Enjeux

Dans un outil BIM professionnel, un bâtiment n'est pas un plan 2D isolé : c'est un ensemble d'étages superposés partageant des contraintes structurelles verticales (alignement des refends, gaines techniques et trémies d'escalier).

Cette spécification définit :

1. Le modèle, la relation d'ordre et les calculs altimétriques stricts des niveaux (`Level`).
2. La gestion du niveau actif dans l'application web.
3. Le mécanisme de projection et de tracé fantôme en transparence (_Underlay_) avec mise en cache hors-écran.
4. Le magnétisme inter-niveaux basé sur une tolérance en pixels écran.

---

## 2. Modèle des Niveaux (`Level`)

### 2.1 Définition Paramétrique et Source Unique de Vérité

Dans `BimState.levels`, chaque niveau possède :

- `id: ElementId` (ULID).
- `name: string` (ex: "Rez-de-chaussée", "Étage 1", "Combles").
- `elevation: number` (**Source unique de vérité altimétrique** : altitude absolue en mm par rapport à la référence du projet $Z=0$).
- `storyHeight?: number` (Hauteur libre d'étage indicative en mm, ex: 2800 mm).
- `order?: number` (Index ordinal d'empilement, cohérent avec le tri par `elevation` croissante).

### 2.2 Relation d'Ordre et Propagation Altimétrique Paramétrique

1. **Relation d'Ordre Déterministe :**  
   Les niveaux du bâtiment sont strictement ordonnés par `elevation` croissante :
   $$\text{elevation}_0 < \text{elevation}_1 < \dots < \text{elevation}_k$$
2. **Dérivation de la Hauteur d'Étage :**  
   La hauteur de l'étage $i$ vers l'étage $i+1$ est une propriété dérivée :
   $$\text{storyHeight}_i = \text{elevation}_{i+1} - \text{elevation}_i$$
3. **Propagation lors de la Modification d'Hauteur d'Étage :**  
   Lors de l'appel à la commande `UpdateLevelHeightCommand(level_i, newHeight)` :
   $$\Delta = newHeight - (\text{elevation}_{i+1} - \text{elevation}_i)$$
   L'élévation de tous les niveaux supérieurs $j > i$ est automatiquement translatée :
   $$\forall j > i, \quad \text{elevation}_j \gets \text{elevation}_j + \Delta$$
4. **Invalidation par le DAG (ADR-041) :**  
   Le DAG propage la translation à l'ensemble des éléments attachés aux niveaux supérieurs :
   - Dalles (`Z_sup = level.elevation + baseOffset`),
   - Sommets de murs contraints en tête via `topConstraint` (ADR-040),
   - Cotations altimétriques.

---

## 3. Gestion du Niveau Actif dans l'Application Web

- Le store UI (ou le contexte `BimDocumentContext`) gère la variable d'état réactive :
  `activeLevelId: ElementId`
- **Comportement du Viewport 2D :**
  - Seuls les éléments appartenant au niveau actif (`element.levelId === activeLevelId`) sont interactifs (sélectionnables, déplaçables).
  - La création de nouveaux éléments (`WallTool`, `DoorTool`, `SlabTool`) leur attribue automatiquement l'`activeLevelId`.
- **Comportement du Viewport 3D :**
  - Tous les niveaux du bâtiment sont affichés ensemble dans l'espace 3D.
  - Les éléments du niveau actif bénéficient d'un contraste normal, tandis que les éléments des autres niveaux peuvent être affichés avec une opacité standard ou légèrement atténuée.

---

## 4. Système de Vue Fantôme (_Underlay_)

### 4.1 Principe

Sur un plan d'étage (R+1), l'architecte a besoin de repérer visuellement où se trouvent les murs porteurs du rez-de-chaussée pour :

1. Aligner les façades extérieures au millimètre près.
2. Poser les cloisons lourdes d'étage à l'aplomb des murs de refend du RDC.
3. Vérifier que la trémie d'escalier débouche au bon endroit.

### 4.2 Représentation Graphique

- Les murs et baies du niveau inférieur ($N-1$) sont dessinés sur le Canvas 2D avec un style atténué :
  - `strokeStyle: '#9ca3af'` (gris moyen).
  - `lineDash: [4, 4]` (pointillés fins).
  - `globalAlpha: 0.5`.
- Les éléments de l'Underlay ne sont pas sélectionnables au clic (pour ne pas interférer avec le travail en cours sur le niveau actif).

### 4.3 Accrochage Magnétique (Snapping) sur l'Underlay

Le moteur de snap (`snap.ts`) inclut les sommets et arêtes des murs et baies de l'Underlay.  
Conformément à la convention de l'ADR-024 et aux règles UX, le rayon d'attraction est strictement défini en **pixels écran** :
$$\text{snapDistanceWorld} = \frac{12\text{ px}}{\text{scale}}$$
L'accrochage reste ainsi parfaitement ergonomique quel que soit le niveau de zoom de la vue en plan.

### 4.4 Architecture Haute Performance : Mise en Cache Hors-Écran & Culling

Pour garantir un framerate constant de 60 FPS sans jamais tronquer arbitrairement la maquette :

1. **Cache Hors-Écran (`OffscreenCanvas`) :**  
   Le tracé de l'Underlay du niveau $N-1$ est rendu dans un canvas hors-écran dédié.
2. **Invalidation par les `changedIds` du DAG :**  
   Le bitmap de l'Underlay est réutilisé en temps constant $\mathcal{O}(1)$ (`drawImage`) à chaque frame de navigation (pan/zoom). Il n'est recalculé que si `changedIds` contient au moins un élément appartenant au niveau $N-1$.
3. **Culling Spatial sur le Viewport :**  
   Lors du rafraîchissement du cache, seuls les éléments intersectant la boîte englobante de la vue écran active (`Transform2D.screenToWorld`) sont soumis au tracé vectoriel.

---

## 5. Matrice de Validation

1. **Test unitaire Core :** Modification de hauteur de niveau $\implies$ translation automatique de l'élévation des niveaux supérieurs et propagation DAG aux murs/dalles.
2. **Test 2D Canvas :** L'activation de l'Underlay génère le tracé en pointillés gris (`#9ca3af`) avec les baies du niveau inférieur.
3. **Test d'accrochage Snap en pixels :** À zoom $1\times$, l'aimantation opère à 12 mm monde ; à zoom $0.1\times$, elle opère à 120 mm monde ($12\text{ px} / \text{scale}$).
4. **Test de Cache Hors-Écran :** 10 opérations consécutives de pan/zoom réutilisent le cache sans aucun re-tracé de géométrie vectorielle sous-jacente.
