# SPÉCIFICATION TECHNIQUE — PACKAGE `@mini-bim/core`

## Noyau Métier, Modèle Documentaire BIM & CommandBus Transactionnel

**Version :** 0.2.0 (Phase 3.1)  
**Date :** 14 Novembre 2026  
**Auteur :** Lead Software Architect & Computational Geometry Engineer  
**Statut :** Livré, testé et certifié conforme par 72 tests automatisés (389 tests globaux)

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

L'état documentaire complet est modélisé par l'interface `BimState` :

```typescript
export type ElementId = string; // ULID (26 caractères Crockford Base32)

export interface Level {
  readonly id: ElementId;
  readonly name: string;
  readonly elevation: number; // en mm (repère Z-up)
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

export interface Wall {
  readonly id: ElementId;
  readonly category: 'wall';
  readonly typeId: ElementId;
  readonly levelId: ElementId;
  readonly start: Vec2; // coordonnées 2D en mm
  readonly end: Vec2; // coordonnées 2D en mm
  readonly baseOffset?: number; // décalage vertical optionnel en mm
  readonly heightOverride?: number; // surcharge optionnelle en mm
}

// ---------------------------------------------------------------------------
// Modèle des Ouvertures Hébergées (Phase 3.1)
// ---------------------------------------------------------------------------

export type DoorSwingSide = 'left' | 'right';
export type DoorSwingDirection = 'in' | 'out';

export interface DoorSwing {
  readonly side: DoorSwingSide;
  readonly direction: DoorSwingDirection;
}

export interface OpeningBase {
  readonly id: ElementId;
  readonly hostWallId: ElementId;
  readonly offsetAlong: number; // mm depuis wall.start le long de l'axe directeur
  readonly width: number; // mm (> 0)
  readonly height: number; // mm (> 0)
}

export interface Door extends OpeningBase {
  readonly category: 'door';
  readonly kind: 'door';
  readonly swing: DoorSwing;
}

export interface Window extends OpeningBase {
  readonly category: 'window';
  readonly kind: 'window';
  readonly sillHeight: number; // allège en mm (>= 0)
}

export type Opening = Door | Window;

export interface BimState {
  readonly schemaVersion: 1;
  readonly units: 'mm';
  readonly levels: Record<ElementId, Level>;
  readonly wallTypes: Record<ElementId, WallType>;
  readonly walls: Record<ElementId, Wall>;
  readonly doors: Record<ElementId, Door>;
  readonly windows: Record<ElementId, Window>;
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
  - `DeleteWallCommand(wallId)` : suppression en cascade (`ON DELETE CASCADE`) supprimant automatiquement toutes les portes et fenêtres hébergées par le mur. `getChangedIds()` retourne l'identifiant du mur ET des ouvertures supprimées.
- **Ouvertures hébergées (Phase 3.1) :**
  - `AddDoorCommand(door)` : ajoute une porte après validation d'intégrité et de non-chevauchement. Notifie `[door.id, door.hostWallId]`.
  - `AddWindowCommand(window)` : ajoute une fenêtre après validation d'intégrité et de non-chevauchement. Notifie `[window.id, window.hostWallId]`.
  - `UpdateDoorCommand(doorId, patch)` : met à jour dimensions ou battement après validation.
  - `UpdateWindowCommand(windowId, patch)` : met à jour dimensions ou allège après validation.
  - `DeleteOpeningCommand(openingId)` : supprime une porte ou une fenêtre de manière ciblée sans altérer le mur hôte. Notifie `[openingId, hostWallId]`.
  - `MoveOpeningCommand(openingId, newOffsetAlong)` : déplace une ouverture le long de l'axe du mur hôte avec revalidation géométrique immédiate.
- **Niveaux :** `AddLevelCommand`, `UpdateLevelCommand`, `DeleteLevelCommand`.
- **Types de murs :** `AddWallTypeCommand`, `UpdateWallTypeCommand`, `DeleteWallTypeCommand`.

---

## 4. Règles Métier et Intégrité Référentielle (`rules.ts`)

Toute violation de règle métier lève immédiatement une exception explicite `BimValidationError` :

1. **Longueur minimale de mur :** Tout mur doit avoir une longueur euclidienne strictement positive :
   $$\sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2} > 10^{-4}\text{ mm}$$
2. **Intégrité référentielle des murs :** Un mur doit obligatoirement pointer vers un `WallType` et un `Level` existant.
3. **Intégrité référentielle des ouvertures :**
   - Une ouverture (`Door`, `Window`) doit obligatoirement référencer un mur hôte existant (`UNKNOWN_HOST_WALL`).
4. **Dimensions physiques des ouvertures :**
   - `width > 0`, `height > 0` et valeurs finies (`INVALID_OPENING_DIMENSIONS`).
   - `sillHeight >= 0` pour les fenêtres.
   - Battement valide (`left` | `right`, `in` | `out`) pour les portes.
5. **Bornes géométriques sur l'axe du mur :**
   - L'ouverture doit être entièrement contenue dans l'intervalle $[0, L]$ du mur :
     $$0 \le \text{offsetAlong} \le \text{offsetAlong} + \text{width} \le L_{\text{wall}}$$
     (`INVALID_OPENING_POSITION`).
   - Hauteur :
     - Pour une porte : $\text{height} \le H_{\text{wall}}$
     - Pour une fenêtre : $\text{sillHeight} + \text{height} \le H_{\text{wall}}$
       (`INVALID_OPENING_HEIGHT`).
6. **Non-chevauchement et dégagement minimal :**
   - Deux ouvertures sur un même mur hôte ne peuvent se chevaucher en 1D :
     $$[\text{offset}_i, \text{offset}_i + w_i] \cap [\text{offset}_j, \text{offset}_j + w_j] = \emptyset$$
     (`OPENING_OVERLAP`).
   - Les trumeaux minimaux et dégagements respectent `validateOpenings` et `MIN_OPENING_CLEARANCE = 50\text{ mm}` (`INVALID_OPENING_CLEARANCE`).
7. **Protection de suppression :**
   - Un `Level` ne peut être supprimé tant que des murs y sont rattachés (`canDeleteLevel`).
   - Un `WallType` ne peut être supprimé tant qu'il est instancié par au moins un mur (`canDeleteWallType`).
   - Un `Wall` hébergeant des ouvertures **peut** être supprimé (`canDeleteWall` retourne `allowed: true`), en cascade transactionnelle avec ses ouvertures.

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

## 6. Format de Sérialisation JSON & Rétrocompatibilité

Exemple de document sérialisé en JSON avec portes et fenêtres (`schemaVersion: 1`, `units: "mm"`) :

```json
{
  "schemaVersion": 1,
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
  "doors": {
    "01JCTP9Y2M14N58XVB69K4W7D1": {
      "id": "01JCTP9Y2M14N58XVB69K4W7D1",
      "category": "door",
      "kind": "door",
      "hostWallId": "01JCTP9Y2M14N58XVB69K4W7B1",
      "offsetAlong": 800,
      "width": 900,
      "height": 2100,
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
      "kind": "window",
      "hostWallId": "01JCTP9Y2M14N58XVB69K4W7B1",
      "offsetAlong": 2500,
      "width": 1200,
      "height": 1400,
      "sillHeight": 900
    }
  }
}
```

> [!NOTE] Rétrocompatibilité Totale
> Les fichiers de projet issus des Phases 1 et 2 (dépourvus de clés `doors` et `windows`) sont désérialisés avec succès : le chargeur initialise automatiquement `doors: {}` et `windows: {}`.
