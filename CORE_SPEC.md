# SPÉCIFICATION TECHNIQUE — PACKAGE `@mini-bim/core`

## Noyau Métier, Modèle Documentaire BIM & CommandBus Transactionnel

**Version :** 2.0.0 (Saison 2 / Phase 6 Préparation)  
**Date :** 15 Novembre 2026  
**Auteur :** Lead Software Architect & Computational Geometry Engineer  
**Statut :** Spécification de Référence Alignée (ADR-041 à ADR-043)

---

## 1. Vision et Règles d'Or Architecturales

Le package `@mini-bim/core` constitue la source unique de vérité (_Single Source of Truth_) du modèle d'information du bâtiment dans Mini-BIM. Il est régi par trois règles d'or absolues :

1. **Indépendance Totale de l'Infrastructure Visuelle :**  
   `@mini-bim/core` n'importe **aucun** composant ou hook React, aucune classe Three.js, et aucun élément de l'API DOM (`window`, `document`, `HTMLElement`). Il est consommable de manière identique dans un worker Web, un processus Node.js, ou un client web.
2. **Immutabilité et Command Pattern Exclusif :**  
   Aucune mutation directe de l'état n'est autorisée. Toute modification de l'arbre documentaire passe impérativement par une `Command` exécutée par le `BimDocument`. L'historique d'annulation/rétablissement (Undo/Redo) repose sur les patchs différentiels RFC 6902 générés par Immer (`produceWithPatches`).
3. **Absence de Géométrie Dérivée dans l'État Persistant :**  
   L'état (`BimState`) ne stocke pas de maillages 3D, de polygones découpés ou de coordonnées de rendu. Il stocke exclusivement la définition paramétrique et topologique du projet (lignes d'axe, niveaux, types, offsets 1D d'ouvertures hébergées). Les maillages 3D percés et polygones 2D d'ouvertures sont calculés à la demande par les couches de visualisation (`@mini-bim/view-2d`, `@mini-bim/view-3d`).

---

## 2. Modèle de Données et Schéma Aligné (`types.ts`)

L'état documentaire complet est modélisé par l'interface `BimState` (Schéma Version 2) :

