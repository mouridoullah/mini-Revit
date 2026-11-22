import { Commands, generateId } from '@tabax/core';
import { findWallAtScreen, type Vec2 } from '@tabax/view-2d';
import { snapToStep } from './snap.js';
import {
  type Tool,
  type ToolEvent,
  type ToolOutput,
  type ToolContext,
  type DoorToolState,
} from './types.js';

export const DEFAULT_DOOR_WIDTH = 900;
export const DEFAULT_DOOR_HEIGHT = 2100;
export const MIN_DOOR_CLEARANCE = 50;

/**
 * Outil interactif d'insertion de portes hébergées sur un mur.
 *
 * Machine à états pure :
 * - idle : en attente d'interaction ou curseur hors mur.
 * - hovering : curseur au-dessus d'un mur valide, prévisualisation active avec snap 50 mm.
 * - placed : porte créée et commande émise.
 *
 * Ne dépend ni de React, ni de Three.js, ni du DOM, ni de @tabax/geometry.
 */
export class DoorTool implements Tool {
  public readonly kind = 'door' as const;
  private state: DoorToolState = { kind: 'idle' };

  public getState(): DoorToolState {
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
    const width = ctx.doorDefaults?.width ?? DEFAULT_DOOR_WIDTH;
    const height = ctx.doorDefaults?.height ?? DEFAULT_DOOR_HEIGHT;

    // Le mur doit pouvoir accueillir la porte avec une garde minimale de chaque côté
    if (wallLen < width + MIN_DOOR_CLEARANCE * 2) {
      return null;
    }

    const worldCursor = ctx.transform.screenToWorld(screen);
    const toCursorX = worldCursor.x - wall.start.x;
    const toCursorY = worldCursor.y - wall.start.y;
    const rawOffset = (toCursorX * dx + toCursorY * dy) / wallLen;

    // Aimantation à 50 mm (multiple de 50 le plus proche)
    const snappedOffset = snapToStep(rawOffset, 50);

    // Clamping strict dans les limites du mur avec garde minimale
    const minOffset = MIN_DOOR_CLEARANCE;
    const maxOffset = wallLen - width - MIN_DOOR_CLEARANCE;
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

    // 2. Clic gauche pour placer la porte
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

      const doorId = generateId();
      const width = ctx.doorDefaults?.width ?? DEFAULT_DOOR_WIDTH;
      const height = ctx.doorDefaults?.height ?? DEFAULT_DOOR_HEIGHT;
      const existingDoorType = Object.values(ctx.doc.getState().doorTypes ?? {}).find(
        (dt) => dt.width === width && dt.height === height,
      );
      const doorTypeId =
        existingDoorType?.id ??
        Object.keys(ctx.doc.getState().doorTypes ?? {})[0] ??
        `door-type-${width}x${height}`;
      const command = new Commands.AddDoorCommand({
        id: doorId,
        category: 'door',
        doorTypeId,
        hostWallId: targetWallId,
        offsetAlong: targetOffset,
        swing: ctx.doorDefaults?.swing ?? { side: 'left', direction: 'in' },
      });

      this.state = { kind: 'placed', doorId };
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
