import { type BimDocument, type Command } from '@mini-bim/core';
import { type Transform2D, type PreviewShape, type Vec2 } from '@mini-bim/view-2d';

/**
 * Identifiant du type d'outil interactif actif.
 */
export type ToolKind =
  | 'select'
  | 'wall'
  | 'door'
  | 'window'
  | 'moveWall'
  | 'moveOpening'
  | 'slab'
  | 'stair'
  | 'roof';

/**
 * États possibles de la machine à états SelectTool.
 */
export type SelectToolState =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'selecting';
      readonly startScreen: Vec2;
      readonly currentScreen: Vec2;
    }
  | { readonly kind: 'selected'; readonly wallId: string };

/**
 * États possibles de la machine à états WallTool.
 */
export type WallToolState =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'drawing';
      readonly startWorld: Vec2;
      readonly currentWorld: Vec2;
    }
  | {
      readonly kind: 'finished';
      readonly startWorld: Vec2;
      readonly endWorld: Vec2;
    };

/**
 * États possibles de la machine à états DoorTool.
 */
export type DoorToolState =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'hovering';
      readonly wallId: string;
      readonly offsetAlong: number;
    }
  | { readonly kind: 'placed'; readonly doorId: string };

/**
 * États possibles de la machine à états WindowTool.
 */
export type WindowToolState =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'hovering';
      readonly wallId: string;
      readonly offsetAlong: number;
    }
  | { readonly kind: 'placed'; readonly windowId: string };

/**
 * États possibles de la machine à états MoveWallTool.
 */
export type MoveWallToolState =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'dragging';
      readonly wallId: string;
      readonly startWall: { readonly start: Vec2; readonly end: Vec2 };
      readonly grabWorld: Vec2;
      readonly currentDelta: Vec2;
    };

/**
 * États possibles de la machine à états MoveOpeningTool.
 */
export type MoveOpeningToolState =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'dragging';
      readonly openingId: string;
      readonly hostWallId: string;
      readonly initialOffsetAlong: number;
      readonly currentOffsetAlong: number;
      readonly width: number;
    };

/**
 * États possibles de la machine à états SlabTool.
 */
export type SlabToolState =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'drawing';
      readonly points: readonly Vec2[];
      readonly currentWorld: Vec2;
    };

/**
 * États possibles de la machine à états StairTool (ADR-048).
 */
export type StairToolState =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'drawing';
      readonly startWorld: Vec2;
      readonly currentWorld: Vec2;
    };

/**
 * États possibles de la machine à états RoofTool (ADR-053).
 */
export type RoofToolState =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'drawing-footprint';
      readonly points: readonly Vec2[];
      readonly currentWorld: Vec2;
    }
  | {
      readonly kind: 'picking-ridge';
      readonly footprint: readonly Vec2[];
      readonly ridgeStart?: Vec2;
      readonly currentWorld: Vec2;
    };

/**
 * Paramètres par défaut configurables pour l'insertion de portes.
 */
export interface DoorDefaults {
  readonly width: number;
  readonly height: number;
  readonly swing: { readonly side: 'left' | 'right'; readonly direction: 'in' | 'out' };
}

/**
 * Paramètres par défaut configurables pour l'insertion de fenêtres.
 */
export interface WindowDefaults {
  readonly width: number;
  readonly height: number;
  readonly sillHeight: number;
}

/**
 * Événements d'entrée normalisés transmis aux machines à états des Tools.
 * Découplés des événements DOM bruts.
 */
export type ToolEvent =
  | {
      readonly type: 'pointerdown';
      readonly screen: Vec2;
      readonly button: number; // 0 = gauche, 1 = molette, 2 = droit
      readonly shift: boolean;
      readonly alt: boolean;
    }
  | {
      readonly type: 'pointermove';
      readonly screen: Vec2;
      readonly shift: boolean;
      readonly alt: boolean;
    }
  | {
      readonly type: 'pointerup';
      readonly screen: Vec2;
      readonly button: number;
      readonly shift: boolean;
      readonly alt: boolean;
    }
  | {
      readonly type: 'keydown';
      readonly key: string; // 'Escape', 'Enter', etc.
    }
  | {
      readonly type: 'dblclick';
      readonly screen: Vec2;
    };

/**
 * Effets / sorties produits par une transition d'état d'un Tool.
 */
export type ToolOutput =
  | { readonly kind: 'command'; readonly command: Command }
  | { readonly kind: 'selectionChanged'; readonly ids: readonly string[] }
  | { readonly kind: 'preview'; readonly preview: PreviewShape | null }
  | { readonly kind: 'noop' };

/**
 * Contexte d'exécution injecté lors de chaque traitement d'événement.
 */
export interface ToolContext {
  readonly doc: BimDocument;
  readonly transform: Transform2D;
  readonly activeLevelId: string;
  readonly activeWallTypeId?: string;
  readonly activeSlabTypeId?: string;
  readonly activeStairTypeId?: string;
  readonly underlayLevelId?: string | null;
  readonly snapToUnderlay?: boolean;
  readonly doorDefaults?: DoorDefaults;
  readonly windowDefaults?: WindowDefaults;
}

/**
 * Interface commune de tout outil interactif 2D.
 */
export interface Tool {
  readonly kind: ToolKind;
  getState():
    | SelectToolState
    | WallToolState
    | DoorToolState
    | WindowToolState
    | MoveWallToolState
    | MoveOpeningToolState
    | SlabToolState
    | StairToolState
    | RoofToolState;
  handle(event: ToolEvent, ctx: ToolContext): ToolOutput;
  reset(): void;
}