```typescript
export type ElementId = string; // ULID (26 caractères Crockford Base32)

export interface Level {
  readonly id: ElementId;
  readonly name: string;
  readonly elevation: number; // en mm (repère Z-up, source unique de vérité altimétrique)
}

export interface Layer {
  readonly materialId?: string;
  readonly thickness: number; // en mm (> 0)
}

export interface WallType {
  readonly id: ElementId;
  readonly name: string;
  readonly thickness: number; // en mm (> 0)
  readonly height: number; // hauteur nominale en mm (> 0)
  readonly layers?: readonly Layer[];
}

export interface SlabType {
  readonly id: ElementId;
  readonly name: string;
  readonly thickness: number; // en mm (> 0)
  readonly materialId?: string;
}

export interface DoorType {
  readonly id: ElementId;
  readonly name: string;
  readonly width: number; // mm (> 0)
  readonly height: number; // mm (> 0)
}

export interface WindowType {
  readonly id: ElementId;
  readonly name: string;
  readonly width: number; // mm (> 0)
  readonly height: number; // mm (> 0)
  readonly defaultSillHeight: number; // mm
}

export interface TopConstraint {
  readonly levelId: ElementId;
  readonly offset?: number; // décalage en mm (défaut: 0)
}

export interface Wall {
  readonly id: ElementId;
  readonly category: 'wall';
  readonly typeId: ElementId;
  readonly levelId: ElementId;
  readonly start: Vec2; // coordonnées 2D en mm
  readonly end: Vec2; // coordonnées 2D en mm
  readonly baseOffset?: number; // décalage vertical optionnel en mm
  readonly heightOverride?: number; // surcharge optionnelle en mm
  readonly topConstraint?: TopConstraint; // contrainte supérieure (ADR-040)
}

// ---------------------------------------------------------------------------
// Modèle des Ouvertures Hébergées (Schéma v2 / ADR-042)
// ---------------------------------------------------------------------------

export type DoorSwingSide = 'left' | 'right';
export type DoorSwingDirection = 'in' | 'out';

export interface DoorSwing {
  readonly side: DoorSwingSide;
  readonly direction: DoorSwingDirection;
}

export interface Door {
  readonly id: ElementId;
  readonly category: 'door';
  readonly doorTypeId: ElementId;
  readonly hostWallId: ElementId;
  readonly offsetAlong: number; // mm depuis wall.start le long de l'axe directeur
  readonly swing: DoorSwing;
}

export interface Window {
  readonly id: ElementId;
  readonly category: 'window';
  readonly windowTypeId: ElementId;
  readonly hostWallId: ElementId;
  readonly offsetAlong: number; // mm depuis wall.start le long de l'axe directeur
  readonly sillHeight: number; // allège propre à l'instance en mm (>= 0)
}

export type Opening = Door | Window;

// ---------------------------------------------------------------------------
// Modèle des Pièces et Espaces (Phase 4 / ADR-039)
// ---------------------------------------------------------------------------

export interface Room {
  readonly id: ElementId;
  readonly category: 'room';
  readonly levelId: ElementId;
  readonly seed: Vec2;
  readonly name: string;
}

// ---------------------------------------------------------------------------
// Modèle des Cotations Associatives (Phase 5 / ADR-034)
// ---------------------------------------------------------------------------

export interface Dimension {
  readonly id: ElementId;
  readonly category: 'dimension';
  readonly levelId: ElementId;
  readonly references: readonly ElementId[];
  readonly offset: number;
  readonly value: number;
  readonly type: 'linear' | 'aligned';
  readonly customLabel?: string;
}

// ---------------------------------------------------------------------------
// Modèle des Dalles Horizontales (Phase 6 / ADR-035 & ADR-042)
// ---------------------------------------------------------------------------

export interface Slab {
  readonly id: ElementId;
  readonly category: 'slab';
  readonly slabTypeId: ElementId;
  readonly levelId: ElementId;
  readonly boundary: readonly Vec2[]; // CCW
  readonly holes: readonly (readonly Vec2[])[]; // CW (réservations manuelles uniquement)
  readonly baseOffset?: number;
  readonly name?: string;
}

export interface BimState {
  readonly schemaVersion: 2;
  readonly units: 'mm';
  readonly levels: Record<ElementId, Level>;
  readonly wallTypes: Record<ElementId, WallType>;
  readonly slabTypes: Record<ElementId, SlabType>;
  readonly doorTypes: Record<ElementId, DoorType>;
  readonly windowTypes: Record<ElementId, WindowType>;
  readonly walls: Record<ElementId, Wall>;
  readonly slabs: Record<ElementId, Slab>;
  readonly doors: Record<ElementId, Door>;
  readonly windows: Record<ElementId, Window>;
  readonly rooms: Record<ElementId, Room>;
  readonly dimensions: Record<ElementId, Dimension>;
}
```

---

## 3. Commandes Transactionnelles (`commands.ts`)

Chaque mutation implémente l'interface `Command` :

```typescript
export interface Command {
  readonly name: string;
  apply(draft: BimState): void;
  getChangedIds(): readonly ElementId[];
}
```

### Commandes supportées :

- **Murs :**
  - `AddWallCommand(wall)`
  - `UpdateWallCommand(wallId, patch)`
  - `MoveWallCommand(wallId, delta, options)` (Phase 6.0c / ADR-044) : translation d'un mur avec étirement élastique des murs voisins connectés, compensation projective des baies hébergées et mise à jour non-destructive des pièces.
    > _Note d'architecture sur `getChangedIds()` :_ Les IDs des voisins, ouvertures et pièces impactés sont mis en cache lors de l'exécution de `apply()` pour être retournés par `getChangedIds()` dans le même cycle `BimDocument.execute()`. Si `apply()` échoue (ex. `WALL_STRETCH_COLLAPSE`), la transaction est annulée par Immer et la commande n'est pas réutilisée.
  - `DeleteWallCommand(wallId)` : suppression en cascade via `resolveCascadeDeletions` (ADR-038/ADR-041) supprimant automatiquement toutes les portes, fenêtres et cotations associées.
