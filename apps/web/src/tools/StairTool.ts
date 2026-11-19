import { Commands, generateId } from '@mini-bim/core';
import { snapAngle45, snapPoint, collectSnapCandidates } from './snap.js';
import {
  type Tool,
  type ToolEvent,
  type ToolOutput,
  type ToolContext,
  type StairToolState,
} from './types.js';

/**
 * Seuil ergonomique UX de longueur minimale pour le tracé d'un escalier.
 */
export const MIN_STAIR_DRAG_LENGTH = 300;

/**
 * Outil interactif de modélisation d'escaliers droits paramétriques (StairTool).
 * Raccourci clavier : 'E' (ADR-048)
 *
 * Machine à états pure :
 * - idle : aucun tracé en cours.
 * - drawing : point de départ fixé (pied de l'escalier), prévisualisation élastique orientée.
 *
 * Fonctionnalités :
 * - Supporte le mode clic-glisser (pointerdown -> pointerup) et le mode deux clics (clic -> déplacement -> clic).
 * - Aimantation aux sommets de murs et d'underlay ($12\text{ px} / \text{scale}$).
 * - Aimantation angulaire orthogonale / 45° sur appui de Shift.
 * - Annulation propre par Escape.
 * - Validation finale émettant AddStairCommand.
 */
export class StairTool implements Tool {
  public readonly kind = 'stair' as const;
  private state: StairToolState = { kind: 'idle' };

  public getState(): StairToolState {
    return this.state;
  }

  public reset(): void {
    this.state = { kind: 'idle' };
  }

  public handle(event: ToolEvent, ctx: ToolContext): ToolOutput {
    // 1. Touche Escape : Annulation du tracé
    if (event.type === 'keydown' && event.key === 'Escape') {
      this.reset();
      return { kind: 'preview', preview: null };
    }

    const state = ctx.doc.getState();
    const stairTypeId =
      ctx.activeStairTypeId ??
      Object.keys(state.stairTypes ?? {})[0] ??
      'default-stair-type';
    const stairType = state.stairTypes?.[stairTypeId];
    const width = stairType?.width ?? 900;

    // 2. Touche Enter : Validation du tracé si en cours
    if (event.type === 'keydown' && event.key === 'Enter') {
      if (this.state.kind === 'drawing') {
        const dx = this.state.currentWorld.x - this.state.startWorld.x;
        const dy = this.state.currentWorld.y - this.state.startWorld.y;
        const len = Math.hypot(dx, dy);
        if (len >= width) {
          return this.createStair(this.state.startWorld, this.state.currentWorld, ctx, stairTypeId);
        }
      }
      return { kind: 'noop' };
    }

    // 3. PointerDown : Premier clic (départ) ou deuxième clic (arrivée)
    if (event.type === 'pointerdown') {
      if (event.button !== 0) {
        return { kind: 'noop' };
      }

      const rawWorld = ctx.transform.screenToWorld(event.screen);
      const candidates = collectSnapCandidates(ctx);
      const snapTol = 12 / ctx.transform.scale;
      const snappedWorld = snapPoint(rawWorld, candidates, snapTol).point;

      if (this.state.kind === 'idle') {
        this.state = {
          kind: 'drawing',
          startWorld: snappedWorld,
          currentWorld: snappedWorld,
        };
        return {
          kind: 'preview',
          preview: {
            kind: 'stair',
            start: snappedWorld,
            end: snappedWorld,
            width,
          },
        };
      } else {
        // Deuxième clic pour finaliser
        const currentWorld = event.shift
          ? snapAngle45(this.state.startWorld, rawWorld)
          : snappedWorld;
        const dx = currentWorld.x - this.state.startWorld.x;
        const dy = currentWorld.y - this.state.startWorld.y;
        const len = Math.hypot(dx, dy);

        if (len >= width) {
          return this.createStair(this.state.startWorld, currentWorld, ctx, stairTypeId);
        }
        return { kind: 'noop' };
      }
    }

    // 4. PointerMove : Mise à jour de l'élastique de prévisualisation
    if (event.type === 'pointermove') {
      if (this.state.kind !== 'drawing') {
        return { kind: 'noop' };
      }

      const rawWorld = ctx.transform.screenToWorld(event.screen);
      const candidates = collectSnapCandidates(ctx);
      const snapTol = 12 / ctx.transform.scale;
      const snappedWorld = snapPoint(rawWorld, candidates, snapTol).point;
      const currentWorld = event.shift
        ? snapAngle45(this.state.startWorld, rawWorld)
        : snappedWorld;

      this.state = {
        kind: 'drawing',
        startWorld: this.state.startWorld,
        currentWorld,
      };

      return {
        kind: 'preview',
        preview: {
          kind: 'stair',
          start: this.state.startWorld,
          end: currentWorld,
          width,
        },
      };
    }

    // 5. PointerUp : Validation si glisser-déposer sur une distance suffisante
    if (event.type === 'pointerup' && event.button === 0) {
      if (this.state.kind !== 'drawing') {
        return { kind: 'noop' };
      }

      const dx = this.state.currentWorld.x - this.state.startWorld.x;
      const dy = this.state.currentWorld.y - this.state.startWorld.y;
      const len = Math.hypot(dx, dy);

      // Si l'utilisateur a glissé au-delà de la largeur minimale requise, on valide directement
      if (len >= width) {
        return this.createStair(this.state.startWorld, this.state.currentWorld, ctx, stairTypeId);
      }

      // Sinon, on maintient l'état 'drawing' pour permettre le second clic
      return { kind: 'noop' };
    }

    return { kind: 'noop' };
  }

  private createStair(
    start: { readonly x: number; readonly y: number },
    end: { readonly x: number; readonly y: number },
    ctx: ToolContext,
    stairTypeId: string,
  ): ToolOutput {
    const state = ctx.doc.getState();
    const bottomLevelId = ctx.activeLevelId;

    // Détermination du niveau supérieur adjacent
    const sortedLevels = Object.values(state.levels).sort((a, b) => a.elevation - b.elevation);
    const currentIdx = sortedLevels.findIndex((l) => l.id === bottomLevelId);

    let topLevelId: string;
    const nextLevel = currentIdx >= 0 ? sortedLevels[currentIdx + 1] : undefined;
    if (nextLevel) {
      topLevelId = nextLevel.id;
    } else if (sortedLevels.length > 1) {
      const higher = sortedLevels.find(
        (l) => l.elevation > (state.levels[bottomLevelId]?.elevation ?? 0),
      );
      const lastLevel = sortedLevels[sortedLevels.length - 1];
      topLevelId = higher ? higher.id : (lastLevel?.id ?? bottomLevelId);
    } else {
      topLevelId = bottomLevelId;
    }

    this.reset();

    return {
      kind: 'command',
      command: new Commands.AddStairCommand({
        id: generateId(),
        category: 'stair',
        stairTypeId,
        bottomLevelId,
        topLevelId,
        start,
        end,
      }),
    };
  }
}
