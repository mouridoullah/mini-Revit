import { Commands, generateId, type Roof, type RoofType } from '@tabax/core';
import { type Vec2 } from '@tabax/view-2d';
import { snapAngle45, snapPoint as snapHelper, collectSnapCandidates } from './snap.js';
import {
  type Tool,
  type ToolEvent,
  type ToolOutput,
  type ToolContext,
  type RoofToolState,
} from './types.js';

/**
 * Calcule l'aire algébrique signée d'un polygone 2D.
 * > 0 => Sens trigonométrique (CCW).
 * < 0 => Sens horaire (CW).
 */
function signedArea(pts: readonly Vec2[]): number {
  const n = pts.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    if (p1 && p2) {
      sum += p1.x * p2.y - p2.x * p1.y;
    }
  }
  return sum / 2;
}

/**
 * Normalise l'enroulement d'un contour polygonal pour garantir le sens trigonométrique (CCW).
 */
function ensureCCW(pts: readonly Vec2[]): readonly Vec2[] {
  if (signedArea(pts) < 0) {
    return [...pts].reverse();
  }
  return pts;
}

/**
 * Outil interactif de modélisation de toitures (RoofTool).
 * Raccourci clavier : 'R'
 *
 * Machine à états :
 * - idle : aucun tracé en cours.
 * - drawing-footprint : accumulation des sommets d'empreinte polygonale.
 * - picking-ridge : (pour toitures 2 pans) clic de l'axe de faîtage (start puis end).
 */
export class RoofTool implements Tool {
  public readonly kind = 'roof' as const;
  private state: RoofToolState = { kind: 'idle' };
  private roofTypeId: string | null = null;

  public setRoofTypeId(id: string): void {
    this.roofTypeId = id;
  }

  public getRoofTypeId(): string | null {
    return this.roofTypeId;
  }

