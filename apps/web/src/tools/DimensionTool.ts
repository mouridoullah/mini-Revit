import { Commands, generateId } from '@mini-bim/core';
import { type Vec2 } from '@mini-bim/view-2d';
import { snapAngle45, snapPoint, collectSnapCandidates, snapToStep } from './snap.js';
import {
  type Tool,
  type ToolEvent,
  type ToolOutput,
  type ToolContext,
  type DimensionToolState,
} from './types.js';

/**
 * Longueur minimale admissible pour une cotation interactive (50 mm).
 */
export const MIN_DIMENSION_LENGTH = 50;

/**
 * Déport par défaut d'une nouvelle cotation (500 mm).
 */
export const DEFAULT_DIMENSION_OFFSET = 500;

/**
 * Outil interactif de cotation 2D (DimensionTool).
 * Raccourci clavier : 'T' (ADR-066)
 *
 * Machine à états pure :
 * - idle : aucun tracé en cours.
 * - firstPointPicked : premier point d'ancrage fixé, curseur étirant la distance.
 * - placingOffset : second point fixé, curseur ajustant le déport perpendiculaire.
 *
 * Fonctionnalités :
 * - Mode 3 clics (départ -> arrivée -> déport) ou clic-glisser (pointerdown -> pointerup -> déport).
 * - Aimantation aux sommets de murs et d'underlay (12 px / scale).
 * - Aimantation angulaire orthogonale / 45° sur appui de Shift.
 * - Inversion du côté de déport par appui sur la barre d'espace (Space).
 * - Finalisation anticipée sur appui de Enter.
 * - Annulation propre par Escape.
 * - Validation finale émettant AddDimensionCommand.
 * - Zéro import direct de @mini-bim/geometry (Règle d'or #2, ADR-022, ADR-024).
 */
export class DimensionTool implements Tool {
  public readonly kind = 'dimension' as const;
  private state: DimensionToolState = { kind: 'idle' };
  private flipSide: boolean = false;
  private defaultOffset: number = DEFAULT_DIMENSION_OFFSET;

  public getState(): DimensionToolState {
    return this.state;
  }

  public reset(): void {
    this.state = { kind: 'idle' };
    this.flipSide = false;
  }

  public setFlipSide(flip: boolean): void {
    this.flipSide = flip;
  }

  public getFlipSide(): boolean {
    return this.flipSide;
  }

  public setDefaultOffset(offset: number): void {
    this.defaultOffset = offset !== 0 ? offset : DEFAULT_DIMENSION_OFFSET;
  }

  public getDefaultOffset(): number {
    return this.defaultOffset;
  }

