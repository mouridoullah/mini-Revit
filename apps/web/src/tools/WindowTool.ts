import { Commands, generateId } from '@mini-bim/core';
import { findWallAtScreen, type Vec2 } from '@mini-bim/view-2d';
import { snapToStep } from './snap.js';
import {
  type Tool,
  type ToolEvent,
  type ToolOutput,
  type ToolContext,
  type WindowToolState,
} from './types.js';

export const DEFAULT_WINDOW_WIDTH = 1200;
export const DEFAULT_WINDOW_HEIGHT = 1400;
export const DEFAULT_WINDOW_SILL_HEIGHT = 900;
export const MIN_WINDOW_CLEARANCE = 50;

/**
 * Outil interactif d'insertion de fenêtres hébergées sur un mur.
 *
 * Machine à états pure :
 * - idle : en attente d'interaction ou curseur hors mur.
 * - hovering : curseur au-dessus d'un mur valide, prévisualisation active avec snap 50 mm.
 * - placed : fenêtre créée et commande émise.
 *
 * Ne dépend ni de React, ni de Three.js, ni du DOM, ni de @mini-bim/geometry.
 */
export class WindowTool implements Tool {
  public readonly kind = 'window' as const;
  private state: WindowToolState = { kind: 'idle' };

  public getState(): WindowToolState {
    return this.state;
  }

  private computeOffset(
    screen: Vec2,
    ctx: ToolContext,
  ): {
    wallId: string;
    offsetAlong: number;
    start: Vec2;
    end: Vec2;
    width: number;
    height: number;
    sillHeight: number;
  } | null {
    const hitWallId = findWallAtScreen(screen, ctx.transform, ctx.doc, {
      activeLevelId: ctx.activeLevelId,
    });
    if (!hitWallId) return null;

    const wall = ctx.doc.getState().walls[hitWallId];
    if (!wall) return null;

    const dx = wall.end.x - wall.start.x;
    const dy = wall.end.y - wall.start.y;
    const wallLen = Math.hypot(dx, dy);
    const width = ctx.windowDefaults?.width ?? DEFAULT_WINDOW_WIDTH;
    const height = ctx.windowDefaults?.height ?? DEFAULT_WINDOW_HEIGHT;
    const sillHeight = ctx.windowDefaults?.sillHeight ?? DEFAULT_WINDOW_SILL_HEIGHT;

    // Le mur doit pouvoir accueillir la fenêtre avec une garde minimale de chaque côté
    if (wallLen < width + MIN_WINDOW_CLEARANCE * 2) {
      return null;
    }

    const worldCursor = ctx.transform.screenToWorld(screen);
    const toCursorX = worldCursor.x - wall.start.x;
    const toCursorY = worldCursor.y - wall.start.y;
    const rawOffset = (toCursorX * dx + toCursorY * dy) / wallLen;

    // Aimantation à 50 mm (pas architectural pour ouvertures)
    const snappedOffset = snapToStep(rawOffset, 50);

    // Clamping strict dans les limites du mur avec garde minimale
    const minOffset = MIN_WINDOW_CLEARANCE;
    const maxOffset = wallLen - width - MIN_WINDOW_CLEARANCE;
    const offsetAlong = Math.max(minOffset, Math.min(snappedOffset, maxOffset));

    const ux = dx / wallLen;
    const uy = dy / wallLen;

    const start: Vec2 = {
      x: wall.start.x + ux * offsetAlong,
      y: wall.start.y + uy * offsetAlong,
    };
    const end: Vec2 = {
      x: wall.start.x + ux * (offsetAlong + width),
      y: wall.start.y + uy * (offsetAlong + width),
    };

    return {
      wallId: hitWallId,
      offsetAlong,
      start,
      end,
      width,
      height,
      sillHeight,
    };
  }

  public handle(event: ToolEvent, ctx: ToolContext): ToolOutput {
    // 1. Déplacement du curseur : détection de mur et prévisualisation
    if (event.type === 'pointermove') {
      const computed = this.computeOffset(event.screen, ctx);
      if (!computed) {
        this.state = { kind: 'idle' };
        return { kind: 'preview', preview: null };
      }

      this.state = {
        kind: 'hovering',
        wallId: computed.wallId,
        offsetAlong: computed.offsetAlong,
      };

      return {
        kind: 'preview',
        preview: {
          kind: 'line',
          start: computed.start,
          end: computed.end,
        },
      };
    }

    // 2. Clic gauche pour placer la fenêtre
    if (event.type === 'pointerdown' && event.button === 0) {
      let targetWallId: string | null = null;
      let targetOffset: number = 0;

      if (this.state.kind === 'hovering') {
        targetWallId = this.state.wallId;
        targetOffset = this.state.offsetAlong;
      } else {
        const computed = this.computeOffset(event.screen, ctx);
        if (computed) {
          targetWallId = computed.wallId;
          targetOffset = computed.offsetAlong;
        }
      }

      if (!targetWallId) {
        return { kind: 'noop' };
      }

      const windowId = generateId();
      const command = new Commands.AddWindowCommand({
        id: windowId,
        category: 'window',
        kind: 'window',
        hostWallId: targetWallId,
        offsetAlong: targetOffset,
        width: ctx.windowDefaults?.width ?? DEFAULT_WINDOW_WIDTH,
        height: ctx.windowDefaults?.height ?? DEFAULT_WINDOW_HEIGHT,
        sillHeight: ctx.windowDefaults?.sillHeight ?? DEFAULT_WINDOW_SILL_HEIGHT,
      });

      this.state = { kind: 'placed', windowId };
      return { kind: 'command', command };
    }

    // 3. Annulation sur touche Escape
    if (event.type === 'keydown' && event.key === 'Escape') {
      this.state = { kind: 'idle' };
      return { kind: 'preview', preview: null };
    }

    return { kind: 'noop' };
  }

  public reset(): void {
    this.state = { kind: 'idle' };
  }
}