  public getState(): RoofToolState {
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

    // 2. Touche Enter : Fermeture anticipée de l'empreinte si >= 3 sommets
    if (event.type === 'keydown' && event.key === 'Enter') {
      if (this.state.kind === 'drawing-footprint' && this.state.points.length >= 3) {
        return this.finishFootprint(this.state.points, ctx);
      }
    }

    // Phase 1 : IDLE
    if (this.state.kind === 'idle') {
      if (event.type === 'pointerdown' && event.button === 0) {
        const rawWorld = ctx.transform.screenToWorld(event.screen);
        const snapped = this.snapPoint(rawWorld, event.shift, ctx);

        this.state = {
          kind: 'drawing-footprint',
          points: [snapped],
          currentWorld: snapped,
        };

        return {
          kind: 'preview',
          preview: {
            kind: 'roof',
            footprint: [snapped, snapped],
          },
        };
      }
      return { kind: 'noop' };
    }

    // Phase 2 : DRAWING-FOOTPRINT
    if (this.state.kind === 'drawing-footprint') {
      if (event.type === 'pointermove') {
        const rawWorld = ctx.transform.screenToWorld(event.screen);
        const lastPt = this.state.points[this.state.points.length - 1];
        const snapped = this.snapPoint(rawWorld, event.shift, ctx, lastPt);

        this.state = {
          ...this.state,
          currentWorld: snapped,
        };

        return {
          kind: 'preview',
          preview: {
            kind: 'roof',
            footprint: [...this.state.points, snapped],
          },
        };
      }

      if (event.type === 'pointerdown' && event.button === 0) {
        const rawWorld = ctx.transform.screenToWorld(event.screen);
        const lastPt = this.state.points[this.state.points.length - 1];
        const snapped = this.snapPoint(rawWorld, event.shift, ctx, lastPt);

        // Détection de fermeture par clic sur le premier point
        const firstPt = this.state.points[0];
        if (firstPt && this.state.points.length >= 3) {
          const sFirst = ctx.transform.worldToScreen(firstPt);
          const distScreen = Math.hypot(event.screen.x - sFirst.x, event.screen.y - sFirst.y);
          if (distScreen <= 14) {
            return this.finishFootprint(this.state.points, ctx);
          }
        }

        if (lastPt && Math.hypot(snapped.x - lastPt.x, snapped.y - lastPt.y) < 1e-3) {
          return {
            kind: 'preview',
            preview: {
              kind: 'roof',
              footprint: [...this.state.points, snapped],
            },
          };
        }

        const nextPoints = [...this.state.points, snapped];
        this.state = {
          kind: 'drawing-footprint',
          points: nextPoints,
          currentWorld: snapped,
        };

        return {
          kind: 'preview',
          preview: {
            kind: 'roof',
            footprint: [...nextPoints, snapped],
          },
        };
      }
    }

    // Phase 3 : PICKING-RIDGE (pour toitures 2 pans)
    if (this.state.kind === 'picking-ridge') {
      if (event.type === 'pointermove') {
        const rawWorld = ctx.transform.screenToWorld(event.screen);
        const snapped = this.snapPoint(rawWorld, event.shift, ctx, this.state.ridgeStart);

        this.state = {
          ...this.state,
          currentWorld: snapped,
        };

        const ridgeAxis = this.state.ridgeStart
          ? { start: this.state.ridgeStart, end: snapped }
          : undefined;

        return {
          kind: 'preview',
          preview: {
            kind: 'roof',
            footprint: this.state.footprint,
            ridgeAxis,
          },
        };
      }

      if (event.type === 'pointerdown' && event.button === 0) {
        const rawWorld = ctx.transform.screenToWorld(event.screen);
        const snapped = this.snapPoint(rawWorld, event.shift, ctx, this.state.ridgeStart);

        if (!this.state.ridgeStart) {
          this.state = {
            ...this.state,
            ridgeStart: snapped,
            currentWorld: snapped,
          };
          return {
            kind: 'preview',
            preview: {
              kind: 'roof',
              footprint: this.state.footprint,
              ridgeAxis: { start: snapped, end: snapped },
            },
          };
        } else {
          const ridgeEnd = snapped;
          const ridgeLen = Math.hypot(
            ridgeEnd.x - this.state.ridgeStart.x,
            ridgeEnd.y - this.state.ridgeStart.y,
          );

          if (ridgeLen >= 10) {
            const roofId = generateId();
            const docState = ctx.doc.getState();
            const roofTypes = (docState as { roofTypes?: Record<string, RoofType> }).roofTypes ?? {};
            const effectiveRoofTypeId =
              this.roofTypeId ?? Object.keys(roofTypes)[0] ?? 'default-gable-roof-type';
            const levelId = ctx.activeLevelId || Object.keys(docState.levels)[0] || 'lvl_0';
            const roof: Roof = {
              id: roofId,
              category: 'roof',
              roofTypeId: effectiveRoofTypeId,
              levelId,
              footprint: this.state.footprint,
              ridgeAxis: {
                start: this.state.ridgeStart,
                end: ridgeEnd,
              },
            };

            this.reset();
            return {
              kind: 'command',
              command: new Commands.AddRoofCommand(roof),
            };
          }
        }
      }
    }

    return { kind: 'noop' };
  }

  private finishFootprint(points: readonly Vec2[], ctx: ToolContext): ToolOutput {
    const footprint = ensureCCW(points);
    const docState = ctx.doc.getState();
    const roofTypes = (docState as { roofTypes?: Record<string, RoofType> }).roofTypes ?? {};
    const effectiveRoofTypeId =
      this.roofTypeId ?? Object.keys(roofTypes)[0] ?? 'default-gable-roof-type';
    const activeRoofType = roofTypes[effectiveRoofTypeId];
    const isGable = activeRoofType ? activeRoofType.family === 'gable' : true;

    if (isGable) {
      const pt0 = footprint[0] ?? { x: 0, y: 0 };
      this.state = {
        kind: 'picking-ridge',
        footprint,
        currentWorld: pt0,
      };

      return {
        kind: 'preview',
        preview: {
          kind: 'roof',
          footprint,
        },
      };
    } else {
      const roofId = generateId();
      const levelId = ctx.activeLevelId || Object.keys(docState.levels)[0] || 'lvl_0';
      const roof: Roof = {
        id: roofId,
        category: 'roof',
        roofTypeId: effectiveRoofTypeId,
        levelId,
        footprint,
      };

      this.reset();
      return {
        kind: 'command',
        command: new Commands.AddRoofCommand(roof),
      };
    }
  }

  private snapPoint(rawWorld: Vec2, shift: boolean, ctx: ToolContext, anchor?: Vec2): Vec2 {
    const candidates = collectSnapCandidates(ctx);
    const snapToleranceWorld = 12 / ctx.transform.scale;
    let pt = snapHelper(rawWorld, candidates, snapToleranceWorld).point;
    if (shift && anchor) {
      pt = snapAngle45(anchor, pt);
    }
    return pt;
  }
}
