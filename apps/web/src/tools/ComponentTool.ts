import { Commands, generateId } from '@mini-bim/core';
import { findWallAtScreen, type Vec2, type PreviewShape } from '@mini-bim/view-2d';
import { snapToStep } from './snap.js';
import {
  type Tool,
  type ToolEvent,
  type ToolOutput,
  type ToolContext,
  type ComponentToolState,
} from './types.js';

/**
 * Calcule les 4 sommets d'un rectangle orienté centré en (cx, cy) avec rotation theta.
 */
function computeRotatedBox(
  cx: number,
  cy: number,
  width: number,
  depth: number,
  rotation: number,
): readonly Vec2[] {
  const hw = width / 2;
  const hd = depth / 2;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  // 4 coins dans le repère local
  const localCorners: readonly [number, number][] = [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];

  return localCorners.map(([lx, ly]) => ({
    x: cx + lx * cos - ly * sin,
    y: cy + lx * sin + ly * cos,
  }));
}

/**
 * Outil interactif d'insertion et d'implantation de composants architecturaux et mobilier (Phase 8).
 *
 * Machine à états :
 * - idle : en attente d'interaction.
 * - hovering : curseur actif, prévisualisation orientée de l'emprise 2D (avec rotation via Barre d'Espace).
 * - placed : composant instancié et commande AddComponentCommand émise.
 */
export class ComponentTool implements Tool {
  public readonly kind = 'component' as const;
  private state: ComponentToolState = { kind: 'idle' };
  private rotation = 0; // en radians
  private flipped = false;

  public getState(): ComponentToolState {
    return this.state;
  }

  public getRotation(): number {
    return this.rotation;
  }

  public setRotation(rad: number): void {
    this.rotation = rad;
  }

  public rotate90(): void {
    this.rotation = (this.rotation + Math.PI / 2) % (2 * Math.PI);
  }

  public reset(): void {
    this.state = { kind: 'idle' };
  }

  public handle(event: ToolEvent, ctx: ToolContext): ToolOutput {
    const docState = ctx.doc.getState();
    const componentTypes = docState.componentTypes ?? {};
    const activeTypeId =
      ctx.activeComponentTypeId && componentTypes[ctx.activeComponentTypeId]
        ? ctx.activeComponentTypeId
        : Object.keys(componentTypes)[0] ?? 'ct_toilet_floor';

    const compType = componentTypes[activeTypeId];
    const width = compType?.width ?? 600;
    const depth = compType?.depth ?? 600;

    // 1. Touches Clavier (Espace = Rotation 90°, Escape = Reset)
    if (event.type === 'keydown') {
      if (event.key === ' ' || event.key === 'Spacebar') {
        this.rotate90();
        if (this.state.kind === 'hovering') {
          const points = computeRotatedBox(
            this.state.worldPos.x,
            this.state.worldPos.y,
            width,
            depth,
            this.rotation,
          );
          const preview: PreviewShape = { kind: 'polygon', points };
          this.state = {
            kind: 'hovering',
            worldPos: this.state.worldPos,
            rotation: this.rotation,
            hostWallId: this.state.hostWallId,
          };
          return { kind: 'preview', preview };
        }
        return { kind: 'noop' };
      }

      if (event.key === 'Escape') {
        this.reset();
        return { kind: 'preview', preview: null };
      }

      return { kind: 'noop' };
    }

    // 2. Déplacement du pointeur (Prévisualisation)
    if (event.type === 'pointermove') {
      const rawWorld = ctx.transform.screenToWorld(event.screen);
      const snappedPos: Vec2 = {
        x: snapToStep(rawWorld.x, 100),
        y: snapToStep(rawWorld.y, 100),
      };

      // Détection optionnelle d'un mur hôte sous le curseur
      const hitWallId = findWallAtScreen(event.screen, ctx.transform, ctx.doc, {
        activeLevelId: ctx.activeLevelId,
      });

      this.state = {
        kind: 'hovering',
        worldPos: snappedPos,
        rotation: this.rotation,
        hostWallId: hitWallId ?? undefined,
      };

      const points = computeRotatedBox(
        snappedPos.x,
        snappedPos.y,
        width,
        depth,
        this.rotation,
      );
      const preview: PreviewShape = { kind: 'polygon', points };
      return { kind: 'preview', preview };
    }

    // 3. Clic d'implantation (Ajout du composant)
    if (event.type === 'pointerdown' && event.button === 0) {
      const rawWorld = ctx.transform.screenToWorld(event.screen);
      const snappedPos: Vec2 = {
        x: snapToStep(rawWorld.x, 100),
        y: snapToStep(rawWorld.y, 100),
      };

      const hitWallId = findWallAtScreen(event.screen, ctx.transform, ctx.doc, {
        activeLevelId: ctx.activeLevelId,
      });

      const compId = generateId();
      const cmd = new Commands.AddComponentCommand({
        id: compId,
        category: 'component',
        typeId: activeTypeId,
        levelId: ctx.activeLevelId,
        placement: {
          x: snappedPos.x,
          y: snappedPos.y,
          rotation: this.rotation,
          flipped: this.flipped,
          elevationOffset: compType?.defaultElevationOffset ?? 0,
          hostWallId: hitWallId ?? undefined,
        },
      });

      this.state = { kind: 'placed', componentId: compId };
      return { kind: 'command', command: cmd };
    }

    return { kind: 'noop' };
  }
}