- **Ouvertures hébergées (Schéma v2 / ADR-042) :**
  - `AddDoorCommand(door)` : ajoute une porte après validation d'intégrité et de non-chevauchement.
  - `AddWindowCommand(window)` : ajoute une fenêtre après validation d'intégrité et de non-chevauchement.
  - `UpdateDoorCommand(doorId, patch)` : met à jour l'offset ou le battement.
  - `UpdateWindowCommand(windowId, patch)` : met à jour l'offset ou l'allège.
  - `DeleteOpeningCommand(openingId)` : supprime une baie sans altérer le mur hôte.
  - `MoveOpeningCommand(openingId, newOffsetAlong)` : déplace une ouverture avec revalidation immédiate.
- **Dalles horizontales (Phase 6 / ADR-035) :**
  - `AddSlabCommand(slab)` : insère une dalle après validation `validateSlab`.
  - `UpdateSlabCommand(slabId, patch)` : met à jour contour ou trémies manuelles.
  - `DeleteSlabCommand(slabId)` : supprime la dalle.
- **Gestion des Types Constructifs (ADR-042) :**
  - `AddWallTypeCommand`, `UpdateWallTypeCommand`, `DeleteWallTypeCommand`
  - `AddSlabTypeCommand`, `UpdateSlabTypeCommand`, `DeleteSlabTypeCommand`
  - `AddDoorTypeCommand`, `UpdateDoorTypeCommand`, `DeleteDoorTypeCommand`
  - `AddWindowTypeCommand`, `UpdateWindowTypeCommand`, `DeleteWindowTypeCommand`
  - _Rejet transactionnel :_ Toute suppression d'un type utilisé lève `DELETE_REJECTED`. Toute modification dimensionnelle de type invalidant une instance lève `TYPE_UPDATE_INVALIDATES_INSTANCES`.
- **Niveaux (ADR-036) :** `AddLevelCommand`, `UpdateLevelCommand`, `DeleteLevelCommand` (rejetée avec `DELETE_LEVEL_REJECTED` si le niveau héberge des éléments).
- **Pièces (Phase 4 / ADR-039) :** `AddRoomCommand`, `UpdateRoomCommand`, `DeleteRoomCommand`.
- **Cotations (Phase 5 / ADR-034) :** `AddDimensionCommand`, `UpdateDimensionCommand`, `DeleteDimensionCommand`.

---

## 4. Règles Métier et Intégrité Référentielle (`rules.ts`)

Toute violation de règle métier lève immédiatement une exception explicite `BimValidationError` :

