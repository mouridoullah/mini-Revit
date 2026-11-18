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

      // Détection optionnelle d'un mur hôte sous le curseur (avec tolérance magnétique de capture)
      const hitWallId = findWallAtScreen(event.screen, ctx.transform, ctx.doc, {
        activeLevelId: ctx.activeLevelId,
        hitTolerancePx: 25,
      });

      let snappedPos: Vec2 = {
        x: snapToStep(rawWorld.x, 100),
        y: snapToStep(rawWorld.y, 100),
      };
      let effectiveRotation = this.rotation;

      // Magnétisme mural et orientation automatique intelligente (Phase 8.4)
      if (hitWallId && docState.walls[hitWallId]) {
        const wall = docState.walls[hitWallId];
        const wallType = docState.wallTypes[wall.typeId];
        const wallThickness = wallType?.thickness ?? 200;
        const halfT = wallThickness / 2;
        const halfD = depth / 2;

        const dx = wall.end.x - wall.start.x;
        const dy = wall.end.y - wall.start.y;
        const wallLen = Math.hypot(dx, dy);

        if (wallLen > 1e-4) {
          const ux = dx / wallLen;
          const uy = dy / wallLen;
          const nx = -uy;
          const ny = ux;

          const wx = rawWorld.x - wall.start.x;
          const wy = rawWorld.y - wall.start.y;
          const s = Math.max(0, Math.min(wallLen, wx * ux + wy * uy));
          const perpDist = wx * nx + wy * ny;
          const side = perpDist >= 0 ? 1 : -1;

          const isGlazing =
            compType?.family === 'glazing' ||
            compType?.ifcEntity === 'IfcDoor' ||
            compType?.ifcEntity === 'IfcWindow' ||
            compType?.subType === 'sliding_door' ||
            compType?.subType === 'french_window';

          if (isGlazing) {
            // Menuiserie encastrée dans l'axe longitudinal du mur
            snappedPos = {
              x: wall.start.x + s * ux,
              y: wall.start.y + s * uy,
            };
            effectiveRotation = Math.atan2(dy, dx);
          } else {
            // Mobilier adossé : la face arrière (+Y local) est plaquée contre le parement du mur
            const offsetDist = side * (halfT + halfD);
            snappedPos = {
              x: wall.start.x + s * ux + nx * offsetDist,
              y: wall.start.y + s * uy + ny * offsetDist,
            };
            // Orientation automatique où la face arrière (+Y) est dirigée vers le mur (-side * n)
            const rawRot = Math.atan2(side * nx, -side * ny);
            effectiveRotation = ((rawRot % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
          }
        }
      }

      this.state = {
        kind: 'hovering',
        worldPos: snappedPos,
        rotation: effectiveRotation,
        hostWallId: hitWallId ?? undefined,
      };

      const points = computeRotatedBox(
        snappedPos.x,
        snappedPos.y,
        width,
        depth,
        effectiveRotation,
      );
      const preview: PreviewShape = { kind: 'polygon', points };
      return { kind: 'preview', preview };
    }

    // 3. Clic d'implantation (Ajout du composant)
    if (event.type === 'pointerdown' && event.button === 0) {
      const placePos =
        this.state.kind === 'hovering'
          ? this.state.worldPos
          : {
              x: snapToStep(ctx.transform.screenToWorld(event.screen).x, 100),
              y: snapToStep(ctx.transform.screenToWorld(event.screen).y, 100),
            };
      const placeRotation = this.state.kind === 'hovering' ? this.state.rotation : this.rotation;
      const hitWallId =
        this.state.kind === 'hovering'
          ? this.state.hostWallId
          : findWallAtScreen(event.screen, ctx.transform, ctx.doc, {
              activeLevelId: ctx.activeLevelId,
              hitTolerancePx: 25,
            });

      const compId = generateId();
      const cmd = new Commands.AddComponentCommand({
        id: compId,
        category: 'component',
        typeId: activeTypeId,
        levelId: ctx.activeLevelId,
        placement: {
          x: placePos.x,
          y: placePos.y,
          rotation: placeRotation,
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
