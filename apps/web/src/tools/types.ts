import { type BimDocument, type Command } from '@mini-bim/core';
import { type Transform2D, type PreviewShape, type Vec2 } from '@mini-bim/view-2d';

/**
 * Identifiant du type d'outil interactif actif.
 */
export type ToolKind = 'select' | 'wall';

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
}

/**
 * Interface commune de tout outil interactif 2D.
 */
export interface Tool {
  readonly kind: ToolKind;
  getState(): SelectToolState | WallToolState;
  handle(event: ToolEvent, ctx: ToolContext): ToolOutput;
  reset(): void;
}
