# SPÉCIFICATION TECHNIQUE DU MODULE DE PIÈCES (ROOMS_SPEC.md)

**Statut :** Spécification de Référence — Phase 4  
**Date :** 14 novembre 2026  
**Auteur :** Lead Software Architect & Computational Geometry Engineer  
**Packages d'implémentation :** `@mini-bim/core`, `@mini-bim/geometry`, `@mini-bim/view-2d`, `@mini-bim/view-3d`

---

## 1. Principes Fondamentaux et Axiomes BIM

Le module de pièces architecturales (_Rooms_) obéit aux règles fondatrices de Mini-BIM :

1. **La Pièce est un Élément Dérivé (Règle d'Or 1) :**  
   L'entité `Room` stocke uniquement son identifiant (`id`), sa catégorie (`room`), son niveau d'attachement (`levelId`), un point de repère intérieur (`seed: Vec2`) et un nom (`name: string`).  
   **Aucun polygone n'est persisté dans `BimDocument`**. Le contour géométrique, la surface utile, le périmètre et le volume sont recalculés dynamiquement à la demande à partir de la géométrie courante des murs hôtes.
2. **Détection par Union Booléenne et Extraction de Trous (Règle d'Or 2) :**  
   La fermeture d'une pièce est calculée via l'union booléenne des emprises 2D au sol des murs (`polygon-clipping`). Un trou intérieur dans l'union solide des murs constitue une pièce candidate.
3. **Partitionnement Strict par Niveau (Règle d'Or 3) :**  
   Les murs doivent appartenir au même niveau pour clore un espace. Les espaces à cheval sur plusieurs niveaux sont partitionnés par niveau.
4. **Calcul Strictement Intérieur des Surfaces :**  
   La surface calculée est celle délimitée par la face intérieure des murs (nu intérieur fini). Pour un contour de 4 murs d'axe 4 m × 3 m avec une épaisseur de 200 mm :
   $$\text{Largeur intérieure} = 4\,000 - 200 = 3\,800\text{ mm}$$
   $$\text{Longueur intérieure} = 3\,000 - 200 = 2\,800\text{ mm}$$
   $$\text{Surface intérieure} = 3,8\text{ m} \times 2,8\text{ m} = 10,64\text{ m}^2 \quad (\text{et non l'enveloppe extérieure } 4,2 \times 3,2 = 13,44\text{ m}^2)$$

---

## 2. Modèle de Données et Typage (`@mini-bim/core`)

### 2.1 Interface `Room`

```typescript
export interface Room {
  readonly id: ElementId;
  readonly category: 'room';
  readonly levelId: ElementId;
  readonly seed: Vec2; // Coordonnées 2D mondes intérieures garantissant la réconciliation
  readonly name: string; // "Séjour", "Chambre 1", "Bureau", etc.
}
```

Le document `BimState` intègre la collection indexée :

```typescript
export interface BimState {
  // ...
  readonly rooms: Record<ElementId, Room>;
}
```

### 2.2 Interface `DetectedRoom` (Géométrie Recalculée)

```typescript
export interface DetectedRoom {
  readonly polygon: Vec2[]; // Contour extérieur CCW en mm
  readonly holes?: Vec2[][]; // Îlots intérieurs (ex. piliers / poteaux)
  readonly areaMm2: number; // Surface intérieure nette en mm²
  readonly perimeterMm: number; // Périmètre intérieur en mm
  readonly seed: Vec2; // Point intérieur calculé via polylabel
  readonly existingRoomId?: ElementId; // Identifiant du Room associé
}
```

---

## 3. Algorithme de Détection Automatique (`detectRooms`)

L'algorithme s'exécute en 6 étapes déterministes :

```mermaid
flowchart TD
    A["1. Collecte des murs du niveau actif"] --> B["2. Calcul de l'emprise 2D (computeWallFootprint2d)"]
    B --> C["3. Union polygonale booléenne (polygon-clipping)"]
    C --> D["4. Décomposition : Anneau externe (enveloppe) vs Trous intérieurs"]
    D --> E["5. Détection des îlots / poteaux intérieurs"]
    E --> F["6. Calcul du point représentatif via computePolylabel"]
    F --> G["7. Réconciliation spatiale avec les entités Room existantes"]
```

1. **Collecte des Murs :**  
   Sélectionne tous les murs du document associés au `levelId` spécifié.
2. **Génération des Emprises :**  
   Chaque mur génère son polygone d'emprise au sol 2D via `computeWallFootprint2d(wall, thickness)`.
3. **Union Booléenne (`unionPolygonFootprints`) :**  
   L'union multi-polygones produit un ou plusieurs polygones à trous (`MultiPolygon`).
4. **Extraction des Vides Intérieurs :**  
   Tout anneau interne de l'union correspond à un espace clos par des murs. Les anneaux sont orientés dans le sens trigonométrique direct (CCW), garantissant une aire signée positive :
   $$A = \frac{1}{2} \sum_{i=0}^{n-1} (x_i y_{i+1} - x_{i+1} y_i) > 0$$
5. **Association des Poteaux / Îlots :**  
   Si un mur ou un poteau isolé est érigé à l'intérieur d'un vide, son polygone est identifié comme un anneau intérieur (`holes`) et sa surface est automatiquement déduite de la surface de la pièce.
6. **Positionnement du Libellé via `computePolylabel` :**  
   Pour chaque pièce, le centre visuel optimal est déterminé par l'algorithme Polylabel (pôle d'inaccessibilité de Mapbox). Ce point garantit que le texte du libellé ne chevauchera jamais une arête de mur, y compris pour des pièces concaves (en forme de L ou de U).
7. **Réconciliation Sémantique :**  
   Chaque `Room` déclaré dans `state.rooms` est testé via `isPointInPolygon(room.seed, polygon)`. S'il est inclus, le trou adopte son identifiant et son nom. Les pièces détectées sans entité déclarée reçoivent le statut de pièce candidate anonyme.

---

## 4. Cycle de Vie, Règles de Validation et Cascade (ADR-032 Option B)

### 4.1 Validation Métier (`rules.ts`)

- `INVALID_ROOM_NAME` : le nom de la pièce doit être une chaîne non vide (après suppression des espaces).
- `UNKNOWN_LEVEL` : le niveau hôte spécifié doit exister dans `state.levels`.
- `ROOM_SEED_NOT_IN_CLOSED_AREA` : lors de la création d'une pièce (`AddRoomCommand`), le `seed` spécifié doit obligatoirement être situé à l'intérieur d'un contour clos détecté sur ce niveau.
- `LEVEL_HAS_ATTACHED_ROOMS` : rejet formel de la suppression d'un niveau si des pièces y sont encore rattachées (`canDeleteLevel`).

### 4.2 Cascade de Suppression des Murs (Option B)

Lorsqu'un mur est supprimé via `DeleteWallCommand` :

1. Le mur est retiré du document et ses ouvertures hébergées sont supprimées en cascade (Phase 3.1).
2. L'espace intérieur peut se retrouver ouvert (perte de la fermeture physique).
3. `detectRooms` est réévalué sur le niveau hôte. Toute entité `Room` dont le `seed` ne se trouve plus dans un espace fermé valide est supprimée automatiquement du dictionnaire `state.rooms`.
4. `DeleteWallCommand.getChangedIds()` retourne l'identifiant du mur supprimé, les identifiants de toutes ses ouvertures supprimées en cascade, ainsi que les identifiants de toutes les pièces supprimées en cascade.
5. **Réversibilité totale (Undo/Redo) :** Grâce aux patches inverses Immer, annuler la suppression du mur restaure fidèlement le mur, ses ouvertures et ses pièces associées avec leurs surfaces exactes.
