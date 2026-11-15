import { Commands } from '@mini-bim/core';
import { findOpeningAtScreen, type Vec2 } from '@mini-bim/view-2d';
import { snapToStep } from './snap.js';
import {
  type Tool,
  type ToolEvent,
  type ToolOutput,
  type ToolContext,
  type MoveOpeningToolState,
} from './types.js';

export const MIN_OPENING_CLEARANCE = 50;

/**
 * Outil interactif de déplacement d'une ouverture existante le long de son mur hôte.
 *
 * Machine à états pure :
 * - idle : aucun déplacement en cours.
 * - dragging : ouverture sélectionnée, glissée le long du mur avec snap 50 mm et prévisualisation.
 *
 * Émet MoveOpeningCommand(openingId, newOffsetAlong), qui propage automatiquement
 * le recalcul du mur hôte percé via MoveOpeningCommand.getChangedIds().
 *
 * Ne dépend ni de React, ni de Three.js, ni du DOM, ni de @mini-bim/geometry.
 */
export class MoveOpeningTool implements Tool {
  public readonly kind = 'moveOpening' as const;
  private state: MoveOpeningToolState = { kind: 'idle' };

  public getState(): MoveOpeningToolState {
    return this.state;
  }

  public handle(event: ToolEvent, ctx: ToolContext): ToolOutput {
    // 1. Début de déplacement sur clic gauche sur une porte ou fenêtre
    if (event.type === 'pointerdown') {
      if (event.button !== 0) {
        return { kind: 'noop' };
      }

      const hit = findOpeningAtScreen(event.screen, ctx.transform, ctx.doc, {
        activeLevelId: ctx.activeLevelId,
      });

      if (!hit) {
        return { kind: 'noop' };
      }

      const state = ctx.doc.getState();
      const opening = state.doors?.[hit.id] ?? state.windows?.[hit.id];
      if (!opening) {
        return { kind: 'noop' };
      }

      let openingWidth = opening.width;
      if (openingWidth === undefined) {
        if ('doorTypeId' in opening && opening.doorTypeId) {
          openingWidth = state.doorTypes?.[opening.doorTypeId]?.width ?? 900;
        } else if ('windowTypeId' in opening && opening.windowTypeId) {
          openingWidth = state.windowTypes?.[opening.windowTypeId]?.width ?? 1200;
        } else {
          openingWidth = 900;
        }
      }

      this.state = {
        kind: 'dragging',
        openingId: hit.id,
        hostWallId: hit.hostWallId,
        initialOffsetAlong: opening.offsetAlong,
        currentOffsetAlong: opening.offsetAlong,
        width: openingWidth,
      };

      return { kind: 'noop' };
    }

    // 2. Glissement le long de l'axe du mur hôte avec projection et snap 50 mm
    if (event.type === 'pointermove') {
      if (this.state.kind !== 'dragging') {
        return { kind: 'noop' };
      }

      const wall = ctx.doc.getState().walls[this.state.hostWallId];
      if (!wall) {
        this.state = { kind: 'idle' };
        return { kind: 'preview', preview: null };
      }

      const dx = wall.end.x - wall.start.x;
      const dy = wall.end.y - wall.start.y;
      const wallLen = Math.hypot(dx, dy);
      if (wallLen < 1e-6) {
        return { kind: 'noop' };
      }

      const worldCursor = ctx.transform.screenToWorld(event.screen);
      const toCursorX = worldCursor.x - wall.start.x;
      const toCursorY = worldCursor.y - wall.start.y;
      const rawOffset = (toCursorX * dx + toCursorY * dy) / wallLen;

      // Aimantation stricte sur multiple de 50 mm
      const snappedOffset = snapToStep(rawOffset, 50);

      // Garde minimale aux extrémités
      const minOffset = MIN_OPENING_CLEARANCE;
      const maxOffset = wallLen - this.state.width - MIN_OPENING_CLEARANCE;
      const clampedOffset = Math.max(minOffset, Math.min(snappedOffset, maxOffset));

      this.state = {
        ...this.state,
        currentOffsetAlong: clampedOffset,
      };

      const ux = dx / wallLen;
      const uy = dy / wallLen;

      const previewStart: Vec2 = {
        x: wall.start.x + ux * clampedOffset,
        y: wall.start.y + uy * clampedOffset,
      };
      const previewEnd: Vec2 = {
        x: wall.start.x + ux * (clampedOffset + this.state.width),
        y: wall.start.y + uy * (clampedOffset + this.state.width),
      };

      return {
        kind: 'preview',
        preview: {
          kind: 'line',
          start: previewStart,
          end: previewEnd,
        },
      };
    }

    // 3. Validation du nouvel emplacement sur pointerup
    if (event.type === 'pointerup') {
      if (this.state.kind !== 'dragging') {
        return { kind: 'noop' };
      }

      const { openingId, initialOffsetAlong, currentOffsetAlong } = this.state;
      this.state = { kind: 'idle' };

      // Si la position n'a pas changé, aucune commande inutile
      if (currentOffsetAlong === initialOffsetAlong) {
        return { kind: 'preview', preview: null };
      }

      const command = new Commands.MoveOpeningCommand(openingId, currentOffsetAlong);
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
