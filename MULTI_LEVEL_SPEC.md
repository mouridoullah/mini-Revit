# SPÉCIFICATION TECHNIQUE — MULTI-NIVEAUX & VUE FANTÔME (UNDERLAY)

**Version :** 1.0  
**Date :** 15 novembre 2026  
**Statut :** Spécification Validée (Phase 6)  
**Auteurs :** Lead Software Architect & Computational Geometry Engineer

---

## 1. Objet et Enjeux

Dans un outil BIM professionnel, un bâtiment n'est pas un plan 2D isolé : c'est un ensemble d'étages superposés partageant des contraintes structurelles verticales (alignement des refends, gaines techniques et trémies d'escalier).

Cette spécification définit :

1. Le modèle et les calculs altimétriques des niveaux (`Level`).
2. La gestion du niveau actif dans l'application web.
3. Le mécanisme de projection et de tracé fantôme en transparence (_Underlay_).
4. Le magnétisme inter-niveaux pour l'alignement des parois d'étages.

---

## 2. Modèle des Niveaux (`Level`)

### 2.1 Définition Paramétrique

Dans `BimState.levels`, chaque niveau possède :

- `id: ElementId` (ULID).
- `name: string` (ex: "Rez-de-chaussée", "Étage 1", "Combles").
- `elevation: number` (altitude absolue en mm par rapport au sol $Z=0$).
- `height: number` (hauteur sous plafond ou hauteur d'étage en mm, ex: 2800 mm).

### 2.2 Propagation Altimétrique Paramétrique

Lors de l'ajout ou de la modification de la hauteur d'un étage :

- L'élévation des niveaux supérieurs est automatiquement recalculée par empilement :
  $$\text{Level}_{i+1}.\text{elevation} = \text{Level}_i.\text{elevation} + \text{Level}_i.\text{height}$$
- Les éléments (murs, portes, dalles) rattachés à un niveau conservent leur décalage relatif (`baseOffset`) et se déplacent verticalement de manière cohérente.

---

## 3. Gestion du Niveau Actif dans l'Application Web

- Le store UI (ou le contexte `BimDocumentContext`) gère la variable d'état réactive :
  `activeLevelId: ElementId`
- **Comportement du Viewport 2D :**
  - Seuls les éléments appartenant au niveau actif (`element.levelId === activeLevelId`) sont interactifs (sélectionnables, déplaçables).
  - La création de nouveaux éléments (`WallTool`, `DoorTool`, `SlabTool`) leur attribue automatiquement l'`activeLevelId`.
- **Comportement du Viewport 3D :**
  - Tous les niveaux du bâtiment sont affichés ensemble dans l'espace 3D.
  - Optionnel : Mise en évidence subtile ou surbrillance des éléments du niveau actif.

---

## 4. Système de Vue Fantôme (_Underlay_)

### 4.1 Principe

Sur un plan d'étage (R+1), l'architecte a besoin de repérer visuellement où se trouvent les murs porteurs du rez-de-chaussée pour :

1. Aligner les façades extérieures au centimètre près.
2. Poser les cloisons lourdes d'étage à l'aplomb des murs de refend du RDC.
3. Vérifier que la trémie d'escalier débouche au bon endroit.

### 4.2 Représentation Graphique

- Les murs du niveau inférieur ($N-1$) sont dessinés sur le Canvas 2D avec un style atténué :
  - `strokeStyle: '#9ca3af'` (gris moyen).
  - `lineDash: [4, 4]` (pointillés fins).
  - `globalAlpha: 0.5`.
- Les éléments de l'Underlay ne sont pas sélectionnables au clic (pour ne pas interférer avec le travail en cours sur le niveau actif).

### 4.3 Accrochage Magnétique (Snapping) sur l'Underlay

Le moteur de snap (`snap.ts`) inclut les sommets et arêtes des murs de l'Underlay avec un rayon d'attraction configurable (ex: 50 mm), permettant un alignement immédiat sans avoir à relever les coordonnées à la main.

---

## 5. Matrice de Validation

1. **Test unitaire Core :** Changement de hauteur d'un niveau $\implies$ mise à jour des élévations des niveaux supérieurs.
2. **Test 2D Canvas :** L'activation de l'Underlay appelle les fonctions de tracé avec `setLineDash` et la couleur grise attendue.
3. **Test d'alignement Snap :** Un clic proche d'un mur fantôme de l'Underlay s'accroche exactement sur ses coordonnées $X, Y$.
