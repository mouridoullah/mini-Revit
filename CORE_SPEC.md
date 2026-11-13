# SPÉCIFICATION TECHNIQUE — PACKAGE `@mini-bim/core`

## Noyau Métier, Modèle Documentaire BIM & CommandBus Transactionnel

**Version :** 0.1.0 (Phase 1.5)  
**Date :** 13 Novembre 2026  
**Auteur :** Lead Software Architect & Computational Geometry Engineer  
**Statut :** Livré, testé et certifié conforme par 23 tests automatisés (227 tests globaux)

---

## 1. Vision et Règles d'Or Architecturales

Le package `@mini-bim/core` constitue la source unique de vérité (_Single Source of Truth_) du modèle d'information du bâtiment dans Mini-BIM. Il est régi par trois règles d'or absolues :

1. **Indépendance Totale de l'Infrastructure Visuelle :**  
   `@mini-bim/core` n'importe **aucun** composant ou hook React, aucune classe Three.js, et aucun élément de l'API DOM (`window`, `document`, `HTMLElement`). Il est consommable de manière identique dans un worker Web, un processus Node.js, ou un client web.
2. **Immutabilité et Command Pattern Exclusif :**  
   Aucune mutation directe de l'état n'est autorisée. Toute modification de l'arbre documentaire passe impérativement par une `Command` exécutée par le `BimDocument`. L'historique d'annulation/rétablissement (Undo/Redo) repose sur les patchs différentiels RFC 6902 générés par Immer (`produceWithPatches`).
3. **Absence de Géométrie Dérivée dans l'État Persistant :**  
   L'état (`BimState`) ne stocke pas de maillages 3D, de polygones découpés ou de coordonnées de rendu. Il stocke exclusivement la définition paramétrique et topologique du projet (lignes d'axe, niveaux, types). Les géométries 2.5D et maillages 3D sont calculés à la demande par les couches de visualisation (`@mini-bim/view-2d`, `@mini-bim/view-3d`).

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

export interface BimState {
  readonly schemaVersion: 1;
  readonly units: 'mm';
  readonly levels: Record<ElementId, Level>;
  readonly wallTypes: Record<ElementId, WallType>;
  readonly walls: Record<ElementId, Wall>;
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

### Commandes supportées en Phase 1.5 :

- **Murs :** `AddWallCommand`, `UpdateWallCommand`, `DeleteWallCommand`.
- **Niveaux :** `AddLevelCommand`, `UpdateLevelCommand`, `DeleteLevelCommand`.
- **Types de murs :** `AddWallTypeCommand`, `UpdateWallTypeCommand`, `DeleteWallTypeCommand`.

---

## 4. Règles Métier et Intégrité Référentielle (`rules.ts`)

Toute violation de règle métier lève immédiatement une exception explicite `BimValidationError` :

1. **Longueur minimale de mur :** Tout mur doit avoir une longueur euclidienne strictement positive :
   $$\sqrt{(x_2 - x_1)^2 + (y_2 - y_1)^2} > 10^{-4}\text{ mm}$$
2. **Intégrité référentielle :** Un mur doit obligatoirement pointer vers un `WallType` et un `Level` existant dans les dictionnaires d'état.
3. **Dimensions physiques :** Épaisseur et hauteur de `WallType` strictement positives ($> 0$).
4. **Protection de suppression :**
   - Un `Level` ne peut être supprimé tant que des murs y sont rattachés (`canDeleteLevel`).
   - Un `WallType` ne peut être supprimé tant qu'il est instancié par au moins un mur (`canDeleteWallType`).

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

### Mécanisme Undo / Redo via Immer (`history.ts`)

1. Lors de `execute(cmd)`, Immer génère `patches` et `inversePatches` via `produceWithPatches`.
2. L'entrée `{ patches, inversePatches, changed }` est empilée dans `undoStack`. La pile `redoStack` est immédiatement vidée.
3. Lors de `undo()`, `inversePatches` est réappliqué sur l'état courant via `applyPatches`, et l'entrée bascule dans `redoStack`.
4. Lors de `redo()`, `patches` est réappliqué via `applyPatches`, et l'entrée bascule dans `undoStack`.
5. Tous les abonnés (`subscribe`) sont notifiés avec la liste des `ElementId` affectés pour déclencher le rafraîchissement réactif des vues 2D et 3D.

---

## 6. Format de Sérialisation JSON

Exemple d'instanciation sérialisée en JSON (`schemaVersion: 1`, `units: "mm"`) :

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
  }
}
```