  public handle(event: ToolEvent, ctx: ToolContext): ToolOutput {
    // 1. Touche Escape : Annulation du tracé
    if (event.type === 'keydown' && event.key === 'Escape') {
      this.reset();
      return { kind: 'preview', preview: null };
    }

    // 2. Touche Espace : Inversion du côté de déport
    if (event.type === 'keydown' && (event.key === ' ' || event.key === 'Spacebar')) {
      this.flipSide = !this.flipSide;
      if (this.state.kind === 'placingOffset') {
        const offset = -this.state.offset;
        this.state = {
          ...this.state,
          offset,
        };
        const dx = this.state.endWorld.x - this.state.startWorld.x;
        const dy = this.state.endWorld.y - this.state.startWorld.y;
        return {
          kind: 'preview',
          preview: {
            kind: 'dimension',
            start: this.state.startWorld,
            end: this.state.endWorld,
            offset,
            value: Math.hypot(dx, dy),
          },
        };
      }
      return { kind: 'noop' };
    }

    // 3. Touche Enter : Validation immédiate
    if (event.type === 'keydown' && event.key === 'Enter') {
      if (this.state.kind === 'firstPointPicked') {
        const dx = this.state.currentWorld.x - this.state.startWorld.x;
        const dy = this.state.currentWorld.y - this.state.startWorld.y;
        const len = Math.hypot(dx, dy);
        if (len >= MIN_DIMENSION_LENGTH) {
          const offset = this.defaultOffset * (this.flipSide ? -1 : 1);
          return this.commitDimension(this.state.startWorld, this.state.currentWorld, offset, ctx);
        }
      } else if (this.state.kind === 'placingOffset') {
        const offset = this.state.offset !== 0 ? this.state.offset : this.defaultOffset * (this.flipSide ? -1 : 1);
        return this.commitDimension(this.state.startWorld, this.state.endWorld, offset, ctx);
      }
      return { kind: 'noop' };
    }

    // 4. PointerDown : Clic d'interaction
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
          kind: 'firstPointPicked',
          startWorld: snappedWorld,
          currentWorld: snappedWorld,
        };
        return {
          kind: 'preview',
          preview: {
            kind: 'dimension',
            start: snappedWorld,
            end: snappedWorld,
            offset: 0,
            value: 0,
          },
        };
      }

      if (this.state.kind === 'firstPointPicked') {
        const endWorld = event.shift
          ? snapAngle45(this.state.startWorld, rawWorld)
          : snappedWorld;

        const dx = endWorld.x - this.state.startWorld.x;
        const dy = endWorld.y - this.state.startWorld.y;
        const len = Math.hypot(dx, dy);

        if (len < MIN_DIMENSION_LENGTH) {
          return { kind: 'noop' };
        }

        const offset = this.defaultOffset * (this.flipSide ? -1 : 1);
        this.state = {
          kind: 'placingOffset',
          startWorld: this.state.startWorld,
          endWorld,
          currentWorld: rawWorld,
          offset,
        };

        return {
          kind: 'preview',
          preview: {
            kind: 'dimension',
            start: this.state.startWorld,
            end: endWorld,
            offset,
            value: len,
          },
        };
      }

      if (this.state.kind === 'placingOffset') {
        const offset = this.state.offset !== 0 ? this.state.offset : this.defaultOffset * (this.flipSide ? -1 : 1);
        return this.commitDimension(this.state.startWorld, this.state.endWorld, offset, ctx);
      }
    }

    // 5. PointerMove : Déplacement curseur
    if (event.type === 'pointermove') {
      const rawWorld = ctx.transform.screenToWorld(event.screen);

      if (this.state.kind === 'firstPointPicked') {
        const candidates = collectSnapCandidates(ctx);
        const snapTol = 12 / ctx.transform.scale;
        const snappedWorld = snapPoint(rawWorld, candidates, snapTol).point;
        const currentWorld = event.shift
          ? snapAngle45(this.state.startWorld, rawWorld)
          : snappedWorld;

        this.state = {
          kind: 'firstPointPicked',
          startWorld: this.state.startWorld,
          currentWorld,
        };

        const dx = currentWorld.x - this.state.startWorld.x;
        const dy = currentWorld.y - this.state.startWorld.y;
        const len = Math.hypot(dx, dy);

        return {
          kind: 'preview',
          preview: {
            kind: 'dimension',
            start: this.state.startWorld,
            end: currentWorld,
            offset: 0,
            value: len,
          },
        };
      }

      if (this.state.kind === 'placingOffset') {
        const { startWorld, endWorld } = this.state;
        const dx = endWorld.x - startWorld.x;
        const dy = endWorld.y - startWorld.y;
        const len = Math.hypot(dx, dy);

        if (len < 1e-4) {
          return { kind: 'noop' };
        }

        const ux = dx / len;
        const uy = dy / len;
        const nx = -uy;
        const ny = ux;

        const vx = rawWorld.x - startWorld.x;
        const vy = rawWorld.y - startWorld.y;
        let perp = vx * nx + vy * ny;

        if (this.flipSide) {
          perp = -perp;
        }

        // Alignement par pas de 50 mm
        let offset = snapToStep(perp, 50);
        if (Math.abs(offset) < 50) {
          offset = this.defaultOffset * (perp >= 0 ? 1 : -1);
        }

        this.state = {
          kind: 'placingOffset',
          startWorld,
          endWorld,
          currentWorld: rawWorld,
          offset,
        };

        return {
          kind: 'preview',
          preview: {
            kind: 'dimension',
            start: startWorld,
            end: endWorld,
            offset,
            value: len,
          },
        };
      }

      return { kind: 'noop' };
    }

    // 6. PointerUp : Détection d'un geste de glisser-déposer
    if (event.type === 'pointerup' && event.button === 0) {
      if (this.state.kind === 'firstPointPicked') {
        const rawWorld = ctx.transform.screenToWorld(event.screen);
        const candidates = collectSnapCandidates(ctx);
        const snapTol = 12 / ctx.transform.scale;
        const snappedWorld = snapPoint(rawWorld, candidates, snapTol).point;
        const currentWorld = event.shift
          ? snapAngle45(this.state.startWorld, rawWorld)
          : snappedWorld;

        const dx = currentWorld.x - this.state.startWorld.x;
        const dy = currentWorld.y - this.state.startWorld.y;
        const len = Math.hypot(dx, dy);

        // Si l'utilisateur a relâché après un déplacement significatif (> 200 mm)
        if (len >= 200) {
          const offset = this.defaultOffset * (this.flipSide ? -1 : 1);
          this.state = {
            kind: 'placingOffset',
            startWorld: this.state.startWorld,
            endWorld: currentWorld,
            currentWorld: rawWorld,
            offset,
          };

          return {
            kind: 'preview',
            preview: {
              kind: 'dimension',
              start: this.state.startWorld,
              end: currentWorld,
              offset,
              value: len,
            },
          };
        }
      }
      return { kind: 'noop' };
    }

    return { kind: 'noop' };
  }

  private commitDimension(
    start: Vec2,
    end: Vec2,
    offset: number,
    ctx: ToolContext,
  ): ToolOutput {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy);

    if (len < MIN_DIMENSION_LENGTH) {
      this.reset();
      return { kind: 'preview', preview: null };
    }

    const command = new Commands.AddDimensionCommand({
      id: generateId(),
      category: 'dimension',
      type: 'aligned',
      references: [],
      startPoint: { x: start.x, y: start.y },
      endPoint: { x: end.x, y: end.y },
      offset,
      value: len,
      levelId: ctx.activeLevelId || Object.keys(ctx.doc.getState().levels)[0] || 'lvl_rdc',
    });

    this.reset();
    return { kind: 'command', command };
  }
}