1. **Non-dégénérescence de mur dans le noyau :** Tout mur doit avoir une longueur euclidienne strictement positive au sens numérique :
   $$\sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2} > 10^{-4}\text{ mm}$$
   (`WALL_DEGENERATE`).  
   _(Note d'architecture : Le seuil minimal ergonomique de 100.0 mm est un garde-fou UX géré par les outils interactifs dans `TOOLS_SPEC`, évitant de rejeter des murs courts créés par des algorithmes de jonction ou des fichiers migrés)._
2. **Intégrité référentielle des murs et dalles :**
   - Un mur doit obligatoirement pointer vers un `WallType` et un `Level` existants.
   - Une dalle doit obligatoirement pointer vers un `SlabType` et un `Level` existants (`validateSlab`).
3. **Intégrité référentielle des ouvertures :**
   - Une baie (`Door`, `Window`) doit obligatoirement référencer un mur hôte existant (`UNKNOWN_HOST_WALL`) et un type valide (`UNKNOWN_OPENING_TYPE`).
4. **Dimensions physiques des types d'ouvertures :**
   - `type.width > 0`, `type.height > 0` et valeurs finies (`INVALID_OPENING_DIMENSIONS`).
   - `sillHeight >= 0` pour les fenêtres.
   - Battement valide (`left` | `right`, `in` | `out`) pour les portes.
5. **Bornes géométriques sur l'axe du mur :**
   - L'ouverture doit être entièrement contenue dans l'intervalle $[0, L]$ du mur :
     $$0 \le \text{offsetAlong} \le \text{offsetAlong} + \text{type.width} \le L_{\text{wall}}$$
     (`INVALID_OPENING_POSITION`).
   - Hauteur sous linteau par rapport à la hauteur effective du mur :
     - Pour une porte : $\text{type.height} \le H_{\text{eff}}$
     - Pour une fenêtre : $\text{sillHeight} + \text{type.height} \le H_{\text{eff}}$
       (`INVALID_OPENING_HEIGHT`).
6. **Non-chevauchement et dégagement minimal :**
   - Deux ouvertures sur un même mur hôte ne peuvent se chevaucher en 1D :
     $$[\text{offset}_i, \text{offset}_i + w_i] \cap [\text{offset}_j, \text{offset}_j + w_j] = \emptyset$$
     (`OPENING_OVERLAP`).
   - Les trumeaux minimaux et dégagements respectent la fonction `validateOpenings` de `@mini-bim/geometry` et $\text{MIN\_OPENING\_CLEARANCE} = 50\text{ mm}$ (`INVALID_OPENING_CLEARANCE`).
7. **Post-Condition Universelle Différentielle `validateDirty` :**  
   Avant d'enregistrer une transaction dans l'historique Undo/Redo, `BimDocument.execute()` invoque systématiquement `validateDirty(draftState, changedIds, previousState)`.
   - **Validation Différentielle :** La commande n'est rejetée que si elle introduit au moins une _nouvelle_ violation de règle sur le dirty set ou aggrave une violation existante, protégeant les opérations légitimes sur des modèles contenant des avertissements préalables.
   - **Diagnostic Précis :** L'exception `BimValidationError` inclut obligatoirement le tableau `offendingIds: ElementId[]`, permettant à l'UI de surligner en rouge les éléments coupables.
8. **Protection de suppression unifiée (`DELETE_RESTRICTED`) :**  
   Conformément au registre déclaratif `RELATIONS_REGISTRY` (ADR-038) et au DAG (ADR-041), toute tentative de suppression d'un élément ayant une relation `onDelete: 'restrict'` avec des dépendants actifs est rejetée avec le code d'erreur unifié `DELETE_RESTRICTED` et la liste `blockingIds: ElementId[]` des éléments bloquants :
   - Un `Level` référencé par des murs ou des dalles.
   - Un `WallType` instancié par des murs.
   - Un `SlabType` instancié par des dalles.
   - Un `DoorType` ou `WindowType` instancié par des ouvertures.  
     _(À l'inverse, `Wall` hébergeant des ouvertures est supprimé en cascade transactionnelle via `onDelete: 'cascade'`)._
9. **Intégrité Altimétrique des Niveaux :**  
   Deux niveaux ne peuvent partager strictement la même élévation ($\forall i \ne j, \text{elevation}_i \ne \text{elevation}_j$), évitant toute ambiguïté de tri ou hauteur d'étage nulle. En cas de doublon, rejet immédiat avec `DUPLICATE_LEVEL_ELEVATION` (`offendingIds: [levelA.id, levelB.id]`).
   - Helper métier : `setStoryHeight(state, levelIndex, height)` calculant l'élévation absolue requise pour le niveau supérieur et émettant `UpdateLevelCommand(level_{index+1}, { elevation: level_index.elevation + height })`.

---

## 5. Gestionnaire Documentaire `BimDocument` (`document.ts`)

```typescript
export class BimDocument {
  public constructor(initialState?: BimState);

  public static createEmptyState(): BimState;
  public static createDefaultProject(): BimDocument;
  public static fromJSON(jsonString: string): BimDocument;

  public getState(): Readonly<BimState>;
  public execute(cmd: Command): CommandResult;
  public undo(): boolean;
  public redo(): boolean;
  public canUndo(): boolean;
  public canRedo(): boolean;
  public subscribe(listener: DocumentListener): () => void;
  public toJSON(pretty?: boolean): string;
}
```

### Mécanisme Undo / Redo Transactionnel (`history.ts`)

1. Lors de `execute(cmd)`, Immer génère `patches` et `inversePatches` via `produceWithPatches`.
2. L'entrée `{ patches, inversePatches, changed }` est empilée dans `undoStack`. La pile `redoStack` est immédiatement vidée.
3. **Cascade Undo/Redo :** Lors de `undo()` d'une commande `DeleteWallCommand`, l'inversion des patchs Immer restaure simultanément le mur ET toutes les ouvertures supprimées en cascade sans aucune logique impérative ad-hoc.
4. Lors de `redo()`, le mur et ses ouvertures sont ré-effacés atomiquement.
5. Tous les abonnés (`subscribe`) sont notifiés avec la liste exhaustive des `ElementId` modifiés ou supprimés (`changed`).

---

## 6. Format de Sérialisation JSON & Rétrocompatibilité (Schéma v2)

Exemple de document sérialisé en JSON conforme au Schéma Version 2 (`schemaVersion: 2`, `units: "mm"`) :

```json
{
  "schemaVersion": 2,
  "units": "mm",
  "levels": {
    "01JCTP9Y2M14N58XVB69K4W7AZ": {
      "id": "01JCTP9Y2M14N58XVB69K4W7AZ",
      "name": "Niveau 0 (RDC)",
      "elevation": 0
    }
  },
  "wallTypes": {
    "01JCTP9Y2M14N58XVB69K4W7B0": {
      "id": "01JCTP9Y2M14N58XVB69K4W7B0",
      "name": "Générique - 200mm",
      "thickness": 200,
      "height": 2800
    }
  },
  "slabTypes": {
    "01JCTP9Y2M14N58XVB69K4W7S0": {
      "id": "01JCTP9Y2M14N58XVB69K4W7S0",
      "name": "Dalle BA 200 mm",
      "thickness": 200
    }
  },
  "doorTypes": {
    "01JCTP9Y2M14N58XVB69K4W7DT": {
      "id": "01JCTP9Y2M14N58XVB69K4W7DT",
      "name": "Porte Isoplane 900x2100",
      "width": 900,
      "height": 2100
    }
  },
  "windowTypes": {
    "01JCTP9Y2M14N58XVB69K4W7WT": {
      "id": "01JCTP9Y2M14N58XVB69K4W7WT",
      "name": "Fenêtre Châssis 1200x1400",
      "width": 1200,
      "height": 1400,
      "defaultSillHeight": 900
    }
  },
  "walls": {
    "01JCTP9Y2M14N58XVB69K4W7B1": {
      "id": "01JCTP9Y2M14N58XVB69K4W7B1",
      "category": "wall",
      "typeId": "01JCTP9Y2M14N58XVB69K4W7B0",
      "levelId": "01JCTP9Y2M14N58XVB69K4W7AZ",
      "start": { "x": 0, "y": 0 },
      "end": { "x": 5000, "y": 0 }
    }
  },
  "slabs": {},
  "doors": {
    "01JCTP9Y2M14N58XVB69K4W7D1": {
      "id": "01JCTP9Y2M14N58XVB69K4W7D1",
      "category": "door",
      "doorTypeId": "01JCTP9Y2M14N58XVB69K4W7DT",
      "hostWallId": "01JCTP9Y2M14N58XVB69K4W7B1",
      "offsetAlong": 800,
      "swing": {
        "side": "right",
        "direction": "in"
      }
    }
  },
  "windows": {
    "01JCTP9Y2M14N58XVB69K4W7W1": {
      "id": "01JCTP9Y2M14N58XVB69K4W7W1",
      "category": "window",
      "windowTypeId": "01JCTP9Y2M14N58XVB69K4W7WT",
      "hostWallId": "01JCTP9Y2M14N58XVB69K4W7B1",
      "offsetAlong": 2500,
      "sillHeight": 900
    }
  },
  "rooms": {},
  "dimensions": {}
}
```

> [!NOTE] Migration Automatisée sans Perte (ADR-043)
> La fonction pure `migrateSchemaV1toV2` convertit automatiquement tout document de schéma v1 (Phases 1 à 5). Elle synthétise un `DoorType` par couple distinct $(width, height)$ et un `WindowType` par triplet distinct $(width, height, sillHeight)$, préserve la hauteur d'origine des murs via `heightOverride = wallType.height`, et garantit une conservation de volume et une égalité bit-à-bit stricte lors du round-trip.
