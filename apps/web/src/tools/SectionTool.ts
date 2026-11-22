import { Commands, generateId, type SectionCut } from '@tabax/core';
import { type Vec2 } from '@tabax/view-2d';
import { snapAngle45, snapPoint, collectSnapCandidates } from './snap.js';
import {
  type Tool,
  type ToolEvent,
  type ToolOutput,
  type ToolContext,
  type SectionToolState,
} from './types.js';

/**
 * Seuil ergonomique UX de longueur minimale pour le tracé d'une coupe (200 mm).
 */
export const MIN_SECTION_DRAG_LENGTH = 200;

/**
 * Profondeur d'observation par défaut pour une coupe (5000 mm).
 */
export const DEFAULT_SECTION_DEPTH = 5000;

/**
 * Génère la prochaine lettre de repère (A, B, C...) et le nom de coupe normalisé.
 */
function generateNextSectionLabelAndName(existingCuts?: Record<string, SectionCut>): {
  label: string;
  name: string;
} {
  const cuts = existingCuts ? Object.values(existingCuts) : [];
  const existingLabels = new Set(cuts.map((c) => c.label.toUpperCase()));

  let label = 'A';
  for (let i = 0; i < 26; i++) {
    const candidate = String.fromCharCode(65 + i);
    if (!existingLabels.has(candidate)) {
      label = candidate;
      break;
    }
  }

  return {
    label,
    name: `Coupe ${label}-${label}'`,
  };
}

/**
 * Outil interactif de modélisation de coupes 2D et élévations (SectionTool).
 * Raccourci clavier : 'X' (ADR-063)
 *
 * Machine à états pure :
 * - idle : aucun tracé en cours.
 * - drawing : point d'origine fixé, élastique orienté avec flèche et pastilles.
 *
 * Fonctionnalités :
 * - Supporte le mode clic-glisser (pointerdown -> pointerup) et le mode deux clics (clic -> déplacement -> clic).
 * - Aimantation aux sommets de murs et d'underlay (12 px / scale).
 * - Aimantation angulaire orthogonale / 45° sur appui de Shift.
 * - Inversion de la direction de vue (1 vs -1) par appui sur la barre d'espace (Space).
 * - Annulation propre par Escape.
 * - Validation finale émettant AddSectionCutCommand.
 * - Zéro import direct de @tabax/geometry (ADR-022, ADR-024).
 */
export class SectionTool implements Tool {
  public readonly kind = 'section' as const;
  private state: SectionToolState = { kind: 'idle' };
  private viewDirection: 1 | -1 = 1;
  private depth: number = DEFAULT_SECTION_DEPTH;

  public getState(): SectionToolState {
    return this.state;
  }

  public reset(): void {
    this.state = { kind: 'idle' };
  }

  public setViewDirection(dir: 1 | -1): void {
    this.viewDirection = dir;
  }

  public getViewDirection(): 1 | -1 {
    return this.viewDirection;
  }

  public setDepth(depth: number): void {
    this.depth = Math.max(100, depth);
  }

  public getDepth(): number {
    return this.depth;
  }

  public handle(event: ToolEvent, ctx: ToolContext): ToolOutput {
    // 1. Touche Escape : Annulation du tracé
    if (event.type === 'keydown' && event.key === 'Escape') {
      this.reset();
      return { kind: 'preview', preview: null };
    }

    // 2. Touche Espace : Inversion de la direction de vue
    if (event.type === 'keydown' && (event.key === ' ' || event.key === 'Spacebar')) {
      this.viewDirection = this.viewDirection === 1 ? -1 : 1;
      if (this.state.kind === 'drawing') {
        return {
          kind: 'preview',
          preview: {
            kind: 'section',
            start: this.state.startWorld,
            end: this.state.currentWorld,
            viewDirection: this.viewDirection,
            depth: this.depth,
          },
        };
      }
      return { kind: 'noop' };
    }

    // 3. Touche Enter : Validation du tracé si en cours
    if (event.type === 'keydown' && event.key === 'Enter') {
      if (this.state.kind === 'drawing') {
        const dx = this.state.currentWorld.x - this.state.startWorld.x;
        const dy = this.state.currentWorld.y - this.state.startWorld.y;
        const len = Math.hypot(dx, dy);
        if (len >= MIN_SECTION_DRAG_LENGTH) {
          return this.createSectionCut(this.state.startWorld, this.state.currentWorld, ctx);
        }
      }
      return { kind: 'noop' };
    }

    // 4. PointerDown : Premier clic (départ) ou deuxième clic (arrivée)
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
          viewDirection: this.viewDirection,
          depth: this.depth,
        };
        return {
          kind: 'preview',
          preview: {
            kind: 'section',
            start: snappedWorld,
            end: snappedWorld,
            viewDirection: this.viewDirection,
            depth: this.depth,
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

        if (len >= MIN_SECTION_DRAG_LENGTH) {
          return this.createSectionCut(this.state.startWorld, currentWorld, ctx);
        }
        return { kind: 'noop' };
      }
    }

    // 5. PointerMove : Mise à jour de l'élastique de prévisualisation
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
        viewDirection: this.viewDirection,
        depth: this.depth,
      };

      return {
        kind: 'preview',
        preview: {
          kind: 'section',
          start: this.state.startWorld,
          end: currentWorld,
          viewDirection: this.viewDirection,
          depth: this.depth,
        },
      };
    }

    // 6. PointerUp : Validation si glisser-déposer sur une distance suffisante
    if (event.type === 'pointerup' && event.button === 0) {
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

      const dx = currentWorld.x - this.state.startWorld.x;
      const dy = currentWorld.y - this.state.startWorld.y;
      const len = Math.hypot(dx, dy);

      // Si l'utilisateur a glissé au-delà de la longueur minimale requise, on valide directement
      if (len >= MIN_SECTION_DRAG_LENGTH) {
        return this.createSectionCut(this.state.startWorld, currentWorld, ctx);
      }

      // Sinon, on maintient l'état 'drawing' pour permettre le second clic
      return { kind: 'noop' };
    }

    return { kind: 'noop' };
  }

  private createSectionCut(
    start: Vec2,
    end: Vec2,
    ctx: ToolContext,
  ): ToolOutput {
    const state = ctx.doc.getState();
    const { label, name } = generateNextSectionLabelAndName(state.sectionCuts);

    const command = new Commands.AddSectionCutCommand({
      id: generateId(),
      category: 'sectionCut',
      name,
      label,
      kind: 'section',
      start: { x: start.x, y: start.y },
      end: { x: end.x, y: end.y },
      viewDirection: this.viewDirection,
      depth: this.depth,
    });

    this.reset();
    return { kind: 'command', command };
  }
}
