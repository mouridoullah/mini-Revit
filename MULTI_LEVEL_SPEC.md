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

Dans `BimState.levels`, chaque niveau est minimal et non redondant :

```typescript
export interface Level {
  readonly id: ElementId;
  readonly name: string; // Ex: "Rez-de-chaussée", "Étage 1", "Combles"
  readonly elevation: number; // Source unique de vérité altimétrique (mm, repère Z-up)
}
```

- **Absence de redondance :** Aucun champ `order` ou `storyHeight` n'est stocké dans l'état documentaire.
- **Ordre dérivé déterministe :** La relation d'ordre est calculée dynamiquement par tri des niveaux sur leur élévation croissante :
  $$\text{getSortedLevels}(\text{levels}) \implies \text{elevation}_0 < \text{elevation}_1 < \dots < \text{elevation}_k$$
- **Hauteur d'étage dérivée :** La hauteur d'un étage $i$ vers $i+1$ est une vue calculée à la demande :
  $$\text{getLevelStoryHeight}(\text{state}, \text{level}_i) = \text{elevation}_{i+1} - \text{elevation}_i$$

### 2.2 Propagation Altimétrique Paramétrique & Intégrité Altimétrique

1. **Mutation de Niveau (`UpdateLevelCommand`) :**  
   Lorsqu'une commande `UpdateLevelCommand(levelId, { elevation: newElevation })` est exécutée (ou lors du changement de hauteur libre d'étage $\Delta H$) :
   $$\Delta = newElevation - oldElevation$$
   L'élévation de tous les niveaux supérieurs $j > i$ est automatiquement décalée :
   $$\forall j > i, \quad \text{elevation}_j \gets \text{elevation}_j + \Delta$$
2. **Unicité Stricte et Règle d'Élévations Distinctes (`validateDirty`) :**  
   Le modèle impose formellement que chaque niveau possède une élévation unique ($\forall i \ne j, \text{elevation}_i \ne \text{elevation}_j$). Toute commande produisant deux niveaux coplanaires est rejetée avec `DUPLICATE_LEVEL_ELEVATION`.
3. **Helper Métier `setStoryHeight` :**  
   Pour piloter la hauteur sous plafond d'un étage sans calcul manuel d'altitude absolue :  
   `setStoryHeight(state, levelIndex, height)` émet `UpdateLevelCommand(levels[levelIndex + 1].id, { elevation: levels[levelIndex].elevation + height })`.
4. **Invalidation par le DAG (ADR-041) :**  
   Le DAG propage la translation à l'ensemble des éléments rattachés aux niveaux supérieurs :
   - Dalles structurelles ($Z_{\text{sup}} = \text{level.elevation} + baseOffset$),
   - Sommets de murs contraints en tête via `topConstraint` (ADR-040),
   - Cotations altimétriques associatives.

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
  - Compensation d'échelle pour tracé invariant à l'écran :
    `ctx.lineWidth = 1 / scale`
    `ctx.setLineDash([4 / scale, 4 / scale])` (évite les traits baveux au zoom fort ou microscopiques au dézoom).
  - `globalAlpha: 0.5`.
- Les éléments de l'Underlay ne sont pas sélectionnables au clic (pour ne pas interférer avec le travail en cours sur le niveau actif).

### 4.3 Accrochage Magnétique (Snapping) sur l'Underlay

Le moteur de snap (`snap.ts`) inclut les sommets et arêtes des murs et baies de l'Underlay.  
Conformément à la convention de l'ADR-024 et aux règles UX, le rayon d'attraction est strictement défini en **pixels écran** :
$$\text{snapDistanceWorld} = \frac{12\text{ px}}{\text{scale}}$$
L'accrochage reste ainsi parfaitement ergonomique quel que soit le niveau de zoom de la vue en plan.

### 4.4 Architecture Vectorielle Haute Performance : Cache `Path2D` Mondial

Afin d'éviter les artefacts de pixellisation au zoom et les bordures vides en panoramique inhérents aux caches bitmaps :

1. **Compilation Vectorielle en `Path2D` :**  
   L'ensemble des segments de murs et baies du niveau $N-1$ est pré-compilé dans un objet natif Canvas `Path2D` en coordonnées mondes réelles (millimètres).
2. **Invalidation par les `changedIds` du DAG :**  
   Ce `Path2D` est conservé en mémoire et réutilisé intégralement sans recalcul géométrique. Il n'est régénéré que lorsque `changedIds` contient au moins une entité appartenant au niveau $N-1$.
3. **Tracé GPU Direct à Chaque Frame avec Compensation d'Échelle :**  
   À chaque rafraîchissement d'écran du Viewport 2D, après application de la transformation cartésienne `Transform2D`, le visualiseur applique les styles normalisés et exécute un unique appel :
   ```typescript
   ctx.lineWidth = 1 / scale;
   ctx.setLineDash([4 / scale, 4 / scale]);
   ctx.stroke(cachedUnderlayPath2D);
   ```
   - **Avantages :** Netteté vectorielle absolue sans flou quel que soit le zoom, aucun bord noir lors des pans rapides, et complexité CPU $\mathcal{O}(1)$ appel d'API sans allocation bitmap hors-écran.

---

## 5. Matrice de Validation

1. **Test unitaire Core :** Modification de hauteur de niveau $\implies$ translation automatique de l'élévation des niveaux supérieurs et propagation DAG aux murs/dalles. Unicité stricte des élévations et helper `setStoryHeight`.
2. **Test 2D Canvas :** L'activation de l'Underlay génère le tracé en pointillés gris (`#9ca3af`) avec les baies du niveau inférieur, avec `lineWidth = 1/scale` et `lineDash = [4/scale, 4/scale]` validés quel que soit le zoom.
3. **Test d'accrochage Snap en pixels :** À zoom $1\times$, l'aimantation opère à 12 mm monde ; à zoom $0.1\times$, elle opère à 120 mm monde ($12\text{ px} / \text{scale}$).
4. **Test de Cache Vectoriel `Path2D` :** 10 opérations consécutives de pan/zoom réutilisent l'instance `Path2D` en cache sans ré-exécuter le moteur d'extraction géométrique.
