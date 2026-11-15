import { Commands } from '@mini-bim/core';
import { findWallAtScreen, type Vec2 } from '@mini-bim/view-2d';
import { snapToStep } from './snap.js';
import {
  type Tool,
  type ToolEvent,
  type ToolOutput,
  type ToolContext,
  type MoveWallToolState,
} from './types.js';

/**
 * Outil interactif de translation de mur (LE TEST DE CRÉDIBILITÉ DU BIM).
 *
 * Machine à états pure :
 * - idle : aucun déplacement en cours.
 * - dragging : mur sélectionné, en cours de translation avec prévisualisation et snap 10 mm.
 *
 * Invariant architectural :
 * Ne modifie JAMAIS directement les ouvertures hébergées. Le document conserve l'offsetAlong
 * paramétrique de chaque porte/fenêtre, et leur géométrie 2D/3D suit automatiquement la nouvelle
 * position du mur hôte ("le modèle est la source de vérité, la géométrie est un cache").
 *
 * Ne dépend ni de React, ni de Three.js, ni du DOM, ni de @mini-bim/geometry.
 */
export class MoveWallTool implements Tool {
  public readonly kind = 'moveWall' as const;
  private state: MoveWallToolState = { kind: 'idle' };

  public getState(): MoveWallToolState {
    return this.state;
  }

  public handle(event: ToolEvent, ctx: ToolContext): ToolOutput {
    // 1. Début de déplacement sur pointerdown (clic gauche)
    if (event.type === 'pointerdown') {
      if (event.button !== 0) {
        return { kind: 'noop' };
      }

      const hitWallId = findWallAtScreen(event.screen, ctx.transform, ctx.doc, {
        activeLevelId: ctx.activeLevelId,
      });

      if (!hitWallId) {
        return { kind: 'noop' };
      }

      const wall = ctx.doc.getState().walls[hitWallId];
      if (!wall) {
        return { kind: 'noop' };
      }

      const grabWorld = ctx.transform.screenToWorld(event.screen);
      this.state = {
        kind: 'dragging',
        wallId: hitWallId,
        startWall: {
          start: { x: wall.start.x, y: wall.start.y },
          end: { x: wall.end.x, y: wall.end.y },
        },
        grabWorld,
        currentDelta: { x: 0, y: 0 },
      };

      return { kind: 'noop' };
    }

    // 2. Déplacement du curseur : mise à jour du delta avec snap à 10 mm
    if (event.type === 'pointermove') {
      if (this.state.kind !== 'dragging') {
        return { kind: 'noop' };
      }

      const currentWorld = ctx.transform.screenToWorld(event.screen);
      const rawDeltaX = currentWorld.x - this.state.grabWorld.x;
      const rawDeltaY = currentWorld.y - this.state.grabWorld.y;

      // Aimantation stricte sur multiples de 10 mm (ex: 105 -> 100 mm)
      const deltaX = snapToStep(rawDeltaX, 10);
      const deltaY = snapToStep(rawDeltaY, 10);

      this.state = {
        kind: 'dragging',
        wallId: this.state.wallId,
        startWall: this.state.startWall,
        grabWorld: this.state.grabWorld,
        currentDelta: { x: deltaX, y: deltaY },
      };

      const movedStart: Vec2 = {
        x: this.state.startWall.start.x + deltaX,
        y: this.state.startWall.start.y + deltaY,
      };
      const movedEnd: Vec2 = {
        x: this.state.startWall.end.x + deltaX,
        y: this.state.startWall.end.y + deltaY,
      };

      return {
        kind: 'preview',
        preview: {
          kind: 'line',
          start: movedStart,
          end: movedEnd,
        },
      };
    }

    // 3. Validation de la translation sur pointerup
    if (event.type === 'pointerup') {
      if (this.state.kind !== 'dragging') {
        return { kind: 'noop' };
      }

      const { wallId, currentDelta } = this.state;
      this.state = { kind: 'idle' };

      // Si le déplacement est nul (clic stationnaire), pas de commande polluante dans l'historique
      if (currentDelta.x === 0 && currentDelta.y === 0) {
        return { kind: 'preview', preview: null };
      }

      const command = new Commands.MoveWallCommand(
        wallId,
        { x: currentDelta.x, y: currentDelta.y },
        { stretchNeighbors: true },
      );

      return { kind: 'command', command };
    }

    // 4. Annulation sur touche Escape
    if (event.type === 'keydown' && event.key === 'Escape') {
      if (this.state.kind === 'dragging') {
        this.state = { kind: 'idle' };
        return { kind: 'preview', preview: null };
      }
      return { kind: 'noop' };
    }

    return { kind: 'noop' };
  }

  public reset(): void {
    this.state = { kind: 'idle' };
  }
}
