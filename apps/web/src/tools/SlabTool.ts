import { Commands, generateId } from '@mini-bim/core';
import { type Vec2 } from '@mini-bim/view-2d';
import { snapAngle45, snapToVertices } from './snap.js';
import {
  type Tool,
  type ToolEvent,
  type ToolOutput,
  type ToolContext,
  type SlabToolState,
} from './types.js';

/**
 * Calcule l'aire algébrique signée d'un polygone 2D (formule de Green / lacets de Gauss).
 * > 0 => Sens trigonométrique (CCW).
 * < 0 => Sens horaire (CW).
 */
function signedArea(pts: readonly Vec2[]): number {
  const n = pts.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const p1 = pts[i]!;
    const p2 = pts[(i + 1) % n]!;
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return sum / 2;
}

/**
 * Normalise l'enroulement d'un contour polygonal pour garantir le sens trigonométrique (CCW)
 * requis par le modèle métier BimDocument / ADR-042 / ADR-045.
 */
function ensureCCW(pts: readonly Vec2[]): readonly Vec2[] {
  if (signedArea(pts) < 0) {
    return [...pts].reverse();
  }
  return pts;
}

/**
 * Outil interactif de modélisation de dalles polygonales (SlabTool).
 * Raccourci clavier : 'L'
 *
 * Machine à états :
 * - idle : aucun contour en cours.
 * - drawing : sommets accumulés, segment élastique reliant le dernier point au curseur.
 *
 * Fonctionnalités ergonomiques :
 * - Aimantation aux sommets de murs et dalles existants (tolérance écran 12px).
 * - Aimantation angulaire orthogonale / 45° sur appui de la touche Shift.
 * - Prévisualisation polygonale en temps réel (élastique semi-transparent).
 * - Fermeture du polygone par clic sur le premier point, double-clic ou touche Enter.
 * - Annulation du tracé par touche Escape.
 */
export class SlabTool implements Tool {
  public readonly kind = 'slab' as const;
  private state: SlabToolState = { kind: 'idle' };

  public getState(): SlabToolState {
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

    // 2. Touche Enter ou Double-clic : Fermeture du polygone
    if (
      (event.type === 'keydown' && event.key === 'Enter') ||
      event.type === 'dblclick'
    ) {
      if (this.state.kind === 'drawing' && this.state.points.length >= 3) {
        return this.finishPolygon(this.state.points, ctx);
      }
      return { kind: 'noop' };
    }

    // 3. pointerdown : Ajout d'un point ou fermeture
    if (event.type === 'pointerdown') {
      if (event.button !== 0) {
        return { kind: 'noop' };
      }

      const rawWorld = ctx.transform.screenToWorld(event.screen);
      const snappedWorld = this.snapPoint(rawWorld, event.shift, ctx);

      if (this.state.kind === 'idle') {
        // Premier point du polygone
        this.state = {
          kind: 'drawing',
          points: [snappedWorld],
          currentWorld: snappedWorld,
        };
        return {
          kind: 'preview',
          preview: { kind: 'polygon', points: [snappedWorld, snappedWorld] },
        };
      }

      // En cours de tracé : vérifier si clic sur le premier point (fermeture)
      const firstPoint = this.state.points[0]!;
      const snapToleranceWorld = 12 / ctx.transform.scale;
      const distToFirst = Math.hypot(
        snappedWorld.x - firstPoint.x,
        snappedWorld.y - firstPoint.y,
      );

      if (this.state.points.length >= 3 && distToFirst <= snapToleranceWorld) {
        return this.finishPolygon(this.state.points, ctx);
      }

      // Sinon, ajouter le nouveau point s'il n'est pas confondu avec le précédent
      const lastPoint = this.state.points[this.state.points.length - 1]!;
      const distToLast = Math.hypot(
        snappedWorld.x - lastPoint.x,
        snappedWorld.y - lastPoint.y,
      );
      if (distToLast > 1) {
        const nextPoints = [...this.state.points, snappedWorld];
        this.state = {
          kind: 'drawing',
          points: nextPoints,
          currentWorld: snappedWorld,
        };
        return {
          kind: 'preview',
          preview: { kind: 'polygon', points: [...nextPoints, snappedWorld] },
        };
      }

      return { kind: 'noop' };
    }

    // 4. pointermove : Mise à jour de l'élastique
    if (event.type === 'pointermove') {
      if (this.state.kind !== 'drawing') {
        return { kind: 'noop' };
      }

      const rawWorld = ctx.transform.screenToWorld(event.screen);
      const snappedWorld = this.snapPoint(rawWorld, event.shift, ctx);

      this.state = {
        kind: 'drawing',
        points: this.state.points,
        currentWorld: snappedWorld,
      };

      return {
        kind: 'preview',
        preview: {
          kind: 'polygon',
          points: [...this.state.points, snappedWorld],
        },
      };
    }

    return { kind: 'noop' };
  }

  /**
   * Finalise le contour et émet la commande AddSlabCommand.
   */
  private finishPolygon(
    points: readonly Vec2[],
    ctx: ToolContext,
  ): ToolOutput {
    const normalizedBoundary = ensureCCW(points);
    const docState = ctx.doc.getState();
    const slabTypeId =
      ctx.activeSlabTypeId ??
      Object.keys(docState.slabTypes ?? {})[0] ??
      'slab-type-default';

    const command = new Commands.AddSlabCommand({
      id: generateId(),
      category: 'slab',
      levelId: ctx.activeLevelId,
      slabTypeId,
      boundary: normalizedBoundary,
    });

    this.reset();
    return { kind: 'command', command };
  }

  /**
   * Applique les règles d'aimantation :
   * 1. Snapping géométrique aux sommets de murs (tolérance 12px écran).
   * 2. Snapping angulaire 45° si Shift est enfoncé par rapport au point précédent.
   */
  private snapPoint(
    rawWorld: Vec2,
    shift: boolean,
    ctx: ToolContext,
  ): Vec2 {
    const snapToleranceWorld = 12 / ctx.transform.scale;

    // 1. Collecter tous les sommets de murs existants sur le niveau actif
    const wallVertices: Vec2[] = [];
    const docState = ctx.doc.getState();
    for (const wall of Object.values(docState.walls)) {
      if (wall.levelId === ctx.activeLevelId) {
        wallVertices.push(wall.start, wall.end);
      }
    }

    // 2. Aimantation aux sommets de murs
    let pt = snapToVertices(rawWorld, wallVertices, snapToleranceWorld);

    // 3. Aimantation angulaire si Shift est activé et qu'on a déjà un point d'ancrage
    if (shift && this.state.kind === 'drawing' && this.state.points.length > 0) {
      const anchor = this.state.points[this.state.points.length - 1]!;
      pt = snapAngle45(anchor, pt);
    }

    return pt;
  }
}
